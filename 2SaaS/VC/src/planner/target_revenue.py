"""목표 매출 케이스별 산출 룰.

**정본 로직 (L-1 이후)**: 4-레버 곱셈 방식.
  - `compute_target_revenue(..., lever_input=LeverInput(...))` 로 호출하면
    `src.planner.lever_analysis.build_report()` 가 주 산정 경로.
  - D/E 가드는 유지되지만, A/B/C 배수 방식은 **sanity check / 폴백**으로 격하.
  - 정본 근거: `data/references/목표매출_산정로직.md`

5케이스 분류 (폴백 경로 — 배수 방식):
  D: 운영 게이트 미달 (별점 < 4.3 OR 조리준수율 < 95%) → 1.3배
  E: 신규/소형 (현재 매출 < 100만원)              → 절대 목표 300만원
  A: 강+강 (광고 ROAS ≥ 8 AND 재주문률 평균 +10%p↑) → 2.5배 (스트레치)
  C: 약 포함 (광고 ROAS < 5 OR 재주문률 평균 -10%p↓) → 1.5배
  B: 그 외                                        → 2.0배

판단 변수:
  - 광고 효율: max(ugk_roas, 즉시할인_roas × 0.5, 배민클럽_roas) — 비교용
    (즉시할인은 할인액이 매출·ROAS를 수학적으로 부풀리므로 0.5 감쇠해 비교)
  - 재주문률 비율: repeat_count / order_count vs 업종 평균
  - 운영 게이트: 별점(4.3 기준), 조리준수율(95%)

공통 안전망:
  - 상한 안전캡: 최종 target_revenue = min(계산값, current_revenue × 4.0)
    상권 TAM(총시장규모) 연동 전 임시 상한. 4배 이상은 현실성 검토 필요.

Phase α 안전망 (2026-04-19):
  - A 2.5배는 KDI 평균(+33%)의 2배 이상 공격적 — 상위 10% 매장 전용 '스트레치'.
    전제조건: ①광고비 매출의 5~7% 투입 ②메뉴·옵션 전면개편 ③6개월 기간 기준.
  - 즉시할인 ROAS 감쇠(0.5): 할인 구조상 ROAS가 수학적으로 인플레되므로
    A/C 분기 비교에만 감쇠값 사용, 반환값/표시용은 원본 유지.
  - 별점 게이트 4.3 상향: 배달앱 현실 기준(4.0 밑은 이미 노출 제한 구간).
  - 상한 4.0배 캡: TAM 연동 전 공격적 목표치를 자동으로 클리핑.

Phase γ-4 (2026-04-19):
  - A/B/C 하드코딩 상수(2.5/2.0/1.5)를 과거 실적 분포(P50/P80)로 오버라이드.
  - 세그먼트: 동일 cuisine + baseline ±50% + outcome ∈ {success, partial}.
  - n >= MIN_CASES_FOR_OVERRIDE(5) 일 때만 발동, 아니면 기존 상수 폴백.
  - D(운영정비 1.3배), E(신규·소형 절대 300만) 는 성격이 달라 오버라이드 대상 아님.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from src.knowledge.season_factor import get_season_factor

if TYPE_CHECKING:
    from src.planner.lever_analysis import LeverInput, LeverReport

# 상한 안전캡 (상권 TAM 연동 전 임시)
SAFETY_CAP_MULTIPLIER = 4.0

# 즉시할인 ROAS 감쇠 계수 (할인액이 ROAS를 부풀리는 구조적 편향 보정)
PROMO_DISCOUNT_ROAS_DECAY = 0.5

# 별점 게이트 (배달앱 현실 기준)
#
# 담당자 지시(2026-04-21 미팅): 정본 §레버 1 엄격 기준은 4.5 이지만,
# target_revenue 의 D 케이스(운영 게이트 미달) 진입 기준은 현장 감각으로 4.3 로 완화.
# → 평점 4.3~4.5 구간은 D 케이스로 떨어지지는 않되, lever_analysis 내부에서
#   노출 확장 레버(RATING_FOR_IMPRESSION_EXPANSION=4.5) 만 0% 로 제약된다.
# 담당자가 별도로 4.5 상향을 요청하기 전까지 4.3 을 유지한다.
RATING_GATE = 4.3

# ── Phase γ-4: 과거 실적 기반 오버라이드 ──
# 세그먼트에 속하는 사례가 이 개수 이상이어야 분포 교체 발동.
# 5건 기준: 단일 outlier 영향이 P80에서 20%p 수준으로 제한됨.
MIN_CASES_FOR_OVERRIDE = 5

# 매장 baseline 에서 동일 세그먼트로 볼 허용 범위 (±50%).
# 예: order_amt=10M → 5M~15M baseline 의 사례들만 포함.
BASELINE_TIER_TOLERANCE = 0.5

# 분포 계산 기준 개월 (계약 주기 중심치). 6M = tier2 도달 지점.
HISTORICAL_BASIS_MONTH: int = 6

# ── Phase β: tier 분할 (3/6/12개월) ──
# TIER_RATIOS: 최종 배수까지의 도달 비율
#   3개월차(tier1)는 기간·체감 어려운 스트레치라 40%만 부담
#   6개월차(tier2)는 70%, 12개월차(tier3)는 최종 100% 도달
TIER_RATIOS: dict[str, float] = {"3M": 0.4, "6M": 0.7, "12M": 1.0}
TIER_MONTH_DELTA: dict[str, int] = {"3M": 3, "6M": 6, "12M": 12}


def _tier_multiplier(base_multiplier: float, ratio: float) -> float:
    """base=2.0, ratio=0.4 → 1 + (2.0-1)*0.4 = 1.4배 (점진적 도달)."""
    return 1 + (base_multiplier - 1) * ratio


def _month_offset(current_month: int, delta_months: int) -> int:
    """현재월 + N개월 → 1~12 범위 월. (current=4, delta=3 → 7)."""
    return ((current_month - 1 + delta_months) % 12) + 1


def _best_ad_channel(stat: dict) -> tuple[str, float]:
    """광고 채널 중 최고 ROAS 반환. (채널명, ROAS) — 없으면 ('데이터 없음', 0.0).

    비교는 즉시할인에 감쇠(0.5)를 적용한 값으로 하지만, 반환값은 원본 ROAS다.
    (감쇠는 A/C 분기 판단 왜곡 방지 목적. 사용자 노출 값은 원본 유지.)
    """
    ugk = stat.get("ugk_roas") or 0
    promo = stat.get("즉시할인_roas") or 0
    club = stat.get("배민클럽_roas") or 0

    # 비교용 키: 즉시할인만 감쇠
    candidates: list[tuple[str, float, float]] = [
        # (채널명, 원본 ROAS, 비교용 ROAS)
        ("우리가게클릭", ugk, ugk),
        ("즉시할인", promo, promo * PROMO_DISCOUNT_ROAS_DECAY),
        ("배민클럽", club, club),
    ]
    valid = [(c, orig, adj) for c, orig, adj in candidates if orig > 0]
    if not valid:
        return ("광고 데이터 없음", 0.0)
    # 비교는 adj 기준, 반환은 원본
    best = max(valid, key=lambda x: x[2])
    return (best[0], best[1])


def _best_comparison_roas(stat: dict) -> float:
    """A/C 분기용 비교 ROAS (즉시할인 감쇠 반영)."""
    ugk = stat.get("ugk_roas") or 0
    promo = stat.get("즉시할인_roas") or 0
    club = stat.get("배민클럽_roas") or 0
    adjusted = [
        ugk,
        promo * PROMO_DISCOUNT_ROAS_DECAY,
        club,
    ]
    valid = [r for r in adjusted if r > 0]
    return max(valid) if valid else 0.0


def _apply_safety_cap(
    target_revenue: int,
    order_amt: int,
    rationale: str,
    *,
    cap_override: int | None = None,
    cap_source: str = "fallback_4x",
) -> tuple[int, str]:
    """상한 안전캡 적용. 클리핑 발생 시 rationale에 사유 추가.

    cap_override: TAM 기반 캡 등 외부에서 주입된 상한. 지정 시 기본 4.0배 캡과
                  비교해 더 작은 쪽(엄격)을 실제 캡으로 사용한다.
    cap_source:   로그/근거용 캡 출처 태그.
    """
    fallback_cap = int(order_amt * SAFETY_CAP_MULTIPLIER)
    if cap_override is not None and cap_override > 0:
        cap = min(fallback_cap, cap_override)
        tam_wins = cap == cap_override and cap_override < fallback_cap
    else:
        cap = fallback_cap
        tam_wins = False

    if target_revenue > cap > 0:
        if tam_wins:
            suffix = (
                f" (상권 TAM 상한 {cap:,}원에서 클리핑 — 출처: {cap_source})"
            )
        else:
            suffix = " (상권 TAM 연동 전 임시 상한 4.0배에서 클리핑)"
        return cap, rationale + suffix
    return target_revenue, rationale


# tier_key → 반환 필드명 (고정 매핑)
_TIER_FIELD_NAMES: dict[str, str] = {
    "3M": "tier1_3m",
    "6M": "tier2_6m",
    "12M": "tier3_12m",
}


def _build_tier_plan(
    order_amt: int,
    base_multiplier: float,
    current_month: int,
    cuisine: str,
    *,
    tam_cap: int | None = None,
) -> dict[str, dict[str, Any]]:
    """A/B/C 케이스용 tier1/2/3 분할 계획.

    각 tier = int(order_amt × tier_multiplier × tier_season_factor).
    안전캡(4.0배 또는 tam_cap 중 작은 쪽)은 각 tier 에 개별 적용.
    """
    plan: dict[str, dict[str, Any]] = {}
    fallback_cap = int(order_amt * SAFETY_CAP_MULTIPLIER) if order_amt > 0 else 0
    if tam_cap is not None and tam_cap > 0 and fallback_cap > 0:
        cap = min(fallback_cap, tam_cap)
    else:
        cap = fallback_cap
    for tier_key, ratio in TIER_RATIOS.items():
        delta = TIER_MONTH_DELTA[tier_key]
        tier_month = _month_offset(current_month, delta)
        tier_mult = _tier_multiplier(base_multiplier, ratio)
        season = get_season_factor(cuisine, tier_month)
        raw_target = int(order_amt * tier_mult * season)
        target = min(raw_target, cap) if cap > 0 else raw_target
        plan[_TIER_FIELD_NAMES[tier_key]] = {
            "month": tier_month,
            "multiplier": round(tier_mult, 2),
            "season_factor": season,
            "target": target,
        }
    return plan


def _historical_override(
    order_amt: int,
    cuisine: str,
    *,
    cases_dir: Path | None = None,
) -> dict[str, Any] | None:
    """과거 실적 분포로 base_multiplier 오버라이드 정보 산출.

    세그먼트 조건:
      - cuisine 일치 (완전 매칭)
      - baseline ∈ [order_amt × (1-tol), order_amt × (1+tol)] (tol=BASELINE_TIER_TOLERANCE)
      - outcome ∈ {"success", "partial"} — "ongoing"/"stall" 은 제외
                                          (미완결/실패 사례 편향 방지)

    그리고 HISTORICAL_BASIS_MONTH 기준 growth_ratio 가 존재하는 사례만 집계.

    Returns:
        충분한 샘플(n >= MIN_CASES_FOR_OVERRIDE) 발견 시:
          {"p50": float, "p80": float, "n": int, "month": int,
           "source": "historical_cases_v1", "cuisine": str, "baseline_band": (lo, hi)}
        샘플 부족/cuisine 빈 문자열/order_amt 비정상 → None.
    """
    # 방어: cuisine 비었거나 order_amt 0 이하면 오버라이드 미발동
    if not cuisine or order_amt <= 0:
        return None

    # lazy import — 순환 의존 방지 + 테스트 시 모듈 경량화
    from src.knowledge.historical_cases import (
        filter_cases,
        growth_distribution,
        load_cases,
    )

    cases = load_cases(cases_dir)
    if not cases:
        return None

    tol = BASELINE_TIER_TOLERANCE
    lo = int(order_amt * (1 - tol))
    hi = int(order_amt * (1 + tol))

    # 1차 필터: cuisine + baseline 범위
    segment = filter_cases(cases, cuisine=cuisine, min_baseline=lo, max_baseline=hi)
    # 2차 필터: outcome (success + partial만. filter_cases는 단일 outcome만 받으므로 수동 필터)
    segment = [c for c in segment if c.outcome in ("success", "partial")]

    dist = growth_distribution(segment, month=HISTORICAL_BASIS_MONTH)  # type: ignore[arg-type]
    if dist["n"] < MIN_CASES_FOR_OVERRIDE:
        return None
    if dist["p50"] is None or dist["p80"] is None:
        return None

    return {
        "p50": float(dist["p50"]),
        "p80": float(dist["p80"]),
        "n": int(dist["n"]),
        "month": HISTORICAL_BASIS_MONTH,
        "source": "historical_cases_v1",
        "cuisine": cuisine,
        "baseline_band": (lo, hi),
    }


def _override_suffix(override: dict[str, Any]) -> str:
    """rationale 에 append 할 오버라이드 근거 문구."""
    return (
        f" (내부 실적 {override['n']}건 기반, "
        f"P50={override['p50']:.2f}/P80={override['p80']:.2f})"
    )


def compute_target_revenue(
    stat: dict[str, Any],
    now_bar: dict[str, Any],
    avg_repeat_pct: int,
    *,
    current_month: int | None = None,
    cuisine: str = "",
    address: str | None = None,
    cases_dir: Path | None = None,
    use_historical: bool = True,
    lever_input: LeverInput | None = None,
    owner_hope_won: int | None = None,
    store_name: str = "",
) -> dict[str, Any]:
    """매장 데이터 → 목표 매출 + 케이스 분류 + 산정 근거.

    ── 정본 (L-1): lever_input 지정 시 ──
        4-레버 곱셈 방식(`src.planner.lever_analysis.build_report`)이 주 산정.
        D/E 가드는 그대로 유지(운영지표·소형매장은 레버 공식 전에 차단).
        A/B/C 배수 방식은 여기서 sanity_check 로 동시 산출되어 `lever_report.sanity_check` 에 담긴다.

    ── 폴백 (lever_input=None) ──
        배수 방식(2.5/2.0/1.5)이 과거와 동일하게 동작. 과도기용.
        rationale 접두에 "[sanity-check 폴백]" 표기가 붙는다.

    Args:
        stat: 매출/주문/광고 데이터
        now_bar: 운영 지표 (별점, 조리준수율 등)
        avg_repeat_pct: 업종 평균 재주문률 (%)
        current_month: 1~12. None이면 datetime.now().month 사용
        cuisine: 시즌팩터 조회용 업종명 (없으면 전 tier season=1.0)
        address: 매장 주소. 지정 시 상권 TAM 모듈을 조회해 상한 캡 보정.
        cases_dir: 과거 실적 사례 디렉토리.
        use_historical: False 면 오버라이드 비활성화. 기본 True.
        lever_input: 레버 분석 입력 (정본 경로). None 이면 배수 폴백.
        owner_hope_won: 사장님 희망매출 (참고 — disclaimer 에서만).

    Returns:
        {
            "current_revenue": int,
            "target_revenue": int,         # 정본 경로면 tier_2 / 폴백은 배수 결과
            "multiplier": float | None,    # E 케이스는 None (절대 목표)
            "case": "A"|"B"|"C"|"D"|"E"|"LEVER",
            "case_label": str,
            "rationale": str,              # KPI sub_label에 노출
            "best_roas": float,            # 원본 ROAS (표시용)
            "best_roas_channel": str,
            "repeat_pct": float,
            "repeat_diff_pp": float,       # 업종 평균 대비 차이 (%p)
            "tier_plan": dict | None,      # A/B/C 만 분할, D/E 는 None
            "tam_meta": dict | None,
            "lever_report": dict | None,   # 정본 경로에서만 존재 (model_dump())
        }
    """
    order_amt = stat.get("order_amount", 0)
    order_cnt = stat.get("order_count", 0) or 1
    repeat_cnt = stat.get("repeat_order_count", 0)
    repeat_pct = round(repeat_cnt / order_cnt * 100, 1) if order_cnt else 0.0
    repeat_diff = round(repeat_pct - avg_repeat_pct, 1)

    cook = now_bar.get("cook_compliance_pct", 100)
    rating = now_bar.get("recent_rating", 5.0)

    best_channel, best_roas = _best_ad_channel(stat)
    comparison_roas = _best_comparison_roas(stat)

    if current_month is None:
        current_month = datetime.now().month

    base: dict[str, Any] = {
        "current_revenue": order_amt,
        "best_roas": best_roas,
        "best_roas_channel": best_channel,
        "repeat_pct": repeat_pct,
        "repeat_diff_pp": repeat_diff,
        "lever_report": None,  # 정본 경로 사용 시에만 채움
    }

    # ── 상권 TAM 조회 (address 지정 시에만) ──
    # 의존성/키/SHP 없으면 available=False 로 조용히 폴백. 기존 4.0배 캡 유지.
    tam_cap: int | None = None
    tam_meta: dict[str, Any] | None = None
    if address:
        # 순환 의존 방지 + market 패키지 lazy load
        from src.market.tam_estimator import (
            estimate_tam,
            target_revenue_cap_from_tam,
        )

        _tam = estimate_tam(address, cuisine=cuisine or None)
        tam_meta = _tam.model_dump()
        tam_cap = target_revenue_cap_from_tam(_tam)
    base["tam_meta"] = tam_meta

    # ── 게이트 D: 운영 부적합 (정본·폴백 공통) ──
    # 정본도 D 유지: 운영 게이트 미달 시 레버 개선 자체가 불가능한 케이스 인정.
    if rating < RATING_GATE or cook < 95:
        target, rationale = _apply_safety_cap(
            int(order_amt * 1.3),
            order_amt,
            (
                f"별점 {rating} / 조리준수율 {cook:.0f}% — 게이트 미달. "
                "운영 지표 회복 후 매출 목표 재평가"
            ),
            cap_override=tam_cap,
        )
        return {
            **base,
            "target_revenue": target,
            "multiplier": 1.3,
            "case": "D",
            "case_label": "운영 정비 우선",
            "rationale": rationale,
            "tier_plan": None,  # D: 운영 정비 선행 → tier 분할 불가
        }

    # ── 게이트 E: 신규·소형 매장 (정본·폴백 공통) ──
    if order_amt < 1_000_000:
        # E는 절대 목표(300만원). 레버 공식 불안정 구간.
        return {
            **base,
            "target_revenue": 3_000_000,
            "multiplier": None,
            "case": "E",
            "case_label": "신규·소형 매장",
            "rationale": (
                f"현재 매출 {order_amt:,}원 — 신규/소형 매장 절대 목표 300만원 적용"
            ),
            "tier_plan": None,  # E: 절대 목표 → tier 분할 불가
        }

    # ── 정본 경로: lever_input 지정 시 4-레버 곱셈 산정 ──
    if lever_input is not None:
        return _lever_path(
            base=base,
            stat=stat,
            lever_input=lever_input,
            current_month=current_month,
            cuisine=cuisine,
            tam_cap=tam_cap,
            tam_meta=tam_meta,
            avg_repeat_pct=avg_repeat_pct,
            cases_dir=cases_dir,
            use_historical=use_historical,
            owner_hope_won=owner_hope_won,
            store_name=store_name,
        )

    # ── 폴백 경로: A/B/C 배수 방식 (sanity check / 과도기 하위호환) ──
    # A/B/C 분류 (비교 ROAS는 즉시할인 0.5 감쇠 반영)
    ad_strong = comparison_roas >= 8
    ad_weak = comparison_roas < 5
    rep_strong = repeat_diff > 10
    rep_weak = repeat_diff < -10

    # Phase γ-4: A/B/C 진입 전 과거 실적 오버라이드 시도 (1회 공유).
    # use_historical=False 또는 샘플 부족 시 None → 기존 상수 폴백.
    override: dict[str, Any] | None = None
    if use_historical:
        override = _historical_override(order_amt, cuisine, cases_dir=cases_dir)

    if ad_strong and rep_strong:
        # A: 스트레치 — 오버라이드 있으면 P80 사용, 없으면 2.5 상수
        base_mult_a = override["p80"] if override else 2.5
        base_rationale_a = (
            f"광고 효율 강({best_channel} ROAS {best_roas:.1f}배) + "
            f"재주문률 강(평균 {avg_repeat_pct}% 대비 +{repeat_diff:.0f}%p)"
            " — 전제조건: ①광고비 매출의 5~7% 투입 ②메뉴·옵션 전면개편 ③6개월 기간 기준"
        )
        if override:
            base_rationale_a += _override_suffix(override)
        target, rationale = _apply_safety_cap(
            int(order_amt * base_mult_a),
            order_amt,
            base_rationale_a,
            cap_override=tam_cap,
        )
        return {
            **base,
            "target_revenue": target,
            "multiplier": base_mult_a,
            "case": "A",
            "case_label": "성장 잠재력 큼 (스트레치)",
            "rationale": rationale,
            "tier_plan": _build_tier_plan(
                order_amt, base_mult_a, current_month, cuisine, tam_cap=tam_cap,
            ),
        }

    if ad_weak or rep_weak:
        # C: 보수 — 오버라이드 있으면 P50, 없으면 1.5 상수 (판정은 유지)
        base_mult_c = override["p50"] if override else 1.5
        weak_pts = []
        if ad_weak:
            weak_pts.append(f"광고 효율 약({best_channel} ROAS {best_roas:.1f}배)")
        if rep_weak:
            weak_pts.append(
                f"재주문률 약(평균 {avg_repeat_pct}% 대비 {repeat_diff:+.0f}%p)"
            )
        rationale_c = " + ".join(weak_pts) + " — 보강 후 재평가 권장"
        if override:
            rationale_c += _override_suffix(override)
        target, rationale = _apply_safety_cap(
            int(order_amt * base_mult_c),
            order_amt,
            rationale_c,
            cap_override=tam_cap,
        )
        return {
            **base,
            "target_revenue": target,
            "multiplier": base_mult_c,
            "case": "C",
            "case_label": "보수적 성장",
            "rationale": rationale,
            "tier_plan": _build_tier_plan(
                order_amt, base_mult_c, current_month, cuisine, tam_cap=tam_cap,
            ),
        }

    # ── B: 안정 성장 ──
    base_mult_b = override["p50"] if override else 2.0
    rationale_b = (
        f"광고 효율 중({best_channel} ROAS {best_roas:.1f}배) + "
        f"재주문률 평균 수준({repeat_diff:+.0f}%p)"
    )
    if override:
        rationale_b += _override_suffix(override)
    target, rationale = _apply_safety_cap(
        int(order_amt * base_mult_b),
        order_amt,
        rationale_b,
        cap_override=tam_cap,
    )
    return {
        **base,
        "target_revenue": target,
        "multiplier": base_mult_b,
        "case": "B",
        "case_label": "안정 성장",
        "rationale": rationale,
        "tier_plan": _build_tier_plan(
            order_amt, base_mult_b, current_month, cuisine, tam_cap=tam_cap,
        ),
    }


def _lever_path(
    *,
    base: dict[str, Any],
    stat: dict[str, Any],
    lever_input: LeverInput,
    current_month: int,
    cuisine: str,
    tam_cap: int | None,
    tam_meta: dict[str, Any] | None,
    avg_repeat_pct: int,
    cases_dir: Path | None,
    use_historical: bool,
    owner_hope_won: int | None,
    store_name: str,
) -> dict[str, Any]:
    """정본(4-레버) 경로. D/E 가드 통과 후 호출됨.

    주 결과: lever_analysis.build_report 의 tier_2 를 target_revenue 로 사용.
    tier_plan: tier1_3m = 1차(3M), tier2_6m = 2차(6M), tier3_12m = tier_2 복제(하위호환).

    L-3 통합:
      - current_month → 시즌팩터
      - tam_meta.tam_monthly_revenue_won → TAM 점유율 25% 캡
      - cases_dir → 과거실적 sanity check

    sanity_check: 동일 입력에 대한 배수 방식(A/B/C) 결과를 compute_target_revenue 의 기존
    분기 로직으로 산출해 참고 비교. 캡·override 는 모두 lever_input 경로에서만 반영.
    """
    from src.planner.lever_analysis import build_report

    order_amt = stat.get("order_amount", 0)

    # TAM 월 매출 추출 (캡 적용용)
    tam_monthly_won: int | None = None
    if tam_meta is not None and tam_meta.get("available"):
        raw = tam_meta.get("tam_monthly_revenue_won")
        if isinstance(raw, (int, float)) and raw > 0:
            tam_monthly_won = int(raw)

    # 레버 산정 (L-3: current_month / TAM / cases_dir 전달)
    report = build_report(
        store_name,
        lever_input,
        owner_hope_won=owner_hope_won,
        current_month=current_month,
        tam_monthly_revenue_won=tam_monthly_won,
        cases_dir=cases_dir if use_historical else None,
    )

    tier_1 = report.targets.tier_1_revenue_won
    tier_2 = report.targets.tier_2_revenue_won

    # sanity check: 배수 방식 결과 참고로 계산 (same stat/now_bar 재현 없이 ROAS/repeat 만)
    comparison_roas = _best_comparison_roas(stat)
    repeat_diff = base.get("repeat_diff_pp", 0.0)
    ad_strong = comparison_roas >= 8
    ad_weak = comparison_roas < 5
    rep_strong = repeat_diff > 10
    rep_weak = repeat_diff < -10
    if ad_strong and rep_strong:
        legacy_case, legacy_mult = "A", 2.5
    elif ad_weak or rep_weak:
        legacy_case, legacy_mult = "C", 1.5
    else:
        legacy_case, legacy_mult = "B", 2.0
    legacy_target_raw = int(order_amt * legacy_mult)
    legacy_target, _ = _apply_safety_cap(
        legacy_target_raw, order_amt, "", cap_override=tam_cap,
    )
    sanity_check = {
        "method": "legacy_multiplier",
        "case": legacy_case,
        "multiplier": legacy_mult,
        "target_revenue": legacy_target,
        "note": (
            f"배수 방식 폴백 참고값 (Case {legacy_case}, {legacy_mult}배). "
            f"정본은 레버 곱셈 산정."
        ),
    }

    # tier_plan 재구성: 정본 2단계 → 기존 3단계 필드에 매핑 (tier3은 tier_2 복제)
    # - tier1_3m.target = tier_1, tier1_3m.multiplier = tier_1 / order_amt
    # - tier2_6m.target = tier_2
    # - tier3_12m.target = tier_2 (하위호환 docx 렌더링 등에서 참조되므로 동일값)
    def _mult(t: int) -> float:
        return round(t / order_amt, 2) if order_amt > 0 else 0.0

    # L-3: season_factor 는 LeverReport.season_factors 에서 가져옴 (fallback 1.0)
    sf_map = report.season_factors or {}
    sf_t1 = float(sf_map.get("tier_1", 1.0))
    sf_t2 = float(sf_map.get("tier_2", 1.0))
    tier_plan = {
        "tier1_3m": {
            "month": _month_offset(current_month, 3),
            "multiplier": _mult(tier_1),
            "season_factor": sf_t1,
            "target": tier_1,
        },
        "tier2_6m": {
            "month": _month_offset(current_month, 6),
            "multiplier": _mult(tier_2),
            "season_factor": sf_t2,
            "target": tier_2,
        },
        "tier3_12m": {
            "month": _month_offset(current_month, 12),
            "multiplier": _mult(tier_2),
            "season_factor": sf_t2,
            "target": tier_2,
        },
    }

    # rationale: 레버별 근거 합성
    rationale_parts = [
        "4-레버 곱셈 산정 (정본)",
        report.analysis.impression_delta.basis,
        report.analysis.ctr_delta.basis,
        report.analysis.cvr_delta.basis,
        report.analysis.aov_delta.basis,
        (
            f"→ 1차 ₩{tier_1:,}({report.targets.tier_1_growth_pct:+.1f}%, "
            f"확률 {report.targets.tier_1_probability_pct}%) / "
            f"2차 ₩{tier_2:,}({report.targets.tier_2_growth_pct:+.1f}%, "
            f"확률 {report.targets.tier_2_probability_pct}%)"
        ),
    ]
    if report.targets.adjustment_note:
        rationale_parts.append(f"[조정] {report.targets.adjustment_note}")
    rationale = " | ".join(rationale_parts)

    # sanity_check 를 report 에 주입
    report_dict = report.model_dump()
    report_dict["sanity_check"] = sanity_check

    return {
        **base,
        "target_revenue": tier_2,
        "multiplier": _mult(tier_2),
        "case": "LEVER",
        "case_label": "4-레버 곱셈 산정 (정본)",
        "rationale": rationale,
        "tier_plan": tier_plan,
        "lever_report": report_dict,
    }
