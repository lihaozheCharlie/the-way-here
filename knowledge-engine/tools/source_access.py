"""Read registered source references without copying or modifying original files."""
from __future__ import annotations

import json
from pathlib import Path
import yaml
from vault_context import KNOWLEDGE_BASE_ROOT, SOURCES_ROOT, WORKSPACE_ROOT, selected

REFERENCE_ROOT = SOURCES_ROOT / "外部来源"

class SourceUnavailable(RuntimeError):
    pass


def metadata(path: Path) -> dict | None:
    try:
        path.relative_to(REFERENCE_ROOT)
    except ValueError:
        return None
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None
    try:
        data = yaml.safe_load(text.split("\n---", 1)[0][4:]) or {}
    except yaml.YAMLError:
        return None
    value = data.get("twh_external") if isinstance(data, dict) else None
    return value if isinstance(value, dict) else None


def original_identity(path: Path) -> Path | None:
    data = metadata(path)
    if data is None:
        if path.is_relative_to(REFERENCE_ROOT):
            raise SourceUnavailable("来源引用元数据缺失或无效")
        return None
    connection = next((item for item in selected.get("sourceConnections", []) if item.get("id") == data.get("connectionId")), None)
    if not connection:
        raise SourceUnavailable("来源目录已断开")
    directory = Path(connection["path"])
    relative = data.get("relativePath")
    if not directory.is_absolute() or not isinstance(relative, str) or Path(relative).is_absolute():
        raise SourceUnavailable("来源路径无效")
    if not path.is_relative_to(REFERENCE_ROOT / connection["id"]):
        raise SourceUnavailable("引用不属于这个目录连接")
    target = directory / relative
    if ".." in Path(relative).parts or not target.is_relative_to(directory):
        raise SourceUnavailable("来源路径越界")
    return target


def original_path(path: Path) -> Path | None:
    target = original_identity(path)
    if target is None:
        return None
    data = metadata(path)
    connection = next(item for item in selected.get("sourceConnections", []) if item.get("id") == data.get("connectionId"))
    directory = Path(connection["path"])
    try:
        if directory.resolve(strict=True) != directory or not target.resolve(strict=True).is_relative_to(directory):
            raise SourceUnavailable("来源目录被重定向或文件通过链接越界")
        if not target.is_file() or target.stat().st_size > 2 * 1024 * 1024:
            raise SourceUnavailable("来源不是可读取的文本文件或超过 2 MB")
    except OSError as error:
        raise SourceUnavailable("原文件暂不可用") from error
    return target


def read_source(path: Path) -> str:
    resolved = path.resolve()
    if not resolved.is_relative_to(SOURCES_ROOT):
        raise SourceUnavailable("只能读取当前知识库来源目录内的文件或已登记引用")
    original = original_path(path)
    return (original or resolved).read_text(encoding="utf-8", errors="replace")


def link_target(path: Path) -> str:
    return path.relative_to(KNOWLEDGE_BASE_ROOT).with_suffix("").as_posix()


def source_files(root: Path = SOURCES_ROOT):
    if not root.is_relative_to(SOURCES_ROOT):
        raise SourceUnavailable("来源搜索超出当前知识库")
    for path in sorted(root.rglob("*.md")):
        if any(part.startswith(".") for part in path.relative_to(SOURCES_ROOT).parts) or path.is_symlink():
            continue
        try:
            if not path.resolve().is_relative_to(SOURCES_ROOT):
                continue
            original_path(path)
        except SourceUnavailable:
            continue
        yield path


def diary_files():
    for path in source_files():
        original = original_identity(path) or path
        # Filename/folder or explicit metadata defines the source kind; no semantic guessing.
        if any("日记" in part for part in original.parts):
            yield path
            continue
        text = read_source(path)
        if text.startswith("---\n"):
            try:
                data = yaml.safe_load(text.split("\n---", 1)[0][4:]) or {}
                if isinstance(data, dict) and data.get("type") in {"diary", "journal", "日记"}:
                    yield path
            except yaml.YAMLError:
                pass


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", help="工作区相对路径或库内来源路径")
    args = parser.parse_args()
    requested = Path(args.reference)
    candidates = [(WORKSPACE_ROOT / requested).resolve(), (KNOWLEDGE_BASE_ROOT / requested).resolve()]
    path = next((item for item in candidates if item.is_file() and item.resolve().is_relative_to(SOURCES_ROOT)), None)
    if requested.is_absolute() or path is None:
        parser.error("请提供当前知识库中的来源引用路径")
    result = {"linkTarget": link_target(path), "referencePath": path.relative_to(WORKSPACE_ROOT).as_posix()}
    try:
        result.update(available=True, originalPath=str(original_path(path) or path), markdown=read_source(path))
    except SourceUnavailable as error:
        result.update(available=False, error=str(error))
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["available"] else 2

if __name__ == "__main__":
    raise SystemExit(main())
