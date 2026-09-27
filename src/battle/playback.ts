import type { Activation, BattleReplay } from '../../shared/battle/turn/types';

export type PlaybackPhase = 'aim' | 'fire' | 'impact';
export const FRAME_MS = { aim: 280, fire: 350, impact: 470 } as const;

/** Movement is an endpoint update, not an invented straight path through walls. */
export function frameState(replay: BattleReplay, completed: number, firing = false) {
    const events = replay.result.timeline;
    const index = Math.max(0, Math.min(events.length, completed));
    const previous = index > 0 ? events[index - 1] : undefined;
    const pending = events[index];
    const initial = replay.initialUnits.map(u => ({ id: u.id, at: u.at, hp: u.maxHp, down: false }));
    let snapshot = previous?.snapshot ?? initial;
    if (index === events.length) snapshot = replay.result.units;
    if (firing && pending) {
        const move = pending.activities.find(a => a.kind === 'move');
        if (move?.kind === 'move') snapshot = snapshot.map(u => u.id === pending.unitId ? { ...u, at: move.to } : u);
    }
    let barrage = null;
    for (const event of events.slice(0, index)) for (const a of event.activities) {
        if (a.kind === 'barrage-mark') barrage = a.at;
        if (a.kind === 'barrage') barrage = null;
    }
    return { snapshot, pending, barrage,
        board: index === events.length ? replay.result.finalBoard : previous?.board ?? replay.initialBoard };
}

export function eventDescription(event: Activation, names: Map<string, string>) {
    const target = (id: string) => names.get(id) ?? id;
    return event.activities.map(a => {
        switch (a.kind) {
            case 'attack': return `${a.weapon}${a.weaponSlot === 'sidearm' ? '（副武器）' : a.weaponSlot === 'unarmed' ? '（徒手）' : ''} → ${target(a.targetId)} · ${a.hits ? `命中 ${a.hits} 發／${a.damage} 傷害` : '未命中'}${a.skill ? ` · ${a.skill}` : ''}`;
            case 'heal': return `${a.skill} → ${target(a.targetId)} +${a.amount} HP`;
            case 'hazard': return `${target(a.targetId)} · 地形傷害 ${a.damage}`;
            case 'fortify': return `${a.skill} · 新增掩體`;
            case 'command': return `${a.skill} · ${a.targetIds.map(target).join('、')}`;
            case 'barrage': return `轟擊落點 · 波及 ${a.targetIds.length} 人`;
            case 'barrage-mark': return '轟擊預警 · 下回合結束落下';
            case 'move': return `轉移至 ${a.to.col + 1}–${a.to.row + 1}`;
            default: return '待命';
        }
    }).join(' ｜ ');
}
