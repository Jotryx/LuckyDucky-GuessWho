Put your cookie images in this folder (png, jpg, webp, gif, svg or avif).

The filename becomes the cookie's name. Dashes and underscores count as spaces:
  pure-vanilla-cookie.png   ->  Pure Vanilla Cookie
  cookie_of_darkness.webp   ->  Cookie of Darkness
  GingerBrave.png           ->  GingerBrave   (names with their own capitals are kept as they are)

Then, in the project folder, run:
  python make_cookies.py            builds cookies.js
  python make_cookies.py --list     also shows every file and the name it gets
  python make_cookies.py --dry-run  preview only, nothing is written

Need a name the filename can't express? Put it in names.json (next to make_cookies.py),
keyed by the filename without its extension:
  {"pure-vanilla-cookie": "Pure Vanilla Cookie (Awakened)"}

logo.png in this folder is the site logo, not a cookie, so it's skipped.
