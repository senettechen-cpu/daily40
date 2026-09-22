# Claude → GPT 第五輪：戰報版剩餘工作交接（2026-09-22）

由使用者轉達。使用者指定這四項由 GPT 接手：立繪縮圖、裝備圖、俯視戰術圖、手機效能實測。以下說明目前的狀態、交付格式與驗收方式，讓 GPT 交付的素材能直接接上現有程式。

## 0. 目前狀態（Claude 已完成）

- 戰報版測試頁：`battle-test.html`（開發伺服器）；動畫版保留在 `?view=animated`。
- 已完成：戰報模組 `src/battle/report/report.ts`（使用 GPT 的 33 句模板）、播放畫面 `src/battle/view/BattleReportApp.tsx`、結算統計。94 項測試通過。
- 人物目前用「編號圓章」暫代（`Initials` 元件）；武器卡只有文字（`WeaponCard` 元件）。
- 規則、模擬與戰報文字都不需要更動。

## 1. 立繪縮圖

依你在 r4 交付的 `portrait-crops.json` 裁切，產生縮圖。

**第一階段需要的角色**：一般卡迪安步槍兵（6 名我方士兵都用這張）與叛變守軍（所有敵方都用這張）。其他 cadian-* 立繪可以一併產生，供之後使用。

**一般步槍兵的來源**：照你在 r4 的提醒，不能用中士的圖；請用 `cadian-kit-20260921-gpt-v1/images/standing.png`，並為它另外定義頭像框與半身框（在 JSON 中新增一筆 `cadian-rifleman`）。

**交付格式**：
- 資料夾：`handoff-assets/report-thumbnails-20260922-gpt-v1/`
- 每個角色兩張：
  - `portraits/<assetId>-head.webp`：128×128
  - `portraits/<assetId>-half.webp`：最長邊 480，保持比例，contain
- 如果無法輸出 WebP，可以改用 PNG，但請在 manifest 註明，並盡量壓縮（單張頭像目標 < 30 KB，半身圖 < 120 KB）。
- `thumbnails-manifest.json`：

```json
{
  "schemaVersion": 1,
  "portraits": [
    { "assetId": "cadian-rifleman", "role": "crew-default", "head": "portraits/cadian-rifleman-head.webp", "half": "portraits/cadian-rifleman-half.webp", "headSize": [128, 128], "halfSize": [360, 480], "bytes": { "head": 21000, "half": 98000 }, "source": "../cadian-kit-20260921-gpt-v1/images/standing.png" },
    { "assetId": "traitor-guardsman", "role": "enemy-default", "head": "...", "half": "..." }
  ],
  "equipment": []
}
```

`role` 目前只需要 `crew-default` 與 `enemy-default` 兩種，Claude 會依此對應到戰報中的單位。

**使用位置**（供構圖參考）：
- 頭像：右側名冊卡片（顯示約 30–40px）、關鍵戰報條目旁（約 30px）
- 半身圖：結算畫面與關鍵時刻放大（顯示約 160–240px 高）
- 倒地時，程式會自動加上灰階與「倒地」文字徽章，不需要另做圖。
- 立繪只代表身分；畫面上會另外顯示「目前武器」卡，所以立繪上畫的槍不必和實際武器一致。

## 2. 裝備圖

依你在 r4 交付的 `equipment.json`：雷射步槍、雷射手槍、防破片甲。

**交付格式**：同一個資料夾的 `equipment/<artId>-96.webp` 與 `equipment/<artId>-192.webp`（寬度 96／192，保持比例、contain、約 10% 內距、底色 `#2d3331`），並寫入 manifest 的 `equipment` 陣列：

```json
{ "artId": "lasgun", "weaponId": "lasgun", "small": "equipment/lasgun-96.webp", "large": "equipment/lasgun-192.webp", "bytes": { "small": 8000, "large": 20000 } }
```

`weaponId` 必須對應程式裡的武器代號：`lasgun`、`laspistol`；護甲請用 `flak-armour`。

**使用位置**：名冊卡片的「目前武器」（顯示約 48–64px 寬）。切換武器完成時，程式會換成另一張圖。

## 3. 俯視戰術圖（可選功能）

請提供**設計規格**，由 Claude 實作。這張圖是沒有動畫的示意圖，不需要逐格素材。

請決定以下幾點：
- 要不要做。如果不做，戰報版維持現狀即可。
- 顯示位置：戰報上方、旁邊，或用按鈕切換。
- 圖面元素的樣式：
  - 地圖格線（沿用原地圖 16×10 格、投影或正俯視，請擇一）
  - 掩體 C1–C10、實牆 W1–W7
  - 我方與敵方單位圖示（形狀與顏色；不能只靠顏色辨識）
  - 倒地標示
  - 射線（命中、擊中掩體、未中是否用不同線型）
  - 目前時間點的高亮
- 是否使用任何圖片（例如原廢墟底圖縮小版），或純用幾何圖形。

可以只交文字規格加一張靜態示意圖（mockup），不用可互動。

## 4. 手機效能實測（需要使用者操作）

GPT 和 Claude 都無法操作實體手機，請 GPT 提供測試步驟給使用者，或由使用者直接照下面的步驟做：

1. 在電腦專案資料夾執行 `npx vite --host`，記下它顯示的區域網路網址（例如 `http://192.168.x.x:5173`）。
2. 手機連到同一個 Wi-Fi，開啟 `<網址>/battle-test.html`。
3. 分別跑一次「標準交火」和「近身突擊」：1× 速度播放到結束，再按一次「快轉到結果」。
4. 回報：手機型號、瀏覽器；播放是否順暢；按開始到出現畫面大約幾秒；捲動戰報時有沒有卡頓；畫面有沒有被截斷或需要左右捲動。
5. 立繪接上後，再測一次載入時間。

## 5. 範圍界線

- 只在 `handoff-assets/` 的新資料夾交付素材與規格；**不修改** `src/`、`public/`、`shared/`、`server/`，也不改規則、數值、模板與既有素材包。
- 素材接入、縮圖載入程式、戰術圖實作與測試，仍由 Claude 負責。
- 交付後，Claude 會做以下驗收：
  1. manifest 路徑都存在，尺寸與記載一致，大小在目標範圍內。
  2. 畫面不會載入任何原始大圖。
  3. 一般步槍兵沒有使用中士的圖。
  4. 切換武器完成時，武器卡的圖和文字一起更新。
  5. 倒地時顯示灰階和文字徽章。
