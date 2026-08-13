<p align="center">
  <a href="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml"><img src="https://github.com/sugarbobo-ch/PixivUtil2-Web-Viewer/actions/workflows/ci-cd.yml/badge.svg" alt="构建与版本发布状态"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a>
</p>

<h1 align="center">PixivUtil2 Web Viewer</h1>

PixivUtil2 Web Viewer 是一款面向 Windows 的本地媒体图库，用于管理和快速浏览已下载的图片、视频与漫画。所有媒体都保留在你的电脑上，无需上传到外部服务。

## 为什么使用这个项目？

下载内容越来越多后，逐层打开文件夹会很慢；漫画页面散落在多个文件中，也很难快速找到某个月份的作品。这个 Viewer 会将下载文件夹整理为一个可搜索的图库，并提供适合图片和漫画的阅读方式。

- 可搭配 PixivUtil2 图库，也可以直接读取普通的本地媒体文件夹。
- 不需要云服务，也无需上传私人图片或视频。
- 使用 Windows 安装与启动文件即可开始，无需编程知识。

## 功能特色

- 在同一个图库中管理和快速浏览已下载的图片、视频及多页漫画。
- 使用全屏模式快速、专注地阅读图片，或使用条漫模式连续向下阅读长篇漫画。
- 支持一次显示一张图片的单页模式，以及像书本摊开阅读的双页模式；也可以选择从左到右或从右到左翻页。
- 拖动时间刻度，或直接选择年份与月份，即可跳转到旧作品，无需从头滚动整个图库。
- 大型图库会先显示缩略图，只加载屏幕附近的图片；跳转到其他月份时，也会提前准备附近的缩略图，减少等待时间。
- 按画师与日期筛选、搜索标题、调整排序，并将相关漫画页面合并为一个作品。
- 在全屏与条漫模式中播放视频，支持点击播放、双击快进／快退，以及按住临时加速。
- 使用模糊遮罩保护敏感内容，同时保留标题、页数与导航功能。
- 在后台更新 Viewer 索引，不会写入 PixivUtil2 原始数据库。
- 无需重新启动，即可切换繁体中文、简体中文、英文与日文。

## PixivUtil2 与仅使用文件夹

建议使用 [PixivUtil2](https://github.com/Nandaka/PixivUtil2) 下载 Pixiv 资源并保留本地元数据。这个 Viewer 可以读取它创建的本地图库，也支持读取相同文件夹结构中的文件。

如果只想浏览本地文件，PixivUtil2 并非必要。Viewer 可以直接扫描指定文件夹中的支持格式媒体，创建自己的 Viewer 索引；不需要安装 PixivUtil2，也不需要提供它的 `db.sqlite`。

仅使用文件夹时，在首次使用向导选择「浏览本地文件夹」，或之后到「设置 → 媒体数据库」直接选择文件夹。路径会保存在已忽略的本地 `web_config.json`，不需要 `config.ini`。

使用 PixivUtil2 时则选择它的 `config.ini`。Viewer 只会把 `[Settings] rootDirectory` 当成媒体根目录；若同一位置有 `db.sqlite`，会以只读方式导入 Pixiv 元数据。这两个 PixivUtil2 文件都不会被 Viewer 写入。

同一时间只会启用一个来源。切换来源或修改图片文件夹后，必须先保存设置并更新图片数据库，图库才会改用新来源。

## 排序与页面顺序

排序选单会区分图片时间与作品顺序。「作品新到旧・页码正序」会先显示较新的作品，再维持作品内的自然顺序，例如 `p1 → p2 → p3`、`1-1 → 1-2 → 1-10` 与 `a → b → c`。Pixiv 档名会使用作品 ID 与 `_pN`；非 Pixiv 图库则依档名与文件夹结构推断。

## 界面截图

以下截图均打开内置模糊遮罩；媒体仍留在本地，Git 只收录这些模糊后的操作截图。

<table>
  <tr>
    <th>电脑版 Grid</th>
    <th>手机版 Grid</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-grid.png" alt="电脑版图片 Grid、筛选器与模糊作品组" width="620"></td>
    <td><img src="docs/screenshots/mobile-grid.png" alt="手机版响应式图片 Grid 与模糊作品组" width="220"></td>
  </tr>
  <tr>
    <th>电脑版全屏</th>
    <th>手机版全屏</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-fullscreen.png" alt="电脑版全屏阅读器、缩略图导航与模糊遮罩" width="620"></td>
    <td><img src="docs/screenshots/mobile-fullscreen.png" alt="手机版全屏阅读器与精简控制项" width="220"></td>
  </tr>
  <tr>
    <th>电脑版作品组</th>
    <th>手机版条漫</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/desktop-manga-pack.png" alt="电脑版作品组预览与编号页面" width="620"></td>
    <td><img src="docs/screenshots/mobile-webtoon.png" alt="手机版连续条漫阅读器与模糊遮罩" width="220"></td>
  </tr>
</table>

## Windows 一键安装与启动

一般用户不需要预先安装 Node.js 或 Python，也不需要修改系统 `PATH`：

1. 第一次使用请双击 `install.bat`。它会在项目内的 `.runtime` 准备 Node.js、pnpm、uv 与 Python，并安装前后端依赖。
2. 完成后双击 `run_viewer.bat`。前端与 API 会由同一个可见终端管理；按 `Ctrl+C` 或直接关闭该终端窗口都会一起停止。
3. 日后双击 `update.bat`，即可用 `git pull --ff-only` 取得更新并重新同步依赖。更新功能需要 Git for Windows 与已设置的 upstream remote。

安装器会把 pnpm 包存储 固定放在 `.runtime/pnpm-store`。它只会在 `web_config.json` 不存在时，从 `web_config.example.json` 创建本地设置，不会覆盖既有设置。旧版 runtime 更新时会保留在 `.runtime/backups`，不会直接硬删。

服务位址：

- Viewer：<http://localhost:3000>
- API：<http://127.0.0.1:8000>
- API 文件：<http://127.0.0.1:8000/docs>

## 建议使用流程

1. 执行 `install.bat`，完成后使用 `run_viewer.bat` 启动。
2. 选择数据源：
   - 使用 PixivUtil2 图库时，选择它的 `config.ini`；Viewer 只使用其中的 `rootDirectory` 与同位置可用的 `db.sqlite`。
   - 仅使用文件夹时，直接选择媒体文件夹；不需要 PixivUtil2、`config.ini` 或 `db.sqlite`。
3. 到「设置 → 媒体数据库」选择「更新图片数据库」。背景工作会更新 Viewer 快照，并可依设置分析图片主色。
4. 使用画师与月份筛选作品，再以全屏或条漫播放作品组；共享屏幕或截取操作截图前可打开「模糊遮罩」。
5. 缩略图缓存变大时，到「设置 → 媒体数据库」执行「整理缩略图」。文件会移到可恢复位置，之后仍能还原。

## 全屏视频播放器操作

在全屏检视视频时，可以使用下列操作：

- 按 `Space` 或点击视频本体（原生控制列除外）：播放／暂停。
- 在视频左半部双击：依设置倒转；右半部双击：依设置快转（默认 5 秒）。
- 按住视频左／右半部：依设置暂时加速播放（默认 2 倍速）；放开后恢恢复本速度。
- 点击视频范围外的左／右侧：切换上一部／下一部作品；视频本体内不会因此关闭全屏。
- 使用视频原生控制列的进度条：拖动即可调整播放进度，控制列与视频本体保持相同尺寸。
- 按 `F1` 打开全屏快捷键说明，面板也会列出视频操作提示。
- 到「设置 → 显示与浏览 → 全屏模式」可调整跳转秒数与按住倍速；共用的视频播放设置可启用全屏与条漫自动播放。首次播放会以静音开始，之后从原生控制列调整的静音／音量会保存并应用到两种模式。条漫视频进入主要可视区时播放，离开后自动暂停。

## 确认 PixivUtil2 数据源

首次启动时，向导会要求选择 PixivUtil2 `config.ini` 或本地媒体文件夹，接着扫描来源并创建第一份 Viewer 索引，完成后才进入图库。

选择 PixivUtil2 模式但未指定自定义路径时，Web Viewer 会在项目上层寻找：

- `../db.sqlite`：PixivUtil2 原始数据库，Web Viewer 仅以只读方式导入快照。
- `../config.ini`：默认 PixivUtil2 设置档，其中 `[Settings] rootDirectory` 指向图片根目录。

`install.bat` 只会在设置不存在时创建 `web_config.json`。如果希望手动创建，也可复制范本：

```powershell
Copy-Item .\web_config.example.json .\web_config.json
```

`web_config.json` 是已忽略的本地用户设置，不应提交。若 `config.ini` 位于其他位置，可到「设置 → 媒体数据库」选择文件；结果会写入 `pixivConfigPath`。文件夹模式则使用 `mediaRootPath`，不会退回项目目录或 PixivUtil2 根目录。

## 启动与停止

最简单的方式是在根目录执行：

```powershell
.\run_viewer.ps1
```

若 PowerShell 阻止本地脚本，可只对这次执行放行：

```powershell
powershell -ExecutionPolicy Bypass -File .\run_viewer.ps1
```

也可以直接双击 `run_viewer.bat`。启动后：

- 前端：http://localhost:3000
- 后端 API：http://127.0.0.1:8000
- FastAPI 文件：http://127.0.0.1:8000/docs

按下该终端的 `Ctrl+C` 或直接关闭窗口，前端、后端与重载子进程都会一起停止。启动器使用 Windows Job Object，确保窗口直接关闭时仍会清理整个进程树。服务 log 位于 `.runtime/logs`。

同一个项目已在执行时，再次启动只会提示现有 Viewer 并正常结束，不会把自己的端口判定为错误；若端口由其他程序占用，仍会显示对应 PID 并停止启动。

## 第一次创建图片索引

如果画面没有作品，打开「设置 → 媒体数据库」，确认图片来源后执行数据库更新。更新工作会扫描媒体、创建 Viewer 快照，并依设置分析主色；它不会直接修改 PixivUtil2 的原始数据库。

## 开发者指令

一键安装后，可在项目根目录使用单条命令，同时启动 FastAPI 自动重载与 Vite HMR：

```bat
dev_viewer.bat
```

打开 <http://localhost:3000>。在同一个终端按下 `Ctrl+C` 或直接关闭窗口，即可停止两个服务与重载子进程；启动器也会先检查 `8000` 与 `3000` port。

若要分别使用两个终端，后端开发模式：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m uvicorn main:app --app-dir .\backend --host 127.0.0.1 --port 8000 --reload
```

前端开发模式：

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd dev
```

Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。

界面翻译是 `frontend/src/i18n/locales/` 下可直接编辑的 JSON 文本文件；所有已知 `config.ini` 字段的名称和完整说明则分别存放在 `frontend/src/i18n/config-locales/`。`zh-TW.json` 是语义基准和 fallback；修改其他语言时，请保留相同的 key 和插值 placeholder。

## 验证开发环境

后端测试：

```powershell
.\.runtime\backend-venv\Scripts\python.exe -m unittest discover -s .\backend\tests -v
```

前端 type-check 与 production build：

```powershell
Set-Location .\frontend
..\.runtime\pnpm\pnpm.cmd build
```

GitHub Actions 会在 push 与 pull request 执行后端测试及前端 build。创建 `v*` tag 后，CD job 会发布 GitHub Release，并附上保留 Windows 一键安装文件的 source ZIP。

文件与 patch 格式：

```powershell
git diff --check
```

## 常见问题

### 页面打得开，但没有图片

确认「设置 → 媒体数据库」中的来源：PixivUtil2 模式需检查 `config.ini` 的 `rootDirectory`，文件夹模式则需确认选择的媒体文件夹。保存后执行图片数据库更新；Gallery 只读取最后一次成功提交的 Viewer 快照，不会在每次开页时同步扫描硬盘。

### 缩略图第一次出现较慢

未命中 `backend/cache_thumbs` 时，后端需要读取原图并产生 WebP。缩略图尺寸越大，第一次生成越久；产生后会重用缓存。不要手动硬删缓存，请使用设置页提供的可恢复整理流程。

### 端口已被占用

默认前端使用 3000、后端使用 8000。关闭先前启动的 Viewer 程序，或在手动启动时指定其他端口，并同步调整 `frontend/vite.config.ts` 的 proxy target。

### 安装或更新失败

确认网络可连接后重新执行 `install.bat`。`update.bat` 另需 Git for Windows、upstream remote，且本地修改不可与远端更新冲突；更新器不会使用 reset、clean、stash 或 force 覆盖本地内容。

## 开发文件

- [AI Agent 项目地图](docs/ai-agent-project-map.md)
- [i18n 多语言维护指南](docs/i18n-maintenance-guide.md)
- [全局 Gallery 与月份导航契约](docs/global-gallery-navigation-contract.md)
- [全屏双页阅读器规范](docs/fullscreen-spread-reader-spec.md)
- [Backend 工作与 Native Picker](backend/README.md)
- [画师索引与 Viewer snapshot 设计](docs/artist-list-indexing-cache-grid-design.md)
- [媒体数据库历史实作规格](docs/media-library-implementation-todo.md)
- [Pixiv UI 样式调整报告](docs/pixiv-ui-style-adjustment-report.md)
- [Agent UI 强制规范](agents.md)
