import type { Character, Duty } from './characters';
import { levelOf } from './characters';

// Specialties (user decisions 2026-09-27): three slots opening at levels 3, 6
// and 9, each a choice between two. Five groups: four for the Astra Militarum
// duties and one for graduated astartes. A pick is final; an empty slot does
// nothing. Graduation clears the human picks, and the soldier chooses again
// from the astartes group.
//
// Every effect changes how a soldier fights rather than adding a flat +10%
// damage (main spec §06): one option of a pair asks the soldier to stand
// still, dig in or stay near others, the other pays for moving or acting.
// Strengths are candidates measured with scripts/sim-battles.cjs.

export type SpecialtyGroup = 'assault' | 'precision' | 'support' | 'command' | 'astartes';

export const GROUP_LABELS: Record<SpecialtyGroup, string> = {
    assault: '突擊', precision: '精準', support: '支援', command: '指揮', astartes: '阿斯塔特',
};

/** The levels at which slots I, II and III open. */
export const SLOT_LEVELS = [3, 6, 9] as const;

/** What a specialty does, read by the battle loadout and engine. */
export type Effect =
    | { kind: 'steady-hit'; amount: number }            // + hit chance when the soldier did not move this turn
    | { kind: 'move'; amount: number }                  // + hexes of movement
    | { kind: 'moving-hit'; amount: number }            // + (negative) hit chance on a turn the soldier moved
    | { kind: 'close-damage'; amount: number; within: number } // × damage against targets this close
    | { kind: 'cover-guard'; amount: number }           // × damage taken while in cover
    | { kind: 'finisher'; amount: number }              // × damage against targets below half health
    | { kind: 'max-hp'; amount: number }                // × max health
    | { kind: 'skill-charge'; amount: number }          // − rounds of charge the duty skill needs
    | { kind: 'mobile-steady' }                         // a marksman keeps the steady range bonus after moving
    | { kind: 'penetration'; amount: number }           // + armour penetration
    | { kind: 'high-ground'; amount: number }           // + hit chance from high ground
    | { kind: 'first-shot'; amount: number }            // × damage on the soldier's first attack of the battle
    | { kind: 'hidden'; amount: number }                // − enemy hit chance against this soldier while in cover
    | { kind: 'field-aid'; amount: number }             // once a battle, heal the most hurt adjacent ally, no kit needed
    | { kind: 'shield-adjacent'; amount: number }       // × damage taken by adjacent allies
    | { kind: 'initiative'; amount: number }            // + initiative
    | { kind: 'heal-boost'; amount: number }            // × healing this soldier gives
    | { kind: 'coordination'; amount: number; range: number } // + hit for allies within range (its own aura, stacks with a sergeant's)
    | { kind: 'aura-hit'; amount: number }              // + to the sergeant's aura
    | { kind: 'aura-range'; amount: number }            // + hexes to the sergeant's aura
    | { kind: 'command-move'; amount: number }          // + hexes the sergeant's order grants
    | { kind: 'self-hit'; amount: number }              // + hit chance, always
    | { kind: 'aura-damage'; amount: number }           // × damage for allies inside the sergeant's aura
    | { kind: 'aura-guard'; amount: number }            // × damage taken by allies inside the sergeant's aura
    | { kind: 'bolt-damage'; amount: number }           // × damage with bolt weapons
    | { kind: 'armour'; amount: number }                // + armour
    | { kind: 'last-stand'; amount: number; below: number } // once a battle, heal when health falls below a share
    | { kind: 'damage-taken'; amount: number };         // × damage taken, always

export interface Specialty {
    id: string;
    group: SpecialtyGroup;
    /** 0, 1 or 2: slot I, II or III. */
    slot: number;
    name: string;
    description: string;
    effects: Effect[];
}

const s = (id: string, group: SpecialtyGroup, slot: number, name: string, description: string, ...effects: Effect[]): Specialty =>
    ({ id, group, slot, name, description, effects });

export const SPECIALTIES: Specialty[] = [
    // Assault: riflemen, flamers, plasma gunners and aspirants in training.
    s('steady-aim', 'assault', 0, '定點射擊', '這回合沒有移動時，命中 +8%。', { kind: 'steady-hit', amount: 0.08 }),
    s('covering-advance', 'assault', 0, '掩護轉移', '移動力 +1 格，但移動後那一回合命中 −12%。', { kind: 'move', amount: 1 }, { kind: 'moving-hit', amount: -0.12 }),
    s('close-assault', 'assault', 1, '近身突擊', '對 2 格內的目標傷害 +10%。', { kind: 'close-damage', amount: 1.1, within: 2 }),
    s('dig-in', 'assault', 1, '堅守陣線', '站在掩體裡時，受到的傷害 −15%。', { kind: 'cover-guard', amount: 0.85 }),
    s('finish-them', 'assault', 2, '補刀', '對生命低於一半的目標傷害 +12%。', { kind: 'finisher', amount: 1.12 }),
    s('veteran-grit', 'assault', 2, '老兵韌性', '最大生命 +8%。', { kind: 'max-hp', amount: 1.08 }),

    // Precision: marksmen.
    s('patient-aim', 'precision', 0, '耐心瞄準', '弱點射擊少蓄 1 回合。', { kind: 'skill-charge', amount: 1 }),
    s('skirmisher', 'precision', 0, '游擊射手', '移動後仍保有精準步槍的站定射程 +1。', { kind: 'mobile-steady' }),
    s('armour-piercing', 'precision', 1, '穿甲彈', '穿甲 +15。', { kind: 'penetration', amount: 15 }),
    s('overwatch-post', 'precision', 1, '制高點', '站在高地時命中 +10%。', { kind: 'high-ground', amount: 0.10 }),
    s('opening-shot', 'precision', 2, '開場一擊', '本場第一次攻擊傷害 +50%。', { kind: 'first-shot', amount: 1.5 }),
    s('ghost', 'precision', 2, '隱匿', '站在掩體裡時，敵人對他的命中 −10%。', { kind: 'hidden', amount: 0.10 }),

    // Support: medics, engineers and vox operators.
    s('field-aid', 'support', 0, '戰地急救', '每場一次，替相鄰傷最重的隊友回復 25 點，不需要醫療包。', { kind: 'field-aid', amount: 25 }),
    s('quick-hands', 'support', 0, '快手', '職責技能少蓄 1 回合。', { kind: 'skill-charge', amount: 1 }),
    s('shelter', 'support', 1, '護衛站位', '相鄰的隊友受到的傷害 −15%。', { kind: 'shield-adjacent', amount: 0.85 }),
    s('rapid-deploy', 'support', 1, '快速反應', '先攻 +3，比多數敵人更早行動。', { kind: 'initiative', amount: 3 }),
    s('stabilise', 'support', 2, '穩定傷勢', '給出的治療量 +50%。', { kind: 'heal-boost', amount: 1.5 }),
    s('coordination', 'support', 2, '通訊協調', '相鄰的隊友命中 +3%（和中士的光環分開計算）。', { kind: 'coordination', amount: 0.03, range: 1 }),

    // Command: sergeants.
    s('rally', 'command', 0, '鼓舞', '光環命中加成 +5%（共 +10%）。', { kind: 'aura-hit', amount: 0.05 }),
    s('command-net', 'command', 0, '指揮網', '光環範圍 +1 格。', { kind: 'aura-range', amount: 1 }),
    s('forward-order', 'command', 1, '急進指令', '戰術指令多給 1 格移動（共 +2）。', { kind: 'command-move', amount: 1 }),
    s('lead-by-example', 'command', 1, '以身作則', '自己命中 +10%。', { kind: 'self-hit', amount: 0.10 }),
    s('focus-fire', 'command', 2, '集火指示', '光環內的隊友傷害 +15%。', { kind: 'aura-damage', amount: 1.15 }),
    s('hold-the-line', 'command', 2, '死守陣線', '光環內的隊友受到的傷害 −15%。', { kind: 'aura-guard', amount: 0.85 }),

    // Astartes: graduated marines only.
    s('bolter-drill', 'astartes', 0, '爆彈操典', '爆彈武器傷害 +15%。', { kind: 'bolt-damage', amount: 1.15 }),
    s('assault-stride', 'astartes', 0, '突擊步伐', '移動力 +1 格，但移動後那一回合命中 −12%。', { kind: 'move', amount: 1 }, { kind: 'moving-hit', amount: -0.12 }),
    s('armour-rites', 'astartes', 1, '甲冑儀式', '護甲 +10。', { kind: 'armour', amount: 10 }),
    s('unyielding', 'astartes', 1, '不屈', '每場一次，生命掉到 30% 以下時回復 30 點。', { kind: 'last-stand', amount: 30, below: 0.3 }),
    s('marksman-rites', 'astartes', 2, '射擊儀式', '命中 +8%。', { kind: 'self-hit', amount: 0.08 }),
    s('iron-halo', 'astartes', 2, '鋼鐵意志', '受到的傷害 −12%。', { kind: 'damage-taken', amount: 0.88 }),
];

export const specialtyById = (id: string) => SPECIALTIES.find(x => x.id === id);

const GROUP_OF_DUTY: Record<Duty, SpecialtyGroup> = {
    rifleman: 'assault', flamer: 'assault', plasma: 'assault', heavy: 'assault',
    marksman: 'precision',
    medic: 'support', engineer: 'support', comms: 'support',
    sergeant: 'command',
};

/** Astartes choose from their own group whatever their duty; everyone else by duty. */
export const groupOf = (character: Pick<Character, 'origin' | 'duty'>): SpecialtyGroup =>
    character.origin === 'astartes' ? 'astartes' : GROUP_OF_DUTY[character.duty];

/** How many slots a soldier has opened. */
export const openSlots = (xp: number) => SLOT_LEVELS.filter(level => levelOf(xp) >= level).length;

/** The two options of one slot for this soldier. */
export const optionsFor = (character: Pick<Character, 'origin' | 'duty'>, slot: number) =>
    SPECIALTIES.filter(x => x.group === groupOf(character) && x.slot === slot);

/** Why this pick is refused, or null when it may be made (and then it is final). */
export function pickRefusal(
    character: Pick<Character, 'origin' | 'duty' | 'xp' | 'specialties'>, slot: number, specialtyId: string,
): string | null {
    const choice = specialtyById(specialtyId);
    if (!choice || choice.slot !== slot) return '沒有這個專長。';
    if (choice.group !== groupOf(character)) return `這是${GROUP_LABELS[choice.group]}專長，不屬於這名人員。`;
    if (slot >= openSlots(character.xp)) return `第 ${slot + 1} 個專長槽要到 Lv${SLOT_LEVELS[slot]} 才開放。`;
    if (character.specialties?.[slot]) return '這一槽已經選定，不能更改。';
    return null;
}

/** The effects a soldier fights with: only picks that still belong to their group count. */
export function effectsOf(character: Pick<Character, 'origin' | 'duty' | 'xp' | 'specialties'>): Effect[] {
    const group = groupOf(character);
    const open = openSlots(character.xp);
    return (character.specialties ?? [])
        .map((id, slot) => (slot < open && id ? specialtyById(id) : undefined))
        .filter((x): x is Specialty => !!x && x.group === group)
        .flatMap(x => x.effects);
}
