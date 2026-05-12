"""solution_builder ↔ case_engine 통합 테스트.

build_solution_plan() 이 metrics 의 문제 시그널을 감지하여
sections 에 케이스 기반 권장사항을 자동으로 삽입하는지 검증.
"""
from __future__ import annotations

from src.planner.solution_builder import build_solution_plan


def _base_menu_plan():
    """최소한의 menu_plan 구조."""
    return {
        "current": {"groups": [{"name": "그룹1", "items": []}]},
        "proposed": {
            "groups": [
                {
                    "name": "그룹1",
                    "items": [
                        {"name": "메뉴A", "price": 10000, "is_changed": False},
                    ],
                }
            ]
        },
    }


def test_high_priority_cases_injected_into_matching_sections():
    """리뷰 저평점 + CPC 소진율 저조 → 해당 섹션에 high 항목 자동 삽입."""
    metrics = {
        "now_bar": {"recent_rating": 3.5, "cook_compliance_pct": 100.0, "order_accept_pct": 100.0},
        "stat": {
            "order_amount": 3_000_000,
            "order_count": 100,
            "new_order_count": 50,
            "repeat_order_count": 50,
            "cpc_consume_rate": 0.15,  # 저조
            "ugk_detail": {"impression": 10000, "click": 300},
        },
    }
    plan = build_solution_plan(
        store_name="테스트매장",
        cuisine="양식·피자·일식",
        location="서울",
        document_date="26.04.21.화",
        metrics=metrics,
        menu_plan=_base_menu_plan(),
    )

    # 매칭 결과가 _meta 에 기록됨
    matched = plan["_meta"]["matched_cases"]
    matched_ids = {m["id"] for m in matched}
    assert "review-rating-low" in matched_ids
    assert "cpc-consume-rate-low" in matched_ids

    # "운영 원칙" 섹션 내에 review-rating-low 권장이 삽입됨
    section_titles = {s["title"] for s in plan["sections"]}
    assert "운영 원칙" in section_titles
    op_section = next(s for s in plan["sections"] if s["title"] == "운영 원칙")
    assert any(
        "악성 리뷰 분석" in it.get("title", "") for it in op_section["items"]
    ), f"운영 원칙 섹션 items: {[it.get('title') for it in op_section['items']]}"

    # "광고 전략: 배민 (CPC)" 에 cpc-consume-rate-low 권장 삽입
    ad_section = next(s for s in plan["sections"] if s["title"] == "광고 전략: 배민 (CPC)")
    assert any(
        "가게대표" in it.get("title", "") for it in ad_section["items"]
    ), f"광고 섹션 items: {[it.get('title') for it in ad_section['items']]}"


def test_no_matches_when_metrics_are_healthy():
    """모든 지표가 양호한 경우 케이스 매칭 없음 — 기본 섹션만 존재."""
    metrics = {
        "now_bar": {
            "recent_rating": 4.8,
            "cook_compliance_pct": 100.0,
            "order_accept_pct": 100.0,
        },
        "stat": {
            "order_amount": 5_000_000,
            "order_count": 200,
            "new_order_count": 100,
            "repeat_order_count": 100,
            "ugk_detail": {"impression": 20000, "click": 800},
        },
    }
    plan = build_solution_plan(
        store_name="건강매장",
        cuisine="양식·피자·일식",
        location="서울",
        document_date="26.04.21.화",
        metrics=metrics,
        menu_plan=_base_menu_plan(),
    )

    # 매칭 0건 기대 (현재 metrics 는 review_count/cpc_consume_rate 등 필드 미포함 → 경고만)
    matched = plan["_meta"]["matched_cases"]
    assert matched == []


def test_matched_cases_meta_preserves_priority_and_category():
    metrics = {
        "now_bar": {"recent_rating": 3.0, "cook_compliance_pct": 100.0, "order_accept_pct": 100.0},
        "stat": {
            "order_amount": 1_000_000,
            "order_count": 50,
            "new_order_count": 25,
            "repeat_order_count": 25,
            "ugk_detail": {"impression": 5000, "click": 100},
        },
    }
    plan = build_solution_plan(
        "테스트", "양식·피자·일식", "서울", "26.04.21.화",
        metrics, _base_menu_plan(),
    )
    matched = plan["_meta"]["matched_cases"]
    rating_case = next((m for m in matched if m["id"] == "review-rating-low"), None)
    assert rating_case is not None
    assert rating_case["priority"] == "high"
    assert rating_case["category"] == "A"
