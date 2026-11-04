"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Category, ComplaintSummary, SlaCheckStats, UserListItem, UserMe } from "@/lib/api";
import SlaBadge from "@/components/SlaBadge";
import { formatDate, formatPriority, formatStatus } from "@/lib/displayLabels";

const STATUSES = [
    { value: "", label: "كل الحالات" },
    { value: "NEW", label: "جديدة" },
    { value: "IN_PROGRESS", label: "قيد المعالجة" },
    { value: "WAITING_USER", label: "بانتظار المستخدم" },
    { value: "RESOLVED", label: "تم الحل" },
    { value: "CLOSED", label: "مغلقة" },
];

const PRIORITIES = [
    { value: "", label: "كل الأولويات" },
    { value: "LOW", label: "منخفضة" },
    { value: "MEDIUM", label: "متوسطة" },
    { value: "HIGH", label: "عالية" },
    { value: "URGENT", label: "عاجلة" },
];

const ASSIGNMENT_OPTIONS = [
    { value: "", label: "الكل" },
    { value: "assigned", label: "المسندة" },
    { value: "unassigned", label: "غير المسندة" },
];

const ESCALATION_OPTIONS = [
    { value: "", label: "كل الحالات" },
    { value: "true", label: "مصعدة" },
    { value: "false", label: "غير مصعدة" },
];

const STATUS_COLORS: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    WAITING_USER: "bg-purple-100 text-purple-700",
    RESOLVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS: Record<string, string> = {
    LOW: "text-gray-500",
    MEDIUM: "text-blue-600",
    HIGH: "text-orange-600",
    URGENT: "text-red-600 font-semibold",
};

export default function DeptQueuePage() {
    const [me, setMe] = useState<UserMe | null>(null);
    const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
    const [agents, setAgents] = useState<UserListItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [assigneeFilter, setAssigneeFilter] = useState("");
    const [assignmentFilter, setAssignmentFilter] = useState("");
    const [escalatedFilter, setEscalatedFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [assigningId, setAssigningId] = useState<number | null>(null);
    const [assigningValue, setAssigningValue] = useState("");
    const [slaStats, setSlaStats] = useState<SlaCheckStats | null>(null);
    const [slaLoading, setSlaLoading] = useState(false);
    const [slaError, setSlaError] = useState("");

    async function loadComplaints() {
        setLoading(true);
        try {
            const response = await api.listComplaints({
                scope: "department",
                status: statusFilter || undefined,
                priority: priorityFilter || undefined,
                category_id: categoryFilter ? Number(categoryFilter) : undefined,
                assignee_id: assigneeFilter || undefined,
                assignment: (assignmentFilter || undefined) as "assigned" | "unassigned" | undefined,
                escalated: escalatedFilter === "" ? undefined : escalatedFilter === "true",
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            });
            setComplaints(response.items);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        api.me()
            .then(current => {
                setMe(current);
                if (current.department) {
                    api.categories(current.department.id)
                        .then(response => setCategories(response.items || []))
                        .catch(console.error);
                } else {
                    setCategories([]);
                }
            })
            .catch(console.error);

        api.assignableUsers()
            .then(response => setAgents(response.items || []))
            .catch(() => setAgents([]));
    }, []);

    useEffect(() => {
        loadComplaints().catch(console.error);
    }, [assignmentFilter, assigneeFilter, categoryFilter, dateFrom, dateTo, escalatedFilter, priorityFilter, statusFilter]);

    async function handleAssign() {
        if (assigningId === null) return;
        try {
            await api.patchComplaint(assigningId, {
                assignee_id: assigningValue || null,
            });
            setAssigningId(null);
            setAssigningValue("");
            await loadComplaints();
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : "تعذر تحديث الإسناد");
        }
    }

    async function handleSlaCheck() {
        setSlaLoading(true);
        setSlaError("");
        setSlaStats(null);
        try {
            const result = await api.slaCheck();
            setSlaStats(result.stats);
            await loadComplaints();
        } catch (error: unknown) {
            setSlaError(error instanceof Error ? error.message : "تعذر فحص SLA");
        } finally {
            setSlaLoading(false);
        }
    }

    return (
        <div className="p-8">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">شكاوى القسم</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {complaints.length} شكوى في {me?.department?.name ?? "القسم"}
                    </p>
                </div>
                <button
                    onClick={handleSlaCheck}
                    disabled={slaLoading}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                    {slaLoading ? "جار فحص SLA..." : "فحص SLA"}
                </button>
            </div>

            {slaError && (
                <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <span>{slaError}</span>
                    <button onClick={() => setSlaError("")} className="text-red-400 hover:text-red-600">إغلاق</button>
                </div>
            )}

            {slaStats && (
                <div className="mb-6 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-blue-50 p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-brand-700">نتائج فحص SLA</h2>
                        <button onClick={() => setSlaStats(null)} className="text-sm text-gray-400 hover:text-gray-600">إغلاق</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-2xl font-bold text-brand-700">{slaStats.checked}</p>
                            <p className="mt-1 text-xs text-gray-500">تم فحصها</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-2xl font-bold text-blue-600">{slaStats.new_events}</p>
                            <p className="mt-1 text-xs text-gray-500">أحداث جديدة</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-2xl font-bold text-amber-600">{slaStats.near_breach}</p>
                            <p className="mt-1 text-xs text-gray-500">قريبة من التأخير</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-2xl font-bold text-red-600">{slaStats.breached}</p>
                            <p className="mt-1 text-xs text-gray-500">متأخرة</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-2xl font-bold text-orange-600">{slaStats.escalated}</p>
                            <p className="mt-1 text-xs text-gray-500">مصعدة</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-6 grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    {STATUSES.map(option => (
                        <option key={option.value || "all-status"} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <select
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    {PRIORITIES.map(option => (
                        <option key={option.value || "all-priority"} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    <option value="">كل التصنيفات</option>
                    {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                </select>

                <select
                    value={assigneeFilter}
                    onChange={e => setAssigneeFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    <option value="">كل المسند إليهم</option>
                    {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                    ))}
                </select>

                <select
                    value={assignmentFilter}
                    onChange={e => setAssignmentFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    {ASSIGNMENT_OPTIONS.map(option => (
                        <option key={option.value || "all-assignment"} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <select
                    value={escalatedFilter}
                    onChange={e => setEscalatedFilter(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                    {ESCALATION_OPTIONS.map(option => (
                        <option key={option.value || "all-escalation"} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">من</label>
                    <input
                        type="date"
                        aria-label="من التاريخ"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">إلى</label>
                    <input
                        type="date"
                        aria-label="إلى التاريخ"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                    <table className="w-full min-w-[1100px]">
                        <thead>
                            <tr className="bg-gray-50 text-right text-xs text-gray-500">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">العنوان</th>
                                <th className="px-4 py-3">التصنيف</th>
                                <th className="px-4 py-3">الحالة</th>
                                <th className="px-4 py-3">الأولوية</th>
                                <th className="px-4 py-3">SLA</th>
                                <th className="px-4 py-3">مقدم الطلب</th>
                                <th className="px-4 py-3">المسند إليه</th>
                                <th className="px-4 py-3">التاريخ</th>
                                <th className="px-4 py-3">الإجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {complaints.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="py-12 text-center text-sm text-gray-400">لا توجد شكاوى مطابقة</td>
                                </tr>
                            )}

                            {complaints.map(complaint => (
                                <tr key={complaint.id} className="transition-colors hover:bg-gray-50">
                                    <td className="px-4 py-3 text-xs text-gray-400">#{complaint.id}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/app/complaints/${complaint.id}`}
                                                className="text-sm font-medium text-brand-700 hover:underline"
                                            >
                                                {complaint.subject}
                                            </Link>
                                            {complaint.sla?.escalated_to_manager && (
                                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">مصعدة</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{complaint.category.name}</td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[complaint.status]}`}>
                                            {formatStatus(complaint.status)}
                                        </span>
                                    </td>
                                    <td className={`px-4 py-3 text-xs font-medium ${PRIORITY_COLORS[complaint.priority]}`}>
                                        {formatPriority(complaint.priority)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <SlaBadge sla={complaint.sla} />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{complaint.requester.full_name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        {complaint.assignee?.full_name ?? <span className="text-gray-400">غير مسندة</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(complaint.created_at)}</td>
                                    <td className="px-4 py-3">
                                        {assigningId === complaint.id ? (
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={assigningValue}
                                                    onChange={e => setAssigningValue(e.target.value)}
                                                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                                                >
                                                    <option value="">غير مسندة</option>
                                                    {agents.map(agent => (
                                                        <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => handleAssign()} className="text-xs text-brand-600 hover:underline">
                                                    حفظ
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setAssigningId(null);
                                                        setAssigningValue("");
                                                    }}
                                                    className="text-xs text-gray-400 hover:text-gray-600"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setAssigningId(complaint.id);
                                                    setAssigningValue(complaint.assignee?.id ?? "");
                                                }}
                                                className="text-xs text-brand-600 hover:underline"
                                            >
                                                {complaint.assignee ? "إعادة الإسناد" : "إسناد"}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
