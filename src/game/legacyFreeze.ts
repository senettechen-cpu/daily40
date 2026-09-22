// Legacy penalties frozen by user decision (docs/v1.5-economy-decisions.md §3, 2026-09-21):
// no per-minute corruption, no garrison attrition, no extermination-order lock screen.
// Stored corruption stays as read-only history; D2 (missed daily cores) replaces it later.
// If this is ever turned back on, reset lastCorruptionTick first — otherwise the offline
// catch-up would charge the entire frozen period at once.
export const LEGACY_PENALTIES_FROZEN = true;

// Armory items that may still be bought with RP. The servo skull was removed: it marked a
// random real-life task as completed, and the game must never change life data.
export const ARMORY_ITEM_IDS = ['theme_khorne', 'rosarius', 'theme_gold'] as const;
export type ArmoryItemId = typeof ARMORY_ITEM_IDS[number];
export const isArmoryItem = (id: string): id is ArmoryItemId => (ARMORY_ITEM_IDS as readonly string[]).includes(id);
