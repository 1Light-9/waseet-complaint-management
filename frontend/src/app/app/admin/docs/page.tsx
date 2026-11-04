"use client";

import { useState, useEffect, useRef } from "react";
import { api, DocumentListItem } from "@/lib/api";

// ── Status badge component ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
    if (!status) return <span className="text-gray-400 text-xs">—</span>;

    const map: Record<string, { label: string; cls: string; title?: string }> = {
        indexed: { label: "مفهرس", cls: "bg-green-100 text-green-700" },
        pending: { label: "قيد المعالجة", cls: "bg-yellow-100 text-yellow-700" },
        failed: { label: "فشل", cls: "bg-red-100 text-red-700", title: "فشل رفع الملف إلى OpenAI" },
        deleted: { label: "محذوف", cls: "bg-gray-100 text-gray-500" },
    };

    const cfg = map[status] ?? { label: status, cls: "bg-blue-100 text-blue-700" };
    return (
        <span
            title={cfg.title}
            className={`px-2 py-1 rounded text-xs font-medium ${cfg.cls}`}
        >
            {cfg.label}
        </span>
    );
}

// ── KB Provider detection ──────────────────────────────────────────────────
// When any document has an openai_status, we're in OpenAI mode
function detectProvider(docs: DocumentListItem[]) {
    return docs.some(d => d.openai_status !== null) || true; // default openai
}

export default function AdminDocsPage() {
    const [docs, setDocs] = useState<DocumentListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { loadDocs(); }, []);

    async function loadDocs() {
        setLoading(true);
        try {
            const res = await api.adminDocs();
            // Only show active documents
            setDocs((res || []).filter(d => d.is_active !== false));
        } catch (err: any) {
            setError(err.message || "تعذر تحميل المستندات");
        } finally {
            setLoading(false);
        }
    }

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError("");
        setSuccess("");

        try {
            const res = await api.adminUploadDoc(file);
            const statusMsg = res.openai_status === "indexed"
                ? "وتمت فهرسته في OpenAI"
                : res.openai_status === "failed"
                    ? "فشل رفعه إلى OpenAI"
                    : "";
            setSuccess(`تم رفع المستند بنجاح: ${file.name} - ${statusMsg}`);
            await loadDocs();
        } catch (err: any) {
            setError(err.message || "تعذر رفع المستند");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    async function handleDelete(doc: DocumentListItem) {
        if (!window.confirm(`هل أنت متأكد من حذف "${doc.title}"؟\nسيتم حذفه من قاعدة المعرفة.`)) return;

        setDeletingId(doc.id);
        setError("");
        setSuccess("");

        try {
            await api.adminDeleteDoc(doc.id);
            setSuccess(`تم حذف المستند: ${doc.title}`);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
        } catch (err: any) {
            setError(err.message || "تعذر حذف المستند");
        } finally {
            setDeletingId(null);
        }
    }

    if (loading && docs.length === 0) return <div className="p-8">جار التحميل...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* ── Header ── */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">إدارة المستندات (قاعدة المعرفة)</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        ارفع المستندات وسيتم فهرستها تلقائيًا عبر OpenAI Vector Store
                    </p>
                </div>
                <div className="flex gap-4">
                    <input
                        type="file"
                        ref={fileRef}
                        onChange={handleUpload}
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                    />
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {uploading ? "جار الرفع..." : "رفع مستند"}
                    </button>
                </div>
            </div>

            {/* ── Alerts ── */}
            {error && (
                <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200 text-sm">
                    {success}
                </div>
            )}

            {/* ── Documents Table ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm text-right">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <td className="px-6 py-4">عنوان المستند</td>
                            <td className="px-6 py-4">الحالة</td>
                            <td className="px-6 py-4 text-right">تاريخ الإضافة</td>
                            <td className="px-6 py-4 text-right">الإجراء</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {docs.map(doc => (
                            <tr key={doc.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900" dir="ltr">
                                    {doc.title}
                                </td>
                                <td className="px-6 py-4">
                                    <StatusBadge status={doc.openai_status} />
                                </td>
                                <td className="px-6 py-4 text-gray-500 text-right">
                                    {new Date(doc.created_at).toLocaleString("ar-SA-u-ca-gregory")}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleDelete(doc)}
                                        disabled={deletingId === doc.id}
                                        className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50 transition-colors"
                                    >
                                        {deletingId === doc.id ? "جار الحذف..." : "حذف"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {docs.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                    لا توجد مستندات، ارفع ملفًا للبدء
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
