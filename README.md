# PixivUtil2 Web Viewer

**English** | [繁體中文](README.zh-TW.md)

A Windows-first local web viewer for a PixivUtil2 library. The React/Vite frontend provides gallery, fullscreen, and webtoon reading modes, while the FastAPI backend reads PixivUtil2 metadata and manages viewer-side indexes and thumbnail caches.

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

## Project map

- [AI agent project map](docs/ai-agent-project-map.md)
- [Backend and native picker notes](backend/README.md)
- [Media-library implementation notes](docs/media-library-implementation-todo.md)
- [Pixiv UI adjustment report](docs/pixiv-ui-style-adjustment-report.md)
- [Project rules for coding agents](agents.md)

## Runtime maintenance

The local `.runtime/`, developer Python environment, dependencies, logs, caches, databases, and `web_config.json` are ignored by Git. When the installer replaces a runtime version, it moves the previous directory to `.runtime/backups/` instead of deleting it. You may archive or remove those backups manually after confirming the updated viewer works.
