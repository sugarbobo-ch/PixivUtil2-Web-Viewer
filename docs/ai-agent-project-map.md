# Web Viewer AI Agent 專案地圖

這份文件讓新 Agent 在幾分鐘內掌握專案邊界。開始修改前仍須完整閱讀根目錄 `agents.md`；該檔案是 UI、資料操作與驗收流程的強制規範。

## 60 秒摘要

- 這是 Windows-first 的本機 Web Viewer：React/Vite 前端在 3000，FastAPI 後端在 8000。
- `frontend/src/App.tsx` 是前端資料與檢視模式的主要 orchestrator；大型 UI 分拆在 `components/`。
- `backend/main.py` 組裝 FastAPI app 並保留媒體、Windows 與可復原資料操作等相容 routes；`backend/routes/` 與 `backend/services/` 承載已拆出的 domain API。`backend/db.py` 管理 SQLite 查詢與 Viewer 快照，`backend/library_jobs.py` 執行掃描、色彩分析與縮圖整理背景工作。
- Pixiv 模式使用所選 `config.ini` 同位置的 `db.sqlite` 作為唯讀來源；資料夾模式不讀取 PixivUtil2 資料庫。Viewer 的寫入只能進入 `backend/viewer.sqlite`、`backend/cache_thumbs`、可復原資料夾或明確的使用者設定檔。
- `web_config.json` 是已由 Git 忽略的本機使用者設定，介面操作會改寫它；可提交的預設範本是 `web_config.example.json`。
- Windows 使用者入口是 `install.bat`、`run_viewer.bat`、`update.bat`；實作集中在 `scripts/*.ps1`。安裝器把 Node、pnpm、uv、Python 與 backend venv 放在 `.runtime/`，不要改成依賴系統環境。
- UI 顏色先找 `frontend/src/index.css` semantic tokens；動作按鈕用 `Button`／`IconButton`，資訊標籤用 `Badge`。
- 禁止硬刪資料、紫色、陰影、光暈與 `transition: all`。完整限制以 `agents.md` 為準。

## 執行拓撲

```text
Browser :3000
  │
  ├─ React UI、filter/view state、虛擬化與影像載入排程
  │    frontend/src/App.tsx
  │    frontend/src/components/*
  │    frontend/src/utils/*
  │
  └─ /api/* ── Vite proxy ──> FastAPI :8000
                                │
                                ├─ main.py：app 組裝、媒體／Windows／可復原操作相容 routes
                                ├─ routes/*：設定、Gallery、目錄與背景工作 API
                                ├─ services/*：route 使用的 domain boundary
                                ├─ db.py：Viewer SQLite 與唯讀 Pixiv 快照
                                ├─ library_jobs.py：背景索引／色彩／快取工作
                                └─ source_resolver.py：Pixiv/FANBOX 來源連結
```

資料邊界：

```text
Pixiv config.ini ──rootDirectory──┐
同位置 db.sqlite ──唯讀匯入─────┼──> backend/viewer.sqlite
直接選取的本機資料夾 ──────────┘
唯一啟用的媒體根目錄 ──讀取／明確操作──> 預覽、索引、回收流程
backend/cache_thumbs <──可重建縮圖快取── backend API
web_config.json <──設定 API 讀寫── Browser
```

## 目錄責任

| 路徑 | 責任 | 修改提示 |
| --- | --- | --- |
| `frontend/src/App.tsx` | 全域 state、API 載入、filter、分頁、viewer mode、modal 串接；lazy module boundary | preferences 與 viewer navigation 由 hooks 持有；不要重新建立 config mirror |
| `frontend/src/components/` | Onboarding、Gallery、Fullscreen、Spread、Webtoon、Settings、Sidebar 等畫面 | 保留資料流；視覺優先改 subsystem CSS；reader toolbar／filmstrip／details／shortcut 與 fullscreen settings presentation 可獨立測試 |
| `frontend/src/i18n/` | locale dictionary、fallback、`lang/dir`、Intl formatter、pseudo-localization | 修改一般文案或 `config.ini` metadata 前先讀 `docs/i18n-maintenance-guide.md`；不要用翻譯後字串判斷 business state |
| `frontend/src/hooks/usePreferencesController.ts` | normalized WebConfig 的單一 owner、patch/rollback、request ordering | Settings 與 App 只讀 controller config；不要新增相同欄位的 mirror state |
| `frontend/src/hooks/useViewerNavigation.ts` | Gallery／Fullscreen／Webtoon mode transition、anchor、restore contract | reader 內的手勢與書頁 progression 另看 `readerSpread.ts` |
| `frontend/src/hooks/useViewerChrome.ts` | Fullscreen toolbar、filmstrip、shortcut/mobile menu、checkerboard visibility 與 focus restore | 不要在 presentation component 重新建立 chrome state |
| `frontend/src/hooks/useViewerImage.ts` | Fullscreen active original admission、directional preload、decoded image retention、reload 與 image error lifecycle | transform state 留在 `useViewerTransform`；不要在 parent 重新建立 media loader |
| `frontend/src/hooks/useViewerTransform.ts` | Fullscreen image/video zoom mode、rotation、flip、pan、media transform | spread reader 另以共同 canvas transform 管理 zoom/pan |
| `frontend/src/hooks/useViewerKeyboard.ts` | Fullscreen global shortcut routing 與 native media/control exclusion | key mapping 維持穩定；可翻譯文字由 toolbar/dialog 取得 |
| `frontend/src/hooks/useViewerVideo.ts` | Fullscreen video readiness、autoplay、volume、play/seek/hold gesture、feedback cleanup | native timeline arrows 仍交給 video element；不要在 parent 重新攔截 |
| `frontend/src/components/settings/SettingsFullscreenPanel.tsx` | Settings 的 fullscreen layout/direction、toolbar、filmstrip、zoom、checkerboard preference controls | layout/direction 必須透過 WebConfig draft 持久化，不在 reader 另存一份 |
| `frontend/src/components/settings/SettingsWebPreferencesPanel.tsx` | Settings Web tab 的一般瀏覽、video、webtoon preference content | 只接收 WebConfig draft 與 localized options；fullscreen controls 由 child panel 管理 |
| `frontend/src/components/settings/SettingsLibraryContent.tsx` | Settings Library tab 的來源、library job、thumbnail cache 與 recovery content | operation callback 與 state owner 留在 `SettingsModal`；數字／日期使用 i18n formatter |
| `frontend/src/components/settings/SettingsPixivContent.tsx` | Settings Pixiv tab 的 config path、section navigation、field renderer 與 localized metadata | 不以翻譯後文字判斷狀態；field kind/path/secret behavior 由 metadata 保留 |
| `frontend/src/components/ui/` | Button、Badge、Input、Select 等 shared primitives | 新 action control 優先重用，不另造幾何與顏色 |
| `frontend/src/utils/` | 分組、時間 filter、虛擬化、影像排程、設定、reader spread 與系統操作 | pairing 規則只放 `readerSpread.ts`；original admission 由 scheduler 限流；Spread filmstrip 使用 reader model normalize |
| `frontend/src/index.css` | light/dark semantic token 主要來源 | 新顏色角色先在此定義，不在 JSX 拼色票 |
| `frontend/src/styles/` | 各 subsystem 的 layout 與 component rules | 不得重造 shared button/badge 規則 |
| `backend/main.py` | FastAPI app 組裝，以及尚未拆出的媒體、Windows 與可復原資料操作 routes | 新 domain API 優先放入對應 `routes/*`，讓 route 依賴 service／domain owner |
| `backend/routes/` | WebConfig、Pixiv config、Gallery、目錄與 library job 的 HTTP boundary | route 只做 request／response mapping；不得在 route 建立 worker 或複製 domain logic |
| `backend/services/` | WebConfig、媒體來源、Gallery 與 library job service boundary | 跨 route 的 domain 行為放在 service；SQLite 查詢仍由 `db.py` 擁有 |
| `backend/db.py` | Viewer schema、Pixiv snapshot、gallery/query 與 metadata | `PIXIV_DB_PATH` 僅能唯讀；寫入使用 Viewer connection |
| `backend/library_jobs.py` | 單一背景 worker、index、dominant color、cache recovery | 保留 cancel、commit 與 interactive quiet-window 語意 |
| `backend/config_paths.py` | 本機 `web_config.json`、Pixiv `config.ini`、資料夾模式 root、Viewer DB 路徑 | 媒體來源只能是 Pixiv root 或直接選取資料夾，不得 fallback workspace；設定預設值需同步範本與前後端 normalize |
| `backend/path_picker.py` | Windows native picker 與 authoritative path validation | 前端輸入不能取代後端驗證 |
| `backend/recycle_bin.py` | Windows 系統資源回收筒 | 不要改成永久刪除 |
| `backend/source_resolver.py` | Pixiv/FANBOX URL 推導與快取 | 外部解析失敗時應安全降級 |
| `backend/tests/` | unittest 測試 | backend 行為變更要補對應案例 |
| `docs/` | 設計、交接與驗收背景 | 實作與文件衝突時，先核對 `agents.md` 與目前程式碼 |

## 主要資料流

### 啟動與 Gallery

1. `frontend/src/main.tsx` 載入 CSS 並 render `App`；未完成設定時先顯示 `FirstUseOnboarding`。
2. 首次導引選擇 Pixiv `config.ini` 或本機資料夾，儲存唯一來源並完成首次索引後，`App` 才載入 `/api/artists`、`/api/months` 與 `/api/images`。
3. `GalleryGrid`／`GalleryMonthSection` 虛擬化作品卡片；`GalleryThumbnail` 透過 `imageLoadScheduler` 控制併發。
4. filter、月份跳轉與分頁由 `App` 組成 API query；Gallery 不同步遞迴掃描硬碟。

### Fullscreen 與 Webtoon

1. `App` 保有目前索引與 viewer mode，`useViewerNavigation` 集中 mode transition、anchor 與 Gallery restore。
2. `FullscreenViewer` 組合單頁 media surface；`ViewerToolbar`、`ViewerFilmstrip`、`ViewerDetailsPanel`、`ViewerShortcutDialog` 是 presentation boundaries，`useViewerImage`／`useViewerTransform`／`useViewerVideo`／`useViewerKeyboard`／`useViewerChrome` 持有 reader domain responsibilities。
3. `SpreadViewer` 透過 `readerSpread.ts` 取得不跨作品的雙 slot progression，使用共同 canvas zoom/pan、compact filmstrip 與 desktop wrap/mobile horizontal toolbar；`fullscreenReadingDirection` 只影響書頁順序；窄 viewport 暫時 fallback 單頁。
4. `WebtoonFeed` 負責長條閱讀、媒體虛擬化、縮圖 rail 與 floating controls。
5. `FullscreenViewer`、`SpreadViewer`、`WebtoonFeed` 與 Settings/低頻 modal 由 `App` 的 top-level lazy boundary 載入，對應 subsystem CSS 也採 module import。
6. 縮圖走 `/api/thumbnail`，原圖走 `/api/file`；fullscreen／spread／webtoon 的 media admission 都受 `imageLoadScheduler` owner 與 concurrency 上限約束。

### 圖片資料庫工作

1. Settings 或 `App` 對 `/api/library/jobs` 建立工作。
2. `LibraryJobManager` 的單一 worker 執行探索、索引、主色分析或快取整理。
3. 工作狀態持久化在 Viewer DB；重啟後未完成工作標記為 `interrupted`，不自動續跑。
4. Gallery API 只讀最後成功提交的 snapshot，避免互動期間同步掃描磁碟。

## API 分區

- 設定：`/api/web-config`、`/api/pixiv-config`、`/api/settings/*`
- Gallery：`/api/artists`、`/api/months`、`/api/images`
- 媒體：`/api/thumbnail`、`/api/file`、`/api/open-media`
- 資料庫工作：`/api/library/jobs*`、`/api/library/stats`、`/api/library/cache/*`
- 資料操作：`/api/images/batch-trash`、`/api/images/download-zip`、`/api/recycle-bin*`
- 來源連結：`/api/source-link`、`/api/artist-source-link`
- 系統 picker：`/api/system/session`、`/api/system/picker`

完整 schema 與可互動測試入口可在後端啟動後查看 `/docs`。

## 常見任務路由

| 任務 | 先讀／先找 |
| --- | --- |
| 調整顏色、dark/light | `agents.md` → `index.css` → 對應 `styles/*.css` |
| 新增按鈕或 badge | `components/ui/Button.tsx`、`Badge.tsx` 與 shared CSS |
| Gallery 排版、月份或 scroll | `docs/global-gallery-navigation-contract.md` → `GalleryGrid.tsx`、`GalleryGlobalTrack.tsx`、`globalLayoutIndex.ts`、`gallery.css` |
| Gallery 編輯快選 | `useSelectionWorkflow.ts`、`GalleryGlobalTrack.tsx`；全域索引與虛擬化仍遵守 Gallery contract |
| Fullscreen 載入或鍵盤 | `FullscreenViewer.tsx`、`useViewerImage.ts`、`useViewerKeyboard.ts`、`imageLoadScheduler.ts`、`viewer.css` |
| 單頁／雙頁閱讀 | `docs/fullscreen-spread-reader-spec.md` → `SpreadViewer.tsx`、`readerSpread.ts`、`readerSpreadLayout.ts` |
| Webtoon 閱讀器 | `WebtoonFeed.tsx`、`webtoon.css`、`responsive.css` |
| 設定欄位 | 前後端 defaults、normalize、`types.ts`、對應 `components/settings/*` panel、`web_config.json` migration 必須一起檢查 |
| 介面文案或語言 | `docs/i18n-maintenance-guide.md` → `i18n/locales/*`；`config.ini` 文案另改 `i18n/config-locales/*` |
| 新 API | 對應 `routes/*` → service／`db.py`／domain owner → frontend caller → backend test；只有相容媒體／Windows route 才留在 `main.py` |
| 索引或快取 | `library_jobs.py`、`db.py`、`backend/README.md` 與 indexing 設計文件 |
| 媒體來源、路徑或刪除 | `config_paths.py`、`path_picker.py`、`recycle_bin.py`、`agents.md` 的單一來源與可復原要求 |

## 修改前檢查

1. 執行 `git status --short`，區分使用者修改與自己的修改。
2. 用 `rg` 找 component、token、API route、設定 normalize 與測試。
3. 若修改設定欄位，確認 frontend default、backend default、兩側 normalize、API persistence 與舊設定 migration。
4. 若修改資料行為，確認 Pixiv DB 唯讀、Viewer DB 寫入與可復原操作邊界。
5. 若修改 UI，完整遵守 `agents.md`，並保留 normal、hover、active、selected、focus-visible、disabled、mobile、light/dark。

## 驗證矩陣

| 變更 | 最低驗證 |
| --- | --- |
| Markdown 文件 | `git diff --check`，逐條核對命令與路徑 |
| Frontend TS／React | 一鍵安裝後在 `frontend/` 執行 `..\.runtime\pnpm\pnpm.cmd test` 與 `..\.runtime\pnpm\pnpm.cmd build` |
| UI／CSS | frontend build，加上實際 light/dark、mobile/desktop 與互動狀態 render |
| Backend Python | 一鍵安裝後在 `backend/` 執行 `..\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s tests -v` |
| Backend import／語法 | `..\.runtime\backend-venv\Scripts\python.exe -m py_compile db.py library_jobs.py main.py path_picker.py recycle_bin.py source_resolver.py` |
| API 或資料庫 | 對應 unittest，加上 `/docs` 或實際 API smoke test |

## 不要直接修改或提交

- `frontend/node_modules/`、`frontend/dist/`
- `.runtime/`（一鍵安裝 runtime、backend venv、log 與舊 runtime 備份）
- `backend/.venv/`、`backend/__pycache__/`（前者只可能是貢獻者的舊手動開發環境）
- `backend/cache_thumbs/`
- `backend/viewer.sqlite*`
- `web_config.json`；它是本機執行設定，新增欄位時改 `web_config.example.json` 與前後端 defaults

上述檔案即使由 `.gitignore` 排除，仍可能存在於工作區並包含使用者狀態；不要因為 Git 看不到差異就覆寫或移除。

## Sparse global media window

The gallery and all reader modes now have a shared range-first path:

Before changing this path, read `docs/global-gallery-navigation-contract.md`. It is the current behavior, geometry, capacity, and acceptance contract; `docs/sparse-global-media-window-implementation-plan.md` is historical design background.

- `backend/routes/gallery.py` and `backend/db.py` expose the backward-compatible `/api/images` range contract with `revision`, `offset`, `limit`, `month_index`, `image_count`, and `card_count`.
- `frontend/src/media-window/GlobalMediaWindow.ts` owns global slots, fixed chunks, request dedupe, stale revision isolation, priority preemption, pins, and bounded LRU eviction. `httpMediaRangeAdapter.ts`, `inMemoryMediaRangeAdapter.ts`, and the unexported legacy adapter are the adapter seams.
- `globalLayoutIndex.ts` owns continuous gallery month geometry and the global webtoon height index. `GalleryGlobalTrack.tsx` renders only the visible month/row window with stable skeleton geometry.
- `App.tsx` supplies the global index to Gallery, MonthQuickNav, single fullscreen, spread fullscreen, and webtoon. Reader windows are bounded to 160 items; the media scheduler admits at most 12 thumbnails and 2 originals and retains at most 384 completed URLs.
- The old current-page loader is disabled by default. Set `VITE_ENABLE_LEGACY_PAGINATION=true` only for an older backend rollback path; the old page-size value remains a compatibility field but is no longer exposed in Settings.

From `frontend/`, use `..\.runtime\pnpm\pnpm.cmd test:gallery-contract` as the minimum regression gate before the full frontend suite. Then run the backend `unittest` contract tests and the fresh-tab scenarios required by the current contract. Do not treat a stale server that omits `revision` as evidence against the range contract.
