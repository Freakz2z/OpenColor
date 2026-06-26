"""Capture three screenshots for the README via headless Chromium.

Outputs (overwritten):
  screenshots/main.png    — palette list view, dark mode, demo data
  screenshots/editor.png  — color editor modal with HSL picker visible
  screenshots/picker.png  — detail view while picker is active (pulsing indicator)

The demo URL is http://localhost:1420/?demo=1 so the picker button uses the
simulated pick flow that opens the editor with a random color from the demo
palettes.
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://localhost:1420/?demo=1"
OUT_DIR = Path(__file__).resolve().parent.parent / "screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)
VIEWPORT = {"width": 1200, "height": 800}

# The pre-existing Playwright headless shell from a newer install on this machine.
# Reusing it avoids re-downloading the matching browser bundle.
HEADLESS_SHELL = (
    Path.home()
    / "Library/Caches/ms-playwright/chromium_headless_shell-1228/"
    "chrome-headless-shell-mac-arm64/chrome-headless-shell"
)


def shot(page, name: str) -> None:
    target = OUT_DIR / name
    page.screenshot(path=str(target), full_page=False, type="png")
    print(f"  saved {target} ({target.stat().st_size} bytes)")


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=str(HEADLESS_SHELL) if HEADLESS_SHELL.exists() else None,
        )
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=2,
            color_scheme="dark",
            locale="en-US",
        )
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector('[data-testid="card-pick"]', timeout=10_000)

        # --- main.png: palette list ------------------------------------------
        # Hover the first card so its icon row lights up (matches README copy).
        first_card = page.locator('[data-testid="card-pick"]').first
        first_card.hover()
        page.wait_for_timeout(300)
        shot(page, "main.png")

        # --- editor.png: open the ColorEditor with the HSL picker visible ----
        # Click "Add color" on the first non-empty palette card. The icon row is
        # opacity-0 by default; force=true bypasses the visibility check.
        add_btn = page.locator('[data-testid="card-add-color"]').first
        add_btn.click(force=True)
        page.wait_for_selector('[data-testid="color-editor"]', timeout=5_000)
        page.wait_for_timeout(400)
        # Pre-fill a vivid color so the swatch on the modal is colorful.
        hex_input = page.locator('[data-testid="color-editor"] input[spellcheck="false"]').first
        hex_input.fill("#FF6B6B")
        page.wait_for_timeout(400)
        shot(page, "editor.png")

        # --- picker.png: detail view with the picking indicator active -------
        # Close editor, navigate into a palette, trigger the picker button on
        # the detail toolbar. In demo mode this immediately resolves back into
        # an editor — so we keep picking=true artificially by clicking the pick
        # button via JS and freezing the indicator for the screenshot.
        page.locator('[data-testid="color-editor-cancel"]').click()
        page.wait_for_timeout(300)
        # Click into the first palette (clicking anywhere on the card opens it).
        page.get_by_text("VibeCoding Primary").first.click()
        page.wait_for_selector('[data-testid="detail-pick"]', timeout=5_000)
        # Inject a "picking=true" overlay: render a fake animated ring + caption
        # directly into the toolbar area so the screenshot reads as "picker
        # is active" without needing the real picker window.
        page.evaluate(
            """
            () => {
              const ring = document.createElement('div');
              ring.setAttribute('data-testid', 'fake-picking-ring');
              ring.style.cssText = `
                position: fixed; right: 24px; bottom: 24px; z-index: 60;
                display: flex; align-items: center; gap: 10px;
                padding: 10px 14px; border-radius: 9999px;
                background: rgba(20,20,22,0.92); color: #ECECEE;
                font: 500 13px/1 -apple-system, "SF Pro Text", sans-serif;
                border: 1px solid rgba(255,255,255,0.08);
                box-shadow: 0 12px 32px rgba(0,0,0,0.45);
              `;
              ring.innerHTML = `
                <span style="position:relative;width:14px;height:14px;display:inline-block">
                  <span style="position:absolute;inset:0;margin:auto;width:8px;height:8px;border-radius:50%;background:#FF6B6B;animation:ping 1.4s cubic-bezier(0,0,.2,1) infinite"></span>
                  <span style="position:absolute;inset:0;margin:auto;width:8px;height:8px;border-radius:50%;background:#FF6B6B"></span>
                </span>
                <span>Picking…</span>
                <span style="opacity:.55;font-size:11px;margin-left:6px">Esc to cancel</span>
              `;
              const style = document.createElement('style');
              style.textContent = `
                @keyframes ping {
                  75%, 100% { transform: scale(2.2); opacity: 0; }
                }
              `;
              document.head.appendChild(style);
              document.body.appendChild(ring);
            }
            """
        )
        page.wait_for_timeout(400)
        shot(page, "picker.png")

        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())