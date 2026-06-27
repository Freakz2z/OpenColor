# OpenColor

A lightweight desktop color picker for collecting, organizing, and exporting color palettes for design and AI-assisted development.

[English](README.md) · [简体中文](README.zh-CN.md)

![OpenColor main window](screenshots/main.png)

## Features

- Pick colors anywhere on screen with a cursor-following preview.
- Create, reorder, rename, and delete palettes.
- Edit colors with HEX, RGB, and HSL controls.
- Extract dominant colors from images.
- Export palettes as prompt-ready natural language.
- English and Simplified Chinese UI with light and dark themes.

## Platform support

| Platform | Screen picker |
| --- | --- |
| macOS 12+ | Supported; requires Screen Recording and Accessibility permissions. |
| Windows 10/11 | Supported. |
| Linux X11 | Supported. |
| Linux Wayland | Not supported because global pointer hooks are restricted. |

Manual color editing, image import, palette management, and export remain available when screen picking is unavailable.

## Development

Requirements: Node.js 18+, pnpm, Rust, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
pnpm install
pnpm tauri:dev
```

Browser-only demo:

```bash
pnpm dev
# http://localhost:1420/?demo=1
```

Checks and production build:

```bash
pnpm test
pnpm build
(cd src-tauri && cargo test --all-targets)
pnpm tauri:build
```

Pushing a `v*` tag runs the release workflow and prepares Windows, Linux, Intel macOS, and Apple Silicon macOS packages as a draft GitHub Release.

## Stack

Tauri 2 · React 18 · TypeScript · Vite · Rust

## License

[MIT](LICENSE)
