#!/usr/bin/env python3
"""Report judgment lines that carry neither a link nor a source marker."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from source_manifest import ManifestError, compare, load_manifest, scan
from vault_context import KNOWLEDGE_BASE_ID, KNOWLEDGE_BASE_ROOT, WIKI_ROOT


# 判断句带上其中任意一个标记，或任意链接，就算可追溯。
MARKERS = ("推断", "待查", "原文", "来源")
MIN_LENGTH = 15
REPORT_TEXT_LIMIT = 80
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}(?:\s|$)")
FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
TABLE_RE = re.compile(r"^\s*\|")
RULE_RE = re.compile(r"^\s{0,3}(?:[-*_][ \t]*){3,}$")
REFERENCE_RE = re.compile(r"^\s{0,3}\[[^\]]+\]:[ \t]")
COMMENT_RE = re.compile(r"<!--.*?-->")
QUOTE_RE = re.compile(r"^(?:>\s?)+")
CALLOUT_RE = re.compile(r"^\[![^\]]*\][+-]?\s*")
LIST_RE = re.compile(r"^(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?")
WIKILINK_RE = re.compile(r"\[\[[^\]]+\]\]")
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]*\]\([^)]+\)")
FRONTMATTER_OPEN = "---\n"
FRONTMATTER_CLOSE = "\n---\n"


def frontmatter_lines(text: str) -> int:
    """Number of leading lines taken by the YAML frontmatter (0 when absent)."""
    if not text.startswith(FRONTMATTER_OPEN):
        return 0
    end = text.find(FRONTMATTER_CLOSE, 4)
    if end == -1:
        return 0
    return text.count("\n", 0, end + len(FRONTMATTER_CLOSE))


def strip_comment(line: str, in_comment: bool) -> tuple[str, bool]:
    """Drop HTML comment text; comments may open and close on different lines."""
    if in_comment:
        if "-->" not in line:
            return "", True
        line = line.split("-->", 1)[1]
        in_comment = False
    while "<!--" in line:
        before, _, after = line.partition("<!--")
        if "-->" not in after:
            return before, True
        line = before + after.split("-->", 1)[1]
    return line, in_comment


def judgment_lines(text: str) -> list[tuple[int, str]]:
    """Return (line number, text) for every judgment line in the body.

    A judgment line is a list item or a paragraph of at least MIN_LENGTH characters.
    Headings, blank lines, tables, code fences and comments are not judgments.
    """
    lines = text.splitlines()
    fence = ""
    in_comment = False
    found: list[tuple[int, str]] = []
    for index in range(frontmatter_lines(text), len(lines)):
        line = lines[index]
        marker = FENCE_RE.match(line)
        if marker:
            if not fence:
                fence = marker.group(1)
            elif marker.group(1)[0] == fence[0] and len(marker.group(1)) >= len(fence):
                fence = ""
            continue
        if fence:
            continue
        line, in_comment = strip_comment(line, in_comment)
        stripped = line.strip()
        if not stripped:
            continue
        if HEADING_RE.match(line) or TABLE_RE.match(line) or RULE_RE.match(line):
            continue
        if REFERENCE_RE.match(line):
            continue
        text_line = QUOTE_RE.sub("", line.lstrip())
        text_line = CALLOUT_RE.sub("", text_line, count=1)
        text_line = LIST_RE.sub("", text_line.lstrip(), count=1).strip()
        if len(text_line) < MIN_LENGTH:
            continue
        found.append((index + 1, text_line))
    return found


def has_trace(line: str) -> bool:
    if WIKILINK_RE.search(line) or MARKDOWN_LINK_RE.search(line):
        return True
    return any(marker in line for marker in MARKERS)


def changed_pages(target: Path) -> tuple[list[Path], int]:
    """Wiki pages added or rewritten since the snapshot, plus metadata-only edits.

    A page whose body hash is unchanged is not examined: the tag tool rewrites
    frontmatter, and that never adds a judgment.
    """
    changes = compare(load_manifest(target)["wiki"], scan(WIKI_ROOT))
    names = sorted(changes["added"] + changes["changed"])
    pages = [WIKI_ROOT / name for name in names if name.lower().endswith(".md")]
    return pages, len(changes["metadata_only"])


def explicit_pages(raw_paths: list[str]) -> list[Path]:
    pages: list[Path] = []
    for raw in raw_paths:
        given = Path(raw)
        if given.is_absolute():
            candidates = [given]
        else:
            candidates = [Path.cwd() / given, KNOWLEDGE_BASE_ROOT / given]
        page = next((item.resolve() for item in candidates if item.is_file()), None)
        if page is None:
            raise ManifestError(f"页面不存在：{raw}")
        if not page.is_relative_to(WIKI_ROOT):
            raise ManifestError(f"不是当前知识库 {KNOWLEDGE_BASE_ID} 的 wiki 页面：{raw}")
        if page not in pages:
            pages.append(page)
    return pages


def report(pages: list[Path]) -> tuple[list[str], int]:
    findings: list[str] = []
    examined = 0
    for page in sorted(set(pages)):
        judgments = judgment_lines(page.read_text(encoding="utf-8", errors="replace"))
        examined += len(judgments)
        relative = page.relative_to(KNOWLEDGE_BASE_ROOT).as_posix()
        for number, line in judgments:
            if has_trace(line):
                continue
            if len(line) > REPORT_TEXT_LIMIT:
                line = line[: REPORT_TEXT_LIMIT - 1] + "…"
            findings.append(f"{relative}:{number}: {line}")
    return findings, examined


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report judgment lines without a link or a source marker."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--since",
        metavar="MANIFEST",
        help="Examine only wiki pages whose body changed since this source_manifest.py snapshot.",
    )
    mode.add_argument(
        "--files",
        nargs="+",
        metavar="PAGE",
        help="Examine these wiki pages directly.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 when an examined page has an untraced judgment line.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.since:
            pages, metadata_only = changed_pages(Path(args.since))
        else:
            pages, metadata_only = explicit_pages(args.files), 0
        findings, examined = report(pages)
    except ManifestError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2
    if findings:
        print("UNTRACED")
        print("\n".join(findings))
    since = f" metadata_only={metadata_only}" if args.since else ""
    print(
        f"pages={len(pages)} judgments={examined} untraced={len(findings)}{since} "
        f"strict={str(args.strict).lower()}"
    )
    return 1 if args.strict and findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
