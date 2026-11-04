"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, Department, Category, AskCitation } from "@/lib/api";

const PRIORITIES = [
    { value: "LOW", label: "منخفضة" },
    { value: "MEDIUM", label: "متوسطة" },
    { value: "HIGH", label: "عالية" },
    { value: "URGENT", label: "عاجلة" },
];

export default function NewComplaintPage() {
    const router = useRouter();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [form, setForm] = useState({
        subject: "",
        description: "",
        department_id: 0,
        category_id: 0,
        priority: "MEDIUM",
    });
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // AI Ask State
    const [aiQuestion, setAiQuestion] = useState("");
    const [aiAnswer, setAiAnswer] = useState<{ text: string; citations: AskCitation[]; refused: boolean } | null>(null);
    const [asking, setAsking] = useState(false);
    const [askError, setAskError] = useState("");

    // AI Suggest State
    const [suggesting, setSuggesting] = useState(false);
    const [suggestedMeta, setSuggestedMeta] = useState<{ department_id: number; category_id: number; priority: string; summary: string } | null>(null);

    useEffect(() => {
        api.departments().then(r => setDepartments(r.items || [])).catch(() => { });
        api.categories().then(r => setCategories(r.items || [])).catch(() => { });
    }, []);

    const filteredCats = categories.filter(c =>
        form.department_id === 0 || c.department_id === form.department_id
    );

    // Parse robust API errors
    const parseError = (err: any, fallback: string) => {
        if (err instanceof Error) return err.message;
        if (typeof err === "object" && err !== null) return err.detail || JSON.stringify(err);
        if (typeof err === "string") return err;
        return fallback;
    };

    async function handleAskAI(e: React.FormEvent) {
        e.preventDefault();
        if (!aiQuestion.trim()) return;
        setAsking(true);
        setAskError("");
        setAiAnswer(null);
        try {
            const res: any = await api.aiAsk(aiQuestion);
            if (res.error_code) {
                if (res.error_code === "429") {
                    setAskError("تم تجاوز حد الاستخدام أو الرصيد. تحقق من إعدادات الفوترة.");
                } else if (res.error_code === "401") {
                    setAskError("مفتاح خدمة الذكاء الاصطناعي غير صحيح.");
                } else {
                    setAskError("تعذر الاتصال بخدمة الذكاء الاصطناعي.");
                }
                setAiAnswer({ text: res.answer, citations: [], refused: true });
                return;
            }
            setAiAnswer({ text: res.answer, citations: res.citations || [], refused: res.refused });
        } catch (err: any) {
            const msg = err?.message || "";
            if (msg === "Unauthorized" || msg.includes("401") || msg.includes("403")) {
                // api.ts already handles logout/redirect, but we suppress local errors
                return;
            }
            if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
                setAskError("تعذر الاتصال بالخادم. تأكد أن خدمة الباكند تعمل.");
            } else if (msg.includes("429")) {
                setAskError("تم تجاوز حد الاستخدام أو الرصيد. تحقق من إعدادات الفوترة.");
            } else {
                setAskError(parseError(err, "تعذر الاتصال بالخادم. تأكد أن خدمة الباكند تعمل."));
            }
        } finally {
            setAsking(false);
        }
    }

    async function handleAISuggest() {
        if (!form.description) {
            setError("اكتب تفاصيل الشكوى أولًا حتى يستطيع المساعد تحليلها.");
            return;
        }
        setSuggesting(true);
        setError("");
        setSuggestedMeta(null);
        try {
            const res = await api.aiSuggest(form.description);
            if ((res as any).ai_disabled) {
                setError("المساعد الذكي غير مفعّل حاليًا.");
                return;
            }
            setSuggestedMeta(res);
        } catch (err: any) {
            setError(parseError(err, "تعذر اقتراح التصنيف عبر الذكاء الاصطناعي"));
        } finally {
            setSuggesting(false);
        }
    }

    function applySuggestion() {
        if (!suggestedMeta) return;
        setForm(prev => ({
            ...prev,
            department_id: suggestedMeta.department_id || prev.department_id,
            category_id: suggestedMeta.category_id || prev.category_id,
            priority: suggestedMeta.priority || prev.priority,
            subject: prev.subject || suggestedMeta.summary || prev.subject
        }));
        setSuggestedMeta(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        if (!form.department_id || !form.category_id) {
            setError("اختر القسم والتصنيف");
            return;
        }
        if (file && file.size > 10 * 1024 * 1024) {
            setError("حجم الملف يجب ألا يتجاوز 10 ميجابايت");
            return;
        }
        setLoading(true);
        try {
            const complaint = await api.createComplaint(form);
            if (file) {
                await api.uploadAttachment(complaint.id, file);
            }
            router.push("/app/complaints");
        } catch (err: any) {
            setError(parseError(err, "حدث خطأ غير متوقع أثناء إرسال الشكوى"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">شكوى جديدة</h1>
                <p className="text-gray-500 text-sm mt-1">أرسل طلبك للفريق المناسب، أو اسأل المساعد الذكي أولًا لتوفير الوقت.</p>
            </div>

            <div className="flex flex-col lg:flex-row-reverse gap-8 items-start">

                {/* Complaint form */}
                <form onSubmit={handleSubmit} className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 w-full">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">عنوان الشكوى</label>
                        <input
                            type="text"
                            required
                            value={form.subject}
                            onChange={e => setForm({ ...form, subject: e.target.value })}
                            placeholder="وصف مختصر للمشكلة"
                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">التفاصيل</label>
                        <textarea
                            required
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={5}
                            placeholder="اشرح المشكلة بالتفصيل حتى يتم اختيار التصنيف المناسب..."
                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">القسم</label>
                            <select
                                required
                                value={form.department_id}
                                onChange={e => setForm({ ...form, department_id: Number(e.target.value), category_id: 0 })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value={0}>اختر القسم</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">التصنيف</label>
                            <select
                                required
                                value={form.category_id}
                                onChange={e => setForm({ ...form, category_id: Number(e.target.value) })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value={0}>اختر التصنيف</option>
                                {filteredCats.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الأولوية</label>
                        <div className="flex flex-wrap md:flex-nowrap gap-2">
                            {PRIORITIES.map(p => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setForm({ ...form, priority: p.value })}
                                    className={`flex-1 min-w-[100px] py-2 rounded-xl text-xs font-medium border transition-all ${form.priority === p.value
                                        ? "bg-brand-600 text-white border-brand-600"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-brand-400"
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">مرفق اختياري</label>
                        <input
                            type="file"
                            onChange={e => setFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-gray-500 file:ml-3 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 transition-colors"
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl text-sm transition-colors disabled:opacity-50"
                        >
                            {loading ? "جار الإرسال..." : "إرسال الشكوى"}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-6 py-3 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>

                <div className="w-full lg:w-96 flex shrink-0 flex-col gap-6">

                    <div className="bg-gradient-to-b from-brand-50 to-white border border-brand-100 rounded-2xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xl">🤖</span>
                            <h2 className="font-semibold text-brand-900">اسأل المساعد الذكي</h2>
                        </div>
                        <p className="text-xs text-brand-700 mb-4 leading-relaxed">
                            راجع السياسات والإجراءات قبل إرسال الشكوى. قد تجد إجابة فورية هنا.
                        </p>

                        <form onSubmit={handleAskAI} className="space-y-3">
                            <input
                                type="text"
                                placeholder="مثال: كيف أقدم إجازة مرضية؟"
                                className="w-full text-sm py-2 px-3 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                value={aiQuestion}
                                onChange={e => setAiQuestion(e.target.value)}
                                disabled={asking}
                            />
                            <button
                                type="submit"
                                disabled={asking || !aiQuestion.trim()}
                                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                                {asking ? "جار البحث..." : "بحث"}
                            </button>
                        </form>

                        {askError && (
                            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs leading-relaxed border border-red-100">
                                {askError}
                            </div>
                        )}

                        {aiAnswer && (
                            <div className="mt-5 p-4 bg-white border border-brand-100 rounded-xl text-sm shadow-sm">
                                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{aiAnswer.text}</p>

                                {aiAnswer.refused && (
                                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                                        <p className="text-amber-800 text-xs font-medium">أكمل نموذج الشكوى ثم أرسله.</p>
                                        <button type="button" onClick={() => document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' })} className="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white py-1.5 px-3 rounded-lg transition-colors">فتح النموذج</button>
                                    </div>
                                )}

                                {aiAnswer.citations && aiAnswer.citations.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-gray-100">
                                        <p className="text-xs font-semibold text-gray-500 mb-2">المراجع:</p>
                                        <ul className="space-y-2">
                                            {aiAnswer.citations.map((cit, idx) => (
                                                <li key={idx} className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                                                    <span className="font-semibold text-brand-700 block mb-1">
                                                        📄 {cit.document_title} - {cit.page ? `صفحة ${cit.page}` : `قسم ${cit.chunk_index}`}
                                                    </span>
                                                    <span className="opacity-80 leading-relaxed max-w-full">"{cit.snippet}"</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border text-center border-gray-200 rounded-2xl p-5 shadow-sm">
                        <div className="mb-4">
                            <h2 className="font-semibold text-gray-900 text-sm">تصنيف ذكي للشكوى</h2>
                            <p className="text-xs text-gray-500 mt-1">دع الذكاء الاصطناعي يحلل المشكلة ويقترح القسم والتصنيف المناسبين.</p>
                        </div>

                        <button
                            type="button"
                            onClick={handleAISuggest}
                            disabled={suggesting}
                            className="w-full bg-white border-2 border-brand-100 hover:border-brand-300 hover:bg-brand-50 text-brand-700 font-medium py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
                        >
                            {suggesting ? "جار تحليل الشكوى..." : "اقتراح التصنيف والأولوية"}
                        </button>

                        {suggestedMeta && (
                            <div className="mt-4 p-4 text-right bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                                <p className="text-xs text-blue-800"><span className="font-medium">القسم المقترح:</span> {departments.find(d => d.id === suggestedMeta.department_id)?.name || "غير محدد"}</p>
                                <p className="text-xs text-blue-800"><span className="font-medium">التصنيف المقترح:</span> {categories.find(c => c.id === suggestedMeta.category_id)?.name || "غير محدد"}</p>
                                <p className="text-xs text-blue-800"><span className="font-medium">الأولوية المقترحة:</span> {suggestedMeta.priority}</p>

                                <button
                                    type="button"
                                    onClick={applySuggestion}
                                    className="mt-3 w-full bg-blue-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-blue-700 transition"
                                >
                                    تطبيق الاقتراح
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
