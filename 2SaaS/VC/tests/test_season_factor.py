"""Phase β — season_factor.py 신규 테스트."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.knowledge.season_factor import (  # noqa: E402
    SEASON_FACTORS,
    get_season_factor,
)


# ── 1. 등록된 업종·월 정확 조회 ──
def test_chicken_december_peak():
    """치킨 12월 피크 1.15."""
    assert get_season_factor("치킨", 12) == 1.15


def test_chicken_november_peak():
    """치킨 11월 피크 1.10."""
    assert get_season_factor("치킨", 11) == 1.10


def test_jungshik_july_peak():
    """중식 7월 장마 피크 1.30."""
    assert get_season_factor("중식", 7) == 1.30


def test_jungshik_august_peak():
    """중식 8월 장마 여파 1.20."""
    assert get_season_factor("중식", 8) == 1.20


def test_cafe_summer_peak():
    """카페·디저트 7월 피크 1.15."""
    assert get_season_factor("카페·디저트", 7) == 1.15


# ── 1-b. 신규 업종 (2026-04 확장) ──
def test_hansik_january_peak():
    """한식 1월 명절·추위 보양 1.05."""
    assert get_season_factor("한식", 1) == 1.05


def test_hansik_july_peak():
    """한식 7월 삼계탕·냉국수 1.05."""
    assert get_season_factor("한식", 7) == 1.05


def test_pizza_december_peak():
    """피자 12월 연말·가족 모임 1.15."""
    assert get_season_factor("피자", 12) == 1.15


def test_pizza_january_peak():
    """피자 1월 연초 모임 1.15."""
    assert get_season_factor("피자", 1) == 1.15


def test_burger_is_flat():
    """버거·샌드위치 연중 평탄 1.00."""
    for m in [1, 5, 8, 12]:
        assert get_season_factor("버거·샌드위치", m) == 1.0


def test_jokbal_december_peak():
    """족발·보쌈 12월 연말 모임 1.10."""
    assert get_season_factor("족발·보쌈", 12) == 1.10


def test_jokbal_june_peak():
    """족발·보쌈 6월 여름 보양 1.10."""
    assert get_season_factor("족발·보쌈", 6) == 1.10


def test_yasik_november_peak():
    """야식·안주 11월 회식 시즌 1.15."""
    assert get_season_factor("야식·안주", 11) == 1.15


def test_yasik_october_peak():
    """야식·안주 10월 회식 시작 1.15."""
    assert get_season_factor("야식·안주", 10) == 1.15


def test_asian_summer_peak():
    """아시안 여름 쌀국수·커리 1.10."""
    assert get_season_factor("아시안", 7) == 1.10


def test_asian_may_peak():
    """아시안 5월 여름 초입 1.10."""
    assert get_season_factor("아시안", 5) == 1.10


# ── 2. 평탄 업종 (season=1.0 전역) ──
def test_pasta_is_flat_all_months():
    """파스타는 12개월 모두 1.0."""
    for m in range(1, 13):
        assert get_season_factor("파스타", m) == 1.0


def test_yangsik_is_flat():
    """양식도 평탄."""
    for m in [1, 4, 7, 12]:
        assert get_season_factor("양식", m) == 1.0


# ── 3. 미등록 업종 → 1.0 ──
def test_unknown_industry_returns_1():
    """없는 업종은 1.0."""
    assert get_season_factor("없는업종", 4) == 1.0
    assert get_season_factor("인도카레", 7) == 1.0


def test_empty_cuisine_returns_1():
    """빈 문자열 cuisine."""
    assert get_season_factor("", 4) == 1.0


# ── 4. 부분 매칭 fallback ──
def test_partial_match_for_compound_key():
    """'일식'만으로 '돈까스·회·일식' 키의 값 반환 (모두 1.0 이지만 조회 경로 확인)."""
    # '돈까스·회·일식' 키는 모두 1.0이라 값은 1.0이지만 매칭 자체가 성립해야 함
    assert get_season_factor("일식", 5) == 1.0


def test_partial_match_contains_key():
    """cuisine에 키가 substring 으로 포함될 때도 매칭."""
    # 예: cuisine="안성치킨" 이면 "치킨" 키 매칭
    assert get_season_factor("안성치킨", 12) == 1.15


# ── 5. 월 범위 검증 (명시: ValueError) ──
def test_month_zero_raises():
    """월 0 → ValueError (1~12만 허용)."""
    with pytest.raises(ValueError):
        get_season_factor("치킨", 0)


def test_month_13_raises():
    """월 13 → ValueError."""
    with pytest.raises(ValueError):
        get_season_factor("치킨", 13)


def test_month_negative_raises():
    """음수 → ValueError."""
    with pytest.raises(ValueError):
        get_season_factor("치킨", -1)


# ── 6. 데이터 무결성 ──
def test_all_entries_have_12_months():
    """모든 등록 업종의 월별 팩터는 12개."""
    for key, factors in SEASON_FACTORS.items():
        assert len(factors) == 12, f"{key}: {len(factors)}개 (12개여야 함)"


def test_all_factors_in_reasonable_range():
    """모든 팩터는 0.5~2.0 범위 (극단값 방지 가드)."""
    for key, factors in SEASON_FACTORS.items():
        for i, f in enumerate(factors):
            assert 0.5 <= f <= 2.0, f"{key}[{i+1}월]={f} 범위 밖"
