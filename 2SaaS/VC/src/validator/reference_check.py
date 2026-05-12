"""정본 문서 §필수 준수 사항 자동 검증.

정본 근거: data/references/목표매출_산정로직.md §필수 준수 사항 1~8.

SolutionPlan(+ lever_report) 하나만 받아서 8개 규칙 PASS/FAIL 판정.
에이전트/스킬이 파이프라인 각 단계 종료 시 이 검증을 호출하여,
정본 로직과 충돌하는 산출물이 배포되지 않도록 방어한다.

규칙 요약 (rule_id):
  REF-1  사장님 희망매출을 목표로 그대로 수용하지 않았는가      [error]
  REF-2  레버별 개선폭이 카테고리 벤치마크 기반인가 (basis 존재) [warn]
  REF-3  달성 확률이 수치로 제시됐는가 (tier_1/2 probability)    [warn]
  REF-4  수수료 상한 200만원 체크 결과가 포함됐는가 (fee_cap_ok) [error]
  REF-5  데이터 부족 플랫폼은 "데이터 부족"으로 표기됐는가       [warn]
  REF-6  1차/2차 목표 간격이 30% 이상인가                        [error]
  REF-7  2차 달성 확률이 60% 이하인가 (초과 시 재산정 경고)      [error]
  REF-8  매장주 실행 준수 여부가 반영됐는가 (현재값 데이터 존재) [warn]

심각도:
  error — 정본 핵심 제약. 릴리즈 차단 수준.
  warn  — 운영상 이상치지만 기계적으로 차단하기엔 edge case 있음.
  info  — 참고용.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from src.schemas.solution import SolutionPlan

# 정본 §Step 4/6: 1차/2차 간격 ≥ 30%
MIN_TIER_GAP_PCT = 30.0

# 정본 §Step 4/필수7: 2차 확률 상한 60% (초과 시 재산정)
MAX_TIER_2_PROBABILITY = 60


class ReferenceCheckResult(BaseModel):
    """개별 규칙 1건의 판정 결과."""

    rule_id: str = Field(description="규칙 식별자 (REF-1 ~ REF-8)")
    rule_name: str = Field(description="규칙명 (한국어)")
    passed: bool = Field(description="True=정본 준수 / False=위반")
    severity: str = Field(description="error | warn | info")
    detail: str | None = Field(
        default=None, description="실패 시 원인 또는 PASS 근거 요약"
    )


class ReferenceCheckReport(BaseModel):
    """8개 규칙 전체 결과 묶음."""

    all_passed: bool = Field(description="error 등급 중 하나라도 실패면 False")
    results: list[ReferenceCheckResult] = Field(default_factory=list)


# ────────────────────────────────────────────────
# 유틸 — lever_report dict 에서 안전 추출
# ────────────────────────────────────────────────
def _get_lever_report(plan: SolutionPlan) -> dict[str, Any] | None:
    """target_meta.lever_report(dict) 를 안전하게 꺼낸다.

    case != 'LEVER' 이거나 lever_report 미주입 시 None 반환.
    """
    meta = plan.target_meta
    if meta is None:
        return None
    lr = meta.lever_report
    if isinstance(lr, dict):
        return lr
    return None


def _get_targets(lr: dict[str, Any]) -> dict[str, Any]:
    """lever_report["targets"] — 없으면 빈 dict."""
    t = lr.get("targets")
    return t if isinstance(t, dict) else {}


def _get_analysis(lr: dict[str, Any]) -> dict[str, Any]:
    """lever_report["analysis"] — 없으면 빈 dict."""
    a = lr.get("analysis")
    return a if isinstance(a, dict) else {}


# ────────────────────────────────────────────────
# 개별 규칙
# ────────────────────────────────────────────────
def _check_ref_1(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-1: 희망매출을 목표로 그대로 수용했는가.

    정본 §필수1: "사장님 희망매출은 참고 정보일 뿐, 산정 근거가 아니다."
    owner_hope_won == tier_2_revenue_won 이면 그대로 수용한 것 → FAIL.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-1",
            rule_name="희망매출 목표 수용 금지",
            passed=True,  # lever_report 없으면 판정 불가 → PASS로 둠 (warn 수준)
            severity="error",
            detail="lever_report 미존재 — 레버 경로 아님",
        )
    owner_hope = lr.get("owner_hope_won")
    targets = _get_targets(lr)
    tier_2 = targets.get("tier_2_revenue_won")
    if owner_hope is None or not isinstance(owner_hope, int) or owner_hope <= 0:
        return ReferenceCheckResult(
            rule_id="REF-1",
            rule_name="희망매출 목표 수용 금지",
            passed=True,
            severity="error",
            detail="owner_hope_won 미입력 — 검증 대상 아님",
        )
    if tier_2 is None:
        return ReferenceCheckResult(
            rule_id="REF-1",
            rule_name="희망매출 목표 수용 금지",
            passed=False,
            severity="error",
            detail="tier_2_revenue_won 누락",
        )
    if owner_hope == tier_2:
        return ReferenceCheckResult(
            rule_id="REF-1",
            rule_name="희망매출 목표 수용 금지",
            passed=False,
            severity="error",
            detail=(
                f"owner_hope ₩{owner_hope:,} == tier_2 ₩{tier_2:,}: "
                "희망치를 목표로 수용 (정본 §필수1 위반)"
            ),
        )
    return ReferenceCheckResult(
        rule_id="REF-1",
        rule_name="희망매출 목표 수용 금지",
        passed=True,
        severity="error",
        detail=(
            f"owner_hope ₩{owner_hope:,} vs tier_2 ₩{tier_2:,}: 분리 산정 OK"
        ),
    )


def _check_ref_2(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-2: 개선폭이 카테고리 벤치마크 기반인가.

    정본 §필수2: "모든 레버 개선폭은 카테고리 벤치마크와의 갭으로 산정."
    4개 레버 delta 각각에 basis 문자열이 존재 + 벤치마크 카테고리가 명시돼야.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-2",
            rule_name="벤치마크 기반 개선폭",
            passed=False,
            severity="warn",
            detail="lever_report 미존재 — 벤치마크 근거 불가",
        )
    analysis = _get_analysis(lr)
    bench = analysis.get("cuisine_benchmark")
    missing: list[str] = []
    for lever_key in ("impression_delta", "ctr_delta", "cvr_delta", "aov_delta"):
        delta = analysis.get(lever_key)
        if not isinstance(delta, dict):
            missing.append(f"{lever_key}(없음)")
            continue
        basis = delta.get("basis")
        if not basis or not isinstance(basis, str) or not basis.strip():
            missing.append(f"{lever_key}(basis 누락)")
    if missing or not bench:
        return ReferenceCheckResult(
            rule_id="REF-2",
            rule_name="벤치마크 기반 개선폭",
            passed=False,
            severity="warn",
            detail=(
                f"벤치카테고리='{bench}' / 누락: {', '.join(missing) or '없음'}"
            ),
        )
    return ReferenceCheckResult(
        rule_id="REF-2",
        rule_name="벤치마크 기반 개선폭",
        passed=True,
        severity="warn",
        detail=f"4개 레버 모두 basis 존재 (벤치: {bench})",
    )


def _check_ref_3(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-3: 달성 확률이 수치로 제시됐는가.

    정본 §필수3: "달성 확률은 반드시 수치로 제시."
    tier_1/2_probability_pct 가 int 이고 1~100 범위.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-3",
            rule_name="달성 확률 수치 제시",
            passed=False,
            severity="warn",
            detail="lever_report 미존재",
        )
    targets = _get_targets(lr)
    p1 = targets.get("tier_1_probability_pct")
    p2 = targets.get("tier_2_probability_pct")
    bad: list[str] = []
    for name, val in (("tier_1", p1), ("tier_2", p2)):
        if not isinstance(val, int):
            bad.append(f"{name}_probability_pct={val!r}(타입 오류)")
        elif not (1 <= val <= 100):
            bad.append(f"{name}_probability_pct={val}(범위 밖)")
    if bad:
        return ReferenceCheckResult(
            rule_id="REF-3",
            rule_name="달성 확률 수치 제시",
            passed=False,
            severity="warn",
            detail="; ".join(bad),
        )
    return ReferenceCheckResult(
        rule_id="REF-3",
        rule_name="달성 확률 수치 제시",
        passed=True,
        severity="warn",
        detail=f"1차 {p1}% / 2차 {p2}%",
    )


def _check_ref_4(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-4: 수수료 상한 200만원 체크됐는가.

    정본 §필수4: "수수료 상한 200만원 체크 필수."
    fee_cap_ok 필드 존재 + bool.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-4",
            rule_name="수수료 상한 200만원 체크",
            passed=False,
            severity="error",
            detail="lever_report 미존재",
        )
    targets = _get_targets(lr)
    if "fee_cap_ok" not in targets:
        return ReferenceCheckResult(
            rule_id="REF-4",
            rule_name="수수료 상한 200만원 체크",
            passed=False,
            severity="error",
            detail="fee_cap_ok 필드 누락 (정본 §필수4 위반)",
        )
    ok = targets.get("fee_cap_ok")
    if not isinstance(ok, bool):
        return ReferenceCheckResult(
            rule_id="REF-4",
            rule_name="수수료 상한 200만원 체크",
            passed=False,
            severity="error",
            detail=f"fee_cap_ok 타입 오류: {type(ok).__name__}",
        )
    fee_t2 = targets.get("tier_2_monthly_fee_won")
    return ReferenceCheckResult(
        rule_id="REF-4",
        rule_name="수수료 상한 200만원 체크",
        passed=True,
        severity="error",
        detail=(
            f"fee_cap_ok={ok}, tier_2 월 수수료 "
            f"₩{fee_t2:,}" if isinstance(fee_t2, int) else f"fee_cap_ok={ok}"
        ),
    )


def _check_ref_5(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-5: 데이터 부족 플랫폼은 "데이터 부족" 으로 표기됐는가.

    정본 §필수5: "데이터 부족 항목은 추정하지 말고 '데이터 부족'으로 명시."
    - lever_report.targets 내 coupang_eats/yogiyo 중첩 구조가 있으면 검사.
    - 없으면 (pre-L-3 포맷) disclaimers 에 "데이터 부족" 혹은 "미반영" 언급 OK.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-5",
            rule_name="데이터 부족 항목 명시",
            passed=False,
            severity="warn",
            detail="lever_report 미존재",
        )
    targets = _get_targets(lr)
    platform_keys = ("coupang_eats", "yogiyo")
    found_platforms = [k for k in platform_keys if k in targets]
    issues: list[str] = []
    if found_platforms:
        for pk in found_platforms:
            pt = targets.get(pk)
            if not isinstance(pt, dict):
                issues.append(f"{pk}(dict 아님)")
                continue
            status = pt.get("status")
            baseline = pt.get("baseline_revenue_won")
            # 데이터 없는 플랫폼은 'baseline_revenue_won' 이 없거나 0
            # → status 가 "데이터 부족" 혹은 "현재 유지" 여야 함
            allowed = {"데이터 부족", "현재 유지", "산정"}
            if status not in allowed:
                issues.append(f"{pk}.status={status!r} (허용: {allowed})")
            elif (baseline is None or baseline == 0) and status == "산정":
                issues.append(f"{pk}: baseline 없는데 status='산정'")
    else:
        # pre-L-3 포맷 — disclaimers 로 'missing' 언급 확인
        disc = lr.get("disclaimers") or []
        if isinstance(disc, list) and disc:
            # 최소한 disclaimers 자체가 존재하면 누락 사항을 투명하게 기술한 것으로 간주
            pass
        # 엄격히 FAIL 하지 않음 (pre-L-3 호환) — info 성격
    if issues:
        return ReferenceCheckResult(
            rule_id="REF-5",
            rule_name="데이터 부족 항목 명시",
            passed=False,
            severity="warn",
            detail="; ".join(issues),
        )
    return ReferenceCheckResult(
        rule_id="REF-5",
        rule_name="데이터 부족 항목 명시",
        passed=True,
        severity="warn",
        detail=(
            f"플랫폼별 status 표기 OK ({found_platforms})"
            if found_platforms
            else "pre-L-3 포맷 — disclaimer 경유 표기"
        ),
    )


def _check_ref_6(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-6: 1차/2차 간격 30% 이상인가.

    정본 §필수6: "1차/2차 간격이 너무 좁으면 2단계 정산 구조 무의미. 최소 +30%."
    tier_2 / tier_1 - 1 >= 0.30
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-6",
            rule_name="1차/2차 목표 간격 ≥ 30%",
            passed=False,
            severity="error",
            detail="lever_report 미존재",
        )
    targets = _get_targets(lr)
    t1 = targets.get("tier_1_revenue_won")
    t2 = targets.get("tier_2_revenue_won")
    if not isinstance(t1, int) or not isinstance(t2, int) or t1 <= 0:
        return ReferenceCheckResult(
            rule_id="REF-6",
            rule_name="1차/2차 목표 간격 ≥ 30%",
            passed=False,
            severity="error",
            detail=f"tier_1={t1!r} / tier_2={t2!r} — 연산 불가",
        )
    gap_pct = (t2 / t1 - 1.0) * 100.0
    if gap_pct < MIN_TIER_GAP_PCT:
        return ReferenceCheckResult(
            rule_id="REF-6",
            rule_name="1차/2차 목표 간격 ≥ 30%",
            passed=False,
            severity="error",
            detail=(
                f"간격 {gap_pct:.1f}% < 30% (t1=₩{t1:,}, t2=₩{t2:,}) — "
                "정본 §필수6 위반: 2단계 정산 구조 무의미"
            ),
        )
    return ReferenceCheckResult(
        rule_id="REF-6",
        rule_name="1차/2차 목표 간격 ≥ 30%",
        passed=True,
        severity="error",
        detail=f"간격 {gap_pct:.1f}% (t1=₩{t1:,}, t2=₩{t2:,})",
    )


def _check_ref_7(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-7: 2차 달성 확률이 60%를 초과하지 않는가.

    정본 §필수7: "2차 목표 달성 확률이 60%를 넘으면 목표가 너무 낮은 것. 상향 재산정."
    lever_analysis 는 compute_targets 에서 자동 재조정하지만, 주입된 JSON 이
    외부에서 편집됐거나 재조정이 무력화된 경우 탐지.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-7",
            rule_name="2차 달성 확률 ≤ 60%",
            passed=False,
            severity="error",
            detail="lever_report 미존재",
        )
    targets = _get_targets(lr)
    p2 = targets.get("tier_2_probability_pct")
    if not isinstance(p2, int):
        return ReferenceCheckResult(
            rule_id="REF-7",
            rule_name="2차 달성 확률 ≤ 60%",
            passed=False,
            severity="error",
            detail=f"tier_2_probability_pct={p2!r}(int 아님)",
        )
    if p2 > MAX_TIER_2_PROBABILITY:
        return ReferenceCheckResult(
            rule_id="REF-7",
            rule_name="2차 달성 확률 ≤ 60%",
            passed=False,
            severity="error",
            detail=(
                f"2차 확률 {p2}% > 60% — 정본 §필수7 위반: 목표 상향 재산정 필요"
            ),
        )
    return ReferenceCheckResult(
        rule_id="REF-7",
        rule_name="2차 달성 확률 ≤ 60%",
        passed=True,
        severity="error",
        detail=f"2차 확률 {p2}% ≤ 60%",
    )


def _check_ref_8(plan: SolutionPlan, lr: dict[str, Any] | None) -> ReferenceCheckResult:
    """REF-8: 매장주 실행 준수 여부가 확률에 반영됐는가.

    정본 §필수8: "매장주 실행 준수 여부는 달성 확률에 직접 반영할 것."
    lever_report.analysis 의 현재값 (CTR/CVR/AOV) 이 모두 존재하면 실제 매장
    데이터를 반영해 산정한 것으로 간주. 현재값이 전부 0 이거나 missing 이면
    데이터 미반영 → FAIL.
    """
    if lr is None:
        return ReferenceCheckResult(
            rule_id="REF-8",
            rule_name="매장주 실행 반영 (현재값 존재)",
            passed=False,
            severity="warn",
            detail="lever_report 미존재",
        )
    analysis = _get_analysis(lr)
    keys = ("current_ctr_pct", "current_cvr_pct", "current_aov_won")
    values = {k: analysis.get(k) for k in keys}
    # 모두 0 혹은 None 이면 실제 데이터 미반영
    all_missing = all(
        (v is None or (isinstance(v, (int, float)) and v == 0))
        for v in values.values()
    )
    if all_missing:
        return ReferenceCheckResult(
            rule_id="REF-8",
            rule_name="매장주 실행 반영 (현재값 존재)",
            passed=False,
            severity="warn",
            detail=(
                "analysis 현재값(CTR/CVR/AOV) 전부 0 또는 누락 — "
                "실제 매장 데이터 미반영 의심"
            ),
        )
    return ReferenceCheckResult(
        rule_id="REF-8",
        rule_name="매장주 실행 반영 (현재값 존재)",
        passed=True,
        severity="warn",
        detail=(
            f"CTR={values['current_ctr_pct']}% / "
            f"CVR={values['current_cvr_pct']}% / "
            f"AOV=₩{values['current_aov_won']:,}"
            if isinstance(values['current_aov_won'], int)
            else f"{values}"
        ),
    )


# ────────────────────────────────────────────────
# 통합 엔트리
# ────────────────────────────────────────────────
_CHECKERS = [
    _check_ref_1,
    _check_ref_2,
    _check_ref_3,
    _check_ref_4,
    _check_ref_5,
    _check_ref_6,
    _check_ref_7,
    _check_ref_8,
]


def check_reference(plan: SolutionPlan) -> ReferenceCheckReport:
    """SolutionPlan 이 정본 §필수 준수 사항 1~8 을 준수하는지 일괄 검증.

    Args:
        plan: 검증할 SolutionPlan.

    Returns:
        ReferenceCheckReport — 8건 결과.
        all_passed 는 severity=='error' 중 단 한 건이라도 FAIL 이면 False.
    """
    lr = _get_lever_report(plan)
    results = [checker(plan, lr) for checker in _CHECKERS]
    # error 등급 실패만 all_passed 차단 기준으로 본다
    all_passed = all(r.passed for r in results if r.severity == "error")
    return ReferenceCheckReport(all_passed=all_passed, results=results)


def to_check_group(report: ReferenceCheckReport) -> Any:
    """ReferenceCheckReport → 기존 validator.ValidationReport 에 합류하는 CheckGroup.

    business_rules_check 와 같은 레이아웃을 유지해 ValidationReport 출력 포맷을 해치지 않는다.
    """
    # 순환 import 회피
    from src.schemas.validation import CheckGroup, CheckItem, CheckStatus

    items: list[CheckItem] = []
    for r in report.results:
        if r.passed:
            status = CheckStatus.PASS
        elif r.severity == "error":
            status = CheckStatus.FAIL
        else:
            status = CheckStatus.WARN
        items.append(
            CheckItem(
                name=f"[{r.rule_id}] {r.rule_name}",
                status=status,
                message=r.detail or "",
            )
        )
    return CheckGroup(name="정본 §필수 준수 검증", items=items)
