import { buildActorSprites, type ActorSprites, type SpriteContract } from './contract';

export interface BattleArt { cadian: ActorSprites; traitor: ActorSprites; coverBack: string; coverFront: string }

const root = `${import.meta.env.BASE_URL}battle-assets/`;

async function json<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`載入失敗：${url}`);
    return res.json();
}

function preload(url: string) {
    return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`圖片載入失敗：${url}`));
        img.src = url;
    });
}

async function loadActor(id: string): Promise<{ sprites: ActorSprites; manifest: any }> {
    const baseUrl = `${root}${id}/`;
    const manifest = await json<any>(`${baseUrl}manifest.json`);
    const contracts: Record<string, SpriteContract> = {};
    await Promise.all(manifest.actions.map(async (a: { path: string }) => { contracts[a.path] = await json<SpriteContract>(baseUrl + a.path); }));
    // Decode every referenced image before the battle starts so no frame pops in late.
    const paths = new Set(Object.values(contracts).flatMap(c => c.assets.map(a => a.path)));
    await Promise.all([...paths].map(p => preload(baseUrl + p)));
    return { sprites: buildActorSprites(id, baseUrl, manifest, contracts), manifest };
}

export async function loadBattleArt(): Promise<BattleArt> {
    const [cadian, traitor] = await Promise.all([loadActor('cadian'), loadActor('traitor')]);
    const coverBack = `${root}cadian/${cadian.manifest.cover.back}`;
    const coverFront = `${root}cadian/${cadian.manifest.cover.front}`;
    await Promise.all([preload(coverBack), preload(coverFront)]);
    return { cadian: cadian.sprites, traitor: traitor.sprites, coverBack, coverFront };
}
