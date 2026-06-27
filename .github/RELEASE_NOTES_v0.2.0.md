# OpenColor v0.2.0

> Lightweight cross-platform color picker for VibeCoding.
> 轻量级跨平台提色器，为 VibeCoding 而生。

---

## English

This release stabilises the picker, ships drag-and-drop palette reordering, and adds a real cross-platform release pipeline.

### Picker reliability

The picker module has been rewritten to use a session-id + atomic state machine, replacing the previous simple mutex:

- **`session_id` + `take(expected)`** — every start bumps a session counter; only the matching session can finish, so a stale cancel from a previous pick can no longer clobber the new one.
- **Atomic `TAP_STATE` (NOT_STARTED / STARTING / RUNNING / FAILED)** — the `rdev` global tap listener is guarded so a second `start()` from a double-click is rejected instead of spawning a second CFRunLoop thread (which would have leaked forever).
- **Defensive `finish_session(PickOutcome)`** — picked, cancelled, and silent outcomes all funnel through one path that restores the main window, so the picker no longer leaves the main window hidden under Accessory activation policy on macOS.
- **Click-arm debounce (250 ms)** — the first click after `start` is ignored, so activating the picker from the toolbar doesn't immediately commit a stray pick.
- **Capture throttled to ~30 Hz** (was ~60 Hz) — no perceivable quality loss and far less load on the screen-capture API.

### Picker UX fixes

- `set_picker_mode(false)` now reliably hides the main window — previously the main window could stay on top when the activation policy was toggled.
- Double-clicking the picker button no longer causes a hide→show flash.
- Drag-reordering no longer races a palette reload.
- The full palette card is now draggable, not just the 14×14 grip handle (which was `display: none` below 640 px).
- Container-level `dragover` / `drop` fallback — dropping between cards still reorders.
- Redundant toolbar buttons on each palette card removed.

### Cross-platform release pipeline (new)

A new `Release` GitHub Actions workflow builds and uploads installers for:

- **Linux** (`.deb` / `.AppImage` on `ubuntu-22.04`)
- **Windows** (`.msi` / `.exe` on `windows-latest`)
- **macOS Intel** (`.dmg` x86_64 on `macos-15-intel`)
- **macOS Apple Silicon** (`.dmg` aarch64 on `macos-latest`)

Pushing an annotated `v*` tag triggers the matrix build and auto-creates a draft release with all artefacts attached via `tauri-action`.

### CI

- CI now also runs `pnpm test` (vitest) and `cargo test --all-targets` in addition to build / check / clippy.
- Added Linux CI deps: `libpipewire-0.3-dev`, `libgbm-dev`, `libx11-dev`, `libxtst-dev`, `libxcb-cursor0`, `libxcb-cursor-dev` so the Linux build is no longer linker-fragile.
- `dist/picker.html` is verified to exist after `vite build` so the picker window can no longer silently ship without its bundle.

### Internals

- `order.json` storage for palette order — reorders persist across launches; self-heals if a referenced palette is deleted.
- `vitest` + jsdom scaffold with smoke tests for `format` and `reorder`.
- React 18 / Tauri 2 / i18next (en + zh-CN) / lucide-react, MIT licensed.

### Installers

See the assets below for your platform. The draft is not yet published — review the notes and the built artefacts, then **Publish release** when you're ready.

---

## 中文

本次发布稳定了取色器、加入了调色板拖拽排序，并补齐了真正的跨平台发布流水线。

### 取色器稳定性

`picker.rs` 整个重写为 session-id + 原子状态机，替换了原本的简单 mutex：

- **`session_id` + `take(expected)`** — 每次 `start` 递增 session 计数，只有匹配的 session 才能 `finish`，上一轮取色的迟到 cancel 不再能污染新一轮。
- **原子 `TAP_STATE`（NOT_STARTED / STARTING / RUNNING / FAILED）** — `rdev` 全局 tap 监听器加了守卫，双击触发的第二次 `start()` 会被直接拒绝，不会再起第二条 CFRunLoop 线程（那条线之前会永久泄漏）。
- **`finish_session(PickOutcome)` 统一出口** — 拾取、取消、静默退出都走同一条恢复主窗口的路径，取色器不会再让主窗口留在 macOS 的 Accessory 激活策略下变没响应。
- **点击去抖 250 ms** — `start` 之后的第一击会被忽略，从工具栏启动取色不会再被误判成一取。
- **截图频率从 ~60 Hz 降到 ~30 Hz** — 画质无可感损失，但屏幕捕获 API 压力大幅下降。

### 取色器 UX 修复

- `set_picker_mode(false)` 现在能稳定隐藏主窗口 —— 之前在 macOS 上偶尔会留在最上层。
- 双击取色器按钮不再出现「隐藏→又显示」的闪烁。
- 拖拽排序不再和调色板 reload 抢资源。
- 整张调色板卡片都可拖拽，不再只靠 14×14 的小把手（而且小把手在 640px 以下还会 `display: none`）。
- 容器级 `dragover` / `drop` 兜底 —— 卡片之间空隙处的拖入也能正确排序。
- 移除了调色板卡片上多余的按钮。

### 跨平台发布流水线（新增）

全新的 `Release` GitHub Actions 工作流，覆盖 4 个目标平台：

- **Linux**（`ubuntu-22.04`，`.deb` / `.AppImage`）
- **Windows**（`windows-latest`，`.msi` / `.exe`）
- **macOS Intel**（`macos-15-intel`，x86_64 `.dmg`）
- **macOS Apple Silicon**（`macos-latest`，aarch64 `.dmg`）

推送带注释的 `v*` tag 就会触发矩阵构建，并通过 `tauri-action` 自动创建草稿 release、附带全部产物。

### CI

- CI 现在除了 build / check / clippy 之外，还会跑 `pnpm test`（vitest）和 `cargo test --all-targets`。
- 补齐 Linux CI 依赖：`libpipewire-0.3-dev`、`libgbm-dev`、`libx11-dev`、`libxtst-dev`、`libxcb-cursor0`、`libxcb-cursor-dev`，Linux 构建不再因为缺系统库翻车。
- `vite build` 之后断言 `dist/picker.html` 存在 —— 取色器窗口的 bundle 不再会「莫名消失」。

### 内部细节

- `order.json` 持久化调色板顺序，重启后保留；引用了已删除 palette 时自动愈合。
- 引入 `vitest` + jsdom，并为 `format` 和 `reorder` 写了冒烟测试。
- React 18 / Tauri 2 / i18next（en + zh-CN）/ lucide-react，MIT 协议。

### 安装包

下方 Assets 区域按平台分类。草稿尚未发布 —— 请先 review 一下说明和构建产物，满意后再点 **Publish release**。

---

## Checksums / 校验和

```text
# Will be generated by tauri-action after the draft is created.
# tauri-action 会在草稿创建后自动生成。
```

**Full Changelog**: https://github.com/Freakz2z/OpenColor/commits/main

Initial public release. / 首个公开发布。
