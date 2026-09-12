#!/usr/bin/env python3
"""Validate Obsidian wiki links across the vault."""

from __future__ import annotations

import re
import sys
import yaml
from collections import defaultdict
from pathlib import Path

from vault_context import KNOWLEDGE_BASE_ROOT, WORKSPACE_ROOT, SOURCES_ROOT
from source_access import read_source, original_identity, SourceUnavailable


ROOT = KNOWLEDGE_BASE_ROOT
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


def md_files() -> list[Path]:
    skipped = {".obsidian", ".idea"}
    knowledge_files = {
        p
        for p in ROOT.rglob("*.md")
        if not any(part in skipped or part.startswith(".") for part in p.relative_to(ROOT).parts)
        and not p.is_symlink() and p.resolve().is_relative_to(ROOT)
    }
    shared_files = set((WORKSPACE_ROOT / "knowledge-engine/skills").rglob("*.md"))
    shared_files.add(WORKSPACE_ROOT / "AGENTS.md")
    return sorted(path for path in knowledge_files | shared_files if path.exists())


def scoped_relative(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path.relative_to(WORKSPACE_ROOT)


def normalize_target(raw: str) -> str:
    target = raw.split("|", 1)[0].split("#", 1)[0].strip()
    target = target.replace("\\", "/").strip("/")
    if target.lower().endswith(".md"):
        target = target[:-3]
    return target


def candidates_for(path: Path) -> set[str]:
    rel_path = scoped_relative(path)
    rel = rel_path.with_suffix("").as_posix() if rel_path.suffix == ".md" else rel_path.as_posix()
    candidates = {rel, path.stem, path.relative_to(WORKSPACE_ROOT).with_suffix("").as_posix()}
    try:
        original = original_identity(path) if path.is_relative_to(SOURCES_ROOT) else None
        if original:
            candidates.add(original.stem)
    except SourceUnavailable:
        pass
    if rel.startswith("knowledge-engine/"):
        candidates.add(rel.removeprefix("knowledge-engine/"))
    return candidates


def content_for(path: Path) -> str:
    if path.is_relative_to(SOURCES_ROOT):
        try:
            return read_source(path)
        except SourceUnavailable:
            pass
    return path.read_text(encoding="utf-8", errors="replace")


def aliases_for(path: Path) -> set[str]:
    text = content_for(path)
    if not text.startswith("---\n"):
        return set()
    try:
        data = yaml.safe_load(text.split("\n---", 1)[0][4:]) or {}
        aliases = data.get("aliases", []) if isinstance(data, dict) else []
        return {str(value) for value in aliases} if isinstance(aliases, list) else set()
    except yaml.YAMLError:
        return set()


def strip_md_suffix(path: Path) -> str:
    rel = scoped_relative(path)
    if rel.suffix == ".md":
        rel = rel.with_suffix("")
    return rel.as_posix()


def main() -> int:
    files = md_files()
    by_key_sets: dict[str, set[Path]] = defaultdict(set)
    for path in files:
        for key in candidates_for(path):
            by_key_sets[key.lower()].add(path)
        for alias in aliases_for(path):
            by_key_sets[alias.lower()].add(path)
    by_key = {key: sorted(paths) for key, paths in by_key_sets.items()}

    original_keys: dict[str, list[Path]] = defaultdict(list)
    for path in files:
        try:
            original = original_identity(path) if path.is_relative_to(SOURCES_ROOT) else None
            if original:
                original_keys[str(original.with_suffix("")).lower()].append(path)
        except SourceUnavailable:
            pass

    missing: list[tuple[Path, str]] = []
    ambiguous: list[tuple[Path, str, list[Path]]] = []

    for path in files:
        text = content_for(path)
        for match in WIKILINK_RE.finditer(text):
            target = normalize_target(match.group(1))
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved: list[Path] = []
            # Resolve a source's relative links in its original directory before global aliases.
            try:
                original = original_identity(path) if path.is_relative_to(SOURCES_ROOT) else None
                if original and not target.startswith(("wiki/", "sources/", "原始知识库/", "app/", "vault/")):
                    original_target = (original.parent / target).resolve()
                    if original_target.suffix.lower() in {".md", ".txt"}:
                        original_target = original_target.with_suffix("")
                    resolved = original_keys.get(str(original_target).lower(), [])
            except SourceUnavailable:
                pass
            if resolved:
                pass
            elif target.startswith("."):
                rel = (path.parent / target).resolve()
                try:
                    rel_key = strip_md_suffix(rel)
                    resolved = by_key.get(rel_key.lower(), [])
                except ValueError:
                    resolved = []
            elif "/" in target:
                resolved = by_key.get(target.lower(), [])
                if not resolved and ((ROOT / target).is_dir() or (WORKSPACE_ROOT / target).is_dir()):
                    resolved = [ROOT / target if (ROOT / target).is_dir() else WORKSPACE_ROOT / target]
            else:
                resolved = by_key.get(target.lower(), [])
            if not resolved:
                missing.append((path, target))
            elif len(resolved) > 1:
                ambiguous.append((path, target, resolved))

    print(f"files={len(files)} missing={len(missing)} ambiguous={len(ambiguous)}")
    if missing:
        print("\nMISSING")
        for path, target in missing[:300]:
            print(f"{scoped_relative(path)} -> {target}")
    if ambiguous:
        print("\nAMBIGUOUS")
        for path, target, resolved in ambiguous[:300]:
            choices = ", ".join(scoped_relative(p).as_posix() for p in resolved[:5])
            print(f"{scoped_relative(path)} -> {target} :: {choices}")

    return 1 if missing or ambiguous else 0


if __name__ == "__main__":
    sys.exit(main())
