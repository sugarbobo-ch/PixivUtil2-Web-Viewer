# Web Viewer Pixiv UI 樣式調整報告

狀態：核心樣式已實作；供後續 agent 維護與驗收的設計規格

日期：2026-08-09

## 1. 目標與範圍

本次只調整視覺系統與元件狀態，不改動資料流、下載行為、組圖規則、鍵盤操作或既有互動流程。

核心目標如下：

- 將目前偏紫色的品牌／選取色改為 Pixiv 官方藍 `#0096FA`。
- 讓 light／dark theme 採用 Pixiv 官方的中性灰階關係。
- 統一組圖 badge、頁碼 badge、影片 badge 與 fullscreen HUD。
- 建立 Primary、Secondary、Selected、Overlay、Danger 的清楚層級。
- 移除 JSX 裡與 semantic tokens 競爭的 indigo／zinc 色彩 utility。
- 保留目前元件 class 與行為，以最小範圍完成樣式替換。

## 2. 研究依據

### 2.1 使用者提供的畫面

三張參考圖顯示的 Pixiv 視覺特徵一致：

- 品牌與 Follow 主按鈕使用清楚、單一的亮藍色。
- 深色頁面的主畫布接近純黑，導覽列與內容卡片使用 `#1F1F1F` 左右的 raised surface。
- 影像上的組圖數量使用深色半透明 HUD、白色重疊方框圖示與白色數字。
- 次要按鈕使用中性灰，不與主要動作競爭。
- 主要圖片保有最高視覺權重，卡片沒有彩色外框、shadow 或 glow。

### 2.2 Chrome 與保存的 Pixiv 正式資源

已透過使用者的 Google Chrome 開啟 Pixiv。瀏覽器安全限制不允許自動擷取受保護頁面的 DOM 與下載清單，因此後續改以使用者保存於下列位置的正式頁面與 production bundle 驗證：

- `C:\Users\lls03\Desktop\新增資料夾\イラスト・マンガ・小説 作品コミュニケーションサービス [pixiv(ピクシブ)].html`
- `C:\Users\lls03\Desktop\新增資料夾\#ブルーアーカイブ アロアロ - frengのイラスト - pixiv.html`
- 對應的 `_files` 資源目錄

兩份保存頁面均為 `data-theme="dark"`。`_app-7d2705a95132dd72.js.下載` 內含完整 light／dark theme object；production CSS 則確認按鈕 hover、press、focus、disabled 與 Navigation／Overlay 變體。

### 2.3 Pixiv 官方基準值

| 角色 | Light | Dark |
|---|---:|---:|
| Brand | `#0096FA` | `#0096FA` |
| Brand hover | `#1FA3FB` | `#1FA3FB` |
| Brand press | `#33ABFB` | `#33ABFB` |
| Page background | `#F5F5F5` | `#000000` |
| Main surface | `#FFFFFF` | `#1F1F1F` |
| Raised／HUD surface | `rgba(0,0,0,.88)`（影像上） | `rgba(0,0,0,.88)`（影像上） |
| Border | `rgba(0,0,0,.08)` | `rgba(255,255,255,.12)` |
| Primary text | `#1F1F1F` | `#F5F5F5` |
| Secondary text | `#474747` | `#D6D6D6` |
| Muted text | `#858585` | `#858585` |
| Disabled／subtle text | `#ADADAD` | `#5C5C5C` |
| Link | `#3D7699` | `#669FC2` |
| Danger | `#FF2B00` | `#FF2B00` |
| Success | `#B1CC29` | `#B1CC29` |
| Warning | `#FFAF0F` | `#FFAF0F` |
| Hover effect | `rgba(0,0,0,.04)` | `rgba(255,255,255,.12)` |
| Press effect | `rgba(0,0,0,.16)` | `rgba(255,255,255,.20)` |
| Focus ring | `rgba(0,150,250,.32)` | `rgba(0,150,250,.32)` |

Pixiv production bundle 另確認：

- 基礎圓角：`4 / 8 / 16 / 24px` 與 oval。
- 基礎 spacing：`4 / 8 / 16 / 24 / 40 / 64px`。
- 文字尺寸／行高：`12/20`、`14/22`、`16/24`、`20/28`、`32/40px`。
- 小型按鈕高度 `32px`、水平 padding `16px`。
- Disabled opacity 為 `.32`。
- Pixiv 參考頁的 `:focus-visible` 為藍色 ring；本專案依「禁止陰影／光暈」規範改用 semantic `outline` 實作，不使用 `box-shadow`。

## 3. 設計決策

### 3.1 色彩只表達一種語意

- Pixiv 藍只用於品牌、真正的主要動作、明確 selected indicator 與 focus。
- 一般數量、頁碼、metadata badge 不使用藍色填底。
- Link 使用獨立的 link token，不直接借用 primary。
- Danger、success、warning 不與品牌藍共用角色。
- 同一畫面可有多個 selected 控制，但只允許一個具最高優先級的 filled primary action。

### 3.2 Surface 層級

Light：

1. Page canvas：`#F5F5F5`。
2. Card／header／modal：`#FFFFFF`。
3. Neutral control：黑色 `2%` 到 `4%` overlay。
4. Hover／press：黑色 `4%`／`16%` effect。

Dark：

1. Page／fullscreen stage：`#000000`。
2. Header／card／modal：`#1F1F1F`。
3. Neutral control：白色 `12%` overlay 或 `#333333` raised surface。
4. Hover／press：白色 `12%`／`20%` effect。

不要用額外邊框堆疊 surface。只有真正表示結構、輸入、選取或 focus 時才使用低對比 border；禁止用 shadow 或光暈製造高度感，層次改用 surface、spacing、對齊與留白表達。

### 3.3 媒體 HUD 與一般 surface 必須分開

圖片上的資訊無法假設背景明暗，因此 HUD 在 light／dark theme 都維持深色半透明背景與白色內容。Modal header 或一般面板裡的 badge 才跟隨 theme。

建議新增 viewer 角色 token：

```css
--viewer-hud-surface: oklch(0 0 0 / 0.72);
--viewer-hud-surface-strong: oklch(0 0 0 / 0.88);
--viewer-hud-border: oklch(1 0 0 / 0.12);
--viewer-hud-text: oklch(1 0 0);
--viewer-hud-hover: oklch(0 0 0 / 0.82);
```

這組 token 應同時供 gallery、manga group 與 fullscreen overlay 使用，不在各元件重複硬編 `bg-black/*`。

## 4. Token 調整規格

### 4.1 品牌 token

專案使用 OKLCH，對應值如下：

```css
--brand-default: oklch(0.659 0.181 248.8); /* #0096FA */
--brand-hover: oklch(0.692 0.166 245.3);   /* #1FA3FB */
--brand-press: oklch(0.713 0.155 243.4);   /* #33ABFB */
--brand-focus-ring: oklch(0.659 0.181 248.8 / 0.32);
```

把現有 subsystem primary token 改為 alias，避免四套數值日後漂移：

```css
--header-primary: var(--brand-default);
--header-primary-hover: var(--brand-hover);
--header-primary-press: var(--brand-press);
--viewer-primary: var(--brand-default);
--viewer-primary-hover: var(--brand-hover);
--viewer-primary-press: var(--brand-press);
--settings-primary: var(--brand-default);
--settings-primary-hover: var(--brand-hover);
--settings-primary-press: var(--brand-press);
--sidebar-primary: var(--brand-default);
--sidebar-primary-hover: var(--brand-hover);
--sidebar-primary-press: var(--brand-press);
```

`--header-brand-start` 與 `--header-brand-end` 設為同一個 `--brand-default`，或直接將 logo 改用單色 `color`；不要保留紫紅漸層。

### 4.2 中性色與 link

建議先把精確值放入 `frontend/src/index.css`，再由現有 `--header-*`、`--viewer-*`、`--settings-*`、`--sidebar-*` alias 使用：

```css
/* Light */
--neutral-canvas: oklch(0.970 0 0);       /* #F5F5F5 */
--neutral-surface: oklch(1 0 0);          /* #FFFFFF */
--neutral-text-1: oklch(0.239 0 0);       /* #1F1F1F */
--neutral-text-2: oklch(0.398 0 0);       /* #474747 */
--neutral-text-3: oklch(0.617 0 0);       /* #858585 */
--neutral-border: oklch(0 0 0 / 0.08);
--link-default: oklch(0.542 0.081 237.8); /* #3D7699 */

/* Dark override */
--neutral-canvas: oklch(0 0 0);           /* #000000 */
--neutral-surface: oklch(0.239 0 0);      /* #1F1F1F */
--neutral-surface-raised: oklch(0.321 0 0); /* #333333 */
--neutral-text-1: oklch(0.970 0 0);       /* #F5F5F5 */
--neutral-text-2: oklch(0.876 0 0);       /* #D6D6D6 */
--neutral-text-3: oklch(0.617 0 0);       /* #858585 */
--neutral-border: oklch(1 0 0 / 0.12);
--link-default: oklch(0.677 0.079 236.6); /* #669FC2 */
```

不要在第一個 pass 一次替換所有 surface。先處理 page、header、gallery、viewer，再依 component QA 結果映射 settings 與 sidebar，避免破壞目前已存在的層級。

## 5. 組圖 badge 與 icon

### 5.1 Gallery thumbnail 組圖 badge

目標外觀：Pixiv 參考圖中的右上角深色 HUD pill。

- 位置：`inset-block-start: 8px; inset-inline-end: 8px`。
- 高度：`20px`；若需符合 touch／閱讀密度可保留目前實際約 `22px`，但不可超過 `24px`。
- 水平 padding：`6px`；icon 與數字 gap：`4px`。
- 圓角：`8px`，接近短 pill，但不使用與 card 相同的大圓角。
- 背景：`--viewer-hud-surface`。
- Border：最多 `1px solid --viewer-hud-border`；若多數縮圖上已清楚，可移除 border。
- 文字：白色、`12px/20px`、`600`；使用 tabular numbers。
- Shadow：禁止。Badge 不使用 shadow、glow 或位移來製造互動感。
- Backdrop：`blur(8px)`；不必提高 saturation。
- 無 hover、位移或高彩度動畫，因為 badge 本身不是按鈕。

Icon 建議將 gallery count 現有的 Lucide `Layers` 改為 `Copy`。`Copy` 的重疊矩形輪廓更接近 Pixiv 正式 icon；尺寸 `12–14px`、`stroke-width: 2`、`currentColor`，不要建立另一份自訂 SVG。

數量文字以「icon + 數字」最貼近 Pixiv；若本輪嚴格不改 copy，可暫時保留既有 `{count}P`，但 icon、色彩與 spacing 仍按本規格執行。

### 5.2 Manga group modal

共用 base class，但拆兩個 modifier：

- `.viewer-group-badge--hud`：用於縮圖上的 group count 與 page badge。
- `.viewer-group-badge--surface`：用於 modal header 的「N 頁圖包」，跟隨 light／dark surface、border 與 text。

`P1`、`P2` 等 page badge 可保留現有內容。位置改用 logical properties，避免 `left-2`／`right-2` 固定方向。

### 5.3 Video badge

Video badge 與 group badge 使用同一 HUD 家族，差異只在 icon／形狀：

- 保留 Lucide `Film` 與 `currentColor`。
- 移除目前 hover 時 `translateY(-1px)` 的行為。
- 不因 card hover 改變 badge 色彩；hover／focus 狀態由 card 自身表達。
- 若同一張 card 同時有組圖與影片資訊，兩者需排成同一個右上角 badge cluster，不可重疊。

## 6. 按鈕系統

### 6.1 Primary

只用於一個決策範圍內的最高優先動作，例如確認、儲存或主要播放／開啟動作。

- Default：`#0096FA`。
- Hover：`#1FA3FB`。
- Active／press：`#33ABFB`。
- Ink：依「8.1 對比注意事項」決定；若追求 Pixiv 忠實度則為白色。
- 小型高度 `32px`、一般高度 `40px`。
- Inline padding 分別 `16px`／`20px`。
- 圓角用 oval／`999px`；icon-only control 使用圓形或 `8px` rounded square，不混用。
- 不加彩色 glow，也不使用 shadow；需要層次時使用 semantic surface／border。
- Transition 僅列實際變動的 `background-color`、`color`、`border-color`、`outline` 或 `transform`，時間 `150–200ms`。

### 6.2 Secondary／Default

- 使用中性 control surface 與 primary text。
- Default 不需要高彩度 border。
- Hover／press 維持原本的 surface、border 與文字色，不新增背景、不改文字色、不加 underline。
- 深色模式不可用另一個色相的灰藍或紫灰。
- Pixiv 參考圖的「追蹤中」與通知類按鈕即屬此層級。

### 6.3 Selected control

Header 中的「網格／組圖」與顯示偏好屬模式或 toggle，不應每一個都做成 filled primary。

建議 selected 樣式：

```css
background: color-mix(in oklch, var(--brand-default) 12%, var(--header-control));
color: var(--brand-default);
border-color: color-mix(in oklch, var(--brand-default) 36%, var(--header-border));
```

Selected 依靠 icon／文字／`aria-pressed` 與細邊框辨識。只有主要 CTA 使用整塊藍底。

### 6.4 Overlay／Navigation

Fullscreen、影像上的「看全部」與 icon control 使用 HUD token，不使用 primary blue 填底。Hover 只提高 HUD 不透明度；選取或收藏成功時，才讓 icon 本身使用語意色。

### 6.5 Disabled 與 focus

- Disabled：Pixiv 官方為 `opacity: .32`；同時保留 `cursor: default` 且不可只靠顏色傳達狀態。
- Focus：使用 `outline: 3px solid var(--brand-focus-ring)` 或 subsystem 對應 token；禁止用 `box-shadow` 製作 focus ring。
- 僅 `:focus-visible` 顯示 focus outline，不移除鍵盤可見焦點。
- Icon-only control 需維持現有 touch target，desktop 至少 `32px`，touch 情境至少 `44px`。

## 7. Header、Gallery 與 Fullscreen

### 7.1 Header

- Logo 改為單色 Pixiv 藍，移除紫紅 gradient。
- Dark header 使用 `#1F1F1F`，與 `#000000` page canvas 分層。
- Light header 使用白色，與 `#F5F5F5` page canvas 分層。
- Search、排序與次要控制維持中性 surface。
- 目前 active control 的紫色 glow 改為 neutral selected tint。

### 7.2 Gallery card

- Card radius 以 `8px` 為基準；內部 image 與 overlay 依同心圓原則縮小內層 radius。
- 普通 hover 不顯示 indigo border／shadow。只做圖片亮度或 opacity 的輕微變化；禁止 shadow、glow 與彩色 halo。
- Selected 才可使用 brand border／focus ring。
- 圖片可保留 `1px` inset outline：light 為黑 `10%`，dark 為白 `10%`。
- 標題 overlay 使用 black gradient 與白字，並維持圖片上的 HUD 規則。

### 7.3 Fullscreen viewer

- Fullscreen stage 在 light／dark theme 都以接近純黑為主，避免亮色 canvas 干擾作品。
- Toolbar、頁碼與 action rail 使用 `--viewer-hud-*`。
- 頁碼形式 `3/56` 使用 text-only HUD pill，與 gallery 的 group badge 同高度節奏。
- 「看全部」使用 Navigation／HUD button：白色或中性淺色 surface、深色文字；不是藍色 Primary。
- Like、share、more 等 icon 預設白色；hover 為 HUD surface；已收藏狀態才使用明確狀態色。

## 8. Accessibility 與對比注意事項

### 8.1 Pixiv 原色的已知取捨

WCAG 2.x 對比計算結果：

- 白字／`#0096FA`：`3.11:1`。
- 黑字／`#0096FA`：`6.74:1`。
- 白字／hover `#1FA3FB`：`2.73:1`。
- 白字／press `#33ABFB`：`2.51:1`。

因此，Pixiv 正式的「亮藍底＋白字」不符合一般尺寸文字的 WCAG AA `4.5:1`。實作前需由產品選定下列其一，不應由 agent 默默改色：

1. Pixiv 忠實方案：保留官方藍與白字，將此視為已知產品例外。
2. 對比優先方案：官方藍保留於 logo、icon、focus、selected indicator；filled button 使用較深的 `#007ACB` 搭配白字，對比約 `4.52:1`。
3. 色票優先方案：保留 `#0096FA` 填色，按鈕文字改為接近黑色；對比約 `6.74:1`，但視覺會偏離 Pixiv。

未取得額外決策時，視覺實作以方案 1 對齊本需求，但 QA 報告必須保留此對比註記。

### 8.2 其他檢查

- 所有 icon-only button 保留可讀的 `aria-label`。
- Group／page badge 若只是資訊，使用非互動元素並設 `pointer-events: none`。
- Gallery card 的 focus-visible 必須在縮圖與 badge 上方仍可見。
- Modal 保留 focus trap、Escape 與關閉按鈕；本次不得因改樣式破壞。
- `prefers-reduced-motion` 下移除 card scale、badge transform 與非必要 transition。
- 文字截斷時保留完整可存取名稱或 title，不以純圖示取代必要資訊。

## 9. 現況差異與修改位置

### P0：token 與核心元件

| 檔案 | 現況 | 要求 |
|---|---|---|
| `frontend/src/index.css` | 四組 primary 仍為 hue 273 的 indigo；brand logo 為紫紅漸層 | 加入官方 brand／press／focus／HUD 角色並重新 alias |
| `frontend/src/styles/gallery.css` | group badge 跟隨 surface，icon 使用 primary；video badge hover 會位移 | 拆 HUD／surface modifier；icon 改白；移除 badge hover 動畫 |
| `frontend/src/components/GalleryMonthSection.tsx` | `Layers`、`{count}P`、`right-2` 與 indigo hover utility | 改 `Copy`、套 HUD modifier、改 logical positioning、移除競爭色彩 utility |
| `frontend/src/styles/navigation.css` | modal count、page badge 與一般 group badge 混用相同外觀 | modal header 用 surface；影像 page badge 用 HUD |
| `frontend/src/components/MangaGroupModal.tsx` | 存在 `bg-zinc-*`、`border-zinc-*`、固定 left／right 與硬編 black badge | 保留結構，顏色集中到 CSS；套用 semantic modifier |

### P1：整體一致性

| 檔案 | 要求 |
|---|---|
| `frontend/src/styles/header.css` | 單色品牌；active mode 改 neutral selected；primary 去除彩色 glow |
| `frontend/src/styles/viewer.css` | Fullscreen stage 與 overlay 全部改用 viewer HUD token |
| `frontend/src/styles/sidebar.css` | 移除對 `bg-indigo-*`／`text-indigo-*` 的補丁式映射，改 component class |
| `frontend/src/styles/settings.css` | Primary／secondary／danger 依按鈕角色整理，補 press 狀態 |
| `frontend/src/styles/mobile-menu.css` | 與 desktop header 使用同一 selected／primary 規則 |

### P2：清除競爭 utility

逐一檢查並移除被 semantic CSS 接管的：

- `text-indigo-*`
- `bg-indigo-*`
- `border-indigo-*`
- `shadow-indigo-*`
- `bg-zinc-*`
- `border-zinc-*`
- `text-zinc-*`
- `bg-black/*`（影像 HUD 應改 token）

只移除正在修改元件內的競爭 utility，不做與本需求無關的全專案機械式重寫。

## 10. 互動狀態矩陣

| 元件 | Normal | Hover | Active | Selected | Focus-visible | Disabled |
|---|---|---|---|---|---|---|
| Primary button | Brand fill | Brand hover | Brand press | 不適用 | 3px brand outline | `.32` opacity |
| Secondary button | Neutral control | 維持原樣 | 維持原樣 | 不適用 | 3px brand outline | `.32` opacity |
| Mode／toggle | Neutral control | Neutral hover | Neutral press | 淡藍 tint＋藍 icon／text | 4px brand ring | `.32` opacity |
| Gallery card | Neutral image outline | 輕微圖片變化，不使用 shadow | 輕微壓下 | Brand outline | Brand outline | 不可互動樣式 |
| HUD badge | 深色 HUD | 無 | 無 | 無 | 無 | 無 |
| HUD icon button | 深色或透明 HUD | HUD hover | HUD press | 狀態色 icon | 3px brand outline | `.32` opacity |

## 11. 實作順序

1. 在 `frontend/src/index.css` 建立 brand、press、focus、HUD 與中性色角色。
2. 先改 gallery group badge／video badge，確認不同明暗縮圖上的可讀性。
3. 改 manga group modal，拆開影像 HUD 與 panel surface badge。
4. 改 header logo、mode selected 與 primary button。
5. 改 fullscreen viewer overlay／頁碼／看全部按鈕。
6. 清除上述元件 JSX 中的競爭色彩 utility。
7. 最後處理 sidebar、settings 與 mobile menu 的一致性。

每個步驟都保留現有 component class、事件與資料行為；跨元件共用樣式放在對應 `frontend/src/styles/*.css`，不要散落新的 inline color。

## 12. 驗收清單

- Light：`#F5F5F5` canvas、白色 surface、深色文字，品牌色沒有偏紫。
- Dark：黑色 canvas、`#1F1F1F` surface、白／灰文字，沒有藍紫灰混色。
- Logo、主要按鈕與 selected indicator 使用同一官方 Pixiv blue family。
- 同一決策區域只有主要 CTA 使用 filled blue。
- Gallery 組圖 badge 在白圖、黑圖、彩色圖上均可讀，icon 為白色重疊矩形。
- Page badge、video badge、fullscreen counter 共用 HUD family。
- Badge 沒有 hover 位移或假互動。
- Normal、hover、active、selected、focus-visible、disabled 全部有檢查。
- 320px 窄手機、一般 desktop、長標題與長繪師名稱不裁切主要控制。
- Light／dark 都檢查 gallery、group modal、fullscreen、header、sidebar、settings。
- 鍵盤操作、focus trap、Escape、touch target 與 reduced motion 不退步。
- Tailwind utility 不覆蓋 semantic component rule；不以大量 `!important` 補救。
- 在 `frontend/` 工作目錄執行 `pnpm.cmd build`，TypeScript 與 Vite build 必須通過。

## 13. 非目標

- 不變更 backend、索引、下載、分組或排序資料邏輯。
- 不重寫 Gallery／Fullscreen／Modal component 架構。
- 不新增自訂 icon 套件或重複 SVG。
- 不以 Pixiv 畫面逐像素複製整體版面；本次取用的是官方配色、狀態層級與元件視覺語言。
- 不處理與本報告無關的既有工作區修改。

## 14. Agent 交接：目前已實作內容與維護規範

本節是本輪調整完成後的實作基準，與根目錄 `agents.md` 搭配閱讀。後續 agent 修改 UI 時，先閱讀下列檔案，再保留既有資料流、事件與互動行為：

| 目的 | Source of truth |
|---|---|
| Light／dark semantic token | `frontend/src/index.css` |
| 共用按鈕、icon button、狀態與 focus | `frontend/src/components/ui/Button.tsx`、`frontend/src/styles/buttons.css` |
| 共用 badge 與 badge variant | `frontend/src/components/ui/Badge.tsx`、`frontend/src/styles/badges.css` |
| Settings 分區、搜尋列、分類 tab | `frontend/src/components/SettingsModal.tsx`、`frontend/src/styles/settings.css` |
| Fullscreen filmstrip 預設值 | `frontend/src/types.ts`、`frontend/src/utils/webConfig.ts`、`frontend/src/App.tsx`、`frontend/src/components/FullscreenViewer.tsx`、`backend/main.py` |
| Gallery／manga／webtoon 的 viewer surface | `frontend/src/styles/gallery.css`、`frontend/src/styles/navigation.css`、`frontend/src/styles/viewer.css`、`frontend/src/styles/webtoon.css` |

### 14.1 共用元件與按鈕層級

- 所有 action button 使用 `Button`；icon-only control 使用 `IconButton` 並提供 `aria-label`。variant 限定為 `primary`、`secondary`、`ghost`、`plain`、`success`、`danger`。
- 一般按鈕採完整膠囊；`IconButton` 採完整圓形。local CSS 只能調整 semantic token scope 或 layout，不得重新定義另一種半徑、方形 hover、shadow、glow 或 underline。
- `primary` 只用於主要動作或明確 selected；success／danger 必須使用各自 semantic token。明亮與暗黑模式都要確認 normal、hover、active、focus-visible、disabled 的對比與語意一致。
- `secondary` 的 hover／press 保持原本的中性 surface、框線與文字色，不新增狀態背景、不改文字色、不加 underline。`plain` 用於取消、重設、清除等文字動作，所有狀態維持透明背景；Sidebar 的「取消選擇」與「重設所有」使用 `plain`。
- `ghost` normal 維持透明，hover／press 使用中性的 subsystem control surface；`IconButton variant="ghost"` 必須保持圓形並顯示圓形背景。Tab 是獨立導覽元件，不要套用 action button primitive；tab indicator 可保留單一 flat primary underline。
- Footer 分頁、fullscreen toolbar、sidebar、settings modal（含 X）、mobile menu、dropdown trigger 與 webtoon floating controls 均重複使用同一套 primitive。

### 14.2 Badge、Gallery 與 Webtoon

- Metadata、組圖數量、影片、頁碼與設定狀態都使用 `Badge`；badge 是非互動資訊，不添加 hover 動畫、位移或高彩度填色。影像上的 badge 使用 HUD token，面板內 badge 使用 surface token。
- Grid card 預設不顯示作品名稱，只在 hover／focus 時顯示；作品名稱不應常駐在卡片下方。組圖 badge、影片 badge 與 manga page badge 維持相同幾何與語意家族。
- 條漫模式的 floating toolbar、頁籤、縮圖導覽與 HUD 必須沿用 shared button／badge token；目前頁碼與總頁數統一為 `current / total`，收合後也要保留。條漫縮圖不可出現黑框。
- 全螢幕工具列與圖庫面板分別由 `fullscreenShowToolbar`、`fullscreenShowThumbnails` 控制進入時的預設顯示，toolbar 仍可用快捷鍵暫時切換；舊 config 缺少欄位時維持預設開啟。

### 14.3 Settings 版面與文字可讀性

- 「顯示與瀏覽」分成一般瀏覽、全螢幕模式、條漫模式三個 section；全螢幕與條漫選項不可再塞回同一個無層級色塊。
- config path 區塊使用留白與低對比結構分隔，不使用大型 accent 背景；搜尋列的 icon 必須佔固定空間，文字不可與 icon 重疊或錯位；分類 tab 使用 `overflow-x: auto`、不換行並可 touch horizontal scroll。
- 桌面一般 UI（按鈕、tab、switch、表單標籤、導覽）不得小於 `14px`；手機一般 UI 不得小於 `15px`。Metadata 桌面至少 `13px`、手機至少 `14px`；手機 input／select／textarea 至少 `16px`。

### 14.4 強制禁止與驗收

- 不得在任何 UI state 使用紫色、紫羅蘭、靛色、洋紅、fuchsia 或偏紫色相；selected 只能使用 Pixiv brand semantic role 或中性 surface。
- 專案完全禁止 `box-shadow`、`text-shadow`、`drop-shadow`、shadow utility、glow、halo 與彩色發光 focus ring。focus 使用 semantic `outline`；層次使用 border、surface、spacing 與對齊。
- 修改前後以 `rg` 搜尋紫色系 class／色值、shadow／glow 宣告與競爭 utility；確認 Tailwind utility 沒有覆蓋 shared CSS。
- 至少檢查窄手機、一般 desktop、長文字、light／dark、fullscreen 與 webtoon，以及 normal、hover、active、selected、focus-visible、disabled。不得讓 dropdown 箭頭、搜尋文字、tab、footer 分頁、modal X 或主要內容裁切／位移。
- UI／CSS 變更在 `frontend/` 工作目錄執行 `pnpm.cmd build`；文件變更執行 `git diff --check`。若未做實際瀏覽器 render，交付時要明確說明。
