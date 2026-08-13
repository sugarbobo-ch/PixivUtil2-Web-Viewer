<p align="center">
  <a href="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml"><img src="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml/badge.svg" alt="編譯與版本發布狀態"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>繁體中文</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

<h1 align="center">PixivUtil2 Web Viewer</h1>

PixivUtil2 Web Viewer 是為 Windows 設計的本機媒體圖庫，用來管理與快速瀏覽已下載的圖片、影片與漫畫。所有媒體都保留在你的電腦，不需要上傳到外部服務。

## 為什麼使用這個專案？

下載內容變多後，逐層打開資料夾會愈來愈慢；漫畫頁面散落在不同檔案中，也很難快速找到某個月份的作品。這個 Viewer 會把下載資料夾整理成一個可搜尋的圖庫，並提供適合圖片與漫畫的閱讀方式。

- 可搭配 PixivUtil2 圖庫，也可直接讀取一般本機媒體資料夾。
- 不需要雲端服務，不必上傳私人圖片或影片。
- 使用 Windows 安裝與啟動檔即可開始，不需要程式設計知識。

## 功能特色

- 在同一個圖庫中管理與快速瀏覽已下載的圖片、影片和多頁漫畫。
- 使用全螢幕模式快速、專心地閱讀圖片，或使用條漫模式連續向下閱讀長篇漫畫。
- 支援一次顯示一張圖片的單頁模式，以及像書本攤開閱讀的雙頁模式；也能選擇由左至右或由右至左翻頁。
- 拖曳時間刻度，或直接選擇年份與月份，就能跳到舊作品，不必從頭一路捲動整個圖庫。
- 大型圖庫會先顯示縮圖，只載入畫面附近的圖片；跳到其他月份時，也會提前準備附近的縮圖，減少等待時間。
- 依繪師與日期篩選、搜尋標題、變更排序，並將相關漫畫頁面合併成一個作品。
- 在全螢幕與條漫模式播放影片，支援點擊播放、雙擊快轉／倒轉，以及按住暫時加速。
- 使用模糊遮罩保護敏感內容，同時保留標題、頁數與導覽功能。
- 在背景更新 Viewer 索引，不會寫入 PixivUtil2 原始資料庫。
- 不需重新啟動，即可切換繁體中文、簡體中文、英文與日文。

## PixivUtil2 與僅讀取資料夾

建議使用 [PixivUtil2](https://github.com/Nandaka/PixivUtil2) 下載 Pixiv 資源並保留本機中繼資料。這個 Viewer 可以讀取它建立的本機圖庫，也支援讀取相同資料夾結構中的檔案。

如果只想瀏覽本機檔案，PixivUtil2 並非必要。Viewer 可以直接掃描指定資料夾中的支援格式媒體，建立自己的 Viewer 索引；不需要安裝 PixivUtil2，也不需要提供它的 `db.sqlite`。

僅讀取資料夾時，在首次使用導引選擇「瀏覽本機資料夾」，或之後到「設定 → 媒體資料庫」直接選取資料夾。路徑會儲存在已忽略的本機 `web_config.json`，不需要 `config.ini`。

使用 PixivUtil2 時則選取它的 `config.ini`。Viewer 只會把 `[Settings] rootDirectory` 當成媒體根目錄；若同一位置有 `db.sqlite`，會以唯讀方式匯入 Pixiv 中繼資料。這兩個 PixivUtil2 檔案都不會被 Viewer 寫入。

同一時間只會啟用一個來源。切換來源或修改圖片資料夾後，必須先儲存設定並更新圖片資料庫，圖庫才會改用新來源。

## 排序與頁面順序

排序選單會區分圖片時間與作品順序。「作品新到舊・頁碼正序」會先顯示較新的作品，再維持作品內的自然順序，例如 `p1 → p2 → p3`、`1-1 → 1-2 → 1-10` 與 `a → b → c`。Pixiv 檔名會使用作品 ID 與 `_pN`；非 Pixiv 圖庫則依檔名與資料夾結構推斷。

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
2. 完成後雙擊 `run_viewer.bat`。前端與 API 會由同一個可見終端機管理；按 `Ctrl+C` 或直接關閉該終端視窗都會一起停止。
3. 日後雙擊 `update.bat`，即可用 `git pull --ff-only` 取得更新並重新同步依賴。更新功能需要 Git for Windows 與已設定的 upstream remote。

安裝器會把 pnpm 套件 store 固定放在 `.runtime/pnpm-store`。它只會在 `web_config.json` 不存在時，從 `web_config.example.json` 建立本機設定，不會覆蓋既有設定。舊版 runtime 更新時會保留在 `.runtime/backups`，不會直接硬刪。

服務位址：

- Viewer：<http://localhost:3000>
- API：<http://127.0.0.1:8000>
- API 文件：<http://127.0.0.1:8000/docs>

## 建議使用流程

1. 執行 `install.bat`，完成後使用 `run_viewer.bat` 啟動。
2. 選擇資料來源：
   - 使用 PixivUtil2 圖庫時，選取它的 `config.ini`；Viewer 只使用其中的 `rootDirectory` 與同位置可用的 `db.sqlite`。
   - 僅讀取資料夾時，直接選取媒體資料夾；不需要 PixivUtil2、`config.ini` 或 `db.sqlite`。
3. 到「設定 → 媒體資料庫」選擇「更新圖片資料庫」。背景工作會更新 Viewer 快照，並可依設定分析圖片主色。
4. 使用繪師與月份篩選作品，再以全螢幕或條漫播放圖包；分享畫面或擷取操作截圖前可開啟「模糊遮罩」。
5. 縮圖快取變大時，到「設定 → 媒體資料庫」執行「整理縮圖」。檔案會移到可復原位置，之後仍能還原。

## 全螢幕影片播放器操作

在全螢幕檢視影片時，可以使用下列操作：

- 按 `Space` 或點擊影片本體（原生控制列除外）：播放／暫停。
- 在影片左半部雙擊：依設定倒轉；右半部雙擊：依設定快轉（預設 5 秒）。
- 按住影片左／右半部：依設定暫時加速播放（預設 2 倍速）；放開後恢復原本速度。
- 點擊影片範圍外的左／右側：切換上一部／下一部作品；影片本體內不會因此關閉全螢幕。
- 使用影片原生控制列的進度條：拖曳即可調整播放進度，控制列與影片本體保持相同尺寸。
- 按 `F1` 開啟全螢幕快捷鍵說明，面板也會列出影片操作提示。
- 到「設定 → 顯示與瀏覽 → 全螢幕模式」可調整跳轉秒數與按住倍速；共用的影片播放設定可啟用全螢幕與條漫自動播放。首次播放會以靜音開始，之後從原生控制列調整的靜音／音量會保存並套用到兩種模式。條漫影片進入主要可視區時播放，離開後自動暫停。

## 確認 PixivUtil2 資料來源

首次啟動時，導引會要求選擇 PixivUtil2 `config.ini` 或本機媒體資料夾，接著掃描來源並建立第一份 Viewer 索引，完成後才進入圖庫。

選擇 PixivUtil2 模式但未指定自訂路徑時，Web Viewer 會在專案上層尋找：

- `../db.sqlite`：PixivUtil2 原始資料庫，Web Viewer 僅以唯讀方式匯入快照。
- `../config.ini`：預設 PixivUtil2 設定檔，其中 `[Settings] rootDirectory` 指向圖片根目錄。

`install.bat` 只會在設定不存在時建立 `web_config.json`。如果希望手動建立，也可複製範本：

```powershell
Copy-Item .\web_config.example.json .\web_config.json
```

`web_config.json` 是已忽略的本機使用者設定，不應提交。若 `config.ini` 位於其他位置，可到「設定 → 媒體資料庫」選擇檔案；結果會寫入 `pixivConfigPath`。資料夾模式則使用 `mediaRootPath`，不會退回專案目錄或 PixivUtil2 根目錄。

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

按下該終端機的 `Ctrl+C` 或直接關閉視窗，前端、後端與重載子程序都會一起停止。啟動器使用 Windows Job Object，確保視窗直接關閉時仍會清理整個程序樹。服務 log 位於 `.runtime/logs`。

同一個專案已在執行時，再次啟動只會提示現有 Viewer 並正常結束，不會把自己的連接埠判定為錯誤；若連接埠由其他程式占用，仍會顯示對應 PID 並停止啟動。

## 第一次建立圖片索引

如果畫面沒有作品，開啟「設定 → 媒體資料庫」，確認圖片來源後執行資料庫更新。更新工作會掃描媒體、建立 Viewer 快照，並依設定分析主色；它不會直接修改 PixivUtil2 的原始資料庫。

## 開發者指令

一鍵安裝後，可在專案根目錄使用單一指令，同時啟動 FastAPI 自動重載與 Vite HMR：

```bat
dev_viewer.bat
```

開啟 <http://localhost:3000>。在同一個終端機按下 `Ctrl+C` 或直接關閉視窗，即可停止兩個服務與重載子程序；啟動器也會先檢查 `8000` 與 `3000` port。

若要分別使用兩個終端機，後端開發模式：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m uvicorn main:app --app-dir .\backend --host 127.0.0.1 --port 8000 --reload
```

前端開發模式：

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd dev
```

Vite 會把 `/api` 代理到 `http://127.0.0.1:8000`。

介面翻譯是 `frontend/src/i18n/locales/` 下可直接編輯的 JSON 文字檔；所有已知 `config.ini` 欄位的名稱與完整說明則分開存放在 `frontend/src/i18n/config-locales/`。`zh-TW.json` 是語意基準與 fallback；修改其他語系時，請保留相同的 key 與插值 placeholder。

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

確認「設定 → 媒體資料庫」中的來源：PixivUtil2 模式需檢查 `config.ini` 的 `rootDirectory`，資料夾模式則需確認選取的媒體資料夾。儲存後執行圖片資料庫更新；Gallery 只讀取最後一次成功提交的 Viewer 快照，不會在每次開頁時同步掃描硬碟。

### 縮圖第一次出現較慢

未命中 `backend/cache_thumbs` 時，後端需要讀取原圖並產生 WebP。縮圖尺寸越大，第一次生成越久；產生後會重用快取。不要手動硬刪快取，請使用設定頁提供的可復原整理流程。

### 連接埠已被占用

預設前端使用 3000、後端使用 8000。關閉先前啟動的 Viewer 程序，或在手動啟動時指定其他連接埠，並同步調整 `frontend/vite.config.ts` 的 proxy target。

### 安裝或更新失敗

確認網路可連線後重新執行 `install.bat`。`update.bat` 另需 Git for Windows、upstream remote，且本機修改不可與遠端更新衝突；更新器不會使用 reset、clean、stash 或 force 覆蓋本機內容。

## 開發文件

- [AI Agent 專案地圖](docs/ai-agent-project-map.md)
- [i18n 多語系維護指南](docs/i18n-maintenance-guide.md)
- [全域 Gallery 與月份導覽契約](docs/global-gallery-navigation-contract.md)
- [全螢幕雙頁閱讀器規格](docs/fullscreen-spread-reader-spec.md)
- [Backend 工作與 Native Picker](backend/README.md)
- [繪師索引與 Viewer snapshot 設計](docs/artist-list-indexing-cache-grid-design.md)
- [媒體資料庫歷史實作規格](docs/media-library-implementation-todo.md)
- [Pixiv UI 樣式調整報告](docs/pixiv-ui-style-adjustment-report.md)
- [Agent UI 強制規範](agents.md)
