import { CSSProperties } from 'react';
import { Flag } from 'lucide-react';
import { BattleResult } from '../types';
import { sectorPlanetArt } from '../data/reportArtIndex';

interface SectorNodeProps {
    month: string; index: number; active: boolean; past: boolean; result?: BattleResult;
    trait: { name: string; color: string; effect: string }; count: number; completed: number;
    /** World type, which decides the planet art; the art follows the type, not the month. */
    traitId: string;
    fortified: boolean; onClick: () => void;
}
export function SectorNode(props: SectorNodeProps) {
    const { month, index, active, past, result, trait, traitId, count, completed, fortified, onClick } = props;
    const percent = count ? completed / count * 100 : 0;
    // GPT's art carries its own light and shade, so the CSS globe is a fallback
    // for a missing file rather than a layer underneath it.
    const planet = sectorPlanetArt(traitId, 96);
    const planet2x = sectorPlanetArt(traitId, 192);
    return <button type="button" className={`sector-node ${active ? 'sector-node--active' : ''} ${past ? 'sector-node--past' : ''}`} style={{ '--planet-color': trait.color, '--sector-progress': `${percent}%` } as CSSProperties} onClick={onClick} aria-label={`${month}，${trait.name}，${completed}/${count} 專案完成`}>
        <div className="sector-node__top"><span>{String(index + 1).padStart(2, '0')} / SECTOR</span><span>{active ? '目前戰區' : past ? (result === 'victory' ? '戰役勝利' : result === 'defeat' ? '戰役失守' : '已推進') : '後續戰區'}</span></div>
        <div className="sector-node__planet">{planet
            ? <img className="sector-node__globe" src={planet} srcSet={`${planet} 1x, ${planet2x} 2x`} alt="" width={90} height={90} loading="lazy" />
            : <div className="sector-node__sphere" />}<svg className="sector-node__orbit" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" pathLength="100" /><circle cx="60" cy="60" r="55" pathLength="100" strokeDasharray={`${percent} 100`} /></svg>{fortified && <span className="sector-node__fort"><Flag size={14} /></span>}</div>
        <div className="sector-node__info"><h3>{month} <span>{trait.name.replace(/ \(Lv\d\)/, '')}</span></h3><p title={trait.effect}>專案完成 {completed} / {count}</p></div>
    </button>;
}
