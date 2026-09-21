# 開發文件索引

## 最新必讀：v1.5

[生活軍需、軍械庫、飛昇與六人戰術](progression-economy-ascension-v1.5.md) 已取代 v1.4 相衝突的定位與數值。遊戲獎勵主要購裝備、軍團可擴編、器官綁定個別候選人。另有 [HTML 研究審閱版](progression-review.html)。下方較早版本說明作歷史索引，不覆蓋 v1.5。

最新版本 **v1.4**：每日／每月生活任務獎勵已一併規劃。接手獎勵、任務或資料遷移工作前，必讀 [生活獎勵整合規格](life-rewards-integration.md) 與主規格第 15 節；目前程式仍是舊獎勵機制，文件不是實作完成報告。

## 先讀這份

[灰燼戰線：遊戲設計與開發交接規格 v1.4](expedition-rpg-design.md) 是現行開發主規格，包含 22 章與多勢力補充，已修訂任務、部署、醫療救援、壓制及長期養成。所有新數值仍待 Claude 實作測試，不是已完成的功能。

使用者指定：**GPT 負責遊戲規劃、圖片與美術設計；Claude 負責技術架構／系統規劃、程式實作與測試。** 完整交付、變更與驗收責任見主規格第 0 節。

## 文件用途與優先順序

| 文件 | 用途 | 狀態 |
| --- | --- | --- |
| [expedition-rpg-design.md](expedition-rpg-design.md) | 完整規則、分工、素材交接、階段與驗收 | 現行主規格；候選數值仍待驗證 |
| [game-design-review.html](game-design-review.html) | 方便使用者閱讀的圖文審閱版 | 已同步 v1.4 與分工契約；衝突時以主規格及最新使用者指示為準 |
| [expedition-prototype.md](expedition-prototype.md) | 原型實作與驗證紀錄 | 歷史工程參考，接手須重新檢查 |
| [guard-cover-revision.md](guard-cover-revision.md) | 星界軍造型與掩體修訂 | 歷史工程參考 |
| [cultist-sidearm-revision.md](cultist-sidearm-revision.md) | 邪教徒與副武器修訂 | 歷史工程參考 |
| [weapon-readability-revision.md](weapon-readability-revision.md) | 武器辨識與射程修訂 | 歷史工程參考 |
| [visual-refresh.md](visual-refresh.md)、[campaign.md](campaign.md) | 原有視覺與戰役文件 | 保留，不自動套用為新 RPG 規則 |
| [archive/expedition-rpg-design-v0.1.md](archive/expedition-rpg-design-v0.1.md) | 舊行商浪人／四人隊伍方案 | 已封存，不作新開發依據 |

## 交給 Claude 的工作提示

> 請先讀專案根目錄 CLAUDE.md 及 docs/expedition-rpg-design.md 全文。依使用者指定分工，你負責技術架構、系統、程式與測試；GPT 負責遊戲與美術設計。先盤點目前原型與規格的差異，提出第一個戰鬥品質切片的技術方案、工作清單、素材依賴、待決問題與測試計畫，待我確認後再實作。不要套用封存的四人行商浪人版本，不要直接展開所有勢力或修改正式存檔。

後續每次規則變更都要更新主規格版本與決策紀錄；技術實作報告另存並連回對應章節，不能用報告默默改寫設計。
