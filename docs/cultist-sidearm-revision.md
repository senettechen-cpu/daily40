# 混沌教徒／帝國廢墟／副武器修訂

日期：2026-09-21。獨立開發預覽，不變更正式存檔、兵種庫或資源。

## 內容

- 關卡：淨化失落工廠；哥德式廢墟背景、實體沙包與破損石障。背景建築為裝飾，阻擋與掩體仍以引擎 WALLS/COVER 為準。
- 敵軍：混沌教徒主題，異教狂徒（近戰）、異教槍手（掩體射擊）、邪教煽動者（4 格命中支援）。角色定位及數值為本原型設計，不是官方桌遊規則。
- 本關四名人類星界軍各自配發雷射手槍；不表示所有兵種共享副武器。其他勢力／兵種配裝尚未實作。
- 1.5 格內且可見的敵人觸發副武器；3 tick 拔槍，離開 2.5 格或視線脫離後切回主武器，至少 4 tick 切換時間；原有較長冷卻保留。
- 手槍 5 傷害／12 tick、零穿甲、單目標；主步槍 12／8 tick。動畫武器與攻擊事件同步。不繼承火焰器範圍或精準槍穿甲。
- 站定後先還擊，有可提高與可見敵人距離的相鄰空格才後撤。不移動射擊、不為手槍主動追擊。
- 結算加入副武器傷害（總傷害的子集合）。無聲音。
- 動畫仍是姿勢圖集配合程式位移／後座，尚不是完整逐幀骨架動畫。

## 圖像資產

## 驗證

- `npm run build` 通過；既有 bundle size / Browserslist 警告仍存在。
- 全部 29 項測試通過，包含 100 固定種子、新增副武器切換／弱化／遲滯測試。
- 固定種子 40126：52.0 秒勝利、四人存活；副武器傷害分別為 68、20、0、5。
- 瀏覽器已檢查背景／角色圖集、啟動、暫停、快算、切換紀錄與結算。
- 100 種子基本隊伍為 100/100 勝利、平均 48.3 秒；目前定位教學測試關，不能據此宣稱長期養成平衡已完成。

## 素材與提示詞

使用內建 imagegen 工具（非 CLI），生成後保留原始透明度複製到專案：

- `public/expedition/cultists-v1.png`：1254×1254 RGBA，3 欄 × 2 列。
- `public/expedition/imperial-ruins-v1.png`：1536×1024。

### 異教徒完整提示詞

Use case: stylized-concept. Asset type: transparent game sprite atlas. Create six beautifully detailed Warhammer 40,000 Chaos human cultist sprites, painterly realistic mobile tactical game miniatures, NOT space marines. Exact layout three equal columns and two equal rows on transparent background, each figure completely contained within its cell with generous margins, aligned feet near cell bottom. Column 1 ragged bare-armed hooded melee zealot carrying rusty knife. Column 2 gas-mask autogun cultist in tattered burgundy robe, dark scrap armor, ammunition pouches, hands in rifle grip but NO weapon (weapon rendered separately). Column 3 cult demagogue in dark red hood, bone talismans and eight-pointed chaos pendant, scrap chest plate, hands ready to hold rifle but NO weapon. Top row standing combat pose, bottom row crouched combat pose, same character in each column. All face RIGHT in three-quarter isometric view with camera elevated 25 degrees. Crisp readable silhouettes, realistic adult human anatomy, no chibi, no text, no grid, no floor, genuine transparent alpha. Square atlas.

### 廢墟完整提示詞

Use case: stylized-concept. Asset type: 2D isometric tactical game battlefield background, landscape 3:2. A Warhammer 40,000 Imperial manufactorum courtyard overrun by Chaos cultists, no characters. Rich highly detailed painted realistic game art, ruined gothic cathedral arches and buttresses, eroded imperial double eagle shrine, skull architectural reliefs, huge rusted pipes, torn crimson banners with chaos marks, ash, scattered small rubble and distant furnace glow. Camera elevated isometric, no horizon, playable courtyard predominantly clear cracked stone and metal plates. IMPORTANT keep center 80 percent clear flat navigable floor without tall objects; all big architecture at outer top and side edges. Muted cold slate green and rusty iron, amber and red lights, strong material texture but readable subdued floor for overlaid units. No HUD, no text, no grid, no people, no weapons, no central obstacles. Fill whole rectangular image, not a floating island.
