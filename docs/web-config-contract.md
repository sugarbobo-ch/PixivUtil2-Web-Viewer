# WebConfig Contract Matrix

最後更新：2026-08-10

這份文件是 `frontend/src/types.ts`、`frontend/src/utils/webConfig.ts`、`backend/main.py` 的共同 contract。`web_config.example.json` 必須維持相同欄位集合與預設值。前端 API parser 會在 response 邊界呼叫 `normalizeWebConfig`；backend 讀取與寫入時會呼叫 `normalize_web_config_file`。

## 欄位矩陣

| 欄位 | Frontend type / default / normalize | Backend default / normalize / validation | example |
| --- | --- | --- | --- |
| `webTheme` | `dark \| light`；`dark`；只有 `light` 保留，其餘回 `dark` | `dark`；只有 `light` 保留，其餘回 `dark` | `dark` |
| `defaultViewMode` | `fullscreen \| webtoon`；`fullscreen`；只有 `webtoon` 保留，legacy `grid` 回 `fullscreen` | `fullscreen`；相同 migration | `fullscreen` |
| `thumbnailSize` | number；`320`；clamp `16..4096`，接受 legacy `thumbnailWidth`／`thumbnailHeight` | `320`；clamp `16..4096`，讀取 legacy alias 後移除 | `320` |
| `itemsPerPage` | number；`200`；clamp `1..5000` | `200`；clamp `1..5000` | `200` |
| `autoOpenBrowser` | boolean；`true`；接受 `0`／`false`／`no`／`off` | `true`；相同字串 boolean migration | `true` |
| `pixivConfigPath` | `WebConfig` 可選；`WebConfigDraft` 以空字串表示未設定；轉成 string | `""`；寫入時透過 path picker 驗證 existing file | `""` |
| `librarySourceMode` | `unconfigured \| pixiv \| folder`；`unconfigured`；未知值回 default | 相同；update API 對未知值回 422 | `unconfigured` |
| `mediaRootPath` | string；`""`；非 string 回空字串；Pixiv mode 送出前清空 | string；`""`；folder mode 寫入時驗證 root directory，Pixiv mode 強制清空 | `""` |
| `onboardingCompleted` | boolean；`false`；相同字串 boolean migration | boolean；若舊設定省略，依 legacy config／viewer DB 是否存在推導 | `false` |
| `groupMangaPosts` | boolean；`false`；相同字串 boolean migration | boolean；相同字串 boolean migration | `false` |
| `blurEnabled` | boolean；`false`；接受 legacy `mosaicEnabled` 後移除 legacy key | boolean；相同 migration | `false` |
| `demoMode` | boolean；`false`；相同字串 boolean migration | boolean；相同字串 boolean migration | `false` |
| `preloadImageCount` | number；`3`；clamp `0..10` | `3`；clamp `0..10` | `3` |
| `fullscreenToolbarSimpleMode` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `fullscreenShowToolbar` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `fullscreenShowThumbnails` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `fullscreenShowCheckerboard` | boolean；`false`；相同字串 boolean migration | boolean；相同字串 boolean migration | `false` |
| `fullscreenZoomMode` | `auto \| lock \| width \| height \| fit \| fill`；`auto`；未知值回 default | 相同；未知值回 `auto` | `auto` |
| `fullscreenVideoSeekSeconds` | number；`5`；clamp `1..60` | `5`；clamp `1..60` | `5` |
| `fullscreenVideoHoldPlaybackRate` | number；`2`；clamp `1.25..4`，四捨五入至兩位 | `2`；clamp `1.25..4`，四捨五入至兩位 | `2` |
| `videoMuted` | boolean；`false`；相同字串 boolean migration；由 legacy `fullscreenVideoMuted` 遷移 | boolean；相同字串 boolean migration；寫入時移除 legacy key | `false` |
| `videoVolume` | number；`1`；clamp `0..1`，四捨五入至兩位 | `1`；clamp `0..1`，四捨五入至兩位 | `1` |
| `videoAutoplay` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `webtoonImageScale` | number；`100`；clamp `30..100` | `100`；clamp `30..100` | `100` |
| `webtoonImageGap` | number；`24`；clamp `0..300` | `24`；clamp `0..300` | `24` |
| `webtoonShowInfo` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `webtoonShowPageNumber` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `webtoonShowThumbnails` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `analyzeColorsAfterLibraryUpdate` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `manageThumbnailCache` | boolean；`true`；相同字串 boolean migration | boolean；相同字串 boolean migration | `true` |
| `thumbnailCacheLimitMiB` | number；`1024`；clamp `128..102400` | `1024`；clamp `128..102400` | `1024` |

| `sidebarWidth` | number; default `320`; clamp `224..560` | `320`; clamp `224..560` | `320` |

## API response shape

- `GET /api/web-config` 回傳 config object 本身。
- `POST /api/web-config` 回傳 `{ status, webConfig }`；`webConfig` 仍需經過同一套 normalize。
- `GET /api/library/jobs/current`、`POST /api/library/jobs`、`POST /api/library/jobs/{id}/cancel` 回傳 `{ job: LibraryJob | null }`。
- `GET /api/library/jobs/{id}` 回傳 `{ job: LibraryJob }`，frontend typed client 會拒絕缺少 job 的 response。
- `/api/images` 可接受 legacy array 或目前的 `{ images, total, months }`；parser 會驗證必要的 `ImageItem` 欄位並產生統一的 month index。

## 驗證與 migration tests

- Frontend：`frontend/src/utils/webConfig.test.ts`、`frontend/src/api/parsers.test.ts`、`frontend/src/api/client.test.ts`。
- Backend：`backend/tests/test_web_config.py`。
- `web_config.example.json` 是可提交的範本；實際 `web_config.json` 由 backend normalize 後持久化，不能以範本取代 runtime migration。
