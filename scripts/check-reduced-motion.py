"""Verify that motion-producing CSS has an explicit reduced-motion override."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_RULES = {
    "frontend/src/styles/controls.css": (
        (".custom-select__menu", "animation: none"),
    ),
    "frontend/src/styles/gallery.css": (
        (".batch-edit-toolbar__spinner", "animation: none"),
        (".gallery-thumbnail__skeleton", "animation: none"),
        (".gallery-thumbnail__image", "transition-duration: 0.01ms"),
    ),
    "frontend/src/styles/header.css": (
        (".header-library-status__icon", "animation: none"),
    ),
    "frontend/src/styles/navigation.css": (
        (".gallery-empty-state__spinner", "animation: none"),
        (".artist-sticky-nav__status .is-active", "animation: none"),
        (".viewer-month-index__loading", "animation: none"),
    ),
    "frontend/src/styles/settings.css": (
        (".settings-modal__library-status-icon.is-active", "animation: none"),
        (".settings-modal__picker-spinner", "animation: none"),
    ),
}


def reduced_motion_blocks(css: str) -> list[str]:
    marker = "@media (prefers-reduced-motion: reduce)"
    blocks: list[str] = []
    cursor = 0
    while True:
        marker_start = css.find(marker, cursor)
        if marker_start < 0:
            return blocks
        opening_brace = css.find("{", marker_start + len(marker))
        if opening_brace < 0:
            return blocks

        depth = 0
        for index in range(opening_brace, len(css)):
            if css[index] == "{":
                depth += 1
            elif css[index] == "}":
                depth -= 1
                if depth == 0:
                    blocks.append(css[opening_brace + 1:index])
                    cursor = index + 1
                    break
        else:
            return blocks


def main() -> int:
    failures: list[str] = []
    checked = 0
    for relative_path, rules in REQUIRED_RULES.items():
        path = ROOT / relative_path
        css = path.read_text(encoding="utf-8")
        blocks = reduced_motion_blocks(css)
        combined = "\n".join(blocks)
        if not blocks:
            failures.append(f"{relative_path}: missing reduced-motion media block")
            continue
        for selector, declaration in rules:
            checked += 1
            selector_pattern = re.escape(selector)
            declaration_pattern = re.escape(declaration)
            if not re.search(
                rf"{selector_pattern}[\s\S]*?{declaration_pattern}",
                combined,
            ):
                failures.append(
                    f"{relative_path}: {selector} lacks {declaration} in reduced-motion block"
                )

    if failures:
        print("Reduced-motion CSS contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    print(f"Reduced-motion CSS contract passed ({checked} selector/declaration rules).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
