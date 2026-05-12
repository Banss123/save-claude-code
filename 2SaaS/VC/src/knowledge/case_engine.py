"""YAML 케이스 라이브러리 로더 + 매처.

담당자가 `data/rules/suggestions.yaml` 만 수정하면 솔루션이 변경된다.

설계 결정:
- 의존성(pyyaml) 추가 금지 → 스펙 한정된 **경량 YAML 파서** 직접 구현.
  (pyproject.toml 수정 금지 제약 + 담당자 편의를 위해 주석·가독성 있는 YAML 형식 유지)
- 지원 문법:
    * `#` 주석 (라인/인라인)
    * 톱레벨 리스트 `- id: ...` 시퀀스
    * 블록 매핑 `key: value` (들여쓰기 2칸)
    * 블록 리스트 `- item` (value 가 리스트일 때)
    * 스칼라: 숫자, true/false/null, 따옴표 없는 문자열, "..." / '...' 문자열
- 조건 표현(`when`):
    * 키: `metrics.stat.foo`, `metrics.now_bar.bar`, `lever.xxx`, `store.zzz` 등 네스티드
    * 연산자: `==`, `!=`, `<`, `<=`, `>`, `>=`
    * RHS 리터럴: 숫자, bool, null, 문자열
    * RHS 가 `a.b.c` 형태면 **컨텍스트 값으로 양쪽을 모두 해석** (예: actual > set)
    * 키 누락 시 "경고 후 false" (전체 케이스 미매칭으로 처리)
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

DEFAULT_RULES_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "rules" / "suggestions.yaml"
)

_VALID_PRIORITY = {"high", "medium", "low"}
_VALID_CATEGORY = {"A", "B", "C", "D", "E", "F", "G"}


# ────────────────────────────────
# 모델
# ────────────────────────────────
class CaseRule(BaseModel):
    id: str
    category: str
    priority: str
    when: list[str] = Field(min_length=1)
    suggestion: str
    section_hint: str
    rationale: str = ""

    @field_validator("priority")
    @classmethod
    def _pri(cls, v: str) -> str:
        if v not in _VALID_PRIORITY:
            raise ValueError(f"priority must be high/medium/low, got {v!r}")
        return v

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str) -> str:
        if v not in _VALID_CATEGORY:
            raise ValueError(f"category must be A~G, got {v!r}")
        return v


class MatchedCase(BaseModel):
    rule: CaseRule
    matched_at: dict[str, Any]


# ────────────────────────────────
# 경량 YAML 파서 (스펙 한정)
# ────────────────────────────────
_NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")


def _strip_comment(line: str) -> str:
    """인라인 `#` 주석 제거. 따옴표 내부의 `#` 는 보존."""
    out: list[str] = []
    in_single = in_double = False
    for ch in line:
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        if ch == "#" and not in_single and not in_double:
            break
        out.append(ch)
    return "".join(out).rstrip()


def _parse_scalar(raw: str) -> Any:
    s = raw.strip()
    if s == "":
        return None
    if s == "null" or s == "~":
        return None
    if s == "true":
        return True
    if s == "false":
        return False
    # 따옴표 벗기기
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    if _NUM_RE.match(s):
        if "." in s:
            return float(s)
        return int(s)
    return s


def _indent_of(line: str) -> int:
    i = 0
    while i < len(line) and line[i] == " ":
        i += 1
    return i


def _parse_block(
    lines: list[tuple[int, int, str]], i: int, base_indent: int
) -> tuple[Any, int]:
    """블록 구조(매핑/시퀀스/스칼라) 파싱.

    lines: [(lineno, indent, stripped_content), ...]
    i: 시작 인덱스
    base_indent: 이 블록이 소속된 부모의 들여쓰기 (이보다 깊어야 자식)

    Returns: (parsed_value, next_index)
    """
    if i >= len(lines):
        return None, i

    _, first_indent, first_content = lines[i]
    if first_indent <= base_indent:
        return None, i

    # 시퀀스 판정
    if first_content.startswith("- "):
        seq: list[Any] = []
        while i < len(lines):
            ln, indent, content = lines[i]
            if indent != first_indent:
                if indent < first_indent:
                    break
                # 들여쓰기가 더 깊으면 현재 아이템의 자식 — parse_block 에서 처리
                raise ValueError(
                    f"line {ln}: 예상치 못한 들여쓰기 (들어오는 깊이 {indent} > 현재 시퀀스 {first_indent})"
                )
            if not content.startswith("- "):
                break
            item_content = content[2:].strip()
            # 같은 줄에 값이 있고 그 값이 `key: value` 이면 매핑 첫 항목으로 시작
            if item_content == "":
                # 다음 라인부터가 아이템의 본문
                child, i = _parse_block(lines, i + 1, first_indent)
                seq.append(child)
            elif ":" in item_content and not item_content.startswith(('"', "'")):
                # `- key: value` 형태 → 매핑 아이템
                # 마치 매핑 블록이 first_indent+2 에 시작된 것처럼 재구성
                # 합성 라인 리스트를 만들어 _parse_mapping 호출
                synth_lines = [(ln, first_indent + 2, item_content)]
                # 다음 줄부터 들여쓰기가 first_indent+2 이상이면 본 매핑에 포함
                j = i + 1
                while j < len(lines):
                    _, jind, _ = lines[j]
                    if jind <= first_indent:
                        break
                    synth_lines.append(lines[j])
                    j += 1
                obj, _ = _parse_mapping(synth_lines, 0, first_indent)
                seq.append(obj)
                i = j
            else:
                seq.append(_parse_scalar(item_content))
                i += 1
        return seq, i

    # 매핑
    return _parse_mapping(lines, i, base_indent)


def _parse_mapping(
    lines: list[tuple[int, int, str]], i: int, base_indent: int
) -> tuple[dict[str, Any], int]:
    if i >= len(lines):
        return {}, i
    _, first_indent, _ = lines[i]
    obj: dict[str, Any] = {}
    while i < len(lines):
        ln, indent, content = lines[i]
        if indent < first_indent:
            break
        if indent > first_indent:
            raise ValueError(f"line {ln}: 예상치 못한 들여쓰기 깊이 {indent} (기대 {first_indent})")
        if content.startswith("- "):
            # 이 레벨은 시퀀스 — 매핑이 아님
            break
        if ":" not in content:
            raise ValueError(f"line {ln}: 매핑 항목인데 ':' 없음 — {content!r}")
        key, _, rhs = content.partition(":")
        key = key.strip()
        rhs = rhs.strip()
        if rhs == "":
            # 블록 값 — 다음 라인부터
            child, i = _parse_block(lines, i + 1, first_indent)
            obj[key] = child if child is not None else {}
        else:
            obj[key] = _parse_scalar(rhs)
            i += 1
    return obj, i


def _parse_yaml_text(text: str) -> Any:
    """톱레벨 시퀀스/매핑 지원. 단일 스칼라 문서는 미지원."""
    raw_lines = text.splitlines()
    cooked: list[tuple[int, int, str]] = []
    for idx, raw in enumerate(raw_lines, start=1):
        stripped = _strip_comment(raw)
        if stripped.strip() == "":
            continue
        cooked.append((idx, _indent_of(stripped), stripped.strip()))
    if not cooked:
        return None
    # 톱레벨: 첫 non-empty 라인이 `-` 로 시작하면 시퀀스
    first = cooked[0][2]
    if first.startswith("- "):
        val, _ = _parse_block(cooked, 0, -1)
        return val
    val, _ = _parse_mapping(cooked, 0, -1)
    return val


# ────────────────────────────────
# 로더
# ────────────────────────────────
def load_rules(path: Path | None = None) -> list[CaseRule]:
    """YAML 파일에서 규칙 로드. 파싱/스키마 실패 시 경고 후 스킵."""
    p = path or DEFAULT_RULES_PATH
    if not p.exists():
        logger.warning("suggestions.yaml 이 없습니다: %s", p)
        return []
    try:
        text = p.read_text(encoding="utf-8")
    except OSError as e:
        logger.warning("suggestions.yaml 읽기 실패: %s", e)
        return []
    try:
        data = _parse_yaml_text(text)
    except ValueError as e:
        logger.warning("suggestions.yaml 파싱 실패: %s", e)
        return []
    if not isinstance(data, list):
        logger.warning("suggestions.yaml 은 톱레벨 리스트여야 합니다 (got %s)", type(data).__name__)
        return []

    rules: list[CaseRule] = []
    for idx, raw in enumerate(data):
        if not isinstance(raw, dict):
            logger.warning("rule #%d 이 dict 가 아님 — 스킵", idx)
            continue
        when = raw.get("when")
        then = raw.get("then") or {}
        if not isinstance(then, dict):
            logger.warning("rule %s: 'then' 이 dict 가 아님 — 스킵", raw.get("id"))
            continue
        merged = {
            "id": raw.get("id"),
            "category": raw.get("category"),
            "priority": raw.get("priority"),
            "when": when if isinstance(when, list) else [],
            "suggestion": then.get("suggestion", ""),
            "section_hint": then.get("section_hint", ""),
            "rationale": then.get("rationale", ""),
        }
        try:
            rules.append(CaseRule(**merged))
        except Exception as e:
            logger.warning("rule %s: 검증 실패 — %s", raw.get("id"), e)
    return rules


# ────────────────────────────────
# 조건 평가
# ────────────────────────────────
_MISSING = object()
_OP_RE = re.compile(r"\s*(==|!=|<=|>=|<|>)\s*")


def _get_path(context: dict, dotted: str) -> Any:
    """`metrics.stat.foo` 형태를 네스티드로 조회. 없으면 sentinel."""
    cur: Any = context
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return _MISSING
    return cur


def _looks_like_path(token: str) -> bool:
    """RHS 가 경로(키)로 간주되는지. 따옴표/숫자/bool/null 가 아니면 경로 후보."""
    s = token.strip()
    if not s:
        return False
    if s.startswith('"') or s.startswith("'"):
        return False
    if s in ("true", "false", "null", "~"):
        return False
    if _NUM_RE.match(s):
        return False
    # `metrics.x.y` 같은 식 — 점이 있으면 경로, 아니면 일반 문자열 리터럴로 취급
    return "." in s


def evaluate_condition(cond: str, context: dict) -> bool:
    """단일 조건 문자열 평가. 예: 'metrics.stat.review_count < 30'.

    키 누락 시 False (경고 로그). 파싱 실패도 False.
    """
    if not cond or not isinstance(cond, str):
        return False
    match = _OP_RE.search(cond)
    if not match:
        logger.warning("조건 파싱 실패 (연산자 없음): %r", cond)
        return False
    op = match.group(1)
    lhs_raw = cond[: match.start()].strip()
    rhs_raw = cond[match.end() :].strip()

    lhs = _get_path(context, lhs_raw)
    if lhs is _MISSING:
        # 대부분 정상 경로 (해당 매장에 해당 필드가 안 수집된 경우).
        # 노이즈 방지 위해 debug 레벨.
        logger.debug("조건 키 누락: %s (cond=%r)", lhs_raw, cond)
        return False

    # RHS: 경로면 context 에서 조회, 아니면 스칼라 파싱
    if _looks_like_path(rhs_raw):
        rhs = _get_path(context, rhs_raw)
        if rhs is _MISSING:
            logger.debug("조건 RHS 키 누락: %s (cond=%r)", rhs_raw, cond)
            return False
    else:
        rhs = _parse_scalar(rhs_raw)

    try:
        if op == "==":
            return lhs == rhs
        if op == "!=":
            return lhs != rhs
        if op == "<":
            return lhs < rhs
        if op == "<=":
            return lhs <= rhs
        if op == ">":
            return lhs > rhs
        if op == ">=":
            return lhs >= rhs
    except TypeError as e:
        logger.warning("조건 비교 실패 (%r vs %r): %s", lhs, rhs, e)
        return False
    return False


def match_cases(
    context: dict,
    rules: list[CaseRule] | None = None,
) -> list[MatchedCase]:
    """context 와 규칙 리스트를 받아 매칭된 케이스 반환.

    - AND 결합: 한 규칙의 when 조건이 모두 True 여야 매칭
    - 조건 키 누락은 "미매칭"으로 처리 (경고 후 False, 전체는 계속)
    - 예외 발생 시 해당 규칙만 스킵 (기타는 진행)
    """
    if rules is None:
        rules = load_rules()
    matched: list[MatchedCase] = []
    for rule in rules:
        try:
            evaluated = {c: evaluate_condition(c, context) for c in rule.when}
        except Exception as e:
            logger.warning("rule %s 평가 중 예외 — 스킵: %s", rule.id, e)
            continue
        if all(evaluated.values()):
            matched.append(MatchedCase(rule=rule, matched_at=evaluated))
    return matched


# ────────────────────────────────
# solution_builder 통합 헬퍼
# ────────────────────────────────
_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def sort_matches_by_priority(matches: list[MatchedCase]) -> list[MatchedCase]:
    return sorted(matches, key=lambda m: _PRIORITY_ORDER.get(m.rule.priority, 3))


def find_section_for_hint(sections: list[dict], hint: str) -> dict | None:
    """sections 리스트에서 `title` 이 hint 를 부분 포함하는 첫 섹션 반환."""
    if not hint:
        return None
    for sec in sections:
        title = sec.get("title", "")
        if hint in title or title in hint:
            return sec
    return None


def inject_matches_into_sections(
    sections: list[dict],
    matches: list[MatchedCase],
) -> int:
    """매칭된 케이스를 solution_builder.sections 에 items 로 삽입.

    - priority=high 만 삽입 (medium/low 는 안내문 제외)
    - section_hint 로 섹션 매핑, 미매칭 시 첫 번째 섹션에 삽입
    - suggestion 텍스트가 이미 존재하면 중복 억제
    - 실패 시 조용히 스킵 (graceful)

    Returns: 실제 삽입된 건수
    """
    inserted = 0
    high = [m for m in matches if m.rule.priority == "high"]
    for m in high:
        try:
            target = find_section_for_hint(sections, m.rule.section_hint) or (
                sections[0] if sections else None
            )
            if target is None:
                continue
            items = target.setdefault("items", [])
            # 중복 억제: 기존 item title 에 suggestion 이 포함됐으면 skip
            dup = any(m.rule.suggestion in (it.get("title") or "") for it in items)
            if dup:
                continue
            bullets = [m.rule.rationale] if m.rule.rationale else []
            bullets.append(f"근거 규칙: {m.rule.id} (category {m.rule.category})")
            items.append(
                {
                    "title": m.rule.suggestion,
                    "marker": "arrow",
                    "bullets": bullets,
                }
            )
            inserted += 1
        except Exception as e:  # pragma: no cover - 방어적
            logger.warning("case %s 삽입 실패 — 스킵: %s", m.rule.id, e)
    return inserted
