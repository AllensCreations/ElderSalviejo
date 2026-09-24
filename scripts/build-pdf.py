#!/usr/bin/env python3
"""
Elder Salviejo • Mission Record PDF Generator
Headless high-resolution PDF compiler using Playwright.
Produces an exact 8.5 x 11 in Letter-size commemorative keepsake PDF.
"""

import sys
import os
import time
import shutil
import subprocess
from playwright.sync_api import sync_playwright

PORT = 3499
BASE_URL = f"http://localhost:{PORT}/book"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, ".."))
    os.chdir(root_dir)

    print("Starting local server on port", PORT, "...")
    server_process = subprocess.Popen(
        ["node", "server.js"],
        env=dict(os.environ, PORT=str(PORT)),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2.5)

    try:
        with sync_playwright() as p:
            print("Launching headless Chromium...")
            browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
            page = browser.new_page()

            # Set viewport to standard 8.5 x 11 in
            page.set_viewport_size({"width": 816, "height": 1056})

            print(f"Navigating to {BASE_URL}...")
            page.goto(BASE_URL, wait_until="networkidle", timeout=30000)

            # Wait for chapters to render
            page.wait_for_selector("#bookWeeklyChapters", timeout=15000)
            page.wait_for_timeout(3000)

            # Pre-decode all images & fonts
            page.evaluate("""
                async () => {
                    const imgs = Array.from(document.images);
                    await Promise.all(imgs.map(img => img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
                    if (document.fonts && document.fonts.ready) {
                        await document.fonts.ready;
                    }
                }
            """)
            page.wait_for_timeout(1000)

            out_pdf = os.path.join("public", "book.pdf")
            vault_pdf = os.path.join("vault", "book.pdf")
            os.makedirs("vault", exist_ok=True)
            os.makedirs("public", exist_ok=True)

            print(f"Rendering PDF to {out_pdf}...")
            page.pdf(
                path=out_pdf,
                format="Letter",
                print_background=True,
                margin={"top": "0in", "bottom": "0in", "left": "0in", "right": "0in"},
                prefer_css_page_size=True
            )

            shutil.copyfile(out_pdf, vault_pdf)

            size_mb = os.path.getsize(out_pdf) / (1024 * 1024)
            print(f"Success! Generated {out_pdf} and {vault_pdf} ({size_mb:.2f} MB)")
            browser.close()

    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_process.kill()

if __name__ == "__main__":
    main()
