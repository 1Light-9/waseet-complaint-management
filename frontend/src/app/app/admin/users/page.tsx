"use client";

import { useState, useEffect } from "react";
import { api, UserListItem, Role, Department } from "@/lib/api";
import { useAppUser } from "../../AppUserContext";

const ROLE_LABELS: Record<string, string> = {
    Admin: "مدير النظام",
    Manager: "مدير قسم",
    Agent: "موظف دعم",
    Requester: "مستخدم",
};

export default function AdminUsersPage() {
    const currentUser = useAppUser();
    const [users, setUsers] = useState<UserListItem[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

    const [form, setForm] = useState({
        email: "",
        password: "",
        full_name: "",
        role_name: "Requester",
        department_id: 0,
        is_active: true,
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [usersRes, rolesRes, deptsRes] = await Promise.all([
                api.adminUsers(),
                api.adminRoles(),
                api.departments()
            ]);
            setUsers(usersRes.items || []);
            setRoles(rolesRes || []);
            setDepartments(deptsRes.items || []);
        } catch (err: any) {
            setError(err.message || "تعذر تحميل البيانات");
        } finally {
            setLoading(false);
        }
    }

    function openModal(user?: UserListItem) {
        if (user) {
            setEditingUserId(user.id);
            setForm({
                email: user.email,
                password: "", // blank for edit
                full_name: user.full_name,
                role_name: user.role_name,
                department_id: departments.find(d => d.name === user.department_name)?.id || 0,
                is_active: user.is_active,
            });
        } else {
            setEditingUserId(null);
            setForm({
                email: "",
                password: "",
                full_name: "",
                role_name: "Requester",
                department_id: 0,
                is_active: true,
            });
        }
        setIsModalOpen(true);
        setError("");
    }

    function closeModal() {
        setIsModalOpen(false);
        setEditingUserId(null);
        setError("");
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        try {
            const payload = {
                ...form,
                department_id: form.department_id === 0 ? null : form.department_id
            };

            if (editingUserId) {
                const { password, ...updatePayload } = payload;
                const finalPayload = password ? payload : updatePayload;
                await api.adminUpdateUser(editingUserId, finalPayload);
            } else {
                if (!payload.password) throw new Error("كلمة المرور مطلوبة");
                await api.adminCreateUser(payload as any);
            }
            await loadData();
            closeModal();
        } catch (err: any) {
            setError(err.message || "حدث خطأ غير متوقع");
        }
    }

    async function handleDelete(user: UserListItem) {
        setError("");

        if (user.id === currentUser?.id) {
            setError("لا يمكنك حذف حسابك الحالي.");
            return;
        }

        const confirmed = window.confirm(`حذف ${user.full_name}؟ لا يمكن التراجع عن هذه العملية.`);
        if (!confirmed) return;

        setDeletingUserId(user.id);
        try {
            await api.adminDeleteUser(user.id);
            await loadData();
        } catch (err: any) {
            setError(err.message || "تعذر حذف المستخدم");
        } finally {
            setDeletingUserId(null);
        }
    }

    if (loading && users.length === 0) return <div className="p-8">جار التحميل...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
                    <p className="text-sm text-gray-500 mt-1">عرض وإضافة وتعديل وحذف حسابات المستخدمين</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    إضافة مستخدم
                </button>
            </div>

            {error && !isModalOpen && (
                <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm text-right">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <td className="px-6 py-4">الاسم</td>
                            <td className="px-6 py-4">البريد الإلكتروني</td>
                            <td className="px-6 py-4">الدور</td>
                            <td className="px-6 py-4">القسم</td>
                            <td className="px-6 py-4">الحالة</td>
                            <td className="px-6 py-4 text-center">الإجراءات</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{u.full_name}</td>
                                <td className="px-6 py-4 text-gray-500" dir="ltr">{u.email}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{ROLE_LABELS[u.role_name] ?? u.role_name}</span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">{u.department_name || "-"}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {u.is_active ? "نشط" : "معطل"}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => openModal(u)}
                                        className="text-brand-600 hover:text-brand-800 text-sm font-medium"
                                    >
                                        تعديل
                                    </button>
                                    <button
                                        onClick={() => handleDelete(u)}
                                        disabled={deletingUserId === u.id || u.id === currentUser?.id}
                                        title={u.id === currentUser?.id ? "لا يمكنك حذف حسابك الحالي" : "حذف المستخدم"}
                                        className="text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                        {deletingUserId === u.id ? "جار الحذف..." : "حذف"}
                                    </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">لا يوجد مستخدمون</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingUserId ? "تعديل مستخدم" : "مستخدم جديد"}</h2>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded border border-red-200">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
                                <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" dir="ltr" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">الاسم الكامل</label>
                                <input type="text" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">{editingUserId ? "تغيير كلمة المرور اختياري" : "كلمة المرور"}</label>
                                <input type="password" required={!editingUserId} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" dir="ltr" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">الدور</label>
                                    <select value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                                        {roles.map(r => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] ?? r.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">القسم</label>
                                    <select value={form.department_id} onChange={e => setForm({ ...form, department_id: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm">
                                        <option value={0}>بدون قسم</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-4">
                                <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded text-brand-600 focus:ring-brand-500" />
                                <label htmlFor="active" className="text-sm">حساب نشط</label>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="submit" className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700">حفظ</button>
                                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
