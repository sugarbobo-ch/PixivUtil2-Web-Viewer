# Web Viewer UI Design Rules

以下規則適用於本專案所有新的 UI 與既有 UI 調整。功能、互動流程與資料行為維持原本設計，除非需求明確要求變更。

## 快速專案導覽

- 新 Agent 先讀 `docs/ai-agent-project-map.md`，掌握前後端入口、資料責任、常見任務路由與驗證矩陣。
- 第一次執行專案或需要重現開發環境時，讀根目錄 `README.md`；繁中、簡中與日文操作說明分別在 `README.zh-TW.md`、`README.zh-CN.md`、`README.ja.md`。
- 修改介面語言、可見文案、日期／數字格式、translation key、`config.ini` 欄位名稱或說明前，必須先讀 `docs/i18n-maintenance-guide.md`，並維持四份 locale JSON 的 key 與 placeholder 一致。
- 修改單頁／雙頁閱讀、書頁配對、閱讀方向、spread 導覽或 announcement 前，必須先讀 `docs/fullscreen-spread-reader-spec.md`。
- 修改全域 Gallery 載入、chunk／pin／LRU、月份版面、MonthQuickNav、跨月份 smooth scroll、拖曳 scrub、active month 指標或相關容量上限前，必須先讀 `docs/global-gallery-navigation-contract.md`，並以其中的不可破壞契約與通過條件驗收。
- 本文件仍是 UI、資料操作與交付流程的強制規範；快速導覽文件不可覆寫本文件要求。

## 禁止的視覺語言

- 禁止使用像引用區塊（quote / blockquote）的設計：包含左側或右側粗色線、靠在線上的圓角容器、以斜線分隔標籤與內容，或把一般資訊包成引用卡片。
- 不要用裝飾性的直線取代層級。優先用留白、對齊與字級建立群組；只有真正表示結構分隔時才使用低對比 hairline divider。
- 禁止背景、框線、文字與 hover 色彩互相不協調的按鈕或區塊。每個元件的 surface、border、text、accent 必須來自同一組語意 token，不能各自拼湊不同色相。
- 同一個畫面不要讓多個普通按鈕都使用高彩度填色；填色 accent 僅保留給主要動作或明確的選取狀態，其餘控制項使用中性 surface。
- 巢狀圓角需符合同心圓原則：外層圓角應大於內層，避免相鄰容器使用相同圓角造成卡住或不協調的邊角。

## 實作要求

- 優先沿用既有 semantic tokens 與 light/dark theme，不在單一元件硬編新的色彩。
- 用一致的 spacing、shared edges 與自然留白建立階層；不要用額外背景或邊框堆疊層次。
- 邊框只用於結構分隔、輸入框、選取與 focus 狀態；禁止使用 shadow 製造立體感，層次改用 surface、spacing 與對齊建立。
- 變更完成後檢查正常、hover、selected、focus、disabled，以及明亮／暗黑模式，確保沒有突然出現 quote 樣式或色彩衝突。

## 檔案與資料操作

- 專案內絕不允許使用硬刪除；需要移除檔案或資料時，必須採用可復原的方式處理。

## 專案視覺系統

### Token 優先順序

- `frontend/src/index.css` 是 light/dark semantic tokens 的主要來源；新增或調整 UI 時，先找對應 token，再考慮新增角色 token。
- Header 使用 `--header-*`；viewer、gallery 與 fullscreen surface 使用 `--viewer-*`；sidebar 使用 `--sidebar-*`；filter summary 使用 `--filter-*`；settings modal 使用 `--settings-*`。
- 不要在單一 JSX 元件直接混用 `bg-indigo-*`、`text-indigo-*`、`border-white/*` 等色彩 utility 來取代既有 token。若正在修改該元件，應一併移除互相競爭的顏色 class，將顏色集中到元件 CSS。
- `--*-primary` 只用於主要動作、明確選取狀態或需要被辨識的 active indicator；一般資訊、數量與 metadata badge 使用中性 surface。
- 色彩只表達一種語意：不要把 link、selected、success、danger 或裝飾共用同一個顏色角色。

### Badge 與狀態標籤

- 一般資訊 badge 使用同一組語意：以 `--viewer-surface-raised` 混合 `--viewer-control` 作背景、`--viewer-border` 作框線、`--viewer-text` 作文字；位於影像上時可用 `backdrop-filter` 增加可讀性。
- 組圖相關 badge（`.viewer-group-badge`、`.gallery-card__group-count`、`.manga-group-card__page-badge`、`.manga-group-modal__count`）必須沿用 viewer token；圖示可使用 `var(--viewer-primary)`，badge 本體不可自行硬編另一組 indigo 色票。
- Badge 是資訊，不是按鈕；不要加 hover 動畫或高彩度填色來製造假的互動感。若 badge 所在的卡片可互動，狀態應由卡片本身的 hover/focus/selected 樣式表達。
- 影像上的 badge 必須檢查不同圖片背景、light/dark theme 與文字對比；不要只在深色預覽圖上驗證。

## 元件實作規則

- 先保留既有的 component class、資料流與互動流程，再以 shared edge、spacing 與 token 調整外觀；不要為了視覺修正重寫資料行為。
- 外層 surface 的圓角要大於內層控制項；相鄰卡片、badge 與按鈕避免使用相同圓角造成邊角黏住。
- 使用 border 表示結構、選取或 focus；層次使用 surface、spacing 與對齊，不使用 shadow 或多層邊框堆出立體感。
- icon 使用既有 lucide-react set、`currentColor` 與一致 stroke weight；不要為不同狀態建立重複 SVG。
- 互動元件必須保留正常、hover、active、focus-visible、disabled 與 `prefers-reduced-motion` 狀態；transition 只列出實際變動的 properties，不使用 `transition: all`。
- icon-only control 維持既有 touch target token；標題、按鈕與 badge 需要明確 line-height，避免文字與 icon 視覺上下偏移。

## Responsive 與主題檢查

- 優先使用 logical properties（`padding-inline`、`inset-inline`、`margin-inline`），讓元件在 RTL 或文字變長時仍可用。
- 測試至少包含窄手機寬度、一般 desktop 寬度、長標題／長文字、light theme 與 dark theme；不可讓主要內容或關閉／返回控制項被裁切。
- 變更完成後至少執行前端 type-check/build，並檢查實際 render 的 normal、hover、selected、focus 與 disabled 狀態。
- 若只修改 CSS，仍要確認 Tailwind utility 的優先序沒有覆蓋 semantic component rule；優先移除衝突 utility，而不是用大量 `!important` 補救。

## 變更流程

1. 先用 `rg` 定位元件、class、token 與 theme 覆寫，並保留工作區既有修改。
2. 以最小範圍修改實作；跨元件共用的視覺規則放在對應的 `frontend/src/styles/*.css`，不要散落在 JSX。
3. 使用 `apply_patch` 修改檔案；移除檔案或資料時遵守可復原處理規則，不使用硬刪除。
4. 在 `frontend/` 執行 `..\.runtime\pnpm\pnpm.cmd build`，確認 TypeScript 與 Vite build 通過，再回報實際修改檔案與尚未完成的視覺驗證。

## 開發伺服器隔離

- 驗證預設使用 build、type-check 與不需常駐服務的測試；既有 listening port 與 dev server 一律視為使用者持有，不重啟、不停止，也不接管其程序。
- 必須進行 live server 或瀏覽器驗證時，先選擇未占用且不同於專案預設值的臨時 port，並記錄本次由 Agent 啟動的 PID、完整命令與 port。
- 清理只針對本次 Agent 明確啟動且身分核對相符的 PID。禁止依 port、程序名稱或模糊條件批次終止程序，包括停止所有 Node、Python 或 dev server。
- 若測試工具只能使用已占用的固定 port，改用可配置的替代 port；無法隔離時回報限制，不得關閉既有 listener。完成條件是 Agent 啟動的程序已結束，且執行前已存在的 listener 仍保持運作。

## 強制禁止紫色、陰影與光暈

- 嚴禁在按鈕、toggle、tab、icon control、selected、hover、focus ring、border、background、gradient 或 shadow 使用紫色、紫羅蘭、靛色、洋紅或任何偏紫色相；light/dark theme、fullscreen toolbar 與 mobile view-mode 均適用。
- selected control 僅可使用 Pixiv brand semantic roles（`--brand-*`、`--header-primary`、`--viewer-primary` 或對應 token）的克制 tint，或中性 HUD/surface；普通控制項維持中性。
- 不得透過 `color-mix`、opacity、gradient、shadow、glow、utility class 或硬編色值重新製造紫色效果；修改元件時必須移除殘留的 purple/indigo utility。
- 專案內禁止任何陰影或光暈設計：不得使用 `box-shadow`、`text-shadow`、`drop-shadow`、shadow utility、發光 focus ring 或彩色 halo；層次使用 border、surface、spacing，focus 使用 `outline`。
- UI 完成前必須搜尋修改範圍的紫色系色彩與陰影／光暈宣告，並檢查 selected、hover、focus-visible、disabled、light、dark、fullscreen 狀態。

## 文字大小與選取狀態規範

- 桌面一般 UI 文字最低為 14px（`0.875rem`）；手機一般 UI 文字最低為 15px（`0.9375rem`）。按鈕、tab、switch、表單標籤與導覽文字不得低於一般 UI 下限。
- 補充 metadata、數量、快捷鍵與說明文字可使用較小字級，但桌面不得低於 13px、手機不得低於 14px；手機的文字輸入、select 與 textarea 最低為 16px。
- 避免在 JSX 使用 `text-xs` 或任意 10–12px 字級製作主要操作文字；若是既有 utility，必須由 shared typography rule 對應到上述 token。
- 明確選取的 button、tab、toggle 與 mode control 使用對應 surface 的 `--*-primary` 背景與 `--*-primary-ink` 文字；hover／press 使用同一 semantic family 的狀態 token。導覽型非按鈕可使用單一 primary underline 或 hairline indicator，但不可用紫色 tint 代替選取。
- selected 狀態不可只靠低對比背景或文字變色表達；必須同時保留足夠對比、圖示／勾選／底線等非色彩線索，並通過 light/dark theme 檢查。

## 次要動作與按鈕幾何

- `secondary` 使用中性 filled surface，hover／press 維持原本背景、框線與文字色；`plain` 用於 reset、cancel、clear 等文字動作，所有狀態維持透明背景。兩者都不得加入 underline；selected、success、danger 等明確狀態除外。
- `ghost` 預設透明，hover／press 使用同一 subsystem 的中性 control surface；`IconButton` 多數使用此 variant，因此 hover／press 必須看得到圓形背景。
- 實體按鈕與 icon-only control 使用 shared rounded token（`--ui-control-radius` 或 `--ui-icon-button-radius`）；hover surface 必須沿用相同圓角，避免出現方形 hover 背景。導覽 tab 可保留 flat indicator，以維持其導覽語意。

## Shared button primitives

- New action controls should use `frontend/src/components/ui/Button.tsx` and its `Button` / `IconButton` exports instead of creating another local button geometry rule.
- `Button` variants are `primary`, `secondary`, `ghost`, `plain`, `success`, and `danger`; use a variant for semantic intent and use `size` for geometry. The default geometry is a full pill, while `IconButton` is a full circle.
- `IconButton` requires an accessible `aria-label`. Keep `tab` controls separate so their existing flat indicator is not changed by the action-button primitive.
- Local component CSS may only override semantic token scope or layout. It must not reintroduce a different radius, shadow, glow, underline hover, or color utility for a migrated button.
- Metadata and status labels should use `frontend/src/components/ui/Badge.tsx` and its semantic variants (`neutral`, `primary`, `hud`, `surface`, `success`, `danger`). Badges are non-interactive full pills; icon-only badges may use the circular `iconOnly` form.
- Webtoon floating controls must reuse `Button` / `IconButton` variants. Existing thumbnail and content page labels use the `current / total` format and follow `webtoonShowPageNumber`; collapsing the toolbar or hiding thumbnails must not create an additional persistent page HUD.

## Agent 交接：本次 Pixiv UI 調整的已實作基準

本節是目前程式碼的維護基準。若舊元件的局部 class、舊畫面截圖或舊報告內容與本節衝突，以本節、下列 shared primitive 與 semantic token 的實際實作為準。這些規則同時適用於 light／dark、desktop／mobile、fullscreen 與 webtoon reader。

### 先讀的檔案

- `frontend/src/index.css`：light／dark semantic tokens 的唯一主要來源。
- `frontend/src/components/ui/Button.tsx`、`frontend/src/styles/buttons.css`：所有 action button 與 icon-only control 的共用幾何、variant、狀態與 focus。
- `frontend/src/components/ui/Badge.tsx`、`frontend/src/styles/badges.css`：metadata、頁碼、組圖與狀態 badge 的共用元件。
- `frontend/src/styles/controls.css`、`frontend/src/styles/settings.css`、`frontend/src/styles/viewer.css`、`frontend/src/styles/webtoon.css`：只補 subsystem token scope 與 layout，不另造按鈕外觀。
- `docs/pixiv-ui-style-adjustment-report.md`：本次 Pixiv 視覺調整的背景、實作紀錄與驗收清單。

### 已完成且不可回退的行為

- 所有 action button 優先使用 `Button`；icon-only control 使用 `IconButton` 並提供可讀的 `aria-label`。variant 只有 `primary`、`secondary`、`ghost`、`plain`、`success`、`danger`，預設按鈕為完整膠囊，`IconButton` 為完整圓形。
- `primary` 只保留給主要動作或明確 selected；success／danger 只表達各自語意。一般控制項使用中性 token，不得用紫色、紫灰或多個高彩度填色競爭。
- `secondary` 的 hover／press 維持原本的中性 surface、框線與文字色；`plain` 用於文字型取消、重設、清除，所有狀態維持透明背景且不加 underline。Sidebar 的「取消選擇」與「重設所有」使用 `plain`。
- `ghost` 的 normal 維持透明，hover／active 使用對應 subsystem 的中性 control hover／press surface；`IconButton variant="ghost"` 必須保持圓形，不得出現方形背景或紫色效果。
- Tab 是導覽元件，不要改成 `Button`；保留 flat indicator／單一 primary underline。Tab 數量過多時使用水平滑動，不可讓內容被裁切。
- 所有 metadata、頁碼、組圖與影片 badge 使用 `Badge`，badge 是非互動資訊且以完整膠囊為主；不要自行建立另一套圓角、hover 或高彩度 badge。
- Settings modal 的關閉 X 使用 `IconButton`；「顯示與瀏覽」分為一般瀏覽、全螢幕模式、條漫模式。全螢幕包含 `fullscreenShowThumbnails`，條漫包含縮放、間距、資訊、頁碼與縮圖導覽設定。
- `fullscreenShowThumbnails` 只控制進入全螢幕時的橫式縮圖導覽預設值，仍可在 viewer toolbar 暫時切換；舊設定缺欄位時由 normalize／backend default 補成 `true`。
- Webtoon 既有縮圖與內容頁碼統一顯示 `current / total`，並受 `webtoonShowPageNumber` 控制；工具列收合或隱藏縮圖時不得額外新增常駐頁碼 HUD。條漫縮圖不得加黑框。
- Grid card 預設不顯示作品名稱，作品名稱只在 hover／focus 時顯示；作品 badge 仍使用 shared `Badge`。Footer、fullscreen toolbar、sidebar、settings、mobile menu 也必須沿用相同 button primitive。
- Settings config path 使用留白與低對比結構分隔，不用大型彩色色塊；搜尋圖示需保留固定空間避免文字錯位；分類 tab 必須可水平滑動。

### 強制視覺禁令

- 任何按鈕、toggle、tab、icon control、selected、hover、focus、border、background、gradient 或 HUD 都不得使用紫色、紫羅蘭、靛色、洋紅、fuchsia 或偏紫色相。
- 專案完全禁止 `box-shadow`、`text-shadow`、`drop-shadow`、shadow utility、glow、halo 與彩色發光 focus ring。focus 只使用 semantic `outline`；層次只用 token、border、spacing、對齊與 surface。
- 不可用 `color-mix`、opacity、gradient、硬編色值或 utility class 重新製造被禁止的紫色效果；修改元件時一併移除競爭的 `indigo`／`purple`／`violet`／`fuchsia` 色彩 utility。
- 外層容器與內層控制項遵守同心圓原則；shared rounded token 只能由 primitive 統一管理，local CSS 不得重新定義另一種按鈕半徑。

### Agent 交付前檢查

1. 先用 `rg` 檢查修改範圍的紫色系 class／色值、shadow／glow 宣告，以及 Tailwind utility 是否覆蓋 semantic rule。
2. 檢查 normal、hover、active、selected、focus-visible、disabled；至少涵蓋窄手機、一般 desktop、長文字、light／dark、fullscreen 與 webtoon。
3. 確認 tab、dropdown、搜尋列、modal X、footer 分頁與 icon-only control 沒有位移、裁切或不可水平滑動；檢查鍵盤 focus、Escape、focus trap、touch target 與 reduced motion。
4. UI 或 CSS 變更在 `frontend/` 工作目錄執行 `..\.runtime\pnpm\pnpm.cmd build`；文件變更至少執行 `git diff --check`，並在交付時回報尚未做的實際 render 驗證。
