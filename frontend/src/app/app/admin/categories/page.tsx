"use client";

import { useState, useEffect } from "react";
import { api, Category, Department } from "@/lib/api";

export default function AdminCategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [filterDept, setFilterDept] = useState<number>(0);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState({
        name: "",
        department_id: 0,
        description: "",
    });

    useEffect(() => {
        loadData();
    }, [filterDept]);

    async function loadData() {
        setLoading(true);
        try {
            const [deptsRes, catsRes] = await Promise.all([
                api.departments(),
                api.categories(filterDept || undefined)
            ]);
            setDepartments(deptsRes.items || []);
            setCategories(catsRes.items || []);
        } catch (err: any) {
            setError(err.message || "تعذر تحميل البيانات");
        } finally {
            setLoading(false);
        }
    }

    function openModal(cat?: Category) {
        if (cat) {
            setEditingId(cat.id);
            setForm({
                name: cat.name,
                department_id: cat.department_id,
                description: "",
            });
        } else {
            setEditingId(null);
            setForm({
                name: "",
                department_id: filterDept || (departments.length > 0 ? departments[0].id : 0),
                description: "",
            });
        }
        setIsModalOpen(true);
        setError("");
    }

    function closeModal() {
        setIsModalOpen(false);
        setEditingId(null);
        setError("");
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!form.department_id) {
            setError("اختر القسم");
            return;
        }

        try {
            if (editingId) {
                await api.adminUpdateCategory(editingId, form);
            } else {
                await api.adminCreateCategory(form);
            }
            await loadData();
            closeModal();
        } catch (err: any) {
            setError(err.message || "حدث خطأ غير متوقع");
        }
    }

    async function handleDelete(id: number) {
        if (!window.confirm("هل أنت متأكد من حذف هذا التصنيف؟")) return;
        
        setError("");
        try {
            await api.adminDeleteCategory(id);
            await loadData();
        } catch (err: any) {
            setError(err.message || "حدث خطأ أثناء الحذف");
        }
    }

    if (loading && categories.length === 0) return <div className="p-8">جار التحميل...</div>;

    const getDeptName = (id: number) => departments.find(d => d.id === id)?.name || "غير معروف";

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">إدارة التصنيفات</h1>
                    <p className="text-sm text-gray-500 mt-1">عرض وإضافة تصنيفات الشكاوى لكل قسم</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    إضافة تصنيف
                </button>
            </div>

            <div className="mb-6 flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">تصفية حسب القسم:</span>
                <select
                    value={filterDept}
                    onChange={e => setFilterDept(Number(e.target.value))}
                    className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]"
                >
                    <option value={0}>كل الأقسام</option>
                    {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
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
                            <td className="px-6 py-4 w-24">ID</td>
                            <td className="px-6 py-4">اسم التصنيف</td>
                            <td className="px-6 py-4">القسم المرتبط</td>
                            <td className="px-6 py-4 w-48 text-center">الإجراءات</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {categories.map(c => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-gray-500">{c.id}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                                <td className="px-6 py-4 text-gray-500">
                                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">{getDeptName(c.department_id)}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => openModal(c)}
                                            className="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-md text-xs font-medium transition-colors"
                                        >
                                            تعديل
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(c.id)}
                                            className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md text-xs font-medium transition-colors"
                                        >
                                            حذف
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {categories.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">لا توجد تصنيفات</td>
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
                            <h2 className="text-xl font-bold">{editingId ? "تعديل تصنيف" : "تصنيف جديد"}</h2>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded border border-red-200">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">القسم</label>
                                <select
                                    required
                                    value={form.department_id}
                                    onChange={e => setForm({ ...form, department_id: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value={0} disabled>اختر القسم</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">اسم التصنيف</label>
                                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">الوصف اختياري</label>
                                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}></textarea>
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
