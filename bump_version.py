#!/usr/bin/env python3
"""Run this before pushing an update: it stamps a new version on every script and stylesheet
link (style.css?v=20261002-2150), so visitors' browsers fetch the new files instead of mixing
fresh and cached ones. Needed because GitHub Pages lets browsers cache files for 10 minutes."""
import re
import time
from pathlib import Path

root = Path(__file__).resolve().parent
version = time.strftime("%Y%m%d-%H%M")
pages = [root / "index.html", root / "stats" / "index.html"]
link = re.compile(r'((?:src|href)="(?!https?:|//|data:)[^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"')

for page in pages:
    html = page.read_text(encoding="utf-8")
    new, count = link.subn(lambda m: f'{m.group(1)}?v={version}"', html)
    page.write_text(new, encoding="utf-8", newline="\n")
    print(f"{page.relative_to(root)}: {count} links set to v={version}")
