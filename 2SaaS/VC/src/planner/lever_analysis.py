"""4-레버 곱셈 기반 목표매출 산정 (정본).

정본 근거: data/references/목표매출_산정로직.md

공식:
  예측 매출 = [현재노출 × (1 + Δ노출)]
            × [현재CTR × (1 + ΔCTR)]
            × [현재CVR × (1 + ΔCVR)]
            × [현재AOV × (1 + ΔAOV)]

레버별 Δ는 카테고리 벤치마크와 매장 현황의 갭으로 결정론적으로 산출.
정본의 정성 표현("개선폭 중간", "벤치 하단 미달" 등)을 결정론 룰로 매핑.

달성 확률 산출 룰:
  - 1차 기본 75%, 2차 기본 50% (모든 레버가 단기/중기 개선폭 중앙값 달성 전제)
  - 페널티:
      · 평점 < 4.5     → -10%p
      · 조리준수율 <95% → -5%p
      · cuisine 매핑 fallback → -5%p
  - 2차 확률 >60% → tier_2 +10% 상향 후 재계산
  - 1차 확률 <70% → tier_1 -10% 하향 후 재계산

수수료 상한 체크:
  - tier_2 × 5% > 2,000,000원 → tier_2 = 40,000,000 (역산) 강제 조정

L-3 통합 (2026-04-19):
  - 시즌팩터: current_month 지정 시 tier_1=(current+3)월, tier_2=(current+6)월 곱.
  - TAM 캡: tam_monthly × 0.25 로 tier_2 상한 제한.
  - 과거실적 sanity: growth_distribution(month=6) P50/P80 비교 (목표 덮어쓰기 없음).
  - 플랫폼 분리: baemin/coupang_eats/yogiyo 중첩. 미수집 플랫폼은 "현재 유지".
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from src.knowledge.lever_benchmarks import (
    classify_position,
    get_aov_elasticity,
    get_ctr_range,
    get_cvr_range,
    is_known_mapping,
    map_to_benchmark_category,
)

# ─────────────────────────────────────────────
# 결정론 룰 상수 — 정본의 정성 표현을 수치로 매핑
# ─────────────────────────────────────────────
# CTR/CVR 개선폭 중앙값 (벤치마크 위치별)
#   below    : 정본 '+30~50%' / '+25~40%' 범위의 중앙
#   middle   : 정본 '+10~20%' / '+10~15%' 범위의 중앙
#   near_top : 정본 '+0~10%' / '+0~5%' 범위의 중앙
# ─────────────────────────────────────────────
CTR_IMPROVEMENT_SHORT: dict[str, float] = {
    "below": 0.35,
    "middle": 0.15,
    "near_top": 0.05,
}
CTR_IMPROVEMENT_MID: dict[str, float] = {
    "below": 0.50,
    "middle": 0.25,
    "near_top": 0.10,
}
CVR_IMPROVEMENT_SHORT: dict[str, float] = {
    "below": 0.35,
    "middle": 0.12,
    "near_top": 0.03,
}
CVR_IMPROVEMENT_MID: dict[str, float] = {
    "below": 0.50,
    "middle": 0.22,
    "near_top": 0.08,
}

# 노출수 확장률 — 정본 규칙:
#   평점 ≥ 4.5 → 단기 +10%, 중기 +30%
#   평점 <  4.5 → 단기 0%  , 중기 +15%  (하단 제약)
#
# 주의: 이 4.5 는 '레버 1 내부의 노출 확장 가/부' 게이트이며,
# target_revenue.RATING_GATE (4.3) 와는 별개 상수다.
# 정본 §레버 1 "평점 4.5 미만 시 단기 확장 0%" 규칙을 엄격히 따른다.
RATING_FOR_IMPRESSION_EXPANSION = 4.5
IMPRESSION_SHORT_WHEN_RATING_OK = 0.10
IMPRESSION_MID_WHEN_RATING_OK = 0.30
IMPRESSION_SHORT_WHEN_RATING_LOW = 0.00
IMPRESSION_MID_WHEN_RATING_LOW = 0.15

# 객단가 탄력성별 (단기, 중기) — 최대 상승폭 기준으로 단/중기 분할
# 중기는 최대 상승폭의 80%, 단기는 중기의 절반 수준
AOV_IMPROVEMENT_BY_ELASTICITY: dict[str, tuple[float, float]] = {
    "낮음": (0.03, 0.08),
    "중간": (0.05, 0.12),
    "높음": (0.08, 0.18),
}

# 달성 확률 기본값 + 페널티
PROB_TIER_1_BASE = 75
PROB_TIER_2_BASE = 50
PROB_PENALTY_LOW_RATING = 10       # 평점 < 4.5
PROB_PENALTY_LOW_COOK = 5          # 조리준수율 < 95
PROB_PENALTY_UNKNOWN_CATEGORY = 5  # 매핑 fallback

# 확률 재조정 임계
PROB_TIER_1_MIN_TARGET = 70
PROB_TIER_2_MIN_TARGET = 45
PROB_TIER_2_MAX_TARGET = 60

# 수수료 상한 (정본: 200만원)
FEE_CAP_WON = 2_000_000
FEE_RATE_TIER_2 = 0.05
FEE_RATE_TIER_1 = 0.03
# tier_2 캡 초과 시 역산값: 2,000,000 / 0.05 = 40,000,000
FEE_CAPPED_TIER_2_REVENUE = int(FEE_CAP_WON / FEE_RATE_TIER_2)

# E 가드 임계 (정본 외: 신규·소형 매장은 레버 공식 불안정)
E_GUARD_MIN_REVENUE = 1_000_000

# L-3: TAM 점유율 상한 (한 매장이 상권에서 먹을 수 있는 최대 점유율)
TAM_SHARE_CAP = 0.25

# L-3: 과거실적 sanity check 기준 (월)
HISTORICAL_SANITY_MONTH: Literal[3, 6, 12] = 6


# ─────────────────────────────────────────────
# Pydantic 모델
# ─────────────────────────────────────────────
class PlatformLeverData(BaseModel):
    """플랫폼별 31일 통계. available=False 이면 해당 플랫폼 '현재 유지' 처리."""

    impressions_31d: int | None = Field(default=None, ge=0)
    clicks_31d: int | None = Field(default=None, ge=0)
    orders_31d: int | None = Field(default=None, ge=0)
    revenue_31d: int | None = Field(default=None, ge=0)
    available: bool = Field(
        default=False,
        description="이 플랫폼의 스크래핑 성공 여부 (False면 산정 제외)",
    )


class LeverInput(BaseModel):
    """레버 분석 입력 — 플랫폼별 중첩 구조.

    하위호환: 기존 flat kwargs(impressions_31d, clicks_31d, orders_31d, revenue_31d)
    를 그대로 넘기면 baemin 에 자동 매핑된다. `from_legacy_flat` 클래스 메서드도 제공.
    """

    cuisine: str = Field(
        description="매장 카테고리 (industry_keywords 12업종 또는 자유 입력)"
    )
    recent_rating: float = Field(ge=0, le=5.0, description="최근 평점 (0~5)")
    cook_compliance_pct: int = Field(ge=0, le=100, description="조리준수율 %")
    # 플랫폼별 데이터
    baemin: PlatformLeverData = Field(
        default_factory=PlatformLeverData,
        description="배민 31일 통계 (필수 데이터 소스)",
    )
    coupang_eats: PlatformLeverData = Field(
        default_factory=PlatformLeverData,
        description="쿠팡이츠 31일 통계 (L-3 단계에선 available=False 처리)",
    )
    yogiyo: PlatformLeverData = Field(
        default_factory=PlatformLeverData,
        description="요기요 31일 통계 (L-3 단계에선 available=False 처리)",
    )
    # 선택적 입력
    reviewer_count: int | None = Field(default=None, ge=0, description="리뷰 수")
    min_order_amount: int | None = Field(default=None, ge=0, description="최소주문금액")

    @model_validator(mode="before")
    @classmethod
    def _absorb_legacy_flat(cls, data: Any) -> Any:
        """기존 flat 형태(impressions_31d=…) 를 baemin 중첩으로 자동 승격.

        우선순위: 명시된 baemin dict 가 있으면 그것을 유지하되 누락 필드만 flat 값으로 채움.
        """
        if not isinstance(data, dict):
            return data
        flat_keys = ("impressions_31d", "clicks_31d", "orders_31d", "revenue_31d")
        flat_present = {k: data.get(k) for k in flat_keys if k in data and data.get(k) is not None}
        if not flat_present:
            return data
        existing_baemin = data.get("baemin")
        if existing_baemin is None:
            baemin_data: dict[str, Any] = {**flat_present, "available": True}
        elif isinstance(existing_baemin, dict):
            baemin_data = {**existing_baemin}
            for k, v in flat_present.items():
                baemin_data.setdefault(k, v)
            baemin_data.setdefault("available", True)
        else:
            # Already a PlatformLeverData instance — leave as-is
            return {k: v for k, v in data.items() if k not in flat_keys}
        # flat key 제거하고 baemin 으로 대체
        new_data = {k: v for k, v in data.items() if k not in flat_keys}
        new_data["baemin"] = baemin_data
        return new_data

    @classmethod
    def from_legacy_flat(cls, **kwargs: Any) -> LeverInput:
        """명시적 하위호환 생성자. 기존 코드가 명확히 의도를 표현하고 싶을 때 사용."""
        return cls(**kwargs)

    # ── 기존 코드 호환: flat 필드 접근 (배민 데이터) ──
    @property
    def impressions_31d(self) -> int:
        return self.baemin.impressions_31d or 0

    @property
    def clicks_31d(self) -> int:
        return self.baemin.clicks_31d or 0

    @property
    def orders_31d(self) -> int:
        return self.baemin.orders_31d or 0

    @property
    def revenue_31d(self) -> int:
        return self.baemin.revenue_31d or 0


class LeverDelta(BaseModel):
    """레버별 개선폭 — 단기(3M) / 중기(6M)."""

    short_term_pct: float = Field(description="단기 개선률 (0.0 ~ 0.50 범위)")
    mid_term_pct: float = Field(description="중기 개선률")
    basis: str = Field(description="근거 문자열 (현재값·벤치위치·이유)")


class LeverAnalysis(BaseModel):
    """레버별 현황 분석 결과."""

    cuisine_benchmark: str = Field(description="매핑된 벤치 카테고리 (6 중 하나)")
    current_ctr_pct: float = Field(description="현재 CTR (%)")
    current_cvr_pct: float = Field(description="현재 CVR (%)")
    current_aov_won: int = Field(description="현재 객단가 (원)")
    impression_delta: LeverDelta
    ctr_delta: LeverDelta
    cvr_delta: LeverDelta
    aov_delta: LeverDelta


class PlatformTarget(BaseModel):
    """플랫폼별 목표 산정 결과 (L-3 준비: 쿠팡/요기요는 데이터 부족 시 '현재 유지')."""

    baseline_revenue_won: int | None = Field(
        default=None, description="31일 기준 현재 매출 (없으면 None)"
    )
    tier_1_revenue_won: int | None = Field(
        default=None, description="1차 목표 (3M)"
    )
    tier_2_revenue_won: int | None = Field(
        default=None, description="2차 목표 (6M)"
    )
    growth_1_pct: float | None = Field(default=None)
    growth_2_pct: float | None = Field(default=None)
    status: Literal["산정", "데이터 부족", "현재 유지"] = Field(
        default="데이터 부족",
        description=(
            "산정: 레버 공식 적용 / "
            "데이터 부족: 31일 통계 미수집 → 현재값(있다면) 유지 / "
            "현재 유지: 플랫폼 미운영"
        ),
    )


class TargetResult(BaseModel):
    """1차/2차 목표 산정 결과 (합계 + 플랫폼 분리)."""

    tier_1_revenue_won: int = Field(description="1차 목표 매출 (3M, 3% 구간)")
    tier_2_revenue_won: int = Field(description="2차 목표 매출 (6M, 5% 구간)")
    tier_1_growth_pct: float = Field(description="1차 증가율 (%)")
    tier_2_growth_pct: float = Field(description="2차 증가율 (%)")
    tier_1_probability_pct: int = Field(description="1차 달성 확률 (70~80 권장)")
    tier_2_probability_pct: int = Field(description="2차 달성 확률 (45~55 권장)")
    tier_1_monthly_fee_won: int = Field(description="1차 × 3% 예상 수수료")
    tier_2_monthly_fee_won: int = Field(description="2차 × 5% 예상 수수료")
    fee_cap_ok: bool = Field(description="수수료 상한 200만 이내 여부")
    adjustment_note: str | None = Field(
        default=None, description="상한 초과 등으로 조정된 경우 설명",
    )
    # L-3: 플랫폼 분리 목표
    baemin: PlatformTarget = Field(
        default_factory=PlatformTarget,
        description="배민 플랫폼 목표 (현재 유일 데이터 소스)",
    )
    coupang_eats: PlatformTarget = Field(
        default_factory=lambda: PlatformTarget(status="데이터 부족"),
        description="쿠팡이츠 (L-3: '데이터 부족' 고정)",
    )
    yogiyo: PlatformTarget = Field(
        default_factory=lambda: PlatformTarget(status="데이터 부족"),
        description="요기요 (L-3: '데이터 부족' 고정)",
    )
    total_tier_1: int = Field(
        default=0, description="모든 플랫폼 1차 합계 (산정 가능한 것만)"
    )
    total_tier_2: int = Field(
        default=0, description="모든 플랫폼 2차 합계 (산정 가능한 것만)"
    )


class LeverReport(BaseModel):
    """최종 레버 기반 산정서."""

    store_name: str
    cuisine: str
    analysis: LeverAnalysis
    targets: TargetResult
    guard_note: str | None = Field(
        default=None, description="D/E 가드 발동 시 상세 메모",
    )
    sanity_check: dict | None = Field(
        default=None, description="배수 방식 대비 비교 (참고용)",
    )
    disclaimers: list[str] = Field(
        default_factory=list,
        description="데이터 부족·계절 미반영 등 한계 명시",
    )
    # L-3: 신규 필드들
    current_impressions_31d: int | None = Field(
        default=None,
        description="배민 31일 노출수 (섹션 2 레버1 current 라인 표시용)",
    )
    owner_hope_won: int | None = Field(
        default=None,
        description="사장님 희망매출 — 섹션 3 괴리 분석에 직접 사용 (disclaimers 파싱 대체)",
    )
    season_factors: dict[str, float] | None = Field(
        default=None,
        description="tier별 시즌팩터. 예: {'tier_1': 1.15, 'tier_2': 1.00}",
    )
    tam_cap_applied: bool = Field(
        default=False,
        description="상권 TAM 점유율 25% 캡이 tier_2에 실제 발동했는지",
    )
    historical_sanity: dict | None = Field(
        default=None,
        description=(
            "과거실적 분포(P50/P80)와 tier_2 증가율 비교. "
            "{'available': bool, 'n': int, 'p50_growth': float, 'p80_growth': float, "
            "'lever_growth': float, 'verdict': str}"
        ),
    )


# ─────────────────────────────────────────────
# 레버 분석 — 현황 + 개선폭 산정
# ─────────────────────────────────────────────
def analyze_levers(input_: LeverInput) -> LeverAnalysis:
    """4레버 현황 분석 + 벤치마크 갭 기반 개선폭 산정.

    배민 데이터가 유일한 데이터 소스. 쿠팡/요기요는 L-3 범위 밖.
    """
    cuisine = input_.cuisine
    bench_cat = map_to_benchmark_category(cuisine)

    # ── 현재값 계산 (배민 기준) ──
    impressions = input_.impressions_31d
    clicks = input_.clicks_31d
    orders = input_.orders_31d
    revenue = input_.revenue_31d

    ctr_pct = (clicks / impressions) * 100 if impressions > 0 else 0.0
    cvr_pct = (orders / clicks) * 100 if clicks > 0 else 0.0
    aov_won = revenue // orders if orders > 0 else 0

    # ── 레버 1: 노출수 확장 (평점 4.5 규칙 — 정본 §레버 1 엄격 적용) ──
    rating_ok = input_.recent_rating >= RATING_FOR_IMPRESSION_EXPANSION
    if rating_ok:
        imp_short = IMPRESSION_SHORT_WHEN_RATING_OK
        imp_mid = IMPRESSION_MID_WHEN_RATING_OK
        imp_basis = (
            f"평점 {input_.recent_rating:.1f} ≥ 4.5 → "
            f"단기 +{imp_short*100:.0f}% / 중기 +{imp_mid*100:.0f}% (울트라콜·CPC 증설 여력)"
        )
    else:
        imp_short = IMPRESSION_SHORT_WHEN_RATING_LOW
        imp_mid = IMPRESSION_MID_WHEN_RATING_LOW
        imp_basis = (
            f"평점 {input_.recent_rating:.1f} < 4.5 → "
            f"단기 노출 확장 0% (정본 규칙: 전환 안 됨) / 중기 +{imp_mid*100:.0f}%"
        )
    impression_delta = LeverDelta(
        short_term_pct=imp_short, mid_term_pct=imp_mid, basis=imp_basis,
    )

    # ── 레버 2: CTR ──
    ctr_range = get_ctr_range(cuisine)
    ctr_pos = classify_position(ctr_pct, ctr_range)
    ctr_short = CTR_IMPROVEMENT_SHORT[ctr_pos]
    ctr_mid = CTR_IMPROVEMENT_MID[ctr_pos]
    ctr_basis = (
        f"CTR {ctr_pct:.2f}% — {bench_cat} 벤치 {ctr_range[0]:.1f}~{ctr_range[1]:.1f}% "
        f"기준 '{_pos_ko(ctr_pos)}' → 단기 +{ctr_short*100:.0f}% / 중기 +{ctr_mid*100:.0f}%"
    )
    ctr_delta = LeverDelta(
        short_term_pct=ctr_short, mid_term_pct=ctr_mid, basis=ctr_basis,
    )

    # ── 레버 3: CVR ──
    cvr_range = get_cvr_range(cuisine)
    cvr_pos = classify_position(cvr_pct, cvr_range)
    cvr_short = CVR_IMPROVEMENT_SHORT[cvr_pos]
    cvr_mid = CVR_IMPROVEMENT_MID[cvr_pos]
    cvr_basis = (
        f"CVR {cvr_pct:.2f}% — {bench_cat} 벤치 {cvr_range[0]:.1f}~{cvr_range[1]:.1f}% "
        f"기준 '{_pos_ko(cvr_pos)}' → 단기 +{cvr_short*100:.0f}% / 중기 +{cvr_mid*100:.0f}%"
    )
    cvr_delta = LeverDelta(
        short_term_pct=cvr_short, mid_term_pct=cvr_mid, basis=cvr_basis,
    )

    # ── 레버 4: 객단가 (탄력성별) ──
    elasticity_label, max_uplift = get_aov_elasticity(cuisine)
    aov_short, aov_mid = AOV_IMPROVEMENT_BY_ELASTICITY[elasticity_label]
    aov_basis = (
        f"객단가 {aov_won:,}원 — {bench_cat} 탄력성 '{elasticity_label}' "
        f"(최대 +{max_uplift:.0f}%) → 단기 +{aov_short*100:.0f}% / 중기 +{aov_mid*100:.0f}%"
    )
    aov_delta = LeverDelta(
        short_term_pct=aov_short, mid_term_pct=aov_mid, basis=aov_basis,
    )

    return LeverAnalysis(
        cuisine_benchmark=bench_cat,
        current_ctr_pct=round(ctr_pct, 2),
        current_cvr_pct=round(cvr_pct, 2),
        current_aov_won=aov_won,
        impression_delta=impression_delta,
        ctr_delta=ctr_delta,
        cvr_delta=cvr_delta,
        aov_delta=aov_delta,
    )


def _pos_ko(pos: str) -> str:
    return {"below": "하단 미달", "middle": "중간", "near_top": "상단 근접"}.get(pos, pos)


# ─────────────────────────────────────────────
# 목표매출 산정 + 확률 + 수수료 캡
# ─────────────────────────────────────────────
def _project_revenue(
    revenue_31d: int,
    imp_delta: float,
    ctr_delta: float,
    cvr_delta: float,
    aov_delta: float,
) -> int:
    """곱셈 방식 예측 매출. 각 레버의 Δ를 반영한 성장 배수 곱 × 현재 매출."""
    growth_mult = (
        (1 + imp_delta)
        * (1 + ctr_delta)
        * (1 + cvr_delta)
        * (1 + aov_delta)
    )
    return int(revenue_31d * growth_mult)


def _compute_probability(
    input_: LeverInput,
    base_prob: int,
) -> int:
    """페널티 반영 달성 확률 산출. 0~100 범위 클리핑."""
    penalty = 0
    if input_.recent_rating < 4.5:
        penalty += PROB_PENALTY_LOW_RATING
    if input_.cook_compliance_pct < 95:
        penalty += PROB_PENALTY_LOW_COOK
    if not is_known_mapping(input_.cuisine):
        penalty += PROB_PENALTY_UNKNOWN_CATEGORY
    result = base_prob - penalty
    return max(0, min(100, result))


def _tier_month(current_month: int, delta_months: int) -> int:
    """현재월 + N개월 → 1~12 범위 월."""
    return ((current_month - 1 + delta_months) % 12) + 1


def _apply_season_factors(
    tier_1_raw: int,
    tier_2_raw: int,
    cuisine: str,
    current_month: int | None,
) -> tuple[int, int, dict[str, float] | None]:
    """시즌팩터 곱셈. current_month 가 None 이면 no-op.

    tier_1 은 (current+3)월, tier_2 는 (current+6)월 기준으로 계절계수 조회.
    반환: (tier_1_adj, tier_2_adj, season_factors_dict 또는 None).
    """
    if current_month is None:
        return tier_1_raw, tier_2_raw, None
    # lazy import — 순환 의존 회피 및 테스트 경량화
    from src.knowledge.season_factor import get_season_factor

    m1 = _tier_month(current_month, 3)
    m2 = _tier_month(current_month, 6)
    sf_1 = get_season_factor(cuisine, m1)
    sf_2 = get_season_factor(cuisine, m2)
    tier_1_adj = int(tier_1_raw * sf_1)
    tier_2_adj = int(tier_2_raw * sf_2)
    return tier_1_adj, tier_2_adj, {"tier_1": sf_1, "tier_2": sf_2}


def _apply_tam_cap(
    tier_2_value: int,
    tam_monthly_revenue_won: int | None,
) -> tuple[int, bool]:
    """TAM 점유율 25% 캡. tam_monthly 없거나 0 이하면 no-op.

    반환: (tier_2_capped, cap_applied).
    """
    if tam_monthly_revenue_won is None or tam_monthly_revenue_won <= 0:
        return tier_2_value, False
    cap = int(tam_monthly_revenue_won * TAM_SHARE_CAP)
    if cap > 0 and tier_2_value > cap:
        return cap, True
    return tier_2_value, False


def _historical_sanity_check(
    cuisine: str,
    baseline_revenue: int,
    tier_2_revenue: int,
    *,
    cases_dir: Any | None = None,
) -> dict[str, Any] | None:
    """레버 tier_2 증가율 vs 과거 실적 분포(P50/P80) 비교.

    반환:
        None              — DB/샘플 부족 등으로 비교 불가
        dict(available=False, reason) — 그 외 실패
        dict(available=True, n, p50_growth, p80_growth, lever_growth, verdict)
    """
    if not cuisine or baseline_revenue <= 0:
        return None
    # lazy import
    from src.knowledge.historical_cases import (
        filter_cases,
        growth_distribution,
        load_cases,
    )

    try:
        cases = load_cases(cases_dir)
    except Exception:  # pragma: no cover - DB 파싱 실패는 조용히 스킵
        return None
    if not cases:
        return None

    # 동일 cuisine + baseline ±50% + outcome {success, partial}
    tol = 0.5
    lo = int(baseline_revenue * (1 - tol))
    hi = int(baseline_revenue * (1 + tol))
    segment = filter_cases(cases, cuisine=cuisine, min_baseline=lo, max_baseline=hi)
    segment = [c for c in segment if c.outcome in ("success", "partial")]

    dist = growth_distribution(segment, month=HISTORICAL_SANITY_MONTH)  # type: ignore[arg-type]
    n = dist.get("n", 0)
    if n < 3:  # sanity check는 5건 미만이어도 참고용으로 3건부터 표시
        return {
            "available": False,
            "n": n,
            "reason": f"표본 {n}건 < 3건 — 비교 불가",
        }
    p50 = dist.get("p50")
    p80 = dist.get("p80")
    if p50 is None or p80 is None:
        return {"available": False, "n": n, "reason": "분포 계산 실패"}

    lever_ratio = tier_2_revenue / baseline_revenue if baseline_revenue > 0 else 0.0
    # growth (%) = (ratio - 1) * 100
    p50_growth = round((p50 - 1.0) * 100, 1)
    p80_growth = round((p80 - 1.0) * 100, 1)
    lever_growth = round((lever_ratio - 1.0) * 100, 1)

    if lever_ratio > p80:
        verdict = f"공격적 — 내부 P80({p80_growth}%)보다 +{round(lever_growth - p80_growth, 1)}%p 높음"
    elif lever_ratio < p50:
        verdict = f"보수적 — 내부 P50({p50_growth}%)보다 {round(lever_growth - p50_growth, 1)}%p 낮음"
    else:
        verdict = f"정상 범위 (내부 P50 {p50_growth}% ~ P80 {p80_growth}%)"
    return {
        "available": True,
        "n": n,
        "p50_growth": p50_growth,
        "p80_growth": p80_growth,
        "lever_growth": lever_growth,
        "verdict": verdict,
    }


def compute_targets(
    input_: LeverInput,
    analysis: LeverAnalysis,
    *,
    current_month: int | None = None,
    tam_monthly_revenue_won: int | None = None,
) -> TargetResult:
    """레버 분석 → 1차/2차 목표 + 확률 + 수수료 체크.

    재조정 루프:
      - 2차 확률 > 60% → tier_2 +10% 후 재계산 (목표 상향)
      - 1차 확률 < 70% → tier_1 -10% 하향 후 재계산 (목표 하향)

    L-3 파라미터:
      current_month: 시즌팩터 적용용 현재 월 (1~12). None 이면 시즌팩터 미반영.
      tam_monthly_revenue_won: 상권 TAM 월 추정액 (원). 지정 시 tier_2 ≤ TAM×25%.
    """
    revenue_31d = input_.revenue_31d
    # ── 단기/중기 예측 매출 (레버 곱) ──
    tier_1_raw = _project_revenue(
        revenue_31d,
        analysis.impression_delta.short_term_pct,
        analysis.ctr_delta.short_term_pct,
        analysis.cvr_delta.short_term_pct,
        analysis.aov_delta.short_term_pct,
    )
    tier_2_raw = _project_revenue(
        revenue_31d,
        analysis.impression_delta.mid_term_pct,
        analysis.ctr_delta.mid_term_pct,
        analysis.cvr_delta.mid_term_pct,
        analysis.aov_delta.mid_term_pct,
    )

    # ── 시즌팩터 적용 (current_month 지정 시) ──
    tier_1, tier_2, season_factors = _apply_season_factors(
        tier_1_raw, tier_2_raw, input_.cuisine, current_month,
    )

    # ── 확률 산정 ──
    prob_1 = _compute_probability(input_, PROB_TIER_1_BASE)
    prob_2 = _compute_probability(input_, PROB_TIER_2_BASE)

    adjustment_parts: list[str] = []
    if season_factors is not None:
        sf_desc = (
            f"계절성 반영: tier1 ×{season_factors['tier_1']:.2f} / "
            f"tier2 ×{season_factors['tier_2']:.2f}"
        )
        # 시즌팩터가 전부 1.0 이면 실효성 없으니 주석 스킵
        if season_factors["tier_1"] != 1.0 or season_factors["tier_2"] != 1.0:
            adjustment_parts.append(sf_desc)

    # ── 재조정 1: 2차 확률 > 60% → tier_2 상향 ──
    if prob_2 > PROB_TIER_2_MAX_TARGET:
        old_t2 = tier_2
        tier_2 = int(tier_2 * 1.10)
        adjustment_parts.append(
            f"2차 확률 {prob_2}% > 60% → 목표 상향 재산정 "
            f"(₩{old_t2:,} → ₩{tier_2:,}, +10%)"
        )
        prob_2 = max(PROB_TIER_2_MIN_TARGET, prob_2 - 10)

    # ── 재조정 2: 1차 확률 < 70% → tier_1 하향 ──
    if prob_1 < PROB_TIER_1_MIN_TARGET:
        old_t1 = tier_1
        tier_1 = int(tier_1 * 0.90)
        adjustment_parts.append(
            f"1차 확률 {prob_1}% < 70% → 목표 하향 재산정 "
            f"(₩{old_t1:,} → ₩{tier_1:,}, -10%)"
        )
        prob_1 = min(PROB_TIER_1_BASE, prob_1 + 10)

    # ── TAM 캡 적용 (tier_2 ≤ TAM × 25%) ──
    tam_cap_applied = False
    if tam_monthly_revenue_won is not None:
        old_t2 = tier_2
        tier_2, tam_cap_applied = _apply_tam_cap(tier_2, tam_monthly_revenue_won)
        if tam_cap_applied:
            adjustment_parts.append(
                f"상권 TAM 점유율 25% 캡 적용 "
                f"(월 TAM ₩{tam_monthly_revenue_won:,} × 0.25 = ₩{tier_2:,}, "
                f"₩{old_t2:,} → ₩{tier_2:,})"
            )

    # ── 수수료 캡 체크 ──
    fee_t1 = int(tier_1 * FEE_RATE_TIER_1)
    fee_t2 = int(tier_2 * FEE_RATE_TIER_2)
    fee_cap_ok = fee_t2 <= FEE_CAP_WON

    if not fee_cap_ok:
        old_t2 = tier_2
        tier_2 = FEE_CAPPED_TIER_2_REVENUE
        fee_t2 = int(tier_2 * FEE_RATE_TIER_2)
        fee_cap_ok = True
        adjustment_parts.append(
            f"수수료 상한 200만원 적용해 2차 목표를 "
            f"₩{old_t2:,} → ₩{tier_2:,}(4,000만원)으로 재조정"
        )

    # ── 증가율 ──
    growth_1 = (
        round((tier_1 - revenue_31d) / revenue_31d * 100, 1)
        if revenue_31d > 0
        else 0.0
    )
    growth_2 = (
        round((tier_2 - revenue_31d) / revenue_31d * 100, 1)
        if revenue_31d > 0
        else 0.0
    )

    adjustment_note = " / ".join(adjustment_parts) if adjustment_parts else None

    # ── 플랫폼별 목표 분리 ──
    baemin_target = PlatformTarget(
        baseline_revenue_won=revenue_31d if revenue_31d > 0 else None,
        tier_1_revenue_won=tier_1,
        tier_2_revenue_won=tier_2,
        growth_1_pct=growth_1,
        growth_2_pct=growth_2,
        status="산정",
    )
    # L-3: 쿠팡/요기요는 데이터 부족 고정. input_.coupang_eats.available=True 인 경우에만
    # 미래 확장 여지를 두지만, 현재는 배민 단독이므로 '데이터 부족' 유지.
    coupang_target = _platform_target_placeholder(input_.coupang_eats)
    yogiyo_target = _platform_target_placeholder(input_.yogiyo)

    # 합계: 산정된 플랫폼만 더함
    total_t1 = sum(
        pt.tier_1_revenue_won or 0
        for pt in (baemin_target, coupang_target, yogiyo_target)
        if pt.status == "산정"
    )
    total_t2 = sum(
        pt.tier_2_revenue_won or 0
        for pt in (baemin_target, coupang_target, yogiyo_target)
        if pt.status == "산정"
    )

    return TargetResult(
        tier_1_revenue_won=tier_1,
        tier_2_revenue_won=tier_2,
        tier_1_growth_pct=growth_1,
        tier_2_growth_pct=growth_2,
        tier_1_probability_pct=prob_1,
        tier_2_probability_pct=prob_2,
        tier_1_monthly_fee_won=fee_t1,
        tier_2_monthly_fee_won=fee_t2,
        fee_cap_ok=fee_cap_ok,
        adjustment_note=adjustment_note,
        baemin=baemin_target,
        coupang_eats=coupang_target,
        yogiyo=yogiyo_target,
        total_tier_1=total_t1,
        total_tier_2=total_t2,
    )


def _platform_target_placeholder(data: PlatformLeverData) -> PlatformTarget:
    """쿠팡/요기요 placeholder — L-3 범위: 항상 '데이터 부족' 또는 '현재 유지'.

    available=True 이면서 revenue_31d 값이 있으면 '현재 유지'(baseline만 채움)로 노출.
    L-4 이후 실제 스크래핑 붙으면 이 함수에서 레버 공식 적용.
    """
    if data.available and data.revenue_31d and data.revenue_31d > 0:
        return PlatformTarget(
            baseline_revenue_won=data.revenue_31d,
            status="현재 유지",
        )
    return PlatformTarget(status="데이터 부족")


def build_report(
    store_name: str,
    input_: LeverInput,
    owner_hope_won: int | None = None,
    *,
    current_month: int | None = None,
    tam_monthly_revenue_won: int | None = None,
    cases_dir: Any | None = None,
) -> LeverReport:
    """전체 레버 보고서 빌드.

    Args:
        store_name: 매장명
        input_: LeverInput
        owner_hope_won: 사장님 희망매출 (산정 근거 아님 — disclaimer 에서 언급 + 정식 필드 노출)
        current_month: 시즌팩터 적용용 현재 월
        tam_monthly_revenue_won: TAM 캡 적용용 월 TAM 추정액
        cases_dir: 과거실적 DB 경로 (historical_sanity 비교용)
    """
    analysis = analyze_levers(input_)
    targets = compute_targets(
        input_,
        analysis,
        current_month=current_month,
        tam_monthly_revenue_won=tam_monthly_revenue_won,
    )

    # ── disclaimers ──
    disclaimers: list[str] = []
    if not is_known_mapping(input_.cuisine):
        disclaimers.append(
            f"카테고리 '{input_.cuisine}' — 정본 6 벤치마크 미매핑, "
            f"'{analysis.cuisine_benchmark}' 근사 사용 (불확실성 -5%p 반영)"
        )
    if input_.recent_rating < 4.5:
        disclaimers.append(
            f"평점 {input_.recent_rating:.1f} < 4.5 — 단기 노출 확장 0% 제약 (정본 규칙)"
        )
    if input_.cook_compliance_pct < 95:
        disclaimers.append(
            f"조리준수율 {input_.cook_compliance_pct}% < 95% — 운영 지표 개선 선행 필요"
        )
    # 시즌팩터 반영 여부 — L-3: 반영 시 별도 문구
    if targets.adjustment_note and "계절성 반영" in (targets.adjustment_note or ""):
        pass  # 별도 disclaimer 불필요 (섹션 6 assumption_lines 에서 표시)
    elif current_month is None:
        disclaimers.append("계절성 미반영 — 담당자 검토 시 season factor 별도 반영")

    # owner_hope disclaimer (하위호환 유지)
    if owner_hope_won is not None and owner_hope_won > 0:
        diff_pct = (
            round((owner_hope_won - targets.tier_2_revenue_won) / targets.tier_2_revenue_won * 100, 1)
            if targets.tier_2_revenue_won > 0
            else 0.0
        )
        disclaimers.append(
            f"사장님 희망매출 ₩{owner_hope_won:,}원 — 2차 목표 대비 "
            f"{'+' if diff_pct >= 0 else ''}{diff_pct}% "
            f"(희망치는 괴리 설명용 — 산정 근거 아님)"
        )

    # ── guard_note (E 가드는 compute_target_revenue 상위에서 처리, 여기선 참고) ──
    guard_note: str | None = None
    if input_.revenue_31d < E_GUARD_MIN_REVENUE:
        guard_note = (
            f"현재 매출 ₩{input_.revenue_31d:,} < {E_GUARD_MIN_REVENUE:,} — "
            "신규·소형 매장 절대 목표(300만원) 권장. 레버 예측은 참고용."
        )

    # ── 시즌팩터 기록 (노출용) ──
    season_factors: dict[str, float] | None = None
    if current_month is not None:
        from src.knowledge.season_factor import get_season_factor

        m1 = _tier_month(current_month, 3)
        m2 = _tier_month(current_month, 6)
        season_factors = {
            "tier_1": get_season_factor(input_.cuisine, m1),
            "tier_2": get_season_factor(input_.cuisine, m2),
        }

    # ── TAM 캡 발동 여부 ──
    tam_cap_applied = bool(
        targets.adjustment_note and "TAM 점유율 25% 캡" in (targets.adjustment_note or "")
    )

    # ── 과거실적 sanity check ──
    historical_sanity = _historical_sanity_check(
        input_.cuisine,
        input_.revenue_31d,
        targets.tier_2_revenue_won,
        cases_dir=cases_dir,
    )
    if historical_sanity and historical_sanity.get("available"):
        verdict = historical_sanity.get("verdict", "")
        if "공격적" in verdict or "보수적" in verdict:
            disclaimers.append(
                f"내부 실적 분포 대비 {verdict} "
                f"(P80 {historical_sanity['p80_growth']}%, "
                f"레버 {historical_sanity['lever_growth']}%)"
            )

    return LeverReport(
        store_name=store_name,
        cuisine=input_.cuisine,
        analysis=analysis,
        targets=targets,
        guard_note=guard_note,
        sanity_check=None,
        disclaimers=disclaimers,
        current_impressions_31d=input_.impressions_31d if input_.impressions_31d > 0 else None,
        owner_hope_won=owner_hope_won,
        season_factors=season_factors,
        tam_cap_applied=tam_cap_applied,
        historical_sanity=historical_sanity,
    )
