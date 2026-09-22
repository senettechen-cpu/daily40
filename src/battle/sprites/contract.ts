// Runtime side of the sprite contract (handoff-assets/.../contract/FORMAT.md).
// Contracts are checked by scripts/validate-sprites.cjs at import time; this
// module only samples frames and resolves drawing, never re-validates.
export type Vec = [number, number];
export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }

export interface LayerRef { assetId: string; sourceRect: Rect; originalSize: Size; trimOffset: { x: number; y: number } }
export interface WeaponMount {
    equipmentSlot: 'primary' | 'secondary';
    weaponId: string;
    viewId: string;
    visible: boolean;
    originAnchor: string;
    position: Vec;
    rotationDeg: number;
}
export interface Frame {
    index: number;
    keyPose: string;
    anchors: Record<string, Vec | null>;
    layers: Record<string, LayerRef | null>;
    weapons: { held: WeaponMount | null; stowed: WeaponMount[] };
    drawOrder: string[];
    markers: { kind: 'visual'; name: string; phase: number }[];
}
export interface WeaponView { id: string; weaponId: string; assetId: string; viewKind: string; originalSize: Size; trimOffset: { x: number; y: number }; sourceRect: Rect; anchors: Record<string, Vec | null> }
export interface SpriteContract {
    action: ActionId;
    direction: string;
    timing: { mode: 'clock' | 'distance-phase' | 'engine-action'; loop: boolean; nominalDurationMs: number; durationWeights: number[] };
    frameCount: number;
    assets: { id: string; path: string; width: number; height: number }[];
    weaponViews: WeaponView[];
    frames: Frame[];
}

export const ACTION_IDS = ['idle', 'move', 'enter-cover', 'peek', 'fire', 'exit-cover', 'reload', 'swap-to-secondary', 'swap-to-primary', 'pistol-fire', 'hit', 'down'] as const;
export type ActionId = typeof ACTION_IDS[number];

export interface ActorSprites {
    id: string;
    direction: string;
    baseUrl: string; // prefix for asset paths, ends with '/'
    actions: Record<ActionId, SpriteContract>;
}

export const CANVAS = 192;
export const GROUND: Vec = [96, 176];

/** Frame index for progress 0..1 through an action, honouring per-frame duration weights. */
export function frameAtProgress(contract: SpriteContract, progress: number): number {
    const p = Math.max(0, Math.min(1, progress));
    let acc = 0;
    for (let i = 0; i < contract.frameCount; i++) {
        acc += contract.timing.durationWeights[i];
        if (p < acc - 1e-9) return i;
    }
    return contract.frameCount - 1;
}

/** Looping clock animation (idle); uses the contract's nominal duration only because idle has no engine duration. */
export const frameAtClock = (contract: SpriteContract, elapsedMs: number) =>
    frameAtProgress(contract, (elapsedMs % contract.timing.nominalDurationMs) / contract.timing.nominalDurationMs);

/** Gait frame from distance walked: the cycle advances only when the unit actually moves. */
export const frameAtDistance = (contract: SpriteContract, walked: number, strideTiles: number) =>
    frameAtProgress(contract, (walked / strideTiles) % 1);

const viewOf = (contract: SpriteContract, id: string) => contract.weaponViews.find(v => v.id === id);

/** A point in weapon-view coordinates placed into the character canvas: position + R(rotation) × (p − origin). */
export function mountPoint(mount: WeaponMount, view: WeaponView, p: Vec): Vec {
    const origin = view.anchors[mount.originAnchor]!;
    const r = mount.rotationDeg * Math.PI / 180;
    const dx = p[0] - origin[0], dy = p[1] - origin[1];
    return [mount.position[0] + Math.cos(r) * dx - Math.sin(r) * dy, mount.position[1] + Math.sin(r) * dx + Math.cos(r) * dy];
}

/** Muzzle of the visible held weapon in character-canvas pixels, or null (holstered, dropped, no muzzle). */
export function muzzleOf(contract: SpriteContract, frame: Frame): Vec | null {
    const held = frame.weapons.held;
    if (!held?.visible) return null;
    const view = viewOf(contract, held.viewId);
    const muzzle = view?.anchors.muzzle;
    return view && muzzle ? mountPoint(held, view, muzzle) : null;
}

export type DrawItem =
    | { kind: 'layer'; key: string; assetPath: string; asset: Size; source: Rect; x: number; y: number }
    | { kind: 'weapon'; key: string; assetPath: string; asset: Size; source: Rect; x: number; y: number; translate: Vec; rotate: number; weaponId: string; viewKind: string };

/** Resolves a frame's drawOrder into back-to-front draw items in character-canvas pixels. */
export function drawItems(contract: SpriteContract, frame: Frame): DrawItem[] {
    const asset = (id: string) => contract.assets.find(a => a.id === id)!;
    const items: DrawItem[] = [];
    for (const ref of frame.drawOrder) {
        if (ref.startsWith('layer:')) {
            const layer = frame.layers[ref.slice(6)];
            if (!layer) continue;
            const a = asset(layer.assetId);
            items.push({ kind: 'layer', key: ref, assetPath: a.path, asset: a, source: layer.sourceRect, x: layer.trimOffset.x, y: layer.trimOffset.y });
            continue;
        }
        const mount = ref === 'weapon:held' ? frame.weapons.held : frame.weapons.stowed[Number(ref.split(':')[2])];
        const view = mount && viewOf(contract, mount.viewId);
        if (!mount?.visible || !view) continue;
        const origin = view.anchors[mount.originAnchor]!;
        const a = asset(view.assetId);
        items.push({
            kind: 'weapon', key: ref, assetPath: a.path, asset: a, source: view.sourceRect,
            x: view.trimOffset.x - origin[0], y: view.trimOffset.y - origin[1],
            translate: mount.position, rotate: mount.rotationDeg, weaponId: mount.weaponId, viewKind: view.viewKind,
        });
    }
    return items;
}

/** Weapon the character visibly holds in this frame (null while hands are empty, e.g. mid-swap or down). */
export const heldWeaponId = (frame: Frame) => (frame.weapons.held?.visible ? frame.weapons.held.weaponId : null);

/** Builds actor sprites from an already-parsed manifest and contracts (browser fetch or test fs). */
export function buildActorSprites(id: string, baseUrl: string, manifest: { direction: string; actions: { action: string; path: string }[] }, contracts: Record<string, SpriteContract>): ActorSprites {
    const actions = {} as Record<ActionId, SpriteContract>;
    for (const entry of manifest.actions) {
        if (!(ACTION_IDS as readonly string[]).includes(entry.action)) continue;
        actions[entry.action as ActionId] = contracts[entry.path];
    }
    const missing = ACTION_IDS.filter(a => !actions[a]);
    if (missing.length) throw new Error(`${id} 缺少動作：${missing.join(', ')}`);
    return { id, direction: manifest.direction, baseUrl, actions };
}
