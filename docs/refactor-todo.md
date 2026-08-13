# Web Viewer Refactor 歷史紀錄

> 狀態：歷史 refactor 紀錄。本文中的行數、working tree 數量、測試數量與「下一個入口」只代表當日快照，不是目前實作契約。
>
> 現況先讀 `docs/ai-agent-project-map.md`；i18n／雙頁重構後續讀 `docs/frontend-refactor-i18n-spread-reader-plan.md`；Gallery 全域載入讀 `docs/global-gallery-navigation-contract.md`。歷史媒體資料庫背景仍保留在 `docs/media-library-implementation-todo.md`。

最後一筆歷史更新：2026-08-11

## 審查結論

目前提案的方向合理，但不建議照原順序直接繼續大型拆分，需先補上行為保護與明確的依賴順序。

- 目前 `main` 與 `origin/main` 都在 `bfe2de9`，沒有額外 branch commit 可比較；本次審查對象是尚未提交的 working tree 變更。
- 已完成的 dead code 移除、media helper、strict TypeScript、request lifecycle、typed client、workflow／service boundary 抽取可保留；本批完成後 2026-08-10 gate 為 frontend 20 files／71 tests、backend 62 tests、TypeScript／build／py_compile／`git diff --check` 均通過。
- request lifecycle 已有 unit coverage，並完成 desktop／mobile gallery、Settings、fullscreen、webtoon 的實際 render 與主要互動驗收；job UI 的正常啟動／取消／完成／重開與 interrupted render 也已實測。gallery long-task 已由 page-owned QA probe 關閉；reduced-motion reduce／no-preference recovery 均已在 Chrome process 實測通過；新增檔案 stage／commit 仍由使用者掌控。
- 原提案把 frontend 測試、typed API client 與 schema 統一排在大型元件拆分之後，順序風險過高。應先建立 characterization tests 與 API 邊界，再逐一拆 controller、workflow、view。
- `backend/main.py` 不宜先按 route 檔案機械切割。應先建立 runtime/source context 與 domain service 邊界，再讓 route module 依賴 service；否則只是把 `db.py`、mutable global 與 job manager 的耦合分散到更多檔案。

## 2026-08-10 交接核對

- working tree 實際為 33 個 tracked modified、70 個 untracked files、0 staged；本次新增 route characterization、performance fixture 與 viewer regression tests 後重新以 `git ls-files --others --exclude-standard` 計數，`docs/refactor-todo.md` 本身也仍是 untracked。所有既有修改均保留，未 stage、未 commit。
- `git diff --check` 通過；`frontend/src` 與 `backend` 的非測試 source 範圍未找到 `TODO`／`FIXME`。
- frontend `pnpm.cmd test -- --run` 實測 20 files／71 tests 通過；backend `uv run --directory backend python -m unittest discover -s tests -v` 實測 62 tests 通過。
- `SettingsModal.tsx` 的 library jobs、web config、Pixiv config 與 thumbnail cache stats／entries／restore／recycle JSON 操作已統一經過 typed client、runtime parser、`ApiError` 與 request cancellation；preview 圖片仍直接使用原 API URL。
- 已新增 `SettingsModal.test.tsx` 覆蓋 thumbnail cache stats／entries 的 aborted／stale response；本批再以 `WebtoonFeed.test.tsx`、`FullscreenViewer.test.tsx` 固定 collapsed toolbar／HUD、keyboard focus、dialog focus trap 與 mobile layout，人工 render 紀錄仍保留作視覺驗收。
- `backend/main.py` 現為 746 行，`backend/db.py` 為 2713 行，`backend/library_jobs.py` 為 1397 行。`main.py` 剩餘 system session／picker、media file／thumbnail／Windows open、ZIP、batch trash/delete 與 recycle-bin routes 已由 `test_main_http_routes.py` 的 8 個 ASGI HTTP characterization tests 固定 path containment、recoverable trash、Windows-only guard 與 response contract。
- `.github/workflows/web-viewer.yml` 在 Ubuntu 執行 frontend lint／test／build、backend tests／compile、reduced-motion contract 與 performance threshold gate；`.github/workflows/ci-cd.yml` 改為 Windows picker/media/recycle-bin targeted coverage，frontend build 限定 release tag 以保留 Windows release artifact gate。
- `scripts/measure-web-viewer-performance.py` 現在提供可設定 threshold 並在超標時返回 exit code 1；`performance-fixture-server.py` 供 CI gate 使用，live dataset baseline 仍由人工／本機量測補充。
- `docs/media-library-implementation-todo.md:3` 已明示為歷史實作規格；其中未勾選項目不列入本文件的現行功能缺口。

## 維護規則

- 狀態只使用 `待辦`、`進行中`、`完成`、`阻塞`；同一時間只保留一批 `進行中`。
- 完成項目必須記錄實際檔案與當次驗證命令；「每批完成條件」是 gate，不以永久未勾選項目表示。
- 每批只處理一個可回退的責任邊界；不把架構拆分、功能變更與無關 UI 改版混在同一批。
- 抽取前先加入 characterization test，抽取後保留 public API／props／事件名稱與資料行為；若要改行為，另立項目處理。
- 新增檔案在提交前必須確認已納入版本控制。目前本批新增的 tests、API、hooks、contract 文件、page-owned QA probe（`scrollPerformance.ts`／test）、`vite-env.d.ts` 與三份 living docs 仍由 `git status --short` 顯示為 untracked；未經使用者要求不代為 stage／commit。
- UI 變更仍須遵守 semantic token、無紫色、無陰影／光暈、shared primitive、responsive 與 accessibility 規則。

## 持續更新的 Design QA 輸入

- `docs/design-qa-settings-select.md` 是會持續更新的 QA 規格；每次 Settings 或文字選取相關 UI 批次開始前都必須重新閱讀。
- [x] 已確認目前 Settings 與 Gallery 共用 `CustomSelect`，不另做 select component 重構。
- [x] 已將 `--text-selection-surface`／`--text-selection-text` 對齊 `--brand-default`／`--brand-ink`，並保留 semantic token；沒有修改 `CustomSelect` 資料流或另造 select component。
- [x] 已實測 CustomSelect 的 normal、selected、expanded option、Escape 關閉，以及 Settings 在 desktop／mobile 的顯示。
- [x] 原生拖曳反白已由 Chrome extension session 在 Settings 說明文字上成功產生 selection；computed `::selection` 顏色與鍵盤 `Ctrl+A` 也已驗證。
- [x] 已依 living QA 修正 soft-danger 文字對比：新增 `--status-danger-text`／`--settings-danger-text`，light／dark danger note 實測為 `9.53:1`／`7.68:1`，並同步套用 Settings、Recycle Bin、media issue、onboarding 與 danger badge。

## 目前 working tree：已完成實作

- [x] 移除 `backend/db.py` 中 `get_images()` 永遠不會執行的 legacy fallback。
- [x] 移除 legacy fallback 專用且已無呼叫點的檔案掃描、direct media 與 month filter helpers。
- [x] 新增 `frontend/src/utils/media.ts`，統一 media URL 與既有 `.mp4` 影片判斷邊界。
- [x] 清理前端 unused imports、props 與失效 fullscreen work-group 導覽邏輯。
- [x] 啟用 frontend TypeScript `noUnusedLocals` 與 `noUnusedParameters`。
- [x] 以 `WebConfigDraft` 統一 `SettingsModal` 與 shared web config 欄位型別。
- [x] 將 `App.tsx` 的圖片分頁、cache、request deduplication、取消請求與 prefetch 抽至 `frontend/src/hooks/useImagePageLoader.ts`。
- [x] 將 `SettingsModal` 的 library job polling、timer 與 terminal state handling 抽至 `frontend/src/hooks/useLibraryJobPolling.ts`。
- [x] 新增 Vitest／jsdom／Testing Library 最小測試環境：`frontend/package.json`、`frontend/vite.config.ts`、`frontend/src/test/setup.ts`。
- [x] 補 `useImagePageLoader` 與 `useLibraryJobPolling` request lifecycle tests，涵蓋 deduplication、LRU、cache generation、speculative cancel、stale response、unmount／StrictMode cleanup、polling terminal/error/close/reopen/interrupted。
- [x] 建立 `frontend/src/api/client.ts`、`frontend/src/api/parsers.ts`，將 library jobs、web config、image page endpoints 遷移到 typed client 與 runtime validation。
- [x] 以 `frontend/src/hooks/useWebConfigController.ts` 集中 Settings 的 web config load、draft、dirty、normalize、save 與 source-change gate，並以 `useWebConfigController.test.tsx` 固定 load/save contract。
- [x] 建立 `docs/web-config-contract.md`、`backend/tests/test_web_config.py`，對齊 frontend normalize/default、backend validation/migration 與 `web_config.example.json`。
- [x] 依 `docs/design-qa-settings-select.md` 更新 `frontend/src/index.css` selection token，並移除 `frontend/index.html` 的紫色 selection utility。
- [x] 2026-08-10 automated checks：`pnpm.cmd lint`／`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd test`（16 files／57 tests）、`pnpm.cmd build`、backend unittest（52 tests）、`py_compile`、`git diff --check`。

## 合併目前 working tree 前的補強批次

### 批次 0A：補 request lifecycle 行為保護

狀態：完成（實作與 automated gate 完成；共同的新增檔追蹤 gate 尚待提交前處理）

- [x] 為 frontend 建立最小 unit test runner 與 DOM／fetch 測試環境；未同時導入 lint 改版。
- [x] 為 `useImagePageLoader` 補 characterization tests：cache hit、同 key deduplication、LRU 上限、navigation／speculative cancel、過期 response 不覆蓋目前頁面。
- [x] 將 cache invalidation 定義為 generation bump + abort 在途 page requests，避免舊 response 在 artist／source／library refresh 後回填 cache。
- [x] 為 hook unmount 增加在途 request cleanup，並測試 abort 不留下 loading state 或未處理 rejection；另補 React StrictMode effect replay regression test。
- [x] 為 `useLibraryJobPolling` 補 queued → running → terminal、error、close、reopen、unmount 與 backend `interrupted` tests。
- [x] polling 使用 `AbortController` 與 polling generation，防止 modal 關閉／unmount 後 response 再排入 timer 或更新 state。
- [x] 驗收：5 個 frontend test files／23 tests、TypeScript、frontend build、backend 38 tests、`git diff --check` 全部通過。

實際檔案：`frontend/src/hooks/useImagePageLoader.ts`、`frontend/src/hooks/useImagePageLoader.test.ts`、`frontend/src/hooks/useLibraryJobPolling.ts`、`frontend/src/hooks/useLibraryJobPolling.test.ts`、`frontend/src/test/setup.ts`、`frontend/package.json`、`frontend/vite.config.ts`。

補充：實際 render 時發現 React StrictMode effect replay 會讓首次 gallery loading 被 cleanup 狀態誤傷，已在 `useImagePageLoader` 修正並以測試固定；這是本批發現並修復的 lifecycle 行為，不是 UI 改版。

### 批次 0B：補目前變更的實際驗收

狀態：完成（實作、automated gate 與 browser reduce／no-preference gate 完成；新增檔案 stage／commit 仍由使用者掌控）

最後 gate：Chrome DevTools media emulation 的 `reduce` mode 與同一 Chrome process no-override tab 的 `no-preference` recovery 均已完成；交付前新增檔案是否 stage／commit 仍由使用者掌控。

- [x] 已實測 gallery 初次載入、下一頁／第一頁、月份點擊與重設條件；畫面實際顯示作品與分頁數量。
- [x] 已實測月份尺 keyboard jump／settle、快速換 month/year/filter 與 reset；月份 pointer scrub 仍受 browser CUA 能力限制。
- [x] 已用實際 Settings UI 走完 artist hide／unhide 後 refresh：`ブルアカケー` 隱藏後從 sidebar 消失（18 → 17），在「顯示與瀏覽／已隱藏繪師」按「恢復顯示」後回到 sidebar（18）。
- [x] 已用實際 Settings UI 走完既有 job 接回、啟動／取消、完成與工作中關閉後重開；選取 `Discord FANBOX Archive comodox` 的背景更新實際由 UI 取消，backend 回報 `cancelled` 且 UI 顯示已保留完成進度，重開 Settings 後 terminal 狀態仍可見。hook/backend automated coverage 已通過。
- [x] backend restart `interrupted` 的 API recovery gate 已實測（job `05399ae8-c59a-4608-aa38-4f28bf0f02ca` 回報 `status=interrupted`、`phase=interrupted`、`Backend restarted; run the library job again`），Chrome session 也已把 persisted interrupted terminal state 在 Settings UI render 出來；驗證用 fixture 已還原為 completed。
- [x] 已實測 desktop／mobile、dark／light、fullscreen、webtoon；fullscreen 的 Escape、gallery disabled pagination、Settings dialog／CustomSelect Escape 也已確認。
- [x] reduced-motion 的 reduce mode 已在 Chrome 實測 `matchMedia=true`、Settings／CustomSelect／month/year/filter／fullscreen／webtoon 與 computed styles 通過；同一 Chrome process no-override tab 已驗證 `no-preference`、CustomSelect `0.14s` 與 Webtoon toolbar `0.16s` 恢復。native drag text selection 已在 Chrome extension session 成功產生 selection；computed `::selection` 為 `#0096fa` + `brand-ink`，`Ctrl+A` 可選取文字。
- [x] 已搜尋 `frontend/src`、`frontend/index.html`、`backend` 的紫色系與 shadow／glow 宣告；無 UI 命中（backend test 的 invalid enum fixture 不使用色彩 token）。
- [ ] 62 個新增檔案目前仍由展開後的 git status 顯示為 untracked；已確認清單可見，但 stage／commit 仍由使用者掌控。

實際 render 紀錄（2026-08-10）：

- desktop gallery：作品卡、月份尺、篩選／分頁正常；點擊作品可開啟 16 頁組圖 dialog。
- fullscreen：實際載入作品，底部縮圖列與 `1 / 16` 頁碼可見，Escape 可返回 gallery。
- webtoon：實際載入作品，直式縮圖導覽與既有 `current / total`（例如 `1 / 16`）可見；隱藏縮圖或讓 toolbar 收合後，右下角不顯示額外的頁碼 HUD，返回作品清單正常。
- mobile `390 × 844`：header、filter summary、兩欄 gallery、功能選單與 Settings modal 可操作；Settings tabs 以水平內容呈現，CustomSelect option／selected／Escape 正常。
- light／dark：實際切換成功；selection CSS variables 兩者均沿用 brand semantic token。

本批整合驗收已完成；仍未完成的正式項目統一列於文件末尾「建議後續順序」，不再把 stage／commit 誤寫成唯一入口。

## 建議實作順序

### 第 1 階段：測試與 API 邊界

1. [x] 完成批次 0B 的最後人工 gate；job 正常 lifecycle、backend restart `interrupted` UI render、native drag、gallery long-task probe 與 reduced-motion `reduce`／`no-preference` gate 均已固定；新增檔案 stage／commit 仍由使用者掌控。
2. [x] 建立共用 typed API client：集中 base fetch、JSON decode、HTTP error、AbortError 與 malformed response handling；已先遷移 library job、web config 與 image page endpoints。
3. [x] 移除 `normalizeImagePage(data: any)` 的 `any`，為 gallery page、month index、library job 與 config response 建立 runtime parser／type guard；外部資料在 API 邊界驗證，不在元件內直接斷言。
4. [x] 建立 web config contract matrix，逐欄對照 frontend type/default/normalize、backend default/validation 與 `web_config.example.json`；已補欄位、min/max 與舊設定 migration tests。
5. [x] 以 `.github/workflows/web-viewer.yml` 將 frontend lint／unit／build、backend unittest 與 `py_compile` 接入 CI；lint 維持獨立 script。

本輪 API／contract 實際檔案：`frontend/src/api/client.ts`、`frontend/src/api/parsers.ts`、`frontend/src/api/client.test.ts`、`frontend/src/api/parsers.test.ts`、`frontend/src/utils/webConfig.ts`、`frontend/src/utils/webConfig.test.ts`、`frontend/src/types.ts`、`backend/main.py`、`backend/tests/test_web_config.py`、`docs/web-config-contract.md`。本輪 frontend／backend automated gate 已通過；Settings thumbnail cache endpoints 已於本批完成 typed migration。

### 第 2 階段：Settings 與 library job

1. [x] 初步抽出 `useWebConfigController`，只負責 load、draft、dirty state、save、normalize 與錯誤；已以測試固定 source signature 與 source-change gate。save confirm／close prompt 仍由 parent wiring 驗收。
2. [x] 建立單一 `useLibraryJobStore`，統一 App、Settings、Onboarding 的 current job、事件同步與 polling owner；modal 關閉後由仍掛載的 App subscriber 持續監看，重新開啟時同步同一份 snapshot。
3. [x] 依 Web、Library、Pixiv、Backup 拆 `SettingsModal` 子元件；父元件保留 tab、dialog、focus trap 與 controller wiring，props 使用明確 callback／view model。
4. [x] 每個 tab boundary 都保留 save、close prompt、job、backup/restore、keyboard 與 responsive characterization／render gate；最新結果記錄於 `docs/ui-render-regression.md`。

### 第 3 階段：App workflows

1. [x] 抽出 `useWebConfigLifecycle` 與 typed persistence；以 API parser／contract tests 固定載入、normalize、save 與錯誤邊界。
2. [x] 抽出月份排序／target resolve 與 filter URL state；App 仍是唯一組合層，scrub async settle 保留 generation／cancel gate。
3. [x] 抽出 `useSelectionWorkflow`，並以 typed client 分開 trash 與 ZIP download commands；測 selection 清除、partial failure、取消與完成後 refresh。
4. [x] 每個 workflow 保持 `App.tsx` 為唯一組合層，不在 hook 間建立隱性 window event 或循環依賴。

### 第 4 階段：Viewer 子系統

1. [x] `FullscreenViewer.tsx` 已分離 filmstrip 純計算與共用 media admission lifecycle；thumbnail rail／toolbar public behavior 保留。
2. [x] `WebtoonFeed.tsx` 已分離純 layout/index 計算與 `useViewerMediaAdmission`；current/total、縮圖導覽與 scroll restoration 行為保留。
3. [x] 已完成 image、video、missing media、grouped manga、快速導覽、mobile 的 automated／render gate；reduced-motion `reduce` mode 與 no-preference recovery 均已完成 browser session 驗收。

### 第 5 階段：Backend 邊界

1. [x] source switching、Pixiv read-only、folder-only、gallery filters、trash restore、job cancel/restart 已由 backend characterization／media library tests 固定。
2. [x] `RuntimeContext`／`MediaSourceService`／`GalleryService`／`LibraryJobService` 由 application lifespan 建立並注入；既有 `db.PIXIV_DB_PATH` fixture contract 暫保留以避免跨批行為變更。
3. [x] 先抽出 `GalleryService` read boundary，並保留 `db.py` facade；gallery query、artists、months 已由 route／App 逐步遷移。
4. [x] `LibraryJobService` 已包住 job lifecycle、thumbnail cache stats／recovery／restore façade；`library_jobs.py` 內部 worker 與 cache implementation 暫不混拆。
5. [x] domain service 與 context 穩定後，已拆出 `web_config`、`pixiv_config`、`directory`、`library_jobs` routers；route 只負責 validation、service call 與 response mapping，media／trash／Windows integration 保留在下一個相容批次。
6. [x] 移除 gallery read route 的 `main.py` 過渡 facade，改由 `routes/gallery.py` 依賴 `GalleryService`；補 API route registration／service mapping smoke tests、並行 SQLite WAL／busy-timeout lock test 與 folder source switch regression test。

## 後續品質與效能項目

- [x] 為主要 API response 與 domain model 移除其餘不必要的 `any`：frontend `src/` 已無 TypeScript `any`，typed client／runtime parser 已涵蓋主要 API，`RuntimeContext` 也改為明確 service types；backend 舊 `db.py`／job payload 的動態 dict 仍保留 `Any` 作為相容資料邊界，待另一次 schema migration，不再擴散到新 route／client。
- [x] 建立 frontend lint script；`pnpm lint` 以 TypeScript no-unused baseline 執行，並已接入 CI。
- [x] 建立可重複效能量測：`scripts/measure-web-viewer-performance.py` 可量測 `/api/images`、縮圖與 optional library job；2026-08-10 以 200-item page／20 thumbnails／320px／14,367 張索引實測 API p95 473.4 ms、thumbnail p95 165.1 ms、library job 3,672 ms（14,367 / 14,367、0 errors）。
- [x] 將暫定 threshold（API p95 < 750 ms、thumbnail p95 < 500 ms、unchanged library job < 10 s）實作成可設定且超標會回傳非零 exit code 的 gate，再接入適合的 CI job；`measure-web-viewer-performance.py` 提供三個 threshold flags，`web-viewer.yml` 以 deterministic fixture 執行實際 gate，超標 smoke 已確認 exit code 1。
- [x] gallery scroll long-task responsiveness：`frontend/src/utils/scrollPerformance.ts` 僅在 Vite dev 且帶 `?qa-scroll-performance=1` 時啟用 page-owned `PerformanceObserver`；Chrome 三段實際 viewport scroll 回報 `600 → 1200 → 1532`、46/46 loaded、0 broken、0 long task、max 0 ms。
- [x] 建立可重複的 mobile、desktop、light/dark、fullscreen、webtoon render regression 流程，記錄於 `docs/ui-render-regression.md`。
- [x] 修改範圍已清除 purple/indigo、shadow/glow 與競爭 utility；fallback SVG 已改用品牌藍與中性 token，並以 scoped `rg` audit 驗證。
- [x] reduced-motion static contract：補上 CustomSelect menu、thumbnail skeleton/image 與既有 spinner 的 reduce overrides；`scripts/check-reduced-motion.py` 通過 10 個 selector/declaration rules，並以 Chrome media-emulation／no-override sessions 實測 reduce computed styles 與一般 transition recovery。

## 每批完成 gate

每一批只有在以下條件均有記錄時才能標為完成：

- 變更範圍與非目標行為已寫清楚，且沒有混入無關 UI／功能調整。
- 新增或更新的 characterization／unit／integration tests 通過。
- 在 `frontend/` 執行 `pnpm.cmd exec tsc --noEmit` 與 `pnpm.cmd build` 通過。
- backend unittest suite 通過；涉及 backend import 邊界時另跑 `py_compile`。
- `git diff --check` 通過，並確認新增檔案已納入版本控制。
- UI 相關批次已記錄 normal、hover、active、selected、focus-visible、disabled、mobile/desktop、light/dark 的實際驗證；不適用時明確寫「無視覺變更」及檢查依據。
- 文件已更新實際檔案、測試數量／命令、尚未驗證項目與下一批唯一入口。

## 2026-08-10 refactor maintenance log

以下是本次依照安全順序實作後的最新 gate 狀態；本節會隨 `docs/design-qa-settings-select.md` 的後續更新一起維護，未勾選項目仍是交付前的實際限制。

- [x] Batch 0A/0B lifecycle：`useImagePageLoader`、`useLibraryJobPolling`、`useLibraryJobStore`、`useWebConfigLifecycle` request lifecycle tests；App／Settings／Onboarding 共用單一 job polling owner。
- [x] Typed API／runtime contract：`frontend/src/api/` 已涵蓋 image page、jobs、web config、directory metadata、source inspection、artist visibility、Pixiv config、backup、recycle bin、selection commands 與 Settings thumbnail cache 的 stats／entries／restore／recycle JSON endpoints；runtime parsers 有 malformed response tests。
- [x] Settings controller／tab boundary：`SettingsWebTab`、`SettingsLibraryTab`、`SettingsPixivTab`、`SettingsBackupTab`；保留 shared `Button`／`IconButton`／`Badge`／`CustomSelect`、focus trap 與 semantic tokens。
- [x] App workflows：filter URL parse/sync、month sort/target resolve、selection/download/trash workflow 已移至可測試 helper／hook；gallery metadata 改由 typed client 載入。
- [x] Viewer boundary：fullscreen filmstrip、webtoon metrics/thumbnail offsets 的純計算已移至 `frontend/src/utils/viewerLayout.ts`；兩種 viewer 共用 `useViewerMediaAdmission` lifecycle boundary；Webtoon toolbar 收合時不新增右下角 `current / total` HUD，既有縮圖／內容頁碼顯示維持原設定。
- [x] Recovery／motion boundary：`useLibraryJobStore` 在 transport error 後改以 1.5 秒 recovery poll，Settings cancel 改走 shared store sync；`frontend/src/utils/libraryJobPresentation.ts` 與 `frontend/src/utils/motion.ts` 各自固定 interrupted copy 與 reduced-motion JS branch。
- [x] Backend context/service：`RuntimeContext`、`WebConfigService`、`MediaSourceService`、`GalleryService`、`LibraryJobService`；`web_config`、`pixiv_config`、`directory`、`gallery`、`library_jobs` routers 已從 `main.py` 拆出。
- [x] CI／automated result：`.github/workflows/web-viewer.yml` 已接入 frontend lint／test／build、backend unittest／py_compile、performance threshold fixture gate 與 reduced-motion CSS contract；本機 frontend 20 files／71 tests／tsc／build、backend 62 tests／py_compile、performance pass/fail smoke、`git diff --check` 均通過。
- [x] Actual render record：desktop Settings／CustomSelect、light/dark token、Gallery month/year/filter/reset、fullscreen Escape、webtoon current/total 已記錄於 `docs/ui-render-regression.md`。
- [x] Alert／danger contrast gate：Settings 縮圖回收確認對話框在 light／dark 實際 render，soft-danger text 對比 `9.53:1`／`7.68:1`，取消 destructive action 後 runtime error/warning 為空；細節記錄於 `docs/design-qa-settings-select.md`。
- [x] Integration regression gate：曾發現 `GalleryService` 參數契約不一致造成 `/api/images` HTTP 500；已修正 route contract，直接 backend／Vite proxy 皆回 200，並完成 browser reload smoke，詳見 `docs/ui-render-regression.md`。
- [x] Backend route-registration regression gate：route split 後 FastAPI `app.routes` 的 included-router placeholder 讓舊測試誤報 `/api/images` 缺失；已改由 `app.openapi()["paths"]` 驗證公開 route registry，backend 52 tests 全過，錯誤與修復已記錄於 `docs/ui-render-regression.md`。
- [x] Windows test-cleanup regression gate：WAL concurrency test 曾在負載下出現 `WinError 145`；`LibraryJobManager.close()` 現在會取消 active job 並以 deadline 等待 worker，`test_media_library.py` 對 test-owned temp path 做 bounded retry，close-cancellation regression test 與五次連續 backend 52-test suite 已通過。
- [x] Artist visibility gate：實際 Settings hide／unhide／refresh 已完成，列表數量與恢復後 artist button 均已核對。
- [x] Job UI normal lifecycle gate：實際 Settings start／cancel／terminal feedback／close-reopen 已完成；選取繪師工作 1,221 / 1,221 可取消且 terminal 訊息保留完成進度。
- [x] Job restart UI gate：backend restart 導致 `interrupted` 已由 API 與 persistent job state 證明，Chrome session 也已顯示 Settings 的 interrupted terminal panel；驗證 fixture 已還原。
- [x] Native drag selection：Chrome extension session 的人工滑鼠 path 產生非空 range，`Ctrl+A` 與 computed `::selection` 也已驗證。
- [x] Reduced-motion browser media emulation 的 `reduce` mode 與同一 Chrome process no-override 的 `no-preference` recovery 均已通過；CSS/JS static branches 已 audit；gallery long-task 已由 `scrollPerformance.ts` 的 page-owned probe 關閉。
- [ ] 新增檔案的 stage/commit 仍由使用者掌控；目前 62 個 untracked files 均未加入 git index，0 staged。

## 建議後續順序

1. [ ] 由使用者決定目前 70 個 untracked files 的 stage／commit 範圍；在納入版本控制前，不把本 working tree 視為可由乾淨 checkout 重現。此項本批不代為處理。
2. [x] 完成 Settings thumbnail cache API typed migration：實際修改 `frontend/src/api/client.ts`、`frontend/src/api/parsers.ts`、`frontend/src/api/client.test.ts`、`frontend/src/api/parsers.test.ts`、`frontend/src/components/SettingsModal.tsx`、`frontend/src/components/SettingsModal.test.tsx` 與本文件；`apiClient.library.thumbnailCache` 新增 `stats／entries／restore／recycle`，parsers 新增對應 response types 與 runtime validation；`SettingsModal.tsx` 改用既有 `requestJson`／`ApiError`，stats／entries 使用 `AbortController` 加 request id 與 modal/job gate。新增 8 個 frontend tests（全套 17 files／65 tests 通過）；驗證命令為 `pnpm.cmd lint`、`pnpm.cmd test -- --run`、`pnpm.cmd build`、`git diff --check`。preview binary URL 維持不變。
3. [x] 補 component regression tests：優先完整 `SettingsModal` 與 `WebtoonFeed` 的 collapsed toolbar／`current / total` HUD，再涵蓋 `FullscreenViewer`、keyboard focus、dialog focus trap 與 mobile layout。人工 Chrome 紀錄保留作視覺驗收，不能取代自動 component coverage；本次新增 `SettingsModal.test.tsx`、`WebtoonFeed.test.tsx`、`FullscreenViewer.test.tsx`。
4. [x] 先為 `main.py` 尚存的 media／trash／system integration routes 補 HTTP-level characterization tests，再依 service boundary 分批抽出；每批保留 path containment、recoverable trash、Windows-only guard 與既有 response contract；`backend/tests/test_main_http_routes.py` 以標準庫 ASGI dispatch 新增 8 tests。
5. [x] 整理 CI 責任：保留 Windows picker／recycle-bin integration 與 release artifact 所需 coverage，消除無意義的 backend test／frontend build 重複，並把 performance threshold 變成實際失敗 gate；Ubuntu full gates、Windows targeted integration、tag-only release build 與 performance fixture gate 已分工。
6. [x] 遷移仍直接呼叫 `main.update_web_config` 的 `backend/tests/test_path_picker.py`，改由 service 或 HTTP boundary 驗證後，再移除 `backend/main.py:408` 的 web-config compatibility facade；service test／web-config HTTP boundary 已通過，facade 已移除。

已固定且無需重做：native drag、backend restart interrupted UI、既有 API／thumbnail smoke、gallery long-task probe 與 reduced-motion browser gate。`docs/media-library-implementation-todo.md` 的歷史未勾選項目不納入上述順序。
- [x] 2026-08-10 refactor completion: `frontend/src/components/WebtoonFeed.test.tsx` and `frontend/src/components/FullscreenViewer.test.tsx` now cover collapsed toolbar/current-total, dialog focus, keyboard trap, Escape restore, and mobile toolbar behavior; `backend/tests/test_main_http_routes.py` adds 8 ASGI HTTP characterization tests for system/media/ZIP/trash/recycle-bin routes; `backend/tests/test_path_picker.py` now uses `WebConfigService` and `backend/main.py` no longer exposes the web-config compatibility facade.
- [x] Performance thresholds are now configurable in `scripts/measure-web-viewer-performance.py` (`--api-p95-threshold-ms`, `--thumbnail-p95-threshold-ms`, `--library-job-threshold-ms`) and return exit code 1 on exceedance; `.github/workflows/web-viewer.yml` runs the gate against `scripts/performance-fixture-server.py`.
- [x] CI responsibility is split: `.github/workflows/web-viewer.yml` owns the full Ubuntu frontend/backend gates and performance gate; `.github/workflows/ci-cd.yml` keeps Windows picker/media/recycle-bin characterization plus tag-only Windows frontend release build/artifact coverage.
- [x] Current verification (2026-08-10): frontend `pnpm.cmd lint`, `pnpm.cmd test -- --run` (20 files／71 tests), and `pnpm.cmd build` passed; backend `uv run --directory backend python -m unittest discover -s tests -v` (62 tests), `py_compile`, performance pass/fail smoke, and `git diff --check` passed. Manual UI render verification was not rerun in this batch.

## 2026-08-11 fullscreen toolbar／gallery panel batch

- 狀態：完成（功能、設定 contract、component／utility tests 與 frontend build gate 通過；基準瀏覽器 render 已確認隱藏工具列時恢復鍵與 X 並排，最新圖示狀態另由 component regression 覆蓋）。
- 安全 refactor review：將路徑父層判斷與 clipboard API／fallback 抽至 `frontend/src/utils/clipboard.ts`，FullscreenViewer 只保留操作狀態與呈現；目前仍保留大型 topbar JSX，避免在本批同時改動媒體手勢、focus trap 與 toolbar layout 的責任邊界。
- 實際檔案：`frontend/src/components/FullscreenViewer.tsx`、`frontend/src/components/FullscreenViewer.test.tsx`、`frontend/src/styles/viewer.css`、`frontend/src/utils/clipboard.ts`、`frontend/src/utils/clipboard.test.ts`、`frontend/src/types.ts`、`frontend/src/utils/webConfig.ts`、`frontend/src/utils/webConfig.test.ts`、`frontend/src/App.tsx`、`frontend/src/components/SettingsModal.tsx`、`backend/main.py`、`backend/tests/test_web_config.py`、`web_config.example.json`、`docs/web-config-contract.md`、`docs/refactor-todo.md`。
- 行為保護：`T` 切換工具列、`G` 切換圖庫面板；工具列隱藏時 stage 延伸且右上保留 ghost 復原鍵與 ghost `X`；工具列顯示控制使用固定方向的 `PanelTopDashed`，展開時以 active primary 狀態亮起；設定儲存結果會即時同步到已開啟的全螢幕；影片 focus 的左右方向鍵仍交給原生時間軸，靜音／音量為零會寫入設定音量 `0`；檔案路徑與資料夾路徑複製都有 keyboard／status／error feedback。
- 驗證：frontend `pnpm.cmd lint`、`pnpm.cmd test -- FullscreenViewer.test.tsx SettingsModal.test.tsx clipboard.test.ts webConfig.test.ts`（22 files／98 tests，現有 script 會執行完整 suite）、`pnpm.cmd build`、scoped `git diff --check` 通過；backend 在 `backend/` 執行 `python -m unittest discover -s tests`（66 tests）通過。pytest 未安裝，因此未執行 pytest runner。
