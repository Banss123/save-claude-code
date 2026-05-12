"""상권 TAM(Total Addressable Market) 추정 모듈.

소상공인365 배달상권 SHP + 카카오 로컬 API 기반.
의존성(geopandas·shapely·httpx)은 선택적으로 설치되며, 미설치 시
`TamEstimate.unavailable(reason)`을 반환해 호출자가 폴백(예: 매출 × 4.0 상한)을 쓰게 함.

활성화 조건:
    - geopandas, shapely, httpx 설치
    - KAKAO_REST_KEY 환경변수
    - data/shp/sbiz_delivery_zone_*.shp 파일 존재

이 모듈은 통합 에이전트가 호출할 예정 — 입출력은 Pydantic 스키마.

주의: 모듈 최상단에서 geopandas/httpx/shapely를 import 하지 않는다.
의존성이 없는 환경에서도 import · 테스트가 가능해야 하므로, 실제 사용은
`estimate_tam()` 함수 내부에서 try-import 로만 수행한다.
"""
from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel


# 기본 SHP 경로 (사용자가 배치 후 활성화): <project_root>/data/shp/
DEFAULT_SHP_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "shp"
DEFAULT_RADIUS_M = 1000

# 매장 점유율 가정 (상권 TAM 중 단일 매장이 흡수 가능한 비율)
OCCUPANCY_LOWER = 0.15  # 보수
OCCUPANCY_UPPER = 0.25  # 적극 — 안전 캡 계산에 사용


class TamEstimate(BaseModel):
    """TAM 추정 결과.

    available=False 이면 호출자가 기존 폴백(매출 × 4.0 상한)을 사용.
    available=True 이면 tam_monthly_revenue_won 등 실측/추정 필드 채워짐.
    """

    available: bool
    reason: str | None = None
    lat: float | None = None
    lng: float | None = None
    commercial_zone_id: str | None = None
    monthly_orders: int | None = None
    household_count: int | None = None
    industry_mix: dict[str, float] | None = None
    competitor_count: int | None = None
    avg_ticket_won: int | None = None
    tam_monthly_revenue_won: int | None = None

    @classmethod
    def unavailable(cls, reason: str) -> "TamEstimate":
        """폴백 모드 인스턴스."""
        return cls(available=False, reason=reason)


class TAMError(Exception):
    """TAM 추정 오류 베이스."""


class AddressNotFound(TAMError):
    """카카오 지오코딩에서 주소를 찾지 못함."""


class ZoneNotCovered(TAMError):
    """좌표가 배달상권 폴리곤에 속하지 않음."""


def estimate_tam(
    address: str,
    *,
    radius_m: int = DEFAULT_RADIUS_M,
    cuisine: str | None = None,
    avg_ticket_won: int | None = None,
    shp_dir: Path | None = None,
    kakao_key: str | None = None,
) -> TamEstimate:
    """주소 → 좌표 → 포함 상권 폴리곤 → TAM.

    실패·미설치 시 `TamEstimate.unavailable(reason)` 을 반환하며 예외를
    전파하지 않는다. 호출자는 `.available` 플래그만 확인하면 된다.

    의존성/파일/키 중 어느 하나라도 없으면 폴백 모드로 진입한다.

    Args:
        address: 매장 주소(전체 또는 시·도·구 조합). 빈 문자열은 폴백.
        radius_m: (향후 반영) 반경 버퍼 거리. 현재는 폴리곤 포함 여부만 사용.
        cuisine: (향후 반영) 업종 mix 가중치용.
        avg_ticket_won: (향후 반영) TAM 매출 환산용.
        shp_dir: SHP 디렉터리 오버라이드 (테스트용).
        kakao_key: 카카오 REST 키 오버라이드 (테스트용).
    """
    # 0. 주소 공백 방어
    if not address or not address.strip():
        return TamEstimate.unavailable("주소 빈 문자열")

    # 1. 의존성 확인 (lazy import — 모듈 import 시점 오염 방지)
    try:
        import geopandas as _gpd  # noqa: F401
        import httpx as _httpx  # noqa: F401
        import shapely as _shapely  # noqa: F401
    except ImportError as e:
        return TamEstimate.unavailable(f"의존성 미설치: {e.name}")

    # 2. SHP 파일 존재 확인
    shp_dir = shp_dir or DEFAULT_SHP_DIR
    shp_files = (
        list(shp_dir.glob("sbiz_delivery_zone_*.shp")) if shp_dir.exists() else []
    )
    if not shp_files:
        return TamEstimate.unavailable(f"SHP 파일 없음: {shp_dir}")

    # 3. 카카오 키 확인
    key = kakao_key or os.environ.get("KAKAO_REST_KEY")
    if not key:
        return TamEstimate.unavailable("KAKAO_REST_KEY 환경변수 없음")

    # 4. 실구현 대기 — SHP 컬럼명 검증·카카오 호출·폴리곤 매칭 스프린트 필요.
    #    담당자 컨펌 후 의존성·데이터 배치 완료되면 아래 코드 블록을 구현한다.
    return TamEstimate.unavailable(
        "실구현 대기 — SHP 컬럼명 검증·카카오 호출·폴리곤 매칭 스프린트 필요"
    )


def target_revenue_cap_from_tam(tam: TamEstimate) -> int | None:
    """TAM 기반 상한 매출. 미사용 시 None (호출자가 폴백 캡 사용).

    점유율 상한(`OCCUPANCY_UPPER`)을 적용해 단일 매장이 흡수 가능한
    최대 월 매출을 계산한다. `available=False` 이거나 TAM 매출 값이
    비어있으면 None 반환 — 호출자는 기존 폴백 캡을 그대로 쓴다.
    """
    if not tam.available or not tam.tam_monthly_revenue_won:
        return None
    return int(tam.tam_monthly_revenue_won * OCCUPANCY_UPPER)
