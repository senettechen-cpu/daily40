
import { AstartesResources, UnitType } from '../types';

export interface Implant {
    id: string;
    name: string;
    englishName: string;
    description: string;
    cost: {
        amount: number;
        resource: keyof AstartesResources;
    };
    flavorText: string;
}

export interface ImplantStage {
    id: number;
    name: string;
    englishName: string;
    description: string;
    implants: Implant[];
    rewardUnits: UnitType[]; // Units granted on stage completion
    gloryReward?: number;
}

export const REWARD_UNIT_PACK: UnitType[] = ['wolf_guard', 'phalanx_warder', 'purifier', 'pyroclast'];

export const IMPLANT_STAGES: ImplantStage[] = [
    {
        id: 1,
        name: '新兵植入期',
        englishName: 'The Initiate',
        description: '改造的起點，強化心肺與骨骼以承受未來的試煉。',
        rewardUnits: REWARD_UNIT_PACK,
        implants: [
            {
                id: 'secondary-heart',
                name: '第二心臟',
                englishName: 'Secondary Heart',
                description: '植入第二顆強化心臟，大幅提升耐力並能在主心臟受損時維持生命。',
                flavorText: '「要成為阿斯塔特，首先要有一顆不屈的心……或者兩顆。」',
                cost: { resource: 'geneLegacy', amount: 500 }
            },
            {
                id: 'ossmodula',
                name: '骨強化器官',
                englishName: 'Ossmodula',
                description: '分泌特殊激素，使骨骼融合強化，並封閉胸腔形成防彈甲殼。',
                flavorText: '「他們的骨頭如同精金，凡人的武器只能在其上留下刮痕。」',
                cost: { resource: 'adamantium', amount: 500 }
            },
            {
                id: 'catalepsean-node',
                name: '腦膜',
                englishName: 'Catalepsean Node',
                description: '植入後腦，允許星際戰士輪流休息半腦，連續作戰數週無需睡眠。',
                flavorText: '「即使在夢中，他也保持警惕。」',
                cost: { resource: 'neuroData', amount: 500 }
            },
            {
                id: 'haemastamen',
                name: '血液再造器官',
                englishName: 'Haemastamen',
                description: '改變血液成分，使其攜帶氧氣量大幅提升，增強全系統效率。',
                flavorText: '「他們的血液是帝皇的恩賜，燃燒著純淨的怒火。」',
                cost: { resource: 'puritySeals', amount: 500 }
            }
        ]
    },
    {
        id: 2,
        name: '偵察兵適應期',
        englishName: 'The Scout',
        description: '強化感官與環境適應能力，為前線作戰做準備。',
        rewardUnits: REWARD_UNIT_PACK,
        implants: [
            {
                id: 'larramans-organ',
                name: '拉瑞曼器官',
                englishName: "Larraman's Organ",
                description: '生成拉瑞曼細胞，能在傷口瞬間形成血痂，阻止失血與感染。',
                flavorText: '「傷疤只是裝飾，痛苦只是幻覺。」',
                cost: { resource: 'geneLegacy', amount: 800 }
            },
            {
                id: 'biscopea',
                name: '肌肉強化器官',
                englishName: 'Biscopea',
                description: '釋放激素刺激肌肉生長至超人極限，賦予撕裂鋼鐵的力量。',
                flavorText: '「力量不僅來自肌肉，更來自於意志。」',
                cost: { resource: 'adamantium', amount: 800 }
            },
            {
                id: 'omophagea',
                name: '基因偵測神經',
                englishName: 'Omophagea',
                description: '通過吞噬生物組織讀取其記憶與基因資訊。',
                flavorText: '「知己知彼，百戰不殆……或者是把彼吃下去。」',
                cost: { resource: 'neuroData', amount: 800 }
            },
            {
                id: 'preomnor',
                name: '預置胃',
                englishName: 'Preomnor',
                description: '獨立的消化器官，能消化毒素或不可食用物質。',
                flavorText: '「無論戰場多麼惡劣，他們都能生存。」',
                cost: { resource: 'puritySeals', amount: 800 }
            }
        ]
    },
    {
        id: 3,
        name: '戰鬥弟兄強化期',
        englishName: 'The Battle Brother',
        description: '全面強化生存機能，成為真正的戰爭機器。',
        rewardUnits: REWARD_UNIT_PACK,
        gloryReward: 5000,
        implants: [
            {
                id: 'neuroglottis',
                name: '味覺偵測神經',
                englishName: 'Neuroglottis',
                description: '高度強化的味覺，能偵測空氣中的化學成分與毒素。',
                flavorText: '「恐懼有一種特殊的味道，而他們能嘗出來。」',
                cost: { resource: 'geneLegacy', amount: 1200 }
            },
            {
                id: 'multi-lung',
                name: '多肺',
                englishName: 'Multi-lung',
                description: '第三個肺，能在低氧、水下或有毒大氣中呼吸。',
                flavorText: '「在凡人窒息之處，他們依然咆哮。」',
                cost: { resource: 'adamantium', amount: 1200 }
            },
            {
                id: 'lymans-ear',
                name: '萊曼之耳',
                englishName: "Lyman's Ear",
                description: '強化聽覺並免疫暈眩，賦予完美的平衡感與方向感。',
                flavorText: '「他們能聽見落針之聲，也能無視炮火轟鳴。」',
                cost: { resource: 'neuroData', amount: 1200 }
            },
            {
                id: 'oolitic-kidney',
                name: '卵石腎臟',
                englishName: 'Oolitic Kidney',
                description: '超強效的解毒過濾器官，能淨化血液中的致命毒素。',
                flavorText: '「純淨的身體，承載純淨的職責。」',
                cost: { resource: 'puritySeals', amount: 1200 }
            },
            {
                id: 'occulobe',
                name: '視覺控制器官',
                englishName: 'Occulobe',
                description: '賦予夜視能力與超人般的動態視力。',
                flavorText: '「黑暗對他們而言，只是另一種顏色。」',
                cost: { resource: 'neuroData', amount: 1200 } // Bonus now costs resource per high difficulty plan
            }
        ]
    },
    {
        id: 4,
        name: '死亡天使飛昇期',
        englishName: 'The Angel of Death',
        description: '完成最終改造，成為帝皇的死亡天使。',
        rewardUnits: REWARD_UNIT_PACK,
        gloryReward: 10000,
        implants: [
            {
                id: 'progenoids',
                name: '基因存收腺',
                englishName: 'Progenoids',
                description: '收集並培養基因種子，是戰團存續的關鍵。',
                flavorText: '「為了未來，我們奉獻現在。」',
                cost: { resource: 'geneLegacy', amount: 2000 }
            },
            {
                id: 'mucranoid',
                name: '汗腺改進器官',
                englishName: 'Mucranoid',
                description: '分泌油性物質覆蓋皮膚，能在真空或極端溫度下生存。',
                flavorText: '「即使星空也不能凍結他們的熱血。」',
                cost: { resource: 'adamantium', amount: 2000 }
            },
            {
                id: 'betchers-gland',
                name: '貝徹爾腺',
                englishName: "Betcher's Gland",
                description: '能分泌強酸唾液，足以腐蝕金屬或致盲敵人。',
                flavorText: '「他們的每一部分都是武器。」',
                cost: { resource: 'neuroData', amount: 2000 }
            },
            {
                id: 'melanchromic',
                name: '黑色素屏障',
                englishName: 'Melanchromic',
                description: '控制皮膚色素沈澱，抵抗高強度的輻射照射。',
                flavorText: '「輻射如雨，我自巋然不動。」',
                cost: { resource: 'puritySeals', amount: 2000 }
            },
            {
                id: 'sus-an-membrane',
                name: '薩斯安腦膜',
                englishName: 'Sus-an Membrane',
                description: '允許進入自我誘導的假死狀態，在致命傷下存活數百年。',
                flavorText: '「只有在死亡中，職責才終結……甚至那時也不。」',
                cost: { resource: 'geneLegacy', amount: 2000 }
            }
        ]
    },
    {
        id: 5,
        name: '阿斯塔特修士',
        englishName: 'Adeptus Astartes',
        description: '最後的儀式，植入黑色甲殼，與動力裝甲合而為一。',
        rewardUnits: ['redemptor_dreadnought'],
        implants: [
            {
                id: 'black-carapace',
                name: '黑色甲殼',
                englishName: 'The Black Carapace',
                description: '皮下神經接口，讓星際戰士能像穿衣服一樣穿戴動力裝甲。',
                flavorText: '「人甲合一，無堅不摧。」',
                cost: { resource: 'adamantium', amount: 5000 } // Ultimate cost
            }
        ]
    }
];

export const UNIT_DETAILS: Record<string, { name: string, description: string, power: number, cost: number }> = {
    'wolf_guard': {
        name: '野狼守衛',
        description: '太空野狼的菁英戰士，裝備動力斧與暴風盾，擅長近距離撕裂敵人。',
        power: 400,
        cost: 0 // Only unlockable/re-recruitable via special request ideally, or set a high glory price
    },
    'phalanx_warder': {
        name: '方陣護衛',
        description: '帝國之拳的持盾衛士，組成堅不可摧的防禦陣線。',
        power: 400,
        cost: 0
    },
    'purifier': {
        name: '淨化者',
        description: '灰騎士的聖潔戰士，能用靈能火焰焚燒亞空間的污穢。',
        power: 400,
        cost: 0
    },
    'pyroclast': {
        name: '火龍戰士',
        description: '火蜥蜴的火焰專家里，使用獨特且強大的火焰噴射器。',
        power: 400,
        cost: 0
    },
    'redemptor_dreadnought': {
        name: '原鑄無畏',
        description: '巨大的戰爭機器，只有最強大的戰士才有資格在死後駕駛。',
        power: 2000,
        cost: 0
    }
};

import { AscensionCategory, RitualActivity } from '../types';


export const RITUAL_ACTIVITIES: Record<AscensionCategory, RitualActivity[]> = {
    'exercise': [
        { id: 'run', name: '長跑訓練 (跑步)', category: 'exercise', baseDifficulty: 3 },
        { id: 'gym', name: '力量強化 (重訓)', category: 'exercise', baseDifficulty: 4 },
        { id: 'pushups', name: '基礎體能 (伏地挺身)', category: 'exercise', baseDifficulty: 2 },
        { id: 'core', name: '核心鍛鍊 (核心)', category: 'exercise', baseDifficulty: 3 },
    ],
    'learning': [
        { id: 'coding', name: '沉思編碼 (程式開發)', category: 'learning', baseDifficulty: 3 },
        { id: 'english', name: '哥德語研習 (英文)', category: 'learning', baseDifficulty: 2 },
        { id: 'reading', name: '戰術閱覽 (閱讀)', category: 'learning', baseDifficulty: 2 },
        { id: 'management', name: '指揮藝術 (管理學)', category: 'learning', baseDifficulty: 3 },
    ],
    'cleaning': [
        { id: 'tidy', name: '聖地淨化 (整理房間)', category: 'cleaning', baseDifficulty: 1 },
        { id: 'dishes', name: '器皿清潔 (洗碗)', category: 'cleaning', baseDifficulty: 2 },
        { id: 'trash', name: '廢棄物排除 (倒垃圾)', category: 'cleaning', baseDifficulty: 1 },
        { id: 'robot', name: '機僕維護 (掃地機器人)', category: 'cleaning', baseDifficulty: 2 },
    ],
    'parenting': [
        { id: 'play', name: '新兵演練 (陪玩)', category: 'parenting', baseDifficulty: 3 },
        { id: 'diaper', name: '污染處理 (換尿布)', category: 'parenting', baseDifficulty: 2 },
        { id: 'feeding', name: '補給分配 (餵食)', category: 'parenting', baseDifficulty: 2 },
        { id: 'sleep', name: '靜滯力場 (哄睡)', category: 'parenting', baseDifficulty: 4 }, // High difficulty!
    ]
};

