"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, DashboardOverview } from "@/lib/api";
import { useAppUser } from "./AppUserContext";
import { formatStatus, formatPriority, formatDepartment, formatCategory, formatSlaStatus, formatDate } from "@/lib/displayLabels";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
    NEW: "#3b82f6", // blue-500
    IN_PROGRESS: "#f59e0b", // amber-500
    RESOLVED: "#10b981", // emerald-500
    CLOSED: "#6b7280", // gray-500
};

const PRIORITY_COLORS: Record<string, string> = {
    LOW: "#10b981",
    MEDIUM: "#f59e0b",
    HIGH: "#ef4444",
    URGENT: "#7f1d1d",
};

type ChartTooltipPayload = {
    name?: string;
    value?: string | number;
    color?: string;
    payload?: Record<string, unknown>;
};

type ChartTooltipProps = {
    active?: boolean;
    payload?: ChartTooltipPayload[];
    label?: string | number;
};

const axisTick = { fontSize: 12, fill: "#475569" };

function getCountAxis(data: Array<{ count: number }>) {
    const maxValue = Math.max(0, ...data.map(item => item.count));

    if (maxValue <= 1) {
        return { max: 1, ticks: [0, 1] };
    }

    const roughStep = Math.ceil(maxValue / 4);
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
    const step = niceNormalized * magnitude;
    const max = step * Math.ceil(maxValue / step);
    const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step);

    return { max, ticks };
}

function DashboardTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;

    const item = payload[0];
    const source = item.payload ?? {};
    const itemLabel = String(source.status ?? source.priority ?? source.category ?? source.department ?? label ?? "");

    return (
        <div dir="rtl" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right shadow-lg shadow-slate-950/10">
            {itemLabel && <p className="mb-1 text-xs font-semibold text-slate-900">{itemLabel}</p>}
            <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color ?? "#64748b" }} />
                <span>العدد: {item.value}</span>
            </div>
        </div>
    );
}

function chartHeight(items: number) {
    return Math.max(220, items * 48 + 96);
}

export default function AppDashboard() {
    const user = useAppUser();
    const [stats, setStats] = useState<DashboardOverview | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [days, setDays] = useState<number>(30);

    const fetchStats = () => {
        setLoadingStats(true);
        setStatsError(null);
        api.reportsOverview(days)
            .then(setStats)
            .catch((err) => setStatsError(err.message))
            .finally(() => setLoadingStats(false));
    };

    useEffect(() => {
        fetchStats();
    }, [days]);

    if (!user) return null;

    const roleColors: Record<string, string> = {
        Admin: "bg-purple-100 text-purple-800",
        Manager: "bg-blue-100 text-blue-800",
        Agent: "bg-green-100 text-green-800",
        Requester: "bg-gray-100 text-gray-800",
    };
    const roleLabels: Record<string, string> = {
        Admin: "مدير النظام",
        Manager: "مدير قسم",
        Agent: "موظف دعم",
        Requester: "مستخدم",
    };

    const isInternal = ["Manager", "Admin", "Agent"].includes(user.role.name);
    const isManagerOrAdmin = ["Manager", "Admin"].includes(user.role.name);

    const orderedStatuses = ["NEW", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];
    const formattedStatusData = stats?.by_status 
        ? [...stats.by_status]
            .sort((a, b) => {
                const aIdx = orderedStatuses.indexOf(a.status);
                const bIdx = orderedStatuses.indexOf(b.status);
                return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
            })
            .map(s => ({ ...s, rawStatus: s.status, status: formatStatus(s.status) }))
        : [];

    const orderedPriorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];
    const formattedPriorityData = stats?.by_priority 
        ? [...stats.by_priority]
            .sort((a, b) => {
                const aIdx = orderedPriorities.indexOf(a.priority);
                const bIdx = orderedPriorities.indexOf(b.priority);
                return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
            })
            .map(p => ({ ...p, rawPriority: p.priority, priority: formatPriority(p.priority) }))
        : [];

    const formattedTopCategories = stats?.top_categories
        ? stats.top_categories.map(c => ({ ...c, category: formatCategory(c.category) }))
        : [];

    const formattedByDepartment = stats?.by_department
        ? stats.by_department.map(d => ({ ...d, department: formatDepartment(d.department) }))
        : [];

    const priorityAxis = getCountAxis(formattedPriorityData);
    const categoryAxis = getCountAxis(formattedTopCategories);
    const departmentAxis = getCountAxis(formattedByDepartment);



    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">مرحبًا {user.full_name}</h1>
                    <p className="text-gray-500 mt-1">ملخص لوحة التحكم ({stats?.scope})</p>
                </div>

                <div className="flex items-center gap-4">
                    <span className={`badge ${roleColors[user.role.name] ?? "bg-gray-100"}`}>{roleLabels[user.role.name] ?? user.role.name}</span>

                    <select
                        value={days}
                        onChange={e => setDays(Number(e.target.value))}
                        className="border-gray-200 rounded-lg text-sm bg-white"
                        dir="ltr"
                    >
                        <option value={7}>آخر 7 أيام</option>
                        <option value={30}>آخر 30 يومًا</option>
                        <option value={90}>آخر 90 يومًا</option>
                        <option value={0}>كل الوقت</option>
                    </select>

                    {user.role.name === 'Requester' && (
                        <Link href="/app/complaints/new" className="text-sm px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition">
                            شكوى جديدة
                        </Link>
                    )}
                </div>
            </div>

            {loadingStats ? (
                <div className="h-64 flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                </div>
            ) : statsError ? (
                <div className="text-center bg-red-50 border border-red-200 rounded-xl py-10 px-4">
                    <p className="text-red-600 font-medium mb-4">تعذر تحميل الإحصائيات: {statsError}</p>
                    <button onClick={fetchStats} className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition shadow-sm font-medium">
                        إعادة المحاولة
                    </button>
                </div>
            ) : !stats ? (
                <div className="text-center text-red-500 py-10">لا توجد بيانات إحصائية.</div>
            ) : stats.totals.total === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm mt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد بيانات</h3>
                    <p className="text-gray-500 text-sm">
                        {user.role.name === 'Admin' && "لا توجد شكاوى في الفترة المحددة."}
                        {user.role.name === 'Manager' && "لا توجد شكاوى لقسمك في الفترة المحددة."}
                        {user.role.name === 'Agent' && "لا توجد شكاوى مسندة لك في الفترة المحددة."}
                        {user.role.name === 'Requester' && "لم ترسل أي شكاوى في الفترة المحددة."}
                        {!["Admin", "Manager", "Agent", "Requester"].includes(user.role.name) && "لا توجد شكاوى للعرض في الفترة المحددة."}
                    </p>
                    {user.role.name === 'Requester' && (
                        <Link href="/app/complaints/new" className="mt-5 inline-block px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition">
                            إضافة شكوى جديدة
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-xs text-gray-500 font-medium">إجمالي الشكاوى</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totals.total}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl shadow-sm border border-blue-100">
                            <p className="text-xs text-blue-600 font-medium">شكاوى مفتوحة</p>
                            <p className="text-2xl font-bold text-blue-700 mt-1">{stats.totals.open}</p>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-xl shadow-sm border border-emerald-100">
                            <p className="text-xs text-emerald-600 font-medium">شكاوى مغلقة</p>
                            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.totals.closed}</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl shadow-sm border border-red-100">
                            <p className="text-xs text-red-600 font-medium">تجاوزات SLA</p>
                            <p className="text-2xl font-bold text-red-700 mt-1">{stats.sla.breached}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-xs text-gray-500 font-medium">الالتزام بـ SLA</p>
                            <p className="text-2xl font-bold text-green-600 mt-1" dir="ltr">{stats.sla.compliance_pct}%</p>
                        </div>
                    </div>

                    {/* Time metrics (internal only) */}
                    {stats.time_metrics && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">متوسط أول رد (بالدقائق)</p>
                                    <p className="text-xl font-bold text-gray-900 mt-1">{stats.time_metrics.avg_first_response_minutes ?? 0}</p>
                                </div>
                                <span className="text-2xl">⏳</span>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">متوسط وقت الحل (بالدقائق)</p>
                                    <p className="text-xl font-bold text-gray-900 mt-1">{stats.time_metrics.avg_resolution_minutes ?? 0}</p>
                                </div>
                                <span className="text-2xl">✅</span>
                            </div>
                        </div>
                    )}

                    {/* CHARTS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Status Chart */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold mb-4 text-gray-700">توزيع الحالات</h2>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={formattedStatusData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                                            {formattedStatusData.map((ent, i) => <Cell key={i} fill={STATUS_COLORS[ent.rawStatus] || "#9ca3af"} />)}
                                        </Pie>
                                        <Tooltip content={<DashboardTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div dir="ltr" className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6">
                                {formattedStatusData.map((item, index) => (
                                    <div key={index} className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-gray-700">
                                        <span className="h-3 w-3 rounded-sm shrink-0 shadow-sm" style={{ backgroundColor: STATUS_COLORS[item.rawStatus] || "#9ca3af" }} />
                                        <span>{item.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Priority Chart */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold mb-4 text-gray-700">توزيع الأولويات</h2>
                            <div style={{ height: chartHeight(formattedPriorityData.length) }} dir="ltr">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={formattedPriorityData} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 12 }} barCategoryGap="28%">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" allowDecimals={false} domain={[0, priorityAxis.max]} ticks={priorityAxis.ticks} tick={axisTick} tickLine={false} />
                                        <YAxis
                                            dataKey="priority"
                                            type="category"
                                            orientation="right"
                                            width={120}
                                            tick={{ ...axisTick, fill: "#374151" }}
                                            tickLine={false}
                                            axisLine={false}
                                            interval={0}
                                        />
                                        <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                            {formattedPriorityData.map((ent, i) => <Cell key={i} fill={PRIORITY_COLORS[ent.rawPriority] || "#9ca3af"} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Top Categories */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-sm font-semibold mb-4 text-gray-700">أعلى التصنيفات</h2>
                            <div style={{ height: chartHeight(formattedTopCategories.length) }} dir="ltr">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={formattedTopCategories} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 12 }} barCategoryGap="28%">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" allowDecimals={false} domain={[0, categoryAxis.max]} ticks={categoryAxis.ticks} tick={axisTick} tickLine={false} />
                                        <YAxis
                                            dataKey="category"
                                            type="category"
                                            orientation="right"
                                            width={150}
                                            tick={axisTick}
                                            tickLine={false}
                                            axisLine={false}
                                            interval={0}
                                        />
                                        <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
                                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={34} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Department Distribution (Manager/Admin) */}
                        {stats.by_department && stats.by_department.length > 0 && (
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                                <h2 className="text-sm font-semibold mb-4 text-gray-700">توزيع الأقسام</h2>
                                <div style={{ height: chartHeight(formattedByDepartment.length) }} dir="ltr">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={formattedByDepartment} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 12 }} barCategoryGap="28%">
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" allowDecimals={false} domain={[0, departmentAxis.max]} ticks={departmentAxis.ticks} tick={axisTick} tickLine={false} />
                                            <YAxis
                                                dataKey="department"
                                                type="category"
                                                orientation="right"
                                                width={150}
                                                tick={axisTick}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={0}
                                            />
                                            <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
                                            <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={34} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RECENT COMPLAINTS TABLE */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-8">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-sm font-semibold text-gray-700">أحدث الشكاوى</h2>
                            <Link href="/app/complaints" className="text-sm text-brand-600 hover:text-brand-800 font-medium">عرض الكل</Link>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <td className="px-6 py-4">#</td>
                                        <td className="px-6 py-4">العنوان</td>
                                        <td className="px-6 py-4">القسم</td>
                                        <td className="px-6 py-4">الحالة</td>
                                        <td className="px-6 py-4">SLA</td>
                                        <td className="px-6 py-4">التاريخ</td>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.recent.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                                            <td className="px-6 py-4 text-gray-500">
                                                <Link href={`/app/complaints/${r.id}`}>{r.id}</Link>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <Link href={`/app/complaints/${r.id}`}>{r.subject}</Link>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600">{formatDepartment(r.department)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`badge badge-${r.status.toLowerCase()}`}>{formatStatus(r.status)}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-medium px-2 py-1 rounded ${r.sla_overall === 'BREACHED' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                    {formatSlaStatus(r.sla_overall)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                {formatDate(r.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                    {stats.recent.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-gray-500">لا توجد شكاوى حديثة</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
