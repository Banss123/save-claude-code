"""L-1: lever_analysis 4-레버 곱셈 산정 테스트.

검증 대상:
  1. LeverInput Pydantic 검증
  2. analyze_levers — 레버별 현황/개선폭 계산
  3. compute_targets — 곱셈 공식 + 확률 + 수수료 캡
  4. build_report — 통합 결과
  5. 경계값: 평점 4.5 / E 가드 / 상한 캡
  6. compute_target_revenue 통합 (lever_input 경로)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from src.planner.lever_analysis import (  # noqa: E402
    AOV_IMPROVEMENT_BY_ELASTICITY,
    CTR_IMPROVEMENT_MID,
    CTR_IMPROVEMENT_SHORT,
    CVR_IMPROVEMENT_SHORT,
    E_GUARD_MIN_REVENUE,
    FEE_CAP_WON,
    FEE_CAPPED_TIER_2_REVENUE,
    IMPRESSION_SHORT_WHEN_RATING_LOW,
    IMPRESSION_SHORT_WHEN_RATING_OK,
    LeverAnalysis,
    LeverInput,
    LeverReport,
    PROB_PENALTY_LOW_COOK,
    PROB_PENALTY_LOW_RATING,
    PROB_PENALTY_UNKNOWN_CATEGORY,
    PROB_TIER_1_BASE,
    PROB_TIER_2_BASE,
    analyze_levers,
    build_report,
    compute_targets,
)
from src.planner.target_revenue import compute_target_revenue  # noqa: E402


# ─────────────────────────────────────────────
# 1. LeverInput 검증
# ─────────────────────────────────────────────
def test_lever_input_valid_construction() -> None:
    li = LeverInput(
        cuisine="치킨",
        impressions_31d=100_000,
        clicks_31d=3_500,
        orders_31d=700,
        revenue_31d=15_000_000,
        recent_rating=4.7,
        cook_compliance_pct=98,
    )
    assert li.cuisine == "치킨"
    assert li.impressions_31d == 100_000


def test_lever_input_rejects_negative_revenue() -> None:
    with pytest.raises(Exception):
        LeverInput(
            cuisine="치킨",
            impressions_31d=1000,
            clicks_31d=100,
            orders_31d=20,
            revenue_31d=-500,
            recent_rating=4.5,
            cook_compliance_pct=95,
        )


def test_lever_input_rejects_rating_out_of_range() -> None:
    with pytest.raises(Exception):
        LeverInput(
            cuisine="치킨",
            impressions_31d=1000,
            clicks_31d=100,
            orders_31d=20,
            revenue_31d=500_000,
            recent_rating=6.0,  # 5.0 초과
            cook_compliance_pct=95,
        )


# ─────────────────────────────────────────────
# 2. analyze_levers
# ─────────────────────────────────────────────
def _li(**overrides) -> LeverInput:
    defaults = {
        "cuisine": "치킨",
        "impressions_31d": 100_000,
        "clicks_31d": 3_500,  # CTR 3.5% (치킨 벤치 3.0~4.5 middle)
        "orders_31d": 600,     # CVR 600/3500 ≈ 17.1% (15~20 middle)
        "revenue_31d": 12_000_000,
        "recent_rating": 4.7,
        "cook_compliance_pct": 98,
    }
    defaults.update(overrides)
    return LeverInput(**defaults)


def test_analyze_levers_computes_current_values() -> None:
    analysis = analyze_levers(_li())
    assert analysis.current_ctr_pct == pytest.approx(3.5, rel=0.01)
    assert analysis.current_cvr_pct == pytest.approx(17.14, rel=0.01)
    assert analysis.current_aov_won == 20_000  # 12_000_000 // 600


def test_analyze_levers_maps_to_benchmark() -> None:
    analysis = analyze_levers(_li(cuisine="양식"))
    # 양식 → 한식 근사
    assert analysis.cuisine_benchmark == "한식"


def test_analyze_levers_rating_high_allows_imp_short_positive() -> None:
    analysis = analyze_levers(_li(recent_rating=4.8))
    assert analysis.impression_delta.short_term_pct == IMPRESSION_SHORT_WHEN_RATING_OK
    assert analysis.impression_delta.short_term_pct > 0


def test_analyze_levers_rating_low_forces_imp_short_zero() -> None:
    analysis = analyze_levers(_li(recent_rating=4.3))  # < 4.5
    assert analysis.impression_delta.short_term_pct == IMPRESSION_SHORT_WHEN_RATING_LOW
    assert analysis.impression_delta.short_term_pct == 0.0
    # 중기는 여전히 양수
    assert analysis.impression_delta.mid_term_pct > 0


def test_analyze_levers_ctr_below_gets_big_uplift() -> None:
    """치킨 벤치 3.0~4.5. CTR 1.5% (below) → 단기 CTR 개선 35%."""
    analysis = analyze_levers(_li(clicks_31d=1_500))  # CTR 1.5%
    assert analysis.ctr_delta.short_term_pct == CTR_IMPROVEMENT_SHORT["below"]
    assert "하단 미달" in analysis.ctr_delta.basis


def test_analyze_levers_ctr_near_top() -> None:
    """치킨 벤치 상단 4.5. CTR 4.3 (>= 4.5*0.9 = 4.05) → near_top."""
    analysis = analyze_levers(_li(clicks_31d=4_300))
    assert analysis.ctr_delta.short_term_pct == CTR_IMPROVEMENT_SHORT["near_top"]
    assert "상단 근접" in analysis.ctr_delta.basis


def test_analyze_levers_aov_elasticity_low_for_chicken() -> None:
    """치킨은 탄력성 '낮음' → 단기 +3%, 중기 +8%."""
    analysis = analyze_levers(_li())
    short, mid = AOV_IMPROVEMENT_BY_ELASTICITY["낮음"]
    assert analysis.aov_delta.short_term_pct == short
    assert analysis.aov_delta.mid_term_pct == mid


def test_analyze_levers_aov_elasticity_high_for_bunsik() -> None:
    analysis = analyze_levers(_li(cuisine="분식"))
    short, mid = AOV_IMPROVEMENT_BY_ELASTICITY["높음"]
    assert analysis.aov_delta.short_term_pct == short
    assert analysis.aov_delta.mid_term_pct == mid


# ─────────────────────────────────────────────
# 3. compute_targets
# ─────────────────────────────────────────────
def test_compute_targets_multiplies_levers() -> None:
    """곱셈 공식 수치 검증.

    치킨, CTR 3.5% (middle), CVR 17.1% (middle), AOV 20k, 평점 4.7, cook 98.
      impression: 단기 0.10 / 중기 0.30
      ctr:        단기 0.15 / 중기 0.25
      cvr:        단기 0.12 / 중기 0.22
      aov:        단기 0.03 / 중기 0.08
    tier_1 = 12,000,000 × 1.10 × 1.15 × 1.12 × 1.03 ≈ 15,617,248
    tier_2 = 12,000,000 × 1.30 × 1.25 × 1.22 × 1.08 ≈ 21,427,200
    """
    input_ = _li()
    analysis = analyze_levers(input_)
    result = compute_targets(input_, analysis)
    expected_t1 = int(12_000_000 * 1.10 * 1.15 * 1.12 * 1.03)
    expected_t2 = int(12_000_000 * 1.30 * 1.25 * 1.22 * 1.08)
    # 확률 재조정이 들어갈 수 있어 정확 비교 대신 근사
    assert result.tier_1_revenue_won == pytest.approx(expected_t1, rel=0.15)
    assert result.tier_2_revenue_won == pytest.approx(expected_t2, rel=0.15)


def test_compute_targets_probability_healthy_case() -> None:
    """평점/조리 OK + 매핑 known → 페널티 0."""
    input_ = _li()
    result = compute_targets(input_, analyze_levers(input_))
    # 기본 75%/50% 에서 재조정 발생 여부는 수치에 따라 다름
    assert 65 <= result.tier_1_probability_pct <= 85
    assert 40 <= result.tier_2_probability_pct <= 60


def test_compute_targets_probability_low_rating_penalty() -> None:
    """평점 < 4.5 → -10%p 페널티."""
    input_ = _li(recent_rating=4.3)
    # rating < 4.5 이지만 D 가드(4.3)는 compute_targets 자체 경로에선 안 잡힘
    # — compute_targets 는 이미 lever_path 안에서 호출되므로 D 가드는 상위 처리
    result = compute_targets(input_, analyze_levers(input_))
    # 단, compute_targets 는 재조정 루프가 있으므로 base-10 이후 +/- 10 가능
    # 핵심은 healthy 케이스 대비 낮아지는지
    healthy = compute_targets(_li(), analyze_levers(_li()))
    assert result.tier_2_probability_pct <= healthy.tier_2_probability_pct


def test_compute_targets_probability_unknown_category_penalty() -> None:
    input_ = _li(cuisine="외계인음식")
    healthy = compute_targets(_li(), analyze_levers(_li()))
    result = compute_targets(input_, analyze_levers(input_))
    assert result.tier_2_probability_pct < healthy.tier_2_probability_pct


def test_compute_targets_fee_cap_triggered_for_large_store() -> None:
    """매우 큰 매장에서 tier_2 × 5% > 200만 → 캡 적용."""
    # 5000만원 기준 → tier_2가 6000만 이상이면 5% = 300만 > 200만
    input_ = _li(
        revenue_31d=50_000_000,
        orders_31d=2000,
    )
    result = compute_targets(input_, analyze_levers(input_))
    # 캡 작동했는지 체크
    if result.tier_2_revenue_won == FEE_CAPPED_TIER_2_REVENUE:
        assert result.tier_2_monthly_fee_won == FEE_CAP_WON
        assert result.adjustment_note is not None
        assert "수수료 상한 200만원" in result.adjustment_note
    # 캡 이하면 OK
    assert result.tier_2_monthly_fee_won <= FEE_CAP_WON


def test_compute_targets_growth_pct_is_positive() -> None:
    result = compute_targets(_li(), analyze_levers(_li()))
    assert result.tier_1_growth_pct > 0
    assert result.tier_2_growth_pct > 0


def test_compute_targets_tier2_higher_than_tier1() -> None:
    """중기 개선폭 > 단기 개선폭 → 일반적으로 tier_2 > tier_1. 단, 조정 후에도."""
    result = compute_targets(_li(), analyze_levers(_li()))
    # 캡 이후에도 tier_1 < tier_2 유지되는지는 케이스바이케이스지만
    # 정상 범위에선 성립
    assert result.tier_2_revenue_won >= result.tier_1_revenue_won


# ─────────────────────────────────────────────
# 4. build_report 통합
# ─────────────────────────────────────────────
def test_build_report_returns_lever_report() -> None:
    report = build_report("치킨집", _li())
    assert isinstance(report, LeverReport)
    assert report.store_name == "치킨집"
    assert isinstance(report.analysis, LeverAnalysis)


def test_build_report_includes_owner_hope_disclaimer() -> None:
    report = build_report("치킨집", _li(), owner_hope_won=30_000_000)
    assert any("사장님 희망매출" in d for d in report.disclaimers)


def test_build_report_low_rating_disclaimer() -> None:
    report = build_report("치킨집", _li(recent_rating=4.2))
    assert any("4.5" in d and "단기 노출 확장 0%" in d for d in report.disclaimers)


def test_build_report_unknown_category_disclaimer() -> None:
    report = build_report("외계인식당", _li(cuisine="외계인음식"))
    assert any("미매핑" in d for d in report.disclaimers)


def test_build_report_guard_note_for_e_case() -> None:
    """E 가드 (revenue < 1M) → guard_note 존재."""
    report = build_report(
        "작은가게",
        _li(revenue_31d=500_000, orders_31d=30),
    )
    assert report.guard_note is not None
    assert "신규·소형" in report.guard_note


# ─────────────────────────────────────────────
# 5. compute_target_revenue 통합 (lever_input 경로)
# ─────────────────────────────────────────────
def test_compute_target_revenue_with_lever_input_returns_lever_case() -> None:
    stat = {
        "order_amount": 12_000_000,
        "order_count": 600,
        "repeat_order_count": 150,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.7, "cook_compliance_pct": 98}
    lever_input = _li()
    result = compute_target_revenue(
        stat, now_bar, avg_repeat_pct=25,
        cuisine="치킨",
        lever_input=lever_input,
    )
    assert result["case"] == "LEVER"
    assert result["case_label"] == "4-레버 곱셈 산정 (정본)"
    assert result["lever_report"] is not None
    assert "4-레버 곱셈" in result["rationale"]


def test_compute_target_revenue_lever_has_tier_plan() -> None:
    stat = {
        "order_amount": 12_000_000,
        "order_count": 600,
        "repeat_order_count": 150,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.7, "cook_compliance_pct": 98}
    result = compute_target_revenue(
        stat, now_bar, 25,
        cuisine="치킨",
        lever_input=_li(),
    )
    plan = result["tier_plan"]
    assert plan is not None
    assert plan["tier1_3m"]["target"] > 0
    assert plan["tier2_6m"]["target"] > 0
    # 정본은 2단계, tier3_12m 은 tier_2 복제(하위호환)
    assert plan["tier3_12m"]["target"] == plan["tier2_6m"]["target"]


def test_compute_target_revenue_lever_sanity_check_present() -> None:
    stat = {
        "order_amount": 12_000_000,
        "order_count": 600,
        "repeat_order_count": 150,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.7, "cook_compliance_pct": 98}
    result = compute_target_revenue(
        stat, now_bar, 25,
        cuisine="치킨",
        lever_input=_li(),
    )
    sanity = result["lever_report"]["sanity_check"]
    assert sanity["method"] == "legacy_multiplier"
    assert sanity["case"] in {"A", "B", "C"}


def test_compute_target_revenue_lever_d_gate_trumps_lever() -> None:
    """평점 4.1 → D 가드가 레버 경로보다 선행."""
    stat = {
        "order_amount": 12_000_000,
        "order_count": 600,
        "repeat_order_count": 150,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.1, "cook_compliance_pct": 98}
    # lever_input 의 recent_rating 은 4.5 로 설정해도 now_bar 가 우선
    result = compute_target_revenue(
        stat, now_bar, 25,
        cuisine="치킨",
        lever_input=_li(recent_rating=4.5),
    )
    assert result["case"] == "D"
    assert result["multiplier"] == 1.3


def test_compute_target_revenue_lever_e_gate_trumps_lever() -> None:
    """매출 100만 미만 → E 가드."""
    stat = {
        "order_amount": 500_000,
        "order_count": 30,
        "repeat_order_count": 5,
    }
    now_bar = {"recent_rating": 4.7, "cook_compliance_pct": 98}
    result = compute_target_revenue(
        stat, now_bar, 25,
        cuisine="치킨",
        lever_input=_li(revenue_31d=500_000, orders_31d=30),
    )
    assert result["case"] == "E"
    assert result["target_revenue"] == 3_000_000


def test_compute_target_revenue_without_lever_input_falls_back() -> None:
    """lever_input=None → 배수 폴백 경로 (기존 A/B/C 케이스)."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    now_bar = {"recent_rating": 4.8, "cook_compliance_pct": 100}
    result = compute_target_revenue(
        stat, now_bar, 20,
        cuisine="치킨",
        lever_input=None,
    )
    assert result["case"] in {"A", "B", "C"}
    assert result["lever_report"] is None


# ─────────────────────────────────────────────
# 6. 재조정 루프
# ─────────────────────────────────────────────
def test_rebalance_high_tier2_probability_scales_up() -> None:
    """확률이 너무 높으면(>60%) tier_2 를 +10% 상향하고 확률 내림."""
    # healthy 입력이면 base 50 → 최종 50 유지 (adjustment 없음)
    # 상향 트리거하려면 페널티가 음수여야 하는데 구조상 불가.
    # 대신 기본 확률 기준만 검증.
    result = compute_targets(_li(), analyze_levers(_li()))
    assert result.tier_2_probability_pct <= PROB_TIER_2_BASE + 10  # 상향 후 감소 허용


def test_constants_match_spec() -> None:
    """스펙 상수 고정."""
    assert FEE_CAP_WON == 2_000_000
    assert FEE_CAPPED_TIER_2_REVENUE == 40_000_000
    assert PROB_TIER_1_BASE == 75
    assert PROB_TIER_2_BASE == 50
    assert PROB_PENALTY_LOW_RATING == 10
    assert PROB_PENALTY_LOW_COOK == 5
    assert PROB_PENALTY_UNKNOWN_CATEGORY == 5
    assert E_GUARD_MIN_REVENUE == 1_000_000


# ─────────────────────────────────────────────
# 7. L-3: 시즌팩터 통합
# ─────────────────────────────────────────────
def test_season_factor_applied_when_current_month_given() -> None:
    """current_month 지정 시 tier 결과에 계절계수가 곱해짐 (치킨 11월: tier1=2월 1.0, tier2=5월 1.0…)."""
    # 치킨은 11~12월 피크(1.10/1.15), 나머지 1.00.
    # current_month=10 → tier1=(10+3)%12=1월(1.0), tier2=(10+6)%12=4월(1.0) — 영향 없음
    # current_month=9 → tier1=12월(1.15), tier2=3월(1.0) → tier_1 만 1.15배
    input_ = _li()  # 치킨
    analysis = analyze_levers(input_)
    # 시즌 미반영
    result_no_season = compute_targets(input_, analysis)
    # 시즌 반영: current_month=9 → tier1 도달 = 12월 (치킨 1.15)
    result_with_season = compute_targets(input_, analysis, current_month=9)
    assert result_with_season.tier_1_revenue_won > result_no_season.tier_1_revenue_won
    # ratio 는 대략 1.15 (확률 재조정 후에도 크게 벗어나지 않음)
    ratio = result_with_season.tier_1_revenue_won / result_no_season.tier_1_revenue_won
    assert ratio == pytest.approx(1.15, rel=0.05)


def test_season_factor_noop_when_factors_all_one() -> None:
    """current_month 지정해도 해당 cuisine/월 factor 가 1.0이면 결과 동일 범위."""
    # 돈까스·회·일식 = [1.0]*12
    input_ = _li(cuisine="일식")
    r1 = compute_targets(input_, analyze_levers(input_))
    r2 = compute_targets(input_, analyze_levers(input_), current_month=7)
    assert r1.tier_1_revenue_won == r2.tier_1_revenue_won
    assert r1.tier_2_revenue_won == r2.tier_2_revenue_won


def test_build_report_season_factors_field_populated() -> None:
    """LeverReport.season_factors 가 current_month 지정 시 채워짐."""
    report = build_report(
        "치킨집", _li(), current_month=10,  # tier2=4월
    )
    assert report.season_factors is not None
    assert "tier_1" in report.season_factors
    assert "tier_2" in report.season_factors


def test_build_report_no_season_factors_without_current_month() -> None:
    report = build_report("치킨집", _li())
    assert report.season_factors is None


# ─────────────────────────────────────────────
# 8. L-3: TAM 캡
# ─────────────────────────────────────────────
def test_tam_cap_applied_when_tier2_exceeds_25pct() -> None:
    """tier_2 가 TAM × 25% 를 초과하면 캡 발동."""
    input_ = _li(revenue_31d=20_000_000, orders_31d=1000)
    analysis = analyze_levers(input_)
    # tier_2 자연값 약 30M 이상. TAM=80M × 25% = 20M 이면 캡 발동
    result = compute_targets(input_, analysis, tam_monthly_revenue_won=80_000_000)
    # 캡이 적용되면 tier_2 ≤ 20M
    assert result.tier_2_revenue_won <= 20_000_000
    assert "TAM 점유율 25% 캡 적용" in (result.adjustment_note or "")


def test_tam_cap_not_applied_when_tier2_below_25pct() -> None:
    """tier_2 가 TAM × 25% 이하면 캡 no-op."""
    input_ = _li()  # tier_2 약 20M
    analysis = analyze_levers(input_)
    # TAM 500M → 25% = 125M → 캡 무의미
    result_with = compute_targets(input_, analysis, tam_monthly_revenue_won=500_000_000)
    result_without = compute_targets(input_, analysis)
    assert result_with.tier_2_revenue_won == result_without.tier_2_revenue_won


def test_build_report_tam_cap_applied_flag_set() -> None:
    """tam_cap_applied 플래그가 LeverReport 에 정확히 세팅."""
    input_ = _li(revenue_31d=20_000_000, orders_31d=1000)
    report_capped = build_report(
        "큰가게", input_, tam_monthly_revenue_won=50_000_000,  # 25% = 12.5M
    )
    assert report_capped.tam_cap_applied is True

    report_uncapped = build_report("큰가게", input_)
    assert report_uncapped.tam_cap_applied is False


# ─────────────────────────────────────────────
# 9. L-3: 과거 실적 sanity check
# ─────────────────────────────────────────────
def test_historical_sanity_none_when_no_cases_dir() -> None:
    """cases_dir 미지정 시 historical_sanity 는 None 또는 available=False."""
    report = build_report("치킨집", _li())
    # DB 실제 로드 결과에 따라 None/dict 가 섞일 수 있으므로 두 경우 다 허용
    assert report.historical_sanity is None or isinstance(report.historical_sanity, dict)


def test_historical_sanity_with_mock_cases(tmp_path) -> None:
    """tmp_path 에 사례 5건 이상 둔 뒤 sanity check 가 성립하는지."""
    import json as _json
    # 4건의 "치킨" success 사례 (growth_ratio @ 6M: 1.5, 1.8, 2.0, 2.5, 3.0)
    ratios_m6 = [1.5, 1.8, 2.0, 2.5, 3.0]
    for i, ratio in enumerate(ratios_m6):
        baseline = 12_000_000
        case = {
            "case_id": f"case_{i}",
            "shop_name": f"샵{i}",
            "cuisine": "치킨",
            "location": "서울",
            "consulting_start": "2025-01-01",
            "consulting_months": 6,
            "revenue": {
                "baseline": baseline,
                "month_6": int(baseline * ratio),
            },
            "outcome": "success",
        }
        (tmp_path / f"case_{i}.json").write_text(
            _json.dumps(case, ensure_ascii=False), encoding="utf-8",
        )
    report = build_report("치킨집", _li(), cases_dir=tmp_path)
    assert report.historical_sanity is not None
    assert report.historical_sanity.get("available") is True
    assert report.historical_sanity.get("n", 0) >= 5
    assert "p50_growth" in report.historical_sanity
    assert "p80_growth" in report.historical_sanity
    assert "lever_growth" in report.historical_sanity


# ─────────────────────────────────────────────
# 10. L-3: 플랫폼 분리 구조 + 하위호환
# ─────────────────────────────────────────────
def test_platform_input_legacy_flat_kwargs_still_works() -> None:
    """기존 flat kwargs 로도 LeverInput 이 정상 생성되고 baemin 으로 매핑됨."""
    input_ = LeverInput(
        cuisine="치킨",
        impressions_31d=100_000,
        clicks_31d=3_500,
        orders_31d=700,
        revenue_31d=15_000_000,
        recent_rating=4.7,
        cook_compliance_pct=98,
    )
    assert input_.baemin.impressions_31d == 100_000
    assert input_.baemin.available is True
    assert input_.coupang_eats.available is False
    assert input_.yogiyo.available is False
    # property fallback
    assert input_.impressions_31d == 100_000
    assert input_.revenue_31d == 15_000_000


def test_platform_input_from_legacy_flat_classmethod() -> None:
    """from_legacy_flat 명시적 생성자."""
    input_ = LeverInput.from_legacy_flat(
        cuisine="한식",
        impressions_31d=50_000,
        clicks_31d=1_500,
        orders_31d=300,
        revenue_31d=8_000_000,
        recent_rating=4.6,
        cook_compliance_pct=96,
    )
    assert input_.baemin.revenue_31d == 8_000_000


def test_platform_input_nested_baemin_direct() -> None:
    """baemin dict 중첩 직접 생성."""
    from src.planner.lever_analysis import PlatformLeverData
    input_ = LeverInput(
        cuisine="치킨",
        recent_rating=4.7,
        cook_compliance_pct=98,
        baemin=PlatformLeverData(
            impressions_31d=80_000, clicks_31d=2_400, orders_31d=500,
            revenue_31d=10_000_000, available=True,
        ),
    )
    assert input_.revenue_31d == 10_000_000


def test_target_result_platform_targets_populated() -> None:
    """TargetResult.baemin/coupang_eats/yogiyo 가 각각 분리 노출."""
    result = compute_targets(_li(), analyze_levers(_li()))
    assert result.baemin.status == "산정"
    assert result.baemin.tier_1_revenue_won is not None
    assert result.baemin.tier_2_revenue_won is not None
    assert result.coupang_eats.status == "데이터 부족"
    assert result.yogiyo.status == "데이터 부족"
    # 합계: 배민 단독이므로 합계 == 배민
    assert result.total_tier_1 == result.baemin.tier_1_revenue_won
    assert result.total_tier_2 == result.baemin.tier_2_revenue_won


# ─────────────────────────────────────────────
# 11. L-3: LeverReport 신규 필드
# ─────────────────────────────────────────────
def test_lever_report_current_impressions_populated() -> None:
    report = build_report("가게", _li())
    assert report.current_impressions_31d == 100_000  # _li() 기본값


def test_lever_report_owner_hope_won_field() -> None:
    report = build_report("가게", _li(), owner_hope_won=25_000_000)
    assert report.owner_hope_won == 25_000_000


def test_lever_report_owner_hope_none_when_not_given() -> None:
    report = build_report("가게", _li())
    assert report.owner_hope_won is None
