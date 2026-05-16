#!/usr/bin/env python3
"""Asset-reference check.

Scans every HTML file in the repo and verifies that each local asset it
references (href, src, CSS url(...), etc.) actually exists on disk. Prevents
the failure mode where a page references /downloads/foo.pdf or /images/bar.png
that was never committed, so the deploy ships a broken page.

Run locally:
    python scripts/check-asset-references.py

Exits 0 if every reference resolves, 1 if anything is missing.
"""
from __future__ import annotations

import os
import re
import sys
from typing import Iterable

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directories never scanned and never resolved against.
EXCLUDE_DIRS = {
    'node_modules', '.git', '.next', 'dist', '.vercel',
    '__pycache__', 'test-results', 'playwright-report',
    'tests',  # test fixtures aren't shipped
    '_drafts',  # convention: drafts not deployed
}

# Reference patterns we look for inside HTML.
#   - href="..."  src="..."  on any tag
#   - url(...)    inside <style> / inline style
REF_PATTERN = re.compile(
    r'''(?:href|src)\s*=\s*["']([^"']+)["']'''
    r'''|url\(\s*["']?([^"')]+)["']?\s*\)''',
    re.IGNORECASE,
)

# <script>...</script> and <!-- ... --> blocks contain references that aren't
# asset paths (e.g. URL.createObjectURL(blob), Blotato API endpoints, JS code).
# Strip them before regex matching so we don't false-positive on JS strings.
SCRIPT_OR_COMMENT_PATTERN = re.compile(
    r'<script\b[^>]*>.*?</script>|<!--.*?-->',
    re.IGNORECASE | re.DOTALL,
)


def strip_noise(html: str) -> str:
    """Remove <script> blocks and HTML comments, preserving line count."""
    def replacement(match: re.Match) -> str:
        # Keep newlines so line numbers in the rest of the file stay accurate.
        return '\n' * match.group(0).count('\n')
    return SCRIPT_OR_COMMENT_PATTERN.sub(replacement, html)

# Schemes / prefixes that mean "not a local file".
EXTERNAL_PREFIXES = (
    'http://', 'https://', '//',
    'mailto:', 'tel:', 'javascript:', 'data:',
)


def iter_html_files(root: str) -> Iterable[str]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fname in filenames:
            if fname.endswith('.html'):
                yield os.path.join(dirpath, fname)


def is_external(ref: str) -> bool:
    r = ref.strip().lower()
    return any(r.startswith(p) for p in EXTERNAL_PREFIXES) or r.startswith('#')


def resolve_local(ref: str, html_path: str, repo_root: str) -> str | None:
    """Return the absolute filesystem path the reference *should* resolve to.

    Returns None if the reference is purely an in-page anchor or otherwise
    not a file reference.
    """
    # Strip query string and fragment — Vercel routes ignore them.
    ref = ref.split('#', 1)[0].split('?', 1)[0]
    if not ref:
        return None

    if ref.startswith('/'):
        # Site-rooted reference.
        rel = ref.lstrip('/')
        candidate = os.path.join(repo_root, rel)
    else:
        # Document-relative reference. Resolve against the HTML file's dir.
        candidate = os.path.normpath(os.path.join(os.path.dirname(html_path), ref))

    # If the candidate exists directly, we're done.
    if os.path.exists(candidate):
        return candidate

    # Vercel-style directory route: /foo/ or /foo → foo/index.html
    if os.path.isdir(candidate):
        index_html = os.path.join(candidate, 'index.html')
        if os.path.exists(index_html):
            return index_html

    index_html = candidate + ('' if candidate.endswith(os.sep) else os.sep) + 'index.html'
    index_html = os.path.normpath(index_html)
    if os.path.exists(index_html):
        return index_html

    # Not found.
    return candidate


def check() -> int:
    missing: dict[str, list[tuple[int, str, str]]] = {}
    total_refs = 0

    for html_path in iter_html_files(REPO_ROOT):
        rel_html = os.path.relpath(html_path, REPO_ROOT).replace(os.sep, '/')
        with open(html_path, 'r', encoding='utf-8', errors='replace') as fp:
            html = fp.read()
        cleaned = strip_noise(html)
        for line_num, line in enumerate(cleaned.split('\n'), start=1):
            for match in REF_PATTERN.finditer(line):
                ref = match.group(1) or match.group(2)
                if not ref or is_external(ref):
                    continue
                total_refs += 1
                resolved = resolve_local(ref, html_path, REPO_ROOT)
                if resolved is None:
                    continue
                if not os.path.exists(resolved):
                    missing.setdefault(rel_html, []).append((line_num, ref, resolved))

    if not missing:
        print(f'OK  {total_refs:,} local references checked across all HTML files. All resolve.')
        return 0

    print('FAIL  Missing asset references:\n')
    count = 0
    for html_file in sorted(missing):
        print(f'  {html_file}')
        for line_num, ref, expected in sorted(missing[html_file]):
            rel_expected = os.path.relpath(expected, REPO_ROOT).replace(os.sep, '/')
            print(f'    line {line_num}: {ref}  (expected: {rel_expected})')
            count += 1
        print()
    print(f'{count} missing reference(s) across {len(missing)} file(s). Total checked: {total_refs:,}.')
    return 1


if __name__ == '__main__':
    sys.exit(check())
