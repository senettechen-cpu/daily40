// Calendar helpers evaluated in the user's time zone, never the device clock's zone.
export const DEFAULT_TIME_ZONE = 'Asia/Taipei';

function parts(at: Date, timeZone: string) {
    const format = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    return Object.fromEntries(format.formatToParts(at).map(p => [p.type, p.value])) as Record<string, string>;
}

/** Calendar day as `YYYY-MM-DD`; string comparison matches chronological order. */
export function dayKey(at: Date, timeZone = DEFAULT_TIME_ZONE): string {
    const p = parts(at, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
}

export function minutesOfDay(at: Date, timeZone = DEFAULT_TIME_ZONE): number {
    const p = parts(at, timeZone);
    return Number(p.hour) * 60 + Number(p.minute);
}

export function addDays(day: string, days: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + days));
    return next.toISOString().slice(0, 10);
}
