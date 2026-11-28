"""规则表校验：知识引擎的 Skill 里每条硬规则都登记了谁在强制它，登记的脚本必须存在。

只靠文字、没有机器检查的规则在表里写"文字"，让它一眼可见。
用法：python3 knowledge-engine/tools/check_rule_table.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = [ROOT / "knowledge-engine/skills/common/quality-gate/SKILL.md"]
TRIGGER = re.compile(r"必须|不得|不能|禁止|严禁|不许|不要|不提交|不写入")
TAG = re.compile(r"〔([A-Z]-\d+)〕")
ROW = re.compile(r"^\|\s*([A-Z]-\d+)\s*\|(.+?)\|(.+?)\|\s*$")
SCRIPT = re.compile(r"[\w./-]+\.(?:py|sh)$")


def main() -> int:
    problems: list[str] = []
    total = 0
    prose = 0
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        lines = text.split("\n")
        name = path.relative_to(ROOT).as_posix()
        tagged: dict[str, int] = {}
        fenced = False
        for number, raw in enumerate(lines, 1):
            if raw.strip().startswith("```"):
                fenced = not fenced
                continue
            if fenced or ROW.match(raw.strip()):
                continue
            ids = [match.group(1) for match in TAG.finditer(raw)]
            for rule_id in ids:
                tagged[rule_id] = number
            if TRIGGER.search(raw) and not ids:
                hint = raw.strip()[:60]
                problems.append(f"{name}:{number}: 这行有硬规则，但没有规则编号。加〔W-xx〕并在规则表里登记：{hint}")
        if "## 规则表" not in text:
            problems.append(f"{name}: 缺少 ## 规则表 小节。")
        for match in filter(None, (ROW.match(line.strip()) for line in lines)):
            rule_id, _rule, by = match.groups()
            how = by.strip()
            total += 1
            if rule_id not in tagged:
                problems.append(f"{name}: 规则表里的 {rule_id} 在正文里找不到对应的〔{rule_id}〕。")
            if how.startswith("结构"):
                continue
            if how.startswith("文字"):
                prose += 1
                continue
            commands = re.findall(r"`([^`]+)`", how)
            if not commands:
                problems.append(f"{name}: {rule_id} 的强制方式要写‘结构：…’、‘文字’，或一条放在反引号里的命令。")
                continue
            for command in commands:
                for script in SCRIPT.findall(command):
                    if not (ROOT / script).exists():
                        problems.append(f"{name}: {rule_id} 登记的脚本不存在：{script}")
    if problems:
        print("规则表没过：", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        print(f"\n共 {total} 条规则，其中 {prose} 条只有文字。", file=sys.stderr)
        return 1
    print(f"规则表通过：{total} 条规则，{prose} 条只有文字。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
