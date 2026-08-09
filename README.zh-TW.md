# PixivUtil2 Web Viewer

[English](README.md) | **繁體中文**

[![CI 與版本發布](https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml)

這是 PixivUtil2 的 Windows 本機圖片瀏覽器。圖片由本機後端讀取，不需要上傳到外部服務；React/Vite 前端提供 Grid、全螢幕與條漫閱讀，FastAPI 後端負責 Viewer 索引與縮圖快取。

## 功能特色

- 以月份 Grid 瀏覽大型圖庫，並使用繪師、日期、搜尋、排序與分頁快速縮小範圍。
- 在 Grid、專注的全螢幕閱讀器與連續直向條漫間切換，返回時保留原本瀏覽位置。
- 將相關頁面合併成圖包，先預覽所有頁面，再用全螢幕或條漫模式播放。
- 開啟模糊遮罩後仍保留頁數、圖包與導覽資訊，適合分享畫面或擷取操作截圖。
- 在背景更新 Viewer 索引與選用的主色分析，不寫入 PixivUtil2 原始資料庫。
- 透過可復原流程整理縮圖快取，不直接永久刪除產生的檔案。

## PixivUtil2 與僅讀取資料夾

建議使用 [PixivUtil2](https://github.com/Nandaka/PixivUtil2) 下載 Pixiv 資源並保留本機中繼資料。這個 Viewer 可以讀取它建立的本機圖庫，也支援讀取相同資料夾結構中的檔案。

如果只想瀏覽本機檔案，PixivUtil2 並非必要。Viewer 可以直接掃描指定資料夾中的支援格式媒體，建立自己的 Viewer 索引；不需要安裝 PixivUtil2，也不需要提供它的 `db.sqlite`。

僅讀取資料夾時，建立或選取一份指向媒體資料夾的最小 `config.ini`：

```ini
[Settings]
rootDirectory = D:\Pictures
```

這份設定檔只用來提供媒體根目錄；只有在存在對應的 PixivUtil2 檔案時，Viewer 才會讀取 Pixiv 專屬中繼資料。

## 操作畫面

以下畫面均開啟內建模糊遮罩；媒體仍留在本機，Git 只收錄這些模糊後的操作截圖。

<table>
  <tr>
    <th>電腦版 Grid</th>
    <th>手機版 Grid</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-grid.png" alt="電腦版圖片 Grid、篩選器與模糊圖包" width="620"></td>
    <td><img src="docs/screenshots/mobile-grid.png" alt="手機版響應式圖片 Grid 與模糊圖包" width="220"></td>
  </tr>
  <tr>
    <th>電腦版全螢幕</th>
    <th>手機版全螢幕</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-fullscreen.png" alt="電腦版全螢幕閱讀器、縮圖導覽與模糊遮罩" width="620"></td>
    <td><img src="docs/screenshots/mobile-fullscreen.png" alt="手機版全螢幕閱讀器與精簡控制項" width="220"></td>
  </tr>
  <tr>
    <th>電腦版圖包</th>
    <th>手機版條漫</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-manga-pack.png" alt="電腦版圖包預覽與編號頁面" width="620"></td>
    <td><img src="docs/screenshots/mobile-webtoon.png" alt="手機版連續條漫閱讀器與模糊遮罩" width="220"></td>
  </tr>
</table>

## Windows 一鍵安裝與啟動

一般使用者不需要預先安裝 Node.js 或 Python，也不需要修改系統 `PATH`：

1. 第一次使用請雙擊 `install.bat`。它會在專案內的 `.runtime` 準備 Node.js、pnpm、uv 與 Python，並安裝前後端依賴。
2. 完成後雙擊 `run_viewer.bat`。前端與 API 會由同一個可見終端機管理；按 `Ctrl+C` 會一起停止。
3. 日後雙擊 `update.bat`，即可用 `git pull --ff-only` 取得更新並重新同步依賴。更新功能需要 Git for Windows 與已設定的 upstream remote。

安裝器會把 pnpm 套件 store 固定放在 `.runtime/pnpm-store`。它只會在 `web_config.json` 不存在時，從 `web_config.example.json` 建立本機設定，不會覆蓋既有設定。舊版 runtime 更新時會保留在 `.runtime/backups`，不會直接硬刪。

服務位址：

- Viewer：<http://localhost:3000>
- API：<http://127.0.0.1:8000>
- API 文件：<http://127.0.0.1:8000/docs>

## 建議使用流程

1. 執行 `install.bat`，完成後使用 `run_viewer.bat` 啟動。
2. 選擇資料來源：
   - 使用 PixivUtil2 圖庫時，讓 Viewer 自動尋找 PixivUtil2，或在「設定 → Pixiv 設定」選取它的 `config.ini`。
   - 僅讀取資料夾時，選取一份 `[Settings] rootDirectory` 指向本機媒體資料夾的 `config.ini`；不需要安裝 PixivUtil2，也不需要它的 `db.sqlite`。
3. 到「設定 → 圖片資料庫」選擇「更新圖片資料庫」。背景工作會更新 Viewer 快照，並可依設定分析圖片主色。
4. 使用繪師與月份篩選作品，再以全螢幕或條漫播放圖包；分享畫面或擷取操作截圖前可開啟「模糊遮罩」。
5. 縮圖快取變大時，到「設定 → 圖片資料庫」執行「整理縮圖」。檔案會移到可復原位置，之後仍能還原。

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

GitHub Actions 會在 push 與 pull request 執行後端測試及前端 build。建立 `v*` tag 後，CD job 會發布 GitHub Release，並附上保留 Windows 一鍵安裝檔案的 source ZIP。

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
