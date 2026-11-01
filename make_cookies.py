#!/usr/bin/env python3
"""Builds cookies.js from the images in ./images.

Each image's filename becomes the cookie's name, with dashes and underscores as spaces:

    pure-vanilla-cookie.png   ->  Pure Vanilla Cookie
    cookie_of_darkness.webp   ->  Cookie of Darkness
    GingerBrave.png           ->  GingerBrave

Put cookies in numbered folders to group them by rarity. The folders are listed in their number
order, and cookies are sorted alphabetically inside each one:

    images/01-common/gingerbrave.png
    images/02-rare/custard-cookie-iii.png
    images/05-super-epic/...

The folder name (without its number) becomes the cookie's rarity, used by the rarity filter on
the site: "05-super-epic" -> "Super Epic". Images straight in images/ are listed last, with no rarity.

Collab cookies (Sonic, Wicked, ...) go in images/collab/, again in numbered rarity folders:

    images/collab/03.1-special/sonic-cookie.png     right after the regular 03 Specials
    images/collab/03.2-guest/jinu-cookie.png        then the Guests

Their numbers place them among the regular folders (03.1 and 03.2 come after 03, before 04).
They're marked as collab in cookies.js and only show up in the game when "Collab cookies" is
switched on.

Run it again whenever you add, remove or rename images:

    python make_cookies.py            write cookies.js
    python make_cookies.py --list     also print every file and the name it gets
    python make_cookies.py --dry-run  show what would happen without writing anything

To fix a name the filename can't express, add it to names.json, keyed by the filename
without its extension:  {"pure-vanilla-cookie": "Pure Vanilla Cookie (Awakened)"}
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import quote

IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"}
SKIP = {"logo"}                         # files in images/ that aren't cookies
SMALL_WORDS = {"a", "an", "and", "at", "by", "de", "for", "in", "of", "on", "or", "the", "to", "with"}


def name_from_filename(stem):
    """'pure-vanilla_cookie' -> 'Pure Vanilla Cookie', keeping words like 'GingerBrave' as they are."""
    words = re.sub(r"[-_\s]+", " ", stem).strip().split(" ")
    out = []
    for i, word in enumerate(words):
        if any(ch.isupper() for ch in word[1:]):      # already has its own capitals: leave it alone
            out.append(word)
        elif i > 0 and word.lower() in SMALL_WORDS:   # "Cookie of Darkness", not "Cookie Of Darkness"
            out.append(word.lower())
        else:                                         # capitalise without .title()'s "Kumiho'S" problem
            out.append(word[:1].upper() + word[1:].lower())
    return " ".join(out)


def natural_key(text):
    """Sort 'Cookie 2' before 'Cookie 10'."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def rarity_from_folder(folder_name):
    """'05-super-epic' -> 'Super Epic', '03.1-special' -> 'Special'"""
    return name_from_filename(re.sub(r"^\d+(\.\d+)?[-_ ]*", "", folder_name))


def add_file(f, group, rarity, folder, images, overrides, cookies, skipped, collab=False):
    if not f.is_file() or f.name.startswith("."):
        return
    if f.suffix.lower() not in IMAGE_TYPES:
        if f.name.lower() != "readme.txt":
            skipped.append(str(f.relative_to(images)))
        return
    if folder == images and f.stem.lower() in SKIP:
        return
    name = overrides.get(f.stem) or name_from_filename(f.stem)
    rel = f.relative_to(images).as_posix()
    cookies.append({"name": name, "rarity": rarity, "group": group, "collab": collab,
                    "src": "images/" + quote(rel), "file": rel})


def main():
    parser = argparse.ArgumentParser(description="Build cookies.js from the images folder.")
    parser.add_argument("--list", action="store_true", help="print every file and the name it gets")
    parser.add_argument("--dry-run", action="store_true", help="don't write cookies.js, just show the result")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    images = root / "images"
    names_file = root / "names.json"
    overrides = json.loads(names_file.read_text(encoding="utf-8")) if names_file.exists() else {}

    if not images.is_dir():
        raise SystemExit(f"No images folder found at {images}")

    # images/ itself plus one level of rarity folders, in folder-number order
    def subfolders(d):
        return sorted((x for x in d.iterdir() if x.is_dir() and not x.name.startswith(".")),
                      key=lambda x: natural_key(x.name))
    def number(folder):
        """'03.1-special' -> (3, 1), '04-epic' -> (4, 0); unnumbered folders go last"""
        m = re.match(r"(\d+)(?:\.(\d+))?", folder.name)
        return (int(m.group(1)), int(m.group(2) or 0)) if m else (10**9, 0)

    # regular and collab rarity folders sorted together by their number, so collab folders
    # numbered 03.1, 03.2 sit right after the regular 03 folder
    collab_dir = images / "collab"
    folders = [(d, False) for d in subfolders(images) if d != collab_dir]
    if collab_dir.is_dir():
        folders += [(d, True) for d in subfolders(collab_dir)]
    folders.sort(key=lambda fc: (number(fc[0]), fc[1], natural_key(fc[0].name)))
    folders += [(images, False)] + ([(collab_dir, True)] if collab_dir.is_dir() else [])   # loose images last

    cookies, skipped = [], []
    for group, (folder, collab) in enumerate(folders):
        rarity = rarity_from_folder(folder.name) if folder not in (images, collab_dir) else ""
        for f in folder.iterdir():
            add_file(f, group, rarity, folder, images, overrides, cookies, skipped, collab=collab)

    cookies.sort(key=lambda c: (c["group"], natural_key(c["name"])))


    # Two files that end up with the same name would be impossible to tell apart in the game.
    seen = {}
    for c in cookies:
        seen.setdefault(c["name"].lower(), []).append(c["file"])
    duplicates = {name: files for name, files in seen.items() if len(files) > 1}

    if args.list or args.dry_run:
        width = max((len(c["file"]) for c in cookies), default=0)
        for c in cookies:
            print(f"  {c['file']:<{width}}  ->  {c['name']}" + (f"  ({c['rarity']})" if c["rarity"] else "")
                  + ("  [collab]" if c["collab"] else ""))
        print()

    for files in duplicates.values():
        print(f"Warning: these files all become the same cookie name: {', '.join(files)}")
    if skipped:
        print(f"Skipped (not an image): {', '.join(sorted(skipped))}")
    unused = sorted(set(overrides) - {Path(c['file']).stem for c in cookies})
    if unused:
        print(f"Note: names.json has entries for files that don't exist: {', '.join(unused)}")

    if args.dry_run:
        print(f"Dry run: cookies.js would list {len(cookies)} cookies (nothing written).")
        return

    data = []
    for c in cookies:
        entry = {"name": c["name"]}
        if c["rarity"]:
            entry["rarity"] = c["rarity"]
        if c["collab"]:
            entry["collab"] = True
        entry["src"] = c["src"]
        data.append(entry)
    (root / "cookies.js").write_text(
        "// Generated by make_cookies.py - run it again after changing the images folder.\n"
        "window.COOKIES = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8", newline="\n")
    collabs = sum(c["collab"] for c in cookies)
    print(f"Wrote cookies.js with {len(cookies)} cookies" + (f" ({collabs} collab)." if collabs else "."))


if __name__ == "__main__":
    main()
