#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR

python3 - <<'PY'
from __future__ import annotations

import os
import re
from pathlib import Path

root = Path(os.environ["ROOT_DIR"]).resolve()

include_paths = [
    root / "AGENTS.md",
    root / "CLAUDE.md",
    root / "AI.md",
    root / "ANTIGRAVITY.md",
    root / "CONTRIBUTING.md",
    root / "README.md",
    root / "backend" / "AGENTS.md",
    root / "backend" / "CLAUDE.md",
    root / "backend" / "TESTING.md",
    root / "frontend" / "AGENTS.md",
    root / "frontend" / "CLAUDE.md",
    root / "frontend" / "AI.md",
    root / "frontend" / "README.md",
]

for p in (root / "docs").rglob("*.md"):
    rel = p.relative_to(root)
    if str(rel).startswith("docs/plans/"):
        continue
    include_paths.append(p)

link_re = re.compile(r"\[[^\]]+\]\(([^)]+)\)")

bad: list[tuple[Path, str]] = []

for path in include_paths:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    in_fence = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for raw_target in link_re.findall(line):
            target = raw_target.strip().split("#", 1)[0]
            target = target.strip("<>")
            if not target or target.startswith("http") or target.startswith("mailto:"):
                continue
            if target.startswith("#"):
                continue
            if target.startswith("/"):
                resolved = root / target.lstrip("/")
            else:
                resolved = (path.parent / target).resolve()
            if not resolved.exists():
                bad.append((path.relative_to(root), target))

if bad:
    print("broken markdown links found:")
    for p, target in bad:
        print(f"- {p}: {target}")
    raise SystemExit(1)

print("documentation links check passed")
PY
