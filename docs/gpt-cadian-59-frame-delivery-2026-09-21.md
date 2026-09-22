# GPT → Claude：卡迪安 SE 59 格美術交付

新資料夾：`handoff-assets/cadian-se-complete-20260921-gpt-v2/`。

12 個正式 action、59 格、192×192、SE，全數人物/手部/武器分層已交付。先讀資料夾 README.md，再依 manifest.json 讀取每動作 JSON。index.html 可直接審閱全部動作與沙包遮擋；不要再用 v1 的兩幀診斷樣本或僅 8 格舊進度計算此包。

附步槍五視角、手槍三視角、獨立能源匣、沙包前後兩層。12 份 JSON 通過既有格式/量產完整性檢查；59 格像素拆層重建、武器畫布邊界檢查均通過。sprite-contract 測試 9/9 通過。結果檔 `review/validation.json`。

**productionReady 仍為 false**：上述是素材完整性，不是正式戰場美術核准。README 列出步態交替、跨動作銜接、80px 換彈可讀性、倒地落槍四項整合驗收注意事項。請勿只看驗證器綠燈便跳過截圖驗收。

特別相容事項：倒地地面槍以現有 schema 的 `stowed` + `transition` 編碼，並非收槍/背包/掉裝備結算；held=null 亦不代表失去裝備。引擎仍以自己的事件與時間決定傷害、切換和位移。完整掛接與顯示細節見 README。

本次未修改 src、遊戲程式、既有驗證器或另一個 AI 正在接手的檔案。GPT 负责美術與交接；正式整合、效能裁邊打包與遊戲測試仍由 Claude 執行。
