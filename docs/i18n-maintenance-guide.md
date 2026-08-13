# Web Viewer i18n 維護指南

最後更新：2026-08-13

前端 i18n runtime 位於 `frontend/src/i18n/index.ts`，一般介面翻譯分別存放在 `frontend/src/i18n/locales/zh-TW.json`、`zh-CN.json`、`en.json` 與 `ja.json`；`config.ini` 分類與欄位文案則存放在對應的 `frontend/src/i18n/config-locales/*.json`。這些 JSON 都是可直接編輯的 UTF-8 文字檔；fallback 固定為 `zh-TW`，語言切換不 reload 頁面。

`zh-TW.json` 是功能語意基準。其他語言應先理解控制項所觸發的實際功能再翻譯，不以字面直譯或繁簡字形轉換取代在地化。例如條漫的 API 分頁使用「圖庫分頁」，應用程式內的「回收區」也必須與 Windows「資源回收筒」使用不同名稱。

## Key 與 namespace

translation key 使用 `namespace.subject` 命名，namespace 固定為：

`common`、`gallery`、`filters`、`viewer`、`webtoon`、`settings`、`onboarding`、`library`、`errors`、`recycle`、`manga`。

同一個可見文案只建立一個語意 key；不要以翻譯後的文字判斷 business logic。控制項的可見 label、`aria-label`、`title`、live-region 與錯誤訊息都必須從同一個語意 key 或同一組 interpolation values 產生。

## Fallback、插值與 plural

- `normalizeUiLanguage()` 會將 `zh-Hans`／`zh-SG` 歸一為 `zh-CN`、`zh-Hant`／`zh-HK` 歸一為 `zh-TW`、`en-US`／`en-GB` 歸一為 `en`、`ja-JP` 歸一為 `ja`，未知值回 `zh-TW`。
- 缺少目標語言 key 時先回繁中；development 會在 console 提示缺少 key，production 不把 key 直接當作 UI 文案。
- 句子使用完整 template 與 `{name}`、`{count}` 插值，不用字串相加。數量或日期先交給 `formatNumber()`／`formatDate()`。
- 目前頁碼範圍使用 `formatPageRange()`，例如 `common.pageRange`；未來若文案有真正複數變化，請在 runtime 新增明確 plural helper，不要在 JSX 寫英文語序。

## `lang`、`dir` 與格式化

`I18nProvider` 會同步 `document.documentElement.lang`、`dir` 與 `data-ui-language`。介面四種語言目前都是 LTR；書本閱讀方向由 WebConfig 的 `fullscreenReadingDirection` 獨立控制，不能用 `dir` 鏡像整個 App。

開發環境可在 URL 加上 `?qa-pseudo=1` 啟用 `I18nProvider` 的 pseudo-locale QA switch。它只在 Vite development mode 將翻譯後的固定文案轉成擴展字元，不寫入 WebConfig、不改變動態檔名／ID／路徑值，也不會在 production 啟用；用於檢查長字串、tab、toolbar、live region 與 320px／等效 200% viewport reflow。

使用 `formatNumber()` 和 `formatDate()` 產生畫面數值。混合語言的檔名、ID、URL 或路徑必要時以 `<bdi>` 隔離，並使用 logical CSS properties。

## 新增語言流程

1. 擴充 `UiLanguage` 與 `UI_LANGUAGE_OPTIONS`。
2. 在 `locales/` 下新增 JSON 字典，並補齊所有 namespace key 與相同 placeholder。
3. 補 `normalizeUiLanguage()`、日期／數字與頁碼範圍測試。
4. 以 pseudo-localization、320px、200% zoom、長標題與 keyboard focus 檢查 Settings tabs、toolbar、Gallery 與 reader。
5. 更新 `docs/ui-render-regression.md` 與 WebConfig contract；不要只在聊天中記錄新語言。

## Shared component ownership

共用元件只翻譯自己擁有的固定語意（例如關閉、載入、按鈕狀態）；頁面或 domain component 以 props 傳入作品名稱、數量與業務文案。accessible name 不可由 icon 名稱猜測，也不可由已翻譯的顯示字串反推狀態。

## Reader 與低頻 modal

`FullscreenViewer`、`SpreadViewer`、`WebtoonFeed`、Settings 與低頻 modal 都在 `App` 以 lazy boundary 載入；lazy fallback、錯誤訊息與 focus restore 也必須使用 translation key。reader 的頁碼、作品 ID、快捷鍵、video feedback 與 live-region 不得回退到硬編中文。

雙頁閱讀器的 `fullscreenReadingDirection` 只決定書頁 progression 與 slot 順序，不能用 `document.dir` 取代；`uiLanguage` 只控制介面語言與 formatter。所有 spread announcement 使用 `formatPageRange()`，並維持「目前頁／總頁數」語意。

## Settings operation 與 legacy metadata 邊界

Settings、Onboarding、Recycle Bin、Artist Settings、Manga Group、library job feedback 與 source/path operation 的新文案都應從 namespace key 產生；API 的 `error`／raw message 只在沒有穩定 code/key 時作為明確 fallback，不可拿翻譯後文字決定流程。

`frontend/src/pixivConfigMetadata.ts` 是 PixivUtil2 config.ini 的 field inventory，只負責 field kind、path、secret 與未知 custom option 的 fallback。11 個已知分類與 139 個已知欄位的 label／description 必須全部來自 `config-locales/*.json`；`getLocalizedSectionMetadata()`／`getLocalizedFieldMetadata()` 只將語系文案合併回行為 metadata。四份 config 字典必須維持相同 section／field key，且 `%tags%`、`writeRawJSON`、`suppress_tags.txt` 等技術 token 不得翻譯或改寫。

Operation error 由 `frontend/src/utils/operationError.ts` 集中處理：已知 HTTP status 先映射到 `errors.*` key，再以 backend detail 作為明確診斷 suffix；沒有 structured code 的 legacy raw error 仍可顯示，但不可用於決定 business logic。System picker 的本機無法建立工作階段則使用 `LocalizedOperationError`，由 `PathPickerField` 轉成 locale 文案。
