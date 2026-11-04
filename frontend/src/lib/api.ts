/**
 * Typed API client that attaches the Bearer token and handles 401 redirects.
 */
import { clearToken, getToken } from "./auth";

const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & { skipAuth?: boolean };

async function request<T>(
    path: string,
    options: RequestOptions = {}
): Promise<T> {
    const { skipAuth = false, ...init } = options;

    const headers: Record<string, string> = {
        ...(init.headers as Record<string, string>),
    };

    // Only set Content-Type for JSON (not for FormData/file uploads)
    if (!(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    if (!skipAuth) {
        const token = getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...init, headers });

    if (res.status === 401) {
        clearToken();
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
        throw new Error("انتهت الجلسة، سجل الدخول مرة أخرى");
    }

    if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "غير مصرح لك بتنفيذ هذا الإجراء");
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        let msg = `HTTP ${res.status}`;
        if (body?.detail) {
            msg = typeof body.detail === "string"
                ? body.detail
                : Array.isArray(body.detail)
                    ? body.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
                    : JSON.stringify(body.detail);
        }
        throw new Error(msg);
    }

    return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface UserMe {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    role: { id: number; name: string };
    department: { id: number; name: string } | null;
}

export interface UserListItem {
    id: string;
    email: string;
    full_name: string;
    role_name: string;
    department_name: string | null;
    is_active: boolean;
    created_at: string;
}

export interface UserListResponse {
    total: number;
    items: UserListItem[];
}

// ── Complaints ────────────────────────────────────────────────────────────────

export interface UserRef { id: string; full_name: string; email: string; }
export interface DeptRef { id: number; name: string; }
export interface CatRef { id: number; name: string; }

export interface CommentOut {
    id: number;
    author: UserRef;
    is_internal: boolean;
    content: string;
    created_at: string;
}

export interface AttachmentOut {
    id: number;
    filename: string;
    mime_type: string;
    storage_path: string;
    uploaded_by: UserRef;
    created_at: string;
}

export interface HistoryOut {
    id: number;
    action_type: string;
    from_value: string | null;
    to_value: string | null;
    actor: UserRef | null;
    created_at: string;
}

export interface SlaChannelDetail {
    status: "ON_TRACK" | "NEAR_BREACH" | "BREACHED";
    remaining_seconds: number | null;
    due_at: string | null;
}

export interface SlaDetail {
    overall: "ON_TRACK" | "NEAR_BREACH" | "BREACHED";
    response: SlaChannelDetail | null;
    resolve: SlaChannelDetail | null;
    escalated_to_manager: boolean;
}

export interface SlaCheckStats {
    checked: number;
    new_events: number;
    breached: number;
    near_breach: number;
    escalated: number;
}

export interface ComplaintSummary {
    id: number;
    subject: string;
    status: string;
    priority: string;
    department: DeptRef;
    category: CatRef;
    requester: UserRef;
    assignee: UserRef | null;
    escalated_to_manager: boolean;
    response_due_at: string | null;
    resolve_due_at: string | null;
    first_response_at: string | null;
    resolved_at: string | null;
    closed_at: string | null;
    created_at: string;
    sla: SlaDetail | null;
}

export interface ComplaintDetail extends ComplaintSummary {
    description: string;
    csat_rating: number | null;
    csat_feedback: string | null;
    comments: CommentOut[];
    attachments: AttachmentOut[];
    history: HistoryOut[];
}

export interface ComplaintListResponse {
    total: number;
    items: ComplaintSummary[];
}

export interface Department { id: number; name: string; }
export interface Category { id: number; name: string; department_id: number; }

// ── Reports / Dashboard ───────────────────────────────────────────────────────

export interface DashboardOverview {
    scope: string;
    range_days: number;
    totals: { total: number; open: number; closed: number };
    by_status: { status: string; count: number }[];
    by_priority: { priority: string; count: number }[];
    by_department?: { department: string; count: number }[];
    top_categories: { category: string; count: number }[];
    sla: {
        on_track: number;
        near_breach: number;
        breached: number;
        escalated: number;
        compliance_pct: number;
    };
    time_metrics?: {
        avg_first_response_minutes: number;
        avg_resolution_minutes: number;
    };
    recent: {
        id: number;
        subject: string;
        status: string;
        priority: string;
        department: string;
        category: string;
        created_at: string;
        sla_overall: string;
    }[];
}

export interface Role { id: number; name: string; }
export interface UserCreate { email: string; password: string; full_name: string; role_name: string; department_id: number | null; is_active: boolean; }
export interface UserUpdate { email?: string; full_name?: string; role_name?: string; department_id?: number | null; is_active?: boolean; password?: string; }
export interface DepartmentCreate { name: string; description?: string; }
export interface DepartmentUpdate { name?: string; description?: string; }
export interface CategoryCreate { name: string; department_id: number; description?: string; }
export interface CategoryUpdate { name?: string; department_id?: number; description?: string; }

// ── AI / Docs ─────────────────────────────────────────────────────────────────
export interface DocumentListItem {
    id: string;
    title: string;
    source_type: string;
    chunk_count: number;
    created_at: string;
    openai_file_id: string | null;
    openai_status: string | null;   // "pending" | "indexed" | "failed" | "deleted"
    is_active: boolean;
}

export interface AskCitation {
    document_title: string;
    page: number | null;
    chunk_index: number;
    snippet: string;
}

export interface AskResponse {
    answer: string;
    citations: AskCitation[];
    confidence: "high" | "medium" | "low";
    refused: boolean;
}

export interface SuggestResponse {
    department_id: number;
    category_id: number;
    priority: string;
    summary: string;
}

// ── API Object ────────────────────────────────────────────────────────────────

export const api = {
    // Auth
    login: (email: string, password: string) =>
        request<LoginResponse>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
            skipAuth: true,
        }),

    me: () => request<UserMe>("/auth/me"),

    adminUsers: (params?: string) => request<UserListResponse>(`/admin/users${params ? "?" + params : ""}`),
    assignableUsers: (department_id?: number) =>
        request<UserListResponse>(
            `/users/assignable${department_id ? `?department_id=${department_id}` : ""}`
        ),

    // Org lookups (for create form)
    departments: () => request<{ total: number; items: Department[] }>("/departments"),
    categories: (department_id?: number) =>
        request<{ total: number; items: Category[] }>(
            department_id ? `/categories?department_id=${department_id}` : "/categories"
        ),

    // Complaints CRUD
    createComplaint: (body: {
        subject: string; description: string;
        department_id: number; category_id: number; priority: string;
    }) => request<ComplaintDetail>("/complaints", { method: "POST", body: JSON.stringify(body) }),

    listComplaints: (params?: {
        scope?: string; status?: string; department_id?: number;
        category_id?: number; priority?: string;
        assignee_id?: string; assignment?: "assigned" | "unassigned";
        escalated?: boolean; date_from?: string; date_to?: string;
    }) => {
        const q = new URLSearchParams();
        if (params?.scope) q.set("scope", params.scope);
        if (params?.status) q.set("status", params.status);
        if (params?.department_id) q.set("department_id", String(params.department_id));
        if (params?.category_id) q.set("category_id", String(params.category_id));
        if (params?.priority) q.set("priority", params.priority);
        if (params?.assignee_id) q.set("assignee_id", params.assignee_id);
        if (params?.assignment) q.set("assignment", params.assignment);
        if (params?.escalated !== undefined) q.set("escalated", String(params.escalated));
        if (params?.date_from) q.set("date_from", params.date_from);
        if (params?.date_to) q.set("date_to", params.date_to);
        return request<ComplaintListResponse>(`/complaints?${q}`);
    },

    getComplaint: (id: number) => request<ComplaintDetail>(`/complaints/${id}`),

    patchComplaint: (id: number, body: Record<string, unknown>) =>
        request<ComplaintDetail>(`/complaints/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

    addComment: (id: number, content: string, is_internal: boolean) =>
        request<CommentOut>(`/complaints/${id}/comments`, {
            method: "POST",
            body: JSON.stringify({ content, is_internal }),
        }),

    uploadAttachment: (id: number, file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<AttachmentOut>(`/complaints/${id}/attachments`, {
            method: "POST",
            body: form,
        });
    },

    closeComplaint: (id: number, csat_rating: number, csat_feedback?: string) =>
        request<ComplaintDetail>(`/complaints/${id}/close`, {
            method: "POST",
            body: JSON.stringify({ csat_rating, csat_feedback }),
        }),

    reopenComplaint: (id: number) =>
        request<ComplaintDetail>(`/complaints/${id}/reopen`, { method: "POST" }),

    // Admin CRUD
    adminRoles: () => request<Role[]>("/admin/roles"),
    adminCreateUser: (body: UserCreate) => request<UserListItem>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
    adminUpdateUser: (id: string, body: UserUpdate) => request<UserListItem>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    adminDeleteUser: (id: string) => request<{message: string}>(`/admin/users/${id}`, { method: "DELETE" }),
    
    adminCreateDepartment: (body: DepartmentCreate) => request<Department>("/admin/departments", { method: "POST", body: JSON.stringify(body) }),
    adminUpdateDepartment: (id: number, body: DepartmentUpdate) => request<Department>(`/admin/departments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    adminDeleteDepartment: (id: number) => request<{message: string}>(`/admin/departments/${id}`, { method: "DELETE" }),
    
    adminCreateCategory: (body: CategoryCreate) => request<Category>("/admin/categories", { method: "POST", body: JSON.stringify(body) }),
    adminUpdateCategory: (id: number, body: CategoryUpdate) => request<Category>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    adminDeleteCategory: (id: number) => request<{message: string}>(`/admin/categories/${id}`, { method: "DELETE" }),

    // SLA
    slaCheck: () => request<{ status: string; stats: SlaCheckStats }>("/sla/check"),

    // Reports / Dashboard
    reportsOverview: (days: number = 30) => request<DashboardOverview>(`/reports/overview?days=${days}`),

    // Docs (Admin)
    adminDocs: () => request<DocumentListItem[]>("/admin/docs/"),
    adminUploadDoc: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<any>("/admin/docs/upload", { method: "POST", body: form });
    },
    adminIndexDocs: () => request<{ indexed_docs: number; total_chunks: number; message: string }>("/admin/docs/index", { method: "POST" }),
    adminDeleteDoc: (docId: string) => request<{ deleted: boolean; doc_id: string }>(`/admin/docs/${docId}`, { method: "DELETE" }),

    // AI
    aiAsk: (question: string, top_k: number = 6) => request<AskResponse>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question, top_k })
    }),
    aiSuggest: (text: string) => request<SuggestResponse>("/ai/complaint-suggest", {
        method: "POST",
        body: JSON.stringify({ text })
    }),
};
