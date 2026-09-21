import { useEffect, useRef, useState } from 'react';
import { BEACON, COVER, CREW, WALLS, type Actor, type Battle, type Effect, type Point, activeWeapon, type CombatWeaponId } from './engine';
import { effectAge, IMPACT_DELAY, project, visibleHealth, motionPoint, type MotionTrack } from './presentation';
import './cinematic.css';
import { GuardSprite } from './GuardSprite';

type FigureActor = Pick<Actor, 'side' | 'role' | 'weapon' | 'facing' | 'hp' | 'sidearm'>;
export function DetailedWeapon({ type }: { type: CombatWeaponId }) {
    if (type === 'laspistol') return <g stroke="#182328" strokeWidth="1.2"><path d="M-4 -5H17V2H5L3 11H-3L0 1H-4Z" fill="#818a76" /><path d="M17 -3h6v3h-6" fill="#beb7a1" /><path d="M3 -3h10" stroke="#f5aa85" /></g>;
    return <g stroke="#17222a" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M-7 -2L0 -7H15V3H-5Z" fill="#505c60" /><path d="M1 3L-1 11H4L7 3" fill="#27353e" />
        {type === 'flamer' ? <><path d="M12 -6H33L37 -2V4H12Z" fill="#b18b4e" /><path d="M18 -6v10M24 -6v10M30 -6v10" stroke="#6a512f" /><path d="M33 -4h12v7H33" fill="#555d61" /><rect x="11" y="5" width="12" height="12" rx="4" fill="#c9aa62" /><path d="M10 12Q-12 15 -14 -8" fill="none" stroke="#363e39" strokeWidth="3" /><circle cx="45" cy="0" r="2" fill="#ffc85d" stroke="none" /></> :
        type === 'longlas' ? <><path d="M12 -5h19v8H12Z" fill="#6b7779" /><path d="M30 -3h23v3H30" fill="#a6b7b8" /><rect x="12" y="-12" width="16" height="5" rx="2" fill="#313e48" /><path d="M17 -7v3M24 -7v3" stroke="#94acb5" /><circle cx="28" cy="-10" r="2" fill="#b1e8f4" /></> :
        type === 'shotgun' ? <><path d="M13 -6h24v4H13ZM13 0h24v4H13Z" fill="#a2aaa7" /><path d="M11 -4h12v8H11Z" fill="#857052" /><path d="M14 -4v8M18 -4v8" stroke="#403a2d" /></> :
        <><path d="M12 -5h24v8H12Z" fill="#748078" /><path d="M16 3h8v9H16Z" fill="#313d40" /><path d="M35 -2h10v3H35" fill="#b6b8a0" /><path d="M16 -3h14" stroke="#a5b7ad" /><rect x="29" y="-4" width="3" height="2" fill="#e98470" stroke="none" /></>}
        <path d="M-5 -3H6" stroke="#9fa998" /><circle cx="8" cy="-1" r="1" fill="#d5ccb1" stroke="none" />
    </g>;
}
export function SoldierFigure({ actor, walk = 0, recoil = 0, hit = 0, aim = 0, fallen = 0, left = false, covered = false }: { actor: FigureActor; walk?: number; recoil?: number; hit?: number; aim?: number; fallen?: number; left?: boolean; covered?: boolean }) {
    const weapon = activeWeapon(actor);
    if (actor.side === 'crew') return <GuardSprite weapon={weapon} walking={walk} crouched={covered} recoil={recoil} hit={hit} fallen={fallen} left={left} gun={<DetailedWeapon type={weapon} />} />;
    const column = actor.role === 'raider' ? 0 : actor.role === 'officer' ? 2 : 1;
    return <g transform={`scale(${left ? -1 : 1} 1)`} data-faction="chaos-cult" data-sprite-pose={covered ? 'crouched' : 'standing'}>
        <g transform={`translate(${-recoil * 3} ${-Math.abs(walk) * 2}) rotate(${fallen * 78 + hit * 6} 0 -5)`}>
            <svg x="-29" y={covered ? -69 : -84} width="58" height={covered ? 70 : 86} style={{ width: 58, height: covered ? 70 : 86, overflow: 'hidden' }} viewBox={`${column * 418} ${covered ? 627 : 0} 418 627`} preserveAspectRatio="none">
                <image href="/expedition/cultists-v1.png" width="1254" height="1254" />
            </svg>
            {actor.role !== 'raider' && <g transform={`translate(16 ${covered ? -40 : -49}) rotate(${aim - recoil * 5}) scale(.65)`}><DetailedWeapon type={weapon} /></g>}
        </g>
    </g>;
}

function EffectDrawing({ event, age, reduced, source, target, sourceHeight = 33, targetHeight = 34 }: { event: Effect; age: number; reduced: boolean; source?: Point; target?: Point; sourceHeight?: number; targetHeight?: number }) {
    const start = project(source || event.from), end = project(target || event.to);
    start.y -= sourceHeight; end.y -= targetHeight;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const impact = age >= IMPACT_DELAY;
    const fade = Math.max(0, 1 - (age - IMPACT_DELAY) / .5);
    if (age > .8) return null;
    if (event.kind === 'heal') return <g opacity={fade}><ellipse cx={end.x} cy={end.y + 32} rx={18 + age * 14} ry={8 + age * 6} fill="none" stroke="#91e9b7" strokeWidth="2" /><path d={`M${end.x - 5} ${end.y - 8}h10M${end.x} ${end.y - 13}v10`} stroke="#aeffd0" strokeWidth="3" /><text x={end.x + 18} y={end.y - 20 - (reduced ? 0 : age * 24)} className="cinematic-damage" fill="#a9f4c5">+{event.amount}</text></g>;
    return <g>
        {!reduced && !event.melee && age < .15 && <g transform={`translate(${start.x} ${start.y}) rotate(${angle})`}><ellipse cx="24" rx="38" ry="24" fill="#ffb950" opacity=".12" /><path d="M20 0L36 -11L31 -2L53 0L31 3L36 11Z" fill="#ffcc75" /><path d="M23 0L39 -3L47 0L39 3Z" fill="#fff5bd" /></g>}
        {event.kind === 'flame' ? <g transform={`translate(${start.x} ${start.y}) rotate(${angle})`} opacity={fade}>
            <path d={`M23 0Q${length * .5} -18 ${length} -20Q${length + 25} 0 ${length} 20Q${length * .5} 18 23 0`} fill="#f97c29" opacity=".45" />
            {Array.from({ length: 7 }, (_, i) => { const t = ((age * 2 + i / 7) % 1); return <ellipse key={i} cx={25 + t * (length - 25)} cy={Math.sin(i * 4 + age * 13) * t * 12} rx={7 + t * 16} ry={4 + t * 9} fill={i % 2 ? '#ffc057' : '#f9e3a1'} opacity={(1 - t) * .75} />; })}
        </g> : event.melee ? !reduced && age < .35 && <path d={`M${end.x - 25} ${end.y - 30}Q${end.x + 45} ${end.y - 10} ${end.x - 3} ${end.y + 22}`} stroke="#eee5c6" strokeWidth={5 * fade} fill="none" opacity={fade} /> : age < IMPACT_DELAY && <g transform={`translate(${start.x} ${start.y}) rotate(${angle})`}>
            <path d={`M${Math.max(25, length * age / IMPACT_DELAY - 40)} 0H${Math.max(25, length * age / IMPACT_DELAY)}`} stroke={event.color} strokeWidth={event.weapon === 'longlas' ? 3 : 2} /><path d={`M${Math.max(25, length * age / IMPACT_DELAY - 15)} 0H${Math.max(25, length * age / IMPACT_DELAY)}`} stroke="#fff5d1" strokeWidth="1.5" />
            {event.weapon === 'shotgun' && [-1, 1].map(n => <path key={n} d={`M${length * age / IMPACT_DELAY - 8} ${n * age * 28}h10`} stroke="#e9d8aa" strokeWidth="2" />)}
        </g>}
        {impact && <g transform={`translate(${end.x} ${end.y})`}>
            {event.amount > 0 && <><ellipse cy="33" rx={12 + age * 24} ry={5 + age * 9} fill="#b9a17e" opacity={fade * .22} />{!reduced && <><circle r={7 * fade} fill="#ffdd8a" opacity={fade} />{Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${Math.cos(i * 1.7) * (age - .1) * 38} ${Math.sin(i * 1.7) * (age - .1) * 30}l${Math.cos(i * 1.7) * 9} ${Math.sin(i * 1.7) * 9}`} stroke={i % 2 ? '#ebbb65' : '#fcecc0'} strokeWidth="1.6" opacity={fade} />)}</>}</>}
            <text y={-18 - (reduced ? 0 : (age - IMPACT_DELAY) * 30)} textAnchor="middle" className="cinematic-damage" fill={event.amount ? '#f1dfbc' : '#a7b3b0'} opacity={fade}>{event.amount ? `−${event.amount}` : 'MISS'}</text>
        </g>}
    </g>;
}

function Crate({ x, y, cover = false }: { x: number; y: number; cover?: boolean }) {
    const p = project({ x, y }), h = cover ? 15 : 38;
    if (cover) return <g transform={`translate(${p.x} ${p.y})`} data-terrain="sandbags"><ellipse cy="7" rx="30" ry="14" fill="#090b09" opacity=".5" />{[0, 1, 2].map(row => <g key={row}>{[-1, 0, 1].map(i => <g key={i} transform={`translate(${i * 17 + (row % 2 ? 3 : 0)} ${i * 7 - row * 6})`}><path d="M-10 -4Q-12 -9 -3 -10L9 -4Q15 1 9 5L-2 2Z" fill={row % 2 ? '#777361' : '#656451'} stroke="#353a30" strokeWidth="1" /><path d="M-7 -6L6 0" stroke="#a8a08a" strokeWidth=".7" opacity=".6" /></g>)}</g>)}</g>;
    return <g transform={`translate(${p.x} ${p.y})`}><path d="M-27 0L0 -14L42 5L13 22Z" fill="#000" opacity=".3" /><path d={`M-27 0V${-h}L0 ${-h + 13}V13Z`} fill={cover ? '#354e4c' : '#575448'} stroke="#1d2930" /><path d={`M0 13V${-h + 13}L27 ${-h}V0Z`} fill={cover ? '#263f3d' : '#373b34'} stroke="#1d2930" /><path d={`M-27 ${-h}L0 ${-h - 13}L27 ${-h}L0 ${-h + 13}Z`} fill={cover ? '#687b69' : '#827c66'} stroke="#a4aaa0" strokeWidth=".5" />
        <path d={`M-22 ${-h + 6}L-5 ${-h + 14}V7L-22 -1Z`} fill="none" stroke="#879080" opacity=".5" /><path d={`M5 ${-h + 14}L22 ${-h + 6}V-1L5 7Z`} fill="none" stroke="#7b8478" opacity=".4" />
        {!cover && <><path d="M-24 -25l21 10M-24 -12l21 10M4 -16l20 -10M4 -3l20 -10" stroke="#272e28" strokeWidth="1.5" /><path d="M-13 -30l4 9l-5 5l8 7M17 -31l-4 8l5 6" fill="none" stroke="#222c26" /><path d="M-23 -32l8 4m20 1l12 -6" stroke="#b5ab8d" opacity=".5" /></>}
    </g>;
}

export function CinematicBattlefield({ battle, paused, speed, reduced }: { battle: Battle; paused: boolean; speed: number; reduced: boolean }) {
    const latest = useRef({ previous: battle, current: battle, at: performance.now() });
    const tracks = useRef(new Map<string, MotionTrack>());
    const [phase, setPhase] = useState(0);
    useEffect(() => {
        const last = latest.current.current;
        if (battle.tick < last.tick || battle.tick - last.tick > 2) tracks.current.clear();
        for (const actor of battle.actors) {
            const track = tracks.current.get(actor.id);
            if (!track) tracks.current.set(actor.id, { from: actor, to: actor, start: battle.tick, end: battle.tick });
            else if (track.to.x !== actor.x || track.to.y !== actor.y) tracks.current.set(actor.id, {
                from: motionPoint(track, battle.tick), to: { x: actor.x, y: actor.y }, start: battle.tick, end: battle.tick + (actor.role === 'raider' ? 4 : 6),
            });
        }
        latest.current = { previous: battle.tick > last.tick && battle.tick - last.tick <= 2 ? last : battle, current: battle, at: performance.now() };
        setPhase(0);
    }, [battle]);
    useEffect(() => {
        if (paused || battle.status !== 'running' || battle.tick === 0) return;
        let frame = 0;
        const animate = () => { setPhase(Math.min(1, (performance.now() - latest.current.at) / 100)); frame = requestAnimationFrame(animate); };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [paused, battle.status, battle.tick === 0]);
    const fraction = phase * speed;
    const getPose = (a: Actor) => {
        const track = tracks.current.get(a.id);
        const point = reduced || !track ? a : motionPoint(track, battle.tick + fraction);
        const moving = !!track && battle.tick + fraction < track.end;
        return { point, moving };
    };
    const hits = battle.effects.filter(e => e.amount > 0 && e.kind !== 'heal' && effectAge(e, battle.tick, fraction) >= IMPACT_DELAY && effectAge(e, battle.tick, fraction) < .28);
    const heavyHit = hits.find(e => e.weapon === 'shotgun' || e.melee);
    const shake = !reduced && heavyHit ? Math.sin((effectAge(heavyHit, battle.tick, fraction) - IMPACT_DELAY) * 90) * 1.5 : 0;
    const ordered = [
        ...WALLS.map(p => ({ depth: p.x + p.y, key: `wall-${p.x}-${p.y}`, element: <Crate {...p} /> })),
        ...COVER.map(p => ({ depth: p.x + p.y - .2, key: `cover-${p.x}-${p.y}`, element: <Crate {...p} cover /> })),
        ...battle.actors.map(a => {
            const { point, moving } = getPose(a), p = project(point);
            const attack = [...battle.effects].reverse().find(e => e.sourceId === a.id && e.kind !== 'heal');
            const injury = [...battle.effects].reverse().find(e => e.targetId === a.id && e.amount > 0 && e.kind !== 'heal');
            const age = attack ? effectAge(attack, battle.tick, fraction) : 99;
            const injuryAge = injury ? effectAge(injury, battle.tick, fraction) : 99;
            const recoil = !reduced && age < .24 ? Math.sin(Math.min(1, age / .24) * Math.PI) : 0;
            const hit = !reduced && injuryAge >= IMPACT_DELAY && injuryAge < .4 ? 1 - (injuryAge - IMPACT_DELAY) / .24 : 0;
            const hp = visibleHealth(battle, a.id, fraction);
            const fallen = hp <= 0 ? reduced ? 1 : Math.max(0, Math.min(1, (injuryAge - IMPACT_DELAY) / .4)) : 0;
            const facingX = Math.cos(a.facing) - Math.sin(a.facing), facingY = (Math.cos(a.facing) + Math.sin(a.facing)) * .5;
            const left = facingX < 0, aim = Math.max(-30, Math.min(30, Math.atan2(facingY, Math.abs(facingX)) * 180 / Math.PI));
            return { depth: point.x + point.y + .1, key: a.id, element: <g transform={`translate(${p.x} ${p.y})`} data-actor={a.id} data-weapon={activeWeapon(a)} data-tactic={a.tactic} data-motion={hp <= 0 ? 'fallen' : recoil ? 'attack' : moving ? 'walk' : 'idle'}>
                <title>{a.name} · {Math.round(hp)}/{a.maxHp}</title><ellipse cy="3" rx={fallen ? 25 : 15} ry="7" fill="#02080b" opacity=".55" />
                {hp > 0 && <ellipse cy="2" rx="17" ry="8" fill="none" stroke={a.side === 'crew' ? '#95c5b1' : '#b87568'} opacity=".4" />}
                <g opacity={fallen >= 1 ? .45 : 1}><SoldierFigure actor={a} left={left} aim={aim} walk={!reduced && moving ? Math.sin((battle.tick + fraction) * 1.3) : 0} recoil={recoil} hit={hit} fallen={fallen} covered={a.tactic === 'covered' && !moving} /></g>
                {hp > 0 && <g><rect x="-18" y={a.tactic === 'covered' ? -72 : -91} width="36" height="4" rx="2" fill="#071012" /><rect x="-18" y={a.tactic === 'covered' ? -72 : -91} width={36 * hp / a.maxHp} height="4" rx="2" fill={a.side === 'crew' ? '#add6b0' : '#d98879'} /><text y="20" textAnchor="middle" className="cinematic-name" fill={a.side === 'crew' ? '#d8ded0' : '#c89784'}>{a.name}</text>{a.side === 'crew' && <text y="31" textAnchor="middle" className="cinematic-name" fill="#b5c4a1">{a.sidearm ? '副武器 · 低傷害還擊' : { covered: '掩體射擊', positioning: '轉移陣地', 'falling-back': '後撤拉距', firing: '定點射擊', overwatch: '警戒待敵', assault: '近戰突擊', objective: '操作信標' }[a.tactic]}</text>}</g>}
            </g> };
        }),
    ].sort((a, b) => a.depth - b.depth);
    const beacon = project(BEACON);
    return <svg className="cinematic-battlefield" viewBox="0 0 850 570" role="img" aria-label={`帝國工廠廢墟戰場，第 ${battle.wave} 波，信標 ${Math.floor(battle.beacon)}%`}>
        <defs><radialGradient id="cinematic-ambient"><stop stopColor="#36443b" /><stop offset="1" stopColor="#101b23" /></radialGradient><linearGradient id="cinematic-smoke" x2="0" y2="1"><stop stopColor="#bfc1a1" stopOpacity="0" /><stop offset="1" stopColor="#c4bea0" stopOpacity=".08" /></linearGradient><radialGradient id="cinematic-lamp"><stop stopColor="#f4c37f" stopOpacity=".32" /><stop offset="1" stopColor="#f4c37f" stopOpacity="0" /></radialGradient></defs>
        <image href="/expedition/imperial-ruins-v1.png" width="850" height="570" preserveAspectRatio="xMidYMid slice" /><rect width="850" height="570" fill="#061011" opacity=".15" />
        <g transform={`translate(${shake} ${-shake * .4})`}>
            {Array.from({ length: 160 }, (_, index) => { const x = index % 16, y = Math.floor(index / 16), p = project({ x, y }); const n = (index * 37) % 11; return <g opacity=".09" key={index} transform={`translate(${p.x} ${p.y})`}><path d="M-30 0L0 -15L30 0L0 15Z" fill={n < 3 ? '#3d4945' : n < 7 ? '#35423f' : '#303c3c'} stroke="#6b77634a" strokeWidth=".5" />{n < 4 && <path d="M-14 -1l8 -4m-2 7l16 5m-14 -1l7 -3" stroke="#87907c" strokeWidth=".5" opacity=".3" />}{y === 4 && <path d="M-19 5L-4 12L2 9L-13 2Z" fill="#b5a15e" opacity=".48" />}{n === 1 && <circle r=".9" cx="18" fill="#b3b39a" opacity=".4" />}</g>; })}
            {[{ x: 2, y: 0 }, { x: 8, y: 0 }, { x: 15, y: 9 }].map((pos, i) => { const p = project(pos); return <g key={i} transform={`translate(${p.x} ${p.y})`}><ellipse rx="55" ry="28" fill="url(#cinematic-lamp)" /><path d="M0 0v-48h10" fill="none" stroke="#4e5d5c" strokeWidth="4" /><rect x="4" y="-52" width="16" height="5" fill="#c5b889" /><rect x="6" y="-48" width="12" height="2" fill="#ffe2a0" /></g>; })}
            <g transform={`translate(${beacon.x} ${beacon.y})`}><ellipse rx="27" ry="14" fill="#84bfbe" opacity=".1" /><path d="M-16 0L0 -8L16 0L0 8Z" fill="#596b66" stroke="#aebf9f" /><path d="M-5 0L-3 -37L2 -46L7 -37L5 0Z" fill="#8e9e90" /><path d="M0 -35v-14M-8 -45l8 -5l9 5" stroke="#a8dcd5" fill="none" strokeWidth="2" /><circle cy="-33" r="3" fill={battle.beacon === 100 ? '#c7f39f' : '#a1dcdf'} /><text y="31" textAnchor="middle" className="cinematic-name" fill="#bdcbbb">信標 {Math.floor(battle.beacon)}%</text></g>
            {ordered.map(item => <g key={item.key}>{item.element}</g>)}
            {battle.effects.map(e => {
                const source = battle.actors.find(a => a.id === e.sourceId), target = battle.actors.find(a => a.id === e.targetId);
                return <EffectDrawing key={e.id} event={e} age={effectAge(e, battle.tick, fraction)} reduced={reduced} source={source && getPose(source).point} target={target && getPose(target).point} sourceHeight={source?.side === 'crew' ? source.tactic === 'covered' ? 41 : 59 : source?.tactic === 'covered' ? 40 : 49} targetHeight={target?.side === 'crew' ? target.tactic === 'covered' ? 40 : 55 : target?.tactic === 'covered' ? 40 : 49} />;
            })}
            <path d="M0 480Q200 405 370 490T850 450V570H0Z" fill="url(#cinematic-smoke)" pointerEvents="none" />
        </g>
        <text x="28" y="34" fill="#c3b88c" fontSize="11" letterSpacing="3">HELIOS / DEFILED MANUFACTORUM</text><text x="28" y="53" fill="#899b92" fontSize="9" letterSpacing="2">ASTRA MILITARUM VS CHAOS CULT</text>
        <g transform="translate(755 495)" stroke="#6c8780" fill="none"><path d="M0 25V-20M-14 -7L0 -20L14 -7M-25 12L25 -12" /><text x="0" y="-28" textAnchor="middle" fill="#9eafa2" stroke="none" fontSize="10">N</text></g>
    </svg>;
}
