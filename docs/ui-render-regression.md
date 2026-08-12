# Web Viewer UI render regression gate

這份文件記錄 refactor 後可重複執行的實際畫面驗收矩陣。若 `docs/design-qa-settings-select.md` 更新，這份矩陣也要同步檢查 Settings 與 Gallery 的 shared `CustomSelect`。

## Automated gate

- `frontend/pnpm.cmd lint`（TypeScript no-unused baseline）
- `frontend/pnpm.cmd test`
- `frontend/pnpm.cmd build`
- `(backend/) python -m unittest discover -s tests -v`
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
