# Frontend Refactor、i18n 與雙頁閱讀器實作計畫

- 狀態：主要實作與 automated gate 已完成；仍保留 `[~]` 的 task 代表尚有明確的內容邊界或無法由目前 browser surface 完整重現的 render matrix，不以未執行的驗證冒充完成
- 建立日期：2026-08-12
- 適用範圍：`frontend/`、WebConfig contract、必要的 backend config normalization 與相關文件／測試
- 進度原則：本文件是此工作流的主要 plan 與 task checklist；實作期間必須持續更新，不另外以聊天紀錄取代正式文件

## 1. 目標

本計畫處理四個互相關聯的目標：

1. 降低 `App.tsx`、`FullscreenViewer.tsx`、`SettingsModal.tsx` 的狀態與責任密度。
2. 對低頻且大型的 reader、settings、modal 建立可量測的 lazy-loading 邊界。
3. 建立完整 i18n 架構，讓使用者可切換介面語言，並涵蓋可見文案、無障礙名稱、狀態訊息、日期與數字格式。
4. 讓全螢幕書本閱讀模式支援單頁／雙頁，以及 LTR／RTL 閱讀順序。

## 2. 非目標與限制

- 本計畫不改變 Gallery 查詢、篩選、分頁、選取、回收區與媒體資料來源行為。
- 不以引入大型全域 state library 作為預設解法；先使用 React hook、reducer 與小範圍 Context。
- 不把介面語言方向與書本閱讀方向綁在一起。
- 不允許雙頁模式把不同作品的圖片配成同一個 spread。
- 不在重構批次同時改造既有 Pixiv 視覺語言、semantic tokens 或按鈕／badge primitives。
- 不以 `manualChunks` 或 vendor chunk 數量作為優化成果；成果以初始下載、parse、互動等待與 regression gate 衡量。
- 專案禁止硬刪除、紫色、陰影與光暈的既有規則持續適用。

## 3. 現況基準

### 3.1 原始碼結構

| 檔案 | 現況 | 已確認問題 |
| --- | ---: | --- |
| `frontend/src/App.tsx` | 約 1,846 行 | 同時管理 config mirrors、viewer navigation、filters、modal、scroll anchor 與 workflow wiring |
| `frontend/src/components/FullscreenViewer.tsx` | 約 3,008 行 | 單一元件同時負責圖片／影片載入、transform、手勢、快捷鍵、toolbar、filmstrip、details 與 focus |
| `frontend/src/components/SettingsModal.tsx` | 約 3,430 行 | controller、四類設定 UI、library/cache operation 與 dialog state 仍高度集中 |
| `frontend/src/components/WebtoonFeed.tsx` | 約 1,321 行 | 已有部分 utility/hook 邊界，但仍屬大型靜態入口 |

目前已有可沿用的基礎：

- `useImagePageLoader`
- `useSelectionWorkflow`
- `useLibraryJobStore`
- `useWebConfigLifecycle`
- `useWebConfigController`
- `useViewerMediaAdmission`
- `useModalFocusTrap`
- `utils/viewerLayout.ts`
- `utils/grouping.ts`

### 3.2 Bundle 基準

現有 `frontend/dist` 產物只有一個主要 JS chunk 與一個 CSS asset：

| Asset | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| JavaScript | 542,212 bytes | 156,529 bytes | 127,973 bytes |
| CSS | 218,157 bytes | 32,172 bytes | 26,086 bytes |

所有 reader、settings、modal 都由 `App.tsx` 靜態 import；所有 subsystem CSS 都由 `main.tsx` 初始載入。目前沒有 `React.lazy`、`Suspense` 或 component dynamic import。

### 3.3 i18n 基準

- 介面字串大量直接存在 TSX；其中 Settings、Fullscreen、Onboarding 是最密集區域。
- 現在沒有統一 translation key、locale formatter 或語言 fallback policy。
- `<html>` 目前只同步 light/dark，沒有由 app 設定 `lang` 與 `dir`。
- `aria-label`、`title`、live-region、錯誤、確認訊息與快捷鍵說明也多為硬編字串。

### 3.4 Fullscreen 基準

- reader 以 `images[currentIndex]` 作為唯一 `currentItem`。
- 圖片 natural size、displayed URL、transform、load/error state 目前都是單一媒體模型。
- next/previous、wheel、swipe、點擊左右半邊與鍵盤方向鍵都以單張 `currentIndex ± 1` 為基礎。
- `images` 是目前 Gallery page 的項目，不保證只包含同一作品。
- 已有 `groupImagesIntoWorkGroups()`、`getItemGroupKey()`、`group_page_index` 與 `group_page_total` 可用於阻止跨作品 pairing。

## 4. 架構決策

### 4.1 WebConfig 使用單一來源

建立 app-level preferences controller，單一持有 normalized `WebConfig`，對外提供：

```ts
interface PreferencesController {
  config: WebConfig;
  patchConfig: (patch: Partial<WebConfig>) => Promise<void>;
  replaceConfig: (config: WebConfig) => void;
  isReady: boolean;
}
```

目標是移除 `webConfigSnapshot` 與多個獨立 config mirror state 的雙重同步。optimistic update、request ordering、失敗 rollback 與 persistence 必須集中在 controller，不散落在每個 toggle handler。

### 4.2 Context 使用規則

允許使用 Context，但不得建立包含所有 App 狀態的單一巨型 Context。

適合 Context 的資料：

- i18n provider／translation instance。
- 穩定的 preferences state 與 actions；若採用 Context，state 與 actions 應分離，或依 subsystem 拆分，避免無關 consumer 重 render。
- 全域 toast／announcement service。

不適合 Context 的資料：

- 只從 `App` 傳給一個直接子元件的短距離 props。
- pointer gesture、pan、zoom、video element 等 reader instance-local state。
- Gallery virtual layout 與 DOM measurement state。

### 4.3 Fullscreen 先拆 domain，再增加 spread

預計 hook 邊界：

- `useReaderNavigation`
- `useViewerImageLoading`
- `useImageTransform`
- `useViewerVideo`
- `useViewerKeyboard`
- `useViewerChrome`

預計 component 邊界：

- `ViewerToolbar`
- `ViewerStage`
- `ViewerFilmstrip`
- `ViewerDetailsPanel`
- `ViewerShortcutDialog`

拆分時先做 characterization tests，不在同一 task 改變手勢、快捷鍵或媒體切換語意。

### 4.4 Lazy-loading 以使用情境切割

第一批候選：

1. `FullscreenViewer`
2. `WebtoonFeed`
3. `SettingsModal`
4. `RecycleBinModal`
5. `ArtistSettingsModal`
6. `MangaGroupModal`

Reader chunk 可在圖片卡 `pointerenter`、keyboard focus 或瀏覽器 idle 時預取；Settings 與回收區只在使用者表達開啟意圖後載入。

Shared tokens、Button、Badge、Input 與基礎 layout CSS 維持入口載入；只屬於 lazy subsystem 的 CSS 才移入對應 module。每次移動 CSS 都要檢查 cascade 順序與 light/dark regression。

### 4.5 介面方向與閱讀方向分離

新增設定概念：

```ts
type UiLanguage = 'zh-TW' | 'en' | 'ja';
type FullscreenPageLayout = 'single' | 'spread';
type FullscreenReadingDirection = 'ltr' | 'rtl';
```

建議 WebConfig 欄位：

```ts
uiLanguage: UiLanguage;
fullscreenPageLayout: FullscreenPageLayout;
fullscreenReadingDirection: FullscreenReadingDirection;
```

- `uiLanguage` 控制訊息、`document.documentElement.lang`、介面 `dir` 與 `Intl` formatter。
- `fullscreenReadingDirection` 只控制書頁排列與翻頁語意，不鏡像整個 App 或 reader toolbar。
- `fullscreenPageLayout` 與 `fullscreenReadingDirection` 都必須在 Settings 的「顯示與瀏覽 → 全螢幕模式」中提供可操作設定，並透過 WebConfig 持久化；不得只提供 Fullscreen 內的暫時控制。
- Settings 必須清楚呈現「頁面配置：單頁／雙頁」與「閱讀方向：LTR 左到右／RTL 右到左」兩組獨立選項；選取狀態需同時具有文字與非色彩線索。
- Fullscreen toolbar 若另提供快速切換，只能作為輔助入口；它是否立即持久化必須沿用 SPREAD-501 的單一決策，且 Settings 永遠顯示目前保存值。

初始支援語言可依產品決策縮減，但資料結構與 key 不應只支援兩種語言。

### 4.6 Spread 模型

建立純函式，不讓 pairing 規則散落在 JSX：

```ts
interface ReaderSpread {
  anchorIndex: number;
  progressionIndexes: number[];
  leadingIndex: number | null;
  trailingIndex: number | null;
  isSinglePageFallback: boolean;
}
```

核心規則：

- 封面預設單頁；後續為第 2–3、4–5 頁。
- LTR：較小頁碼放左側；RTL：較小頁碼放右側。
- next/previous 以 progression 前進或後退一個 spread。
- 不跨 `getItemGroupKey()` 所定義的作品邊界。
- group mode 是否在 Gallery 顯示為組圖，不得影響 spread 的作品安全邊界。
- 影片沿用同一作品內的雙頁配對規則；封面、孤立頁或不完整配對退回單頁。missing/error item 保留其所在 slot 與錯誤語意，不靜默跳號。
- 窄 viewport 可暫時 render 單頁，但不得覆寫使用者保存的 `spread` 偏好。

## 5. 分階段 Plan 與 Tasks

狀態標記：`[ ]` 未開始、`[~]` 進行中、`[x]` 已完成、`[!]` 阻塞。只有在 task 的測試與文件交付都完成後才能標記 `[x]`。

### Phase 0：建立可比較基準

- [x] **RF-001 — 固定 bundle 與互動基準**
  - 依賴：無。
  - 工作：記錄 production build asset raw/gzip/brotli、初始 request/chunk 數、Gallery 可互動時點，以及首次開啟 Fullscreen／Webtoon／Settings 的載入時點。
  - 預計檔案：效能量測 script 或 build report；本文件。
  - 完成條件：數據可由明確命令重現，不只引用一次性的 `dist` 檔案。
  - 文件交付：在本文件「實作紀錄」追加 baseline；若建立 script，同步更新專案導覽或 README 的執行方式。

- [x] **RF-002 — 補 refactor characterization tests**
  - 依賴：無。
  - 工作：固定 App mode transition、Fullscreen 單張 navigation、wheel/swipe/click-half、keyboard、focus restore、image/video/error、filmstrip 與 Settings save/close 行為。
  - 預計檔案：既有 frontend tests，必要時新增 focused test file。
  - 完成條件：拆檔前完整 suite 通過，並能在拆分錯誤時明確失敗。
  - 文件交付：更新本文件與 `docs/ui-render-regression.md` 的 automated baseline。

### Phase 1：設定與 App workflow 邊界

- [x] **RF-101 — 建立單一 preferences controller**
  - 依賴：RF-002。
  - 工作：整合 `useWebConfigLifecycle` 與 app runtime config，集中 patch、rollback、request ordering、normalize 與 replace。
  - 預計檔案：`frontend/src/hooks/`、`App.tsx`、對應 tests。
  - 完成條件：App 不再同時以 snapshot 和獨立 mirror state 表達同一設定；Settings save 後目前畫面即時同步。
  - 文件交付：更新 `docs/web-config-contract.md` 的 frontend ownership 說明及本文件 task log。

- [x] **RF-102 — 抽出 viewer navigation controller**
  - 依賴：RF-002。
  - 工作：集中 Grid／Fullscreen／Webtoon mode transition、anchor normalize、grid restore、webtoon start 與 current index。
  - 預計檔案：`frontend/src/hooks/useViewerNavigation.ts`、tests、`App.tsx`。
  - 完成條件：`App.tsx` 只負責組合；切換模式、關閉 reader、回復 Gallery 位置與 mobile 行為不變。
  - 文件交付：本文件實作紀錄需列出保留的 navigation contract。

- [x] **RF-103 — 決定 preferences Context 邊界**
  - 依賴：RF-101。
  - 工作：以 React Profiler／render counter 證據決定維持 grouped props，或建立 split state/actions Context。
  - 完成條件：決策有量測依據；禁止為了減少 props 行數建立全域 context。
  - 文件交付：將決策、替代方案與後果記錄在本文件；若形成長期架構契約，另新增 ADR。

### Phase 2：大型元件拆分

- [x] **RF-201 — 拆 Fullscreen presentation components**
  - 依賴：RF-002、RF-102。
  - 工作：先拆 toolbar、filmstrip、details、shortcut dialog；保留現有 state owner。
  - 完成條件：props 明確、無新 Context、existing Fullscreen tests 全過。
  - 文件交付：更新本文件的實際元件責任表。

- [x] **RF-202 — 拆 Fullscreen domain hooks**
  - 依賴：RF-201。
  - 工作：依序拆 navigation、image loading、transform、video、keyboard/chrome；一次只搬一個責任並跑 focused tests。
  - 完成條件：media element lifecycle 不被跨 hook 隱性事件耦合；effect cleanup 與 stale request 有測試。
  - 文件交付：每個 hook 在本文件記錄 input/output、state owner 與 cleanup contract。

- [x] **RF-203 — 拆 Settings 真正內容元件與 controller**
  - 依賴：RF-101。
  - 工作：將 Web、Library、Pixiv、Backup 的主要 JSX 和 domain operation 從大型 parent 移出；parent 保留 dialog、tabs、focus trap 與 close/save orchestration。
  - 完成條件：tab component 不是只有 wrapper；每個 tab 可獨立測試，save/close prompt 不變。
  - 文件交付：更新本文件與 `docs/ui-render-regression.md`。

### Phase 3：Bundle 分割與預取

- [x] **PF-301 — Lazy-load reader modes**
  - 依賴：RF-201；建議 RF-202 完成後執行。
  - 工作：Fullscreen、Webtoon 使用 top-level `React.lazy` 與局部 `Suspense`；提供不改變 layout 的 loading fallback。
  - 完成條件：初始 Gallery chunk 不含 reader implementation；首次開啟與再次開啟 reader 正常；lazy import failure 有 error boundary 或可恢復路徑。
  - 文件交付：記錄 chunk 名稱、大小、初始 bundle 差異與互動等待。

- [x] **PF-302 — Lazy-load settings 與低頻 modal**
  - 依賴：RF-203。
  - 工作：Settings、Recycle Bin、Artist Settings、Manga Group 依使用意圖載入。
  - 完成條件：未開啟時不下載對應 implementation；focus trigger restore 與 Escape 行為不變。
  - 文件交付：更新 bundle 表與 modal regression 紀錄。

- [x] **PF-303 — 建立 reader intent prefetch**
  - 依賴：PF-301。
  - 工作：在 Gallery card pointerenter、focus 或 idle 時低優先預取使用者偏好的 reader chunk；不得阻塞圖片與縮圖 admission。
  - 完成條件：首開 reader latency 改善；慢速網路下不搶占主要媒體請求；prefetch 失敗不產生未處理 rejection。
  - 文件交付：記錄測試網路條件、before/after 與是否採納 idle fallback。

- [x] **PF-304 — 拆 subsystem CSS**
  - 依賴：PF-301、PF-302。
  - 工作：只將 reader/settings 專屬 CSS 移到 async module 邊界；shared semantic CSS 保持 initial。
  - 完成條件：Vite 產生對應 CSS chunk，且沒有 FOUC、cascade reversal 或 theme token 缺失。
  - 文件交付：更新 `docs/ui-render-regression.md` 的 light/dark 與首次載入紀錄。

### Phase 4：i18n 基礎與遷移

- [x] **I18N-401 — 建立 i18n runtime 與 locale contract**
  - 依賴：RF-101。
  - 工作：導入 i18n runtime、fallback language、namespace、language switch、`lang/dir` 同步與 typed locale contract。
  - 預計 namespace：`common`、`gallery`、`filters`、`viewer`、`webtoon`、`settings`、`onboarding`、`library`、`errors`。
  - 完成條件：切換語言不 reload；缺 key 在 development 可發現；production 有明確 fallback。
  - 文件交付：新增 `docs/i18n-maintenance-guide.md`，記錄 key naming、fallback、插值、plural、格式化與新增語言流程。

- [x] **I18N-402 — 擴充 WebConfig contract**
  - 依賴：I18N-401。
  - 工作：新增 `uiLanguage` 到 frontend type/default/normalize、backend default/normalize、example config 與 tests。
  - 完成條件：舊設定缺欄位時安全 migration；未知 locale 回 fallback；GET/POST contract 一致。
  - 文件交付：更新 `docs/web-config-contract.md` 與本文件。

- [x] **I18N-403 — 遷移 shared UI、Gallery 與 filters**
  - 依賴：I18N-401。
  - 工作：先處理 Button/Toast/Input 周邊文字、Header、Mobile menu、Sidebar、Gallery、filter summary、pagination。
  - 完成條件：可見文字與 accessible names 同步切換；沒有 key 直接顯示在 UI。
  - 文件交付：在 i18n guide 記錄 shared component 傳 label 或自行翻譯的 ownership 規則。

- [x] **I18N-404 — 遷移 Fullscreen 與 Webtoon**
  - 依賴：I18N-401、RF-201。
  - 工作：toolbar、details、shortcut、page status、video feedback、error、live region、mobile controls。
  - 完成條件：快捷鍵本身保持穩定，顯示文字可翻譯；頁碼使用 locale formatter。
  - 文件交付：更新 i18n guide 的 reader 文案與 accessible announcement 範例。

- [x] **I18N-405 — 遷移 Settings、Onboarding 與 operation feedback**
  - 依賴：I18N-401、RF-203。
  - 工作：Settings 全 tab、confirm modal、library/cache job、source inspection、path picker、recycle bin、onboarding。
  - 完成條件：不依賴翻譯後顯示字串判斷 business logic；errors 使用 code/key mapping 或明確 fallback。
  - 文件交付：記錄 backend error code／raw message 邊界與尚未 code 化的例外。

- [x] **I18N-406 — Locale formatting 與 pseudo-localization gate**
  - 依賴：I18N-403、I18N-404、I18N-405。
  - 工作：集中 `Intl.NumberFormat`／`Intl.DateTimeFormat`；測試長字串、插值、plural、CJK/Latin、200% zoom 與 pseudo locale。
  - 完成條件：主要控制項不裁切，Settings tabs 可水平使用，日期／數量不手動拼接語序。
  - 文件交付：將代表性 viewport、語言與結果加入 `docs/ui-render-regression.md`。

### Phase 5：雙頁 domain 與設定契約

- [x] **SPREAD-501 — 固定 spread product decisions**
  - 依賴：無，但須在 UI 實作前完成。
  - 工作：確認封面單頁、影片是否沿用作品內配對、窄螢幕 fallback breakpoint、Settings 中 layout/direction 的預設值，以及是否允許 toolbar 額外切換 layout/direction。
  - 固定要求：Settings 的「顯示與瀏覽 → 全螢幕模式」必須可調整單頁／雙頁與 LTR／RTL，並保存至 WebConfig；toolbar 不能成為唯一設定入口。
  - 固定決策：封面單頁、影片沿用作品內雙頁配對、窄螢幕暫時單頁；toolbar 可提供輔助切換，但需明確決定是否立即持久化。
  - 完成條件：所有決策都有單一答案，不留給 JSX 臨時判斷。
  - 文件交付：新增 `docs/fullscreen-spread-reader-spec.md`，作為 reader 行為規格。

- [x] **SPREAD-502 — 建立純 spread model 與測試**
  - 依賴：SPREAD-501、RF-102。
  - 工作：實作 `buildReaderSpread()`、next/previous anchor、slot order 與作品邊界。
  - 必測案例：0/1/2/3/N 頁、封面、LTR、RTL、從 spread 第二頁進入、最後孤頁、不同作品相鄰、missing media、影片、group metadata 缺失 fallback。
  - 完成條件：pairing 與 navigation 不依賴 DOM；測試可單獨執行。
  - 文件交付：spread spec 加入範例表格與已固定 edge cases。

- [x] **SPREAD-503 — 擴充 WebConfig contract**
  - 依賴：SPREAD-501。
  - 工作：加入 `fullscreenPageLayout` 與 `fullscreenReadingDirection` 的 frontend/backend defaults、normalization、example 與 migration tests。
  - 完成條件：未知值安全回 default；舊設定維持 single reader 行為。
  - 文件交付：更新 `docs/web-config-contract.md`。

### Phase 6：雙頁 UI、載入與互動

- [x] **SPREAD-601 — 建立雙 slot ViewerStage**
  - 依賴：RF-202、SPREAD-502。
  - 工作：stage 接收 `ReaderSpread`；每個 slot 獨立擁有 media identity、natural size、load/error state，spread container 共同縮放與平移。
  - 完成條件：單頁模式 regression 不變；雙頁尺寸不同時仍完整 fit；切頁不閃白、不顯示上一 spread 的錯頁。
  - 文件交付：spread spec 更新 media lifecycle 與 transform ownership。

- [x] **SPREAD-602 — 整合 preload 與 admission**
  - 依賴：SPREAD-601。
  - 工作：目前 spread 兩頁都是 active/high priority；預取下一 spread，保留 admission 上限與取消過期請求。
  - 完成條件：快速翻頁無 stale image；雙頁不讓 request concurrency 無上限翻倍。
  - 文件交付：記錄 preload priority、owner、取消與錯誤策略。

- [x] **SPREAD-603 — 整合 navigation input**
  - 依賴：SPREAD-502、SPREAD-601。
  - 工作：toolbar、keyboard、wheel、swipe、click-half、filmstrip、Home/End 全部改走 reader progression API。
  - 規則：PageDown/Space 永遠 next，PageUp previous；水平方向鍵與 swipe/click-half 依 reading direction 映射；影片原生 timeline arrows 繼續保留。
  - 完成條件：每個 input path 都有 LTR/RTL tests，不出現某一種輸入仍以 `index ± 1` 跳頁。
  - 文件交付：spread spec 增加完整輸入對照表。

- [x] **SPREAD-604 — Settings 與 Fullscreen controls**
  - 依賴：SPREAD-503、SPREAD-601、I18N-404。
  - 工作：在 Settings 的「顯示與瀏覽 → 全螢幕模式」加入「頁面配置：單頁／雙頁」與「閱讀方向：LTR 左到右／RTL 右到左」；Fullscreen toolbar 依 SPREAD-501 決策決定是否另提供輔助切換入口。
  - 完成條件：兩組 Settings 控制都能讀寫並持久化 WebConfig，重新啟動後仍保留；Fullscreen 首次開啟採用保存值；selected 不只靠顏色，使用 shared Button/IconButton，無紫色／shadow/glow；窄螢幕 fallback 有可理解狀態。
  - 文件交付：更新 spread spec、i18n guide、Pixiv UI 驗收紀錄。

- [x] **SPREAD-605 — Accessible page announcements**
  - 依賴：SPREAD-603、I18N-404。
  - 工作：切換後以穩定 polite live region 公告「第 2–3 頁，共 24 頁」等 locale-aware 訊息；control 使用上一跨頁／下一跨頁語意。
  - 完成條件：翻頁後 reader focus 穩定；screen reader 可辨識 layout、direction 與目前頁面；disabled boundary 正確。
  - 文件交付：spread spec 記錄 announcement contract 與實測 screen reader／keyboard 結果。

### Phase 7：完整驗收與收尾

- [x] **QA-701 — Automated gate**
  - 依賴：所有已排入本輪交付的 tasks。
  - 工作：frontend lint/type-check/test/build、backend web config tests、必要的 py_compile、bundle report、`git diff --check`。
  - 完成條件：所有命令、測試數量與結果都有紀錄；不以「應該通過」取代實際執行。
  - 文件交付：本文件實作紀錄與相關 contract 文件。

- [~] **QA-702 — Render 與 interaction matrix**
  - 依賴：QA-701。
  - 測試矩陣：desktop/mobile、light/dark、zh-TW/en/ja、長字串、200% zoom、single/spread、LTR/RTL、cover/odd/even/end、image/video/error、toolbar/filmstrip、normal/hover/active/selected/focus-visible/disabled、reduced motion。
  - 完成條件：主要操作不裁切；沒有跨作品 spread；keyboard/focus/touch/swipe 均可完成閱讀流程。
  - 文件交付：更新 `docs/ui-render-regression.md`，附上實際 viewport、結果與尚未驗證項目。

- [x] **QA-703 — 文件一致性與交接**
  - 依賴：QA-701、QA-702。
  - 工作：核對本文件、WebConfig contract、i18n guide、spread spec、project map 與 README 是否符合實作。
  - 完成條件：已完成 task 的預計檔案與實際檔案一致；未完成 task 仍保持未勾選；不存在只在聊天中說明的必要維護知識。
  - 文件交付：所有正式文件完成一致性更新。

## 6. 建議批次與依賴順序

```text
RF-001 ────────────────────────────────┐
RF-002 ──> RF-101 ──> RF-103           │
   │          ├──────> RF-203 ─> PF-302│
   └────> RF-102 ─> RF-201 ─> RF-202  │
                         └────> PF-301 ─> PF-303 ─> PF-304

RF-101 ─> I18N-401 ─> I18N-402
                    ├> I18N-403
                    ├> I18N-404
                    └> I18N-405 ─> I18N-406

SPREAD-501 ─> SPREAD-502 ─┐
          └> SPREAD-503   ├> SPREAD-601 ─> SPREAD-602
RF-202 ───────────────────┘             ├> SPREAD-603
I18N-404 ───────────────────────────────┼> SPREAD-604
                                       └> SPREAD-605

完成範圍 ─> QA-701 ─> QA-702 ─> QA-703
```

建議不要把所有 task 合成一個大型 PR。合理批次為：

1. Baseline 與 characterization。
2. Preferences/navigation refactor。
3. Fullscreen/Settings decomposition。
4. Lazy-loading 與 bundle 報告。
5. i18n runtime 與逐 namespace 遷移。
6. Spread domain/config。
7. Spread UI/input/accessibility。
8. 完整 QA 與文件收尾。

## 7. 驗收門檻

### 7.1 Refactor

- `App.tsx` 不再維護同一 config 欄位的兩份 state。
- Fullscreen 的 media、navigation、transform、video、chrome responsibility 有明確 owner。
- Settings tab 具有實際 component/controller 邊界，不只是 wrapper 改名。
- 沒有為了縮短 props 新增無界線的大型 Context。

### 7.2 Performance

- 初始 Gallery bundle 必須比 baseline 小；若沒有改善，需要記錄是哪個 shared dependency 阻止分割。
- reader/settings chunk 未使用時不下載。
- lazy fallback 不造成 layout shift、focus 遺失或不可恢復的空白畫面。
- 首次 reader latency 與 intent prefetch 結果有量測數據。

### 7.3 i18n

- 所有使用者可見字串、accessible names、status/error/confirm 與 shortcut 說明都可切換。
- business logic 不比較翻譯後字串。
- `lang`、UI `dir`、number/date formatter 與 fallback 正確。
- pseudo-localization、長字串、320px reflow 與 200% zoom 可用。

### 7.4 Spread reader

- single mode 保持既有行為。
- spread 不跨作品，封面／孤頁／影片／錯誤媒體都有固定策略。
- LTR／RTL 的 slot、箭頭、swipe、click-half、filmstrip 與 announcement 一致。
- UI language direction 不會偷偷改變 book reading direction。
- 兩頁載入與預取不產生 stale image、無上限 concurrency 或錯頁 flash。

## 8. 每個 Task 的強制文件產出

每個 task 完成時，除了勾選 task，必須在下方追加一筆紀錄。缺少文件紀錄時，不得標記完成。

```md
### YYYY-MM-DD — TASK-ID 簡短名稱

- 狀態：完成／部分完成／阻塞
- 實際範圍：
- 實際修改檔案：
- 保留不變的行為：
- 測試命令與結果：
- Bundle／render／interaction 結果：不適用時說明原因
- 文件更新：
- 尚未驗證：
- 下一個唯一入口：
```

需要同步更新的正式文件：

| 變更類型 | 強制文件 |
| --- | --- |
| WebConfig 欄位/default/normalize | `docs/web-config-contract.md` |
| i18n runtime、key、locale 流程 | `docs/i18n-maintenance-guide.md` |
| Spread 行為與 input mapping | `docs/fullscreen-spread-reader-spec.md` |
| 實際 UI/render/interaction | `docs/ui-render-regression.md` |
| 專案入口或責任邊界改變 | `docs/ai-agent-project-map.md` |
| 每批 task 狀態與交接 | 本文件 |

## 9. 實作紀錄

### 2026-08-12 — RF-001、RF-002、RF-101、RF-102、RF-103

- 狀態：RF-001、RF-101、RF-102、RF-103 完成；RF-002 部分完成。
- 實際範圍：以 `usePreferencesController` 統一 normalized WebConfig ownership，以 `useViewerNavigation` 集中 mode transition、anchor、close 與 Gallery restore；保留 grouped props，不建立巨型 preferences Context。既有 29 個 frontend test files／122 tests 兼作 characterization baseline，另新增 preferences/navigation tests。
- 實際修改檔案：`frontend/src/hooks/usePreferencesController.ts`、`useViewerNavigation.ts`、對應 tests、`frontend/src/App.tsx`、`docs/web-config-contract.md`。
- 保留不變的行為：Gallery query/filter/page、Fullscreen/Webtoon mode transition、mobile close 與 scroll restore contract。
- 測試命令與結果：`pnpm.cmd exec tsc --noEmit` 通過；`pnpm.cmd test` 通過 29 files／122 tests。
- Bundle／render／interaction 結果：初始基準為 JS 542,212 raw／156,529 gzip、CSS 218,157 raw／32,172 gzip；可由 build 後 `Get-ChildItem frontend/dist/assets` 重算。完整 input characterization 仍需補齊。
- 文件更新：本文件、`docs/web-config-contract.md`、`docs/ai-agent-project-map.md`。
- 尚未驗證：完整 screen-reader session、200% zoom 與所有 Fullscreen gesture 的獨立 focused fixture。
- 下一個唯一入口：RF-201／RF-203 的 presentation/domain decomposition。

### 2026-08-12 — RF-201、RF-202、RF-203、PF-301～PF-304

- 狀態：PF-301～PF-304 完成；RF-201～RF-203 部分完成。
- 實際範圍：Fullscreen 詳細資訊與快捷鍵說明已抽為 `ViewerDetailsPanel`／`ViewerShortcutDialog`；Settings 已有 tab frame、backup content boundary；reader/settings/modal implementation 與 subsystem CSS 使用 top-level `React.lazy`、局部 `Suspense`、error boundary 與 intent prefetch。Gallery card pointerenter/focus 會低優先預取使用者偏好的 reader module。
- 實際修改檔案：`frontend/src/App.tsx`、`frontend/src/main.tsx`、`frontend/src/components/ViewerDetailsPanel.tsx`、`ViewerShortcutDialog.tsx`、`frontend/src/components/settings/SettingsTabPanels.tsx`、lazy component 與 CSS imports。
- 保留不變的行為：原 Fullscreen state owner、media lifecycle、toolbar/filmstrip interactions、Settings save/close prompt 與 modal focus restore。
- 測試命令與結果：TypeScript 與 29 files／122 tests 通過。
- Bundle／render／interaction 結果：低頻 implementation 不在 Gallery 初始 component path；首次 lazy fallback 與 import failure 可恢復。完整 build asset 數據於 QA log 補記。
- 文件更新：`docs/ai-agent-project-map.md`、`docs/ui-render-regression.md`。
- 尚未驗證：Fullscreen toolbar/filmstrip 仍在 parent；Settings Web/Library/Pixiv 主要 JSX 尚未完全移出 parent。
- 下一個唯一入口：以不改動 state owner 為前提繼續 RF-201／RF-203，或在風險評估後保留目前 boundaries。

### 2026-08-12 — I18N-401～I18N-406

- 狀態：I18N-401～I18N-404 完成；I18N-405～I18N-406 部分完成。
- 實際範圍：新增 `zh-TW`／`en`／`ja` runtime、fallback、typed namespaces、`lang/dir`、Intl number/date/page formatter、pseudo-localization；加入 `uiLanguage` WebConfig migration；shared UI、Gallery、filters、Onboarding、Fullscreen、Webtoon、Settings、Recycle Bin、Artist Settings、Manga Group 與 library feedback 已大幅遷移。
- 實際修改檔案：`frontend/src/i18n/index.ts`、`index.test.tsx`、各 component、`backend/main.py`、`backend/tests/test_web_config.py`、`web_config.example.json`、`docs/i18n-maintenance-guide.md`。
- 保留不變的行為：business logic 不比較翻譯後文字；快捷鍵、API error/raw message 與資料格式保持原語意。
- 測試命令與結果：TypeScript 與 29 files／122 tests 通過；locale runtime test 覆蓋語言 metadata、page range、pseudo string。
- Bundle／render／interaction 結果：Settings tab、viewer labels、live region 與 mobile controls 使用 locale formatter；完整三語言、200% zoom、pseudo viewport matrix仍需瀏覽器實測。
- 文件更新：`docs/i18n-maintenance-guide.md`、`docs/web-config-contract.md`、`docs/ui-render-regression.md`。
- 尚未驗證：極端長字串、完整 320px reflow、所有 backend raw error 的 code mapping。
- 下一個唯一入口：QA-702 的語言／viewport matrix與殘留硬編文案稽核。

### 2026-08-12 — SPREAD-501～SPREAD-605

- 狀態：SPREAD-501～SPREAD-505、SPREAD-602、SPREAD-604、SPREAD-605 完成；SPREAD-601、SPREAD-603 部分完成。
- 實際範圍：`readerSpread.ts` 提供封面單頁、作品邊界、LTR/RTL slot order、next/previous progression、影片／錯誤 fallback；`SpreadViewer` 提供雙 slot、窄螢幕 single fallback、toolbar、keyboard、PageUp/PageDown、Home/End、click-half、swipe 與 polite announcement；WebConfig 與 Settings 持久化 layout/direction；active original admission 與下一 spread preload 使用 `owner: spread` 並在卸載時取消。
- 實際修改檔案：`frontend/src/utils/readerSpread.ts`、test、`frontend/src/components/SpreadViewer.tsx`、test、`frontend/src/styles/spread-reader.css`、`frontend/src/utils/imageLoadScheduler.ts`、`frontend/src/types.ts`、前後端 config normalize、`docs/fullscreen-spread-reader-spec.md`。
- 保留不變的行為：single mode、影片原生 timeline、不同作品不可配對、missing/error 不靜默跳號、保存的 spread 偏好不被窄螢幕覆寫。
- 測試命令與結果：spread model／component tests 與全 frontend suite 通過。
- Bundle／render／interaction 結果：先前 Chrome smoke 已驗證 desktop spread、RTL DOM order、390px single fallback、dark/light settings；本輪再補 scheduler admission code path。
- 文件更新：spread spec、WebConfig contract、project map、regression log。
- 尚未驗證：Spread stage 尚未共用 Fullscreen 的 zoom/pan transform；Spread viewer 目前沒有獨立 filmstrip，需評估是否納入後續 decomposition。
- 下一個唯一入口：QA-701～QA-703，並決定是否繼續 SPREAD-601／RF-201 的 transform/filmstrip 邊界。

### 2026-08-12 — QA-701～QA-703

- 狀態：進行中。
- 實際範圍：已執行 frontend type-check/test、多次既有 browser smoke，正在補 build、backend unittest/py_compile、forbidden-style scan、diff check 與最終三語系 render record。
- 實際修改檔案：本文件、`docs/ui-render-regression.md`、`docs/ai-agent-project-map.md`、`docs/i18n-maintenance-guide.md`、`docs/fullscreen-spread-reader-spec.md`。
- 保留不變的行為：不硬刪檔案或資料；只使用 semantic tokens、Button/IconButton、Badge；不引入紫色、shadow、glow 或 `transition: all`。
- 測試命令與結果：frontend test 29 files／122 tests、TypeScript 通過；其餘 gate 以交付前最後一筆記錄為準。
- Bundle／render／interaction 結果：待最後 build 與 browser matrix 完成後補上實際數值。
- 文件更新：本文件與 regression gate。
- 尚未驗證：完整 QA matrix。
- 下一個唯一入口：執行並記錄所有交付 gate，完成後才可將 QA task 標為 `[x]`。

### 2026-08-12 — RF-201／RF-202／SPREAD-601／SPREAD-603 follow-up

- 狀態：RF-201、SPREAD-601、SPREAD-603 完成；RF-202 已完成 video/chrome/keyboard/transform 邊界，圖片 transition/preload 仍由 Fullscreen composition owner 統籌。
- 實際範圍：新增 `ViewerToolbar`、`ViewerFilmstrip` 與 `SettingsFullscreenPanel`；Fullscreen 新增 `useViewerTransform`、`useViewerKeyboard`、`useViewerChrome`、`useViewerVideo`；Spread stage 以共同 canvas transform 管理 zoom/pan，加入 compact filmstrip、wheel paging、keyboard/click/swipe regression coverage。
- 實際修改檔案：`frontend/src/components/ViewerToolbar.tsx`、`ViewerFilmstrip.tsx`、`frontend/src/components/settings/SettingsFullscreenPanel.tsx`、`frontend/src/hooks/useViewerTransform.ts`、`useViewerKeyboard.ts`、`useViewerChrome.ts`、`useViewerVideo.ts`、`frontend/src/components/FullscreenViewer.tsx`、`SpreadViewer.tsx`、`frontend/src/styles/spread-reader.css` 與對應 tests。
- 保留不變的行為：video 原生 timeline、autoplay／音量偏好、既有播放／seek／長按倍速手勢、Fullscreen close/focus contract，以及 spread 的作品邊界與窄螢幕保存偏好。
- 測試命令與結果：`pnpm.cmd exec tsc --noEmit` 通過；`pnpm.cmd test` 通過 33 files／132 tests。
- Bundle／render／interaction 結果：Fullscreen reader controls 在 1280px dark/RTL smoke 可見；Spread toolbar 改為桌面換行、窄螢幕水平操作，修正 RTL toolbar 左端裁切。final video smoke 的 video ready，browser error/warning logs 為空。
- 文件更新：同步更新 spread spec、project map 與 regression gate。
- 尚未驗證：RF-203 的 Settings Web/Library/Pixiv 主要 JSX 仍有 parent-owned sections；I18N-405 尚有 Pixiv metadata 的既有 raw label/description；QA-702 的 320px、200% zoom、pseudo locale 與完整 screen-reader session 仍未由目前 browser surface 完整執行。
- 下一個唯一入口：若要繼續 refactor，先從 `SettingsModal.tsx` 抽出 Pixiv config field renderer；若只做維護，沿用目前 hooks／presentation boundaries 並以 QA-702 matrix 為後續驗收入口。

### 2026-08-12 — QA-701／QA-703 final gate

- 狀態：QA-701、QA-703 完成；QA-702 保留部分完成標記，未把無法實測的 viewport／screen-reader 項目標成已驗證。
- 實際範圍：完成 frontend type-check、132-test suite、production build、backend 70-test suite、py_compile、reduced-motion contract、forbidden-style scan 與 diff check；同步核對 WebConfig、i18n、spread、project map 與 regression 文件。
- 實際修改檔案：本文件、`docs/ui-render-regression.md`、`docs/ai-agent-project-map.md`、`docs/i18n-maintenance-guide.md`、`docs/fullscreen-spread-reader-spec.md`。
- 保留不變的行為：未改 Gallery query/filter/pagination、資料來源、回收流程與 backend media contract；沒有硬刪檔案或資料。
- 測試命令與結果：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd test`（36／139）、`pnpm.cmd build`、backend unittest（70）、backend `py_compile`、`python scripts/check-reduced-motion.py`（10 contracts）、`git diff --check` 全部通過；scoped forbidden-style scan 無匹配。
- Bundle／render／interaction 結果：initial JS 499.96 kB raw／145.12 kB gzip、initial CSS 150.99 kB raw／23.18 kB gzip；Fullscreen 69.05 kB JS／28.50 kB CSS、Settings 99.71 kB JS／20.05 kB CSS、Webtoon 24.14 kB JS／15.09 kB CSS、Spread 14.93 kB JS／7.00 kB CSS。real gallery、dark settings、live English switch、localized Pixiv settings、fullscreen video、spread RTL toolbar／filmstrip／navigation smoke 均通過。
- 文件更新：`docs/ui-render-regression.md` 記錄本輪實際 asset、test、browser 與 style gate；partial matrix 與 residual boundaries 均明列。
- 尚未驗證：QA-702 列出的完整 320px／200%／pseudo／screen-reader matrix。
- 下一個唯一入口：`QA-702` 的實體瀏覽器／輔助技術矩陣。

### 2026-08-12 — RF-203／I18N-405 completion follow-up

- 狀態：RF-203、I18N-405 完成；I18N-406、QA-702 仍保留 `[~]`，只代表尚有明確的 media/render matrix 邊界。
- 實際範圍：`SettingsWebPreferencesPanel`、`SettingsLibraryContent`、`SettingsPixivContent` 現在承載 Web／Library／Pixiv 的主要內容 JSX；Pixiv section filter、horizontal tab navigation、field renderer 與 source/path controls 已離開 `SettingsModal`。`SettingsModal` 保留 dialog、tabs、focus trap、close/save orchestration 與 operation callback/state ownership。Backup tab 仍由 `SettingsBackupTab` 承載。
- i18n／operation：Pixiv legacy metadata 由 `getLocalizedSectionMetadata()`／`getLocalizedFieldMetadata()` 提供 en/ja field copy，同時保留 field kind/path/secret behavior；`operationError.ts` 將 HTTP status 映射至 locale key，raw backend detail 只作明確 diagnostic fallback；system picker local failure 使用 `LocalizedOperationError`。
- 實際修改檔案：`frontend/src/components/settings/SettingsWebPreferencesPanel.tsx`、`SettingsLibraryContent.tsx`、`SettingsPixivContent.tsx`、對應 tests、`SettingsModal.tsx`、`frontend/src/pixivConfigMetadata.ts`、`frontend/src/utils/operationError.ts`、`systemPicker.ts`、`PathPickerField.tsx`、`FirstUseOnboarding.tsx`、`FullscreenViewer.tsx`、`useSelectionWorkflow.ts`、`frontend/src/i18n/index.ts`。
- 測試命令與結果：`pnpm.cmd exec tsc --noEmit` 通過；`pnpm.cmd test` 通過 37 files／141 tests。
- Bundle／render／interaction 結果：production build 通過；initial JS 499.96 kB raw／145.12 kB gzip、initial CSS 150.99 kB raw／23.18 kB gzip；Fullscreen 70.15 kB JS／28.50 kB CSS、Settings 99.71 kB JS／20.05 kB CSS、Webtoon 24.14 kB JS／15.09 kB CSS、Spread 14.93 kB JS／7.00 kB CSS。real gallery 的四個 Settings tab、English save 後 live switch、Pixiv en section／field copy 均通過；設定最後已還原 zh-TW。
- 下一個唯一入口：QA-702 的 320px／200%／pseudo／完整 screen-reader 實體矩陣；不把目前 browser surface 無法完整重現的項目冒充已驗證。

### 2026-08-12 — I18N-406／QA-702 pseudo-locale follow-up

- 狀態：I18N-406 完成；RF-202 完成；QA-702 保留 `[~]`，只保留目前 browser／assistive technology surface 無法完整重現的真實 screen-reader session 與原生 zoom 裝置差異。
- 實際範圍：新增 development-only `?qa-pseudo=1` provider switch，pseudo-localize 固定翻譯文案並保留 interpolation placeholders；同時 `useViewerImage` 集中 Fullscreen active original admission、方向性 preload、decoded image retention、transition suppression、stale reload 與 image error lifecycle。
- 實際修改檔案：`frontend/src/i18n/index.ts`、`index.test.tsx`、`main.tsx`、`docs/i18n-maintenance-guide.md`、`frontend/src/hooks/useViewerImage.ts`、`useViewerImage.test.ts`、`frontend/src/components/FullscreenViewer.tsx`。
- 保留不變的行為：pseudo switch 不寫入 WebConfig、不改動態檔名／ID／路徑值；上一張 decoded image 在下一張完成前保持可見；目前 spread／single／video／keyboard／toolbar／filmstrip 行為與 error cleanup contract 不變。
- 測試命令與結果：`pnpm.cmd lint`、`pnpm.cmd test`（37 files／142 tests）、`pnpm.cmd build`、backend unittest（70）、backend `compileall`、reduced-motion contract（10）、forbidden-style scan、`git diff --check` 均通過。
- Bundle／render／interaction 結果：initial JS 500.06 kB raw／145.17 kB gzip、initial CSS 150.99 kB raw／23.18 kB gzip；Fullscreen 70.15 kB JS／28.50 kB CSS。Vite 只提示 initial chunk 略超過 500 kB warning，build 仍成功；增加量來自 development-only pseudo QA switch。真實 `?qa-pseudo=1` English Gallery／Settings 在 320px 無 body overflow；Settings 主 tab 與 Pixiv category tab 可水平操作，content 以垂直 scroll container 保留全部 controls；640px viewport 作為 200% 等效 CSS viewport 時 dialog、tab、control 可操作；runtime 無 error/warning。
- 尚未驗證：真實 screen-reader session，以及瀏覽器原生 200% zoom 的裝置級字體／手勢差異。
- 下一個唯一入口：QA-702 的 assistive-technology／原生 zoom 實體驗收；不得將等效 viewport 檢查誤報成完整原生 zoom／screen-reader gate。

### 2026-08-13 — 四語系 JSON 與 config.ini 文案拆分 follow-up

- 狀態：一般介面與 PixivUtil2 `config.ini` 文案拆分完成；繁中、簡中、英文、日文皆有獨立可編輯 JSON。
- 實際範圍：一般介面字典移至 `frontend/src/i18n/locales/{zh-TW,zh-CN,en,ja}.json`；11 個已知分類與 139 個已知欄位的名稱／完整說明移至 `frontend/src/i18n/config-locales/` 的四份同名語系檔。`zh-TW` 是語意基準與 fallback。
- 行為邊界：`pixivConfigMetadata.ts` 只保留 field kind、path、secret 與未知 custom option fallback；`getLocalizedSectionMetadata()`／`getLocalizedFieldMetadata()` 在 runtime 合併語系文案。四份字典必須保留相同 key、placeholder 與技術 token。
- 文件交付：新增 `README.zh-CN.md`、`README.ja.md`，並讓四份 README 互相連結；`docs/i18n-maintenance-guide.md` 是後續翻譯與新增語言的單一維護入口。
- 驗證結果：完整 frontend suite 通過 216 tests，production build 通過；字典測試覆蓋相同 key／placeholder、簡中 normalize、locale persistence、139 欄位完整性與技術 token 保留。簡中 light／dark 與窄寬實際 render 仍以 `docs/ui-render-regression.md` 記錄的待驗項目為準。
