# 星界軍造型與掩體射擊修正

日期：2026-09-21。僅修改獨立遠征原型，未改既有遊戲存檔或資源。

## 造型

使用內建 imagegen（非 CLI）生成卡迪亞式星界軍四姿態透明圖集：站立、跪姿、兩個移動步態。保存於 `public/expedition/cadian-poses-v1.png`，原始生成檔保留。PNG 為 1254×1254、RGBA；直接以 SVG 視窗裁取四格顯示，沒有修改像素或去背處理。

參考方向：橄欖綠頭盔與防彈甲、卡其布制服、露出的人類臉部與正常身形。這是生成式非官方素材，不是遊戲或官方模型擷取。四名隊員暫共用同一套身體姿態，職責由姓名與標籤區別；敵軍仍使用原有示意造型。武器仍為程式圖層，可換裝；尚未達到一致的正式 3D 美術品質。

官方背景／造型參考：[Cadian Shock Troops 發表](https://www.warhammer-community.com/en-gb/articles/Rt0ShUYZ/warhammer-day-reveals-cadia-stands-with-an-all-new-army-set/)。本作職責與 AI 數值是原創設計，非官方規則。

## AI 修正

- 低掩體成為不可站立、不可穿越的障礙，士兵在相鄰後方獲得方向性保護。
- 來彈方向與掩體一致，才有命中 −30% 的保護；側翼、背後與近戰不能享受這項保護。火焰不受一般射擊掩體減益。
- 步槍與精準射手選擇有射線、適合射程的射擊位置，評估掩體、路程、近戰威脅、友軍位置與已被預約的陣地。
- 在有射線且射程合適的掩體裡停留射擊；不為了高優先但不可射擊的敵人盲目前進。
- 移動完成才射擊，避免「邊衝邊打」。近戰逼近時尋找後撤位置；只有近戰衝鋒者使用追擊邏輯。
- 短射程角色增加單獨向前推進的代價，不因拿短槍就一路跑進敵群。
- 預設馬雷克從霰彈槍改為雷射步槍，三名步槍兵加一名精準射手；原裝備仍可選，唯一性與資格檢查保留。
- 掩體射擊顯示跪姿，角色下方顯示「掩體射擊／轉移陣地／後撤拉距／定點射擊／警戒待敵」。

仍不是完整軍事 AI：未有壓制火力、投煙、交替掩護或玩家指定陣地。本版修正的是射擊者不合理追敵與掩體未被使用的問題，不宣稱所有配置都已平衡。

## 驗證

新增測試：方向性掩體、掩體內射擊不追遠處優先目標、近戰壓力下拉距、射擊發生時已停止移動、不可站上掩體。加入中線兩處可交替利用的掩體後，100 個固定種子中預設配置 100 次完成，平均 60.9 秒。此數字僅描述預設教學隊伍，不等於整體平衡證明。

基準種子 40126：62.6 秒、3 人存活；393 個友軍掩體狀態 tick、118 次敵我定點攻擊事件。方向判斷、命中與動畫仍是同一份確定性模擬結果。

## 完整生成提示詞

```text
Use case: stylized-concept. Asset type: production game sprite atlas for a 2.5D Warhammer 40,000 Astra Militarum Cadian infantry prototype. Generate ONE square transparent PNG atlas with exactly 2 columns and 2 rows, equal square cells, no text, no labels, no grid, no terrain. Each cell contains the SAME realistic adult human Cadian guardsman, not a Space Marine, not chibi, not a robot. Olive drab rounded Cadian helmet with ear protection and a small pale skull insignia, exposed human face, olive flak chest armour with restrained pale winged insignia, modest shoulder plates, khaki cloth fatigues with visible fabric folds, webbing ammo pouches, black leather boots, weathered utilitarian materials. High quality painterly pre-rendered 3D tactical game sprite, crisp silhouette, consistent camera elevated 25 degrees, 3/4 side facing RIGHT, identical subdued lighting in all cells. FULL BODY within every cell, transparent space around body, no cast ground shadow. Palette olive green and khaki, realistic normal human proportions, 7 heads tall. CRITICAL modular asset: NO GUN OR WEAPON in any cell; hands posed as if holding a horizontal rifle, with open space for a weapon layer supplied by game code. Top left: standing aiming pose, boots near x44% y89% of cell, hands extending right near x66% y47%. Top right: kneeling behind cover aiming pose, boots same baseline, hands near x66% y62%. Bottom left: crouched walking combat advance, legs visibly stepping, hands forward ready to hold rifle. Bottom right: alternate walking stride same torso and hand placement, opposite leg forward. All four figures must be aligned to the same baseline and use exactly the same scale, outfit and facing. Authentic Cadian Astra Militarum visual language, NOT oversized pauldrons, NOT sealed sci-fi visor, NOT cartoon outlines. Genuinely transparent background and empty space between the cells; do not paint a checkerboard. No weapons, no scene, no writing, no watermark.
```
