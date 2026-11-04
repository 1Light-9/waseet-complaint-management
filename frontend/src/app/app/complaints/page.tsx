"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Category, ComplaintSummary, Department, UserListItem, UserMe } from "@/lib/api";
import SlaBadge from "@/components/SlaBadge";
import { formatDate, formatPriority, formatStatus } from "@/lib/displayLabels";

const STATUS_OPTIONS = [
    { value: "", label: "كل الحالات" },
    { value: "NEW", label: "جديدة" },
    { value: "IN_PROGRESS", label: "قيد المعالجة" },
    { value: "WAITING_USER", label: "بانتظار المستخدم" },
    { value: "RESOLVED", label: "تم الحل" },
    { value: "CLOSED", label: "مغلقة" },
];

const PRIORITY_OPTIONS = [
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

export default function MyComplaintsPage() {
    const [user, setUser] = useState<UserMe | null>(null);
    const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [agents, setAgents] = useState<UserListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [assigneeFilter, setAssigneeFilter] = useState("");
    const [assignmentFilter, setAssignmentFilter] = useState("");
    const [escalatedFilter, setEscalatedFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const isAdmin = user?.role.name === "Admin";
    const isRequester = user?.role.name === "Requester";

    useEffect(() => {
        api.me()
            .then(setUser)
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!isAdmin) return;

        api.departments()
            .then(response => setDepartments(response.items || []))
            .catch(console.error);
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin) return;

        api.categories(departmentFilter ? Number(departmentFilter) : undefined)
            .then(response => setCategories(response.items || []))
            .catch(() => setCategories([]));

        api.assignableUsers(departmentFilter ? Number(departmentFilter) : undefined)
            .then(response => setAgents(response.items || []))
            .catch(() => setAgents([]));

        setCategoryFilter("");
        setAssigneeFilter("");
    }, [departmentFilter, isAdmin]);

    useEffect(() => {
        if (!user) return;

        setLoading(true);
        api.listComplaints({
            scope: isAdmin ? "all" : "my",
            status: statusFilter || undefined,
            priority: priorityFilter || undefined,
            department_id: isAdmin && departmentFilter ? Number(departmentFilter) : undefined,
            category_id: isAdmin && categoryFilter ? Number(categoryFilter) : undefined,
            assignee_id: isAdmin && assigneeFilter ? assigneeFilter : undefined,
            assignment: isAdmin ? (assignmentFilter || undefined) as "assigned" | "unassigned" | undefined : undefined,
            escalated: isAdmin ? (escalatedFilter === "" ? undefined : escalatedFilter === "true") : undefined,
            date_from: isAdmin ? (dateFrom || undefined) : undefined,
            date_to: isAdmin ? (dateTo || undefined) : undefined,
        })
            .then(response => setComplaints(response.items))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [assigneeFilter, assignmentFilter, categoryFilter, dateFrom, dateTo, departmentFilter, escalatedFilter, isAdmin, priorityFilter, statusFilter, user]);

    return (
        <div className="p-8">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? "كل الشكاوى" : "شكاواي"}</h1>
                    <p className="mt-1 text-sm text-gray-500">{complaints.length} شكوى</p>
                </div>
                {isRequester && (
                    <Link
                        href="/app/complaints/new"
                        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                        شكوى جديدة
                    </Link>
                )}
            </div>

            {isAdmin ? (
                <>
                    <div className="mb-6 grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        >
                            {STATUS_OPTIONS.map(option => (
                                <option key={option.value || "all-status"} value={option.value}>{option.label}</option>
                            ))}
                        </select>

                        <select
                            value={priorityFilter}
                            onChange={e => setPriorityFilter(e.target.value)}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        >
                            {PRIORITY_OPTIONS.map(option => (
                                <option key={option.value || "all-priority"} value={option.value}>{option.label}</option>
                            ))}
                        </select>

                        <select
                            value={departmentFilter}
                            onChange={e => setDepartmentFilter(e.target.value)}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        >
                            <option value="">كل الأقسام</option>
                            {departments.map(department => (
                                <option key={department.id} value={department.id}>{department.name}</option>
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
                            <table className="w-full min-w-[1150px]">
                                <thead>
                                    <tr className="bg-gray-50 text-right text-xs text-gray-500">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">العنوان</th>
                                        <th className="px-4 py-3">القسم</th>
                                        <th className="px-4 py-3">التصنيف</th>
                                        <th className="px-4 py-3">الحالة</th>
                                        <th className="px-4 py-3">الأولوية</th>
                                        <th className="px-4 py-3">SLA</th>
                                        <th className="px-4 py-3">مقدم الطلب</th>
                                        <th className="px-4 py-3">المسند إليه</th>
                                        <th className="px-4 py-3">التاريخ</th>
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
                                                    <Link href={`/app/complaints/${complaint.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                                                        {complaint.subject}
                                                    </Link>
                                                    {complaint.sla?.escalated_to_manager && (
                                                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">مصعدة</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{complaint.department.name}</td>
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
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : loading ? (
                <div className="flex justify-center py-20">
                    <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                </div>
            ) : complaints.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                    <p className="text-sm">لا توجد شكاوى</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {complaints.map(complaint => (
                        <Link
                            key={complaint.id}
                            href={`/app/complaints/${complaint.id}`}
                            className="block rounded-2xl border border-gray-100 bg-white p-5 transition-shadow hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                        <span className="text-xs text-gray-400">#{complaint.id}</span>
                                        {complaint.sla?.escalated_to_manager && (
                                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">مصعدة</span>
                                        )}
                                    </div>
                                    <p className="truncate font-medium text-gray-900">{complaint.subject}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {complaint.department.name} / {complaint.category.name}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[complaint.status] ?? "bg-gray-100 text-gray-600"}`}>
                                        {formatStatus(complaint.status)}
                                    </span>
                                    <SlaBadge sla={complaint.sla} />
                                    <span className={`text-xs font-medium ${PRIORITY_COLORS[complaint.priority]}`}>
                                        {formatPriority(complaint.priority)}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-gray-400">{formatDate(complaint.created_at)}</p>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
