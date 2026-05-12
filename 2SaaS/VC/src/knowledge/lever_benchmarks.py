"""배달 플랫폼 4-레버 카테고리 벤치마크.

정본 근거: data/references/목표매출_산정로직.md

정본 문서의 6개 카테고리별 CTR/CVR 벤치마크와 객단가 탄력성 수치.
industry_keywords.py 의 12 업종 키와 매핑해 레버 분석에 사용한다.
"""

from __future__ import annotations

import sys

# ─────────────────────────────────────────────
# 정본 문서의 6개 카테고리 벤치마크
# (값: (하단 %, 상단 %) — 단위는 퍼센트 포인트가 아닌 절대 % 비율)
# ─────────────────────────────────────────────

# CTR 벤치마크 (%) — (하단, 상단)
CTR_BENCHMARKS: dict[str, tuple[float, float]] = {
    "치킨": (3.0, 4.5),
    "한식": (2.5, 4.0),
    "분식": (3.5, 5.0),
    "중식": (2.5, 3.5),
    "야식·족발": (3.0, 4.0),
    "피자": (3.0, 4.0),
}

# CVR 벤치마크 (%) — (하단, 상단)
CVR_BENCHMARKS: dict[str, tuple[float, float]] = {
    "치킨": (15.0, 20.0),
    "한식": (12.0, 18.0),
    "분식": (15.0, 22.0),
    "중식": (12.0, 18.0),
    "야식·족발": (13.0, 18.0),
    "피자": (10.0, 15.0),
}

# 객단가 탄력성 — ("낮음"/"중간"/"높음", 최대 상승폭 %)
AOV_ELASTICITY: dict[str, tuple[str, float]] = {
    "치킨": ("낮음", 10.0),
    "한식": ("중간", 15.0),
    "분식": ("높음", 20.0),
    "중식": ("중간", 12.5),
    "야식·족발": ("낮음", 8.0),
    "피자": ("낮음", 10.0),
}

# 기본 fallback 카테고리 (매핑 실패 시)
DEFAULT_BENCHMARK_CATEGORY = "한식"


# ─────────────────────────────────────────────
# industry_keywords.py 12 업종 → 정본 6 카테고리 매핑
# ─────────────────────────────────────────────
# 매핑 원칙:
#   - 정확 일치가 있으면 그대로
#   - 없으면 가장 유사한 6 카테고리로 근사
#   - fallback 은 "한식" (가장 보편적인 배달 카테고리)
# ─────────────────────────────────────────────
_INDUSTRY_TO_BENCHMARK: dict[str, str] = {
    # 정확 일치
    "치킨": "치킨",
    "한식": "한식",
    "분식": "분식",
    "중식": "중식",
    "피자": "피자",
    # 근사 매핑
    "돈까스·회·일식": "한식",     # 일식 카테고리는 한식 근사 (정본 벤치 없음)
    "양식": "한식",                  # 파스타류 — 한식 근사
    "버거·샌드위치": "한식",      # 간편식 — 한식 근사
    "카페·디저트": "분식",         # 세트 성격 (간편 조합) → 분식 근사
    "족발·보쌈": "야식·족발",
    "야식·안주": "야식·족발",
    "아시안": "한식",                # 베트남·태국·인도 — 한식 근사 (정본 벤치 없음)
}


def map_to_benchmark_category(cuisine: str) -> str:
    """12 업종 키를 정본 6 카테고리로 매핑.

    Args:
        cuisine: industry_keywords.py 또는 자유 입력 업종명.

    Returns:
        "치킨"/"한식"/"분식"/"중식"/"야식·족발"/"피자" 중 하나.
        매핑 실패 시 DEFAULT_BENCHMARK_CATEGORY 반환하면서 stderr 경고.
    """
    # 정확 일치
    if cuisine in _INDUSTRY_TO_BENCHMARK:
        return _INDUSTRY_TO_BENCHMARK[cuisine]
    # 6 카테고리 직접 입력 (cuisine 이 이미 벤치 카테고리)
    if cuisine in CTR_BENCHMARKS:
        return cuisine
    # 부분 일치 (복합 표기 대응)
    for key, mapped in _INDUSTRY_TO_BENCHMARK.items():
        parts = [p.strip() for p in key.replace("·", "/").split("/")]
        for part in parts:
            if part and part in cuisine:
                return mapped
    # 정본 6 카테고리 부분 일치
    for bench in CTR_BENCHMARKS:
        parts = [p.strip() for p in bench.replace("·", "/").split("/")]
        for part in parts:
            if part and part in cuisine:
                return bench
    # Fallback
    print(
        f"[lever_benchmarks] WARN: cuisine '{cuisine}' 벤치마크 매핑 실패 — "
        f"'{DEFAULT_BENCHMARK_CATEGORY}' 기본값 사용",
        file=sys.stderr,
    )
    return DEFAULT_BENCHMARK_CATEGORY


def get_ctr_range(cuisine: str) -> tuple[float, float]:
    """CTR 벤치마크 (하단, 상단) 조회 — cuisine 자동 매핑."""
    bench = map_to_benchmark_category(cuisine)
    return CTR_BENCHMARKS[bench]


def get_cvr_range(cuisine: str) -> tuple[float, float]:
    """CVR 벤치마크 (하단, 상단) 조회 — cuisine 자동 매핑."""
    bench = map_to_benchmark_category(cuisine)
    return CVR_BENCHMARKS[bench]


def get_aov_elasticity(cuisine: str) -> tuple[str, float]:
    """객단가 탄력성 (등급, 최대 상승폭 %) — cuisine 자동 매핑."""
    bench = map_to_benchmark_category(cuisine)
    return AOV_ELASTICITY[bench]


def classify_position(value: float, range_: tuple[float, float]) -> str:
    """현재 값이 벤치마크 대비 어느 위치인지 분류.

    Args:
        value: 현재 CTR/CVR 값 (%).
        range_: (하단, 상단) 튜플.

    Returns:
        "below"     — 하단 미달
        "middle"    — 하단 이상 ~ 상단의 90% 이하
        "near_top"  — 상단 근접 (상단의 90% 이상)

    분기 의미:
      - below    : 정본 '하단 미달' → 큰 개선폭 가능
      - middle   : 정본 '중간' → 중간 개선폭
      - near_top : 정본 '상단 근접' → 작은 개선폭
    """
    lo, hi = range_
    if value < lo:
        return "below"
    # 상단의 90% 이상이면 "상단 근접". 상단 초과도 near_top 로 간주.
    if value >= hi * 0.9:
        return "near_top"
    return "middle"


def is_known_mapping(cuisine: str) -> bool:
    """cuisine 이 명시적 매핑 또는 6 벤치 카테고리 중 하나인지 여부.

    False 면 map_to_benchmark_category 가 fallback 을 사용한 상태
    → 불확실성으로 달성 확률 페널티 적용 대상.
    """
    if cuisine in _INDUSTRY_TO_BENCHMARK:
        return True
    if cuisine in CTR_BENCHMARKS:
        return True
    # 부분 일치도 known 으로 인정 (map_to_benchmark_category 와 동일 로직)
    for key in _INDUSTRY_TO_BENCHMARK:
        parts = [p.strip() for p in key.replace("·", "/").split("/")]
        for part in parts:
            if part and part in cuisine:
                return True
    for bench in CTR_BENCHMARKS:
        parts = [p.strip() for p in bench.replace("·", "/").split("/")]
        for part in parts:
            if part and part in cuisine:
                return True
    return False
