#!/usr/bin/env python3
"""Remove CSS rules whose selectors reference class names that no source file uses.

A class is considered "used" when its name appears as a whole word anywhere in
app/ or components/ source. That is deliberately permissive: keeping a rule that
might be live is cheap, deleting a live rule is not.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
CSS = WEB / "app" / "globals.css"
SOURCE_DIRS = [WEB / "app", WEB / "components"]
SOURCE_SUFFIXES = {".tsx", ".ts", ".jsx", ".js"}


def source_text() -> str:
    chunks = []
    for directory in SOURCE_DIRS:
        for path in directory.rglob("*"):
            if path.suffix in SOURCE_SUFFIXES:
                chunks.append(path.read_text(encoding="utf-8"))
    return "\n".join(chunks)


def split_top_level(text: str) -> list[tuple[str, str | None, str]]:
    """Split CSS into (prelude, body, raw) items. body is None for statements."""
    items: list[tuple[str, str | None, str]] = []
    i = 0
    start = 0
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth = 1
            j = i + 1
            while j < len(text) and depth:
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                j += 1
            prelude = text[start:i]
            body = text[i + 1 : j - 1]
            items.append((prelude, body, text[start:j]))
            i = j
            start = j
        elif ch == ";" and text[start:i].strip().startswith("@"):
            items.append((text[start : i + 1], None, text[start : i + 1]))
            i += 1
            start = i
        else:
            i += 1
    tail = text[start:]
    if tail.strip():
        items.append((tail, None, tail))
    return items


def split_selectors(prelude: str) -> list[str]:
    parts: list[str] = []
    depth = 0
    current = ""
    for ch in prelude:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += ch
    parts.append(current)
    return parts


def prune(text: str, dead: set[str], removed: list[str]) -> str:
    out = []
    for prelude, body, raw in split_top_level(text):
        if body is None:
            out.append(raw)
            continue
        # Preserve any comment that sits in front of the selector or at-rule.
        comment_prefix = ""
        selector_part = prelude
        last_comment_end = prelude.rfind("*/")
        if last_comment_end != -1:
            comment_prefix = prelude[: last_comment_end + 2]
            selector_part = prelude[last_comment_end + 2 :]

        stripped = selector_part.strip()
        if stripped.startswith("@"):
            if stripped.startswith("@keyframes") or stripped.startswith("@font-face"):
                out.append(raw)
                continue
            inner = prune(body, dead, removed)
            if inner.strip():
                out.append(f"{prelude}{{{inner}}}")
            elif comment_prefix.strip():
                out.append(comment_prefix)
            continue

        kept: list[str] = []
        for selector in split_selectors(selector_part):
            classes = re.findall(r"\.(-?[A-Za-z_][\w-]*)", selector)
            if any(name in dead for name in classes):
                removed.append(selector.strip())
                continue
            kept.append(selector)
        if not kept:
            if comment_prefix.strip():
                out.append(comment_prefix)
            continue
        if len(kept) == len(split_selectors(selector_part)):
            out.append(raw)
        else:
            out.append(f"{comment_prefix}{','.join(kept)}{{{body}}}")
    return "".join(out)


def main() -> int:
    css = CSS.read_text(encoding="utf-8")
    # Selectors nested in @media blocks are indented, so allow leading space.
    defined = set(re.findall(r"^\s*\.(-?[A-Za-z_][\w-]*)", css, flags=re.MULTILINE))
    defined |= set(re.findall(r",\s*\.(-?[A-Za-z_][\w-]*)", css))
    sources = source_text()
    dead = {
        name
        for name in defined
        if not re.search(rf"\b{re.escape(name)}\b", sources)
    }
    removed: list[str] = []
    pruned = prune(css, dead, removed)
    print(f"defined={len(defined)} dead={len(dead)} selectors_removed={len(removed)}")
    print("dead classes:", ", ".join(sorted(dead)))
    if "--check" in sys.argv:
        return 0
    CSS.write_text(pruned, encoding="utf-8")
    print(f"lines: before={css.count(chr(10))} after={pruned.count(chr(10))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
