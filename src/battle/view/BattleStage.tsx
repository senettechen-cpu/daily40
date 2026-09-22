import { COVER, WALLS, type Point } from '../../expedition/engine';
import { project } from '../../expedition/presentation';
import type { Battle, BattleEvent, Unit } from '../sim/engine';
import { TICKS_PER_SECOND, WEAPONS } from '../sim/rules';
import { drawItems, GROUND, heldWeaponId, muzzleOf, type Vec } from '../sprites/contract';
import type { BattleArt } from '../sprites/loader';
import { flinch, poseFor, type Pose } from './animation';

// Character canvases (192 px, ~120 px tall figure) are drawn at this scale on the
// original 850×570 stage, giving the ~80 px battlefield height from the art spec.
export const SPRITE_SCALE = 0.68;
const SHOT_VISIBLE_TICKS = 5;
const bg = `${import.meta.env.BASE_URL}expedition/imperial-ruins-v1.png`;

const toWorld = (at: Point, local: Vec): Vec => {
    const p = project(at);
    return [p.x + (local[0] - GROUND[0]) * SPRITE_SCALE, p.y + (local[1] - GROUND[1]) * SPRITE_SCALE];
};

function Cropped({ href, asset, source, x, y }: { href: string; asset: { width: number; height: number }; source: { x: number; y: number; width: number; height: number }; x: number; y: number }) {
    return <svg x={x} y={y} width={source.width} height={source.height} viewBox={`${source.x} ${source.y} ${source.width} ${source.height}`} overflow="hidden">
        <image href={href} width={asset.width} height={asset.height} />
    </svg>;
}

function SpriteActor({ unit, pose, at, baseUrl, t, selected, onSelect }: { unit: Unit; pose: Pose; at: Point; baseUrl: string; t: number; selected: boolean; onSelect?: (id: string) => void }) {
    const p = project(at);
    const shake = unit.active === 'secondary' ? flinch(unit, t) * 2 : 0;
    const alive = unit.hp > 0;
    return <g transform={`translate(${p.x} ${p.y})`} data-unit={unit.id} data-action={pose.action} data-frame={pose.frameIndex}
        data-held-weapon={heldWeaponId(pose.frame) ?? 'none'} data-active-weapon={unit.loadout[unit.active]} onClick={onSelect ? () => onSelect(unit.id) : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
        <ellipse cy="2" rx={alive ? 15 : 24} ry="6" fill="#02080b" opacity=".5" />
        {selected && <ellipse cy="2" rx="19" ry="8" fill="none" stroke="#e8d18f" strokeWidth="1.5" />}
        <g transform={`translate(${-shake} 0) scale(${SPRITE_SCALE}) translate(${-GROUND[0]} ${-GROUND[1]})`} opacity={alive ? 1 : 0.8}>
            {drawItems(pose.contract, pose.frame).map(item => item.kind === 'layer'
                ? <Cropped key={item.key} href={baseUrl + item.assetPath} asset={item.asset} source={item.source} x={item.x} y={item.y} />
                : <g key={item.key} transform={`translate(${item.translate[0]} ${item.translate[1]}) rotate(${item.rotate})`} data-weapon-layer={item.weaponId} data-view-kind={item.viewKind}>
                    <Cropped href={baseUrl + item.assetPath} asset={item.asset} source={item.source} x={item.x} y={item.y} />
                </g>)}
        </g>
        {alive && <g>
            <rect x="-16" y="-94" width="32" height="4" rx="2" fill="#071012" />
            <rect x="-16" y="-94" width={32 * unit.hp / unit.maxHp} height="4" rx="2" fill={unit.side === 'crew' ? '#add6b0' : '#d98879'} />
        </g>}
        <text y="17" textAnchor="middle" className="bt-name" fill={unit.side === 'crew' ? '#d8ded0' : '#d4a08c'}>{unit.name}</text>
    </g>;
}

function Wall({ at }: { at: Point }) {
    const p = project(at), h = 38;
    return <g transform={`translate(${p.x} ${p.y})`} data-terrain="wall">
        <path d="M-27 0L0 -14L42 5L13 22Z" fill="#000" opacity=".3" />
        <path d={`M-27 0V${-h}L0 ${-h + 13}V13Z`} fill="#575448" stroke="#1d2930" />
        <path d={`M0 13V${-h + 13}L27 ${-h}V0Z`} fill="#373b34" stroke="#1d2930" />
        <path d={`M-27 ${-h}L0 ${-h - 13}L27 ${-h}L0 ${-h + 13}Z`} fill="#827c66" stroke="#a4aaa0" strokeWidth=".5" />
    </g>;
}

/** GPT sandbag art is authored relative to a figure standing one tile west (−x) of the cover tile. */
function CoverLayer({ at, href }: { at: Point; href: string }) {
    const p = project({ x: at.x - 1, y: at.y });
    return <g transform={`translate(${p.x} ${p.y}) scale(${SPRITE_SCALE}) translate(${-GROUND[0]} ${-GROUND[1]})`} data-terrain="sandbags">
        <image href={href} x="0" y="22" width="192" height="192" />
    </g>;
}

function ShotEffect({ event, battle, t, poses, reduced }: { event: Extract<BattleEvent, { kind: 'shot' }>; battle: Battle; t: number; poses: Map<string, { pose: Pose; at: Point }>; reduced: boolean }) {
    const age = t - event.tick;
    if (age < 0 || age > SHOT_VISIBLE_TICKS) return null;
    const shooter = poses.get(event.sourceId), target = poses.get(event.targetId);
    const muzzle = shooter && muzzleOf(shooter.pose.contract, shooter.pose.frame);
    const from: Vec = shooter && muzzle ? toWorld(shooter.at, muzzle) : [project(event.from).x, project(event.from).y - 45];
    const hitLocal = target?.pose.frame.anchors.hitPoint;
    let to: Vec = target && hitLocal ? toWorld(target.at, hitLocal) : [project(event.to).x, project(event.to).y - 40];
    if (event.outcome === 'cover') {
        const shooterTile = battle.units.find(u => u.id === event.sourceId)?.tile ?? event.from;
        const bag = COVER.filter(c => Math.hypot(c.x - event.to.x, c.y - event.to.y) <= 1.05).sort((a, b) => Math.hypot(a.x - shooterTile.x, a.y - shooterTile.y) - Math.hypot(b.x - shooterTile.x, b.y - shooterTile.y))[0];
        if (bag) to = [project(bag).x, project(bag).y - 12];
    } else if (event.outcome === 'miss') to = [to[0] + 10, to[1] - 14];
    const fade = 1 - age / SHOT_VISIBLE_TICKS;
    const pistol = event.weapon === 'laspistol';
    return <g opacity={fade} data-shot={event.id} data-outcome={event.outcome} data-weapon={event.weapon} pointerEvents="none">
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={pistol ? '#ffb48a' : '#ff8a70'} strokeWidth={pistol ? 1.4 : 2} strokeLinecap="round" />
        {!reduced && <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#fff3d6" strokeWidth=".8" />}
        <circle cx={from[0]} cy={from[1]} r={reduced ? 2 : 4 * fade + 1.5} fill="#ffe2b0" />
        {event.outcome === 'cover' && <circle cx={to[0]} cy={to[1]} r={4 + age} fill="#b9a17e" opacity=".55" />}
        {event.outcome === 'hit' && <>
            <circle cx={to[0]} cy={to[1]} r="2.5" fill="#ffdd9a" />
            <text x={to[0]} y={to[1] - 10 - (reduced ? 0 : age * 2)} textAnchor="middle" className="bt-damage" fill="#f1dfbc">−{event.amount}</text>
        </>}
        {event.outcome !== 'hit' && <text x={to[0]} y={to[1] - 10} textAnchor="middle" className="bt-damage" fill="#a7b3b0">{event.outcome === 'cover' ? '擊中掩體' : '未命中'}</text>}
    </g>;
}

export function BattleStage({ battle, previous, fraction, art, reduced, selectedId, onSelect }: {
    battle: Battle; previous: Battle; fraction: number; art: BattleArt; reduced: boolean; selectedId: string | null; onSelect: (id: string) => void;
}) {
    const t = battle.tick + (battle.status === 'running' ? fraction : 0);
    const prevUnits = new Map(previous.units.map(u => [u.id, u]));
    const poses = new Map<string, { pose: Pose; at: Point }>();
    const items: { depth: number; key: string; node: JSX.Element }[] = [];
    for (const u of battle.units) {
        const before = prevUnits.get(u.id);
        const at = before && !reduced ? { x: before.pos.x + (u.pos.x - before.pos.x) * fraction, y: before.pos.y + (u.pos.y - before.pos.y) * fraction } : u.pos;
        const sprites = u.faction === 'cadian' ? art.cadian : art.traitor;
        const pose = poseFor(u, t, sprites);
        poses.set(u.id, { pose, at });
        items.push({ depth: at.x + at.y, key: u.id, node: <SpriteActor unit={u} pose={pose} at={at} baseUrl={sprites.baseUrl} t={t} selected={selectedId === u.id} onSelect={u.side === 'crew' ? onSelect : undefined} /> });
    }
    for (const w of WALLS) items.push({ depth: w.x + w.y, key: `wall-${w.x}-${w.y}`, node: <Wall at={w} /> });
    for (const c of COVER) {
        const anchorDepth = c.x - 1 + c.y;
        items.push({ depth: anchorDepth - 0.05, key: `cover-back-${c.x}-${c.y}`, node: <CoverLayer at={c} href={art.coverBack} /> });
        items.push({ depth: anchorDepth + 0.05, key: `cover-front-${c.x}-${c.y}`, node: <CoverLayer at={c} href={art.coverFront} /> });
    }
    items.sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
    const shots = battle.events.filter((e): e is Extract<BattleEvent, { kind: 'shot' }> => e.kind === 'shot' && t - e.tick <= SHOT_VISIBLE_TICKS);
    const seconds = (battle.tick / TICKS_PER_SECOND).toFixed(1);
    return <svg className="bt-stage" viewBox="0 0 850 570" role="img" aria-label={`帝國廢墟戰場測試 · ${seconds} 秒`} data-tick={battle.tick} data-status={battle.status}>
        <image href={bg} width="850" height="570" preserveAspectRatio="xMidYMid slice" />
        <rect width="850" height="570" fill="#061011" opacity=".12" />
        {items.map(i => <g key={i.key}>{i.node}</g>)}
        {shots.map(e => <ShotEffect key={e.id} event={e} battle={battle} t={t} poses={poses} reduced={reduced} />)}
        <text x="24" y="30" fill="#c3b88c" fontSize="11" letterSpacing="3">BATTLE TEST · 卡迪安 SE × 叛軍 NW</text>
        <text x="24" y="48" fill="#899b92" fontSize="10">{seconds}s · 雷射步槍 {WEAPONS.lasgun.damage} 傷／雷射手槍 {WEAPONS.laspistol.damage} 傷 · 候選美術 productionReady=false</text>
    </svg>;
}
