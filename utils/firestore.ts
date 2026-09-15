export const sanitizeForFirestore = <T>(value: T): T => {
    if (value === undefined) return undefined as T;
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
        return value
            .map(item => sanitizeForFirestore(item))
            .filter(item => item !== undefined) as T;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        if (entry !== undefined) sanitized[key] = sanitizeForFirestore(entry);
    });
    return sanitized as T;
};
