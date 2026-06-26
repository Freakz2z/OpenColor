# Contributing to OpenColor

Thanks for your interest in OpenColor! This project is small, opinionated, and maintained in spare time. Reading this guide before opening a PR will save everyone time.

## Code of conduct

Be kind, assume good faith, and focus on the work. Harassment of any kind is not tolerated.

## Filing issues

- **Bug reports** — include the OS, OpenColor version, and steps to reproduce. A short screen recording or screenshot helps a lot.
- **Feature requests** — explain the problem you're trying to solve, not just the solution you have in mind. Often there's a simpler approach.
- **Security issues** — see [SECURITY.md](SECURITY.md) (or email the maintainer privately if the file is missing — don't open a public issue).

For non-trivial changes, please open an issue **first** so we can agree on direction before you spend time coding.

## Development setup

```bash
# 1. Prereqs: Node ≥ 18, pnpm, Rust toolchain, platform native deps (see README)
# 2. Clone & install
git clone https://github.com/<your-fork>/OpenColor.git
cd OpenColor
pnpm install

# 3. Run in dev mode
pnpm tauri:dev

# 4. Run in demo mode (no Tauri)
pnpm dev   # then open http://localhost:1420/?demo=1
```

## Before opening a PR

Run these locally and make sure they pass:

```bash
pnpm build       # tsc --noEmit + vite build (catches TS errors and dead code)
cd src-tauri && cargo check
```

The CI workflow runs the same checks plus `cargo clippy` and `cargo test` on the three platforms.

## Code style

- **TypeScript / React** — 2-space indent, semicolons off (matches existing code), functional components + hooks, no `class`. Keep files under ~200 lines; if it grows, split.
- **Rust** — follow `cargo fmt` and `cargo clippy` defaults. The picker state machine in `src-tauri/src/picker.rs` is the most subtle part — read the comments there before touching it.
- **i18n** — every user-facing string lives in `src/i18n/en.json` and `src/i18n/zh-CN.json`. If you add a key to one, add it to the other too.
- **No new dependencies without discussion** — Tauri plugins in particular have security implications; expect pushback if you add one.

## Project layout

- `src/components/` — UI components, one per file, named after their default export.
- `src/lib/` — pure logic (no React, no Tauri imports). Easy to unit test when we add a test runner.
- `src-tauri/src/` — one Rust file per concern (`palette`, `storage`, `picker`, `platform`). New Tauri commands go in the file that owns that concern.

## Commit messages

Short and imperative: *"Add HEX shorthand support to ColorEditor"*, not *"Added HEX shorthand"*. One logical change per commit.

## Release process

Tags are `vX.Y.Z` (semver). The maintainer cuts a release by:

1. Bumping `package.json` and `Cargo.toml` versions.
2. Updating `CHANGELOG.md` (if it exists; first PR welcome).
3. Pushing the tag — GitHub Actions builds the three platform bundles and attaches them to the GitHub Release.

## License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).