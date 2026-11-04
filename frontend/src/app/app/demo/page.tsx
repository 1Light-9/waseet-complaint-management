"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Category, ComplaintSummary, Department, SlaCheckStats, UserMe } from "@/lib/api";
import SlaBadge, { slaTimeLabel } from "@/components/SlaBadge";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
    NEW: "جديدة", IN_PROGRESS: "قيد المعالجة",
    WAITING_USER: "بانتظار المستخدم", RESOLVED: "تم الحل", CLOSED: "مغلقة",
};
const STATUS_DOT: Record<string, string> = {
    NEW: "bg-blue-400", IN_PROGRESS: "bg-yellow-400",
    WAITING_USER: "bg-purple-400", RESOLVED: "bg-green-400", CLOSED: "bg-gray-400",
};
const PRI_COLOR: Record<string, string> = {
    URGENT: "text-red-600 font-bold", HIGH: "text-orange-600",
    MEDIUM: "text-blue-600", LOW: "text-gray-500",
};
const PRIORITY_LABELS: Record<string, string> = {
    URGENT: "عاجلة", HIGH: "عالية", MEDIUM: "متوسطة", LOW: "منخفضة",
};

function ChannelCountdown({ label, channel, doneAt }: {
    label: string;
    channel: { status: string; remaining_seconds: number | null } | null | undefined;
    doneAt: string | null;
}) {
    if (doneAt) return <span className="text-xs text-emerald-600">✅ {label}</span>;
    if (!channel) return <span className="text-xs text-gray-400">{label}: —</span>;

    const color = channel.status === "BREACHED" ? "text-red-600"
        : channel.status === "NEAR_BREACH" ? "text-amber-600"
            : "text-emerald-600";

    const timeStr = channel.remaining_seconds !== null
        ? slaTimeLabel(channel.remaining_seconds, channel.status)
        : "—";

    return (
        <span className={`text-xs ${color}`}>
            {label}: {timeStr}
        </span>
    );
}

// A live clock that ticks every second to update remaining times
function useNow() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DemoPage() {
    const router = useRouter();
    const [me, setMe] = useState<UserMe | null>(null);
    const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
    const [slaStats, setSlaStats] = useState<SlaCheckStats | null>(null);
    const [log, setLog] = useState<{ ts: string; msg: string; ok: boolean }[]>([]);
    const [creating, setCreating] = useState(false);
    const [checking, setChecking] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkedOnce, setCheckedOnce] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);
    const now = useNow();

    function addLog(msg: string, ok = true) {
    const ts = new Date().toLocaleTimeString("ar-SA-u-ca-gregory");
        setLog(prev => [{ ts, msg, ok }, ...prev].slice(0, 20));
    }

    async function loadComplaints() {
        setLoading(true);
        try {
            const r = await api.listComplaints({ scope: "all" });
            // Sort by id desc, take latest 10
            const sorted = [...r.items].sort((a, b) => b.id - a.id).slice(0, 10);
            setComplaints(sorted);
            addLog(`تم تحميل ${sorted.length} شكوى`);
        } catch (e: unknown) {
            addLog(e instanceof Error ? e.message : "تعذر التحميل", false);
        } finally {
            setLoading(false);
        }
    }

    async function createDemoComplaint() {
        setCreating(true);
        try {
            // Cast items explicitly — api returns UserListResponse & {items: Dept[]},
            // but TypeScript resolves items as UserListItem[] in intersections without the cast.
            const deptsRes = await api.departments();
            const depts = deptsRes.items as unknown as Department[];
            const dept = depts.find(d => d.name.toLowerCase().includes("it") || d.name.includes("Information Technology"));
            if (!dept) throw new Error("لم يتم العثور على قسم تقنية المعلومات");

            const catsRes = await api.categories();
            const cats = catsRes.items as unknown as Category[];
            const cat = cats.find(c =>
                c.department_id === dept.id &&
                (c.name.toLowerCase().includes("account") || c.name.includes("Account"))
            );
            if (!cat) throw new Error("لم يتم العثور على تصنيف صلاحيات الحساب");

            const complaint = await api.createComplaint({
                subject: `تجربة SLA ${new Date().toLocaleTimeString("ar-SA-u-ca-gregory")}`,
                description: "شكوى تجريبية تلقائية لاختبار سير عمل SLA. تم إنشاؤها من صفحة العرض التجريبي.",
                department_id: Number(dept.id),
                category_id: Number(cat.id),
                priority: "URGENT",
            });
            addLog(`تم إنشاء الشكوى #${complaint.id} - تقنية المعلومات / صلاحيات الحساب / عاجلة`);
            await loadComplaints();
        } catch (e: unknown) {
            addLog(e instanceof Error ? e.message : "تعذر إنشاء الشكوى", false);
        } finally {
            setCreating(false);
        }
    }

    async function runSlaCheck() {
        setChecking(true);
        try {
            const result = await api.slaCheck();
            setSlaStats(result.stats);
            setCheckedOnce(true);
            addLog(
                `فحص SLA: تم فحص ${result.stats.checked} | أحداث جديدة ${result.stats.new_events} | متأخرة ${result.stats.breached} | قريبة من التأخير ${result.stats.near_breach} | مصعدة ${result.stats.escalated}`
            );
            await loadComplaints(); // refresh badges
        } catch (e: unknown) {
            addLog(e instanceof Error ? e.message : "تعذر فحص SLA", false);
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        api.me()
            .then(u => {
                if (!["Manager", "Admin"].includes(u.role.name)) {
                    router.replace("/app");
                    return;
                }
                setMe(u);
                loadComplaints();
            })
            .catch(() => router.replace("/login"));
    }, []);

    // Auto-scroll log
    useEffect(() => {
        logRef.current?.scrollTo(0, 0);
    }, [log]);

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">محاكاة تجريبية</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        محاكاة سيناريو تأخر SLA للمديرين والأدمن فقط
                    </p>
                </div>
                {me && (
                    <span className="text-xs text-gray-400">
                        مسجل باسم <strong>{me.full_name}</strong> ({me.role.name})
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* ── Left column ─────────────────────────────────────────── */}
                <div className="col-span-2 space-y-6">

                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <h2 className="text-sm font-semibold text-gray-700 mb-4">إجراءات سريعة</h2>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={createDemoComplaint}
                                disabled={creating}
                                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                            >
                                {creating ? (
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                ) : "➕"}
                                إنشاء شكوى تجريبية
                            </button>

                            <button
                                onClick={runSlaCheck}
                                disabled={checking}
                                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                            >
                                {checking ? (
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                ) : "🔍"}
                                تشغيل فحص SLA
                            </button>

                            <button
                                onClick={loadComplaints}
                                disabled={loading}
                                className="flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                            >
                                {loading ? "جار التحميل..." : "تحديث القائمة"}
                            </button>
                        </div>
                    </div>

                    {/* SLA Stats dashboard */}
                    {checkedOnce && slaStats && (
                        <div className="grid grid-cols-5 gap-3">
                            {[
                                { key: "checked", label: "تم فحصها", color: "bg-gray-50 border-gray-200 text-gray-700" },
                                { key: "new_events", label: "أحداث جديدة", color: "bg-blue-50 border-blue-200 text-blue-700" },
                                { key: "near_breach", label: "قريبة من التأخير", color: "bg-amber-50 border-amber-200 text-amber-700" },
                                { key: "breached", label: "SLA متأخرة", color: "bg-red-50 border-red-200 text-red-700" },
                                { key: "escalated", label: "مصعدة", color: "bg-purple-50 border-purple-200 text-purple-700" },
                            ].map(({ key, label, color }) => (
                                <div key={key} className={`rounded-xl border p-3 text-center ${color}`}>
                                    <p className="text-2xl font-bold">{slaStats[key as keyof SlaCheckStats]}</p>
                                    <p className="text-xs mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                            <h2 className="text-sm font-semibold text-gray-700">
                                آخر 10 شكاوى
                            </h2>
                            <span className="text-xs text-gray-400">{complaints.length} شكوى</span>
                        </div>

                        {complaints.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                {loading ? "جار التحميل..." : "لا توجد شكاوى. اضغط إنشاء شكوى تجريبية للبدء."}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3 text-right">#</th>
                                            <th className="px-4 py-3 text-right">العنوان</th>
                                            <th className="px-4 py-3 text-right">الحالة</th>
                                            <th className="px-4 py-3 text-right">الأولوية</th>
                                            <th className="px-4 py-3 text-right">تاريخ الإنشاء</th>
                                            <th className="px-4 py-3 text-right">SLA</th>
                                            <th className="px-4 py-3 text-right">المؤقتات</th>
                                            <th className="px-4 py-3 text-right">التصعيد</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {complaints.map(c => (
                                            <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{c.id}</td>
                                                <td className="px-4 py-3 max-w-[160px]">
                                                    <Link
                                                        href={`/app/complaints/${c.id}`}
                                                        className="text-brand-700 hover:underline line-clamp-1 font-medium"
                                                    >
                                                        {c.subject}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
                                                        <span className="text-xs text-gray-600">{STATUS_LABELS[c.status]}</span>
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-3 text-xs ${PRI_COLOR[c.priority]}`}>
                                                    {PRIORITY_LABELS[c.priority]}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                    {new Date(c.created_at).toLocaleString("ar-SA", {
                                                        month: "short", day: "numeric",
                                                        hour: "2-digit", minute: "2-digit"
                                                    })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <SlaBadge sla={c.sla} showTime={false} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-0.5">
                                                        <ChannelCountdown
                                                            label="الاستجابة"
                                                            channel={c.sla?.response}
                                                            doneAt={c.first_response_at}
                                                        />
                                                        <ChannelCountdown
                                                            label="الحل"
                                                            channel={c.sla?.resolve}
                                                            doneAt={c.resolved_at}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {c.sla?.escalated_to_manager
                                                        ? <span className="text-red-600 text-sm" title="مصعدة للمدير">مصعدة</span>
                                                        : <span className="text-gray-300 text-sm">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right column ─────────────────────────────────────────── */}
                <div className="space-y-4">
                    <div className="bg-gradient-to-br from-brand-50 to-blue-50 border border-brand-100 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-brand-800 mb-4">قائمة خطوات العرض</h2>
                        <ol className="space-y-3 text-sm">
                            {[
                                { step: 1, text: "اضغط إنشاء شكوى تجريبية", sub: "ينشئ شكوى تقنية معلومات / صلاحيات حساب / عاجلة" },
                                { step: 2, text: "انتظر دقيقة واحدة", sub: "سياسة SLA التجريبية: رد خلال دقيقة وحل خلال 4 دقائق" },
                                { step: 3, text: "اضغط تشغيل فحص SLA", sub: "يشغّل فحص SLA كاملًا ويسجل الأحداث" },
                                { step: 4, text: "راقب شارة التأخير الحمراء", sub: "مع علامة التصعيد في الجدول" },
                            ].map(({ step, text, sub }) => (
                                <li key={step} className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-bold">
                                        {step}
                                    </span>
                                    <div>
                                        <p className="font-medium text-brand-900 leading-tight">{text}</p>
                                        <p className="text-xs text-brand-600 mt-0.5">{sub}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <h3 className="text-xs font-semibold text-amber-800 mb-2">
                            سياسة SLA التجريبية
                        </h3>
                        <div className="space-y-1 text-xs text-amber-700">
                            <p>القسم: تقنية المعلومات</p>
                            <p>التصنيف: صلاحيات الحساب</p>
                            <p>الأولوية: عاجلة</p>
                            <p>أول رد: <strong>دقيقة تقريبًا</strong></p>
                            <p>الحل النهائي: <strong>4 دقائق تقريبًا</strong></p>
                            <p className="mt-2 text-amber-600 border-t border-amber-200 pt-2">
                                تبدأ حالة الاقتراب من التأخير عند مرور 80% من وقت SLA.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-semibold text-gray-500 mb-2">
                            سجل النشاط
                        </h3>
                        <div ref={logRef} className="space-y-1.5 max-h-52 overflow-y-auto">
                            {log.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">لا يوجد نشاط حتى الآن</p>
                            ) : (
                                log.map((entry, i) => (
                                    <div key={i} className={`text-xs p-2 rounded-lg ${entry.ok ? "bg-gray-50" : "bg-red-50 text-red-700"}`}>
                                        <span className="text-gray-400 ml-1">{entry.ts}</span>
                                        <span className={entry.ok ? "text-gray-700" : "text-red-700"}>{entry.msg}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="text-center text-xs text-gray-400">
                        {now.toLocaleTimeString("ar-SA-u-ca-gregory")}
                    </div>
                </div>
            </div>
        </div>
    );
}
