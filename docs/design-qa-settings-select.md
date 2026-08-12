# Settings 與文字選取 Design QA 紀錄

日期：2026-08-10
狀態：完成（semantic selection、共用 CustomSelect、native drag、主要 render gate、reduced-motion reduce／no-preference recovery 與 light／dark soft-danger contrast 均已完成；新增檔案 stage／commit 仍由使用者掌控）

## 1. Select 共用元件確認

結論：已共用同一個 component，無需另做 component 重構。

- `frontend/src/components/CustomSelect.tsx` 是目前共用的自訂 select 元件。
- `frontend/src/components/SettingsModal.tsx:1205` 與 `:1217` 的「主題」及「偏好的瀏覽模式」都使用 `CustomSelect`。
- `frontend/src/components/GalleryGrid.tsx:781` 與 `:797` 的 context bar「排序」及「每頁」也使用同一個 `CustomSelect`。
- 共用幾何、focus、menu、option 與 selected 狀態規則集中在 `frontend/src/styles/controls.css`；Settings 與 Gallery 只透過 scope token 使用各自的 surface 語意色：
  - `.settings-modal .ui-select-wrap` 使用 `--settings-*`。
  - `.gallery-context-shell .ui-select-wrap` 使用 `--viewer-*`。

因此目前是「同 component、不同 subsystem semantic token」，不是兩套 select 樣式。這符合共用元件與 surface token 的設計方向。

補充：Settings「一般瀏覽」中的「每頁顯示數量」目前是 `Input type="number"`，它是儲存預設值的設定欄位；Grid context bar 的「每頁」是即時分頁控制，因此兩者不是同一個控制項。若未來要把 Settings 的數字欄位也改成選項式 select，應另立功能需求。

## 2. 字體選取反白顏色

現況（已實作）：

- `frontend/src/index.css:290` 已有全域 `::selection`。
- 目前 `--text-selection-surface` 在 light 使用品牌色與 surface 的 24% mix，在 dark 使用 38% mix（`frontend/src/index.css:49`、`:234`）。
- light／dark 都直接使用品牌 semantic roles；沒有在 selector 內硬編色值。

已完成內容：

- 將 `--text-selection-surface` 改為 `var(--brand-default)`。
- 將 `--text-selection-text` 維持／對齊 `var(--brand-ink)`，讓反白文字沿用品牌主色按鈕的可讀文字角色。
- light／dark 都使用 semantic token，不在 selector 內新增硬編色值，不新增陰影、光暈或紫色系色彩。
- 僅調整 `frontend/src/index.css` 的 selection token；沒有改變 `CustomSelect`、Settings 資料流或 Gallery 行為。

## 驗收條件

- 在 light／dark theme 的一般頁面、Settings modal、Gallery context bar、fullscreen 與 webtoon 文字上拖曳選取，反白背景呈現 `--brand-default`。
- 反白文字與品牌背景保持可讀，並確認瀏覽器原生 selection 行為沒有被移除。
- CustomSelect 的 normal、hover、selected、focus-visible、disabled 狀態與此次 selection token 修改互不影響。
- 變更後執行 frontend build 與 `git diff --check`；並搜尋修改範圍，確認沒有引入 purple／indigo／violet／fuchsia、shadow 或 glow。

## 3. 按下縮放 QA

結論：一般 action button 與 CustomSelect 的按下縮放相同，都是 `scale(0.96)`。

- 一般 `Button`／`IconButton` 由 `frontend/src/styles/buttons.css:211-212` 統一套用 `.ui-button:active:not(:disabled) { transform: scale(0.96); }`。
- `CustomSelect` 的 trigger 本身就是 `Button`，因此也沿用 `scale(0.96)`。
- CustomSelect menu option 另由 `frontend/src/styles/controls.css:444-445` 套用 `scale(0.96)`。

Settings 內有一個容易造成視覺誤判的例外：分類 tab 與 section tab 不是 shared `Button`，而是既有導覽 tab。`frontend/src/styles/settings.css:620-622` 的後置規則將 `.settings-modal__tab` 與 `.settings-modal__section-tab` 的有效按下縮放覆寫為 `scale(0.98)`；這代表它們縮小較少，不是縮小較大。若感覺 Settings 的一般動作按鈕與 CustomSelect 不一致，應先確認點擊的是 action button 還是 tab。

決議：保留 Settings 分類 tab／section tab 的 `scale(0.98)`；它們是導覽控制，不強制套用 action button／CustomSelect 的 `scale(0.96)`。這個差異是導覽／動作語意的刻意區分，不再列為待處理 CSS 項目。

本文件是 living QA input；上方實作結論與下方最新 verification log 共同描述目前狀態，未勾選項目才是仍待補的人工 gate。

## 4. 2026-08-10 verification log

此文件是 living input；後續更新以最新的 UI 實作與驗收紀錄為準。

- [x] `CustomSelect` 仍由 Settings 與 Gallery 共用，Settings 與 Gallery 各自使用 subsystem semantic token。
- [x] Light/dark theme 的 `--text-selection-surface` 與 `--text-selection-text` 已對齊 brand semantic roles；實際瀏覽器 computed values 為 `#0096fa` 與白色 ink。
- [x] Desktop Settings tab、CustomSelect open/selected/Escape、fullscreen、webtoon 與 Gallery month/year/filter/reset 已完成實際 render smoke check。
- [x] Settings 四個 tab 的 panel boundary、shared `Button`／`IconButton`／`Badge` 與 focus trap 仍由同一份 component／style contract 維護。
- [x] Settings 的 artist visibility refresh 已實際驗收：隱藏 `ブルアカケー` 後 sidebar artist count 由 18 變 17；在「已隱藏繪師」按「恢復顯示」後回到 18，artist button 恢復。
- [x] Settings job normal lifecycle 已實際驗收：從 UI 啟動選取繪師工作、按「取消工作」、看到 `圖片資料庫更新已取消` 與已保留進度，關閉／重開 Settings 後 terminal feedback 仍存在。
- [x] reduced-motion 的 JavaScript branch 已集中到 `frontend/src/utils/motion.ts`，並由 `motion.test.ts` 驗證 reduce／no-preference／缺少 `matchMedia` 三種狀態；`scripts/check-reduced-motion.py` 再驗證 10 個 CSS selector/declaration contract；Chrome media-emulation session 的 reduce mode 也已完成實測。
- [x] Native drag text selection：Chrome extension session 在 Settings 說明文字上以實際滑鼠 path 產生非空 selection range，`::selection` token 與 `Ctrl+A` 也已驗證。
- [x] Reduced-motion：Chrome reduce mode 實際動態驗收通過；同一 Chrome process 的 no-override tab 也確認 `no-preference=true`，CustomSelect 一般 animation `0.14s` 與 Webtoon toolbar 一般 transition `0.16s` 恢復。
- [x] Alert／danger note contrast：Chrome 實際開啟縮圖回收確認對話框，light computed `--settings-danger-text`／`--settings-danger-soft` 對比為 `9.53:1`，dark 為 `7.68:1`；取消操作後未產生 runtime error／warning，原本的 soft-danger 低對比組合已移除。

補充驗證（2026-08-10 media-emulation continuation）：接手使用者 Chrome 分頁後，`matchMedia('(prefers-reduced-motion: reduce)').matches` 為 `true`、`no-preference` 為 `false`；viewport 為 `1227 × 927`、DPR `1.25`，Gallery 46/46 圖片載入且 0 broken。Settings 四個 tab、CustomSelect open／Escape、month/year/filter/reset、fullscreen `1 / 16` 與 webtoon 均在 reduce mode 實際操作；CustomSelect menu、fullscreen stage／media 與 webtoon toolbar 的 computed animation 均為 `none`／`0s`，transition 縮短至 `0.01ms`。同一 Chrome process 的 no-override tab 回報 `no-preference=true`、CustomSelect menu animation `custom-select-menu-in / 0.14s`、Webtoon toolbar transition `0.16s`，證明一般 motion 恢復；兩個 clean reload 與 Webtoon regression smoke 均沒有新增 warning/error。累積 log 中的舊 `activeIndex before initialization` 來自第一次 HMR patch 順序錯誤，已由 TypeScript/build 修正並記錄於 regression log。

Webtoon spec update（2026-08-10）：toolbar 收合或隱藏直式縮圖後，右下角不顯示額外的 `current / total` page HUD；`current / total` 僅保留在既有縮圖／內容頁碼呈現，並依 `webtoonShowPageNumber` 設定控制。已移除先前為回應 regression 暫加的 `WebtoonFeed.tsx` persistent `Badge` 與對應 CSS，clean reload 後無新增 runtime log。

下一次可用的 media-emulation session 請依下列 gate 驗收：

1. 將瀏覽器偏好設為 `prefers-reduced-motion: reduce`，重新載入 Gallery。
2. 確認 `matchMedia('(prefers-reduced-motion: reduce)').matches === true`，並操作 Settings tab、CustomSelect、month jump、fullscreen 與 webtoon。（已完成）
3. 確認 CSS transition／spinner／toolbar animation 停止或縮短至 reduced branch；再以 no-override tab 確認一般 transition／animation 恢復。（已完成）
4. 將實際 session、viewport、computed style 與 runtime log 寫回本節。（已完成）

補充：backend restart recovery 已以 persistent job/API gate 實際驗證 `status=interrupted` 與 `Backend restarted; run the library job again`；Chrome session 也已 render 同一 persisted interrupted payload 的 Settings terminal panel，驗證用 fixture 隨後還原為 completed。

## 5. Alert／提示文字顏色 QA

新增檢查規則：所有 alert、danger note、error message 與 destructive confirmation 內的文字顏色，必須在 light／dark theme 分別和實際背景 token 配對檢查；不能只看色相正確，也不能只在 light theme 驗證。

目前已確認一個與提供截圖相似的風險，並已完成修正：

- `frontend/src/components/SettingsModal.tsx:1934` 的 `.settings-modal__danger-note` 使用 `--settings-danger-text` 文字 token。
- `frontend/src/styles/settings.css:415-418` 現在以 `color: var(--settings-danger-text)` 搭配 `background: var(--settings-danger-soft)`。
- 依目前 OKLCH token 量測，原本 light theme 的 `--status-danger` 對 `--status-danger-soft` 為 5.05:1；dark theme 為 1.99:1，低於一般文字 WCAG AA 4.5:1。截圖中的暗色紅底配暗紅字就是這類可讀性問題。

已實作方向：

- danger 語意由 icon、border、區塊標記與文字內容共同表達，不要求所有提示文字都使用 danger 色。
- soft danger surface 上的說明文字改用專用的 `--status-danger-text`／`--settings-danger-text` token：light 為 `oklch(0.37 0.14 25)`，dark 為 `oklch(0.86 0.06 25)`。
- filled danger button 仍使用 `--*-danger` 背景與 `--*-danger-ink` 文字；不要把 button 的文字 token 直接套到 soft alert，兩者是不同背景配對。
- `settings-modal` error message、field error、danger icon／note、Recycle Bin error、media issue、onboarding error 與 danger badge 均已改用該文字 token；每次新增或修改 alert／error／warning UI，都要檢查 normal、focus、disabled、light、dark，以及長文字換行後的可讀性。

驗收條件：

- 暗色 theme 的 danger note／alert 文字達到至少 4.5:1；較大字級或非正文提示至少記錄實際對比結果。
- alert 的文字不依賴紅色本身傳達完整意思，仍保留可讀的說明、icon 或其他非色彩線索。
- 對照提供的截圖，不再出現「紅底配低對比暗紅字」的組合。
- 已更新 `frontend/src/index.css`、`frontend/src/styles/settings.css`、`frontend/src/styles/recycle-bin.css`、`frontend/src/styles/badges.css`、`frontend/src/styles/controls.css` 與 `frontend/src/styles/onboarding.css`；未改變 JSX 資料流或 destructive action 行為。
