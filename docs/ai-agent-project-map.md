# Web Viewer AI Agent 專案地圖

這份文件讓新 Agent 在幾分鐘內掌握專案邊界。開始修改前仍須完整閱讀根目錄 `agents.md`；該檔案是 UI、資料操作與驗收流程的強制規範。

## 60 秒摘要

- 這是 Windows-first 的本機 Web Viewer：React/Vite 前端在 3000，FastAPI 後端在 8000。
- `frontend/src/App.tsx` 是前端資料與檢視模式的主要 orchestrator；大型 UI 分拆在 `components/`。
- `backend/main.py` 定義 API；`backend/db.py` 管理 SQLite 查詢與 Viewer 快照；`backend/library_jobs.py` 執行掃描、色彩分析與縮圖整理背景工作。
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
                                ├─ main.py：HTTP/API 與媒體回應
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
| `frontend/src/App.tsx` | 全域 state、API 載入、filter、分頁、viewer mode、modal 串接 | 先確認是否能留在既有 callback／effect；避免再塞入可獨立測試的 domain logic |
| `frontend/src/components/` | Onboarding、Gallery、Fullscreen、Webtoon、Settings、Sidebar 等畫面 | 保留資料流；視覺優先改 subsystem CSS |
| `frontend/src/components/ui/` | Button、Badge、Input、Select 等 shared primitives | 新 action control 優先重用，不另造幾何與顏色 |
| `frontend/src/utils/` | 分組、時間 filter、虛擬化、影像排程、設定與系統操作 | 適合放純函式或跨元件共享行為 |
| `frontend/src/index.css` | light/dark semantic token 主要來源 | 新顏色角色先在此定義，不在 JSX 拼色票 |
| `frontend/src/styles/` | 各 subsystem 的 layout 與 component rules | 不得重造 shared button/badge 規則 |
| `backend/main.py` | FastAPI routes、request validation、媒體與縮圖回應 | route 保持薄；資料查詢放 `db.py`，長工作放 `library_jobs.py` |
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

1. `App` 保有目前索引與 viewer mode。
2. `FullscreenViewer` 負責單張、縮放、鍵盤、filmstrip 與原圖預載。
3. `WebtoonFeed` 負責長條閱讀、媒體虛擬化、縮圖 rail 與 floating controls。
4. 縮圖走 `/api/thumbnail`，原圖走 `/api/file`；兩者共用前端載入排程但後端快取策略不同。

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
| Gallery 排版或 scroll | `GalleryGrid.tsx`、`GalleryMonthSection.tsx`、`galleryLayout.ts`、`gallery.css` |
| Fullscreen 載入或鍵盤 | `FullscreenViewer.tsx`、`imageLoadScheduler.ts`、`viewer.css` |
| Webtoon 閱讀器 | `WebtoonFeed.tsx`、`webtoon.css`、`responsive.css` |
| 設定欄位 | 前後端 defaults、normalize、`types.ts`、`SettingsModal.tsx`、`web_config.json` migration 必須一起檢查 |
| 新 API | `main.py` route → `db.py`／domain module → frontend caller → backend test |
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
| Frontend TS／React | 一鍵安裝後在 `frontend/` 執行 `..\.runtime\pnpm\pnpm.cmd build` |
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
