// Helper functions to map backend enums to Arabic UI labels

export function formatStatus(value: string | null | undefined): string {
    if (!value) return "-";
    const statusMap: Record<string, string> = {
        "NEW": "جديدة",
        "IN_PROGRESS": "قيد المعالجة",
        "WAITING_USER": "بانتظار المستخدم",
        "RESOLVED": "تم الحل",
        "CLOSED": "مغلقة",
    };
    return statusMap[value.toUpperCase()] || value;
}

export function formatPriority(value: string | null | undefined): string {
    if (!value) return "-";
    const priorityMap: Record<string, string> = {
        "LOW": "منخفضة",
        "MEDIUM": "متوسطة",
        "HIGH": "عالية",
        "URGENT": "عاجلة",
    };
    return priorityMap[value.toUpperCase()] || value;
}

export function formatSlaStatus(value: string | null | undefined): string {
    if (!value) return "-";
    const slaMap: Record<string, string> = {
        "ON_TRACK": "ضمن الوقت",
        "NEAR_BREACH": "قريبة من التأخير",
        "AT_RISK": "معرضة للتأخير",
        "BREACHED": "متأخرة",
    };
    return slaMap[value.toUpperCase()] || value;
}

export function formatDepartment(value: string | null | undefined): string {
    if (!value) return "-";
    return value.trim() || "-";
}

export function formatCategory(value: string | null | undefined): string {
    if (!value) return "-";
    return value.trim() || "-";
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return "-";
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return "-";
        
        return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date);
    } catch (e) {
        return value;
    }
}
