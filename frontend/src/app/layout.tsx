import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: {
        default: "وسيط",
        template: "%s | وسيط",
    },
    description:
        "منصة ذكية لإدارة الشكاوى والطلبات والاستفسارات داخل المؤسسات.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ar" dir="rtl">
            <body>{children}</body>
        </html>
    );
}
