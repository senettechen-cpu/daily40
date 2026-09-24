export type Faction = 'nurgle' | 'khorne' | 'tzeentch' | 'slaanesh' | 'orks' | 'necrons' | 'default';

export interface Task {
    id: string;
    title: string;
    faction: Faction;
    difficulty: number; // 1-5
    dueDate: Date;
    createdAt: Date;
    status: 'active' | 'completed' | 'failed';
    isRecurring?: boolean; // 每日固定任務
    lastCompletedAt?: Date; // 上次完成日期
    streak?: number; // 連續達成次數
    dueTime?: string; // 每日截止時間 "HH:mm"
    /** Several times of day for one recurring task; replaces dueTime when set. */
    dueTimes?: string[];
    /** Times already completed for `slotsDay`; earlier days are stale and ignored. */
    slotsDone?: string[];
    slotsDay?: string; // YYYY-MM-DD
    ascensionCategory?: AscensionCategory;
    subCategory?: string; // 子項目描述 (e.g. "跑步 5km")
}

export type AscensionCategory = 'exercise' | 'learning' | 'cleaning' | 'parenting';

export interface AstartesResources {
    adamantium: number; // 運動 -> Wolf Guard
    neuroData: number;  // 學習 -> Imperial Fists
    puritySeals: number; // 整潔 -> Grey Knights
    geneLegacy: number; // 育嬰 -> Salamanders
}

export interface RitualActivity {
    id: string;
    name: string;
    category: AscensionCategory;
    baseDifficulty: number;
}

export interface AstartesState {
    resources: AstartesResources;
    unlockedImplants: string[];
    completedStages: number[]; // 1, 2, 3, 4
    ritualActivities?: Record<AscensionCategory, RitualActivity[]>; // Dynamic ritual list
}



export interface Resources {
    rp: number; // 帝皇之怒
    glory: number; // 榮耀值
}

export interface Unit {
    id: string;
    name: string;
    cost: number;
    description: string;
    icon?: React.ReactNode;
}

export interface SubTask {
    id: string;
    title: string;
    completed: boolean;
}

export interface Project {
    id: string;
    title: string;
    month: string; // e.g., "M31.005"
    difficulty: number;
    subTasks: SubTask[];
    completed: boolean;
    /** v1.5: exactly three designated subtasks pay a milestone reward. */
    milestoneIds?: string[];
}

export type UnitType = 'guardsmen' | 'space_marine' | 'custodes' | 'dreadnought' | 'baneblade' | 'wolf_guard' | 'phalanx_warder' | 'purifier' | 'pyroclast' | 'redemptor_dreadnought';

export interface ArmyStrength {
    reserves: Record<UnitType, number>;
    garrisons: Record<string, Record<UnitType, number>>; // e.g. "M1": { guardsmen: 10, ... }
    totalActivePower: number; // Sum of all garrisons' power (Effective Defense)
}

export type PlanetaryTraitType = 'hive' | 'forge' | 'death' | 'shrine' | 'barren';

export interface SectorTrait {
    month: string;
    type: PlanetaryTraitType;
}

export type BattleResult = 'victory' | 'defeat';


export type SectorHistory = Record<string, BattleResult>; // e.g. "M1": "victory"

export interface GameState {
    id: string;
    resources: Resources;
    corruption: number;
    currentMonth: number;
    isPenitentMode: boolean;
    armyStrength: ArmyStrength;
    sectorHistory: SectorHistory;
    ownedUnits: string[];
    astartes?: AstartesState;
    campaign?: import('../game/campaign').CampaignState;
    notificationEmail?: string;
    emailEnabled?: boolean;
}
