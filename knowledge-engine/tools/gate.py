#!/usr/bin/env python3
"""Run the quality-gate checks in order and report the verdict as an exit code."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


DEFAULT_KNOWLEDGE_BASE = "demo"
SUMMARY_FORMAT = "the-way-here/gate-summary"
SUMMARY_VERSION = 1
TOOL = "knowledge-engine/tools/gate.py"
RUFF_COMMAND = ["uvx", "ruff", "check", "knowledge-engine"]
TAGS_SCRIPT = "update_obsidian_tags.py"
LINKS_SCRIPT = "validate_wiki_links.py"
SKILLS_SCRIPT = "validate_skill_system.py"
RULE_TABLE_SCRIPT = "check_rule_table.py"
AUDIT_SCRIPTS = ("diary_entity_audit.py", "diary_entity_deep_audit.py")
TRACEABILITY_SCRIPT = "check_traceability.py"
STEP_TIMEOUT_SECONDS = 600
DETAIL_LINE_LIMIT = 40
TAGS_SUMMARY_RE = re.compile(r"^\s*updated=(\d+)\s+scanned=(\d+)\s*$", re.MULTILINE)
LINK_COUNT_RES = {
    "missing": re.compile(r"(?<!\w)missing=(\d+)"),
    "ambiguous": re.compile(r"(?<!\w)ambiguous=(\d+)"),
}
UNTRACED_RE = re.compile(r"(?<!\w)untraced=(\d+)")
RUFF_FOUND_RE = re.compile(r"^Found (\d+) errors?", re.MULTILINE)
# check_traceability.py 的问题行形如 "wiki/某页.md:21: 判断句"。
FINDING_RE = re.compile(r"^.+:\d+: ")


class GateError(RuntimeError):
    pass


@dataclass
class Run:
    argv: list[str]
    exit_code: int | None
    stdout: str
    stderr: str
    error: str = ""
    seconds: float = 0.0

    def lines(self) -> list[str]:
        return [line for line in (self.stdout + self.stderr).splitlines() if line.strip()]


@dataclass
class Step:
    name: str
    command: str
    passed: bool
    detail: str
    output: list[str] = field(default_factory=list)
    runs: list[Run] = field(default_factory=list)

    def clipped_output(self) -> list[str]:
        if len(self.output) <= DETAIL_LINE_LIMIT:
            return self.output
        return self.output[:DETAIL_LINE_LIMIT] + [
            f"…（已截断，共 {len(self.output)} 行）"
        ]


def execute(argv: list[str], workspace: Path, env: Mapping[str, str]) -> Run:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            argv,
            cwd=workspace,
            env=dict(env),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=STEP_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        return Run(argv, None, "", "", f"找不到可执行文件 {argv[0]}", 0.0)
    except subprocess.TimeoutExpired:
        return Run(argv, None, "", "", f"超过 {STEP_TIMEOUT_SECONDS} 秒未结束", STEP_TIMEOUT_SECONDS)
    except OSError as exc:
        return Run(argv, None, "", "", f"无法启动 {argv[0]}：{exc}", 0.0)
    seconds = time.monotonic() - started
    return Run(argv, completed.returncode, completed.stdout, completed.stderr, "", seconds)


def run_tool(script: str, arguments: list[str], workspace: Path, env: Mapping[str, str]) -> Run:
    path = workspace / "knowledge-engine" / "tools" / script
    return execute([sys.executable, str(path), *arguments], workspace, env)


def tool_command(script: str, arguments: list[str] | None = None) -> str:
    suffix = " ".join(["", *arguments]) if arguments else ""
    return f"python3 knowledge-engine/tools/{script}{suffix}"


def passed(
    name: str,
    command: str,
    detail: str,
    output: list[str] | None = None,
    runs: list[Run] | None = None,
) -> Step:
    return Step(name, command, True, detail, output or [], runs or [])


def failed(name: str, command: str, reason: str, runs: list[Run]) -> Step:
    output: list[str] = []
    for run in runs:
        output.extend(run.lines())
    return Step(name, command, False, reason, output, runs)


def step_ruff(workspace: Path, env: Mapping[str, str]) -> Step:
    name, command = "ruff", " ".join(RUFF_COMMAND)
    if shutil.which("uvx") is None:
        return failed(name, command, "PATH 里找不到 uvx，无法运行 ruff；门命令不跳过这一步", [])
    run = execute(RUFF_COMMAND, workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    if run.exit_code == 0:
        version = execute(["uvx", "ruff", "--version"], workspace, env)
        version_text = version.stdout.strip() if version.exit_code == 0 else ""
        return passed(name, command, version_text or "ruff 版本未知", runs=[run, version])
    found = RUFF_FOUND_RE.search(run.stdout)
    if run.exit_code == 1 and found:
        return failed(name, command, f"ruff 报告 {found.group(1)} 处问题", [run])
    last = run.lines()[-1] if run.lines() else "没有任何输出"
    return failed(name, command, f"ruff 无法运行（退出码 {run.exit_code}）：{last}", [run])


def step_tags(workspace: Path, env: Mapping[str, str]) -> Step:
    name, command = TAGS_SCRIPT[:-3], tool_command(TAGS_SCRIPT)
    runs = [run_tool(TAGS_SCRIPT, [], workspace, env), run_tool(TAGS_SCRIPT, [], workspace, env)]
    counts: list[tuple[int, int]] = []
    for index, run in enumerate(runs, 1):
        if run.error:
            return failed(name, command, f"第 {index} 次运行{run.error}", runs)
        if run.exit_code != 0:
            return failed(name, command, f"第 {index} 次运行退出码 {run.exit_code}", runs)
        match = TAGS_SUMMARY_RE.search(run.stdout)
        if match is None:
            return failed(name, command, f"第 {index} 次运行的输出里没有 updated=… scanned=…", runs)
        counts.append((int(match.group(1)), int(match.group(2))))
    first, second = counts
    detail = (
        f"第一次 updated={first[0]} scanned={first[1]}，"
        f"第二次 updated={second[0]} scanned={second[1]}"
    )
    if second[0] != 0:
        return failed(name, command, f"第二次运行 updated={second[0]}，标签更新没有收敛到 0", runs)
    hint = [f"提示：第一次运行改写了 {first[0]} 个文件，请检查这些改动"] if first[0] else []
    return passed(name, command, detail, hint, runs)


def step_links(workspace: Path, env: Mapping[str, str]) -> Step:
    name, command = LINKS_SCRIPT[:-3], tool_command(LINKS_SCRIPT)
    run = run_tool(LINKS_SCRIPT, [], workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    counts = {key: pattern.search(run.stdout) for key, pattern in LINK_COUNT_RES.items()}
    if not all(counts.values()):
        return failed(name, command, f"退出码 {run.exit_code}，输出里找不到 missing=… ambiguous=…", [run])
    detail = " ".join(f"{key}={counts[key].group(1)}" for key in LINK_COUNT_RES)
    clean = all(counts[key].group(1) == "0" for key in LINK_COUNT_RES)
    if run.exit_code != 0 or not clean:
        reason = f"退出码 {run.exit_code}，{detail}；要求退出码 0 且 missing=0 ambiguous=0"
        return failed(name, command, reason, [run])
    return passed(name, command, detail, runs=[run])


def step_skills(workspace: Path, env: Mapping[str, str]) -> Step:
    name, command = SKILLS_SCRIPT[:-3], tool_command(SKILLS_SCRIPT)
    run = run_tool(SKILLS_SCRIPT, [], workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    if run.exit_code != 0:
        return failed(name, command, f"退出码 {run.exit_code}", [run])
    summaries = [line for line in run.stdout.splitlines() if line.strip()]
    return passed(name, command, summaries[-1] if summaries else "没有输出", runs=[run])


def step_rule_table(workspace: Path, env: Mapping[str, str]) -> Step:
    name, command = RULE_TABLE_SCRIPT[:-3], tool_command(RULE_TABLE_SCRIPT)
    run = run_tool(RULE_TABLE_SCRIPT, [], workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    summaries = [line for line in run.stdout.splitlines() if line.strip()]
    if run.exit_code == 0:
        return passed(name, command, summaries[-1] if summaries else "没有输出", runs=[run])
    details = [line for line in run.stderr.splitlines() if line.strip()][:DETAIL_LINE_LIMIT]
    return failed(name, command, "有硬规则没登记，或登记的脚本不存在", details, [run])


def step_audit(script: str, workspace: Path, env: Mapping[str, str], strict: bool) -> Step:
    name, command = f"{script[:-3]} --check", tool_command(script, ["--check"])
    run = run_tool(script, ["--check"], workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    if run.exit_code == 0:
        return passed(name, command, "生成索引是最新的", runs=[run])
    stale = [line for line in run.stdout.splitlines() if line.startswith("stale ")]
    if not stale:
        return failed(name, command, f"退出码 {run.exit_code}，但没有 stale 行，按脚本报错处理", [run])
    hint = "生成索引可能陈旧，需要重新生成时运行 --write"
    if strict:
        return failed(name, command, f"{hint}（--strict 下算失败）", [run])
    return passed(name, command, f"提示：{hint}，不算失败", stale, [run])


def step_traceability(manifest: str, workspace: Path, env: Mapping[str, str], strict: bool) -> Step:
    arguments = ["--since", manifest, *(["--strict"] if strict else [])]
    name = f"{TRACEABILITY_SCRIPT[:-3]} --since {manifest}"
    command = tool_command(TRACEABILITY_SCRIPT, arguments)
    run = run_tool(TRACEABILITY_SCRIPT, arguments, workspace, env)
    if run.error:
        return failed(name, command, run.error, [run])
    untraced = UNTRACED_RE.search(run.stdout)
    if run.exit_code == 0:
        if untraced is None:
            return failed(name, command, "输出里找不到 untraced=…，无法判断", [run])
        count = int(untraced.group(1))
        findings = [line for line in run.stdout.splitlines() if FINDING_RE.match(line)]
        return passed(name, command, f"untraced={count}，仅报告", findings, [run])
    reason = f"退出码 {run.exit_code}" + (f"，untraced={untraced.group(1)}" if untraced else "")
    errors = [line for line in run.stderr.splitlines() if line.startswith("错误：")]
    if errors:
        reason += f"，{errors[0]}"
    return failed(name, command, reason, [run])


def build_steps(
    workspace: Path, env: Mapping[str, str], manifest: str | None, strict: bool
) -> list[tuple[str, Callable[[], Step]]]:
    steps: list[tuple[str, Callable[[], Step]]] = [
        (" ".join(RUFF_COMMAND), lambda: step_ruff(workspace, env)),
        (tool_command(TAGS_SCRIPT), lambda: step_tags(workspace, env)),
        (tool_command(LINKS_SCRIPT), lambda: step_links(workspace, env)),
        (tool_command(SKILLS_SCRIPT), lambda: step_skills(workspace, env)),
        (tool_command(RULE_TABLE_SCRIPT), lambda: step_rule_table(workspace, env)),
    ]
    for script in AUDIT_SCRIPTS:
        steps.append(
            (
                tool_command(script, ["--check"]),
                lambda script=script: step_audit(script, workspace, env, strict),
            )
        )
    if manifest is not None:
        arguments = ["--since", manifest, *(["--strict"] if strict else [])]
        steps.append(
            (
                tool_command(TRACEABILITY_SCRIPT, arguments),
                lambda: step_traceability(manifest, workspace, env, strict),
            )
        )
    return steps


def select_knowledge_base(explicit: str | None) -> str:
    inherited = os.environ.get("THE_WAY_HERE_KNOWLEDGE_BASE")
    knowledge_base = explicit or inherited or DEFAULT_KNOWLEDGE_BASE
    if knowledge_base != DEFAULT_KNOWLEDGE_BASE and explicit is None:
        raise GateError(
            f"环境变量选中了知识库 {knowledge_base!r}。门命令会改写标签，"
            f"只默认对 {DEFAULT_KNOWLEDGE_BASE!r} 库运行；"
            f"要对其他库运行，必须显式传 --kb {knowledge_base}"
        )
    return knowledge_base


def resolve_workspace(knowledge_base: str) -> Path:
    """vault_context 在导入时读取环境变量并定位知识库，所以要先设好再导入。"""
    os.environ["THE_WAY_HERE_KNOWLEDGE_BASE"] = knowledge_base
    try:
        import vault_context
    except RuntimeError as exc:
        raise GateError(str(exc)) from exc
    except ImportError as exc:
        raise GateError(f"无法加载 vault_context（{exc}）；请确认已安装 requirements.txt 里的依赖") from exc
    return vault_context.WORKSPACE_ROOT


def resolve_manifest(raw: str) -> str:
    path = Path(raw).resolve()
    if not path.is_file():
        raise GateError(f"--since 指向的 manifest 不存在：{raw}")
    return str(path)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_summary(workspace: Path, summary: dict[str, object]) -> Path:
    directory = workspace / "studio" / ".runtime" / "gate"
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = directory / f"wiki-{stamp}.json"
    index = 0
    while target.exists():
        index += 1
        target = directory / f"wiki-{stamp}-{index}.json"
    text = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    target.write_text(text, encoding="utf-8")
    return target


def print_step(step: Step) -> None:
    status = "PASS" if step.passed else "FAIL"
    detail = f"（{step.detail}）" if step.passed else f" {step.detail}"
    print(f"{status}: {step.name}{detail}", flush=True)
    for line in step.clipped_output():
        print(f"    {line}", flush=True)


def to_record(step: Step) -> dict[str, object]:
    return {
        "name": step.name,
        "command": step.command,
        "status": "pass" if step.passed else "fail",
        "detail": step.detail,
        "output": step.output,
        "runs": [
            {
                "argv": run.argv,
                "exitCode": run.exit_code,
                "error": run.error,
                "seconds": round(run.seconds, 3),
            }
            for run in step.runs
        ],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the quality-gate checks and report the verdict as an exit code."
    )
    parser.add_argument(
        "--kb",
        metavar="ID",
        help=f"Knowledge base to check (default: {DEFAULT_KNOWLEDGE_BASE}). Other bases need this flag.",
    )
    parser.add_argument(
        "--since",
        metavar="MANIFEST",
        help="Also run check_traceability.py on pages changed since this manifest.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat stale generated indexes and untraced judgments as failures.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the commands without running anything.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    strict = "true" if args.strict else "false"
    try:
        knowledge_base = select_knowledge_base(args.kb)
        workspace = resolve_workspace(knowledge_base)
        manifest = resolve_manifest(args.since) if args.since else None
    except GateError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2
    env = {**os.environ, "THE_WAY_HERE_KNOWLEDGE_BASE": knowledge_base}
    print(
        f"gate: 知识库={knowledge_base} strict={strict} since={manifest or '无'}",
        flush=True,
    )
    steps = build_steps(workspace, env, manifest, args.strict)
    if args.dry_run:
        print("dry-run：只打印命令，不执行，也不写摘要。")
        for command, _ in steps:
            print(command)
        return 0

    started_at = utc_now()
    results: list[Step] = []
    for _, run in steps:
        step = run()
        results.append(step)
        print_step(step)
    ok = all(step.passed for step in results)
    exit_code = 0 if ok else 1
    summary: dict[str, object] = {
        "format": SUMMARY_FORMAT,
        "version": SUMMARY_VERSION,
        "tool": TOOL,
        "knowledgeBase": knowledge_base,
        "strict": args.strict,
        "dryRun": False,
        "since": manifest,
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "ok": ok,
        "exitCode": exit_code,
        "steps": [to_record(step) for step in results],
    }
    try:
        written = write_summary(workspace, summary)
    except OSError as exc:
        print(f"FAIL: summary 无法写入摘要（{exc.strerror or exc}）", flush=True)
        return 1
    failed_count = sum(not step.passed for step in results)
    verdict = "PASS" if ok else "FAIL"
    print(
        f"gate: {verdict} 知识库={knowledge_base} 通过={len(results) - failed_count} "
        f"失败={failed_count} 摘要={written.relative_to(workspace)}",
        flush=True,
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
