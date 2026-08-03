# Web Viewer 媒體資料庫、載入預覽與快取管理實作 TODO

> 文件用途：交接給負責實作的 AI agent。開始修改前必須先閱讀專案根目錄的 `agents.md`，保留現有資料流與使用者尚未提交的修改。

## 1. 目標

在 Web Viewer 設定中新增獨立的「媒體資料庫」分頁，讓使用者可以：

1. 更新 Web Viewer 的圖片資料庫。
2. 在低優先序背景工作中分析圖片的 dominant color。
3. 查看背景工作的階段、進度、統計、錯誤與取消狀態。
4. 在工作進行中關閉設定視窗，之後仍可從全域狀態與設定頁得知進度。
5. 使用原生檔案／資料夾選擇器設定所有路徑欄位，不必手動輸入路徑。
6. 管理縮圖快取的「使用中容量」，並以可復原方式移出舊快取。
7. 圖片尚未載入時依序顯示 dominant color、已快取縮圖、完整原圖。

所有維護工作不得明顯影響畫廊捲動、縮圖載入、全螢幕圖片載入或一般 API 回應。

## 2. 本次範疇

- 新增設定頂層分頁「媒體資料庫」。
- 將 `PixivUtil2 config.ini` 分頁中的「重新掃描圖片」移到新分頁。
- 將使用者用語由「重新掃描圖片」改為「更新圖片資料庫」。
- 可取消、可查詢、可持久化狀態的單一低優先序維護工作佇列。
- 資料夾探索、索引更新、色彩分析與快取整理的分階段進度。
- dominant color 的計算、版本失效、儲存與 `/api/images` 回傳。
- Gallery 等待背景使用 dominant color。
- Fullscreen 原圖載入前使用目前設定尺寸的既有縮圖墊底。
- 縮圖快取統計、使用中容量上限與可復原整理。
- 所有路徑型設定的原生檔案／資料夾選擇器與後端驗證。
- 必要的後端自動測試、前端自動測試、build 與人工驗收。

## 3. 非目標與限制

- 不改變 PixivUtil2 的下載行為。
- 不將 dominant color 寫回圖片檔或 PixivUtil2 原始 metadata。
- 不為 placeholder 額外建立 16×16、32×32 等小圖檔。
- 不建立另一份與目前設定尺寸重複的縮圖。
- 不允許硬刪除檔案或資料。快取整理必須可復原。
- 不宣稱「移到可復原位置」已釋放整體磁碟空間。Windows 資源回收筒或隔離區尚未清空前，磁碟占用仍可能存在。
- 不在儲存 `rootDirectory` 後自動啟動大量掃描；由使用者明確啟動「更新圖片資料庫」。
- 不在一般 `/api/images` 請求內即時計算 dominant color。

## 4. 使用者用語與設定資訊架構

設定頂層分頁順序：

1. `顯示與瀏覽`（原 Web Viewer 設定）
2. `媒體資料庫`（新增）
3. `PixivUtil2 config.ini`
4. `備份與維護`

### 媒體資料庫分頁

以留白與 shared edges 分成三組，避免引用區塊外觀、粗色側線或多層巢狀卡片。

#### A. 圖片資料庫

- 標題：`圖片資料庫`
- 顯示唯讀資料來源：`圖片資料夾`
- 說明：`路徑來自 PixivUtil2 的 rootDirectory 設定。`
- 主要按鈕：`更新圖片資料庫`
- 說明：`尋找新增或變更的圖片，更新 Web Viewer 使用的圖片清單。不會修改或刪除原始圖片。`
- 開關：`更新後分析圖片色彩`，預設開啟。
- 次要按鈕：`只分析缺少的圖片色彩`
- 色彩說明：`在背景分析尚未處理的圖片，讓圖片載入前先顯示相近的背景色。`

#### B. 背景工作

- 穩定存在的 `role="status"` 區域，用於螢幕閱讀器的非緊急更新。
- 顯示工作名稱、目前階段、進度、已耗時間、累計錯誤數。
- 執行中按鈕：`取消工作`。
- 取消已送出：disabled，文字 `正在停止…`。
- 完成、取消或失敗後可重新執行。
- 錯誤不是只用顏色表示；必須包含圖示與文字。

建議狀態文案：

- `正在讀取圖片資料夾… 已找到 12,480 個檔案`
- `正在更新圖片資料庫 2,140 / 12,480`
- `正在分析圖片色彩 860 / 4,320`
- `正在整理縮圖 420 / 1,280`
- `正在停止… 完成目前圖片後即會停止`
- `已取消：已保留完成的更新`
- `完成：新增 36 張，更新 12 張，分析 4,320 張`
- `工作已中斷：後端曾重新啟動，請重新執行`

資料夾探索階段尚未知道總數，不顯示假的百分比。只顯示不定進度與已找到數量；取得完整檔案清單後才顯示確定進度。

#### C. 縮圖儲存空間

- 顯示使用中容量與檔案數，例如 `875 MB・38,190 個縮圖`。
- 開關：`自動管理縮圖空間`。
- 容量欄位：`空間上限`，提供合理 preset 與自訂值。
- 次要按鈕：`整理縮圖`。
- 顯示可復原位置中的容量，並明確說明它可能仍占用磁碟空間。
- 一般 metadata 不使用高彩度 badge；主要 accent 只保留給主要動作、選取與進度指示。

## 5. 背景工作狀態模型

至少支援以下狀態：

```text
idle
queued
discovering
indexing
analyzing_colors
organizing_cache
cancelling
completed
cancelled
failed
interrupted
```

每份工作狀態至少包含：

```text
job_id
job_type
state
stage
created_at
started_at
updated_at
finished_at
cancel_requested
current_path（回傳前需考慮隱私，可只回傳檔名或相對路徑）
discovered
processed
total
added
updated
unchanged
colors_created
colors_reused
cache_moved
errors
last_error
```

要求：

- 同一時間最多只有一個媒體維護工作實際執行。
- 重複送出相同工作不得產生多個並行 worker。
- 工作狀態必須持久化；後端重啟後，原本執行中的工作標示為 `interrupted`。
- 不要求後端重啟後自動恢復未完成工作。
- 取消採合作式取消：在目錄、檔案與階段邊界檢查 cancellation token。
- 不強制終止正在解碼的單張圖片；UI 必須顯示「完成目前圖片後停止」。
- 已成功提交的索引與色彩資料不得因取消而回滾或毀損。

## 6. 背景排程與效能要求

- 維護工作 concurrency 固定為 1。
- 互動圖片請求（`/api/media`、`/api/thumbnail`）永遠優先於背景分析。
- 後端記錄最近一次互動圖片請求時間；有新請求時，背景工作在檔案邊界暫停短暫時間。
- 背景工作每處理一個小批次後主動 yield/sleep，避免長時間占滿 CPU 與磁碟。
- dominant color 優先讀取現有 WebP 縮圖；找不到可用縮圖時才讀取原圖。
- SQLite 使用小批次 transaction，避免每張圖片各自開啟連線與 commit，也避免單次 transaction 過大。
- 色彩、索引與快取整理共用同一工作佇列，不可同時搶磁碟。
- 不得使用會阻塞 FastAPI event loop 的 async 寫法；同步磁碟工作放到專用 worker。
- 不得挪用一般縮圖生成的全部 semaphore slot。背景工作只能在互動工作沒有等待時取得低優先序資源。

效能驗收基準：

- 使用固定測試資料集，同機器、同 cache 狀態各量測三次。
- 背景工作執行時，互動縮圖請求 p95 不得比無背景工作的 baseline 增加超過 `max(20%, 150 ms)`。
- 背景工作執行時，畫廊捲動與設定操作不能出現可感知的主執行緒長停頓。
- 前端不得因每個檔案進度而重新抓取整份圖片頁面；進度更新需節流。

## 7. 資料夾探索與索引更新

先盤點並重構現有 `scan_and_index_directory()`；目前行為與文案不完全一致，實作時必須修正或清楚保留：

- 掃描支援的媒體副檔名，略過 `_state` 與 `.pixivutil2-trash`。
- 同一次目錄 walk 建立檔案清單，後續索引與色彩階段重用，避免為了總數重複 walk。
- 回報 `added`、`updated`、`unchanged`、`conflicts`，不要只回報含糊的 `indexed`。
- 路徑、mtime 或 size 變更時才視為需要更新。
- 不得以 `INSERT OR REPLACE` 意外覆蓋另一張相同 Pixiv artwork ID 的不同頁面。
- 遇到 ID／路徑衝突時保留原資料，記錄可理解的衝突資訊；依現有 manga schema 決定正確歸屬。
- 找不到實體檔案的既有資料不得硬刪除；沿用現有 missing/archived 設計。
- 取消後 invalidation 必須正確，下一次 gallery request 不得使用過期的記憶體 scan cache。
- 完成後前端只刷新必要的圖片、繪師與月份資料。

## 8. Dominant color metadata

### 儲存

- 建議建立 Web Viewer 專用 metadata SQLite，不污染 PixivUtil2 的主要資料結構。
- 每筆至少保存 normalized path、mtime_ns、file size、dominant color、algorithm version、updated_at。
- 版本 key 為「正規化路徑＋mtime_ns＋file size」。檔案變更後舊色彩不得套用。
- dominant color API 值固定為通過驗證的 `#RRGGBB`；無資料時回傳 `null` 或省略欄位。
- metadata row 很小，不建立額外 placeholder 圖片。

### 計算

- 優先從已存在的縮圖計算。
- 透明圖片忽略完全透明像素；沒有可用像素時使用 viewer semantic fallback。
- GIF 取可解碼的代表 frame；影片優先使用既有影片縮圖。
- ZIP、損毀媒體與無法解碼項目記錄錯誤並繼續，不使整份工作失敗。
- 演算法要有 version，未來更換演算法時能選擇性重建。
- 結果對同一輸入必須穩定。

### API 與前端

- `/api/images` 的每個 `ImageItem` 可回傳 `dominant_color?: string`。
- 前端只接受 `/^#[0-9A-Fa-f]{6}$/`，禁止把未驗證字串注入 style。
- Gallery thumbnail 容器先以 dominant color 作背景；沒有資料時使用 `--viewer-surface-muted`。
- 色塊是靜態背景，不新增高頻動畫。

## 9. 全螢幕縮圖墊底

載入順序：

```text
dominant color -> 目前圖片的既有縮圖 -> 完整原圖
```

要求：

- 使用現有 `buildThumbnailUrl(item, thumbnailSize)`，不得請求另一個小尺寸。
- 全螢幕切換圖片後立即顯示「目前圖片」的縮圖，不繼續顯示上一張完整原圖造成內容誤認。
- 縮圖可適度放大與模糊；完整原圖完成 load + decode 後淡入。
- 原圖失敗時保留縮圖並顯示文字錯誤狀態。
- 縮圖本身失敗時仍保留 dominant color fallback。
- 同 URL 已在瀏覽器或後端快取時，不新增後端縮圖檔。
- 所有 transition 列出實際 property，不使用 `transition: all`。
- `prefers-reduced-motion` 下移除不必要的 transform/blur 動畫，允許極短 opacity crossfade。

## 10. 縮圖快取容量與可復原整理

- 統計 `backend/cache_thumbs` 的有效 WebP 數量與總大小。
- cache key 已包含來源版本與尺寸；整理器需辨識：
  - 原圖已不存在的縮圖。
  - 原圖 mtime/size 已變更留下的舊版本。
  - 非目前常用尺寸的舊縮圖。
  - 最久未使用的縮圖。
- 優先順序：無來源／舊版本／舊尺寸／LRU。
- 達到設定容量時，只限制「使用中的 cache 目錄」容量。
- 被移出的檔案必須進入可復原位置，保存 manifest（原路徑、移出時間、原因、大小）。
- 必須能復原一次整理工作的檔案，且不得覆蓋同名現有檔案。
- UI 明確顯示：可復原位置仍可能占用磁碟空間。
- 不得呼叫 `os.remove`、`Remove-Item` 或其他硬刪除清理 cache。
- 臨時生成失敗的 `.tmp` 沿用現有安全清理機制，不納入使用者資料清理功能。

`web_config.json` 建議新增：

```json
{
  "analyzeColorsAfterLibraryUpdate": true,
  "manageThumbnailCache": true,
  "thumbnailCacheLimitMiB": 1024
}
```

normalize 與前後端 type 必須提供向後相容預設值與合理 min/max。

## 11. 原生路徑選擇器

### 欄位行為

- 所有 path 類型欄位以共用 `PathPickerField` 呈現。
- 可見 label 永遠存在；placeholder 不可代替 label。
- 路徑文字框預設唯讀，但可 focus、選取與複製。
- 尾端按鈕依 metadata 顯示 `選擇資料夾`、`選擇檔案` 或 `選擇儲存位置`。
- 視欄位提供 `使用預設位置` 或 `清除選擇`。
- 取消原生選擇器不改變原值。
- 選擇成功只更新未儲存表單，不自動儲存、不自動掃描。
- 既有無效路徑仍可顯示，並提供清楚的修正提示。

### Picker 類型

- `rootDirectory`：folder。
- Web Viewer 的 `pixivConfigPath`：existing file，預設過濾 `.ini`。
- 輸出檔案設定：save file。
- 其他路徑依 `pixivConfigMetadata` 明確標記為 folder、existing file 或 save file。
- 不要只以欄位名稱臨時猜測；補齊 metadata 並加入 inventory test，確保所有已知 path 欄位都有類型。

### 後端驗證

- 正規化成絕對路徑，正確處理中文、空格、Windows drive 與 UNC。
- 驗證存在性、file/folder 類型、讀寫權限與允許副檔名。
- `config.ini` 必須可解析且包含預期結構。
- `rootDirectory` 不得選為 Web Viewer cache、內部工作目錄、`_state` 或 `.pixivutil2-trash`。
- 驗證失敗不覆蓋原設定。
- 不把完整敏感路徑寫入不必要的 error log 或對外 API。

### 安全與非阻塞要求

一般瀏覽器 `<input type="file">` 不能可靠提供伺服器可用的完整本機路徑，因此本機後端需透過平台 abstraction 開啟 Windows 原生 picker。

- Picker 只允許本機、同源、有效 Web Viewer session 呼叫。
- 現有寬鬆 CORS 不得讓任意網站觸發系統 picker；需收緊來源或加入不可跨站取得的 session/CSRF 保護。
- API 只接受 allowlist mode：`folder`、`existing-file`、`save-file`，不可接受任意 shell command。
- 同一時間最多一個 picker；第二個請求回傳明確 busy 狀態。
- Picker 在獨立 worker 開啟，不阻塞 FastAPI event loop、圖片 API 或維護工作。
- 後端沒有桌面 session 時回傳可恢復的錯誤，不可無限等待。
- 前端按鈕需有 loading、disabled、focus-visible 與錯誤狀態。

建議 API（可依現有架構微調，但語意需等價）：

```text
POST /api/system/picker
{ "mode": "folder|existing-file|save-file", "purpose": "root-directory|pixiv-config|..." }

200 { "status": "selected", "path": "..." }
200 { "status": "cancelled" }
409 { "detail": "已有選擇視窗開啟中" }
422 { "detail": "選取的路徑不符合這個設定" }
```

## 12. 背景工作 API

可依現有命名調整，但至少提供等價能力：

```text
POST /api/library/jobs
{ "type": "update-library", "analyze_colors": true }

POST /api/library/jobs
{ "type": "analyze-missing-colors" }

POST /api/library/jobs
{ "type": "organize-thumbnail-cache" }

GET /api/library/jobs/current
POST /api/library/jobs/{job_id}/cancel
GET /api/library/stats
```

- Start 回應必須快速，不等待 walk 或圖片解碼完成。
- 可使用節流 polling 或 SSE 同步狀態；如果使用 polling，執行中約 1 秒一次，idle 時停止或大幅降頻。
- 設定視窗關閉後，App 層仍保留精簡工作狀態。
- Header 只顯示低干擾的工作指示，不使用持續 toast 洗版。
- 完成、失敗與取消各只發出一次狀態通知。

## 13. 實作 TODO

### Phase 0：盤點與保護現況

- [ ] 檢查 `git status`，保留既有修改。
- [ ] 以 `rg` 定位 scan、thumbnail、media、settings、config metadata、theme token 與測試入口。
- [ ] 記錄現有 DB schema、manga page 寫法與 image ID 衝突規則。
- [ ] 為現有 rescan 行為建立 characterization tests，再重構。
- [ ] 記錄固定資料集上的互動縮圖 baseline。

### Phase 1：命名與設定架構

- [ ] `MainTab` 新增 `library`。
- [ ] `Web Viewer 設定` 改為 `顯示與瀏覽`。
- [ ] 新增 `媒體資料庫` tab 與 tabpanel。
- [ ] 從 config.ini tab 移除原「重新掃描圖片」。
- [ ] 套用本文件的繁體中文文案。
- [ ] 以 semantic settings tokens 實作，不在 JSX 混用競爭色票。

### Phase 2：Viewer metadata 與工作狀態

- [ ] 建立 Viewer metadata schema/migration。
- [ ] 建立 dominant color version table/index。
- [ ] 建立 job 狀態 persistence 與啟動時 interrupted recovery。
- [ ] DB 寫入使用 transaction 與 thread-safe connection 策略。

### Phase 3：低優先序工作管理器

- [ ] 單 worker queue、狀態機與 cancellation token。
- [ ] interactive media activity signal 與背景退讓策略。
- [ ] 節流持久化與進度通知。
- [ ] start/status/cancel API。
- [ ] 錯誤隔離：單檔錯誤不使整批失敗。

### Phase 4：資料庫更新工作

- [ ] 重構目錄探索為可報進度、可取消、單次 walk。
- [ ] 修正 added/updated/unchanged/conflict 計數。
- [ ] 避免相同 artwork ID 的不同檔案遭 `INSERT OR REPLACE` 覆蓋。
- [ ] 完成／取消後正確 invalidation。
- [ ] 保持現有 gallery/filter/data behavior。

### Phase 5：Dominant color

- [ ] 實作 fingerprint 與 algorithm version。
- [ ] 優先讀既有縮圖、fallback 原圖。
- [ ] 支援透明圖、GIF、影片縮圖與解碼錯誤。
- [ ] 實作 analyze missing 與 update-then-analyze。
- [ ] `/api/images` 回傳合法 color。
- [ ] Gallery 使用 color 背景與 semantic fallback。

### Phase 6：全螢幕縮圖墊底

- [ ] current thumbnail layer。
- [ ] 原圖 load + decode 後切換。
- [ ] 切圖時不顯示上一張內容。
- [ ] thumbnail/original error fallback。
- [ ] reduced-motion、light/dark、blurEnabled 驗證。

### Phase 7：快取容量與整理

- [ ] 快取統計 API。
- [ ] cache manifest 能反查來源版本與尺寸；若現有檔名資訊不足，建立 side metadata，不重解碼圖片。
- [ ] 清理候選排序與 active limit。
- [ ] 可復原 move、manifest 與 restore。
- [ ] `web_config.json` 新設定、normalize 與 UI。
- [ ] UI 不宣稱可復原移動已釋放磁碟。

### Phase 8：所有路徑選擇器

- [ ] inventory 所有 path 設定。
- [ ] 擴充 config metadata 的 path mode/purpose/extension/access 欄位。
- [ ] 原生 picker platform abstraction。
- [ ] 同源/session/CSRF 與單一 picker guard。
- [ ] 後端權威 validation。
- [ ] 共用 `PathPickerField` 與 field-level error。
- [ ] rootDirectory 變更後顯示 `前往媒體資料庫`，不自動掃描。

### Phase 9：全域狀態與無障礙

- [ ] App 層維護 current job 狀態。
- [ ] Header 低干擾指示與前往設定入口。
- [ ] 穩定 `role="status"`，錯誤才用 `role="alert"`。
- [ ] tab、按鈕、取消與 picker 完整鍵盤操作。
- [ ] focus-visible、disabled、44px touch target。
- [ ] 320px reflow、200% zoom、長路徑與長文案。

### Phase 10：測試與文件

- [ ] 後端 unit/integration tests。
- [ ] 前端 component tests；若專案尚無 runner，加入最小必要測試設定並說明原因。
- [ ] `pnpm.cmd build` 通過。
- [ ] Python compile/import 檢查與 pytest 通過。
- [ ] 實際 render 的 normal、hover、selected、focus、disabled、light/dark、reduced-motion 驗證。
- [ ] 更新 backend README/API 說明與設定說明。

## 14. 自動測試清單

### 後端：工作管理器

- [ ] Start API 在大型假資料集下快速回傳 queued/running，不同步等候完成。
- [ ] 第二個工作不會與第一個並行。
- [ ] discovering 階段 total 未知且 discovered 單調增加。
- [ ] indexing/analyzing 階段 processed 不倒退且不超過 total。
- [ ] cancel queued、discovering、indexing、analyzing、cache 各階段都能到 cancelled。
- [ ] cancelling 不接受重複取消造成 exception。
- [ ] 單檔 decode error 增加 errors 並繼續。
- [ ] 後端重啟模擬後 running job 變 interrupted。
- [ ] 取消後已完成資料仍可查詢。

### 後端：索引

- [ ] 新檔計入 added。
- [ ] 同 fingerprint 計入 unchanged。
- [ ] mtime/size 改變計入 updated。
- [ ] 同 Pixiv ID 的多頁檔不互相覆蓋。
- [ ] `_state`、`.pixivutil2-trash`、cache 不進索引。
- [ ] missing file 不硬刪除。
- [ ] 完成與取消後 scan cache 都不回傳過期結果。
- [ ] 不可讀資料夾與競態消失檔案有可理解錯誤。

### 後端：dominant color

- [ ] 相同檔案與 algorithm version 結果穩定。
- [ ] fingerprint 變更會失效並重算。
- [ ] 有既有縮圖時不開啟原圖。
- [ ] 透明 PNG、全透明 PNG、GIF、影片、損毀檔各有預期結果。
- [ ] 回傳值只可能是合法 `#RRGGBB` 或 null。
- [ ] analyze missing 跳過仍有效的 metadata。

### 後端：快取

- [ ] 統計數量與 bytes 正確。
- [ ] 候選優先順序符合無來源／舊版本／舊尺寸／LRU。
- [ ] 整理只 move，不 hard delete。
- [ ] manifest 完整且可 restore。
- [ ] restore 遇到同名檔不覆蓋。
- [ ] 工作取消後 manifest 與實際檔案一致。
- [ ] active cache 達上限後維持在容許誤差內。

### 後端：路徑選擇與安全

- [ ] cancelled picker 不改設定。
- [ ] file/folder/save-file mode 驗證正確。
- [ ] `.ini` filter 與 config parse 驗證。
- [ ] 中文、空白、UNC path 正規化正確。
- [ ] 不可讀／不可寫／錯誤類型／內部目錄被拒絕。
- [ ] 第二個 picker 收到 busy。
- [ ] 非同源或無 session/CSRF 的請求不能觸發 picker。
- [ ] allowlist 以外 mode/purpose 被拒絕。
- [ ] 無桌面 session 時在 timeout 內回傳錯誤。

### 前端

- [ ] 四個 main tabs 的 ARIA、roving tabindex 與方向鍵切換正確。
- [ ] 設定 modal 關閉後工作仍繼續，重新開啟恢復相同進度。
- [ ] status 更新不造成 toast 洗版。
- [ ] cancellation 文案與 disabled 狀態正確。
- [ ] discovering 不顯示百分比；有 total 後顯示正確 progressbar attributes。
- [ ] picker cancelled、selected、invalid、busy、error 狀態正確。
- [ ] path field 可 focus 與複製，但不需手動輸入。
- [ ] rootDirectory 選擇後不自動開始掃描。
- [ ] Gallery 合法 color 套用，非法 color 被 fallback。
- [ ] Fullscreen 依 color -> current thumbnail -> original 顯示。
- [ ] Fullscreen 切圖時不顯示上一張圖片。
- [ ] 相同縮圖 URL 不產生額外尺寸請求。
- [ ] reduced-motion 下沒有持續旋轉或不必要位移。

## 15. 人工驗收情境

1. **第一次建立資料**
   - 使用含 1,000+ 圖片的測試資料夾。
   - 啟動更新並關閉設定。
   - 確認畫廊仍可操作、Header 有背景工作狀態、重開設定可看到同一工作。

2. **取消**
   - 分別在讀取資料夾、更新索引、分析色彩與整理快取時取消。
   - 確認 UI 先顯示正在停止，最後顯示已取消，且已完成資料可用。

3. **瀏覽優先**
   - 色彩分析執行中快速捲動畫廊與連續切換全螢幕圖片。
   - 確認互動圖片優先載入，背景進度可暫停但不失敗。

4. **載入視覺**
   - 冷 cache：先看到 dominant color，再看到縮圖／原圖。
   - 暖 cache：全螢幕幾乎立即看到 current thumbnail。
   - 原圖錯誤：縮圖保留並有文字錯誤。
   - 檢查 light、dark、一般照片、極亮／極暗圖片與透明圖片。

5. **路徑選擇**
   - 對每個 path 欄位使用原生 picker，不手動輸入。
   - 測試取消、無權限、錯誤檔案、中文、空格、UNC、內部目錄。
   - 修改 rootDirectory 後確認不自動掃描，能前往媒體資料庫手動更新。

6. **快取容量**
   - 使用小測試上限觸發整理。
   - 確認 active cache 降至上限附近、檔案可復原、UI 沒有誤稱已釋放整體磁碟。

7. **Responsive 與可及性**
   - 320px、一般 desktop、200% zoom、長路徑、長中文文案。
   - 只用鍵盤完成啟動、取消、picker 與分頁切換。
   - 檢查 focus、螢幕閱讀器狀態宣告、reduced motion。

## 16. 完成定義（Definition of Done）

以下全部成立才算完成：

- [ ] 本文件 Phase 0–10 的適用項目完成。
- [ ] 無背景工作時現有 gallery、filter、fullscreen、webtoon 行為無回歸。
- [ ] 背景工作符合取消、持久狀態、單 worker 與互動優先要求。
- [ ] dominant color 不在列表請求即時計算，不產生額外 placeholder 圖片。
- [ ] Fullscreen 重用目前縮圖 URL，未增加另一尺寸 cache。
- [ ] 快取整理完全可復原，沒有硬刪除。
- [ ] 所有已知 path 欄位都有正確 picker 類型和後端驗證。
- [ ] 路徑 picker 不能被非同源網站任意觸發。
- [ ] 前端 build、後端測試與新增測試全部通過。
- [ ] 完成人工驗收矩陣，未完成項目在交付報告中明確列出。
- [ ] 最終交付列出修改檔案、migration、設定預設值、測試結果、效能量測與仍存在的限制。

## 17. 必跑指令

在 `E:\PixivUtil2-20251112\web-viewer` 執行，實際 Python 命令可依專案環境調整：

```powershell
python -m compileall backend
python -m pytest
Set-Location frontend
pnpm.cmd build
```

若新增前端 test script，亦必須執行：

```powershell
pnpm.cmd test
```

不得只回報「應該通過」；交付時需附上實際 exit code 與失敗／略過項目。
