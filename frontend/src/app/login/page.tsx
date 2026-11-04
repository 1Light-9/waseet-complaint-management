"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Network, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const data = await api.login(email, password);
            setToken(data.access_token);
            router.push("/app");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[#0F172A] text-white">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6" dir="rtl">
                <nav className="flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                            <Network className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-bold leading-none">وسيط</p>
                            <p className="text-xs text-slate-400">إدارة ذكية للشكاوى</p>
                        </div>
                    </Link>
                    <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white">
                        <ArrowRight className="h-4 w-4" />
                        الرئيسية
                    </Link>
                </nav>

                <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_460px]">
                    <section className="hidden max-w-2xl lg:block">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
                            <Sparkles className="h-4 w-4" />
                            مساحة عمل مؤسسية آمنة
                        </div>
                        <h1 className="text-5xl font-bold leading-tight tracking-normal">
                            إدارة أذكى للشكاوى والطلبات
                        </h1>
                        <p className="mt-5 text-lg leading-8 text-slate-300">
                            ادخل إلى وسيط لتصنيف الشكاوى وتوجيهها وتتبعها وإدارتها من مركز واحد مدعوم بالذكاء الاصطناعي.
                        </p>
                    </section>

                    <section className="rounded-lg border border-white/10 bg-white p-8 text-slate-950 shadow-2xl shadow-slate-950/30">
                        <div className="mb-8 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                <LockKeyhole className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">تسجيل الدخول إلى وسيط</h2>
                                <p className="text-sm text-slate-500">أدخل حسابك في المؤسسة.</p>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-700">
                                    البريد الإلكتروني
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="you@company.com"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label htmlFor="password" className="mb-1 block text-sm font-semibold text-slate-700">
                                    كلمة المرور
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="أدخل كلمة المرور"
                                    dir="ltr"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {loading ? "جار تسجيل الدخول..." : "تسجيل الدخول"}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </main>
    );
}
