# OpenColor

一个面向 [VibeCoding](https://zh.wikipedia.org/wiki/Vibe_coding) 工作流的轻量跨平台桌面提色器 —— 在屏幕任意位置取色、整理成命名色板、并以自然语言导出（可直接贴到任何 AI Agent 提示词里）。

基于 **Tauri 2**、**React 18**、**TypeScript**、**Vite**、**Rust** 构建。

[English](README.md) · [简体中文](README.zh-CN.md)

---

## 截图

> 把截图放到 `screenshots/` 目录即可展示在这里。建议：`main.png`、`picker.png`、`editor.png`。

| 主窗口 — 色板列表 | 颜色编辑器 + HSL 色盘 | 屏幕取色器 |
| --- | --- | --- |
| ![主窗口](screenshots/main.png) | ![编辑器](screenshots/editor.png) | ![取色器](screenshots/picker.png) |

---

## 功能

- **屏幕取色** — 点击屏幕上任意位置拾取颜色，浮动预览卡片实时跟随光标。
- **手动录入** — 直接输入 HEX 值（支持 3 位简写：`#f0c` → `#FF00CC`），或用自定义 HSL 色盘可视化选择。
- **从图片导入** — 拖入一张截图或照片，OpenColor 自动量化主色并支持多选导入。
- **命名色板** — 把颜色组织到色板里，给每个颜色打上角色标签（Primary / Accent …）、色系（红 / 青 …）和备注。
- **自然语言导出** — 一键复制为 prompt 友好的描述：*"请使用以下配色体系：主色 #FF6B6B (RGB: 255,107,107) …"*，中英文 Agent 通用。
- **国际化 + 深色模式** — 完整英文与简体中文；亮色 / 暗色 / 跟随系统。
- **极小体积** — 打包后约 10 MB（Tauri 原生壳，没有 Electron，没有内嵌 Chromium）。

---

## 快速开始

```bash
# 需要 Node ≥ 18、pnpm、Rust 工具链，以及平台原生依赖（见下文）
pnpm install
pnpm tauri:dev
```

首次构建需要几分钟编译 Rust 后端。之后热重载正常。

### Demo 模式（无 Tauri 环境）

只想预览 UI，不想装平台原生屏幕采集依赖：

```bash
pnpm dev
# 然后打开 http://localhost:1420/?demo=1
```

Demo 模式从 `src/lib/demoData.ts` 加载三个示例色板（`VibeCoding Primary`、`Dark mode alt`、`Empty palette`）。**编辑不会持久化**——只存在内存中。屏幕取色在该模式下禁用，「取色」按钮会从示例里随机选一个颜色插入。

---

## 构建发布

```bash
pnpm tauri:build
```

Tauri 会为当前平台打包：

| 平台 | 产物 |
| --- | --- |
| macOS | `.app` 和 `.dmg`（Apple Silicon + Intel） |
| Windows | `.msi` 和 `.exe` |
| Linux | AppImage、`.deb`、`.rpm` |

跨平台编译理论可行但不官方支持——建议在每个目标系统上分别打包。

---

## 平台支持

色板 UI、手动录入、导出全平台可用。**屏幕取色**取决于宿主系统：

| 平台 | 状态 |
| --- | --- |
| macOS 12+ | ✅ 需要授予「屏幕录制」权限（系统设置 → 隐私与安全性 里授予一次）。 |
| Windows 10/11 | ✅ 开箱即用。多显示器边缘场景待 QA。 |
| Linux X11 | ✅ 可用。可能需要 `xcap` 的构建依赖（`libxcb`、`libxrandr`）。 |
| Linux Wayland | ❌ 不支持。Wayland 默认限制全局指针 hook，切到 X11 会话即可使用。 |

取色不可用时，OpenColor 其它功能照常工作：手动 HEX、自定义 HSL 色盘、从图片导入都没问题。

### 平台前置依赖

- **macOS** — Xcode Command Line Tools（`xcode-select --install`）。
- **Windows** — Microsoft Visual Studio C++ Build Tools、WebView2 运行时（Win11 预装）。
- **Linux** — `libwebkit2gtk-4.1-dev`、`libssl-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`。详见 [Tauri 前置依赖指南](https://tauri.app/start/prerequisites/)。

---

## 已知限制

- **没有窗口状态持久化插件** — 操作系统本身会保留窗口尺寸/位置，但若你删除并重建应用配置，会回到默认的 640×480。
- **图片导入** 每个色板最多提取 12 个主色（保证大图也能快速处理）。
- **Linux 取色器权限** — `rdev` 的全局鼠标 hook 在某些 Wayland 衍生环境里需要 root 或 `uinput` 权限。
- **`macos-private-api` 已启用** — 这是透明 + 置顶取色窗口必须的。**这也是 OpenColor 无法上架 Mac App Store 的原因之一。** 请通过 `.dmg` / Homebrew 自分发。
- **还没有单元测试** — 项目体量小到可以手动验证，但 PR 加测试（尤其是 `src-tauri/src/picker.rs` 的状态机部分）会非常受欢迎。

---

## 架构

```
┌─────────────────────────────┐
│  主窗口 (React UI)          │  ← 色板列表、颜色网格、编辑器、导出
└─────────────────────────────┘
         │ IPC (tauri::command)
         ▼
┌─────────────────────────────┐
│  Rust 核心                  │
│  - palette.rs   (CRUD)      │
│  - storage.rs   (JSON I/O)  │
│  - picker.rs    (状态机)    │  ← Idle → Picking → Confirmed
│  - platform.rs  (权限)      │
└─────────────────────────────┘
         │ xcap::Monitor::capture_region
         ▼
┌─────────────────────────────┐
│  取色器窗口 (透明)          │  ← 跟随光标的色卡，点击提交
│  - transparent: true        │
│  - always_on_top: true      │
│  - decorations: false       │
└─────────────────────────────┘
```

源码结构：

- `src/` — React + TypeScript UI
  - `components/` — `App`、`Toolbar`、`PaletteCard`、`ColorGrid`、`ColorEditor`、`HslPicker`、`ImageImportDialog`、`ExportDialog`、`SettingsView` …
  - `lib/` — `tauri.ts`（IPC 封装）、`format.ts`（HEX/RGB/HSL 转换）、`quantize.ts`（中位切分量化）、`export.ts`（自然语言序列化）、`demoData.ts`
  - `i18n/` — `en.json`、`zh-CN.json`
- `src-tauri/` — Rust 后端
  - `src/` — 按职责分文件（palette / storage / picker / platform）
  - `picker.html` — 透明取色窗口（不用 React，纯 DOM + `listen`/`emit`）
  - `tauri.conf.json` — 打包 + 窗口配置
  - `capabilities/default.json` — 最小能力集

---

## 贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。简要：非小改动先开 issue；PR 保持聚焦；确保 `pnpm build` 和 `cargo check` 通过。

---

## 协议

[MIT](LICENSE) © Freakz2z