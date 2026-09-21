# 版本紀錄 (Changelog)

此文件由系統自動產生，記錄所有版本歷史。

| 版本 (Hash) | 時間 | 重要修改內容 |
|---|---|---|
| a40394a | 2026-02-03 12:29:14 | Trigger Redeploy: Retry build after TS fixes |
| b2c1c99 | 2026-02-03 12:09:49 | 修正後勤總表 TS 錯誤 |
| 2adcd93 | 2026-02-03 12:01:48 | 重構後勤總表：改為全版面設計，PC雙欄/手機分頁切換 |
| ff2cea3 | 2026-02-03 08:27:11 | fix(core): resolve state reversion for deployments and subtasks using correct sync logic |
| 93ad113 | 2026-02-03 05:54:49 | fix(core): resolve state reversion on subtask delete and unit deployment |
| 94867b2 | 2026-02-03 05:43:36 | fix(ui): adjust ledger form layout for mobile (close btn, date width, numpad, btn wrapping) |
| 165e601 | 2026-02-01 11:49:26 | style(ui): reorder navigation - ledger left, strategic map right |
| 50ed7da | 2026-02-01 11:42:07 | fix(ui): improve mobile navigation and add ledger FAB |
| e8f67d6 | 2026-02-01 10:21:45 | fix(ui): resolve props destructuring error in navigation |
| 99916e0 | 2026-02-01 10:14:46 | feat(ui): add mobile ledger button, exclusive modals, and glory reward |
| 6c91f1f | 2026-02-01 10:00:30 | fix(ui): update category labels and fix modal exclusivity |
| 6269bc0 | 2026-02-01 09:46:30 | fix(build): increase PWA cache limit and add chunk splitting |
| 33d45e7 | 2026-02-01 09:31:15 | fix: resolve backend duplicate definition and frontend css syntax error |
| 5ff08e5 | 2026-02-01 09:19:28 | feat(ledger): add persistence and mobile UI |
| 97b539a | 2026-01-31 16:07:29 | chore: trigger redeploy to clear cache |
| 318fb7d | 2026-01-31 16:03:39 | fix(ui): pass auth token to Vox-Link test signal |
| 7d7f216 | 2026-01-31 15:55:48 | fix(ui): show detailed error messages for Vox-Link tests |
| 001f87e | 2026-01-31 15:34:34 | feat(debug): add email connection test tools |
| a64f86e | 2026-01-31 15:03:47 | feat(ui): add Vox-Link modal for user email settings |
| 10871c7 | 2026-01-31 14:36:26 | feat(backend): implement email notifications (Vox-Link) and user settings |
| 9473426 | 2026-01-31 06:43:41 | feat(ui): implement holy purge animation (delay + visual improvements) |
| 51d11ae | 2026-01-30 16:27:31 | fix(pwa): install workbox-precaching and add manifest injection to sw.js |
| c0d4cbc | 2026-01-30 16:16:18 | fix(server): wrap VAPID setup in try-catch to prevent startup crash |
| eaa4646 | 2026-01-30 16:07:33 | fix(scheduler): isolate corruption updates to specific users and prevent global data wipe |
| a1a9d75 | 2026-01-30 13:25:36 | fix(build): remove TS syntax from sw.js and add mailto to VAPID env |
| c4cb3dd | 2026-01-30 13:17:50 | feat(push): implement VAPID web push notifications (full stack) |
| aa4b96d | 2026-01-30 13:00:09 | feat(pwa): add missing PWA icons to public directory |
| d03129f | 2026-01-30 12:40:06 | feat(pwa): enable PWA support for mobile notifications |
| b044648 | 2026-01-30 12:32:48 | feat(ui): add mobile FAB for quick task access |
| 799e997 | 2026-01-30 12:21:27 | feat(notifications): implement 10-minute pre-deadline local browser notifications |
| c78cb76 | 2026-01-30 12:18:07 | feat(ui): optimize AddTaskModal for mobile using Drawer and larger touch targets |
| 5de0387 | 2026-01-30 09:01:37 | fix: move audit logs to top of dashboard |
| ef4c578 | 2026-01-30 08:42:05 | feat: implement audit log system |
| 84e105c | 2026-01-29 15:00:02 | fix: resolve GameContext duplication error |
| 7bb3449 | 2026-01-29 14:48:04 | feat: implement GM admin dashboard |
| 402793c | 2026-01-29 14:37:23 | fix: normalize api url logic in line callback |
| d20f25f | 2026-01-29 14:33:35 | fix: resolve double /api path in line callback |
| e0605da | 2026-01-29 14:21:30 | feat: implement LINE Login via Firebase Custom Token |
| 1509d80 | 2026-01-29 10:27:09 | fix: normalize api url to prevent double slash issues |
| 7f4336b | 2026-01-29 10:22:44 | fix: explicit token check to clean up TS build errors |
| 1d7a829 | 2026-01-29 10:16:55 | fix: 401/404 errors by adding token support and fixing api url |
| 3a047dc | 2026-01-29 10:01:26 | refactor: prevent api calls before auth |
| e49c216 | 2026-01-29 09:52:24 | fix: add missing try block in gameState route |
| 351bee9 | 2026-01-29 09:44:38 | fix: use VITE_API_URL environment variable |
| 0868d99 | 2026-01-29 09:35:42 | feat: Finalize multi-user system with Chinese UI and Firebase |
| 623287a | 2026-01-29 04:36:47 | Implement skipping of overdue recurring tasks |
| 743e81f | 2026-01-28 17:51:08 | Update unit recruitment costs: Guardsmen 300, Space Marine 1500, Custodes 4500 |
| f61d438 | 2026-01-27 12:12:43 | feat(ui): Add subtask confirmation/edit/delete and fix radar clipping |
| 14db749 | 2026-01-27 12:00:48 | fix(ui): Normalize all recurring tasks to today for strict time sorting |
| bc99d5e | 2026-01-27 11:02:43 | fix(ui): Correct task sorting to use effective daily time for recurring tasks |
| 66e86c2 | 2026-01-27 10:31:22 | chore(release): Bump versions to v2.3.0 (frontend) and v1.1.0 (backend) |
| 5184077 | 2026-01-27 09:58:59 | fix(server): Ensure db init and migrations run on startup |
| 5df87a8 | 2026-01-27 09:51:51 | fix(db): Add auto-migration for streak and due_time columns |
| a1e8a7e | 2026-01-27 09:45:35 | feat(mechanics): Add streak persistence to backend and enable recurring task deletion |
| 077a157 | 2026-01-27 09:37:58 | fix(core): Harden streak calculation logic and fix 0-streak bug |
| 1fc600d | 2026-01-27 09:26:10 | fix(mobile/ui): Fix mobile scrolling and persistent streak visibility |
| b72b207 | 2026-01-27 09:10:23 | fix(mobile): Fix task drawer scrolling and layout on mobile devices |
| d0d9f87 | 2026-01-27 08:52:36 | feat(mandates): Implement Streak System and Mandate Protocols |
| 545fbba | 2026-01-27 08:34:55 | fix(frontend): Resolve syntax error in OrbitalRadar.tsx |
| 5a56ef5 | 2026-01-27 08:31:30 | feat(strategic): Implement Tactical Scan, Sector Fortification, and Deployment UI logic |
| a371a6f | 2026-01-26 22:44:15 | fix: Build errors and refine radar & mandate view |
| 4bbacec | 2026-01-26 22:28:54 | feat(mandates): separate tactical list from mandate registry with completion badges |
| 72c4c24 | 2026-01-26 21:52:57 | fix(radar): make labels persistently visible in OrbitalRadar |
| 9e21168 | 2026-01-26 21:47:30 | style(radar): position labels above blips with imperial styling |
| a8fa81b | 2026-01-26 21:38:26 | style: make radar labels persistently visible |
| b7737ea | 2026-01-26 21:28:16 | feat: implement radar blip labels and daily reset logic for mandates |
| ba98ad7 | 2026-01-26 17:53:22 | style(ui): improve deployment layout and planetary background visibility |
| dd3ae50 | 2026-01-26 17:46:17 | feat(ui): restore full sector map functionality and add planetary backgrounds |
| 2535d43 | 2026-01-26 16:57:22 | fix(ui): restore sector map structural integrity and refine task list |
| 8e8c527 | 2026-01-26 16:44:12 | feat(ui): Redesign Strategic Map Interface and Fix Deployment Modal |
| 0087850 | 2026-01-26 16:05:10 | feat(visuals): Refine Radar and Corruption Warnings |
| 92f9681 | 2026-01-26 15:53:56 | fix(core): Remove duplicate 'currentTime' declaration |
| bddd7cc | 2026-01-26 15:49:45 | fix(core): Fix React Error #300 (Conditional Hook Execution) |
| 913bba9 | 2026-01-26 14:25:45 | feat(mechanics): Add Backend Scheduler and Radar Polish |
| a9de178 | 2026-01-26 14:09:24 | fix(mobile): Use correct Radar icon for drawer toggle button |
| 1fe21fb | 2026-01-26 13:49:42 | feat(mobile): Implement Card View for Tasks and Optimize Header |
| a396ad4 | 2026-01-26 13:24:08 | feat(mobile): Implement Responsive Mobile Interface |
| 4b1c1cf | 2026-01-26 13:09:28 | feat(ui): Add Import/Export STC buttons to Navigation Bar |
| 8eae892 | 2026-01-26 12:41:59 | fix: Resolve GameContext syntax error and finalize migration logic |
| 1e30cd5 | 2026-01-26 12:19:33 | fix(build): Relax TS checks and add vite-env types for production build |
| 28db8e6 | 2026-01-26 11:46:57 | Fix syntax error in GameContext |
| 89ba847 | 2026-01-26 10:50:38 | feat(backend): Implement full-stack architecture with Zeabur and PostgreSQL |
| b7f6256 | 2026-01-26 09:15:21 | Update: Enhancing UI for Task List, Unit Shop, and Sector Map Unit Cards with Chinese localization and improved layout |
| 2ceebde | 2026-01-26 06:51:47 | feat: Version Update - Armory, Radar & Strategic Mode Implementation |
| d9e2caf | 2026-01-25 13:26:10 | Fix: Update jsx to react-jsx for Zeabur deployment |
| ffff982 | 2026-01-25 11:13:27 | Initial commit: The Imperial Cogitator v1.0 |
