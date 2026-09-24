// Legacy penalties frozen by user decision (docs/v1.5-economy-decisions.md §3, 2026-09-21):
// no per-minute corruption, no garrison attrition, no extermination-order lock screen.
// Stored corruption stays as read-only history; D2 (missed daily cores) replaces it later.
// If this is ever turned back on, reset lastCorruptionTick first — otherwise the offline
// catch-up would charge the entire frozen period at once.
export const LEGACY_PENALTIES_FROZEN = true;

// The RP armoury is retired. v1.5 replaced the "life rewards buy cosmetics" rule
// with one requisition wallet spent on equipment, so there is no longer any path
// that spends RP on an item — which also permanently settles the servo skull,
// the item that used to mark a random real-life task as completed.
