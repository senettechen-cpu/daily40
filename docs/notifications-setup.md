# 通知設定（Zeabur）

2026-09-24。推播與郵件從來沒有在正式站運作過，因為環境變數沒設。
這份是要設什麼、以及為什麼。

## 1. 為什麼以前不會響

兩個獨立的原因，兩個都要解決：

1. **金鑰沒設**：`api` 服務沒有 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`，
   排程器啟動時印出 `VAPID keys missing. Push notifications disabled.` 然後跳過推播。
2. **每日任務掃不到**：排程器原本只查 `due_date` 在 9–10 分鐘後的任務，
   而每日任務的 `due_date` 是一個過去的固定時間戳，**永遠不會落在那個區間**。
   所以就算金鑰設好，每日任務也一次都不會提醒。已於 2026-09-24 補上時段提醒。

## 2. 要設的環境變數（Zeabur → `api` 服務）

| 變數 | 值 | 必要性 |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | 見下 | 推播必要 |
| `VAPID_PRIVATE_KEY` | 見交付的 `vapid-new.env` | 推播必要 |
| `MAILTO` | `mailto:senettechen@gmail.com` | 建議 |
| `SMTP_USER` | 寄件信箱 | 郵件通知才需要 |
| `SMTP_PASS` | 該信箱的應用程式密碼 | 郵件通知才需要 |

公鑰（可以公開，前端也寫著同一把）：

```
BCGjTeKDpYNhVrwxtjhRaX9ggsN4r403_d6ysDfLmm5yRfe1O7DHqTi8pFtkfdrScnaKZ6iWmyIp-8eUweGY1T8
```

私鑰**不要**進 git、不要貼進聊天或文件，只貼進 Zeabur 的環境變數欄位。

## 3. 金鑰是新的

舊的那一對在舊的公開 repo 裡外洩過，所以 2026-09-24 重新產生。
前端 `src/hooks/useLocalNotifications.ts` 的公鑰已同步換成新的。

**副作用**：用舊金鑰建立的推播訂閱會失效（回 410），排程器會自動把它們刪掉，
瀏覽器下次進站會用新金鑰重新訂閱。使用者需要重新允許一次通知權限。

## 4. SMTP 沒設會怎樣

`server/src/services/email.ts` 在缺少 `SMTP_USER` / `SMTP_PASS` 時直接跳過寄信，
不會讓排程器崩潰。所以只設推播、不設郵件，是可行的組合。

Gmail 的話要用**應用程式密碼**（不是登入密碼），需先開啟兩步驟驗證。

## 5. 設好之後怎麼確認

1. 重啟 `api`，看日誌**沒有**出現 `VAPID keys missing`。
2. 在網站上允許通知權限（瀏覽器會問）。
3. 建一個每日任務，時段設成「現在的下一分鐘」，等一分鐘。
4. 沒響的話看 `api` 日誌的 `[Scheduler] Push failed:`。

## 6. 提醒的規則

- 每個時段在**到點後 10 分鐘內**提醒一次，只提醒**還沒完成**的時段。
- 同一個時段一天只響一次（記在 `tasks.reminded_slots` / `reminded_day`）。
- 10 分鐘的窗口是為了容忍排程漂移與短暫停機；停機超過 10 分鐘的時段就跳過，
  不會在重啟時把一整天的提醒補轟出來。
