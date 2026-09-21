import type { CombatWeaponId } from './engine';

// Four alpha-preserving atlas frames; all weapons remain independent equipment layers.
export function GuardSprite({ weapon, walking, crouched, recoil, hit, fallen, left, gun }: {
    weapon: CombatWeaponId; walking: number; crouched: boolean; recoil: number; hit: number; fallen: number; left: boolean; gun: React.ReactNode;
}) {
    const frame = crouched ? 1 : Math.abs(walking) > .01 ? walking > 0 ? 2 : 3 : 0;
    const ox = frame === 0 ? -53 : frame === 1 ? -45 : frame === 2 ? -54 : -42;
    const oy = frame < 2 ? -86 : -83;
    const grip = frame === 0 ? { x: 12, y: -59 } : frame === 1 ? { x: 5, y: -41 } : frame === 2 ? { x: 12, y: -47 } : { x: 5, y: -47 };
    return <g transform={`scale(${left ? -1 : 1} 1)`} data-sprite-pose={['standing', 'kneeling', 'step-left', 'step-right'][frame]} data-equipped-weapon={weapon}>
        <g transform={`translate(${-recoil * 2} ${-Math.abs(walking) * .6}) rotate(${fallen * 78 + hit * 5} 0 -5)`}>
            <svg x={ox} y={oy} width="90" height="90" style={{ width: 90, height: 90, overflow: 'hidden' }} viewBox={`${frame % 2 * 627} ${Math.floor(frame / 2) * 627} 627 627`} overflow="hidden">
                <image href="/expedition/cadian-poses-v1.png" x="0" y="0" width="1254" height="1254" />
            </svg>
            <g key={weapon} className="void-held-weapon" data-hand-weapon={weapon} transform={`translate(${grip.x - recoil * 2 + (weapon === 'laspistol' ? 8 : 0)} ${grip.y}) rotate(${-recoil * 4}) scale(${weapon === 'laspistol' ? 1 : .85})`}>{gun}</g>
            {weapon === 'laspistol' && <g data-sidearm-indicator="true" transform={left ? 'scale(-1 1)' : undefined}><rect x="-24" y="-104" width="48" height="14" rx="3" fill="#3b251c" stroke="#f6be70" /><text x="0" y="-94" textAnchor="middle" fontSize="8" fill="#ffdb98">副武器：手槍</text></g>}
            {hit > .1 && <ellipse cy={crouched ? -35 : -52} rx="8" ry="12" fill="#ffedc2" opacity={hit * .2} />}
        </g>
    </g>;
}
