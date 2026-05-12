"""Phase α 안전망 — target_revenue.py 회귀/신규 테스트.

검증 대상:
1. A 케이스 스트레치 라벨 + 전제조건 주석
2. 상한 4.0배 안전캡 클리핑
3. 즉시할인 ROAS 감쇠 (비교는 감쇠, 표시는 원본)
4. 별점 게이트 4.3 상향
5. 기존 분기 로직(D/E/A/B/C) 유지
"""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from src.planner.target_revenue import (  # noqa: E402
    PROMO_DISCOUNT_ROAS_DECAY,
    SAFETY_CAP_MULTIPLIER,
    compute_target_revenue,
)


# ── 공통 now_bar 헬퍼 ──
def ok_now_bar(rating: float = 4.8, cook: float = 100.0) -> dict:
    return {"recent_rating": rating, "cook_compliance_pct": cook}


AVG_REPEAT = 20  # 업종 평균 재주문률 (%)


# ── 1. A 케이스 스트레치 라벨 + 전제조건 주석 ──
def test_case_A_has_stretch_label_and_preconditions():
    """강+강 매장은 '성장 잠재력 큼 (스트레치)' 라벨과 전제조건 주석을 포함."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,  # 재주문률 35% → 평균 대비 +15%p
        "ugk_roas": 9.0,  # 광고 강
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    assert result["case"] == "A"
    assert result["case_label"] == "성장 잠재력 큼 (스트레치)"
    assert "전제조건" in result["rationale"]
    assert "광고비 매출의 5~7%" in result["rationale"]
    assert "메뉴·옵션 전면개편" in result["rationale"]
    assert "6개월" in result["rationale"]


# ── 2. 상한 안전캡 클리핑 ──
def test_safety_cap_clips_extreme_target():
    """A 케이스 2.5배라도 4.0배 캡 아래면 그대로, 넘으면 클리핑.

    현재 매출 100만원 × 2.5 = 250만원은 400만원 캡 아래라 클리핑 안 됨.
    E 케이스는 절대 목표라 캡 미적용 — 별도 테스트.
    대신 B 케이스로 current = 0 근처 예외 방어 겸, 캡 문구는
    별도로 A 케이스 극단값 조건에서 직접 verify.
    """
    # A 2.5배가 TAM 캡(4.0배)을 넘기는 일은 구조상 불가능하므로,
    # 캡 로직 자체를 직접 트리거하려면 내부 helper 경로로 검증.
    from src.planner.target_revenue import _apply_safety_cap

    # 현재 매출 1,000,000 / 목표 계산값 10,000,000 (10배) → 캡 4,000,000으로 클리핑
    clipped, rationale = _apply_safety_cap(
        target_revenue=10_000_000,
        order_amt=1_000_000,
        rationale="테스트 케이스",
    )
    assert clipped == int(1_000_000 * SAFETY_CAP_MULTIPLIER)
    assert "상한 4.0배에서 클리핑" in rationale


def test_safety_cap_no_clip_when_within_bound():
    """계산값이 캡 이하면 원본 유지."""
    from src.planner.target_revenue import _apply_safety_cap

    target, rationale = _apply_safety_cap(
        target_revenue=2_500_000,  # 2.5배
        order_amt=1_000_000,
        rationale="원본 유지",
    )
    assert target == 2_500_000
    assert "클리핑" not in rationale
    assert rationale == "원본 유지"


# ── 3. 즉시할인 ROAS 감쇠 ──
def test_promo_discount_roas_decay_in_comparison():
    """즉시할인 ROAS 20 + 우리가게클릭 ROAS 9.
    감쇠 후 즉시할인=10, 우리가게=9 → 즉시할인 승.
    단, 표시 best_roas는 원본 20.0이어야 함.
    """
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,  # 재주문률 강
        "ugk_roas": 9.0,
        "즉시할인_roas": 20.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    # 감쇠 후 비교: 10 vs 9 → 즉시할인이 최고
    assert result["best_roas_channel"] == "즉시할인"
    # 표시값은 원본 유지
    assert result["best_roas"] == pytest.approx(20.0)
    # 비교 ROAS는 20*0.5 = 10 → ad_strong(>=8) 충족 + rep_strong → A
    assert result["case"] == "A"


def test_promo_decay_flips_channel_selection():
    """즉시할인 ROAS가 우리가게 ROAS의 2배 이하면 감쇠 후 우리가게 승.
    즉시할인 14 (감쇠 7) vs 우리가게 9 → 우리가게 채널 반환.
    """
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,  # 재주문률 20% — 평균 수준
        "ugk_roas": 9.0,
        "즉시할인_roas": 14.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    # 감쇠 후 비교: 9 (우리가게) > 7 (즉시할인 14*0.5) → 우리가게 승
    assert result["best_roas_channel"] == "우리가게클릭"
    # 표시값도 우리가게 원본
    assert result["best_roas"] == pytest.approx(9.0)


def test_promo_decay_coefficient_constant():
    """감쇠 계수는 0.5 (계약)."""
    assert PROMO_DISCOUNT_ROAS_DECAY == 0.5


# ── 4. 별점 게이트 4.3 상향 ──
def test_rating_4_1_triggers_D_case():
    """별점 4.1은 4.3 미달 → D 케이스 (운영 정비)."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(rating=4.1), AVG_REPEAT)
    assert result["case"] == "D"
    assert result["case_label"] == "운영 정비 우선"
    assert result["multiplier"] == 1.3


def test_rating_4_5_skips_D_case():
    """별점 4.5는 4.3 이상 → D 아닌 A/B/C로 진행."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(rating=4.5), AVG_REPEAT)
    assert result["case"] != "D"
    # 강+강 조건 충족 → A
    assert result["case"] == "A"


def test_rating_exactly_4_3_passes_gate():
    """4.3 경계값은 통과 (게이트 조건은 rating < 4.3)."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 30,  # 재주문 평균
        "ugk_roas": 6.0,  # 중간
    }
    result = compute_target_revenue(stat, ok_now_bar(rating=4.3), AVG_REPEAT)
    assert result["case"] != "D"


# ── 5. 기존 분기 로직 유지 (회귀) ──
def test_case_E_small_shop_absolute_target():
    """현재 매출 < 100만원 → 절대 목표 300만원."""
    stat = {
        "order_amount": 500_000,
        "order_count": 30,
        "repeat_order_count": 5,
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    assert result["case"] == "E"
    assert result["target_revenue"] == 3_000_000
    assert result["multiplier"] is None


def test_case_C_weak_ad_or_repeat():
    """광고 약(ROAS < 5) 또는 재주문률 약 → C."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,  # 20%, 평균 수준
        "ugk_roas": 3.0,  # 약
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    assert result["case"] == "C"
    assert result["multiplier"] == 1.5


def test_case_B_default():
    """중간 광고 + 평균 재주문 → B (2.0배)."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,  # 20%, 평균 수준
        "ugk_roas": 6.0,  # 중간 (5~7.99)
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    assert result["case"] == "B"
    assert result["multiplier"] == 2.0
    assert result["target_revenue"] == 10_000_000


# ─────────────────────────────────────────────
# Phase β: tier 분할 (3/6/12개월)
# ─────────────────────────────────────────────
def test_tier_plan_A_case_pasta_april():
    """A 케이스, 현재월=4, 업종=파스타(시즌 1.0 전역) → tier1=1.6배, tier2=2.05배, tier3=2.5배.

    ratio 0.4 → 1 + (2.5-1)*0.4 = 1.60
    ratio 0.7 → 1 + (2.5-1)*0.7 = 2.05
    ratio 1.0 → 1 + (2.5-1)*1.0 = 2.50
    """
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,  # +15%p → 강
        "ugk_roas": 9.0,  # 강
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4, cuisine="파스타",
    )
    assert result["case"] == "A"
    plan = result["tier_plan"]
    assert plan is not None
    # 파스타는 season=1.0 전역
    assert plan["tier1_3m"]["season_factor"] == 1.0
    assert plan["tier2_6m"]["season_factor"] == 1.0
    assert plan["tier3_12m"]["season_factor"] == 1.0
    # 배수 확인 (A=2.5 기준)
    assert plan["tier1_3m"]["multiplier"] == 1.60
    assert plan["tier2_6m"]["multiplier"] == 2.05
    assert plan["tier3_12m"]["multiplier"] == 2.50
    # 월 확인 (current=4 → 7/10/4)
    assert plan["tier1_3m"]["month"] == 7
    assert plan["tier2_6m"]["month"] == 10
    assert plan["tier3_12m"]["month"] == 4
    # 목표 = order_amt × multiplier × season
    assert plan["tier1_3m"]["target"] == int(5_000_000 * 1.60 * 1.0)
    assert plan["tier2_6m"]["target"] == int(5_000_000 * 2.05 * 1.0)
    assert plan["tier3_12m"]["target"] == int(5_000_000 * 2.50 * 1.0)


def test_tier_plan_B_case_multipliers():
    """B 케이스, 파스타, current=4 → tier1/2/3 배수 1.4/1.7/2.0."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4, cuisine="파스타",
    )
    assert result["case"] == "B"
    plan = result["tier_plan"]
    assert plan["tier1_3m"]["multiplier"] == 1.40
    assert plan["tier2_6m"]["multiplier"] == 1.70
    assert plan["tier3_12m"]["multiplier"] == 2.00


def test_tier_plan_D_case_is_none():
    """D 케이스는 tier 분할 불가."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(rating=4.1), AVG_REPEAT,
        current_month=4, cuisine="파스타",
    )
    assert result["case"] == "D"
    assert result["tier_plan"] is None


def test_tier_plan_E_case_is_none():
    """E 케이스도 tier 분할 불가."""
    stat = {
        "order_amount": 500_000,
        "order_count": 30,
        "repeat_order_count": 5,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4, cuisine="파스타",
    )
    assert result["case"] == "E"
    assert result["tier_plan"] is None


def test_tier_plan_season_factor_applied_jungshik():
    """중식 매장, 현재월=4 → tier1(7월)에 시즌 1.3 적용.

    현재 매출 500만원, A 케이스 기준 tier1 배수 1.6 × 시즌 1.3 = 2.08 배
    목표 = 5,000,000 × 1.6 × 1.3 = 10,400,000원
    """
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,  # 강
        "ugk_roas": 9.0,  # 강
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4, cuisine="중식",
    )
    assert result["case"] == "A"
    plan = result["tier_plan"]
    # tier1 = 7월 (중식 장마 피크 1.30)
    assert plan["tier1_3m"]["month"] == 7
    assert plan["tier1_3m"]["season_factor"] == 1.30
    expected_raw = int(5_000_000 * 1.60 * 1.30)
    # SAFETY_CAP = 5,000,000 * 4.0 = 20,000,000 이상이라 클리핑 없음
    assert plan["tier1_3m"]["target"] == expected_raw
    # tier2 = 10월 (중식 시즌 1.0)
    assert plan["tier2_6m"]["month"] == 10
    assert plan["tier2_6m"]["season_factor"] == 1.0


def test_tier_plan_cap_applied_per_tier():
    """안전캡은 각 tier 에 개별 적용 — 매우 공격적 base_multiplier 에서도 4.0배 한도.

    A 케이스 2.5배 × 시즌 1.3 × ratio 1.0 = 3.25배지만 캡 4.0배 이하라 클리핑 없음.
    직접 극단 시나리오 구성하긴 어렵지만, tier3가 tier1/2보다 크거나 같은지
    (시즌 동일 시 단조 증가) 확인.
    """
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 70,
        "ugk_roas": 9.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4, cuisine="파스타",  # season=1.0 전역
    )
    plan = result["tier_plan"]
    # 시즌 동일 시 tier1 < tier2 < tier3
    assert plan["tier1_3m"]["target"] < plan["tier2_6m"]["target"]
    assert plan["tier2_6m"]["target"] < plan["tier3_12m"]["target"]
    # 모두 캡(4.0배) 이하
    cap = 5_000_000 * 4
    assert plan["tier3_12m"]["target"] <= cap


def test_tier_plan_default_current_month_uses_now():
    """current_month=None 이면 datetime.now().month 사용 (실행 시점 기준)."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(stat, ok_now_bar(), AVG_REPEAT)
    # None → datetime.now().month 가 1~12 중 하나라 tier_plan 은 반드시 존재
    assert result["tier_plan"] is not None
    assert result["tier_plan"]["tier1_3m"]["month"] in range(1, 13)


def test_tier_plan_cuisine_empty_defaults_to_1():
    """cuisine 미지정 시 모든 tier 시즌팩터 1.0."""
    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,
        "ugk_roas": 6.0,
    }
    result = compute_target_revenue(
        stat, ok_now_bar(), AVG_REPEAT,
        current_month=4,
    )
    plan = result["tier_plan"]
    assert plan["tier1_3m"]["season_factor"] == 1.0
    assert plan["tier2_6m"]["season_factor"] == 1.0
    assert plan["tier3_12m"]["season_factor"] == 1.0
