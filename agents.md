# Web Viewer UI Design Rules

以下規則適用於本專案所有新的 UI 與既有 UI 調整。功能、互動流程與資料行為維持原本設計，除非需求明確要求變更。

## 禁止的視覺語言

- 禁止使用像引用區塊（quote / blockquote）的設計：包含左側或右側粗色線、靠在線上的圓角容器、以斜線分隔標籤與內容，或把一般資訊包成引用卡片。
- 不要用裝飾性的直線取代層級。優先用留白、對齊與字級建立群組；只有真正表示結構分隔時才使用低對比 hairline divider。
- 禁止背景、框線、文字與 hover 色彩互相不協調的按鈕或區塊。每個元件的 surface、border、text、accent 必須來自同一組語意 token，不能各自拼湊不同色相。
- 同一個畫面不要讓多個普通按鈕都使用高彩度填色；填色 accent 僅保留給主要動作或明確的選取狀態，其餘控制項使用中性 surface。
- 巢狀圓角需符合同心圓原則：外層圓角應大於內層，避免相鄰容器使用相同圓角造成卡住或不協調的邊角。

## 實作要求

- 優先沿用既有 semantic tokens 與 light/dark theme，不在單一元件硬編新的色彩。
- 用一致的 spacing、shared edges 與自然留白建立階層；不要用額外背景或邊框堆疊層次。
- 邊框只用於結構分隔、輸入框、選取與 focus 狀態；純粹為了製造立體感時使用低對比 shadow。
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
- 使用 border 表示結構、選取或 focus；單純的層次使用低對比 shadow，不用多層邊框堆出立體感。
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
4. 執行 `pnpm.cmd build`，確認 TypeScript 與 Vite build 通過，再回報實際修改檔案與尚未完成的視覺驗證。
