"""옵션 파서 보강 테스트.

검증 대상:
  1. _normalize_latin_lookalike: 한글 옆 Latin 룩얼라이크 토큰 교정
  2. _merge_twin_option_groups: 쌍둥이 옵션그룹 병합
  3. Merge 거부: 아이템 교집합 낮으면 별개 유지
  4. 빈 입력 안전성
"""

from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.scraper.baemin import (  # noqa: E402
    _base_group_name,
    _merge_twin_option_groups,
    _normalize_latin_lookalike,
)


# ─────────────────────────────────────────────
# 1. Latin normalize
# ─────────────────────────────────────────────
def test_normalize_latin_basic_case():
    assert _normalize_latin_lookalike("ZI뷰 OI벤트 선택") == "리뷰 이벤트 선택"


def test_normalize_preserves_legit_latin():
    # 정상적인 한글-영문 혼용은 건드리지 말아야 한다.
    preserved = [
        "A급 특상급",
        "300g 고기",
        "PoP 만두",
        "파스타x2",
        "BIG 해쉬브라운",
    ]
    for t in preserved:
        assert _normalize_latin_lookalike(t) == t, f"손상됨: {t!r}"


def test_normalize_inside_sentence():
    before = "찜+ZI뷰는 주문당 한번만 선택 가능합니다"
    after = _normalize_latin_lookalike(before)
    assert after == "찜+리뷰는 주문당 한번만 선택 가능합니다"


def test_normalize_empty_and_none_safe():
    assert _normalize_latin_lookalike("") == ""
    # None 이 들어올 경우는 호출부 책임이지만, 빈 문자열 안전성만 기본 계약으로.


# ─────────────────────────────────────────────
# 2. base name
# ─────────────────────────────────────────────
def test_base_group_name_strips_trailing_digit():
    assert _base_group_name("맵기 선택2") == "맵기 선택"
    assert _base_group_name("세트 파스타선택 2") == "세트 파스타선택"
    assert _base_group_name("맵기 선택") == "맵기 선택"


# ─────────────────────────────────────────────
# 3. merge: 아이템 교집합 높으면 병합
# ─────────────────────────────────────────────
def test_merge_twin_groups_same_items():
    groups = [
        {
            "no": 1,
            "group_name": "맵기 선택",
            "condition": "[필수] 최소 1개 최대 1개",
            "items": [
                {"name": "1단계", "price": 0},
                {"name": "2단계", "price": 0},
                {"name": "3단계", "price": 0},
            ],
        },
        {
            "no": 2,
            "group_name": "맵기 선택2",
            "condition": "[필수] 최소 1개 최대 1개",
            "items": [
                {"name": "1단계", "price": 0},
                {"name": "2단계", "price": 0},
                {"name": "3단계", "price": 0},
            ],
        },
    ]
    merged = _merge_twin_option_groups(groups)
    assert len(merged) == 1
    assert merged[0]["no"] == 1
    assert merged[0]["group_name"] == "맵기 선택"  # 더 짧은 캐노니컬 이름 선호


def test_merge_items_normalize_case_and_whitespace():
    """대소문자·공백만 다른 쌍둥이(3p/3P, '피클 [안]...' / '피클[안]...')는 병합."""
    groups = [
        {
            "no": 1,
            "group_name": "토핑 추가선택",
            "condition": "최대 9개",
            "items": [
                {"name": "치킨가라아게3p 추가", "price": 500},
                {"name": "뚱뚱비만 새우2p 추가", "price": 500},
                {"name": "그린홍합2p 추가", "price": 500},
            ],
        },
        {
            "no": 2,
            "group_name": "토핑 추가선택2",
            "condition": "최대 10개",
            "items": [
                {"name": "치킨가라아게3P 추가", "price": 500},
                {"name": "뚱뚱비만 새우2P 추가", "price": 500},
                {"name": "그린홍합2P 추가", "price": 500},
            ],
        },
    ]
    merged = _merge_twin_option_groups(groups)
    assert len(merged) == 1
    # 원본 저장값은 보존되어야 함 (정규화는 비교 전용)
    names = {it["name"] for it in merged[0]["items"]}
    assert "치킨가라아게3p 추가" in names
    assert merged[0]["condition"] == "최대 10개"  # 더 관대한 쪽


def test_merge_prefers_larger_condition_capacity():
    # 더 관대한 condition(최대 3개) 이 유지되는지 확인.
    groups = [
        {
            "no": 1,
            "group_name": "토핑 선택",
            "condition": "최대 1개",
            "items": [{"name": "치즈", "price": 500}, {"name": "베이컨", "price": 500}],
        },
        {
            "no": 2,
            "group_name": "토핑 선택2",
            "condition": "최대 3개",
            "items": [{"name": "치즈", "price": 500}, {"name": "베이컨", "price": 500}],
        },
    ]
    merged = _merge_twin_option_groups(groups)
    assert len(merged) == 1
    assert merged[0]["condition"] == "최대 3개"


# ─────────────────────────────────────────────
# 4. merge 거부: 교집합 낮음 → 별개 유지
# ─────────────────────────────────────────────
def test_merge_rejects_when_items_differ():
    groups = [
        {
            "no": 1,
            "group_name": "세트 파스타1 선택",
            "condition": "[필수] 최소 1개 최대 1개",
            "items": [
                {"name": "봉골레파스타 선택", "price": 0},
                {"name": "씨푸드로제파스타 선택", "price": 0},
            ],
        },
        {
            "no": 2,
            "group_name": "세트 파스타선택 2",
            "condition": "[필수] 최소 1개 최대 1개",
            "items": [
                {"name": "봉골레파스타", "price": 0},
                {"name": "베이컨필라프", "price": 0},
                {"name": "매콤크림리조또", "price": 0},
            ],
        },
    ]
    merged = _merge_twin_option_groups(groups)
    # base name 은 동일하나 아이템 교집합 비율이 낮아 별개로 유지.
    assert len(merged) == 2
    names = {g["group_name"] for g in merged}
    assert names == {"세트 파스타1 선택", "세트 파스타선택 2"}
    # no 재할당 확인
    assert [g["no"] for g in merged] == [1, 2]


# ─────────────────────────────────────────────
# 5. 빈 입력 안전성
# ─────────────────────────────────────────────
def test_merge_empty_list():
    assert _merge_twin_option_groups([]) == []


def test_merge_single_group_untouched():
    g = [
        {
            "no": 1,
            "group_name": "음료 선택",
            "condition": "",
            "items": [{"name": "콜라", "price": 1500}],
        }
    ]
    out = _merge_twin_option_groups(g)
    assert len(out) == 1
    assert out[0]["no"] == 1
    assert out[0]["group_name"] == "음료 선택"


def test_merge_ignores_empty_group_name():
    groups = [
        {"no": 1, "group_name": "", "condition": "", "items": []},
        {
            "no": 2,
            "group_name": "맵기 선택",
            "condition": "",
            "items": [{"name": "1단계", "price": 0}],
        },
    ]
    merged = _merge_twin_option_groups(groups)
    assert len(merged) == 1
    assert merged[0]["group_name"] == "맵기 선택"


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))
