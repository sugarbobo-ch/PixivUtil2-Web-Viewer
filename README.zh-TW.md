# PixivUtil2 Web Viewer

[English](README.md) | **繁體中文**

## Windows 一鍵安裝與啟動

一般使用者不需要預先安裝 Node.js 或 Python，也不需要修改系統 `PATH`：

1. 第一次使用請雙擊 `install.bat`。它會在專案內的 `.runtime` 準備 Node.js、pnpm、uv 與 Python，並安裝前後端依賴。
2. 完成後雙擊 `run_viewer.bat`。前端與 API 會由同一個可見終端機管理；按 `Ctrl+C` 會一起停止。
3. 日後雙擊 `update.bat`，即可用 `git pull --ff-only` 取得更新並重新同步依賴。更新功能需要 Git for Windows 與已設定的 upstream remote。

安裝器只會在 `web_config.json` 不存在時，從 `web_config.example.json` 建立本機設定，不會覆蓋既有設定。舊版 runtime 更新時會保留在 `.runtime/backups`，不會直接硬刪。

服務位址：

- Viewer：<http://localhost:3000>
- API：<http://127.0.0.1:8000>
- API 文件：<http://127.0.0.1:8000/docs>

這是 PixivUtil2 的 Windows 本機圖片瀏覽器。前端使用 React、TypeScript 與 Vite，後端使用 FastAPI、SQLite 與 Pillow/OpenCV；所有圖片都由本機後端讀取，不需要把媒體上傳到外部服務。

## 確認 PixivUtil2 資料來源

預設情況下，Web Viewer 會使用專案上層的 PixivUtil2 資料：

- `../db.sqlite`：PixivUtil2 原始資料庫，Web Viewer 僅以唯讀方式匯入快照。
- `../config.ini`：預設 PixivUtil2 設定檔，其中 `[Settings] rootDirectory` 指向圖片根目錄。

`install.bat` 只會在設定不存在時建立 `web_config.json`。如果希望手動建立，也可複製範本：

```powershell
Copy-Item .\web_config.example.json .\web_config.json
```

`web_config.json` 是已忽略的本機使用者設定，不應提交。若 `config.ini` 位於其他位置，可啟動後到「設定 → Pixiv 設定」選擇檔案；選擇結果會寫入 `web_config.json` 的 `pixivConfigPath`。

## 啟動與停止

最簡單的方式是在根目錄執行：

```powershell
.\run_viewer.ps1
```

若 PowerShell 阻擋本機腳本，可只對這次執行放行：

```powershell
powershell -ExecutionPolicy Bypass -File .\run_viewer.ps1
```

也可以直接雙擊 `run_viewer.bat`。啟動後：

- 前端：http://localhost:3000
- 後端 API：http://127.0.0.1:8000
- FastAPI 文件：http://127.0.0.1:8000/docs

按下該終端機的 `Ctrl+C`，前後端會一起停止。服務 log 位於 `.runtime/logs`。

## 第一次建立圖片索引

如果畫面沒有作品，開啟「設定 → 圖片資料庫」，確認圖片目錄後執行資料庫更新。更新工作會掃描媒體、建立 Viewer 快照，並依設定分析主色；它不會直接修改 PixivUtil2 的原始資料庫。

## 開發者指令

一鍵安裝後，可直接使用專案內的固定版本工具。後端開發模式：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m uvicorn main:app --app-dir .\backend --host 127.0.0.1 --port 8000 --reload
```

前端開發模式：

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd dev
```

Vite 會把 `/api` 代理到 `http://127.0.0.1:8000`。

## 驗證開發環境

後端測試：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s .\backend\tests -v
```

前端 type-check 與 production build：

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd build
```

文件與 patch 格式：

```powershell
git diff --check
```

## 常見問題

### 頁面打得開，但沒有圖片

確認 `config.ini` 的 `rootDirectory`、設定頁選取的 Pixiv 設定檔，以及圖片資料庫更新工作是否完成。Gallery 只讀取最後一次成功提交的 Viewer 快照，不會在每次開頁時同步掃描硬碟。

### 縮圖第一次出現較慢

未命中 `backend/cache_thumbs` 時，後端需要讀取原圖並產生 WebP。縮圖尺寸越大，第一次生成越久；產生後會重用快取。不要手動硬刪快取，請使用設定頁提供的可復原整理流程。

### 連接埠已被占用

預設前端使用 3000、後端使用 8000。關閉先前啟動的 Viewer 程序，或在手動啟動時指定其他連接埠，並同步調整 `frontend/vite.config.ts` 的 proxy target。

### 安裝或更新失敗

確認網路可連線後重新執行 `install.bat`。`update.bat` 另需 Git for Windows、upstream remote，且本機修改不可與遠端更新衝突；更新器不會使用 reset、clean、stash 或 force 覆蓋本機內容。

## 開發文件

- [AI Agent 專案地圖](docs/ai-agent-project-map.md)
- [Backend 工作與 Native Picker](backend/README.md)
- [媒體資料庫、快取與 Grid 設計](docs/artist-list-indexing-cache-grid-design.md)
- [媒體資料庫實作清單](docs/media-library-implementation-todo.md)
- [Pixiv UI 樣式調整報告](docs/pixiv-ui-style-adjustment-report.md)
- [Agent UI 強制規範](agents.md)
