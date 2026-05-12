"""Phase γ-4 — 과거 실적 분포 기반 base_multiplier 오버라이드 테스트.

검증 대상:
1. 샘플 충분 시(n>=5) A 케이스가 P80으로 교체되는가
2. B 케이스가 P50으로 교체되는가
3. C 케이스는 약점 판정 유지하면서 P50으로 교체되는가
4. 샘플 부족(n<5) 시 기존 상수 폴백인가
5. use_historical=False 시 오버라이드 비활성화인가
6. cases_dir=None(기본) + 실샘플 2건 시 자동 폴백인가
7. D 케이스는 오버라이드 미적용(1.3 유지)
8. E 케이스는 오버라이드 미적용(절대 300만원 유지)
9. 세그먼트 필터 — cuisine/baseline/outcome 조건 동작

구현 포인트:
- tmp_path 로 가짜 cases_dir 을 만들어 JSON 사례 파일 투입 후 compute_target_revenue 에 전달.
- 이 방식은 실제 load_cases 경로를 그대로 통과하므로 세그먼트 로직까지 통합 검증.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from src.planner.target_revenue import (  # noqa: E402
    BASELINE_TIER_TOLERANCE,
    HISTORICAL_BASIS_MONTH,
    MIN_CASES_FOR_OVERRIDE,
    _historical_override,
    compute_target_revenue,
)


AVG_REPEAT = 20


def ok_now_bar(rating: float = 4.8, cook: float = 100.0) -> dict:
    return {"recent_rating": rating, "cook_compliance_pct": cook}


# ──────────────────────────────────────────────────────────────
# 헬퍼: 임시 cases_dir 에 JSON 사례 파일 여러 건을 생성
# ──────────────────────────────────────────────────────────────
def _write_case(
    dir_path: Path,
    case_id: str,
    *,
    cuisine: str,
    baseline: int,
    month_6: int,
    outcome: str = "success",
    month_3: int | None = None,
    month_12: int | None = None,
) -> None:
    payload = {
        "case_id": case_id,
        "shop_name": f"매장_{case_id}",
        "cuisine": cuisine,
        "location": "테스트시",
        "consulting_start": "2024-01-01",
        "consulting_months": 12,
        "revenue": {
            "baseline": baseline,
            "month_3": month_3,
            "month_6": month_6,
            "month_12": month_12,
        },
        "interventions": ["테스트"],
        "outcome": outcome,
    }
    (dir_path / f"{case_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8",
    )


def _seed_cases(dir_path: Path, ratios: list[float], *, cuisine: str = "치킨",
                baseline: int = 10_000_000, outcome: str = "success") -> None:
    """세그먼트에 속하는 사례 n건 생성. month_6 = baseline * ratio."""
    for i, r in enumerate(ratios):
        _write_case(
            dir_path,
            case_id=f"case_{i:02d}",
            cuisine=cuisine,
            baseline=baseline,
            month_6=int(baseline * r),
            outcome=outcome,
        )


# ──────────────────────────────────────────────────────────────
# 1. A 케이스 + 충분한 샘플 → multiplier = P80
# ──────────────────────────────────────────────────────────────
def test_case_A_uses_p80_when_enough_samples(tmp_path: Path) -> None:
    # 7건: ratios 1.3/1.5/1.7/2.0/2.3/2.5/2.8 → P80 ≈ 2.5 근처
    _seed_cases(tmp_path, [1.3, 1.5, 1.7, 2.0, 2.3, 2.5, 2.8], cuisine="치킨",
                baseline=10_000_000)

    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 70,  # 재주문 35% → 평균 대비 +15%p (강)
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="치킨",
        cases_dir=tmp_path,
    )
    assert result["case"] == "A"
    # P80 이 override multiplier 로 사용됨 (상수 2.5 가 아님)
    mult = result["multiplier"]
    override = _historical_override(10_000_000, "치킨", cases_dir=tmp_path)
    assert override is not None
    assert override["n"] == 7
    assert mult == pytest.approx(override["p80"])
    # rationale 에 근거 문구 포함
    assert "내부 실적 7건 기반" in result["rationale"]
    assert f"P80={override['p80']:.2f}" in result["rationale"]
    # 전제조건 주석은 유지
    assert "전제조건" in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 2. B 케이스 + 충분한 샘플 → multiplier = P50
# ──────────────────────────────────────────────────────────────
def test_case_B_uses_p50_when_enough_samples(tmp_path: Path) -> None:
    _seed_cases(tmp_path, [1.3, 1.5, 1.8, 2.0, 2.2, 2.5], cuisine="한식",
                baseline=10_000_000)

    # 중간 광고 + 평균 재주문 → B
    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 40,  # 20%, 평균 수준
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="한식",
        cases_dir=tmp_path,
    )
    assert result["case"] == "B"
    override = _historical_override(10_000_000, "한식", cases_dir=tmp_path)
    assert override is not None
    assert result["multiplier"] == pytest.approx(override["p50"])
    # 기존 상수 2.0 이 그대로면 실패. P50은 보통 1.9 수준이라 다름 확인.
    assert result["multiplier"] != 2.0 or override["p50"] == 2.0
    assert "내부 실적" in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 3. C 케이스 + 충분한 샘플 → P50 교체, 약점 판정 유지
# ──────────────────────────────────────────────────────────────
def test_case_C_uses_p50_but_keeps_weakness_label(tmp_path: Path) -> None:
    _seed_cases(tmp_path, [1.1, 1.3, 1.5, 1.7, 1.9], cuisine="양식",
                baseline=10_000_000)

    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 40,  # 20% 평균 수준
        "ugk_roas": 3.0,  # 약
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="양식",
        cases_dir=tmp_path,
    )
    assert result["case"] == "C"
    assert result["case_label"] == "보수적 성장"
    override = _historical_override(10_000_000, "양식", cases_dir=tmp_path)
    assert override is not None
    assert result["multiplier"] == pytest.approx(override["p50"])
    # 약점 판정 문구 유지
    assert "광고 효율 약" in result["rationale"]
    assert "보강 후 재평가 권장" in result["rationale"]
    # 오버라이드 근거 append
    assert "내부 실적" in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 4. 샘플 부족(n<5) → 기존 상수 유지
# ──────────────────────────────────────────────────────────────
def test_insufficient_samples_fallback_to_constant(tmp_path: Path) -> None:
    # 4건만 생성 → MIN_CASES_FOR_OVERRIDE=5 미달
    _seed_cases(tmp_path, [1.3, 1.5, 1.8, 2.0], cuisine="치킨",
                baseline=10_000_000)

    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="치킨",
        cases_dir=tmp_path,
    )
    assert result["case"] == "A"
    assert result["multiplier"] == 2.5  # 상수 유지
    assert "내부 실적" not in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 5. use_historical=False → 충분한 샘플이라도 상수 유지
# ──────────────────────────────────────────────────────────────
def test_use_historical_false_keeps_constant(tmp_path: Path) -> None:
    _seed_cases(tmp_path, [1.3, 1.5, 1.8, 2.0, 2.3, 2.5, 2.8], cuisine="치킨",
                baseline=10_000_000)

    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="치킨",
        cases_dir=tmp_path,
        use_historical=False,
    )
    assert result["case"] == "A"
    assert result["multiplier"] == 2.5
    assert "내부 실적" not in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 6. cases_dir=None(기본) + 실샘플 2건 → 폴백
# ──────────────────────────────────────────────────────────────
def test_default_cases_dir_two_samples_falls_back() -> None:
    """현재 data/historical_cases/ 의 2건(치킨 1, 양식 1)은 각 세그먼트당 n<5 → 폴백."""
    stat = {
        "order_amount": 18_000_000,  # 치킨 샘플과 동일 baseline
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="치킨",
        # cases_dir=None → DEFAULT_CASES_DIR (= 실제 data/historical_cases/)
    )
    assert result["case"] == "A"
    assert result["multiplier"] == 2.5
    assert "내부 실적" not in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 7. D 케이스는 오버라이드 대상 아님 (1.3 유지)
# ──────────────────────────────────────────────────────────────
def test_case_D_unaffected_by_override(tmp_path: Path) -> None:
    # 충분한 샘플을 깔아도 D 분기는 오버라이드 미적용
    _seed_cases(tmp_path, [1.3, 1.5, 1.8, 2.0, 2.3, 2.5, 2.8], cuisine="치킨",
                baseline=10_000_000)

    stat = {
        "order_amount": 10_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(rating=4.1), AVG_REPEAT,  # D 트리거
        cuisine="치킨",
        cases_dir=tmp_path,
    )
    assert result["case"] == "D"
    assert result["multiplier"] == 1.3
    assert "내부 실적" not in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 8. E 케이스는 오버라이드 대상 아님 (절대 300만원 유지)
# ──────────────────────────────────────────────────────────────
def test_case_E_unaffected_by_override(tmp_path: Path) -> None:
    # 소형(< 100만원) 매장은 E 절대 목표. 샘플 유무 무관.
    # order_amt=500_000 기준으로 세그먼트를 채우려면 baseline≈500_000 인 케이스가 필요
    # 하지만 E 는 그 이전에 분기되므로 샘플 상관없이 300만 고정.
    _seed_cases(tmp_path, [1.3, 1.5, 1.8, 2.0, 2.3, 2.5, 2.8], cuisine="치킨",
                baseline=500_000)

    stat = {
        "order_amount": 500_000,
        "order_count": 30,
        "repeat_order_count": 5,
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        cuisine="치킨",
        cases_dir=tmp_path,
    )
    assert result["case"] == "E"
    assert result["target_revenue"] == 3_000_000
    assert result["multiplier"] is None
    assert "내부 실적" not in result["rationale"]


# ──────────────────────────────────────────────────────────────
# 9. 세그먼트 필터 동작 — cuisine/baseline/outcome
# ──────────────────────────────────────────────────────────────
def test_segment_filter_excludes_wrong_cuisine_baseline_outcome(
    tmp_path: Path,
) -> None:
    """혼합 사례군에서 올바른 세그먼트만 집계되는지 확인.

    - 치킨 5건 (success, baseline 10M) → 포함
    - 한식 5건 (success) → cuisine 불일치, 제외
    - 치킨 5건 (ongoing) → outcome 제외
    - 치킨 5건 (baseline 30M) → baseline ±50% 초과, 제외
    """
    # 포함 대상 5건 (치킨, baseline 10M, success)
    for i, r in enumerate([1.3, 1.5, 1.8, 2.0, 2.5]):
        _write_case(tmp_path, f"ok_{i}", cuisine="치킨", baseline=10_000_000,
                    month_6=int(10_000_000 * r), outcome="success")
    # cuisine 다름
    for i, r in enumerate([2.0, 2.2, 2.4, 2.6, 2.8]):
        _write_case(tmp_path, f"other_c_{i}", cuisine="한식",
                    baseline=10_000_000, month_6=int(10_000_000 * r))
    # outcome 미완결
    for i, r in enumerate([3.0, 3.0, 3.0, 3.0, 3.0]):
        _write_case(tmp_path, f"ong_{i}", cuisine="치킨", baseline=10_000_000,
                    month_6=int(10_000_000 * r), outcome="ongoing")
    # baseline 범위 초과 (30M → 10M ±50% = 5M~15M 밖)
    for i, r in enumerate([3.0, 3.0, 3.0, 3.0, 3.0]):
        _write_case(tmp_path, f"big_{i}", cuisine="치킨", baseline=30_000_000,
                    month_6=int(30_000_000 * r), outcome="success")

    override = _historical_override(10_000_000, "치킨", cases_dir=tmp_path)
    assert override is not None
    # 정확히 5건만 잡혀야 함
    assert override["n"] == 5
    # 상수(BASELINE_TIER_TOLERANCE / MIN_CASES_FOR_OVERRIDE) 확인도 겸함
    assert MIN_CASES_FOR_OVERRIDE == 5
    assert BASELINE_TIER_TOLERANCE == 0.5
    assert HISTORICAL_BASIS_MONTH == 6
    # 이상치(ongoing/baseline 범위 외) 배제 덕분에 P80 이 3.0 근처로 치솟지 않음
    assert override["p80"] < 2.7
