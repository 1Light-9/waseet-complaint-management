"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AIAssistantRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/app/complaints/new");
    }, [router]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-8 text-sm text-slate-500">
            يتم فتح المساعد الذكي داخل صفحة الشكوى الجديدة...
        </div>
    );
}
