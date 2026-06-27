<div align="center">

![OpenColor](public/favicon.svg)

# OpenColor

A lightweight desktop color picker for collecting, organizing, and exporting color palettes for design and AI-assisted development.

[![Release](https://img.shields.io/github/v/release/Freakz2z/OpenColor?include_prereleases&sort=semver)](https://github.com/Freakz2z/OpenColor/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Freakz2z/OpenColor/ci.yml?branch=main&label=ci)](https://github.com/Freakz2z/OpenColor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Freakz2z/OpenColor)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
[![React 18](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Platform: macOS · Windows · Linux](https://img.shields.io/badge/Platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-2ea44f)](#platform-support)

[English](README.md) · [简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [Releases](https://github.com/Freakz2z/OpenColor/releases) · [Changelog](.github/RELEASE_NOTES_v0.2.0.md)

</div>

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
