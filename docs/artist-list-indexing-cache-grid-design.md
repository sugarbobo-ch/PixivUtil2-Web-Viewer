# Web Viewer 繪師列表、Indexing、快取與 Gallery Grid 設計規格

狀態：規格、現況差異與修正紀錄

日期：2026-08-04

## 1. 目的

本文件定義 Web Viewer 的繪師邊界、更新與 indexing 的 IO 行為、Viewer SQLite snapshot、前端載入快取，以及 Gallery grid 的虛擬化規則。

本文件的核心決定是：

- 繪師列表只列出 `rootDirectory` 的直屬第一層資料夾。
- 第一層繪師資料夾以下的所有巢狀資料夾與媒體，都歸屬於該第一層繪師；巢狀資料夾不會產生新的繪師項目。
- 瀏覽、切換繪師、全部繪師與 MonthQuickNav 不得為了取得資料而同步遞迴掃描硬碟。
- 可供畫面使用的索引資料存放在 Web Viewer 自己的 SQLite；PixivUtil2 的 `db.sqlite` 只允許唯讀匯入，來源圖片也不得因 indexing 被移動、改名或刪除。
- Indexing 是背景工作，可觀察、可取消、可更新單一或多個繪師；目前繪師的更新優先於背景 root reconciliation。

## 2. 名詞與目錄邊界

### 2.1 Root 與繪師

`rootDirectory` 在本文件泛指目前唯一啟用的媒體根目錄：Pixiv 模式取自所選 `config.ini` 的 `[Settings] rootDirectory`，資料夾模式則直接使用 `mediaRootPath`。兩種模式都不允許退回 workspace。只有符合以下條件的項目才是繪師：

1. 是 root 的直接子項目。
2. 是實體資料夾，不是檔案，也不是不跟隨 symlink 的資料夾連結。
3. 名稱不是隱藏項目，也不是 Web Viewer／PixivUtil2 的內部資料夾。

目前內部資料夾名稱沿用 `backend/db.py` 的 `INTERNAL_DIRECTORY_NAMES`，包含 `_state`、`__pycache__` 與 `.pixivutil2-trash`；Viewer 自己的 `backend/cache_thumbs` 也會依完整路徑排除。這些目錄及其內容永遠不列入繪師或作品。

### 2.2 歸屬規則

給定下列目錄：

```text
root/
├─ Artist A/
│  ├─ extracted/
│  │  └─ 001.jpg
│  └─ Manga 01/
│     └─ 002.jpg
├─ Artist B/
│  └─ 003.jpg
├─ _state/
└─ root-image.jpg
```

繪師列表只能有 `Artist A` 與 `Artist B`。`001.jpg`、`002.jpg` 都屬於 `Artist A`；`extracted`、`Manga 01` 不得成為繪師。root 直屬檔案不屬於任何繪師，可維持既有 `member_id = NULL` 的「未分類」篩選，不得把檔名當成繪師。

對任一媒體路徑，繪師歸屬是相對於 root 的第一個 path segment：

```text
artist = first_segment(relative_path(media_path, rootDirectory))
```

這個規則不因巢狀深度、檔名、PixivUtil2 成員表是否有對應資料而改變。

### 2.3 身分與顯示名稱

- 有 Pixiv member ID 的第一層資料夾可以沿用該 ID。
- 沒有 Pixiv member ID 的第一層資料夾使用 Viewer 擁有的 deterministic synthetic ID。
- ID 對同一個 canonical 第一層路徑必須穩定，不能使用 Python process-local `hash()`。
- 顯示名稱與 `folder_name` 以第一層資料夾名稱為準；PixivUtil2 的其他成員名稱不能單獨建立繪師項目。
- 資料夾被移除或改名時，舊 scope 必須標記為 inactive／stale，不得繼續出現在繪師列表；歷史 Viewer snapshot 可保留以便 missing 狀態與診斷。

## 3. 資料來源與責任邊界

### 3.1 真正的讀取來源

| 資料 | 來源 | 可否寫入 |
| --- | --- | --- |
| 繪師列表與作品列表 | Web Viewer `backend/viewer.sqlite` | 可由 Viewer worker 更新 |
| PixivUtil2 舊有 metadata | PixivUtil2 `db.sqlite` 的唯讀 snapshot | 不可寫入 |
| 原始圖片與影片 | `rootDirectory` 下的使用者檔案 | indexing 不可修改 |
| dominant color | Viewer SQLite `viewer_dominant_color` | 只寫 Viewer DB |
| 縮圖檔案 | Web Viewer thumbnail cache | 只寫 cache；來源檔不動 |
| job 狀態與 scope 狀態 | Viewer SQLite `viewer_library_job`、`viewer_index_scope` | 可由 Viewer worker 更新 |

`pixiv_master_member` 是 metadata snapshot 與索引相容資料，不是繪師列表的完整來源。原因是 `sync_pixiv_snapshot()` 會把 PixivUtil2 的所有成員匯入 Viewer DB，其中可能包含目前 root 沒有資料夾的成員。

### 3.2 繪師列表的 authoritative set

繪師列表的 authoritative set 必須是背景 discovery 最後一次成功確認的 root 第一層 scope：

```text
active artist scopes
= viewer_index_scope(scope_type = 'artist', active = true)
```

實作可以在 `viewer_index_scope` 增加 `active`／`last_discovered_at` 等欄位，或建立等價的 Viewer-owned artist scope table；不可用查詢 `pixiv_master_member` 全表來代替。API request 期間不得為了判斷 active 而對每個 scope 做 `os.path.isdir()`。

作品數量則由 Viewer snapshot 中歸屬該 scope 的媒體計算，並套用 trash、hidden 與 `is_present` 規則。來源 DB 中只有成員資料、沒有目前 root 第一層 scope 的項目，不應出現在列表。

## 4. 現況稽核與已確認偏差

### 4.1 已經符合規格的部分

- `discover_root_scopes()` 使用 root 的單層 `os.scandir()`，只註冊直接子資料夾。
- `_member_for_media_path()` 與 `_top_level_folder_for_path()` 在 root recursive scan 時，會把巢狀媒體映射到第一層資料夾。
- `scan_and_index_directory()` 使用 `os.walk()` 只在 worker 中執行，並把索引寫入 Viewer DB。
- `/api/images` 的 snapshot 路徑不呼叫 `os.walk()`、`os.scandir()` 或逐檔 stat；更新期間仍可讀取上一次已 commit 的 snapshot。
- Windows watcher 只監看 root 的檔案系統變更並標記 scope dirty，不讀取圖片內容，也不寫入 PixivUtil2 DB。

### 4.2 目前造成「繪師列表壞掉」的部分

| 程式位置 | 現況 | 影響 |
| --- | --- | --- |
| `backend/db.py:get_all_artists()` | 直接呼叫 `_get_all_artists_from_viewer_snapshot()` | API 沒有以 root 第一層 scope 作為邊界 |
| `backend/db.py:_get_all_artists_from_viewer_snapshot()` | 遍歷所有 `pixiv_master_member`，再依 member ID 統計數量 | PixivUtil2 snapshot 的非現存成員、舊名稱或不代表第一層資料夾的成員會進入列表 |
| `backend/db.py:get_artist_scope()` | 找不到 scope 時，會從 member row 的名稱拼出 root 子路徑 | 非 root scope 的 member metadata 可能被當成可更新繪師 |
| `backend/library_jobs.py:_reconciliation_loop()` | discovery 在背景執行，`/api/artists` 不主動等待 discovery | 新增或移除第一層資料夾在 discovery 完成前不會即時反映；若 API 仍查 member 全表，反映後仍可能混入錯誤項目 |
| `backend/db.py:viewer_index_scope` | 目前沒有明確的 active／last-seen 欄位 | 已消失的第一層資料夾難以在不碰硬碟的 API request 中被排除 |

因此，修正順序必須是先讓 Viewer-owned root scope 成為列表來源，再處理 scope 的新增、移除與 cache invalidation；不能只修改顯示名稱或對 member row 做去重。

### 4.3 本輪已完成的修正

- `viewer_index_scope` 已增加 active／last-discovered lifecycle；列表只接受已由 root discovery 確認的第一層 artist scope。
- `/api/artists` 已改由 active first-level scopes 建立，不再以 `pixiv_master_member` 全表建立繪師。
- `get_artist_scope()` 已移除從任意 member row 猜測資料夾的 fallback。
- artist gallery filter 會用儲存路徑再次驗證第一層資料夾歸屬，避免 stale 或錯誤 `member_id` 把其他路徑帶入。
- 已補上「巢狀資料夾歸屬」、「來源-only member 排除」與「imported row 依路徑篩選」的 regression tests。

## 5. Indexing 與更新時機

### 5.1 Server 啟動

1. 初始化 Viewer SQLite schema。
2. 立即使用最後一次已 commit 的 Viewer snapshot 提供 `/api/artists`、`/api/months`、`/api/images`。
3. 背景 reconciliation 讀取 PixivUtil2 snapshot（唯讀），對 root 做一次 shallow discovery 與 probe。
4. 若 root 或 artist scope dirty，再排入低優先度 update-library job。
5. UI 收到 job terminal event 後，清除受影響的 page cache 並重新載入 artist/month/image metadata。

啟動時不能為了顯示畫面先對整個 root `os.walk()`。第一次 index 尚未完成時，UI 可以顯示上一次 snapshot；若沒有 snapshot，顯示空列表與 indexing 狀態。

### 5.2 變更偵測

變更偵測分兩層：

| 層級 | 操作 | 成本與用途 |
| --- | --- | --- |
| watcher | Windows `ReadDirectoryChangesW`，遞迴監聽 root | 事件只標記受影響 scope dirty，不讀圖片內容 |
| probe | root 與每個第一層 artist scope 各做一次 shallow signature | 只列舉一層、比較名稱／資料夾 mtime／直接媒體檔 fingerprint；找出新增、移除或可能變更 |
| exact indexing | worker 對 root 或 artist scope 執行 recursive `os.walk()` 與逐檔 stat | 只有這一步才建立完整檔案列表與更新索引 |

probe 是提示，不是完整真相。巢狀資料夾內新增圖片可能不改變 artist 目錄本身的 mtime，因此 watcher 或定期 probe 標記 dirty 後仍必須由 exact indexing 確認。

### 5.3 Job 選擇與優先權

數值越小表示優先權越高：

| 需求 | scope | 建議 priority | 行為 |
| --- | --- | ---: | --- |
| 目前正在看的繪師按更新 | 單一 artist | 0 | 可取消較低優先度的背景 root job，於下一個安全邊界切換 |
| 使用者選取多個繪師 | 多個 artist scopes | 20 | 一個可取消 job，逐 scope 執行，不重複建立一個 job／繪師 |
| 全部繪師／手動 root 更新 | root | 20 或 50 | 一次 recursive scan 覆蓋所有第一層繪師與其巢狀內容 |
| 自動 reconciliation | dirty root／artist scopes | 90 | 不阻塞畫面，不搶目前繪師 |

目前繪師的更新高優先度只影響 worker 排程，不應讓 `/api/images` 等待該 job 完成。更新中的畫面繼續讀最後一次 commit；完成後才切換到新 snapshot。

### 5.4 Cancel 與 commit 規則

- cancel token 必須在 discovery、逐檔 indexing、dominant color 與 cache organization 的邊界檢查。
- 已 commit 的批次可保留；取消中的 scope 不得執行「完整掃描後才可安全執行」的 missing cleanup。
- 完整 scan 成功後才可將該 scope 中未再次看到的 metadata 標成 `is_present = 0`。
- 圖片內容不因取消、更新或重新 indexing 而移動、改名、刪除。
- job 完成或取消後，事件只代表 Viewer snapshot 已可重新讀取；若是取消，UI 不應假裝已完整更新。

### 5.5 Dominant color 時機

檔案 indexing 與色塊分析是兩個階段：

1. indexing 以路徑、size、mtime／fingerprint 更新 `viewer_media_metadata`。
2. fingerprint 改變時，對應 dominant color 標成待重新計算，但保留舊色塊作為短暫 fallback 或清除為 null。
3. indexing 完成後，若 job 設定 `analyze_colors = true`，再由 worker 讀取圖片並寫入 `viewer_dominant_color`。
4. 若使用者只要求快速建立檔案列表，可先完成 indexing；色塊由低優先度的 missing-color job 補齊，不能阻塞繪師切換。
5. 色塊更新完成後只需讓縮圖重新讀取 metadata，不必重新掃描 root，也不必清除未受影響的 image page cache。

## 6. IO 邊界與載入流程

### 6.1 允許硬碟 IO 的地方

```text
watcher / reconciliation probe
        └─ shallow root / artist directory IO
background update-library worker
        └─ recursive walk + per-file stat
background color worker
        └─ read image bytes for color analysis
thumbnail/media endpoint
        └─ only the requested source file or generated cache file
```

### 6.2 不允許同步遞迴 IO 的地方

以下 request 必須只讀 Viewer SQLite、記憶體快取或已產生的縮圖：

- `GET /api/artists`
- `GET /api/months`
- `GET /api/images`
- 切換全部繪師、切換單一繪師、分頁與 MonthQuickNav
- Gallery render、month grouping、虛擬範圍計算

特別禁止在這些路徑呼叫 `os.walk()`；也不應為每一個 artist list row 重新 `stat()` 目錄。畫面要的是「最後一次已確認的 snapshot」，不是在每次互動中重新驗證整棵樹。

### 6.3 更新後事件

更新流程完成後：

1. backend 先 commit Viewer SQLite。
2. backend 對受影響 scope 做 scan cache invalidation。
3. frontend 收到 `web-viewer-library-data-changed`。
4. frontend 清除 image page cache，重新取得 `/api/artists` 與 `/api/months`，再取得目前頁面的 `/api/images`。
5. 若目前選取的 artist 已不存在，保留畫面可讀性並將 selection 回退到全部繪師。

## 7. 快取設計

### 7.1 Backend 快取與持久資料

| 層級 | 現況／規格 | key／內容 | 失效條件 |
| --- | --- | --- | --- |
| Viewer SQLite | 持久 authoritative snapshot | artist scopes、image metadata、present 狀態、job 狀態、色塊 | worker transaction commit；不依賴 5 分鐘記憶體存活 |
| `_SCAN_CACHE` | 現有共用 recursive/direct file snapshot，TTL 300 秒 | `(recursive/direct, absolute folder)`；records、month/year grouping | 完整 scan 後、檔案變更事件或 scope 更新時按 subtree 清除 |
| `_MEDIA_STATUS_CACHE` | 現有 media status 快取，TTL 300 秒 | absolute media path 的 missing／invalid／internal 狀態 | 同一 subtree 的 scan invalidation；全域設定變更時清除 |
| artist list cache | 應新增或由 scope query 建立即時短快取 | root identity + scope revision；只包含 active 第一層 scopes | root discovery 發現新增／移除／改名、hidden 狀態改變、scope commit |
| frontend metadata | React state，request 使用 `cache: no-store` | artists、months | library data changed、artist visibility action、root update complete |
| frontend image page | 現有 LRU 最多 24 頁 | 完整 query string，包含 artist、filters、sort、limit、offset | filter／sort／page size 改變；library data changed；相關 scope commit |
| frontend in-flight dedupe | 現有 Promise map | 同一 image query string 只允許一個 request | request resolve／reject／abort |
| thumbnail scheduler | 現有 owner + priority admission | grid、month-navigation、fullscreen 等 owner；thumbnail 最大 12 個 active，original 最大 2 個 | owner pause/resume、request cancel、fullscreen 切換 |

5 分鐘 TTL 只能是避免重複硬碟 probe 的保護，不能是整個 root index 的唯一保存方式。重新啟動後應直接使用 Viewer SQLite；TTL 到期也不應讓 gallery request 自己遞迴掃描，而是由背景 probe／job 更新 snapshot。

### 7.2 Cache key 與一致性

- path key 一律使用 canonical absolute path 的 normalized form，Windows 大小寫差異不能造成重複 row。
- artist list 的 cache 不得以 `pixiv_master_member` 的 row count 當 revision。
- page cache key 必須包含所有會影響排序與資料內容的條件：artist、month、search、sort mode、limit、offset。
- 更新單一 artist 時，至少失效該 artist page、全部繪師 page、month metadata 與 artist list；不受影響的 thumbnail URL 不必重載。
- cancel 的 partial commit 也要讓相關 page cache 失效，但要保留 UI 可以顯示的舊 snapshot／missing 狀態。

## 8. Gallery Grid 與 MonthQuickNav

### 8.1 載入順序

```text
App
 ├─ /api/artists + /api/months（並行、Viewer snapshot）
 └─ /api/images（依目前 filter、sort、page）
       ├─ page cache hit：立即套用
       ├─ in-flight hit：共用同一 Promise
       └─ miss：只取得目前 page，成功後加入 LRU 24 頁
              └─ prefetch 只作為低優先度暖機，不得取代目前頁面
```

`/api/images` 回傳目前 page、`total` 與每個月份的第一筆 offset。月份 offset 是在目前 artist／filter／sort 條件下計算，MonthQuickNav 不應重新掃描資料夾，也不應把月份選擇誤當成新的 filter。

### 8.2 MonthQuickNav

- 同頁跳轉：使用已取得的 month section，直接以 gallery scroll container 對齊。
- 跨頁跳轉：依 month offset 計算 page，先 request 目標 page，再設定 destination month／global index。
- scrub：以 100 ms debounce 合併跨頁預取，取消已離開的 speculative request，避免拖曳經過大量月份時 queue 無限增長。
- 目標月份的 row 優先載入；目前 viewport 次之；overscan 再次之。
- 沒有目標 DOM 時，可以等待目標 page render，但不能以固定 `requestAnimationFrame` 無限輪詢。
- 目標 page request 與 scroll movement 可以重疊；使用者不必等整頁縮圖 decode 完才開始移動。

### 8.3 Grid 虛擬化

目前 `GalleryGrid` 先將當前 page 的作品依月份分組，再由 `GalleryMonthSection`：

1. 透過 `ResizeObserver` 取得欄數、卡片尺寸與 row stride。
2. 以 scroll viewport、overscan rows 與 destination row 計算 `getVirtualRange()`。
3. 保留完整 section shell 高度，但只 mount viewport 附近的 card。
4. 進行 MonthQuickNav 大跳轉時，強制 mount 目標 row 附近範圍，避免 scroll 已到位但 DOM 還沒有目標縮圖。
5. 只讓 bounded virtual window 進入 thumbnail scheduler；destination row priority 0、可見卡 priority 1、overscan priority 2。

因此 500 或 5,000 筆 page 不應生成同等數量的 card DOM。Grid 的資料量可以大，但 DOM、圖片 decode 與同時進行的 IO 必須受 viewport、overscan 與 scheduler 限制。

### 8.4 不能犧牲的互動

- 切換 artist／全部 artist 時，先保留現有畫面直到新 page snapshot ready，避免整個 grid 閃空。
- current artist update 期間仍可捲動、切換 filter、開啟 fullscreen；背景 job 狀態顯示在 context bar，不鎖住 gallery。
- page cache hit 不應重新觸發 HDD IO。
- `prefers-reduced-motion` 時，MonthQuickNav 與 scroll 使用 auto 行為，但 virtual range 與 priority 規則不變。

## 9. 後續實作順序

1. **已完成：修正 authoritative artist list**：由 active root-first-level scopes 產生 `/api/artists`，排除所有只存在於 `pixiv_master_member` 的成員。
2. **已完成：補 scope active lifecycle**：新增 first-level discovery 的 last-seen／active 狀態；新增、改名、移除都能在不掃描 API request 的前提下反映。
3. **已完成：收緊 `get_artist_scope()`**：只接受 active first-level artist scope，不再從任意 member row 拼接目錄。
4. **待完成：校正既有 Viewer snapshot 的 member mapping**：依 stored media path 的 root 第一 segment 重建 artist member mapping；只修改 Viewer SQLite，不碰 PixivUtil2 `db.sqlite` 與來源檔。現階段 gallery filter 已先以路徑修正顯示結果。
5. **已完成：補 regression tests**：已覆蓋巢狀資料夾歸屬、來源-only member 不出現、imported row 依路徑篩選、第一層 scope 移除與無 HDD walk 的 gallery API。
6. **進行中：保留既有 grid 機制**：先修 artist data boundary，再以 browser performance measurement 驗證 page cache、MonthQuickNav 與 virtual range；不要用重新渲染整個 grid 解決資料更新問題。

## 10. 驗收條件

### 10.1 繪師邊界

- root 下面有 `Artist A/one/two/001.jpg` 時，列表只有 `Artist A`，作品數包含 `001.jpg`。
- `Artist A/one`、`Artist A/two`、`extracted`、`Manga 01` 不會各自出現在列表。
- root 下面新增另一個直屬資料夾時，只新增一個 artist item。
- root 下面的 `_state`、`.pixivutil2-trash`、隱藏資料夾不會出現。
- PixivUtil2 snapshot 中存在但 root 沒有對應第一層資料夾的 member 不會出現。
- 第一層資料夾移除或改名後，舊 artist 不會因為 stale member row 繼續出現；歷史作品可顯示 missing／stale，但不能復活清單項目。

### 10.2 IO 與資料安全

- `/api/artists`、`/api/months`、`/api/images` 的 call path 沒有 recursive HDD walk；切換 artist 不等待 indexing job。
- root discovery 只做一層 enumeration；exact recursive walk 只在 background worker。
- current artist update 能打斷較低優先度 background job，且可由使用者取消。
- indexing、color analysis、cache organization 都不寫入 PixivUtil2 `db.sqlite`。
- indexing 不修改、搬移、刪除 root 下的來源圖片；所有 Viewer metadata 寫入獨立 Viewer SQLite。
- cancelled scan 不會因不完整結果把未掃到的舊檔全部標成 missing。

### 10.3 快取與 grid

- warm Viewer SQLite 下切換全部繪師、切換單一繪師與 page cache hit 不會觸發 root recursive IO。
- library commit 後 artist list、month metadata、受影響 page cache 會失效並重新載入；未受影響的 thumbnail 不需全部重抓。
- MonthQuickNav 跨頁跳轉最多保留目前目標相關的 request；不會因拖曳月份造成 request 無限累積。
- GalleryMonthSection 的 mounted cards 數量與 viewport／overscan 成正比，不與整個 page 數量等比例增加。
- jump destination row 在 scroll 後能 mount 並優先載入，且不必等待整個月份或整頁的圖片完成 decode。
- 正常、selected、loading、cancelled、missing 與 light/dark theme 都維持現有 UI contract；本文件的資料邊界修正不得以破壞 grid 互動換取速度。

## 11. 驗證指令

完成實作後至少執行：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s .\backend\tests -v
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd build
git diff --check
```

另外以測試替換 `os.walk`／`os.scandir` 為會失敗的 stub，確認 `/api/artists`、`/api/months`、`/api/images` 與 gallery navigation 仍只依賴 Viewer snapshot；再以瀏覽器驗證全部繪師、單一繪師、跨頁 MonthQuickNav 與取消 indexing 的實際互動。
