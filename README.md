# PixivUtil2 Web Viewer

**English** | [繁體中文](README.zh-TW.md)

[![CI and release](https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml)

A Windows-first local web viewer for a PixivUtil2 library. The React/Vite frontend provides gallery, fullscreen, and webtoon reading modes, while the FastAPI backend reads PixivUtil2 metadata and manages viewer-side indexes and thumbnail caches.

## Highlights

- Browse large libraries in a responsive month-based grid with artist, date, search, sorting, and pagination controls.
- Switch between the grid, a focused fullscreen viewer, and continuous vertical webtoon reading without losing your place.
- Group related pages into manga packs, preview every page, then play the pack in fullscreen or webtoon mode.
- Keep sensitive media covered with the blur toggle while retaining page counts, grouping, and navigation.
- Refresh the viewer index and optional dominant-color metadata in the background without writing to the PixivUtil2 source database.
- Organize thumbnail caches through a recoverable workflow instead of permanently deleting generated files.

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
2. If auto-discovery does not find PixivUtil2, open **Settings → Pixiv settings** and select `config.ini`.
3. Open **Settings → Image database** and select **Update image database**. The background job refreshes the viewer snapshot and can analyze image colors.
4. Browse with artist and month filters, then open a manga pack in fullscreen or webtoon mode. Enable **Blur** before sharing your screen or taking screenshots.
5. When the thumbnail cache grows, use **Settings → Image database → Organize thumbnails**. Organized files move to a recoverable location and can be restored.

## Run and stop

Double-click `run_viewer.bat`. It starts both services without opening additional terminal windows:

- Viewer: <http://localhost:3000>
- API: <http://127.0.0.1:8000>
- API documentation: <http://127.0.0.1:8000/docs>

The one visible terminal owns both processes. Press `Ctrl+C` there to stop the frontend and backend together. Timestamped service logs are stored under `.runtime/logs/`.

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

On first setup, `web_config.example.json` is copied to the ignored `web_config.json` only when the local file is missing. Existing settings are never overwritten.

The viewer normally discovers PixivUtil2 data from the parent directory:

- `../db.sqlite` — the PixivUtil2 metadata database;
- `../config.ini` — including the image root in `[Settings] rootDirectory`.

If your PixivUtil2 files are elsewhere, edit `web_config.json` or select the paths in the viewer settings.

## Developer workflow

The one-click setup also prepares everything needed for local development. Use the project-local commands so the same pinned toolchain is used on every machine.

Backend development server:

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m uvicorn main:app --app-dir .\backend --host 127.0.0.1 --port 8000 --reload
```

Frontend development server:

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd dev
```

Checks:

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s .\backend\tests -v
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd build
```

GitHub Actions runs the backend tests and frontend build on pushes and pull requests. A `v*` tag publishes a GitHub Release containing a source ZIP that retains the one-click Windows setup files.

## Project map

- [AI agent project map](docs/ai-agent-project-map.md)
- [Backend and native picker notes](backend/README.md)
- [Media-library implementation notes](docs/media-library-implementation-todo.md)
- [Pixiv UI adjustment report](docs/pixiv-ui-style-adjustment-report.md)
- [Project rules for coding agents](agents.md)

## Runtime maintenance

The local `.runtime/`, developer Python environment, dependencies, logs, caches, databases, and `web_config.json` are ignored by Git. When the installer replaces a runtime version, it moves the previous directory to `.runtime/backups/` instead of deleting it. You may archive or remove those backups manually after confirming the updated viewer works.
