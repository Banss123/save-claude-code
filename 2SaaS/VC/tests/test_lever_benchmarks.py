"""L-1: lever_benchmarks 카테고리 매핑 + 위치 판정 테스트."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from src.knowledge.lever_benchmarks import (  # noqa: E402
    AOV_ELASTICITY,
    CTR_BENCHMARKS,
    CVR_BENCHMARKS,
    DEFAULT_BENCHMARK_CATEGORY,
    classify_position,
    get_aov_elasticity,
    get_ctr_range,
    get_cvr_range,
    is_known_mapping,
    map_to_benchmark_category,
)


# ─────────────────────────────────────────────
# 정본 6 카테고리 모두 정의됐는지
# ─────────────────────────────────────────────
def test_ctr_benchmarks_has_all_six_categories() -> None:
    assert set(CTR_BENCHMARKS.keys()) == {
        "치킨", "한식", "분식", "중식", "야식·족발", "피자",
    }


def test_cvr_benchmarks_has_all_six_categories() -> None:
    assert set(CVR_BENCHMARKS.keys()) == set(CTR_BENCHMARKS.keys())


def test_aov_elasticity_has_all_six_categories() -> None:
    assert set(AOV_ELASTICITY.keys()) == set(CTR_BENCHMARKS.keys())


# ─────────────────────────────────────────────
# 정본 문서의 정확한 수치 확인
# ─────────────────────────────────────────────
def test_ctr_chicken_matches_doc() -> None:
    assert CTR_BENCHMARKS["치킨"] == (3.0, 4.5)


def test_cvr_pizza_matches_doc() -> None:
    assert CVR_BENCHMARKS["피자"] == (10.0, 15.0)


def test_aov_bunsik_high_elasticity() -> None:
    label, max_uplift = AOV_ELASTICITY["분식"]
    assert label == "높음"
    assert max_uplift == 20.0


# ─────────────────────────────────────────────
# 12 industry → 6 벤치 매핑
# ─────────────────────────────────────────────
@pytest.mark.parametrize(
    "cuisine,expected",
    [
        ("치킨", "치킨"),
        ("한식", "한식"),
        ("분식", "분식"),
        ("중식", "중식"),
        ("피자", "피자"),
        ("돈까스·회·일식", "한식"),
        ("양식", "한식"),
        ("버거·샌드위치", "한식"),
        ("카페·디저트", "분식"),
        ("족발·보쌈", "야식·족발"),
        ("야식·안주", "야식·족발"),
        ("아시안", "한식"),
    ],
)
def test_all_12_industries_map_to_benchmark(cuisine: str, expected: str) -> None:
    assert map_to_benchmark_category(cuisine) == expected


def test_partial_match_uses_industry_entry() -> None:
    """정확 일치 없어도 부분 일치로 매핑."""
    assert map_to_benchmark_category("치킨집") == "치킨"
    assert map_to_benchmark_category("분식점") == "분식"


def test_unknown_cuisine_falls_back_to_default(capsys) -> None:
    """완전 미매핑 → DEFAULT + stderr 경고."""
    result = map_to_benchmark_category("외계인음식")
    assert result == DEFAULT_BENCHMARK_CATEGORY
    captured = capsys.readouterr()
    assert "벤치마크 매핑 실패" in captured.err


def test_is_known_mapping_true_for_mapped() -> None:
    assert is_known_mapping("치킨")
    assert is_known_mapping("양식")
    assert is_known_mapping("야식·족발")  # 6 벤치 카테고리 직접 입력


def test_is_known_mapping_false_for_unknown() -> None:
    assert not is_known_mapping("외계인음식")
    assert not is_known_mapping("")


# ─────────────────────────────────────────────
# 조회 함수
# ─────────────────────────────────────────────
def test_get_ctr_range_for_korean() -> None:
    lo, hi = get_ctr_range("한식")
    assert lo == 2.5
    assert hi == 4.0


def test_get_cvr_range_for_yasik() -> None:
    lo, hi = get_cvr_range("야식·안주")  # → "야식·족발" 매핑
    assert lo == 13.0
    assert hi == 18.0


def test_get_aov_elasticity_for_pasta() -> None:
    """양식 → 한식 근사 → 중간."""
    label, max_uplift = get_aov_elasticity("양식")
    assert label == "중간"
    assert max_uplift == 15.0


# ─────────────────────────────────────────────
# 위치 판정 (below/middle/near_top)
# ─────────────────────────────────────────────
def test_classify_below_when_under_lower_bound() -> None:
    # 한식 CTR 2.5~4.0. 2.0 → below
    assert classify_position(2.0, (2.5, 4.0)) == "below"


def test_classify_middle_between_bounds() -> None:
    # 3.0 은 2.5~4.0 범위 내이고, 상단 90% (=3.6) 미만
    assert classify_position(3.0, (2.5, 4.0)) == "middle"


def test_classify_near_top_when_approaching_upper() -> None:
    # 3.8 은 상단 4.0 의 90%(=3.6) 이상
    assert classify_position(3.8, (2.5, 4.0)) == "near_top"


def test_classify_near_top_when_above_upper() -> None:
    # 상단 초과도 near_top
    assert classify_position(5.0, (2.5, 4.0)) == "near_top"


def test_classify_exact_lower_bound_is_middle() -> None:
    """하단 경계값은 middle (정확히 하단은 미달 아님)."""
    assert classify_position(2.5, (2.5, 4.0)) == "middle"


def test_classify_bunsik_high_range() -> None:
    """분식 CTR 3.5~5.0 범위 경계 확인."""
    assert classify_position(3.4, (3.5, 5.0)) == "below"
    assert classify_position(4.0, (3.5, 5.0)) == "middle"
    assert classify_position(4.6, (3.5, 5.0)) == "near_top"  # 5.0*0.9=4.5
