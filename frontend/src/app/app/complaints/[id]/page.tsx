"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Category, ComplaintDetail, Department, SlaChannelDetail, UserListItem, UserMe } from "@/lib/api";
import SlaBadge, { slaTimeLabel } from "@/components/SlaBadge";

const STATUSES = [
    { value: "NEW", label: "جديدة" },
    { value: "IN_PROGRESS", label: "قيد المعالجة" },
    { value: "WAITING_USER", label: "بانتظار المستخدم" },
    { value: "RESOLVED", label: "تم الحل" },
    { value: "CLOSED", label: "مغلقة" },
];

const PRIORITIES = [
    { value: "LOW", label: "منخفضة" },
    { value: "MEDIUM", label: "متوسطة" },
    { value: "HIGH", label: "عالية" },
    { value: "URGENT", label: "عاجلة" },
];

const STATUS_LABELS = Object.fromEntries(STATUSES.map(item => [item.value, item.label])) as Record<string, string>;
const PRIORITY_LABELS = Object.fromEntries(PRIORITIES.map(item => [item.value, item.label])) as Record<string, string>;

const STATUS_COLORS: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    WAITING_USER: "bg-purple-100 text-purple-700",
    RESOLVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-600",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
    NEW: ["IN_PROGRESS"],
    IN_PROGRESS: ["WAITING_USER", "RESOLVED"],
    WAITING_USER: ["IN_PROGRESS"],
    RESOLVED: ["IN_PROGRESS", "CLOSED"],
};

const HISTORY_LABELS: Record<string, string> = {
    CREATED: "إنشاء",
    STATUS_CHANGED: "تغيير الحالة",
    PRIORITY_CHANGED: "تغيير الأولوية",
    ASSIGNED: "إسناد",
    DEPT_CHANGED: "تغيير القسم",
    CATEGORY_CHANGED: "تغيير التصنيف",
    SUBJECT_CHANGED: "تغيير العنوان",
    DESCRIPTION_CHANGED: "تعديل التفاصيل",
    CLOSED: "إغلاق",
    REOPENED: "إعادة فتح",
};

interface ChannelRowProps {
    label: string;
    channel: SlaChannelDetail | null;
    doneAt: string | null;
    dueAt: string | null;
    isAgentOrAbove: boolean;
}

function formatArabicDate(value: string | null | undefined, withTime = false) {
    if (!value) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(value));
}

function SlaChannelRow({ label, channel, doneAt, dueAt, isAgentOrAbove }: ChannelRowProps) {
    const statusColors: Record<string, string> = {
        ON_TRACK: "text-emerald-600",
        NEAR_BREACH: "text-amber-600",
        BREACHED: "text-red-600",
    };
    const barColors: Record<string, string> = {
        ON_TRACK: "bg-emerald-400",
        NEAR_BREACH: "bg-amber-400",
        BREACHED: "bg-red-500",
    };

    const status = channel?.status ?? "ON_TRACK";
    const timeText = channel?.remaining_seconds !== undefined && channel?.remaining_seconds !== null
        ? slaTimeLabel(channel.remaining_seconds, status)
        : "";

    let pct = 0;
    if (isAgentOrAbove && channel?.due_at && !doneAt) {
        if (status === "ON_TRACK") pct = 50;
        else if (status === "NEAR_BREACH") pct = 82;
        else pct = 100;
    } else if (doneAt) {
        pct = 100;
    }

    return (
        <div>
            <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-gray-500">{label}</p>
                {!doneAt && channel && isAgentOrAbove && (
                    <span className={`text-xs font-medium ${statusColors[status]}`}>
                        {timeText}
                    </span>
                )}
                {doneAt && (
                    <span className="text-xs font-medium text-emerald-600">مكتمل</span>
                )}
            </div>
            {isAgentOrAbove && (
                <div className="mb-1 h-1.5 w-full rounded-full bg-gray-100">
                    <div
                        className={`h-1.5 rounded-full transition-all ${doneAt ? "bg-emerald-400" : barColors[status]}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}
            <p className="text-xs text-gray-400">
                {doneAt
                    ? formatArabicDate(doneAt, true)
                    : dueAt
                        ? `الموعد النهائي: ${formatArabicDate(dueAt, true)}`
                        : "لا يوجد موعد محدد"}
            </p>
        </div>
    );
}

export default function ComplaintDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params.id);

    const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
    const [me, setMe] = useState<UserMe | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [agents, setAgents] = useState<UserListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState("");
    const [isInternal, setIsInternal] = useState(false);
    const [csatRating, setCsatRating] = useState(5);
    const [csatFeedback, setCsatFeedback] = useState("");
    const [showCsat, setShowCsat] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState("");
    const [editForm, setEditForm] = useState({
        subject: "",
        description: "",
        department_id: 0,
        category_id: 0,
        priority: "MEDIUM",
        status: "NEW",
        assignee_id: "",
        escalated_to_manager: false,
    });

    function fillEditForm(item: ComplaintDetail) {
        setEditForm({
            subject: item.subject,
            description: item.description,
            department_id: item.department.id,
            category_id: item.category.id,
            priority: item.priority,
            status: item.status,
            assignee_id: item.assignee?.id ?? "",
            escalated_to_manager: Boolean(item.sla?.escalated_to_manager || item.escalated_to_manager),
        });
    }

    async function refreshComplaint() {
        const item = await api.getComplaint(id);
        setComplaint(item);
        fillEditForm(item);
    }

    useEffect(() => {
        setLoading(true);
        api.me()
            .then(setMe)
            .catch(() => { });
        api.departments().then(r => setDepartments(r.items || [])).catch(() => { });
        api.categories().then(r => setCategories(r.items || [])).catch(() => { });
        refreshComplaint()
            .catch(() => router.back())
            .finally(() => setLoading(false));
    }, [id]);

    const role = me?.role.name ?? "";
    const isAdmin = role === "Admin";
    const isRequester = role === "Requester";
    const isAgentOrAbove = ["Agent", "Manager", "Admin"].includes(role);
    const isManagerOrAbove = ["Manager", "Admin"].includes(role);
    const canEditContent = isAdmin;
    const allowedTransitions = complaint ? VALID_TRANSITIONS[complaint.status] ?? [] : [];
    const filteredEditCategories = categories.filter(c => c.department_id === editForm.department_id);

    useEffect(() => {
        if (!isManagerOrAbove) {
            setAgents([]);
            return;
        }

        const departmentId = isAdmin
            ? (editForm.department_id || complaint?.department.id || 0)
            : (me?.department?.id || complaint?.department.id || 0);

        if (!departmentId) {
            setAgents([]);
            return;
        }

        api.assignableUsers(isAdmin ? departmentId : undefined)
            .then(r => setAgents(r.items || []))
            .catch(() => setAgents([]));
    }, [complaint?.department.id, editForm.department_id, isAdmin, isManagerOrAbove, me?.department?.id]);

    async function handleAddComment() {
        if (!commentText.trim()) return;
        setSaving(true);
        setError("");
        try {
            await api.addComment(id, commentText, isInternal);
            setCommentText("");
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر إرسال التعليق");
        } finally {
            setSaving(false);
        }
    }

    async function handleStatusChange(newStatus: string) {
        setSaving(true);
        setError("");
        try {
            await api.patchComplaint(id, { status: newStatus });
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر تحديث الحالة");
        } finally {
            setSaving(false);
        }
    }

    async function handleEditSave(e: React.FormEvent) {
        e.preventDefault();
        if (canEditContent && !editForm.subject.trim()) {
            setError("عنوان الشكوى مطلوب");
            return;
        }
        if (canEditContent && editForm.description.trim().length < 10) {
            setError("تفاصيل الشكوى يجب أن تكون 10 أحرف على الأقل");
            return;
        }
        if ((canEditContent && !editForm.department_id) || !editForm.category_id) {
            setError("اختر القسم والتصنيف");
            return;
        }

        setSaving(true);
        setError("");
        try {
            const payload: Record<string, unknown> = {
                category_id: editForm.category_id,
                priority: editForm.priority,
                assignee_id: editForm.assignee_id || null,
                escalated_to_manager: editForm.escalated_to_manager,
            };
            if (canEditContent) {
                payload.subject = editForm.subject.trim();
                payload.description = editForm.description.trim();
                payload.department_id = editForm.department_id;
                payload.status = editForm.status;
            }
            await api.patchComplaint(id, payload);
            setIsEditing(false);
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر حفظ التعديلات");
        } finally {
            setSaving(false);
        }
    }

    async function handleClose() {
        setSaving(true);
        setError("");
        try {
            await api.closeComplaint(id, csatRating, csatFeedback || undefined);
            setShowCsat(false);
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر إغلاق الشكوى");
        } finally {
            setSaving(false);
        }
    }

    async function handleReopen() {
        setSaving(true);
        setError("");
        try {
            await api.reopenComplaint(id);
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر إعادة فتح الشكوى");
        } finally {
            setSaving(false);
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        try {
            await api.uploadAttachment(id, file);
            await refreshComplaint();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر رفع الملف");
        }
        e.target.value = "";
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            </div>
        );
    }

    if (!complaint) return null;

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
            <div>
                <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
                    رجوع
                </button>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm text-gray-400">#{complaint.id}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[complaint.status]}`}>
                                {STATUS_LABELS[complaint.status]}
                            </span>
                            <SlaBadge sla={complaint.sla} />
                            {complaint.sla?.escalated_to_manager && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">مصعدة للمدير</span>
                            )}
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">{complaint.subject}</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {complaint.department.name} / {complaint.category.name} - مقدم الطلب: {complaint.requester.full_name}
                        </p>
                    </div>

                    {isAgentOrAbove && allowedTransitions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {allowedTransitions.map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(s)}
                                    disabled={saving}
                                    className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                                >
                                    نقل إلى {STATUS_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <span>{error}</span>
                    <button onClick={() => setError("")} className="mr-3 text-red-400 hover:text-red-600">إغلاق</button>
                </div>
            )}

            {isManagerOrAbove && (
                <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900">تعديل الشكوى</h2>
                            <p className="mt-1 text-xs text-gray-500">يمكن للأدمن تعديل العنوان، التفاصيل، القسم، التصنيف، الحالة، والأولوية.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                fillEditForm(complaint);
                                setIsEditing(open => !open);
                            }}
                            className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                            {isEditing ? "إخفاء التعديل" : "تعديل"}
                        </button>
                    </div>

                    {isEditing && (
                        <form onSubmit={handleEditSave} className="mt-5 grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">عنوان الشكوى</label>
                                    <input
                                        value={editForm.subject}
                                        onChange={e => setEditForm({ ...editForm, subject: e.target.value })}
                                        disabled={!canEditContent}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">الحالة</label>
                                    <select
                                        value={editForm.status}
                                        onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                        disabled={!canEditContent}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    >
                                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-600">تفاصيل الشكوى</label>
                                <textarea
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                    rows={4}
                                    disabled={!canEditContent}
                                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">القسم</label>
                                    <select
                                        value={editForm.department_id}
                                        onChange={e => {
                                            const departmentId = Number(e.target.value);
                                            const nextCategory = categories.find(c => c.department_id === departmentId)?.id ?? 0;
                                            setEditForm({
                                                ...editForm,
                                                department_id: departmentId,
                                                category_id: nextCategory,
                                                assignee_id: "",
                                            });
                                        }}
                                        disabled={!canEditContent}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    >
                                        <option value={0}>اختر القسم</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">التصنيف</label>
                                    <select
                                        value={editForm.category_id}
                                        onChange={e => setEditForm({ ...editForm, category_id: Number(e.target.value) })}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    >
                                        <option value={0}>اختر التصنيف</option>
                                        {filteredEditCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">الأولوية</label>
                                    <select
                                        value={editForm.priority}
                                        onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    >
                                        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-gray-600">إسناد إلى</label>
                                    <select
                                        value={editForm.assignee_id}
                                        onChange={e => setEditForm({ ...editForm, assignee_id: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    >
                                        <option value="">بدون تغيير</option>
                                        {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                                    </select>
                                </div>
                                <label className="mt-6 flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={editForm.escalated_to_manager}
                                        onChange={e => setEditForm({ ...editForm, escalated_to_manager: e.target.checked })}
                                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    مصعدة للمدير
                                </label>
                            </div>

                            <div className="flex gap-3 border-t border-gray-100 pt-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                                >
                                    {saving ? "جار الحفظ..." : "حفظ التعديلات"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        fillEditForm(complaint);
                                        setIsEditing(false);
                                    }}
                                    className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <div className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h2 className="mb-3 text-sm font-semibold text-gray-700">التفاصيل</h2>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{complaint.description}</p>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h2 className="mb-4 text-sm font-semibold text-gray-700">التعليقات ({complaint.comments.length})</h2>
                        <div className="mb-5 space-y-4">
                            {complaint.comments.length === 0 && (
                                <p className="py-4 text-center text-xs text-gray-400">لا توجد تعليقات حتى الآن</p>
                            )}
                            {complaint.comments.map(c => (
                                <div key={c.id} className={`rounded-xl p-3 text-sm ${c.is_internal ? "border border-yellow-200 bg-yellow-50" : "bg-gray-50"}`}>
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-gray-800">{c.author.full_name}</span>
                                        {c.is_internal && (
                                            <span className="rounded bg-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">ملاحظة داخلية</span>
                                        )}
                                        <span className="ms-auto text-xs text-gray-400">
                                            {formatArabicDate(c.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-gray-700">{c.content}</p>
                                </div>
                            ))}
                        </div>

                        {complaint.status !== "CLOSED" && (
                            <div className="space-y-2">
                                {isAgentOrAbove && (
                                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={isInternal}
                                            onChange={e => setIsInternal(e.target.checked)}
                                        />
                                        ملاحظة داخلية مخفية عن مقدم الشكوى
                                    </label>
                                )}
                                <textarea
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    rows={3}
                                    placeholder="أضف تعليقًا..."
                                    className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                                <button
                                    onClick={handleAddComment}
                                    disabled={saving || !commentText.trim()}
                                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                                >
                                    إرسال
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-700">المرفقات ({complaint.attachments.length})</h2>
                            {complaint.status !== "CLOSED" && (
                                <label className="cursor-pointer text-xs text-brand-600 hover:underline">
                                    رفع ملف
                                    <input type="file" className="hidden" onChange={handleFileUpload} />
                                </label>
                            )}
                        </div>
                        {complaint.attachments.length === 0 ? (
                            <p className="py-4 text-center text-xs text-gray-400">لا توجد مرفقات</p>
                        ) : (
                            <div className="space-y-2">
                                {complaint.attachments.map(a => (
                                    <div key={a.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2 text-sm">
                                        <span className="text-lg">ملف</span>
                                        <div>
                                            <p className="font-medium text-gray-800" dir="ltr">{a.filename}</p>
                                            <p className="text-xs text-gray-400">{a.uploaded_by.full_name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {isRequester && (
                        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
                            <h2 className="text-sm font-semibold text-gray-700">الإجراءات</h2>

                            {complaint.status === "RESOLVED" && (
                                showCsat ? (
                                    <div className="space-y-3">
                                        <p className="text-sm font-medium text-gray-700">تقييم الخدمة</p>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => setCsatRating(n)}
                                                    className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${csatRating >= n ? "bg-yellow-400 text-white" : "bg-gray-100 text-gray-600"}`}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                        <textarea
                                            value={csatFeedback}
                                            onChange={e => setCsatFeedback(e.target.value)}
                                            rows={2}
                                            placeholder="ملاحظات اختيارية"
                                            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleClose}
                                                disabled={saving}
                                                className="rounded-xl bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                                            >
                                                إغلاق وحفظ التقييم
                                            </button>
                                            <button onClick={() => setShowCsat(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm">إلغاء</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowCsat(true)}
                                        className="rounded-xl bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
                                    >
                                        إغلاق مع تقييم
                                    </button>
                                )
                            )}

                            {(complaint.status === "RESOLVED" || complaint.status === "CLOSED") && (
                                <button
                                    onClick={handleReopen}
                                    disabled={saving}
                                    className="rounded-xl border border-orange-400 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                                >
                                    إعادة فتح الشكوى
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-gray-500">مواعيد SLA</h3>
                            {complaint.sla && <SlaBadge sla={complaint.sla} showTime={false} />}
                        </div>

                        {complaint.sla?.escalated_to_manager && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                تم تصعيد هذه الشكوى إلى المدير
                            </div>
                        )}

                        <SlaChannelRow
                            label="أول رد"
                            channel={complaint.sla?.response ?? null}
                            doneAt={complaint.first_response_at}
                            dueAt={complaint.response_due_at}
                            isAgentOrAbove={isAgentOrAbove}
                        />

                        <SlaChannelRow
                            label="الحل النهائي"
                            channel={complaint.sla?.resolve ?? null}
                            doneAt={complaint.resolved_at}
                            dueAt={complaint.resolve_due_at}
                            isAgentOrAbove={isAgentOrAbove}
                        />
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4">
                        <h3 className="mb-3 text-xs font-semibold text-gray-500">بيانات الشكوى</h3>
                        <dl className="space-y-3 text-sm">
                            <div>
                                <dt className="text-xs text-gray-400">الأولوية</dt>
                                <dd className="mt-1 font-medium text-gray-800">{PRIORITY_LABELS[complaint.priority] ?? complaint.priority}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-400">المسند إليه</dt>
                                <dd className="mt-1 font-medium text-gray-800">{complaint.assignee?.full_name ?? "غير مسندة"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-gray-400">تاريخ الإنشاء</dt>
                                <dd className="mt-1 text-gray-700">{formatArabicDate(complaint.created_at, true)}</dd>
                            </div>
                        </dl>
                    </div>

                    {isAgentOrAbove && complaint.history.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                            <h3 className="mb-3 text-xs font-semibold text-gray-500">سجل التغييرات</h3>
                            <div className="space-y-2">
                                {complaint.history.slice(-5).map(h => (
                                    <div key={h.id} className="flex gap-2 text-xs text-gray-600">
                                        <span className="shrink-0 text-gray-400">{formatArabicDate(h.created_at)}</span>
                                        <span>
                                            {HISTORY_LABELS[h.action_type] ?? h.action_type.replace("_", " ")}
                                            {h.from_value && h.to_value ? `: ${h.from_value} إلى ${h.to_value}` : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {complaint.status === "CLOSED" && complaint.csat_rating && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                            <h3 className="mb-2 text-xs font-semibold text-gray-500">تقييم الخدمة</h3>
                            <p className="text-2xl">{"★".repeat(complaint.csat_rating)}{"☆".repeat(5 - complaint.csat_rating)}</p>
                            {complaint.csat_feedback && (
                                <p className="mt-1 text-xs text-gray-600">{complaint.csat_feedback}</p>
                            )}
                        </div>
                    )}

                    {isManagerOrAbove && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                            <h3 className="mb-2 text-xs font-semibold text-gray-500">الإسناد</h3>
                            <p className="text-sm text-gray-700">
                                {complaint.assignee ? complaint.assignee.full_name : "غير مسندة"}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
