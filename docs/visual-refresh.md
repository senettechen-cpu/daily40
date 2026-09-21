# 指揮中心視覺改版

## 本機驗證

`npm ci` 後執行 `npm run dev`，開啟 `/visual-preview.html`。
此獨立開發入口提供可拋棄的 React 示範資料，不掛載正式 GameProvider，不呼叫後端 API，也不儲存資料。重新整理會重設。
正式入口與 Vite production build 未引用此頁。正式帳號與資料庫整合仍須在已設定 Firebase / API 的環境驗證。

資料一致性測試：`node --test tests/visual-data.test.cjs`。
檢查既有徵召價格、巢都折扣、普通／特殊兵種戰力、支援加成以及素材路徑。

已在 1440×960 與 390×844 視窗檢查畫面；以示範資料驗證徵召扣款、部署／召回、器官選取與植入、儀式獎勵、資源不足停用及滿階狀態。

## 視覺與互動

- 兵種共用色彩、角色圖片、徽章、徵召價格與戰力；既有特殊兵種暫以配色及獨立徽章區分。
- 徵召卡片、裝備展示、可重複徵召與一次取得的戰略支援分開呈現。
- 部署面板支援現有基本兵種及已取得的飛昇兵種，顯示預備、駐軍、實際防禦差距。
- RP、榮耀及四種飛昇資源使用 SVG 徽記，數值變更提示來自實際前後差值。
- 12 星區提供專案完成環、防禦指標、戰果與要塞狀態；手機採直向航線。
- 飛昇以角色主視覺搭配 SVG 器官熱點、中文詳情、四種狀態與五階段進度；右側選取同步到掃描圖。
- 尊重 prefers-reduced-motion，新增介面提供鍵盤選取與可辨識的停用狀態。

## 新增美術

檔案：`public/ascension/astartes-chamber.png`。
使用內建 image_gen 工具產生，未使用 CLI。原始輸出保留於 Codex generated_images；專案使用工作目錄內的副本。
其他既有 raster 素材保留，兵種徽章、資源徽記、艦艇藍圖與星球介面以原生 SVG / CSS 繪製。

最終提示詞：

> Use case: stylized-concept. Asset type: square character illustration for an interactive Warhammer 40K Astartes ascension / augmentation game interface. Generate a full-body front-facing Space Marine in a dark Mechanicus augmentation chamber, one single character with two arms and two legs, standing symmetrically at attention with arms slightly separated from the torso, hands empty, no weapon. Heavy gothic power armor, sculpted anatomically proportionate pauldrons, segmented articulated gauntlets and greaves, cables, antique brass chest insignia, finely weathered gunmetal and desaturated blue-black ceramite. Sophisticated painted realism, highly legible silhouette and cinematic cool rim light with restrained warm brass reflections. Very dark navy-black clean background with only extremely subtle technical chamber atmosphere. Square composition: body centered x=50%, helmet top at y=8%, eye level y=15%, chest y=31%, abdomen y=45%, hips y=55%, knees y=72%, boots y=93%; shoulders stretch approximately x=23% to 77%; leave negative space at both sides for interface overlays. Large torso and armored shoulders, realistic readable details. No text, no labels, no typography, no border or picture frame, no visible UI, no gore, no HUD dots; these will be added with code.
