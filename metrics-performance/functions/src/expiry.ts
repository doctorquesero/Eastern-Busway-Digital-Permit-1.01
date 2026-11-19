const TZ = 'Pacific/Auckland';
const DAY_MS = 86_400_000;

// Converts an Auckland wall-clock date (YYYY-MM-DD) and time (HH:MM) to the true UTC instant, DST-aware.
const aucklandWallClockToDate = (dateOnly: string, time: string): Date => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
  });
  const offsetAt = (utcMs: number): number => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(utcMs))) p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs;
  };
  let utcMs = wallAsUtc - offsetAt(wallAsUtc);
  utcMs = wallAsUtc - offsetAt(utcMs);
  return new Date(utcMs);
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate(); // Firestore Timestamp
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** Returns the permit's expiry instant, or null if missing/malformed (treated as not expired). */
export const getExpiryInstant = (data: any): Date | null => {
  const candidates = [
    { val: data.endDate, time: data.endTime },
    { val: data.expiryDate, time: data.expiryTime },
    { val: data.validTo, time: undefined }
  ];
  for (const { val, time } of candidates) {
    if (!val) continue;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
      const t = typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim() : '17:00';
      return aucklandWallClockToDate(val.trim(), t);
    }
    const d = toDate(val);
    if (d) return d;
  }
  return null;
};

export const daysOverdue = (expiry: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - expiry.getTime()) / DAY_MS));
