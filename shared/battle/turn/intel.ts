import { isVehicle, isRelay } from './rules';
import type { BattleResult, Objective, UnitSpec } from './types';

// Battle intelligence (2026-09-27, system review P1-3): what a stronghold asks
// of a squad before it departs, and why a battle went the way it did after.
// Pure functions over what the engine already records, so the briefing, the
// report and the tests all read the same thing.

export interface Threat {
    id: string;
    title: string;
    detail: string;
    /** What answers it, in words; `covered` says whether this squad has it. */
    answer: string;
    covered: boolean;
}

const ANTI_ARMOUR = ['電漿槍', '重武器', '爆彈槍'];
const CLOSE_QUARTER = ['火焰器', '霰彈槍'];
const PRECISION = ['精準'];

const hasWeapon = (crew: UnitSpec[], names: string[]) =>
    crew.some(u => names.some(n => u.weapon.name.includes(n) || u.sidearm?.name.includes(n)));

/** The threats a stronghold holds, checked against the squad that would fight it. */
export function threatsOf(enemies: UnitSpec[], objective: Objective | undefined, crew: UnitSpec[]): Threat[] {
    const threats: Threat[] = [];
    const vehicles = enemies.filter(isVehicle);
    const engineers = crew.filter(u => u.duty === 'engineer').length;
    const antiArmour = hasWeapon(crew, ANTI_ARMOUR);
    if (vehicles.length > 0) {
        threats.push({
            id: 'vehicles',
            title: `載具 ×${vehicles.length}`,
            detail: vehicles.map(v => v.name).join('、') + '：雷射槍對載具傷害很低。',
            answer: '電漿槍、重武器，或讓工兵貼近安放爆破包',
            covered: antiArmour || engineers > 0,
        });
    }

    const medics = enemies.filter(e => e.duty === 'medic' && (e.tools ?? []).includes('medicae-kit'));
    if (medics.length > 0) {
        threats.push({
            id: 'medics',
            title: '敵方醫護',
            detail: '會替受傷的敵人回血，拖越久越難打。',
            answer: '用側翼姿態或精準射手優先擊倒醫護',
            covered: hasWeapon(crew, PRECISION) || crew.some(u => u.stance === 'flank'),
        });
    }

    const engineersFoe = enemies.filter(e => e.duty === 'engineer' && (e.tools ?? []).includes('engineering-kit'));
    if (engineersFoe.length > 0) {
        threats.push({
            id: 'fortify',
            title: '敵方工兵',
            detail: '會在前線加固掩體，讓敵人更難打中要害。',
            answer: '火焰器無視掩體；或及早推進',
            covered: hasWeapon(crew, ['火焰器']) || crew.filter(u => u.stance === 'advance').length >= 2,
        });
    }

    const cultists = enemies.filter(e => e.duty === 'cultist').length;
    if (cultists >= 6) {
        threats.push({
            id: 'horde',
            title: `教徒群 ×${cultists}`,
            detail: '大量近戰教徒會一擁而上，貼身後步槍兵只能改用手槍。',
            answer: '火焰器或霰彈槍，站進掩體固守',
            covered: hasWeapon(crew, CLOSE_QUARTER),
        });
    }

    if (enemies.some(isRelayLike)) {
        threats.push({
            id: 'relays',
            title: '廣播節點',
            detail: '節點在時，敵人命中提高，首領每兩回合呼叫一次轟擊。',
            answer: '先打掉節點（載具類外殼，反裝甲武器或爆破包最有效）',
            covered: antiArmour || engineers > 0,
        });
    }

    if (objective && (objective.kind === 'seize' || objective.kind === 'rescue')) {
        const movers = crew.filter(u => u.stance === 'advance' || u.stance === 'flank').length;
        threats.push({
            id: 'objective',
            title: objective.kind === 'seize' ? '要佔點' : '要救援',
            detail: '只有「推進」或「側翼」姿態的隊員會去搶目標格；固守與護衛不會。',
            answer: '至少 2 人用推進或側翼',
            covered: movers >= 2,
        });
    }
    if (objective?.kind === 'assassinate') {
        const target = enemies.find(e => e.id === objective.targetId);
        threats.push({
            id: 'target',
            title: `擊倒目標：${target?.name ?? '指定目標'}`,
            detail: `生命 ${target?.maxHp ?? '?'}${target && target.armour > 0 ? `、護甲 ${target.armour}` : ''}，通常躲在掩體或衛兵後面。`,
            answer: '精準步槍或電漿槍（穿甲）',
            covered: hasWeapon(crew, [...PRECISION, '電漿槍']),
        });
    }
    return threats;
}

const isRelayLike = (unit: UnitSpec) => isRelay(unit);

export interface UnitLine { id: string; name: string; dealt: number; taken: number; healed: number; down: boolean }

export interface Diagnosis {
    outcome: BattleResult['outcome'];
    crew: UnitLine[];
    /** The squad member who did the most damage. */
    mvp?: string;
    /** Why it went this way and what to try, most important first. */
    reasons: { title: string; advice: string }[];
}

/** Reads a finished battle: who did what, and for a loss, the likeliest reasons. */
export function diagnose(units: UnitSpec[], result: BattleResult, objective?: Objective): Diagnosis {
    const side = new Map(units.map(u => [u.id, u.side]));
    const lines = new Map<string, UnitLine>(units.map(u => [u.id, { id: u.id, name: u.name, dealt: 0, taken: 0, healed: 0, down: false }]));
    let enemyHealing = 0;
    let barrageDamage = 0;

    for (const act of result.activations) {
        for (const a of act.activities) {
            if (a.kind === 'attack') {
                const from = lines.get(act.unitId);
                const to = lines.get(a.targetId);
                if (from) from.dealt += a.damage;
                if (to) to.taken += a.damage;
            } else if (a.kind === 'heal') {
                const who = lines.get(act.unitId);
                if (who) who.healed += a.amount;
                if (side.get(act.unitId) === 'enemy') enemyHealing += a.amount;
            } else if (a.kind === 'barrage') {
                for (const id of a.targetIds) {
                    const to = lines.get(id);
                    if (to && side.get(id) === 'crew') { to.taken += a.damage; barrageDamage += a.damage; }
                }
            }
        }
    }
    for (const u of result.units) { const line = lines.get(u.id); if (line) line.down = u.down; }

    const crew = units.filter(u => u.side === 'crew').map(u => lines.get(u.id)!);
    const mvp = [...crew].sort((a, b) => b.dealt - a.dealt)[0];
    const reasons: Diagnosis['reasons'] = [];
    if (result.outcome !== 'victory') {
        const standing = result.units.filter(u => u.side === 'enemy' && !u.down);
        const hulls = standing.filter(u => isVehicle(u));
        const crewSpecs = units.filter(u => u.side === 'crew');
        if (hulls.length > 0) {
            reasons.push(hasWeapon(crewSpecs, ANTI_ARMOUR) || crewSpecs.some(u => u.duty === 'engineer')
                ? { title: `${hulls.map(h => h.name).join('、')} 沒有被擊倒`, advice: '反裝甲火力要集中在載具上；工兵用推進姿態才會去貼近安放爆破包。' }
                : { title: `${hulls.map(h => h.name).join('、')} 沒有被擊倒`, advice: '隊伍沒有反裝甲火力：帶電漿槍或重武器，或讓工兵出戰。' });
        }
        if (standing.some(isRelay)) reasons.push({ title: '廣播節點還在運作', advice: '節點不倒，轟擊與命中加成就不停；先用反裝甲火力或爆破包打掉兩座節點。' });
        if (enemyHealing >= 40) reasons.push({ title: `敵方醫護回復了 ${enemyHealing} 點`, advice: '讓一名隊員用側翼姿態，或帶精準射手，優先擊倒敵方醫護。' });
        if (objective?.kind === 'assassinate') {
            const target = result.units.find(u => u.id === objective.targetId);
            if (target && !target.down) reasons.push({ title: `${target.name} 還剩 ${Math.round(target.hp / target.maxHp * 100)}% 生命`, advice: '擊倒目標就算勝利：集中穿甲火力，別分散在其他敵人身上。' });
        }
        if (objective && (objective.kind === 'seize' || objective.kind === 'rescue')) {
            const movers = crewSpecs.filter(u => u.stance === 'advance' || u.stance === 'flank').length;
            if (movers < 2) reasons.push({ title: '沒有足夠的人去搶目標', advice: `只有 ${movers} 人用推進或側翼；固守和護衛不會前往目標格，至少讓 2 人推進。` });
        }
        if (barrageDamage >= 60) reasons.push({ title: `轟擊造成 ${barrageDamage} 點傷害`, advice: '隊員擠在一起會被轟擊一次打中好幾個；分散站位，並優先打掉節點。' });
        if (result.outcome === 'timeout') reasons.push({ title: '十個回合內沒打完', advice: '火力不夠或太保守：換上更強的武器，或讓更多人推進。' });
        const exposed = [...crew].sort((a, b) => b.taken - a.taken)[0];
        const totalTaken = crew.reduce((sum, l) => sum + l.taken, 0);
        if (exposed && totalTaken > 0 && exposed.taken / totalTaken >= 0.4) {
            reasons.push({ title: `${exposed.name} 承受了 ${Math.round(exposed.taken / totalTaken * 100)}% 的傷害`, advice: '這個位置太暴露：換成固守（會找掩體）或給他更好的護甲。' });
        }
        if (reasons.length === 0) reasons.push({ title: '整體火力或耐久不足', advice: '升級護甲與武器、累積等級與專長，再回來挑戰。' });
    }
    return { outcome: result.outcome, crew, mvp: mvp && mvp.dealt > 0 ? mvp.name : undefined, reasons };
}
