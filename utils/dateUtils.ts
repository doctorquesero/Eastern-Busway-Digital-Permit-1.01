const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const formatDateTime = (value: string | undefined): string => {
    if (!value) return '';
    if (ISO_DATE.test(value)) {
        const [year, month, day] = value.split('-');
        return `${day}/${month}/${year} (time not recorded)`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

// Returns a strict YYYY-MM-DD string, or '' for empty/invalid input (accepts ISO datetimes by truncating).
export const toDateInputValue = (value: unknown): string => {
    if (typeof value !== 'string' || !value) return '';
    const day = value.length >= 10 ? value.slice(0, 10) : value;
    return ISO_DATE.test(day) ? day : '';
};

// Parses and formats strictly as YYYY-MM-DD in UTC so Safari never sees a non-ISO string or a timezone shift.
export const addDaysISO = (isoDate: unknown, days: number): string => {
    const base = toDateInputValue(isoDate);
    if (!base) return '';
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};
