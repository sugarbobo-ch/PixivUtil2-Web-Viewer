# Web Viewer UI render regression gate

這份文件記錄 refactor 後可重複執行的實際畫面驗收矩陣。若 `docs/design-qa-settings-select.md` 更新，這份矩陣也要同步檢查 Settings 與 Gallery 的 shared `CustomSelect`。

## Automated gate

- `(frontend/) ..\.runtime\pnpm\pnpm.cmd lint`（TypeScript no-unused baseline）
- `(frontend/) ..\.runtime\pnpm\pnpm.cmd test`
- `(frontend/) ..\.runtime\pnpm\pnpm.cmd build`
- `(backend/) ..\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s tests -v`
- `py_compile` for backend route/service modules and `scripts/measure-web-viewer-performance.py`
- `python scripts/check-reduced-motion.py`（10 個 reduced-motion CSS selector/declaration contract）
- `git diff --check`
- scoped `rg` audit for forbidden purple/indigo/violet/fuchsia colors, shadow/glow declarations, and conflicting utility classes

## Interaction matrix

| Surface | Normal / selected / focus | Light / dark | Responsive | Functional path |
| --- | --- | --- | --- | --- |
| Gallery | card, page button, filter summary | yes | desktop + 390px mobile | month, year, multi-month, reset, artist, search |
| Settings | tabs, `CustomSelect`, switch, save/close | yes | desktop + 390px mobile | Escape, tab keyboard, source dirty/update gate |
| Fullscreen | toolbar, filmstrip, page badge | yes | desktop + mobile controls | real media, `1 / total`, Escape |
| Webtoon | toolbar, thumbnail rail, page badge | yes | desktop + mobile header | real media, configured `current / total`, page change; no bottom-right HUD after collapse |

## 2026-08-10 record

- Desktop Gallery loaded real indexed media and pagination; month filter `2026-07`, year expansion `2025`, multi-month selection `2026-07 + 2025-12`, reset, and month-ruler keyboard jump all returned a populated gallery.
- Settings opened as a modal with four accessible tabs. `CustomSelect` opened its listbox, showed selected option, and closed on Escape. Light and dark themes both exposed the brand semantic selection tokens (`#0096fa` / white ink).
- Fullscreen opened real media with filmstrip and `1 / total`; Escape returned to Gallery. Webtoon opened real media with thumbnail rail and `current / total` labels, then returned to Gallery.
- Settings artist visibility was exercised end-to-end: hiding `ブルアカケー` removed it from the 18-artist sidebar, and `恢復顯示` returned it to the sidebar and restored the count to 18.
- Settings job lifecycle was exercised end-to-end for a selected artist: the UI started the background update, `取消工作` returned a cancelled job with retained progress, and closing/reopening Settings preserved the terminal feedback. A full unchanged library update then completed with 14,367 / 14,367 processed and 0 errors.
- Backend recovery gate: a queued thumbnail-cache job was interrupted by a controlled backend restart; `/api/library/jobs/current` returned `status=interrupted`, `phase=interrupted`, and `Backend restarted; run the library job again`. A Chrome session also rendered the same persisted interrupted payload in Settings; the temporary verification fixture was restored to completed afterward.
- The controlled stop also produced transient Vite proxy `ECONNREFUSED /api/library/jobs/current` entries while port 8000 was unavailable. This is the expected restart window; `useLibraryJobStore` now retries transport failures after 1.5 seconds, and the post-restart Chrome session recovered without runtime error logs.
- Native drag-selection passed in the Chrome extension session: dragging across the Settings explanatory paragraph produced a non-empty selection range. `Ctrl+A` also produced a real range and the computed `::selection` colors matched the semantic tokens.
- Reduced-motion stylesheet and JS branches are present; `scripts/check-reduced-motion.py` verifies 10 selector/declaration contracts. A Chrome DevTools media-emulation session verified `reduce=true`; a same-process no-override tab verified `no-preference=true` and normal transition recovery.
- Responsive Chrome smoke at 390×844 rendered the mobile header, search/menu/filter entry points, real thumbnails, and the Settings dialog from the mobile function menu. Fullscreen and webtoon render smoke both showed real media and `current / total`; Chrome runtime error logs were empty.
- Regression found and fixed during this gate: after the first `GalleryService` migration, `/api/images` passed the database keyword `only_show_db_files` to the service contract, causing HTTP 500 and an empty gallery. The route now passes `only_db`; direct backend and Vite-proxied requests return 200, and the browser reload repopulates the gallery. Historical console errors before the fix remain in the cumulative browser log; no new errors were produced by the post-fix smoke path.
- Backend test regression found and fixed during the route split: the current FastAPI runtime exposes included routers as internal placeholders in `app.routes`, so the old registration test reported `/api/images` missing even though OpenAPI and requests were correct. `backend/tests/test_gallery_routes.py` now checks the public OpenAPI route registry; the full backend suite passes 52 tests.
- Windows cleanup regression found and fixed during the final gate: under concurrent load, the WAL test could raise `WinError 145` while `TemporaryDirectory` removed its own temp folder. `LibraryJobManager.close()` now cancels active jobs and joins worker/monitor threads against a deadline, and `test_media_library.py` retries cleanup only for its test-owned path. The close-cancellation regression test and five consecutive full backend-suite runs then passed 52 tests.
- Read-only API baseline: 20 local `GET /api/images` requests with the default 200-item page measured min 363.0 ms / p50 398.2 ms / p95 470.3 ms / max 914.0 ms on this Windows AMD64 development machine. This is a recorded baseline, not a product threshold; background-job thumbnail p95 still needs a target hardware/session, while browser scroll responsiveness is covered by the page-owned probe below.
- Repeatable performance baseline: `rtk python scripts/measure-web-viewer-performance.py --api-samples 20 --thumbnail-samples 20` on the same Windows AMD64 machine measured `/api/images` p95 473.4 ms and `/api/thumbnail` p95 165.1 ms at size 320; `--include-library-job` measured the unchanged 14,367-image update at 3,672 ms, 14,367 / 14,367 processed and 0 errors. The provisional gates are API p95 < 750 ms, thumbnail p95 < 500 ms, and unchanged library job < 10 s.
- Gallery scroll visual and long-task gate passed three CUA viewport scrolls over the 500-item page through the dev-only `?qa-scroll-performance=1` probe: positions `600 → 1200 → 1532`, 46/46 loaded images, 0 broken images, `longTaskCount=0`, and `maxLongTaskMs=0`. The Chrome page-evaluation sandbox itself exposes no `performance`/`PerformanceObserver`, so the page-owned probe is the repeatable instrumentation path.
- Follow-up capability check: the fresh no-preference Chrome session emitted no error/warning logs after the instrumented scroll. A later Chrome DevTools media-emulation session reported `reduce=true`, with 46/46 gallery images loaded, 0 broken images, Settings／CustomSelect／month/year/filter／fullscreen／webtoon interaction coverage, and reduced computed animation/transition values; the same Chrome process no-override tab restored CustomSelect `0.14s` and Webtoon toolbar `0.16s` normal motion with empty runtime logs.
- Webtoon page-HUD spec update during the media-emulation gate: the temporary persistent `Badge` added for the earlier regression was removed. When the vertical thumbnail rail is hidden or the toolbar is collapsed, Webtoon must not add a `current / total` page HUD in the lower-right corner; existing thumbnail/content page labels remain governed by their normal settings. A clean reload after the change produced no new runtime logs.
- Alert contrast gate: the Settings media-library tab opened a real thumbnail recycle confirmation dialog in light and dark themes. `.settings-modal__danger-note` computed `--settings-danger-text`／`--settings-danger-soft` contrast was `9.53:1`／`7.68:1`; the destructive action was cancelled, and the browser emitted no new error or warning logs.

## Maintenance note

The automated part of this matrix is also run by
`.github/workflows/web-viewer.yml`. The dev-only scroll probe owns the
long-task measurement because the available page-evaluation API does not
expose `PerformanceObserver`; the reduced-motion reduce and no-preference
browser gates have both been verified in Chrome, so no browser-only gate
remains in this matrix.

## 2026-08-12 refactor / i18n / spread gate

- `..\.runtime\pnpm\pnpm.cmd exec tsc --noEmit` passed from `frontend/`.
- `..\.runtime\pnpm\pnpm.cmd test` passed from `frontend/`: 37 test files, 142 tests. Vitest still prints the existing jsdom `HTMLMediaElement.pause()` not-implemented notice; it is not a failed test.
- `..\.runtime\pnpm\pnpm.cmd build` passed from `frontend/`. Initial JS is now `500.06 kB` raw / `145.17 kB` gzip; initial CSS is `150.99 kB` raw / `23.18 kB` gzip. Vite reports the initial chunk is only slightly above its 500 kB warning threshold; the change is the development-only pseudo QA switch. Reader/settings implementation is emitted as separate chunks: Fullscreen `70.15 kB` JS + `28.50 kB` CSS, Settings `99.71 kB` JS + `20.05 kB` CSS, Webtoon `24.14 kB` JS + `15.09 kB` CSS, Spread `14.93 kB` JS + `7.00 kB` CSS, plus low-frequency modal chunks.
- Backend unittest gate passed: 70 tests. Backend `py_compile` passed for the route/service modules. `scripts/check-reduced-motion.py` passed all 10 CSS contracts. `git diff --check` passed.
- Forbidden-style scoped scan returned no matches for purple/indigo/violet/fuchsia/magenta, shadow/glow declarations, or `transition: all` in `frontend/src`.
- Browser smoke on the real local gallery (14,627 works) passed with no error/warning entries after final reload. Settings opened in dark mode; language selector switched to English without reload, synchronized `document.lang=en`/`dir=ltr`, rendered English tabs/options, and localized the save feedback. Fullscreen video reached `is-video-ready` after the `useViewerVideo` extraction. The saved configuration was restored to `zh-TW`, dark theme, simple toolbar, single page, LTR.
- Spread smoke passed with a temporary persisted `en` + `spread` + `rtl` fixture: the cover stayed single, next spread navigation rendered pages `63–64`, RTL DOM order was page 64 then page 63, LTR toggle rendered page 63 then page 64, and the dark-mode screenshot showed readable neutral surfaces and semantic blue selected controls with no shadow/glow. The desktop spread toolbar was then changed to wrap its controls so RTL no longer clipped the first control; the narrow breakpoint keeps horizontal operation. The fixture was restored afterward.
- Responsive 390×844 single fallback, earlier desktop/light/dark Settings, and webtoon/fullscreen real-media smoke remain recorded above; the remaining QA-702 gap is a real screen-reader session and native browser 200% device-level verification. The automated pseudo-localization and locale-formatting tests are green.
- Follow-up Settings smoke after content extraction: real Gallery opened Web／Library／Pixiv／Backup tabs; English was applied by saving the Web tab, `document.lang` became `en` without reload, and Pixiv section tabs plus field labels/descriptions rendered localized copy. The persisted `uiLanguage` was restored to `zh-TW`; no new browser alert/error was observed.
- 2026-08-13 i18n split: translation dictionaries moved to four editable JSON files (`zh-TW`／`zh-CN`／`en`／`ja`). The full frontend suite passed 216 tests and the production build succeeded; coverage verifies identical key and placeholder sets, Simplified Chinese normalization, locale persistence, and contextual Pixiv settings copy. Manual light/dark and narrow-width rendering for `zh-CN` remains to be checked in a future browser smoke pass.
- 2026-08-13 config.ini localization follow-up: all 11 documented sections and 139 known fields now load explicit labels and full descriptions from four editable `config-locales` JSON files. Tests verify complete key coverage, runtime lookup, and preservation of technical identifiers; manual narrow-width rendering remains pending.
- Fullscreen image lifecycle follow-up: `useViewerImage` now owns active admission, directional preload, decoded-image retention, transition suppression, stale reload and error cleanup; the parent retains composition and the video reload bridge. The added hook test and the full 37-file／142-test suite pass. The final build reports initial JS `500.06 kB` raw / `145.17 kB` gzip and Fullscreen `70.15 kB` JS.
- Responsive follow-up: at a temporary 320px viewport, Gallery and mobile menu had no body overflow; Settings dialog controls remained inside the viewport and its four tabs plus Pixiv category tabs remained horizontally scrollable. At a 640px viewport used as a 200% equivalent CSS viewport, header, dialog, tabs and primary controls had no clipping. The temporary viewport was reset after verification.
- Pseudo-locale follow-up: with development `?qa-pseudo=1` and saved `en`, real Gallery and Settings rendered expanded copy at 320px without body overflow; main Settings tabs and Pixiv category tabs remained horizontally scrollable, while the content area remained vertically scrollable. The 640px equivalent CSS viewport also kept the dialog and primary controls operable; runtime error/warning logs were empty. The saved language was restored to `zh-TW` and the temporary viewport was reset.
- Accessible browser-surface follow-up: the Settings accessibility tree exposed the dialog heading, `tablist`／four `tab` nodes, selected `tabpanel`, switches, slider and live status; eight Tab keypresses stayed inside the dialog focus boundary. This verifies DOM semantics and keyboard containment, but does not replace a real screen-reader speech session.

## 2026-08-13 sparse global media window gate

- Cold-tab Gallery validation used a fresh Vite tab on port 3001 backed by a newly started FastAPI process on port 8001. The first range response contained `revision`, `total=14,627`, and `month_index`; no legacy current-page request was needed with the default `VITE_ENABLE_LEGACY_PAGINATION=false` path.
- MonthQuickNav moved the gallery scroll container from `0` to `393,788` on a cold tail jump before the target range settled. After the range loaded, the tail showed ready cards with no visible skeletons and the track remained bounded to the viewport rows.
- Single fullscreen and spread fullscreen crossed the tail range boundary through `14,600`–`14,627`; counters remained global and no console error or warning was observed. The bounded filmstrip remained mounted only for the reader window.
- Webtoon opened at `14,618 / 14,627` with eight virtual articles. Eight ArrowDown actions produced monotonic article windows (`14,619…14,626` through `14,624…14,627`) and monotonic scroll positions (`90,260` through `93,138`); the previous range-anchor oscillation did not recur.
- This historical browser run used a five-chunk cap. Current production limits and the required capacity gate live in `docs/global-gallery-navigation-contract.md`; reader windows remained at 160 items, thumbnail admission at 12 concurrent loads, originals at 2, completed URL retention at 384, and Gallery/Webtoon DOM used bounded virtual windows. The active Settings UI no longer exposes the old page-size field; the old loader remains an explicit opt-in rollback path only.
- Final cold-tab follow-up after the initial-anchor gate: a tail entry opened with the requested global index and active anchor aligned, then five consecutive ArrowDown steps advanced `14,619 → 14,623` with strictly increasing `scrollTop`; the final tail articles `14,624…14,627` all rendered original media. The browser emitted no error or warning entries.
- A held ruler drag continuously updated the slider to `aria-valuenow=99` (`2018 年 05 月`) and populated the target tail range without waiting for pointer-up. Single and spread readers both crossed `14,599 → 14,600` with continuous global counters and no new browser diagnostics.

## 2026-08-13 Agent 文件同步 gate

- 修正 Agent 文件中的 project-local pnpm 路徑與 backend `unittest` 命令；`frontend/` 的 `..\.runtime\pnpm\pnpm.cmd test:gallery-contract` 通過 7 files／29 tests，repository root 的指定 backend contract 命令通過 13 tests。
- 完整 frontend suite 通過 48 files／216 tests；jsdom 仍只輸出既有的 `HTMLMediaElement.pause()` not-implemented 提示，沒有 failed test。
- Production build 通過。當次輸出為 initial JS `586.60 kB` raw／`169.88 kB` gzip、initial CSS `152.16 kB` raw／`23.37 kB` gzip；Vite 仍提示 initial chunk 超過 500 kB，屬警告而非 build failure。
- 本批只修改 README 與 Agent／contract 文件，未改 UI 或資料行為，因此沒有新增 browser render 結果；簡中 light／dark、窄寬與真實 screen-reader session 的既有待驗狀態不變。
