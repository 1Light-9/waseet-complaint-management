"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
    Building2,
    ClipboardList,
    FileText,
    FolderKanban,
    LayoutDashboard,
    LogOut,
    Network,
    PlusCircle,
    Sparkles,
    Users,
} from "lucide-react";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { api, UserMe } from "@/lib/api";
import { AppUserProvider } from "./AppUserContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<UserMe | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isAuthenticated()) {
            router.replace("/login");
            return;
        }
        api.me()
            .then(setUser)
            .catch(() => {
                clearToken();
                router.replace("/login");
            })
            .finally(() => setLoading(false));
    }, [router]);

    function handleLogout() {
        clearToken();
        router.push("/login");
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600" />
                    <p className="text-sm text-slate-500">جار تحميل النظام...</p>
                </div>
            </div>
        );
    }

    const role = user?.role.name ?? "";
    const isRequester = role === "Requester";
    const isAgent = role === "Agent";
    const isManager = role === "Manager";
    const isAdmin = role === "Admin";
    const roleLabel = {
        Admin: "مدير النظام",
        Manager: "مدير قسم",
        Agent: "موظف دعم",
        Requester: "مستخدم",
    }[role] ?? role;

    const navLinks = [
        { href: "/app", label: "لوحة التحكم", icon: LayoutDashboard, show: true },
        { href: "/app/complaints/new", label: "شكوى جديدة", icon: PlusCircle, show: isRequester },
        { href: "/app/complaints", label: isAdmin ? "كل الشكاوى" : "شكاواي", icon: ClipboardList, show: isRequester || isAdmin },
        { href: "/app/queue/assigned", label: "مهامي", icon: FolderKanban, show: isAgent },
        { href: "/app/queue/department", label: "شكاوى القسم", icon: Building2, show: isManager },
        { href: "/app/queue/assigned", label: "الشكاوى المسندة", icon: FolderKanban, show: isManager },
        { href: "/app/admin/users", label: "المستخدمون", icon: Users, show: isAdmin },
        { href: "/app/admin/departments", label: "الأقسام", icon: Building2, show: isAdmin },
        { href: "/app/admin/categories", label: "التصنيفات", icon: FolderKanban, show: isAdmin },
        { href: "/app/admin/docs", label: "قاعدة المعرفة", icon: FileText, show: isAdmin },
    ].filter(l => l.show);

    const seen = new Set<string>();
    const uniqueLinks = navLinks.filter(l => {
        if (seen.has(l.href + l.label)) return false;
        seen.add(l.href + l.label);
        return true;
    });

    const activePage = uniqueLinks.find(link => pathname === link.href)?.label ?? "النظام";

    return (
        <AppUserProvider user={user}>
            <div className="flex h-screen flex-row overflow-hidden bg-[#F1F5F9]" dir="rtl">
                <aside className="flex w-72 shrink-0 flex-col bg-[#0F172A] text-right text-white">
                    <div className="border-b border-white/10 p-5">
                        <Link href="/app" className="flex items-center gap-3 text-right">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                                <Network className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-base font-bold leading-none">وسيط</p>
                                <p className="text-xs text-slate-400">إدارة ذكية للشكاوى</p>
                            </div>
                        </Link>
                    </div>

                    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                        {uniqueLinks.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href + label}
                                    href={href}
                                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                                        isActive
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span className="flex-1 text-right">{label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-white/10 p-4">
                        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1 text-right">
                                    <p className="truncate text-sm font-semibold">{user?.full_name}</p>
                                    <p className="truncate text-xs text-slate-400">{user?.email}</p>
                                </div>
                            </div>
                            <span className="mt-3 inline-flex rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-100">
                                {roleLabel}
                            </span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="flex-1 text-right">تسجيل الخروج</span>
                        </button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
                        <div>
                            <p className="text-xs font-semibold text-blue-600">مساحة عمل وسيط</p>
                            <h1 className="mt-1 text-xl font-bold text-slate-950">{activePage}</h1>
                        </div>
                    </header>

                    <main className="min-w-0 flex-1 overflow-auto">
                        {children}
                    </main>
                </div>
            </div>
        </AppUserProvider>
    );
}
