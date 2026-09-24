// A recurring task may hold several times of day instead of one, so "drink water
// every two hours" is set up once rather than re-entered all day. Each slot is
// completed on its own; the day counts as met only when every slot is done.

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTime = (value: unknown): value is string =>
    typeof value === 'string' && TIME_PATTERN.test(value);

export const minutesOf = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

export const formatTime = (minutes: number): string => {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** Times are stored sorted and deduplicated, so display and progress agree. */
export const normalizeSlots = (times: unknown): string[] => {
    if (!Array.isArray(times)) return [];
    const kept = times.filter(isTime);
    return [...new Set(kept)].sort((a, b) => minutesOf(a) - minutesOf(b));
};

export const MAX_SLOTS = 24;

/**
 * Every slot from `start` to `end` at `intervalMinutes`, inclusive of `end` when
 * it lands on the interval. An end before the start is read as running past
 * midnight, so 22:00–02:00 still produces a run of slots.
 */
export function generateSlots(start: string, end: string, intervalMinutes: number): string[] {
    if (!isTime(start) || !isTime(end) || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return [];

    const from = minutesOf(start);
    const span = (minutesOf(end) - from + 1440) % 1440;
    const times: string[] = [];
    for (let offset = 0; offset <= span && times.length < MAX_SLOTS; offset += intervalMinutes) {
        times.push(formatTime(from + offset));
    }
    return normalizeSlots(times);
}

/** Completed times for today, limited to times the task actually holds. */
export const doneSlots = (slots: string[], done: unknown): string[] =>
    normalizeSlots(done).filter(time => slots.includes(time));

/** The earliest slot still outstanding today, or null when the day is met. */
export function nextSlot(slots: string[], done: unknown): string | null {
    const settled = new Set(doneSlots(slots, done));
    return slots.find(time => !settled.has(time)) ?? null;
}

export const slotProgress = (slots: string[], done: unknown) =>
    ({ done: doneSlots(slots, done).length, total: slots.length });

/** True once every slot of the day is done; a task with no slots is never "met". */
export const slotsMet = (slots: string[], done: unknown): boolean =>
    slots.length > 0 && doneSlots(slots, done).length === slots.length;

/** Adds one completion, which is always the earliest outstanding slot. */
export function completeNextSlot(slots: string[], done: unknown): string[] | null {
    const next = nextSlot(slots, done);
    if (!next) return null;
    return normalizeSlots([...doneSlots(slots, done), next]);
}

/**
 * Slots that fell due in the last `windowMinutes` and are still outstanding and
 * unannounced. The window rather than an exact match means a cycle that drifts,
 * or a server that was briefly down, still sends the reminder once instead of
 * missing it silently or replaying the whole day on restart.
 */
export function dueReminders(
    slots: string[], done: unknown, reminded: unknown, nowMinutes: number, windowMinutes = 10,
): string[] {
    const settled = new Set(doneSlots(slots, done));
    const announced = new Set(normalizeSlots(reminded));
    return slots.filter(time => {
        if (settled.has(time) || announced.has(time)) return false;
        const age = nowMinutes - minutesOf(time);
        return age >= 0 && age <= windowMinutes;
    });
}
