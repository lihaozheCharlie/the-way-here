#!/usr/bin/env python3
"""检查近况回信中可由规则确定的模板痕迹、保留句密度、直言句式，以及人物个性是否落到字面。

脚本只认有限句式和人物文件里列出的标志说法，不能判断展开程度、洞见是否成立或是否打动用户；
未识别到时由 Skill 的挑刺审稿确认，不为通过脚本硬凑。
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from pathlib import Path


DEFAULT_DIR = Path("wiki/12 近况对话")
OVERVIEW_NAME = "近况对话总览.md"
# scripts/ → companion-reflection/ → build/ → skills/；人物库与回信 Skill 同在 skills/ 下。
SKILLS_ROOT = Path(__file__).resolve().parents[3]
FIGURES_DIR = SKILLS_ROOT / "common/reasoning-lenses/references/figures"

GENERIC_HEADINGS = {
    "我想先回应你的地方",
    "这和旧线怎么接上",
    "我会提醒你什么",
    "下次可以继续聊",
    "我的判断",
    "容易看错的地方",
    "接下来只管什么",
    "事实",
    "建议",
    "复查条件",
}

FORMULA_PATTERNS = {
    "主判断提示语": re.compile(r"我的主判断是|这篇日记的主判断"),
    "强制逆耳提示语": re.compile(r"一句不(?:太|那么)好听|不太温馨的提醒"),
    "固定三动作提示语": re.compile(r"接下来(?:只做|只留|我建议只做)三件"),
    "固定重心提示语": re.compile(r"我更在意的是|我真正想提醒你的"),
}

NOT_BUT_RE = re.compile(r"不是[^。！？\n]{0,80}而是")
WRITE_TO_YOU_RE = re.compile(r"^\d{4}-\d{2}-\d{2} 写给.*的你$")
THREE_ACTIONS_RE = re.compile(r"第一[，,].*?第二[，,].*?第三[，,]", re.S)
LENS_RE = re.compile(r"^lens:\s*\"?([a-z0-9]+(?:-[a-z0-9]+)*)\"?\s*$", re.M)

# 以未知或不能证明收束的保留句。
HEDGE_RE = re.compile(
    r"我不知道|不知道|不能证明|不证明|不能替|不作保证|未必|或许|也许|并不能|并不等于|并不说明"
    r"|不据此|还不能|暂时还|无法判断|不能判断|不能断言|不能确认|不作断言"
)
# 同一句里把两种感受或事实并排放着，不给孰轻孰重。
COEXIST_RE = re.compile(
    r"，也(?!就是说|许)"
    r"|可以同时|同时成立|都是真的|都成立|可以都|都值得|都得到|都留下|都留在|都有了自己的|都有分量|都可以|都真实|都算数"
    r"|没有[^。！？\n]{1,24}，也没有|不必[^。！？\n]{1,24}，也不必|与此同时"
)
# 对用户做法或说法直接下判断的句式。
VERDICT_RE = re.compile(
    r"我(?:认为|不同意|不赞成|不替你|不为|劝|直说|得说|的判断|的看法)|说句(?:直|不好听)|直说|说白了|坦白说|我的判断"
    r"|我说得(?:直接|直白)|说得直白|说得直接"
    r"|(?:你|这次|这一步|这个|这种|这件事|那件事|它)[^。！？；\n]{0,24}"
    r"(?:做错了|错了|做对了|是对的|做得对|做得不对|不对|不该|并不?值得|不值得|算不上|不能算|站不住|不成立|走偏"
    r"|是真的进步|真的进步|在回避|骗自己|自欺|借口|其实是|更像是|更像|问题在于|问题不是|拿错了)"
    r"|(?:这个做法|这种做法|这件事|这一步|这一招|这个说法|这句话|这个解释|这个判断|这个安排)[^。！？\n]{0,10}"
    r"(?:是错的|不对|不成立|站不住|行不通|有问题|没必要|说不通|是个问题|不能算)"
    r"|(?:它|这)[^。！？；\n]{0,6}不是"
)
# 用户自责时替他挡回去的辩护句。
SELF_DEFENSE_RE = re.compile(
    r"(?:还|暂时|并不|不足以|不能)[^。！？\n]{0,12}(?:证明|说明|等于)[^。！？\n]{0,14}你"
    r"[^。！？\n]{0,12}(?:差|不够|糟糕|失败|脆弱|不行|懒|懈怠|堕落)"
)
SOFT_ENDING_RE = re.compile(
    r"(?:可以先[^。！？\n]{0,8}留着|可以留着|留着吧|陪你[^。！？\n]{0,6}一会儿|就有了继续聊的地方"
    r"|不必[^。！？\n]{0,10}自己|不必考核自己)$"
)
# 谁都能用的开头：遮住署名认不出是谁。
GENERIC_OPENING_RE = re.compile(r"^(?:我很喜欢|我很喜欢读|这篇里我最想|读到你|你写[^。]{0,24}[，,]我(?:读|停|想))")
QUOTE_RE = re.compile(r"「([^」]{3,120})」")
STORY_TITLE_RE = re.compile(r"^- \*\*([^**]{2,30})\*\*", re.M)


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    return text[end + 5 :] if end >= 0 else text


def collect_paths(raw_paths: list[str]) -> list[Path]:
    candidates: list[Path] = []
    if not raw_paths:
        candidates = sorted(DEFAULT_DIR.glob("*.md"))
    else:
        for raw in raw_paths:
            path = Path(raw)
            if path.is_dir():
                candidates.extend(sorted(path.glob("*.md")))
            else:
                candidates.append(path)
    return [
        path
        for path in candidates
        if path.is_file() and path.suffix == ".md" and path.name != OVERVIEW_NAME
    ]


def body_of(text: str) -> str:
    text = strip_frontmatter(text)
    return text.split("\n## 依据")[0]


def cjk_count(text: str) -> int:
    return len(re.findall(r"[\u3400-\u9fff]", text))


def last_sentence(paragraphs: list[str]) -> str:
    for paragraph in reversed(paragraphs):
        stripped = paragraph.strip()
        if stripped:
            return stripped.rstrip("。！？”」")[-40:]
    return ""


def limits(chars: int) -> tuple[int, int]:
    """保留句与并存句的上限，按正文长度等比放宽：约每 280 字、每 200 字各一处。"""
    return max(2, round(chars / 280)), max(3, round(chars / 200))


def section(text: str, heading: str) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    rest = text[start + len(heading) :]
    end = rest.find("\n## ")
    return rest if end < 0 else rest[:end]


def phrase_keys(phrase: str) -> list[str]:
    """把一句说法拆成可在正文里认出的片段：五个字以上的分句，以及长分句的前六个字。

    说法里常带着重引号（「专注就是说“不”」）；去掉引号再切分，才能和同样去掉引号的正文对上。
    """
    keys: list[str] = []
    plain = re.sub(r"[“”\"'…‘’]", "", phrase)
    for clause in re.split(r"[，。；：！？、\s]+", plain):
        clause = clause.strip()
        if len(clause) >= 5:
            keys.append(clause)
        if len(clause) >= 8:
            keys.append(clause[:6])
    return keys


def story_key(title: str) -> str:
    """故事标题取开头的三四个字作记号，去掉“故事”“比喻”“的”这类尾缀。"""
    run = re.match(r"[\u3400-\u9fff]{2,}", title)
    if not run:
        return ""
    name = re.sub(r"(?:故事|比喻|的)+$", "", run.group(0))
    return name[:3] if len(name) >= 3 else name


def lens_markers(lens_id: str) -> dict[str, list[str]] | None:
    """从人物文件取出可用的标志说法、标志故事，以及列为不要用的句子。"""
    path = FIGURES_DIR / f"{lens_id}.md"
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    sayings = section(text, "## 口头禅与标志说法")
    usable, forbidden = sayings, ""
    cut = sayings.find("**不要用**")
    if cut >= 0:
        usable, forbidden = sayings[:cut], sayings[cut:]
    keys: list[str] = []
    for phrase in QUOTE_RE.findall(usable):
        keys.extend(phrase_keys(phrase))
    stories: list[str] = []
    for title in STORY_TITLE_RE.findall(section(text, "## 标志故事与比喻")):
        key = story_key(title)
        if key:
            stories.append(key)
    banned: list[str] = []
    for phrase in QUOTE_RE.findall(forbidden):
        banned.extend(phrase_keys(phrase))
    display = re.search(r'^display_name:\s*"([^"]+)"', text, re.M)
    return {
        "name": display.group(1) if display else lens_id,
        "sayings": sorted(set(keys)),
        "stories": sorted(set(stories)),
        "banned": sorted(set(banned)),
    }


def inspect(path: Path) -> dict[str, object]:
    raw = path.read_text(encoding="utf-8")
    body = body_of(raw)
    title_match = re.search(r"^# (.+)$", body, re.M)
    title = title_match.group(1).strip() if title_match else ""
    headings = [
        value.strip()
        for value in re.findall(r"^## (.+)$", body, re.M)
        if value.strip() != "依据"
    ]
    paragraphs = [value for value in body.split("\n") if value.strip() and not value.startswith("#")]
    prose = "\n".join(paragraphs)
    chars = cjk_count(prose)
    hedge_limit, coexist_limit = limits(chars)
    hedges = len(HEDGE_RE.findall(body))
    coexists = len(COEXIST_RE.findall(body))
    verdicts = len(VERDICT_RE.findall(body))
    generic = [heading for heading in headings if heading in GENERIC_HEADINGS]
    formula_counts = {
        name: len(pattern.findall(body)) for name, pattern in FORMULA_PATTERNS.items()
    }
    lens_match = LENS_RE.search(raw[: raw.find("\n---\n", 4) if raw.startswith("---\n") else 0])
    lens_id = lens_match.group(1) if lens_match else ""
    markers = lens_markers(lens_id) if lens_id else None
    normalized = re.sub(r"[“”\"]", "", prose)
    saying_hits = [key for key in (markers["sayings"] if markers else []) if key in normalized]
    story_hits = [key for key in (markers["stories"] if markers else []) if key in normalized]
    banned_hits = [key for key in (markers["banned"] if markers else []) if key in normalized]
    return {
        "path": path,
        "title": title,
        "headings": headings,
        "chars": chars,
        "paragraphs": len(paragraphs),
        "generic": generic,
        "not_but": len(NOT_BUT_RE.findall(body)),
        "formula_counts": formula_counts,
        "three_actions": bool(THREE_ACTIONS_RE.search(body)),
        "hedges": hedges,
        "hedge_limit": hedge_limit,
        "coexists": coexists,
        "coexist_limit": coexist_limit,
        "verdicts": verdicts,
        "self_defense": len(SELF_DEFENSE_RE.findall(body)),
        "soft_ending": bool(SOFT_ENDING_RE.search(last_sentence(paragraphs))),
        "lens": lens_id,
        "lens_known": bool(markers),
        "lens_name": markers["name"] if markers else "",
        "saying_hits": saying_hits,
        "story_hits": story_hits,
        "banned_hits": banned_hits,
        "generic_opening": bool(paragraphs) and bool(GENERIC_OPENING_RE.match(paragraphs[0].strip())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="报告近况回信中可由规则确定的重复模板痕迹、保留句密度、直言句式和人物标志。"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="当本轮页面违反硬性重复规则时返回非零状态",
    )
    parser.add_argument(
        "--detail",
        action="store_true",
        help="逐个页面输出计数，便于挑刺审稿核对",
    )
    parser.add_argument("paths", nargs="*", help="本轮变更的 Markdown 文件或目录")
    args = parser.parse_args()

    paths = collect_paths(args.paths)
    if not paths:
        print("files=0")
        return 0

    rows = [inspect(path) for path in paths]
    heading_counts: collections.Counter[str] = collections.Counter()
    shape_counts: collections.Counter[tuple[str, ...]] = collections.Counter()
    for row in rows:
        headings = row["headings"]
        assert isinstance(headings, list)
        heading_counts.update(headings)
        if headings:
            shape_counts[tuple(headings)] += 1

    generic_pages = [row for row in rows if row["generic"]]
    write_to_pages = [row for row in rows if WRITE_TO_YOU_RE.match(str(row["title"]))]
    not_but_total = sum(int(row["not_but"]) for row in rows)
    formula_pages = [
        row
        for row in rows
        if any(int(count) for count in dict(row["formula_counts"]).values())
    ]
    three_action_pages = [row for row in rows if row["three_actions"]]
    no_verdict_pages = [row for row in rows if int(row["verdicts"]) == 0]
    hedge_pages = [row for row in rows if int(row["hedges"]) > int(row["hedge_limit"])]
    coexist_pages = [row for row in rows if int(row["coexists"]) > int(row["coexist_limit"])]
    defense_pages = [row for row in rows if int(row["self_defense"])]
    soft_ending_pages = [row for row in rows if row["soft_ending"]]
    lens_pages = [row for row in rows if row["lens_known"]]
    impersonal_pages = [row for row in lens_pages if not row["saying_hits"]]

    print(
        " ".join(
            [
                f"files={len(rows)}",
                f"generic_heading_pages={len(generic_pages)}",
                f"write_to_you_titles={len(write_to_pages)}",
                f"not_but_occurrences={not_but_total}",
                f"formula_marker_pages={len(formula_pages)}",
                f"three_action_pages={len(three_action_pages)}",
                f"no_direct_judgment_pages={len(no_verdict_pages)}",
                f"hedge_over_limit_pages={len(hedge_pages)}",
                f"coexist_over_limit_pages={len(coexist_pages)}",
                f"self_defense_pages={len(defense_pages)}",
                f"soft_ending_pages={len(soft_ending_pages)}",
                f"lens_recorded_pages={len([row for row in rows if row['lens']])}",
                f"no_signature_saying_pages={len(impersonal_pages)}",
            ]
        )
    )

    for heading, count in heading_counts.most_common(8):
        if count > 1:
            print(f"repeated_heading count={count} heading={heading}")

    if args.detail:
        for row in rows:
            lens = f"{row['lens']}({row['lens_name']})" if row["lens_known"] else (str(row["lens"]) or "-")
            print(
                f"{row['path']}: lens={lens} chars={row['chars']} paragraphs={row['paragraphs']} "
                f"direct_judgment={row['verdicts']} hedges={row['hedges']}/{row['hedge_limit']} "
                f"coexist={row['coexists']}/{row['coexist_limit']} "
                f"sayings={row['saying_hits']} stories={row['story_hits']} banned={row['banned_hits']} "
                f"self_defense={row['self_defense']} soft_ending={int(bool(row['soft_ending']))} "
                f"generic_opening={int(bool(row['generic_opening']))}"
            )

    violations: list[str] = []
    for row in rows:
        path = row["path"]
        if row["generic"]:
            violations.append(f"{path}: generic headings {row['generic']}")
        if int(row["not_but"]) > 2:
            violations.append(f"{path}: 不是…而是… used {row['not_but']} times")
        marker_total = sum(int(value) for value in dict(row["formula_counts"]).values())
        if marker_total > 1:
            violations.append(f"{path}: {marker_total} formula markers")
        if int(row["verdicts"]) == 0:
            violations.append(f"{path}: 未识别到直言判断句式（脚本只认有限句式，由挑刺审稿确认）")
        if int(row["hedges"]) > int(row["hedge_limit"]):
            violations.append(
                f"{path}: 保留句 {row['hedges']} 处，超过上限 {row['hedge_limit']}"
            )
        if int(row["coexists"]) > int(row["coexist_limit"]):
            violations.append(
                f"{path}: 并存句 {row['coexists']} 处，超过上限 {row['coexist_limit']}"
            )
        if row["lens"] and not row["lens_known"]:
            violations.append(f"{path}: lens {row['lens']} 在共享人物库里找不到对应文件")
        if row["banned_hits"]:
            violations.append(
                f"{path}: 出现 {row['lens_name']} 人物文件里列为不要用的句子 {row['banned_hits']}"
            )
        if row["lens_known"] and not row["saying_hits"]:
            violations.append(
                f"{path}: 正文里认不出 {row['lens_name']} 的标志说法（脚本只认人物文件里列出的原句，由挑刺审稿确认）"
            )

    if len(rows) >= 3 and len(write_to_pages) / len(rows) > 0.4:
        violations.append(
            f"batch: 写给…的你 titles {len(write_to_pages)}/{len(rows)} exceeds 40%"
        )
    if len(rows) >= 3 and len(three_action_pages) / len(rows) > 0.5:
        violations.append(
            f"batch: three-action endings {len(three_action_pages)}/{len(rows)} exceeds 50%"
        )
    if len(rows) >= 3 and len(soft_ending_pages) / len(rows) > 0.5:
        violations.append(
            f"batch: soft permission endings {len(soft_ending_pages)}/{len(rows)} exceeds 50%"
        )
    for shape, count in shape_counts.items():
        if count > 2:
            violations.append(f"batch: visible heading shape repeated {count} times: {shape}")

    if args.strict:
        for violation in violations:
            print(f"violation: {violation}")
    elif violations:
        print(f"violations_suppressed={len(violations)} rerun_with=--strict")

    return 1 if args.strict and violations else 0


if __name__ == "__main__":
    sys.exit(main())
