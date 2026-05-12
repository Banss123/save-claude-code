"""validator 비즈니스 룰 검수 테스트.

tier_plan / tam_meta / target_meta 선택 필드에 대한 WARN 규칙 검증.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import CheckStatus
from src.validator.business_rules_check import validate_business_rules


SAMPLES = Path(__file__).parent.parent / "data" / "samples"


def _menu_plan() -> MenuPlan:
    with open(SAMPLES / "더피플버거_menu_sample.json", encoding="utf-8") as f:
        return MenuPlan(**json.load(f))


def _solution(name: str) -> SolutionPlan:
    with open(SAMPLES / name, encoding="utf-8") as f:
        return SolutionPlan(**json.load(f))


def _find(items, keyword: str):
    return [i for i in items if keyword in i.name]


def test_tier_plan_positive_and_monotonic_pass():
    """더피플버거 샘플의 tier_plan: 양수 + 단조증가 PASS."""
    menu = _menu_plan()
    sol = _solution("더피플버거_sample.json")
    assert sol.tier_plan is not None
    t1 = sol.tier_plan.tier1_3m.target
    t2 = sol.tier_plan.tier2_6m.target
    t3 = sol.tier_plan.tier3_12m.target
    assert 0 < t1 <= t2 <= t3  # 사전 조건

    group = validate_business_rules(menu, sol)
    positive = _find(group.items, "tier_plan 목표 양수")
    mono = _find(group.items, "tier_plan 단조증가")
    assert len(positive) == 1 and positive[0].status == CheckStatus.PASS
    assert len(mono) == 1 and mono[0].status == CheckStatus.PASS


def test_tier_plan_non_monotonic_warns():
    """tier 단조증가 위반 시 WARN (FAIL 아님)."""
    menu = _menu_plan()
    sol = _solution("더피플버거_sample.json")
    # 조작: tier2 < tier1 로 위반
    sol.tier_plan.tier2_6m.target = sol.tier_plan.tier1_3m.target - 1

    group = validate_business_rules(menu, sol)
    mono = _find(group.items, "tier_plan 단조증가")
    assert len(mono) == 1
    assert mono[0].status == CheckStatus.WARN


def test_tier_plan_none_case_skips_checks():
    """tier_plan=None (E 케이스) 시 tier 관련 항목 자체가 추가되지 않음."""
    menu = _menu_plan()
    sol = _solution("더피플버거_sample_e_case.json")
    assert sol.tier_plan is None

    group = validate_business_rules(menu, sol)
    assert not _find(group.items, "tier_plan")


def test_tam_meta_unavailable_requires_reason():
    """tam_meta available=False + reason 존재 → PASS."""
    menu = _menu_plan()
    sol = _solution("더피플버거_sample.json")
    assert sol.tam_meta is not None and sol.tam_meta.available is False
    assert sol.tam_meta.reason  # 샘플은 이유 포함

    group = validate_business_rules(menu, sol)
    tam = _find(group.items, "tam_meta 미연동 시 사유 필수")
    assert len(tam) == 1 and tam[0].status == CheckStatus.PASS


def test_target_meta_required_fields_pass():
    """target_meta.case + rationale 모두 존재 시 PASS."""
    menu = _menu_plan()
    sol = _solution("더피플버거_sample.json")
    assert sol.target_meta is not None
    assert sol.target_meta.target_case and sol.target_meta.target_rationale

    group = validate_business_rules(menu, sol)
    tm = _find(group.items, "target_meta 필수 필드")
    assert len(tm) == 1 and tm[0].status == CheckStatus.PASS


if __name__ == "__main__":
    test_tier_plan_positive_and_monotonic_pass()
    test_tier_plan_non_monotonic_warns()
    test_tier_plan_none_case_skips_checks()
    test_tam_meta_unavailable_requires_reason()
    test_target_meta_required_fields_pass()
    print("[OK] validator tier/tam/target 규칙 테스트 통과")
