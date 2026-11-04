"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Category, ComplaintSummary, UserListItem, UserMe } from "@/lib/api";
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

export default function AssignedQueuePage() {
    const [me, setMe] = useState<UserMe | null>(null);
    const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [agents, setAgents] = useState<UserListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [assigneeFilter, setAssigneeFilter] = useState("");
    const [escalatedFilter, setEscalatedFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const role = me?.role.name ?? "";
    const isManager = role === "Manager";

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

                if (current.role.name === "Manager") {
                    api.assignableUsers()
                        .then(response => setAgents(response.items || []))
                        .catch(() => setAgents([]));
                } else {
                    setAgents([]);
                }
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!me) return;

        setLoading(true);
        api.listComplaints({
            scope: "assigned",
            status: statusFilter || undefined,
            priority: priorityFilter || undefined,
            category_id: categoryFilter ? Number(categoryFilter) : undefined,
            assignee_id: isManager && assigneeFilter ? assigneeFilter : undefined,
            escalated: escalatedFilter === "" ? undefined : escalatedFilter === "true",
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
        })
            .then(response => setComplaints(response.items))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [assigneeFilter, categoryFilter, dateFrom, dateTo, escalatedFilter, isManager, me, priorityFilter, statusFilter]);

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">
                    {isManager ? "الشكاوى المسندة في القسم" : "مهامي"}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    {complaints.length} شكوى {isManager ? "مسندة داخل القسم" : "مسندة لك"}
                </p>
            </div>

            <div className={`mb-6 grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 ${isManager ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
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

                {isManager && (
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
                )}

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
                    <table className="w-full min-w-[1000px]">
                        <thead>
                            <tr className="bg-gray-50 text-right text-xs text-gray-500">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">العنوان</th>
                                <th className="px-4 py-3">التصنيف</th>
                                <th className="px-4 py-3">الحالة</th>
                                <th className="px-4 py-3">الأولوية</th>
                                <th className="px-4 py-3">SLA</th>
                                <th className="px-4 py-3">مقدم الطلب</th>
                                {isManager && <th className="px-4 py-3">المسند إليه</th>}
                                <th className="px-4 py-3">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {complaints.length === 0 && (
                                <tr>
                                    <td colSpan={isManager ? 9 : 8} className="py-12 text-center text-sm text-gray-400">
                                        لا توجد شكاوى مطابقة
                                    </td>
                                </tr>
                            )}

                            {complaints.map(complaint => (
                                <tr key={complaint.id} className="transition-colors hover:bg-gray-50">
                                    <td className="px-4 py-3 text-xs text-gray-400">#{complaint.id}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Link href={`/app/complaints/${complaint.id}`} className="text-sm font-medium text-brand-700 hover:underline">
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
                                    {isManager && (
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {complaint.assignee?.full_name ?? <span className="text-gray-400">غير مسندة</span>}
                                        </td>
                                    )}
                                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(complaint.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
