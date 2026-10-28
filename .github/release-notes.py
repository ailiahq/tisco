#!/usr/bin/env python3
"""Print the CHANGELOG.md section for one version, for use as GitHub release notes.

usage: release-notes.py <version> [repo]   (version without the leading "v")

Matches "## 0.3.1", "## [0.3.1]" and "## [0.3.1] · 2026-10-28" headings. When a
repo (owner/name) is given and the previous version is in the changelog, a
"full diff" compare link is appended. Exits 1 if the version has no section.
"""
import re
import sys
from pathlib import Path

version = sys.argv[1].lstrip("v")
repo = sys.argv[2] if len(sys.argv) > 2 else None
text = Path("CHANGELOG.md").read_text()

heading = re.compile(r"^## \[?(\d+\.\d+\.\d+[^\]\s]*)\]?.*$", re.M)
matches = list(heading.finditer(text))
versions = [m.group(1) for m in matches]
if version not in versions:
    sys.exit(f"no changelog section for {version}")

i = versions.index(version)
start = matches[i].end()
end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
body = text[start:end]
# drop reference-style link definitions ("[0.5.1]: https://...") at the bottom
body = re.sub(r"^\[[^\]]+\]:\s*\S+\s*$", "", body, flags=re.M).strip()

if repo and i + 1 < len(matches):
    prev = versions[i + 1]
    body += f"\n\n**full diff:** https://github.com/{repo}/compare/v{prev}...v{version}"

print(body)
