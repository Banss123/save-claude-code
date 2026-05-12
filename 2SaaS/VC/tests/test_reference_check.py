"""정본 §필수 준수 1~8 규칙 검증 테스트 (Phase J).

정본 근거: data/references/목표매출_산정로직.md
대상 모듈: src.validator.reference_check

각 REF-1~8 에 대해 PASS/FAIL 케이스 1건씩 + 담당자 샘플 전체 PASS 1건.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.schemas.solution import SolutionPlan
from src.validator.reference_check import (
    ReferenceCheckReport,
    check_reference,
)

SAMPLES = Path(__file__).parent.parent / "data" / "samples"
SAMPLE_FILE = "더피플버거_sample.json"


# ─────────────────────────────────────
# 헬퍼
# ─────────────────────────────────────
def _load_sample() -> dict:
    with open(SAMPLES / SAMPLE_FILE, encoding="utf-8") as f:
        return json.load(f)


def _build_plan(patch: dict | None = None) -> SolutionPlan:
    """sample 을 깊이 복사하고 target_meta.lever_report 에 patch 적용."""
    d = _load_sample()
    if patch:
        d = copy.deepcopy(d)
        # patch는 target_meta 전체를 덮어쓰지 않고 deep merge
        _deep_update(d, patch)
    return SolutionPlan.model_validate(d)


def _deep_update(base: dict, patch: dict) -> None:
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_update(base[k], v)
        else:
            base[k] = v


def _result(report: ReferenceCheckReport, rule_id: str):
    matched = [r for r in report.results if r.rule_id == rule_id]
    assert len(matched) == 1, f"{rule_id} 없음 또는 중복"
    return matched[0]


# ─────────────────────────────────────
# 전체 샘플 → 8건 전부 PASS
# ─────────────────────────────────────
def test_sample_passes_all_rules() -> None:
    """담당자 확정 샘플은 8개 규칙 전부 PASS."""
    plan = _build_plan()
    report = check_reference(plan)
    assert report.all_passed, f"all_passed=False: {[r.detail for r in report.results if not r.passed]}"
    # 모두 passed=True
    failed = [r for r in report.results if not r.passed]
    assert not failed, f"FAIL 규칙: {[r.rule_id for r in failed]}"


# ─────────────────────────────────────
# REF-1: 희망매출 목표 수용 금지
# ─────────────────────────────────────
def test_ref1_fail_when_owner_hope_equals_tier_2() -> None:
    """owner_hope_won == tier_2_revenue_won → FAIL."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"owner_hope_won": 3996720}}}
    )
    r = _result(check_reference(plan), "REF-1")
    assert not r.passed
    assert r.severity == "error"
    assert "희망치를 목표로 수용" in (r.detail or "")


def test_ref1_pass_when_owner_hope_differs() -> None:
    """owner_hope_won ≠ tier_2 → PASS."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"owner_hope_won": 5000000}}}
    )
    r = _result(check_reference(plan), "REF-1")
    assert r.passed


# ─────────────────────────────────────
# REF-2: 벤치마크 기반 개선폭
# ─────────────────────────────────────
def test_ref2_fail_when_basis_missing() -> None:
    """ctr_delta.basis 비면 FAIL."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"analysis": {
            "ctr_delta": {"short_term_pct": 0.15, "mid_term_pct": 0.25, "basis": ""}
        }}}}
    )
    r = _result(check_reference(plan), "REF-2")
    assert not r.passed


def test_ref2_pass_when_all_basis_present() -> None:
    plan = _build_plan()
    r = _result(check_reference(plan), "REF-2")
    assert r.passed


# ─────────────────────────────────────
# REF-3: 달성 확률 수치 제시
# ─────────────────────────────────────
def test_ref3_fail_when_probability_out_of_range() -> None:
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_2_probability_pct": 150,  # 100 초과
        }}}}
    )
    r = _result(check_reference(plan), "REF-3")
    assert not r.passed


def test_ref3_pass_when_probability_valid_int() -> None:
    plan = _build_plan()
    r = _result(check_reference(plan), "REF-3")
    assert r.passed


# ─────────────────────────────────────
# REF-4: 수수료 상한 200만원 체크
# ─────────────────────────────────────
def test_ref4_fail_when_fee_cap_ok_missing() -> None:
    """fee_cap_ok 필드가 없으면 FAIL."""
    d = _load_sample()
    del d["target_meta"]["lever_report"]["targets"]["fee_cap_ok"]
    plan = SolutionPlan.model_validate(d)
    r = _result(check_reference(plan), "REF-4")
    assert not r.passed
    assert r.severity == "error"


def test_ref4_pass_when_fee_cap_ok_present() -> None:
    plan = _build_plan()
    r = _result(check_reference(plan), "REF-4")
    assert r.passed


# ─────────────────────────────────────
# REF-5: 데이터 부족 항목 명시
# ─────────────────────────────────────
def test_ref5_fail_when_platform_status_invalid() -> None:
    """targets.coupang_eats.status 가 허용 외 값 → FAIL."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "coupang_eats": {"status": "추정치", "baseline_revenue_won": None},
        }}}}
    )
    r = _result(check_reference(plan), "REF-5")
    assert not r.passed


def test_ref5_pass_pre_l3_format() -> None:
    """baemin/coupang/yogiyo 중첩 없는 pre-L-3 포맷은 PASS."""
    plan = _build_plan()
    r = _result(check_reference(plan), "REF-5")
    assert r.passed


# ─────────────────────────────────────
# REF-6: 1차/2차 목표 간격 ≥ 30%
# ─────────────────────────────────────
def test_ref6_fail_when_gap_under_30pct() -> None:
    """tier_2 / tier_1 - 1 < 30% 이면 FAIL."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_1_revenue_won": 3000000,
            "tier_2_revenue_won": 3500000,  # 간격 16.7%
        }}}}
    )
    r = _result(check_reference(plan), "REF-6")
    assert not r.passed
    assert r.severity == "error"


def test_ref6_pass_when_gap_exactly_30pct() -> None:
    """정확히 30% 경계는 PASS."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_1_revenue_won": 1000000,
            "tier_2_revenue_won": 1300000,  # 30% 정확
        }}}}
    )
    r = _result(check_reference(plan), "REF-6")
    assert r.passed


# ─────────────────────────────────────
# REF-7: 2차 달성 확률 ≤ 60%
# ─────────────────────────────────────
def test_ref7_fail_when_tier_2_probability_over_60() -> None:
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_2_probability_pct": 70,
        }}}}
    )
    r = _result(check_reference(plan), "REF-7")
    assert not r.passed
    assert r.severity == "error"


def test_ref7_pass_when_tier_2_probability_at_boundary() -> None:
    """정확히 60%는 허용."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_2_probability_pct": 60,
        }}}}
    )
    r = _result(check_reference(plan), "REF-7")
    assert r.passed


# ─────────────────────────────────────
# REF-8: 매장주 실행 반영 (현재값 존재)
# ─────────────────────────────────────
def test_ref8_fail_when_all_current_values_zero() -> None:
    """analysis 현재값 전부 0 → FAIL (데이터 미반영)."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"analysis": {
            "current_ctr_pct": 0,
            "current_cvr_pct": 0,
            "current_aov_won": 0,
        }}}}
    )
    r = _result(check_reference(plan), "REF-8")
    assert not r.passed


def test_ref8_pass_when_current_values_present() -> None:
    plan = _build_plan()
    r = _result(check_reference(plan), "REF-8")
    assert r.passed


# ─────────────────────────────────────
# all_passed 성질: error 만 차단 기준
# ─────────────────────────────────────
def test_all_passed_blocks_only_on_error_severity() -> None:
    """warn 실패는 all_passed 를 막지 않는다."""
    # REF-8 (warn) 만 FAIL 시키고 error 들은 모두 PASS 유지
    plan = _build_plan(
        {"target_meta": {"lever_report": {"analysis": {
            "current_ctr_pct": 0,
            "current_cvr_pct": 0,
            "current_aov_won": 0,
        }}}}
    )
    report = check_reference(plan)
    assert report.all_passed  # error 는 모두 통과했으므로 True
    ref8 = _result(report, "REF-8")
    assert not ref8.passed  # 그러나 REF-8 자체는 실패 기록됨


def test_all_passed_blocks_on_error_failure() -> None:
    """REF-6 (error) 하나만 실패해도 all_passed=False."""
    plan = _build_plan(
        {"target_meta": {"lever_report": {"targets": {
            "tier_1_revenue_won": 3000000,
            "tier_2_revenue_won": 3500000,
        }}}}
    )
    report = check_reference(plan)
    assert not report.all_passed


if __name__ == "__main__":
    test_sample_passes_all_rules()
    test_ref1_fail_when_owner_hope_equals_tier_2()
    test_ref1_pass_when_owner_hope_differs()
    test_ref2_fail_when_basis_missing()
    test_ref2_pass_when_all_basis_present()
    test_ref3_fail_when_probability_out_of_range()
    test_ref3_pass_when_probability_valid_int()
    test_ref4_fail_when_fee_cap_ok_missing()
    test_ref4_pass_when_fee_cap_ok_present()
    test_ref5_fail_when_platform_status_invalid()
    test_ref5_pass_pre_l3_format()
    test_ref6_fail_when_gap_under_30pct()
    test_ref6_pass_when_gap_exactly_30pct()
    test_ref7_fail_when_tier_2_probability_over_60()
    test_ref7_pass_when_tier_2_probability_at_boundary()
    test_ref8_fail_when_all_current_values_zero()
    test_ref8_pass_when_current_values_present()
    test_all_passed_blocks_only_on_error_severity()
    test_all_passed_blocks_on_error_failure()
    print("[OK] reference_check 모든 규칙 테스트 통과")
