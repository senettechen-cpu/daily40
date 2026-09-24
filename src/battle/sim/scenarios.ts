import type { BattleSetup, CrewProfile, EnemySpawn } from './engine';

// Reproducible phase-1 test situations. The same scenario, lanes and seed always
// produce the same battle, so a reported problem can be replayed exactly.
export interface Scenario {
    id: string;
    name: string;
    description: string;
    seed: number;
    enemies: EnemySpawn[];
    lanes: number[]; // default deployment; the player may change it
}

export const SCENARIOS: Scenario[] = [
    {
        id: 'standard',
        name: '標準交火',
        description: '六名卡迪安對六名持槍叛軍，雙方各自進入掩體後交火。檢查：不無故衝鋒、掩體擋彈、換彈節奏。',
        seed: 40126,
        enemies: [{ x: 14, y: 1, order: 'hold' }, { x: 15, y: 2, order: 'hold' }, { x: 14, y: 4, order: 'hold' }, { x: 15, y: 5, order: 'hold' }, { x: 14, y: 7, order: 'hold' }, { x: 15, y: 8, order: 'hold' }],
        lanes: [1, 2, 4, 5, 7, 8],
    },
    {
        id: 'close-assault',
        name: '近身突擊',
        description: '兩名叛軍奉命突擊貼身，其餘在後方射擊。檢查：被貼身才切手槍、切換完成才改傷害與裝備欄、脫離後換回步槍。',
        seed: 7342,
        enemies: [{ x: 4, y: 3, order: 'assault' }, { x: 4, y: 6, order: 'assault' }, { x: 14, y: 2, order: 'hold' }, { x: 14, y: 5, order: 'hold' }, { x: 15, y: 7, order: 'hold' }],
        lanes: [1, 2, 4, 5, 7, 8],
    },
    {
        id: 'outnumbered',
        name: '以寡擊眾',
        description: '六名卡迪安對八名叛軍，其中一名突擊。檢查：死亡與倒地時動作正確中止、失敗結算不扣資源。',
        seed: 90210,
        enemies: [{ x: 14, y: 1, order: 'hold' }, { x: 15, y: 2, order: 'hold' }, { x: 14, y: 3, order: 'hold' }, { x: 15, y: 4, order: 'hold' }, { x: 14, y: 6, order: 'hold' }, { x: 15, y: 7, order: 'hold' }, { x: 14, y: 8, order: 'hold' }, { x: 9, y: 4, order: 'assault' }],
        lanes: [1, 2, 4, 5, 7, 8],
    },
];

export const setupFor = (scenario: Scenario, lanes = scenario.lanes, seed = scenario.seed, crew?: CrewProfile[]): BattleSetup =>
    ({ lanes, enemies: scenario.enemies, seed, crew });
