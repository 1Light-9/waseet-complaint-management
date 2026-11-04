"use client";
import React from "react";

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

// ── Time formatting ──────────────────────────────────────────────────────────

export function formatSlaTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return "";
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = Math.floor(abs % 60);

    if (h > 0) return `${h} س ${m} د`;
    if (m > 0) return `${m} د ${s} ث`;
    return `${s} ث`;
}

export function slaTimeLabel(
    seconds: number | null | undefined,
    status: string
): string {
    if (seconds === null || seconds === undefined) return "";
    if (status === "BREACHED") return `متأخرة بـ ${formatSlaTime(seconds)}`;
    return `متبقي ${formatSlaTime(seconds)}`;
}

// ── Badge ────────────────────────────────────────────────────────────────────

interface SlaBadgeProps {
    sla?: SlaDetail | null;
    /** show the smaller time label beside the badge */
    showTime?: boolean;
}

const CONFIG = {
    ON_TRACK: { label: "ضمن الوقت", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300", dot: "bg-emerald-500" },
    NEAR_BREACH: { label: "قريبة من التأخير", bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", dot: "bg-amber-500" },
    BREACHED: { label: "متأخرة", bg: "bg-red-100", text: "text-red-700", border: "border-red-300", dot: "bg-red-500" },
};

export default function SlaBadge({ sla, showTime = true }: SlaBadgeProps) {
    if (!sla) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                بدون SLA
            </span>
        );
    }

    const overall = sla.overall ?? "ON_TRACK";
    const cfg = CONFIG[overall] ?? CONFIG.ON_TRACK;

    // pick the resolve channel for time display if available, otherwise response
    const channel = sla.resolve ?? sla.response;
    const timeText =
        showTime && channel
            ? slaTimeLabel(channel.remaining_seconds, channel.status)
            : "";

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
            title={timeText}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
            {timeText && (
                <span className="font-normal opacity-75">· {timeText}</span>
            )}
        </span>
    );
}
