const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
