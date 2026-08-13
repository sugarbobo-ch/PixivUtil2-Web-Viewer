<p align="center">
  <a href="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml"><img src="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml/badge.svg" alt="Build and release status"></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

<h1 align="center">PixivUtil2 Web Viewer</h1>

PixivUtil2 Web Viewer is a Windows-friendly local library for managing and quickly browsing downloaded images, videos, and manga. Your media stays on your computer and does not need to be uploaded anywhere.

## Why use this project?

Large download folders quickly become difficult to browse: opening folders one by one is slow, manga pages are separated, and finding works from a particular month takes time. This viewer turns those folders into one searchable gallery and provides reading modes designed for images and manga.

- Use it with a PixivUtil2 library or any compatible local media folder.
- Browse locally without installing a cloud service or uploading private media.
- Start through the Windows setup files; no programming knowledge is required.

## Features

- Manage and quickly browse downloaded images, videos, and multi-page manga in one gallery.
- Open images in a distraction-free fullscreen reader, or read long manga continuously in vertical webtoon mode.
- Choose single-page view for one image at a time or two-page spread view for book-like reading. Reading direction can be left-to-right or right-to-left.
- Drag the time scale or choose a year and month to jump directly to older works instead of scrolling through the entire library.
- Keep large libraries responsive by showing thumbnails first and loading only the images near the screen. When you jump to another month, nearby thumbnails are prepared before you arrive.
- Filter by artist and date, search titles, change sorting, and group related manga pages into one work.
- Play videos in fullscreen or webtoon mode, with click, double-click seek, and press-and-hold speed controls.
- Cover sensitive media with the blur option while keeping titles, page counts, and navigation usable.
- Update the viewer index in the background without writing to the PixivUtil2 source database.
- Switch between Traditional Chinese, Simplified Chinese, English, and Japanese without restarting.

## PixivUtil2 and folder-only use

We recommend [PixivUtil2](https://github.com/Nandaka/PixivUtil2) for downloading Pixiv resources and keeping their local metadata. This viewer can read the resulting library, including files arranged in the same folder structure.

PixivUtil2 is optional for local browsing. The viewer can scan supported media directly from a configured folder and build its own Viewer index; you do not need to install PixivUtil2 or provide its `db.sqlite`.

For folder-only use, choose **Browse a local folder** during first-run setup, or select the folder later under **Settings → Media database**. The selected folder is stored in the ignored local `web_config.json`; no `config.ini` is required.

For PixivUtil2 use, select its `config.ini`. The viewer reads `[Settings] rootDirectory` as the only media root and, when available, imports Pixiv metadata from the `db.sqlite` beside that configuration file. Both PixivUtil2 files remain read-only.

Exactly one source is active at a time. Switching the source or changing the folder requires saving the setting and updating the image database before the gallery uses the new source.

## Sorting and page order

The sort menu distinguishes image time from work order. **Works newest first · pages ascending** keeps newer works ahead while preserving natural page order inside each work, such as `p1 → p2 → p3`, `1-1 → 1-2 → 1-10`, and `a → b → c`. Pixiv filenames use their artwork ID and `_pN` suffix; compatible non-Pixiv libraries use filename and folder heuristics.

## Screenshots

The examples below use the built-in blur mode. Media stays local; only these blurred screenshots are committed.

<table>
  <tr>
    <th>Desktop grid</th>
    <th>Mobile grid</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-grid.png" alt="Desktop gallery grid with filters and blurred manga packs" width="620"></td>
    <td><img src="docs/screenshots/mobile-grid.png" alt="Responsive mobile gallery grid with blurred manga packs" width="220"></td>
  </tr>
  <tr>
    <th>Desktop fullscreen</th>
    <th>Mobile fullscreen</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-fullscreen.png" alt="Desktop fullscreen reader with thumbnails and blur enabled" width="620"></td>
    <td><img src="docs/screenshots/mobile-fullscreen.png" alt="Mobile fullscreen reader with compact controls and blur enabled" width="220"></td>
  </tr>
  <tr>
    <th>Desktop manga pack</th>
    <th>Mobile webtoon</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-manga-pack.png" alt="Desktop manga pack preview with numbered blurred pages" width="620"></td>
    <td><img src="docs/screenshots/mobile-webtoon.png" alt="Mobile continuous webtoon reader with blur enabled" width="220"></td>
  </tr>
</table>

## One-click setup on Windows

You do not need to install Node.js or Python, and the setup does not change your system `PATH`.

1. Double-click **`install.bat`**.
2. When setup finishes, double-click **`run_viewer.bat`**.
3. Open <http://localhost:3000> if the browser does not open automatically.

The installer downloads a project-local toolchain into `.runtime/`:

- portable Node.js and pnpm;
- uv and a uv-managed Python installation;
- backend dependencies in `.runtime/backend-venv/`;
- the pnpm content-addressable store in `.runtime/pnpm-store/`;
- frontend dependencies in `frontend/node_modules/`.

No administrator privileges are required. An internet connection is required for the first installation.

## Typical workflow

1. Run `install.bat`, then start the viewer with `run_viewer.bat`.
2. Choose a source:
   - For a PixivUtil2 library, select its `config.ini`; the viewer uses only that file's `rootDirectory` and optional neighboring `db.sqlite`.
   - For folder-only browsing, select the media folder directly. PixivUtil2, `config.ini`, and `db.sqlite` are not required.
3. Open **Settings → Media database** and select **Update image database**. The background job refreshes the viewer snapshot and can analyze image colors.
4. Browse with artist and month filters, then open a manga pack in fullscreen or webtoon mode. Enable **Blur** before sharing your screen or taking screenshots.
5. When the thumbnail cache grows, use **Settings → Media database → Organize thumbnails**. Organized files move to a recoverable location and can be restored.

## Fullscreen video player controls

When viewing a video in fullscreen:

- Press `Space` or click the video body (outside the native controls) to play or pause.
- Double-click the left half to rewind or the right half to fast-forward by the configured seek interval (5 seconds by default).
- Hold either side of the video for temporary accelerated playback (2× by default); release to restore the previous speed.
- Click the stage outside the video on the left or right to move to the previous or next work. Clicking inside the video does not close fullscreen.
- Use the native video control bar and progress track to seek; the controls stay aligned with the video rectangle.
- Press `F1` to open the fullscreen shortcut help, which also lists the video gestures.
- Configure the seek interval and hold speed under **Settings → Display & browsing → Fullscreen mode**. Shared video playback settings let you enable autoplay for fullscreen and webtoon modes; the first playback is muted, and the mute/volume state from the native controls is saved for both modes. In webtoon mode, videos play when they enter the primary visible area and pause after leaving it.

## Run and stop

Double-click `run_viewer.bat`. It starts both services without opening additional terminal windows:

- Viewer: <http://localhost:3000>
- API: <http://127.0.0.1:8000>
- API documentation: <http://127.0.0.1:8000/docs>

The one visible terminal owns both process trees. Press `Ctrl+C` or close that terminal window to stop the frontend, backend, and reload workers together. A Windows Job Object provides cleanup even when the terminal is closed directly. Timestamped service logs are stored under `.runtime/logs/`.

If you launch the same project again while it is already running, the launcher reports the existing Viewer and exits normally instead of treating its ports as an error. Ports owned by another application still stop startup with the owning PID.

PowerShell users may run the equivalent entry point:

```powershell
.\run_viewer.ps1
```

## Update

Double-click `update.bat`. It performs a safe fast-forward pull and then refreshes the local runtime and dependencies.

Update requirements:

- Git for Windows is installed;
- this checkout has an upstream remote;
- local edits do not conflict with the incoming update.

The updater never runs `reset`, `clean`, `stash`, or a forced pull. If Git cannot fast-forward safely, it stops and leaves local changes intact.

## Local configuration

On first setup, `web_config.example.json` is copied to the ignored `web_config.json` only when the local file is missing. Existing settings are never overwritten. On first launch, the setup guide asks for either a PixivUtil2 `config.ini` or a local media folder, then scans the source and builds the initial Viewer index before opening the gallery.

When PixivUtil2 mode is selected without a custom path, the viewer looks in the parent PixivUtil2 directory for:

- `../db.sqlite` — the PixivUtil2 metadata database;
- `../config.ini` — including the image root in `[Settings] rootDirectory`.

If your PixivUtil2 files are elsewhere, select `config.ini` under **Settings → Media database**. Folder-only mode instead stores the selected directory in `mediaRootPath`; it never falls back to the project directory or a PixivUtil2 root.

## Developer workflow

The one-click setup also prepares everything needed for local development. Use the project-local commands so the same pinned toolchain is used on every machine.

One-command development mode on Windows:

```bat
dev_viewer.bat
```

This starts FastAPI with automatic reload and Vite with HMR in one terminal. Open <http://localhost:3000>, then press `Ctrl+C` or close that terminal window to stop both process trees. The launcher checks ports `8000` and `3000` before startup.

To run each service in a separate terminal instead, use the commands below.

Backend development server:

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m uvicorn main:app --app-dir .\backend --host 127.0.0.1 --port 8000 --reload
```

Frontend development server:

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd dev
```

Interface translations are editable JSON text files under `frontend/src/i18n/locales/`. The labels and full descriptions for every documented `config.ini` field are separately editable under `frontend/src/i18n/config-locales/`. Traditional Chinese (`zh-TW`) is the source of meaning and fallback; keep the same keys and placeholders in the other locale files when editing translations.

Checks:

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s .\backend\tests -v
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd build
```

GitHub Actions runs the backend tests and frontend build on pushes and pull requests. A `v*` tag publishes a GitHub Release containing a source ZIP that retains the one-click Windows setup files.

## Project map

- [AI agent project map](docs/ai-agent-project-map.md)
- [i18n maintenance guide](docs/i18n-maintenance-guide.md)
- [Global Gallery and month-navigation contract](docs/global-gallery-navigation-contract.md)
- [Fullscreen spread-reader specification](docs/fullscreen-spread-reader-spec.md)
- [Backend and native picker notes](backend/README.md)
- [Artist indexing and Viewer snapshot design](docs/artist-list-indexing-cache-grid-design.md)
- [Historical media-library implementation plan](docs/media-library-implementation-todo.md)
- [Pixiv UI adjustment report](docs/pixiv-ui-style-adjustment-report.md)
- [Project rules for coding agents](agents.md)

## Runtime maintenance

The local `.runtime/`, developer Python environment, dependencies, logs, caches, databases, and `web_config.json` are ignored by Git. When the installer replaces a runtime version, it moves the previous directory to `.runtime/backups/` instead of deleting it. You may archive or remove those backups manually after confirming the updated viewer works.
