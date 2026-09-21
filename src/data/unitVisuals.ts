import { UnitType } from '../types';

export const UNIT_COSTS: Record<UnitType, number> = {
    guardsmen: 300, space_marine: 1500, custodes: 4500, dreadnought: 100, baneblade: 2000,
    wolf_guard: 2000, phalanx_warder: 2000, purifier: 2000, pyroclast: 2000, redemptor_dreadnought: 10000,
};

// Matches the combat engine; shared by recruitment, reserves and the sector preview.
export const UNIT_POWER: Record<UnitType, number> = {
    guardsmen: 50, space_marine: 300, custodes: 1500, dreadnought: 500, baneblade: 5000,
    wolf_guard: 400, phalanx_warder: 400, purifier: 400, pyroclast: 400, redemptor_dreadnought: 2000,
};

export const UNIT_VISUALS: Record<UnitType | 'librarian' | 'barge', { name: string; image?: string; color: string; role: string; sigil: string }> = {
    guardsmen: { name: '帝國衛隊', image: '/units/guardsman.png', color: '#a7b88c', role: '戰線步兵', sigil: 'line' },
    space_marine: { name: '星際戰士', image: '/units/marine.png', color: '#7caed5', role: '重裝突擊', sigil: 'shield' },
    custodes: { name: '帝皇禁軍', image: '/units/custodes.png', color: '#dfbc72', role: '精銳守護', sigil: 'crown' },
    dreadnought: { name: '無畏機甲', image: '/units/dreadnought.png', color: '#b5bec9', role: '裝甲支援', sigil: 'machine' },
    baneblade: { name: '帝皇毒刃', image: '/units/baneblade.png', color: '#d98b76', role: '超重型裝甲', sigil: 'machine' },
    wolf_guard: { name: '野狼守衛', image: '/units/marine.png', color: '#a4c9da', role: '飛昇增援 · 野狼', sigil: 'fang' },
    phalanx_warder: { name: '方陣護衛', image: '/units/marine.png', color: '#e5c65e', role: '飛昇增援 · 方陣', sigil: 'shield' },
    purifier: { name: '淨化者', image: '/units/marine.png', color: '#d6d9ea', role: '飛昇增援 · 聖焰', sigil: 'star' },
    pyroclast: { name: '火龍戰士', image: '/units/marine.png', color: '#8ebc8b', role: '飛昇增援 · 火龍', sigil: 'flame' },
    redemptor_dreadnought: { name: '原鑄無畏', image: '/units/dreadnought.png', color: '#bd9add', role: '飛昇增援 · 終階', sigil: 'crown' },
    librarian: { name: '智庫館長', image: '/units/marine.png', color: '#bfa0df', role: '靈能支援', sigil: 'star' },
    barge: { name: '戰鬥駁船', color: '#88c5cf', role: '軌道支援', sigil: 'ship' },
};

export const BASE_UNITS: UnitType[] = ['guardsmen', 'space_marine', 'custodes', 'dreadnought', 'baneblade'];
export const getRecruitmentCost = (type: UnitType, hive: boolean) =>
    type === 'guardsmen' && hive ? Math.floor(UNIT_COSTS[type] * 0.8) : UNIT_COSTS[type];

export const getGarrisonPower = (garrison: Partial<Record<UnitType, number>>, ownedUnits: string[] = []) =>
    (Object.keys(UNIT_POWER) as UnitType[]).reduce((total, type) => total + (garrison[type] || 0) * UNIT_POWER[type], 0)
    + (ownedUnits.includes('librarian') ? 1000 : 0) + (ownedUnits.includes('barge') ? 10000 : 0);
