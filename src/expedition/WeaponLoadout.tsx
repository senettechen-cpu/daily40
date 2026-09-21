import { activeWeapon, SIDEARM, WEAPONS, type Actor } from './engine';
import { DetailedWeapon } from './CinematicBattlefield';

export function WeaponLoadout({ actor }: { actor: Actor }) {
    const held = activeWeapon(actor);
    return <section className="void-weapon-slots" aria-label={`${actor.name}即時武器裝備`} data-held-weapon={held}>
        <p role="status">{actor.hp <= 0 ? '已倒地' : `目前手持：${actor.sidearm ? SIDEARM.name : WEAPONS[actor.weapon].name}`}</p>
        {([{ id: actor.weapon, label: '主武器', stats: WEAPONS[actor.weapon] }, { id: 'laspistol' as const, label: '副武器', stats: SIDEARM }]).map(slot => <div key={slot.label} className={`void-weapon-slot ${held === slot.id ? 'is-held' : ''}`} data-slot={slot.label}>
            <svg viewBox="-12 -20 80 45" aria-hidden="true"><DetailedWeapon type={slot.id} /></svg>
            <div><small>{slot.label} · {held === slot.id ? '手持中' : '收起'}</small><strong>{slot.stats.name}</strong><span>射程 {slot.stats.range} 格 · 傷害 {slot.stats.damage} / {slot.stats.interval / 10} 秒</span></div>
        </div>)}
        <small>副武器為本關每位人類士兵各自配發。貼身自動拔槍；脫離 2.5 格後切回主武器。拔槍 0.3 秒，換回 0.4 秒，原有冷卻不會跳過。</small>
    </section>;
}
