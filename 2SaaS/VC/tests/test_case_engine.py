"""케이스 엔진 테스트.

YAML 로더 + 조건 평가 + 매처 + solution_builder 통합.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from src.knowledge.case_engine import (
    CaseRule,
    DEFAULT_RULES_PATH,
    evaluate_condition,
    find_section_for_hint,
    inject_matches_into_sections,
    load_rules,
    match_cases,
    sort_matches_by_priority,
    _parse_yaml_text,
)


# ────────────────────────────────
# YAML 파서
# ────────────────────────────────
def test_parse_yaml_top_level_list_with_nested_mapping():
    text = """
- id: a
  category: A
  priority: high
  when:
    - x.y < 10
  then:
    suggestion: "설명"
    section_hint: "배민 기본 세팅"
    rationale: "이유"
"""
    data = _parse_yaml_text(text)
    assert isinstance(data, list) and len(data) == 1
    r = data[0]
    assert r["id"] == "a"
    assert r["when"] == ["x.y < 10"]
    assert r["then"]["suggestion"] == "설명"


def test_parse_yaml_ignores_line_and_inline_comments():
    text = """
# 전체 주석
- id: hello  # 인라인 주석
  priority: high
  category: A
  when: []
  then:
    suggestion: ""
    section_hint: ""
"""
    # 파서는 `when: []` 같은 인라인 리스트를 미지원이므로, 대신 블록 형태만 허용.
    # 여기선 빈 when 은 스키마 검증에서 실패하니 when 을 명시적으로 블록으로 제공.
    text2 = """
# 전체 주석
- id: hello  # 인라인 주석
  category: A
  priority: high
  when:
    - a.b > 0
  then:
    suggestion: "s"
    section_hint: "sec"
"""
    data = _parse_yaml_text(text2)
    assert data[0]["id"] == "hello"
    assert data[0]["when"] == ["a.b > 0"]


def test_parse_yaml_numbers_bools_nulls():
    text = """
- a: 10
  b: 3.14
  c: true
  d: false
  e: null
  f: "quoted string"
  g: unquoted
"""
    data = _parse_yaml_text(text)
    d = data[0]
    assert d["a"] == 10
    assert d["b"] == 3.14
    assert d["c"] is True
    assert d["d"] is False
    assert d["e"] is None
    assert d["f"] == "quoted string"
    assert d["g"] == "unquoted"


# ────────────────────────────────
# load_rules
# ────────────────────────────────
def test_load_rules_default_path_returns_list():
    rules = load_rules()
    assert isinstance(rules, list)
    assert len(rules) >= 20  # 초기 30 케이스


def test_load_rules_missing_file_returns_empty(tmp_path: Path):
    rules = load_rules(tmp_path / "no-such.yaml")
    assert rules == []


def test_load_rules_invalid_yaml_returns_empty(tmp_path: Path):
    f = tmp_path / "bad.yaml"
    f.write_text("- id: only\n   bad_indent: 3\n", encoding="utf-8")
    # 의도적 깨진 들여쓰기 — ValueError 캐치 후 빈 리스트 반환
    rules = load_rules(f)
    assert rules == []


def test_load_rules_skips_invalid_priority(tmp_path: Path):
    f = tmp_path / "r.yaml"
    f.write_text(
        "- id: bad\n"
        "  category: A\n"
        "  priority: URGENT\n"
        "  when:\n"
        "    - x.y > 0\n"
        "  then:\n"
        '    suggestion: "s"\n'
        '    section_hint: "sec"\n'
        "- id: ok\n"
        "  category: A\n"
        "  priority: high\n"
        "  when:\n"
        "    - x.y > 0\n"
        "  then:\n"
        '    suggestion: "s"\n'
        '    section_hint: "sec"\n',
        encoding="utf-8",
    )
    rules = load_rules(f)
    assert len(rules) == 1
    assert rules[0].id == "ok"


# ────────────────────────────────
# evaluate_condition
# ────────────────────────────────
@pytest.mark.parametrize("cond,expected", [
    ("metrics.stat.review_count < 30", True),
    ("metrics.stat.review_count < 10", False),
    ("metrics.stat.review_count == 20", True),
    ("metrics.stat.review_count != 20", False),
    ("metrics.stat.review_count >= 20", True),
    ("metrics.stat.review_count <= 19", False),
    ("metrics.stat.review_count > 19", True),
])
def test_evaluate_condition_numeric_ops(cond, expected):
    ctx = {"metrics": {"stat": {"review_count": 20}}}
    assert evaluate_condition(cond, ctx) is expected


def test_evaluate_condition_nested_key_access():
    ctx = {"metrics": {"now_bar": {"cook_compliance_pct": 92.5}}}
    assert evaluate_condition("metrics.now_bar.cook_compliance_pct < 95", ctx) is True


def test_evaluate_condition_missing_key_returns_false():
    ctx = {"metrics": {"stat": {}}}
    # 경고 로그만 내고 False
    assert evaluate_condition("metrics.stat.unknown < 5", ctx) is False


def test_evaluate_condition_bool_literal():
    ctx = {"metrics": {"stat": {"review_event_enabled": False}}}
    assert evaluate_condition("metrics.stat.review_event_enabled == false", ctx) is True
    ctx2 = {"metrics": {"stat": {"review_event_enabled": True}}}
    assert evaluate_condition("metrics.stat.review_event_enabled == false", ctx2) is False


def test_evaluate_condition_rhs_is_path():
    ctx = {
        "metrics": {
            "now_bar": {"actual_cook_time_min": 25, "set_cook_time_min": 20}
        }
    }
    assert evaluate_condition(
        "metrics.now_bar.actual_cook_time_min > metrics.now_bar.set_cook_time_min",
        ctx,
    ) is True


def test_evaluate_condition_invalid_string_returns_false():
    ctx = {"metrics": {"stat": {"review_count": 10}}}
    assert evaluate_condition("", ctx) is False
    assert evaluate_condition("no operator here", ctx) is False


def test_evaluate_condition_type_mismatch_returns_false():
    # string < number — TypeError 잡고 False
    ctx = {"metrics": {"stat": {"review_count": "abc"}}}
    assert evaluate_condition("metrics.stat.review_count < 10", ctx) is False


# ────────────────────────────────
# match_cases
# ────────────────────────────────
def test_match_cases_empty_context_returns_empty():
    rules = load_rules()
    matches = match_cases({}, rules)
    assert matches == []


def test_match_cases_matches_three_rules():
    # 리뷰 수 부족 + 별점 저조 + CPC 소진율 저조 → 3건 매치
    ctx = {
        "metrics": {
            "reviews": {"review_count": 10},
            "now_bar": {"recent_rating": 3.5},
            "stat": {"cpc_consume_rate": 0.15},
        }
    }
    rules = load_rules()
    matches = match_cases(ctx, rules)
    ids = {m.rule.id for m in matches}
    assert "review-count-low" in ids
    assert "review-rating-low" in ids
    assert "cpc-consume-rate-low" in ids


def test_match_cases_all_conditions_must_be_true():
    # 초기 매장 부스트: days<30 AND boost_used==false
    ctx_fail = {"metrics": {"stat": {"days_since_open": 10, "boost_used": True}}}
    matches = match_cases(ctx_fail, load_rules())
    ids = {m.rule.id for m in matches}
    assert "new-shop-boost-unused" not in ids

    ctx_pass = {"metrics": {"stat": {"days_since_open": 10, "boost_used": False}}}
    matches = match_cases(ctx_pass, load_rules())
    ids = {m.rule.id for m in matches}
    assert "new-shop-boost-unused" in ids


def test_match_cases_skips_bad_condition_strings_without_crash():
    rule = CaseRule(
        id="test",
        category="A",
        priority="high",
        when=["no operator"],
        suggestion="s",
        section_hint="sec",
    )
    # 평가 False → 매칭 안 됨. 예외 없음.
    matches = match_cases({"metrics": {}}, [rule])
    assert matches == []


# ────────────────────────────────
# priority 정렬 + section 매핑
# ────────────────────────────────
def test_sort_matches_by_priority_orders_high_first():
    from src.knowledge.case_engine import MatchedCase
    r_low = CaseRule(id="l", category="A", priority="low", when=["x.y > 0"],
                     suggestion="", section_hint="")
    r_high = CaseRule(id="h", category="A", priority="high", when=["x.y > 0"],
                      suggestion="", section_hint="")
    r_med = CaseRule(id="m", category="A", priority="medium", when=["x.y > 0"],
                     suggestion="", section_hint="")
    matches = [
        MatchedCase(rule=r_low, matched_at={}),
        MatchedCase(rule=r_high, matched_at={}),
        MatchedCase(rule=r_med, matched_at={}),
    ]
    ordered = sort_matches_by_priority(matches)
    assert [m.rule.priority for m in ordered] == ["high", "medium", "low"]


def test_find_section_for_hint_partial_match():
    sections = [
        {"title": "배민 기본 세팅", "items": []},
        {"title": "광고 전략: 배민 (CPC)", "items": []},
        {"title": "운영 원칙", "items": []},
    ]
    assert find_section_for_hint(sections, "배민 기본 세팅")["title"] == "배민 기본 세팅"
    assert find_section_for_hint(sections, "광고 전략: 배민 (CPC)")["title"].startswith("광고 전략")
    assert find_section_for_hint(sections, "없는섹션") is None


# ────────────────────────────────
# inject_matches_into_sections
# ────────────────────────────────
def test_inject_matches_adds_items_and_dedupes():
    from src.knowledge.case_engine import MatchedCase
    rule = CaseRule(
        id="x", category="A", priority="high",
        when=["x.y > 0"],
        suggestion="리뷰 이벤트 설정",
        section_hint="배민 기본 세팅",
        rationale="이유1",
    )
    sections = [{"title": "배민 기본 세팅", "items": []}]
    match = MatchedCase(rule=rule, matched_at={})
    added = inject_matches_into_sections(sections, [match])
    assert added == 1
    assert sections[0]["items"][0]["title"] == "리뷰 이벤트 설정"

    # 중복 삽입 방지
    added2 = inject_matches_into_sections(sections, [match])
    assert added2 == 0
    assert len(sections[0]["items"]) == 1


def test_inject_matches_only_injects_high_priority():
    from src.knowledge.case_engine import MatchedCase
    r_high = CaseRule(id="h", category="A", priority="high", when=["x.y > 0"],
                      suggestion="HIGH 추천", section_hint="배민 기본 세팅")
    r_med = CaseRule(id="m", category="A", priority="medium", when=["x.y > 0"],
                     suggestion="MED 추천", section_hint="배민 기본 세팅")
    sections = [{"title": "배민 기본 세팅", "items": []}]
    added = inject_matches_into_sections(sections, [
        MatchedCase(rule=r_high, matched_at={}),
        MatchedCase(rule=r_med, matched_at={}),
    ])
    assert added == 1
    titles = [it["title"] for it in sections[0]["items"]]
    assert "HIGH 추천" in titles
    assert "MED 추천" not in titles


def test_inject_falls_back_to_first_section_if_hint_not_found():
    from src.knowledge.case_engine import MatchedCase
    rule = CaseRule(id="x", category="A", priority="high", when=["x.y > 0"],
                    suggestion="fallback", section_hint="존재하지 않는 섹션")
    sections = [
        {"title": "배민 기본 세팅", "items": []},
        {"title": "운영 원칙", "items": []},
    ]
    inject_matches_into_sections(sections, [MatchedCase(rule=rule, matched_at={})])
    assert sections[0]["items"][0]["title"] == "fallback"


# ────────────────────────────────
# default rules 내용 검증
# ────────────────────────────────
def test_default_rules_cover_all_categories():
    rules = load_rules(DEFAULT_RULES_PATH)
    cats = {r.category for r in rules}
    assert cats == {"A", "B", "C", "D", "E", "F", "G"}


def test_default_rules_all_have_valid_priority():
    rules = load_rules(DEFAULT_RULES_PATH)
    for r in rules:
        assert r.priority in {"high", "medium", "low"}
        assert r.when  # 최소 1개 조건
