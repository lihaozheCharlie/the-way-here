#!/usr/bin/env python3
"""Record or compare a content-hash manifest of the current knowledge base."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from vault_context import KNOWLEDGE_BASE_ID, SOURCES_ROOT, WIKI_ROOT, WORKSPACE_ROOT


MANIFEST_FORMAT = "the-way-here/source-manifest"
MANIFEST_VERSION = 1
# 两个内容目录。键名写进 manifest，比对时按名字取。
ROOTS = {"sources": SOURCES_ROOT, "wiki": WIKI_ROOT}
# 编辑器与系统产生的非内容文件；点开头的其余目录（如 .imports）仍算内容。
IGNORED_DIRS = {
    ".git",
    ".idea",
    ".obsidian",
    ".ruff_cache",
    ".trash",
    ".vscode",
    "__pycache__",
    "node_modules",
}
IGNORED_FILES = {".DS_Store", "Thumbs.db"}
IGNORED_SUFFIXES = (".swp", ".swo", "~")
FRONTMATTER_OPEN = b"---\n"
FRONTMATTER_CLOSE = b"\n---\n"
LABELS = (
    ("changed", "CHANGED"),
    ("removed", "REMOVED"),
    ("added", "ADDED"),
    ("metadata_only", "META"),
)
HASH_KEYS = ("sha256", "body_sha256")

# 相对目录根的路径 -> {sha256: 整个文件, body_sha256: 去掉 frontmatter 的正文}
Files = dict[str, dict[str, str]]


class ManifestError(RuntimeError):
    pass


def display_root(root: Path) -> str:
    try:
        return root.relative_to(WORKSPACE_ROOT).as_posix()
    except ValueError:
        return str(root)


def is_ignored(relative: Path) -> bool:
    if any(part in IGNORED_DIRS for part in relative.parts[:-1]):
        return True
    name = relative.name
    return name in IGNORED_FILES or name.endswith(IGNORED_SUFFIXES)


def content_hashes(path: Path) -> dict[str, str]:
    """Hash the whole file and its body.

    For Markdown the body excludes the YAML frontmatter, using the same split as
    update_obsidian_tags.py: the tag tool may rewrite frontmatter but never the body.
    """
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise ManifestError(f"无法读取文件：{path}（{exc.strerror or exc}）") from exc
    body = data
    if path.suffix.lower() == ".md" and data.startswith(FRONTMATTER_OPEN):
        end = data.find(FRONTMATTER_CLOSE, 4)
        if end != -1:
            body = data[end + len(FRONTMATTER_CLOSE) :]
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "body_sha256": hashlib.sha256(body).hexdigest(),
    }


def scan(root: Path) -> Files:
    """Map every content file under root, keyed by its path relative to root."""
    if not root.is_dir():
        raise ManifestError(f"目录不存在：{display_root(root)}")
    files: Files = {}
    for directory, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(name for name in dirnames if name not in IGNORED_DIRS)
        for name in sorted(filenames):
            path = Path(directory, name)
            if path.is_symlink() or is_ignored(path.relative_to(root)):
                continue
            files[path.relative_to(root).as_posix()] = content_hashes(path)
    return files


def write_manifest(target: Path) -> dict[str, Files]:
    files_by_root = {name: scan(root) for name, root in ROOTS.items()}
    manifest = {
        "format": MANIFEST_FORMAT,
        "version": MANIFEST_VERSION,
        "knowledgeBase": KNOWLEDGE_BASE_ID,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "roots": {
            name: {"path": display_root(ROOTS[name]), "files": files}
            for name, files in files_by_root.items()
        },
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_text(text, encoding="utf-8")
    except OSError as exc:
        raise ManifestError(f"无法写入 manifest：{target}（{exc.strerror or exc}）") from exc
    return files_by_root


def load_manifest(target: Path) -> dict[str, Files]:
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ManifestError(f"无法读取 manifest：{target}（{exc.strerror or exc}）") from exc
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest 不是合法 JSON：{target}（第 {exc.lineno} 行）") from exc
    if not isinstance(data, dict) or data.get("format") != MANIFEST_FORMAT:
        raise ManifestError(f"不是来源快照文件：{target}")
    if data.get("version") != MANIFEST_VERSION:
        raise ManifestError(
            f"manifest 版本 {data.get('version')!r} 不受支持，本工具支持 {MANIFEST_VERSION}"
        )
    if data.get("knowledgeBase") != KNOWLEDGE_BASE_ID:
        raise ManifestError(
            f"manifest 属于知识库 {data.get('knowledgeBase')!r}，"
            f"当前知识库是 {KNOWLEDGE_BASE_ID!r}；快照与比对必须绑定同一个知识库"
        )
    roots = data.get("roots")
    if not isinstance(roots, dict):
        raise ManifestError(f"manifest 缺少 roots：{target}")
    files_by_root: dict[str, Files] = {}
    for name in ROOTS:
        section = roots.get(name)
        files = section.get("files") if isinstance(section, dict) else None
        if not isinstance(files, dict):
            raise ManifestError(f"manifest 缺少 {name} 文件表：{target}")
        checked: Files = {}
        for relative, entry in files.items():
            if not isinstance(entry, dict) or not all(
                isinstance(entry.get(key), str) for key in HASH_KEYS
            ):
                raise ManifestError(f"manifest 的 {name} 文件表损坏：{relative}")
            checked[relative] = {key: entry[key] for key in HASH_KEYS}
        files_by_root[name] = checked
    return files_by_root


def compare(previous: Files, current: Files) -> dict[str, list[str]]:
    """Split files into changed, removed, added and metadata-only sets.

    "changed" means the body hash differs; a differing whole-file hash alone is
    "metadata_only" (frontmatter rewritten, body intact).
    """
    added = sorted(set(current) - set(previous))
    removed = sorted(set(previous) - set(current))
    changed: list[str] = []
    metadata_only: list[str] = []
    for name in sorted(set(previous) & set(current)):
        if previous[name]["body_sha256"] != current[name]["body_sha256"]:
            changed.append(name)
        elif previous[name]["sha256"] != current[name]["sha256"]:
            metadata_only.append(name)
    return {
        "changed": changed,
        "removed": removed,
        "added": added,
        "metadata_only": metadata_only,
    }


def snapshot(target: Path) -> int:
    files_by_root = write_manifest(target)
    counts = " ".join(f"{name}={len(files)}" for name, files in files_by_root.items())
    print(f"snapshot knowledge_base={KNOWLEDGE_BASE_ID} {counts} file={target}")
    return 0


def check(target: Path) -> int:
    files_by_root = load_manifest(target)
    violated = False
    for name, root in ROOTS.items():
        changes = compare(files_by_root[name], scan(root))
        summary = " ".join(f"{key}={len(values)}" for key, values in changes.items())
        print(f"{name}: {summary}")
        for key, label in LABELS:
            for relative in changes[key]:
                print(f"{label:<8}{name}/{relative}")
        if name == "sources" and (changes["changed"] or changes["removed"]):
            violated = True
    if violated:
        print(
            "sources 下有文件的正文被改写或被删除。原始笔记正文不应被改写。",
            file=sys.stderr,
        )
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record or compare a content-hash manifest of the knowledge base."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--snapshot",
        metavar="FILE",
        help="Record the current sources and wiki hashes to FILE (replaced if it exists).",
    )
    mode.add_argument(
        "--check",
        metavar="FILE",
        help="Compare the current state with FILE; exit 1 when a source body changed.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = Path(args.snapshot or args.check)
    try:
        if args.snapshot:
            return snapshot(target)
        return check(target)
    except ManifestError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
