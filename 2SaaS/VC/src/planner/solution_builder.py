"""metrics(최종 JSON) + menu_plan + 업종 DB → SolutionPlan JSON.

규칙 적용:
- solution_planning.md 기본 세팅 11개 체크리스트
- CPC 업종 단가표 + 단계적 상향
- 깔때기 진단 (CTR/CVR 기반)
- 게이트 조건 (조리준수율/별점/재주문)
- 목표 매출 케이스별 산정 (target_revenue.py — A/B/C/D/E 5케이스)
- 광고 효율: 우리가게클릭 + 즉시할인 + 배민클럽 종합
- 재주문률 비율 (업종 평균 대비) 기반 강/약점 분기
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from src.knowledge.cpc_table import cpc_for
from src.knowledge.historical_cases import DEFAULT_CASES_DIR
from src.knowledge.industry_keywords import DEFAULT_AVG_REPEAT_PCT, get_industry
from src.planner.lever_analysis import LeverInput
from src.planner.target_revenue import compute_target_revenue


def _try_build_lever_input(
    cuisine: str,
    stat: dict,
    now_bar: dict,
) -> LeverInput | None:
    """metrics → LeverInput 조립. 필수 필드 부재 시 None (폴백 경로).

    필수:
      - stat.order_amount / order_count
      - stat.ugk_detail.impression / click (우리가게클릭 분석 페이지 수집값)
      - now_bar.recent_rating / cook_compliance_pct
    """
    ugk = stat.get("ugk_detail") or {}
    impressions = ugk.get("impression")
    clicks = ugk.get("click")

    order_cnt = stat.get("order_count")
    order_amt = stat.get("order_amount")
    rating = now_bar.get("recent_rating")
    cook = now_bar.get("cook_compliance_pct")

    # 핵심 4요소 체크 — 하나라도 None/0 이면 폴백
    if not all([impressions, clicks, order_cnt, order_amt]):
        return None
    if rating is None or cook is None:
        return None

    try:
        return LeverInput(
            cuisine=cuisine or "한식",
            impressions_31d=int(impressions),
            clicks_31d=int(clicks),
            orders_31d=int(order_cnt),
            revenue_31d=int(order_amt),
            recent_rating=float(rating),
            cook_compliance_pct=int(cook),
        )
    except (ValueError, TypeError):
        return None


def _pct(num: int, denom: int) -> float:
    return round(num / denom * 100, 1) if denom else 0.0


def build_solution_plan(
    store_name: str,
    cuisine: str,
    location: str,
    document_date: str,
    metrics: dict,
    menu_plan: dict,
    *,
    target_multiplier: float | None = None,
) -> dict:
    """SolutionPlan JSON 생성.

    target_multiplier:
      - None (기본): target_revenue.compute_target_revenue로 자동 산정 (5케이스)
      - 명시적 float: 해당 배수 강제 적용 (수동 오버라이드)
    """
    industry_db = get_industry(cuisine) or {}
    now = metrics.get("now_bar", {})
    stat = metrics.get("stat", {})

    order_amt = stat.get("order_amount", 0)
    order_cnt = stat.get("order_count", 0) or 1
    aov = order_amt // order_cnt if order_cnt else 0
    repeat_cnt = stat.get("repeat_order_count", 0)
    new_cnt = stat.get("new_order_count", 0)

    avg_repeat = industry_db.get("avg_repeat_pct", DEFAULT_AVG_REPEAT_PCT)

    # ── 목표 매출 케이스별 산정 ──
    if target_multiplier is not None:
        target_info = {
            "current_revenue": order_amt,
            "target_revenue": int(order_amt * target_multiplier),
            "multiplier": target_multiplier,
            "case": "manual",
            "case_label": "수동 지정",
            "rationale": f"외부 지정 배수 {target_multiplier}배",
            "best_roas": 0.0,
            "best_roas_channel": "",
            "repeat_pct": _pct(repeat_cnt, order_cnt),
            "repeat_diff_pp": 0.0,
        }
    else:
        # 주소 후보: metrics.shop_info.address → 없으면 location 인자
        shop_info = metrics.get("shop_info") or {}
        address_candidate = (
            shop_info.get("address")
            or shop_info.get("shop_address")
            or location
            or None
        )
        # L-1: 레버 입력 조립 시도. 필수 데이터 부재 시 None → 배수 폴백.
        lever_input = _try_build_lever_input(cuisine, stat, now)
        owner_hope = metrics.get("owner_hope_won")
        # L-3: current_month 를 파이프라인 수준에서 주입 — 시즌팩터 반영.
        current_month = datetime.now().month
        # Phase γ-4: cases_dir 기본 전달. 샘플 부족 시 자동 폴백(기존 상수).
        target_info = compute_target_revenue(
            stat, now, avg_repeat,
            current_month=current_month,
            cuisine=cuisine,
            address=address_candidate,
            cases_dir=DEFAULT_CASES_DIR,
            lever_input=lever_input,
            owner_hope_won=owner_hope,
            store_name=store_name,
        )

    target_revenue = target_info["target_revenue"]
    repeat_pct = target_info["repeat_pct"]
    repeat_diff = target_info["repeat_diff_pp"]
    is_repeat_strong = repeat_diff > 10
    is_repeat_weak = repeat_diff < -10
    multiplier = target_info["multiplier"]

    # Phase β: tier 분할이 있으면 tier1_3m.target 재사용, 없으면 기존 규칙 유지
    tier_plan = target_info.get("tier_plan")
    if tier_plan and "tier1_3m" in tier_plan:
        tier1_revenue = tier_plan["tier1_3m"]["target"]
    elif multiplier is not None and multiplier > 1.0:
        # D 케이스(1.3배)나 manual 오버라이드 등
        tier1_revenue = int(order_amt * (1 + (multiplier - 1) * 0.5))
    else:
        # E 케이스(multiplier=None)
        tier1_revenue = int(target_revenue * 0.6)

    cpc_base, cpc_boosted = cpc_for(cuisine)

    # ── 가안 요약 (변경 메뉴 개수 + 샘플 리스트) ──
    proposed_menus = menu_plan["proposed"]["groups"]
    changed_items = [
        it for g in proposed_menus for it in g["items"] if it.get("is_changed")
    ]
    new_only_items = [
        it for g in proposed_menus for it in g["items"]
        if g["name"].startswith("[한그릇·1인]") or g["name"].startswith("[신규]")
    ]
    change_count = len(changed_items)
    samples = [it["name"] for it in changed_items[:10]]

    # ── 목표 매출 sub_label ──
    if multiplier is not None:
        target_sub = f"현재 × {multiplier:.1f}배 — {target_info['case_label']}"
    else:
        target_sub = f"{target_info['case_label']} 절대 목표"
    # Phase β: tier 요약을 sub_label 에 프리픈드 (D/E 는 기존 단일값 유지)
    if tier_plan:
        t1 = tier_plan["tier1_3m"]["target"]
        t2 = tier_plan["tier2_6m"]["target"]
        t3 = tier_plan["tier3_12m"]["target"]
        tier_summary = (
            f"3개월 ₩{t1:,} → 6개월 ₩{t2:,} → 12개월 ₩{t3:,} (스트레치)"
        )
        target_sub = f"{tier_summary} | {target_sub}"
    # 담당자 검토 경고: 자동 산정 한계 명시 (Phase α 안전망)
    target_sub += (
        " ※담당자 검토 필수: 상권·생애주기 요인 미반영"
    )

    # ── 재주문 sub_label (업종 평균 대비) ──
    if is_repeat_strong:
        repeat_sub = (
            f"전체 {order_cnt}건 중 (재주문률 {repeat_pct:.0f}% — "
            f"업종 평균 {avg_repeat}% 대비 강점)"
        )
    elif is_repeat_weak:
        repeat_sub = (
            f"전체 {order_cnt}건 중 (재주문률 {repeat_pct:.0f}% — "
            f"업종 평균 {avg_repeat}% 대비 약점)"
        )
    else:
        repeat_sub = (
            f"전체 {order_cnt}건 중 (재주문률 {repeat_pct:.0f}%, 업종 평균 수준)"
        )

    # ── KPI 박스 ──
    kpis: list[dict[str, Any]] = [
        {"label": "현재 월매출", "value": f"{order_amt:,}원",
         "sub_label": f"주문 {order_cnt}건, 객단가 {aov:,}원", "is_baseline": True},
        {"label": "목표 월매출", "value": f"{target_revenue:,}원",
         "sub_label": target_sub, "is_target": True},
        {"label": "배민 CPC (예정)", "value": f"{cpc_base}원",
         "sub_label": f"업종 표준 · {cpc_boosted}원 단계적 상향"},
        {"label": "재주문", "value": f"{repeat_cnt}건",
         "sub_label": repeat_sub},
        {"label": "조리준수율", "value": f"{now.get('cook_compliance_pct', 0):.0f}%",
         "sub_label": "기준 95%↑ 양호" if now.get("cook_compliance_pct", 0) >= 95 else "기준 95% 미달"},
        {"label": "최근 별점", "value": f"{now.get('recent_rating', 0):.1f}",
         "sub_label": "기준 4.0↑ 양호" if now.get("recent_rating", 0) >= 4.0 else "기준 4.0 미달"},
    ]

    # ── 비교표 운영 카테고리 텍스트 (재주문률 강점 여부 분기) ──
    if is_repeat_strong:
        op_before_repeat = (
            f"재주문 {repeat_cnt}건 (재주문률 {repeat_pct:.0f}%) — 단골 기반 강점"
        )
        op_after_repeat = "신규 유입 확대로 추가 성장 (광고/노출 강화)"
    elif is_repeat_weak:
        op_before_repeat = (
            f"재주문 {repeat_cnt}건 (재주문률 {repeat_pct:.0f}%) — 평균 대비 약점"
        )
        op_after_repeat = "리뷰이벤트 상시 운영으로 재주문 유도 (개선 시급)"
    else:
        op_before_repeat = f"재주문 {repeat_cnt}건 — 개선 여지"
        op_after_repeat = "리뷰이벤트 상시 운영으로 재주문 유도"

    # ── 비교표 ──
    comparison_rows = [
        {
            "category": "메뉴판",
            "before_lines": [
                f"메뉴 {len(menu_plan['current']['groups'])}그룹 / 설명문 누락 다수",
                f"객단가 {aov:,}원 — 1인 진입 세트 부재" if aov < 25000 else f"객단가 {aov:,}원",
                "메뉴명에 배달 검색 키워드 시그널 부족",
            ],
            "after_lines": [
                f"메뉴 {change_count}개 프리픽스 + 설명문 개편",
                "[1인 실속] 진입 세트 신규 추가" if new_only_items else "메뉴 구성 최적화",
                f"업종 키워드({', '.join(industry_db.get('key_signal_keywords', ['바삭', '정통'])[:3])}) 시그널화",
            ],
            "after_first_bold": True,
        },
        {
            "category": "광고",
            "before_lines": [
                f"우리가게클릭 ROAS {stat.get('ugk_roas', 0):.1f}배" if stat.get("ugk_roas") else "광고 현황 확인 필요",
                "배민 CPC 단가 미확정",
                "쿠팡이츠 미진입" if not stat.get("cpc_cost") else "쿠팡이츠 진입 중",
            ],
            "after_lines": [
                f"배민 CPC {cpc_base}원 설정 후 {cpc_boosted}원 단계적 상향",
                "쿠팡이츠 신규 진입 (CMG 신규 11% / 재주문 5%)",
                "배민클럽 배달팁 할인 활성화",
            ],
            "after_first_bold": True,
        },
        {
            "category": "운영",
            "before_lines": [
                f"조리준수율 {now.get('cook_compliance_pct', 0):.0f}% / 별점 {now.get('recent_rating', 0):.1f}",
                op_before_repeat,
                "리뷰이벤트 상세 미확인",
            ],
            "after_lines": [
                "운영 기본기 유지",
                op_after_repeat,
                "피크 시간 임시중지 없이 운영",
            ],
            "after_first_bold": True,
        },
    ]

    # ── 섹션 — 기본 세팅 (메뉴판 우선) ──
    section1_items = [
        {
            "title": f"메뉴명 프리픽스 + 설명문 개편 ({change_count}개)",
            "marker": "arrow",
            "bullets": [
                f"업종 핵심 키워드({', '.join(industry_db.get('key_signal_keywords', ['정통']))})를 대괄호 프리픽스로 시그널화",
                "구성·그램·조각수 구체 명시로 가치 체감 강화",
            ],
            "sub_descriptions": samples,
        }
    ]

    if new_only_items:
        section1_items.append({
            "title": "한그릇·1인 진입 메뉴 신규 추가",
            "marker": "star",
            "bullets": [
                f"현재 객단가 {aov:,}원 — 한그릇 카테고리 진입 권장",
                f"[1인 실속] 가성비 세트 {new_only_items[0]['price']:,}원 신설",
                "1인 고객 유입 + 한그릇 노출 확보",
            ],
        })

    section1_items.extend([
        {
            "title": "메뉴모음컷 제작 + 1번 배치",
            "marker": "arrow",
            "bullets": [
                "대표 3~5종 한 컷 모음컷 제작",
                "메뉴판 최상단 1번 배치 → CTR 개선",
            ],
        },
        {
            "title": "배민클럽 배달팁 할인 설정",
            "marker": "star",
            "bullets": [
                "배민클럽 고객에게 노출 = 재주문 유도",
                "가게배달 기준 배달팁 할인 설정",
            ],
        },
    ])

    # ── 섹션 — CPC ──
    section2_items = [
        {
            "title": f"배민 CPC {cpc_base}원 설정 + 단계적 {cpc_boosted}원 상향",
            "marker": "arrow",
            "bullets": [
                f"{cuisine} 업종 표준 CPC {cpc_base}원",
                f"메뉴판 정비 후 CTR/CVR 확인 → {cpc_boosted}원으로 상향",
                "월 예산 최소 150만원 / 표준 200만원",
            ],
            "sub_descriptions": [
                f"1단계: 메뉴판 개편 + CPC {cpc_base}원 + 월예산 150만원",
                f"2단계: CTR 3%↑ 확인 → CPC {cpc_boosted}원 + 월예산 200만원",
                "스마트모드 OFF, 고정 단가 전환 권장",
            ],
        },
    ]
    if stat.get("ugk_roas"):
        section2_items.append({
            "title": "우리가게클릭 유지 + 최적화",
            "marker": "arrow",
            "bullets": [
                f"현재 ROAS {stat.get('ugk_roas', 0):.1f}배 — 양호",
                "썸네일/광고명/배달시간 재검토로 CTR 추가 개선",
            ],
        })

    # 즉시할인/배민클럽 ROAS — 실효성 있을 때만 자동 추가
    promo_roas_pairs: list[tuple[str, float]] = []
    for ch_name in ["즉시할인", "배민클럽"]:
        roas = stat.get(f"{ch_name}_roas")
        if roas and roas > 0:
            promo_roas_pairs.append((ch_name, roas))
    if promo_roas_pairs:
        roas_text = " · ".join(f"{n} ROAS {r:.1f}배" for n, r in promo_roas_pairs)
        # 압도적 효율 (ROAS 15배 이상 1개 이상)인 경우 강조
        is_outstanding = any(r >= 15 for _, r in promo_roas_pairs)
        section2_items.append({
            "title": ("할인 광고 압도적 효율 — 예산 우선 확대"
                      if is_outstanding else "할인 광고 효율 활용"),
            "marker": "star" if is_outstanding else "arrow",
            "bullets": [
                f"{roas_text} — {'압도적' if is_outstanding else '양호'} 효율",
                ("할인 광고 예산 우선 확대 (CPC보다 ROI 큼)"
                 if is_outstanding else "할인 광고 예산 점진 확대 검토"),
            ],
        })

    # ── 섹션 — CMG ──
    section3_items = [{
        "title": "쿠팡이츠 신규 진입 세팅",
        "marker": "star",
        "bullets": [
            "CMG 신규 11% / 재주문 5% / 일예산 10만원 표준",
            "배민 메뉴판 정비 + CVR 15%↑ 확인 후 진입",
        ],
        "sub_descriptions": [
            "최소주문금액 배민과 통일",
            "진입 초기 할인쿠폰 활용으로 초기 리뷰 확보",
        ],
    }]

    # ── 섹션 — 운영 (재주문률 강점 여부 분기) ──
    if is_repeat_strong:
        repeat_section = {
            "title": "신규 유입 확대 — 광고/노출 강화 (진짜 레버)",
            "marker": "arrow",
            "bullets": [
                f"재주문률 {repeat_pct:.0f}% (업종 평균 {avg_repeat}% 대비 +{repeat_diff:.0f}%p) — 단골 기반 우수",
                f"신규주문 {new_cnt}건 → 광고 확대 + 메뉴모음컷으로 신규 유입 100건+ 달성 가능",
                "재주문 유도용 리뷰이벤트는 보조 수단 (이미 강함)",
            ],
        }
    else:
        repeat_section = {
            "title": "리뷰이벤트 상시 운영 — 재주문 유도",
            "marker": "arrow",
            "bullets": [
                f"현재 재주문 {repeat_cnt}건 (재주문률 {repeat_pct:.0f}%) — 개선 여지 가장 큰 레버",
                "리뷰이벤트: 사이드 증정 등",
                "사장님공지 상단에 리뷰이벤트 홍보 배너",
            ],
        }

    section4_items = [
        {
            "title": "기본 운영 지표 유지",
            "marker": "star",
            "bullets": [
                f"조리준수율 {now.get('cook_compliance_pct', 0):.0f}% 유지 (기준 95%↑)",
                f"주문접수율 {now.get('order_accept_pct', 0):.0f}% 유지",
                f"별점 {now.get('recent_rating', 0):.1f} 유지",
            ],
            "quote_box": "운영지수는 배달 플랫폼 노출 알고리즘에 직접 반영됩니다.",
            "quote_box_color": "gray",
        },
        repeat_section,
        {
            "title": "임시중지 최소화",
            "marker": "warning",
            "bullets": [
                "영업 중단은 노출 알고리즘 직접 패널티",
                "피크 시간대(점심/저녁) 운영 필수",
            ],
        },
    ]

    # ── 핵심 메시지 (재주문률 강점 여부 분기) ──
    if is_repeat_strong:
        key_msg = (
            f"현재 월매출 {order_amt:,}원, 재주문률 {repeat_pct:.0f}% (업종 평균 대비 강점). "
            f"진짜 성장 레버는 신규 유입 확대 — 메뉴판 정비"
            f"({industry_db.get('customer_hurdle', '')}) + 광고 단계적 확대로 "
            f"목표 {target_revenue:,}원 달성이 현실적입니다."
        )
    else:
        key_msg = (
            f"현재 월매출 {order_amt:,}원, 재주문 {repeat_cnt}건이 가장 큰 개선 포인트입니다. "
            f"기본 운영 지표가 양호하므로 메뉴판 정비"
            f"({industry_db.get('customer_hurdle', '')}) + 한그릇 진입 + "
            f"광고 단계적 확대로 목표 {target_revenue:,}원 달성이 현실적입니다."
        )

    sections = [
        {"number": 1, "title": "배민 기본 세팅", "items": section1_items},
        {"number": 2, "title": "광고 전략: 배민 (CPC)", "items": section2_items},
        {"number": 3, "title": "광고 전략: 쿠팡이츠 (CMG) 신규 진입", "items": section3_items},
        {"number": 4, "title": "운영 원칙", "items": section4_items},
    ]

    # ── 케이스 엔진: YAML 룰 매칭 → 섹션에 자동 삽입 (담당자 경험 반영) ──
    # 실패 시 조용히 무시 (원 솔루션은 그대로). 의존성·정본 로직 영향 없음.
    matched_cases: list[dict] = []
    try:
        from src.knowledge.case_engine import (
            inject_matches_into_sections,
            load_rules,
            match_cases,
            sort_matches_by_priority,
        )

        case_context = {
            "metrics": metrics,
            "lever": target_info.get("lever_report") or {},
            "revenue": {
                "case": target_info.get("case"),
                "target_revenue": target_revenue,
                "multiplier": multiplier,
            },
            "store": {
                "name": store_name,
                "cuisine": cuisine,
                "location": location,
            },
        }
        rules = load_rules()
        matches = sort_matches_by_priority(match_cases(case_context, rules))
        inject_matches_into_sections(sections, matches)
        matched_cases = [
            {
                "id": m.rule.id,
                "category": m.rule.category,
                "priority": m.rule.priority,
                "suggestion": m.rule.suggestion,
                "section_hint": m.rule.section_hint,
            }
            for m in matches
        ]
    except Exception:  # pragma: no cover - 방어적
        pass

    return {
        "store": {
            "name": store_name,
            "business_type": cuisine,
            "location": location,
            "document_date": document_date,
        },
        "document_title": "솔루션 계획서",
        "subtitle_suffix": "배달앱 매출 최적화 컨설팅",
        "core_metrics": kpis,
        "comparison": {
            "title": "그래서, 배달 앱 이렇게 바뀝니다",
            "header_label": "지금/앞으로",
            "rows": comparison_rows,
            "footer_quote": f"고객 허들은 '{industry_db.get('customer_hurdle', '품질·가성비')}'. 이걸 시그널화하는 게 핵심.",
        },
        "key_message": key_msg,
        "sections": sections,
        "item_numbering": "serial",
        "fee_structure": {
            "tiers": [
                {"label": "1차 목표 매출", "amount": f"{tier1_revenue:,}원", "rate_pct": 3},
                {"label": "2차 목표 매출", "amount": f"{target_revenue:,}원", "rate_pct": 5},
            ],
            "notes": [
                "후불제: 매출 목표 달성 시에만 수수료 발생",
                "목표 매출 미달성 시 수수료 없음",
            ],
        },
        "variant": "diagnostic",
        # Phase β/γ: docx 근거 섹션/tier 표 직접 바인딩용 top-level 필드.
        # SolutionPlan 스키마에서 optional — 하위 호환 유지.
        "tier_plan": tier_plan,
        "tam_meta": _tam_meta_for_docx(target_info.get("tam_meta")),
        "target_meta": {
            "target_case": target_info["case"],
            "target_case_label": target_info["case_label"],
            "target_rationale": target_info["rationale"],
            "repeat_pct": repeat_pct,
            "repeat_diff_pp": repeat_diff,
            # historical override 는 rationale 문자열에 표시되므로 플래그로도 노출
            "historical_override_used": "내부 실적" in target_info["rationale"],
            # L-1: 정본(4-레버) 경로 결과 — case == "LEVER" 일 때만 존재
            "lever_report": target_info.get("lever_report"),
        },
        # 메타 정보 (검수/근거 추적용 — 파이프라인 내부에서만 참조)
        "_meta": {
            "target_case": target_info["case"],
            "target_case_label": target_info["case_label"],
            "target_rationale": target_info["rationale"],
            "best_roas": target_info["best_roas"],
            "best_roas_channel": target_info["best_roas_channel"],
            "repeat_pct": repeat_pct,
            "repeat_diff_pp": repeat_diff,
            "avg_repeat_pct": avg_repeat,
            "tier_plan": tier_plan,  # Phase β: None(D/E) 또는 {tier1_3m, tier2_6m, tier3_12m}
            "tam_meta": target_info.get("tam_meta"),  # TAM 조회 시도했으면 dict, 아니면 None
            # 케이스 엔진 매칭 결과 (리포트·검수 추적용)
            "matched_cases": matched_cases,
        },
    }


def _tam_meta_for_docx(raw_tam: dict | None) -> dict | None:
    """tam_estimator.TamEstimate.model_dump() → docx TamMeta 로 필요한 필드만 추출.

    TamEstimate 는 필드가 많지만(lat/lng/monthly_orders 등) docx 표시에는
    available/reason/tam_monthly_revenue_won/commercial_zone_id 만 필요.
    """
    if raw_tam is None:
        return None
    return {
        "available": bool(raw_tam.get("available", False)),
        "reason": raw_tam.get("reason"),
        "tam_monthly_revenue_won": raw_tam.get("tam_monthly_revenue_won"),
        "commercial_zone_id": raw_tam.get("commercial_zone_id"),
    }
