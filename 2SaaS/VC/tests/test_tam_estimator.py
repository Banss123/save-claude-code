"""TAM 추정 모듈 테스트.

현재 환경에서 geopandas/httpx/shapely 미설치를 전제로 대부분의 케이스가
`TamEstimate.unavailable()` 반환을 검증한다. 의존성 설치 후 경로는
monkeypatch 로 sys.modules 를 주입해 시뮬레이션한다.

핵심 검증:
- lazy import: 모듈 import 시 외부 의존성이 없어도 성공 (파일 상단에서 이미 증명됨)
- estimate_tam 은 예외 전파 없이 항상 TamEstimate 반환
- target_revenue_cap_from_tam 은 Unavailable 시 None, available 시 OCCUPANCY_UPPER 배수
- Pydantic 필드 optional 허용 (TamEstimate() 최소 생성 가능)
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from src.market.tam_estimator import (  # noqa: E402
    OCCUPANCY_UPPER,
    TamEstimate,
    estimate_tam,
    target_revenue_cap_from_tam,
)


# ────────────────────────────────────────────────────────────────
# 1. Pydantic 스키마
# ────────────────────────────────────────────────────────────────
def test_tam_estimate_minimal_construction():
    """모든 필드 선택적 — available 만 있으면 생성 가능."""
    te = TamEstimate(available=False)
    assert te.available is False
    assert te.reason is None
    assert te.lat is None
    assert te.tam_monthly_revenue_won is None


def test_unavailable_factory_sets_reason():
    """unavailable() 팩토리는 available=False 와 reason 을 함께 설정."""
    te = TamEstimate.unavailable("테스트 사유")
    assert te.available is False
    assert te.reason == "테스트 사유"


# ────────────────────────────────────────────────────────────────
# 2. estimate_tam — 폴백 경로 (예외 없이 unavailable 반환)
# ────────────────────────────────────────────────────────────────
def test_estimate_tam_empty_address_returns_unavailable():
    """빈 주소 → 즉시 폴백."""
    result = estimate_tam("")
    assert result.available is False
    assert result.reason is not None
    assert "주소" in result.reason


def test_estimate_tam_whitespace_address_returns_unavailable():
    """공백만 있는 주소 → 폴백."""
    result = estimate_tam("   ")
    assert result.available is False
    assert "주소" in (result.reason or "")


def test_estimate_tam_missing_dependencies_returns_unavailable():
    """geopandas/httpx/shapely 미설치 환경 → 의존성 미설치 reason."""
    result = estimate_tam("경기 안성시 공도읍")
    assert result.available is False
    # 현재 환경은 의존성 없음 → '의존성 미설치' 또는 이후 단계 reason
    # (의존성이 설치되면 SHP 없음/키 없음으로 자연스럽게 이동)
    assert result.reason is not None


def test_estimate_tam_with_deps_but_no_shp(monkeypatch, tmp_path):
    """의존성 mock 설치 + SHP 없음 → 'SHP 파일 없음' 반환."""
    # 가짜 모듈 3개를 sys.modules 에 주입 → try-import 통과
    for name in ("geopandas", "httpx", "shapely"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    # shp_dir 를 빈 tmp_path 로 전달
    result = estimate_tam(
        "경기 안성시 공도읍",
        shp_dir=tmp_path,
        kakao_key="dummy",  # 키 단계 통과용
    )
    assert result.available is False
    assert "SHP" in (result.reason or "")


def test_estimate_tam_with_deps_and_shp_but_no_kakao_key(monkeypatch, tmp_path):
    """의존성 mock + SHP 존재 + 키 없음 → 'KAKAO_REST_KEY' reason."""
    for name in ("geopandas", "httpx", "shapely"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    # 더미 shp 파일 생성 (glob 매칭용)
    (tmp_path / "sbiz_delivery_zone_seoul.shp").write_bytes(b"")
    # 환경변수 제거
    monkeypatch.delenv("KAKAO_REST_KEY", raising=False)
    result = estimate_tam(
        "경기 안성시 공도읍",
        shp_dir=tmp_path,
        kakao_key=None,
    )
    assert result.available is False
    assert "KAKAO_REST_KEY" in (result.reason or "")


def test_estimate_tam_all_preconditions_ok_returns_not_implemented(
    monkeypatch, tmp_path,
):
    """의존성 + SHP + 키 모두 충족 → 현재 구현은 '실구현 대기' 폴백."""
    for name in ("geopandas", "httpx", "shapely"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    (tmp_path / "sbiz_delivery_zone_seoul.shp").write_bytes(b"")
    result = estimate_tam(
        "경기 안성시 공도읍",
        shp_dir=tmp_path,
        kakao_key="dummy-key",
    )
    # 현재 단계: 실구현 전이라 unavailable + '실구현 대기' 명시
    assert result.available is False
    assert "실구현" in (result.reason or "")


# ────────────────────────────────────────────────────────────────
# 3. target_revenue_cap_from_tam — 캡 계산
# ────────────────────────────────────────────────────────────────
def test_cap_returns_none_when_unavailable():
    """available=False → 항상 None (호출자가 폴백 캡 사용)."""
    te = TamEstimate.unavailable("아직")
    assert target_revenue_cap_from_tam(te) is None


def test_cap_returns_none_when_revenue_missing():
    """available=True 여도 tam_monthly_revenue_won 없으면 None."""
    te = TamEstimate(available=True, tam_monthly_revenue_won=None)
    assert target_revenue_cap_from_tam(te) is None


def test_cap_applies_occupancy_upper():
    """TAM 월매출 × OCCUPANCY_UPPER(0.25) 반환."""
    te = TamEstimate(available=True, tam_monthly_revenue_won=10_000_000)
    cap = target_revenue_cap_from_tam(te)
    assert cap == int(10_000_000 * OCCUPANCY_UPPER)
    assert cap == 2_500_000


# ────────────────────────────────────────────────────────────────
# 4. 예외 전파 없음 — 호출 안전성 계약
# ────────────────────────────────────────────────────────────────
def test_estimate_tam_never_raises():
    """어떤 입력에도 예외 전파 X. 항상 TamEstimate 인스턴스 반환."""
    for addr in ["", "   ", "없는 주소", "경기 안성시 공도읍", "x" * 1000]:
        result = estimate_tam(addr)
        assert isinstance(result, TamEstimate)
        # 현재 환경에서 available 은 항상 False
        assert result.available is False


# ────────────────────────────────────────────────────────────────
# 5. target_revenue 통합 — address 전달 시 기존 동작 보존
# ────────────────────────────────────────────────────────────────
def test_compute_target_revenue_address_none_backcompat():
    """address 미지정 시 기존 동작 그대로(회귀)."""
    from src.planner.target_revenue import compute_target_revenue

    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.8, "cook_compliance_pct": 100}
    result = compute_target_revenue(stat, now_bar, 20)
    assert result["case"] == "B"
    assert result["target_revenue"] == 10_000_000
    # address 미지정 → tam_meta 는 None
    assert result["tam_meta"] is None


def test_compute_target_revenue_with_address_falls_back_cleanly():
    """address 지정 + 의존성 미설치 → TAM 폴백, 기존 4.0배 캡 동작."""
    from src.planner.target_revenue import compute_target_revenue

    stat = {
        "order_amount": 5_000_000,
        "order_count": 200,
        "repeat_order_count": 40,
        "ugk_roas": 6.0,
    }
    now_bar = {"recent_rating": 4.8, "cook_compliance_pct": 100}
    result = compute_target_revenue(
        stat, now_bar, 20, address="경기 안성시 공도읍",
    )
    # 기존 B 케이스 로직 유지
    assert result["case"] == "B"
    assert result["target_revenue"] == 10_000_000
    # TAM 시도 메타는 dict 로 기록됨 (available=False)
    assert isinstance(result["tam_meta"], dict)
    assert result["tam_meta"]["available"] is False
    assert result["tam_meta"]["reason"] is not None
