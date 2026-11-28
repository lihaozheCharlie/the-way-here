"""Resolve the active knowledge base inside a multi-library Vault workspace.

Content roots: user content (wiki/sources) may live under an external content
root declared in the workspace config (`storage.contentRoot`, optionally
overridden per knowledge base, literal `workspace` anchors back to the
workspace). Desktop launches export the resolved absolute path as
THE_WAY_HERE_CONTENT_ROOT so command-line tools stay usable without a shell
environment. App resources such as skills/tools always resolve against the
workspace root.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = WORKSPACE_ROOT / "the-way-here.config.yaml"


def _config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    value = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    if not isinstance(value, dict):
        raise RuntimeError("the-way-here.config.yaml 顶层必须是对象")
    return value


def _expand_home(value: str) -> Path:
    if value == "~":
        return Path.home()
    if value.startswith("~/") or value.startswith("~\\"):
        return Path.home() / value[2:]
    return Path(value)


def _content_root(entry: object) -> Path | None:
    if not isinstance(entry, dict):
        return None
    value = entry.get("contentRoot")
    if value is None:
        return None
    if value == "workspace":
        return WORKSPACE_ROOT
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError("配置 storage.contentRoot 必须是绝对路径或 workspace")
    resolved = _expand_home(value.strip()).expanduser()
    if not resolved.is_absolute():
        raise RuntimeError("配置 storage.contentRoot 必须是绝对路径或 workspace")
    resolved = resolved.resolve()
    if resolved == WORKSPACE_ROOT or WORKSPACE_ROOT in resolved.parents or resolved in WORKSPACE_ROOT.parents:
        raise RuntimeError("配置 storage.contentRoot 不能位于工作区内或包含工作区")
    return resolved


def _workspace_path(value: str, label: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        raise RuntimeError(f"{label} 必须使用相对路径")
    resolved = (CONTENT_ROOT / path).resolve()
    if resolved != CONTENT_ROOT and CONTENT_ROOT not in resolved.parents:
        raise RuntimeError(f"{label} 超出内容根边界")
    return resolved


CONFIG = _config()
BASES = CONFIG.get("knowledgeBases") or {}
if BASES and not isinstance(BASES, dict):
    raise RuntimeError("knowledgeBases 必须是对象")

KNOWLEDGE_BASE_ID = os.environ.get("THE_WAY_HERE_KNOWLEDGE_BASE") or CONFIG.get("defaultKnowledgeBase") or next(iter(BASES), "demo")
if BASES and KNOWLEDGE_BASE_ID not in BASES:
    raise RuntimeError(f"知识库不存在：{KNOWLEDGE_BASE_ID}")

selected = BASES.get(KNOWLEDGE_BASE_ID, {}) if BASES else {}
if not isinstance(selected, dict):
    raise RuntimeError(f"知识库 {KNOWLEDGE_BASE_ID} 的配置必须是对象")

declared = _content_root(selected.get("storage")) or _content_root(CONFIG.get("storage"))
if declared is None:
    exported = os.environ.get("THE_WAY_HERE_CONTENT_ROOT")
    if exported:
        exported_path = _expand_home(exported).expanduser().resolve()
        if not exported_path.is_absolute():
            raise RuntimeError("THE_WAY_HERE_CONTENT_ROOT 必须是绝对路径")
        declared = exported_path
CONTENT_ROOT = declared or WORKSPACE_ROOT

paths = {**(CONFIG.get("paths") or {}), **(selected.get("paths") or {})}
WIKI_ROOT = _workspace_path(str(paths.get("wiki", "wiki")), f"{KNOWLEDGE_BASE_ID}.paths.wiki")
SOURCES_ROOT = _workspace_path(str(paths.get("sources", "sources")), f"{KNOWLEDGE_BASE_ID}.paths.sources")
if WIKI_ROOT.parent != SOURCES_ROOT.parent:
    raise RuntimeError(f"知识库 {KNOWLEDGE_BASE_ID} 的 Wiki 与来源目录必须位于同一个库根目录")
KNOWLEDGE_BASE_ROOT = WIKI_ROOT.parent


if not KNOWLEDGE_BASE_ROOT.is_dir():
    raise RuntimeError(f"知识库目录不存在：{KNOWLEDGE_BASE_ROOT}")
