---
name: verify-themes
description: Render this project's UI across all four palettes (default/Sonto × light/dark) in headless Chrome using the real compiled CSS, and check token contrast. Use after any visual change — colours, tokens, typography, a new card or form section — since the test suite cannot see a colour that disappears in dark mode.
---

# Verify themes

The app ships four palettes from one token set: default and Sonto, each light and
dark. A colour written as a literal, or a token that reads fine on white, can be
invisible or glaring in the other three. Nothing in `npm test` catches that.

This renders real markup against the **compiled** stylesheet and the **real**
Quicksand subset, so what you look at is what ships.

## 1. Build, then collect the real assets

```bash
cd web && npm run build
CSS=$(find .next -name "*.css" -not -path "*/dev/*" | head -1)
FONT=$(ls .next/static/media/*s.p.*woff2 | head -1)   # the preloaded Latin subset
mkdir -p /tmp/verify && cp "$CSS" /tmp/verify/app.css && cp "$FONT" /tmp/verify/quicksand.woff2
```

Use the built CSS, not `globals.css` — only the build resolves Tailwind aliases
and token layering. Use the real font or numerals will lie: Quicksand has
proportional digits, so a fallback face hides misalignment.

## 2. One HTML file per palette, themed on `<html>`

The selectors are `html[data-theme="dark"]` and `html[data-scheme="sonto"]`.
Putting those attributes on a wrapper `<div>` silently does nothing — the tokens
never cascade and every panel renders light. Write four documents and embed them
with `<iframe>` so one screenshot captures all four.

Each document needs:

```html
<html data-theme="dark" data-scheme="sonto">
<style>
  @font-face { font-family: Quicksand; src: url("quicksand.woff2") format("woff2");
               font-weight: 300 700; font-display: block; }
  :root { --font-quicksand: Quicksand; }
</style>
<link rel="stylesheet" href="app.css">
<style>
  /* globals.css paints this on <body>; reproduce it or the frame is transparent. */
  body { background:
      radial-gradient(120% 80% at 50% -10%, var(--surface-muted), transparent 60%),
      linear-gradient(180deg, var(--background) 0%, var(--background-soft) 100%);
    color: var(--text); font-family: Quicksand, sans-serif; }
</style>
```

Include whatever you changed, plus a numeral column (`class="dataTable"` with
`class="numeric"` cells) whenever type or tokens moved.

## 3. Screenshot

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --screenshot=/tmp/verify/out.png \
  --window-size=1520,2400 "file:///tmp/verify/index.html"
```

Then **read the PNG** and actually look at it. Check each palette for: text that
vanishes into its ground, a fill that glares, and money columns whose digits fail
to line up.

## Traps that will waste your time

- **`file://` blocks `mask-image: url(...)`.** The element renders as nothing and
  looks like a broken asset. It is not — the app serves same-origin over http and
  works. To verify a mask locally, inline it as a `data:` URI.
- **A bare `<span>` ignores width and height.** Anything sized needs
  `display: block`. A zero-size element is easy to misread as a styling bug.
- Reading the screenshot is the point. A build that compiles proves nothing about
  whether a colour is legible.

## Checking contrast numerically

Eyeballing misses borderline pairs. For any token pair, compute the WCAG ratio
(AA needs 4.5 for text under 18px, 3.0 for large text and meaningful graphics):

```python
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
```

Check a foreground against **every** surface it can land on — white,
`--surface-soft`, `--primary-softer`, and any tinted fill — not just the lightest
one. Token values are in `web/app/globals.css`.

## Checking the numeric font really has tabular figures

If `--font-numeric` is ever changed, prove the new face has them rather than
trusting a foundry list. Decode the built `.woff2` with Node's `zlib`
(brotli-decompress the stream after the table directory) and either confirm
`tnum` appears in GSUB, or compare the `hmtx` advance widths of glyphs for
`0`–`9`: equal widths mean tabular. Watch out for subsets that contain no digits
at all — every digit mapping to glyph 0 looks deceptively uniform.
