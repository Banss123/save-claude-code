"""과거 컨설팅 실적 DB — 사례별 실측 데이터.

개별 사례는 data/historical_cases/ 하위 파일로 저장(매장당 1개).
γ-4(분포 기반 배수 산출)의 입력. 통합 에이전트가 호출하는 순수 함수.
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import date
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ValidationError, field_validator


DEFAULT_CASES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "data" / "historical_cases"
)

# stdlib에 yaml 없음 → JSON 전용. YAML 파일 발견 시 경고 후 skip.
try:  # pragma: no cover - 환경 의존
    import yaml  # type: ignore

    _YAML_OK = True
except ImportError:  # pragma: no cover
    _YAML_OK = False


class MonthlyRevenue(BaseModel):
    """시점별 월매출(원). baseline = 컨설팅 시작 시점."""

    baseline: int
    month_3: int | None = None
    month_6: int | None = None
    month_12: int | None = None

    @field_validator("baseline")
    @classmethod
    def _baseline_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("baseline must be > 0")
        return v


class HistoricalCase(BaseModel):
    case_id: str
    shop_name: str
    cuisine: str
    location: str
    consulting_start: date
    consulting_months: int
    revenue: MonthlyRevenue
    interventions: list[str] = []
    outcome: Literal["success", "partial", "stall", "ongoing"] = "ongoing"
    notes: str = ""

    @field_validator("cuisine")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cuisine must be non-empty")
        return v

    @field_validator("case_id", "shop_name", "location")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("field must be non-empty")
        return v

    def growth_ratio(self, month: Literal[3, 6, 12]) -> float | None:
        """baseline 대비 성장 배수. None이면 해당 시점 데이터 없음."""
        m = getattr(self.revenue, f"month_{month}")
        if not m or not self.revenue.baseline:
            return None
        return round(m / self.revenue.baseline, 3)


def _parse_file(path: Path) -> dict[str, Any] | None:
    """단일 파일 → dict. 실패 시 stderr 경고 후 None."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        print(f"[historical_cases] 읽기 실패 {path.name}: {e}", file=sys.stderr)
        return None

    suffix = path.suffix.lower()
    try:
        if suffix in (".yaml", ".yml"):
            if not _YAML_OK:
                print(
                    f"[historical_cases] YAML 파서 없음 ({path.name}) — skip. "
                    "JSON으로 변환하거나 pyyaml 설치 필요.",
                    file=sys.stderr,
                )
                return None
            return yaml.safe_load(text)  # type: ignore[name-defined]
        if suffix == ".json":
            return json.loads(text)
        return None  # 다른 확장자는 무시
    except (json.JSONDecodeError, Exception) as e:  # noqa: BLE001
        print(f"[historical_cases] 파싱 실패 {path.name}: {e}", file=sys.stderr)
        return None


def load_cases(cases_dir: Path | None = None) -> list[HistoricalCase]:
    """data/historical_cases/*.{yaml|json} → HistoricalCase 리스트.

    디렉토리 없거나 빈 경우 빈 리스트 반환.
    파싱/검증 실패한 파일은 stderr 경고 후 skip.
    """
    d = cases_dir or DEFAULT_CASES_DIR
    if not d.exists() or not d.is_dir():
        return []

    cases: list[HistoricalCase] = []
    for path in sorted(d.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in (".json", ".yaml", ".yml"):
            continue
        if path.name.lower() == "readme.md":
            continue
        data = _parse_file(path)
        if data is None:
            continue
        try:
            cases.append(HistoricalCase.model_validate(data))
        except ValidationError as e:
            print(
                f"[historical_cases] 스키마 검증 실패 {path.name}: "
                f"{e.error_count()}건 — skip",
                file=sys.stderr,
            )
            continue
    return cases


def filter_cases(
    cases: list[HistoricalCase],
    *,
    cuisine: str | None = None,
    min_baseline: int | None = None,
    max_baseline: int | None = None,
    outcome: str | None = None,
) -> list[HistoricalCase]:
    """세그먼트 필터. None 인자는 조건 미적용."""
    out = cases
    if cuisine is not None:
        out = [c for c in out if c.cuisine == cuisine]
    if min_baseline is not None:
        out = [c for c in out if c.revenue.baseline >= min_baseline]
    if max_baseline is not None:
        out = [c for c in out if c.revenue.baseline <= max_baseline]
    if outcome is not None:
        out = [c for c in out if c.outcome == outcome]
    return out


def _percentile(values: list[float], pct: float) -> float:
    """선형 보간 백분위수 (0 < pct < 100). n>=1 전제."""
    if not values:
        raise ValueError("empty values")
    if len(values) == 1:
        return values[0]
    s = sorted(values)
    k = (len(s) - 1) * (pct / 100)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def growth_distribution(
    cases: list[HistoricalCase],
    month: Literal[3, 6, 12],
) -> dict[str, Any]:
    """성장 배수 분포 기술통계.

    Returns:
        {"n": int, "mean": float|None, "median": ..., "p50": ..., "p80": ...,
         "min": ..., "max": ..., "std": ...}
    """
    ratios = [r for c in cases if (r := c.growth_ratio(month)) is not None]
    n = len(ratios)
    if n == 0:
        return {
            "n": 0,
            "mean": None,
            "median": None,
            "p50": None,
            "p80": None,
            "min": None,
            "max": None,
            "std": None,
        }
    mean = round(statistics.fmean(ratios), 3)
    median = round(statistics.median(ratios), 3)
    p50 = round(_percentile(ratios, 50), 3)
    p80 = round(_percentile(ratios, 80), 3)
    std = round(statistics.pstdev(ratios), 3) if n >= 1 else 0.0
    return {
        "n": n,
        "mean": mean,
        "median": median,
        "p50": p50,
        "p80": p80,
        "min": round(min(ratios), 3),
        "max": round(max(ratios), 3),
        "std": std,
    }
