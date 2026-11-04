"use client";

import Link from "next/link";
import {
    Activity,
    ArrowRight,
    BarChart3,
    Bell,
    Bot,
    BrainCircuit,
    CheckCircle2,
    Clock3,
    FileText,
    LayoutDashboard,
    MessagesSquare,
    Network,
    Route,
    ShieldCheck,
    Sparkles,
} from "lucide-react";

const analytics = [
    { label: "إجمالي التذاكر", value: "1,248", change: "+18%", icon: FileText, color: "text-blue-600" },
    { label: "قيد المعالجة", value: "342", change: "+9%", icon: Activity, color: "text-violet-600" },
    { label: "تم حلها", value: "862", change: "+24%", icon: CheckCircle2, color: "text-emerald-600" },
    { label: "متأخرة", value: "24", change: "-6%", icon: Clock3, color: "text-red-600" },
];

const features = [
    { title: "تصنيف ذكي للتذاكر", text: "تصنيف الشكاوى والاستفسارات حسب النية والأولوية والتصنيف.", icon: BrainCircuit },
    { title: "توجيه ذكي", text: "توجيه التذاكر إلى القسم أو الموظف المناسب باستخدام قواعد العمل وإشارات الذكاء الاصطناعي.", icon: Route },
    { title: "تتبع SLA", text: "متابعة أهداف الاستجابة والحل قبل أن تتعرض مستويات الخدمة للخطر.", icon: Clock3 },
    { title: "لوحة تحليلات", text: "قياس الأداء التشغيلي والاختناقات وجودة الخدمة لحظيًا.", icon: BarChart3 },
    { title: "اقتراحات ردود ذكية", text: "صياغة ردود أسرع وأكثر اتساقًا اعتمادًا على سياق الشكوى.", icon: MessagesSquare },
    { title: "تنبيهات فورية", text: "إبقاء الفرق على اطلاع بالتنبيهات المهمة وتحديثات الإسناد والتصعيد.", icon: Bell },
];

const tickets = [
    { id: "#1048", subject: "طلب صلاحية VPN", owner: "الدعم التقني", status: "جديدة", color: "#2563EB" },
    { id: "#1047", subject: "استفسار عن مسير الرواتب", owner: "الموارد البشرية", status: "تحت المراجعة", color: "#F59E0B" },
    { id: "#1046", subject: "مشكلة في وصول البريد", owner: "البريد الإلكتروني", status: "قيد المعالجة", color: "#8B5CF6" },
    { id: "#1045", subject: "تحديث بيانات الملف الشخصي", owner: "خدمة الموظفين", status: "بانتظار المستخدم", color: "#EAB308" },
    { id: "#1044", subject: "بطاقة دخول المكتب", owner: "الخدمات العامة", status: "مغلقة", color: "#10B981" },
];

const trendData = [
    { day: "ن", tickets: 84, resolved: 68 },
    { day: "ث", tickets: 102, resolved: 76 },
    { day: "ر", tickets: 96, resolved: 88 },
    { day: "خ", tickets: 124, resolved: 104 },
    { day: "ج", tickets: 118, resolved: 112 },
    { day: "س", tickets: 76, resolved: 72 },
    { day: "ح", tickets: 94, resolved: 86 },
];

const categoryData = [
    { name: "طلبات", value: 42, color: "#2563EB" },
    { name: "شكاوى", value: 31, color: "#06B6D4" },
    { name: "استفسارات", value: 27, color: "#10B981" },
];

function DashboardPreview({ compact = false }: { compact?: boolean }) {
    return (
        <div className="mx-auto w-full max-w-6xl rounded-lg border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-950">مركز قيادة وسيط</p>
                        <p className="text-xs text-slate-500">ملخص العمليات الذكية</p>
                    </div>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                    <button className="rounded-lg border border-slate-200 p-2 text-slate-500">
                        <Bell className="h-4 w-4" />
                    </button>
                    <Link href="/login" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                        فتح المنصة
                    </Link>
                </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                <aside className="hidden border-r border-slate-200 bg-slate-950 p-4 text-white lg:block">
                    <div className="space-y-2 text-sm">
                        {[
                            ["لوحة التحكم", LayoutDashboard],
                            ["التذاكر", FileText],
                            ["الذكاء الاصطناعي", Bot],
                            ["التحليلات", BarChart3],
                        ].map(([label, Icon]) => (
                            <div key={label as string} className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 first:bg-blue-600 first:text-white">
                                <Icon className="h-4 w-4" />
                                <span>{label as string}</span>
                            </div>
                        ))}
                    </div>
                </aside>

                <div className="bg-slate-50 p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {analytics.map((item) => (
                            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between">
                                    <item.icon className={`h-5 w-5 ${item.color}`} />
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{item.change}</span>
                                </div>
                                <p className="mt-4 text-2xl font-bold text-slate-950">{item.value}</p>
                                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-950">تدفق التذاكر</p>
                                    <p className="text-xs text-slate-500">الواردة مقابل المحلولة</p>
                                </div>
                                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">مباشر</span>
                            </div>
                            <div className={compact ? "h-44" : "h-56"}>
                                <div className="flex h-full items-end gap-2 border-b border-slate-200 pb-2">
                                    {trendData.map((item) => (
                                        <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                            <div className="flex h-32 w-full items-end justify-center gap-1">
                                                <span
                                                    className="w-2 rounded-t bg-blue-600"
                                                    style={{ height: `${Math.max(24, item.tickets)}px` }}
                                                />
                                                <span
                                                    className="w-2 rounded-t bg-emerald-500"
                                                    style={{ height: `${Math.max(20, item.resolved)}px` }}
                                                />
                                            </div>
                                            <span className="text-[11px] font-medium text-slate-500">{item.day}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <p className="text-sm font-semibold text-slate-950">التصنيف الذكي</p>
                            <p className="text-xs text-slate-500">توزيع التذاكر حسب النوع</p>
                            <div className={compact ? "h-44" : "h-56"}>
                                <div className="flex h-full flex-col items-center justify-center gap-4">
                                    <div
                                        className="h-32 w-32 rounded-full"
                                        style={{ background: "conic-gradient(#2563EB 0 42%, #06B6D4 42% 73%, #10B981 73% 100%)" }}
                                    >
                                        <div className="m-auto flex h-full w-full items-center justify-center rounded-full p-4">
                                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-950">
                                                98%
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid w-full grid-cols-3 gap-2">
                                        {categoryData.map((entry) => (
                                            <div key={entry.name} className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                                {entry.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {!compact && (
                        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-950">التذاكر ذات الأولوية</p>
                                <span className="text-xs font-medium text-blue-600">عرض الكل</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[680px] text-right text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">التذكرة</th>
                                            <th className="px-4 py-3 font-semibold">العنوان</th>
                                            <th className="px-4 py-3 font-semibold">المالك</th>
                                            <th className="px-4 py-3 font-semibold">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {tickets.map((ticket) => (
                                            <tr key={ticket.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-500">{ticket.id}</td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">{ticket.subject}</td>
                                                <td className="px-4 py-3 text-slate-600">{ticket.owner}</td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                                                        style={{ backgroundColor: ticket.color }}
                                                    >
                                                        {ticket.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function LandingPage() {
    return (
        <main className="bg-[#F1F5F9] text-slate-950" dir="rtl">
            <section className="relative overflow-hidden bg-[#0F172A] text-white">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
                <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                            <Network className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-base font-bold leading-none">وسيط</p>
                            <p className="text-xs text-slate-400">إدارة ذكية للشكاوى</p>
                        </div>
                    </Link>
                    <div className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
                        <a href="#features" className="hover:text-white">المزايا</a>
                        <a href="#ai" className="hover:text-white">الذكاء الاصطناعي</a>
                        <a href="#dashboard" className="hover:text-white">لوحة التحكم</a>
                    </div>
                    <Link href="/login" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100">
                        تسجيل الدخول
                    </Link>
                </nav>

                <div className="relative z-10 mx-auto max-w-7xl px-6 pb-10 pt-14 text-center sm:pt-20">
                    <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
                        <Sparkles className="h-4 w-4" />
                        شكاوى وطلبات واستفسارات مدعومة بالذكاء الاصطناعي
                    </div>
                    <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-normal sm:text-6xl">
                        إدارة أذكى للشكاوى والطلبات
                    </h1>
                    <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
                        منصة مدعومة بالذكاء الاصطناعي تساعد المؤسسات على إدارة الشكاوى والطلبات والاستفسارات بكفاءة عبر التوجيه الذكي والتتبع والتحليلات.
                    </p>
                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500">
                            تجربة المنصة
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <a href="#features" className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">
                            استكشاف المزايا
                        </a>
                    </div>
                    <div className="mt-12">
                        <DashboardPreview compact />
                    </div>
                </div>
            </section>

            <section id="features" className="mx-auto max-w-7xl px-6 py-20">
                <div className="max-w-2xl">
                    <p className="text-sm font-semibold text-blue-600">مزايا المنصة</p>
                    <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">عمليات تذاكر مؤسسية مصممة لفرق العمل الحديثة.</h2>
                </div>
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature) => (
                        <div key={feature.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                <feature.icon className="h-5 w-5" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-950">{feature.title}</h3>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{feature.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="ai" className="border-y border-slate-200 bg-white">
                <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
                    <div>
                        <p className="text-sm font-semibold text-cyan-600">قدرات الذكاء الاصطناعي</p>
                        <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">من الاستقبال إلى الحل، يبقى الذكاء الاصطناعي داخل سير العمل.</h2>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            يحلل وسيط كل تذكرة، ويقترح المالك المناسب، وينبه لمخاطر SLA، ويساعد الموظفين على الرد باتساق.
                        </p>
                        <div className="mt-8 space-y-3">
                            {["اكتشاف النية وتقييم الأولوية", "ثقة التوجيه وملاءمة القسم", "مسودات ردود مبنية على المعرفة الداخلية"].map((item) => (
                                <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/20">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                                <Bot className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">مساعد وسيط الذكي</p>
                                <p className="text-xs text-slate-400">تصنيف مقترح</p>
                            </div>
                        </div>
                        <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-sm leading-6 text-slate-300">
                                هذا الاستفسار يبدو كطلب صلاحيات تقنية. المسار المقترح: الدعم التقني، صلاحيات الحساب، أولوية عالية.
                            </p>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            {["ثقة 94%", "SLA: 4 ساعات", "التوجيه التلقائي جاهز"].map((item) => (
                                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs font-semibold text-slate-200">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section id="dashboard" className="mx-auto max-w-7xl px-6 py-20">
                <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                    <div className="max-w-2xl">
                        <p className="text-sm font-semibold text-blue-600">معاينة لوحة التحكم</p>
                        <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">مركز قيادة لقادة الخدمة.</h2>
                    </div>
                    <p className="max-w-lg text-sm leading-6 text-slate-600">
                        راقب قوائم الانتظار، واكتشف التأخير، وقارن أداء الحل، وتدخل قبل انخفاض مستوى الخدمة.
                    </p>
                </div>
                <DashboardPreview />
            </section>

            <section className="bg-slate-950 text-white">
                <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        ["78%", "تصنيف أسرع"],
                        ["42k", "تذكرة معالجة"],
                        ["99.9%", "استقرار سير العمل"],
                        ["12", "فريق متصل"],
                    ].map(([value, label]) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
                            <p className="text-3xl font-bold">{value}</p>
                            <p className="mt-2 text-sm text-slate-400">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-20">
                <div className="rounded-lg bg-[#0F172A] px-6 py-12 text-center text-white sm:px-10">
                    <ShieldCheck className="mx-auto h-10 w-10 text-cyan-300" />
                    <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-bold">جاهز لتحديث عمليات الشكاوى؟</h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                        امنح الفرق مساحة عمل ذكية واحدة لتصنيف كل طلب وتوجيهه وتتبع وحله بثقة.
                    </p>
                    <Link href="/login" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">
                        تجربة المنصة
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            <footer className="border-t border-slate-200 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
                    <p className="font-semibold text-slate-900">وسيط</p>
                    <p>منصة ذكية لإدارة الشكاوى والطلبات.</p>
                </div>
            </footer>
        </main>
    );
}
