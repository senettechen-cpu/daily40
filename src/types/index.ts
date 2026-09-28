export type Faction = 'nurgle' | 'khorne' | 'tzeentch' | 'slaanesh' | 'orks' | 'necrons' | 'default';

/** Where a one-off task stands for a subtask of an operation plan. */
export interface SubTaskLink { projectId: string; subTaskId: string }

/**
 * What the add/edit dialog hands back (2026-09-28). It replaced ten positional
 * arguments threaded through three layers: the ninth and tenth were being
 * dropped silently by a handler that only named eight, which cost a multi-slot
 * task its slots. Faction and difficulty are not here at all - they mean
 * nothing now and the store fills its own placeholders.
 */
export interface TaskDraft {
    title: string;
    dueDate: Date;
    isRecurring: boolean;
    /** The day's nominal deadline; the first slot when there are several. */
    dueTime?: string;
    /** Times of day for a daily task. */
    dueTimes?: string[];
    /** Days of the month, 1-31; set makes a recurring task monthly, not daily. */
    monthDays?: number[];
    domain?: import('../../shared/ascension').Domain;
    subCategory?: string;
    link?: SubTaskLink;
}

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
    /**
     * Days of the month a recurring task falls on, 1-31 (2026-09-28).
     * Absent or empty keeps the old meaning of isRecurring: every day.
     * A day past the end of a short month lands on its last day.
     */
    monthDays?: number[];
    ascensionCategory?: AscensionCategory;
    subCategory?: string; // 子項目描述 (e.g. "跑步 5km")
    /**
     * Growth domain (2026-09-27): replaces the enemy faction and the 1-5
     * difficulty, neither of which did anything. Carried into the ascension
     * designation so a task arrives with its domain already set.
     */
    domain?: import('../../shared/ascension').Domain;
    /** A one-off task deployed from an operation plan's subtask; completing it ticks the subtask. */
    projectId?: string;
    subTaskId?: string;
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
    createdAt?: string;
    /** Closing is final (2026-09-27): a sealed plan is read-only. */
    sealedAt?: string | null;
    crate?: ProjectCrate | null;
}

/** What closing an operation plan drew from its supply crate. */
export interface ProjectCrate {
    projectId: string;
    difficulty: number;
    rarity: 'common' | 'fine' | 'rare' | 'legendary';
    kind: 'equipment' | 'character';
    catalogId?: string;
    templateId?: string;
    veteran: boolean;
    itemId?: string;
    characterId?: string;
    name?: string;
    openedAt: string;
}

export interface CloseProjectResult {
    sealedAt: string;
    crate: ProjectCrate | null;
    reason: string | null;
    alreadySealed: boolean;
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
