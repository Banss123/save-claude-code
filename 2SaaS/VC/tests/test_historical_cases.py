"""historical_cases 모듈 테스트 — γ-3."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from src.knowledge.historical_cases import (
    DEFAULT_CASES_DIR,
    HistoricalCase,
    MonthlyRevenue,
    filter_cases,
    growth_distribution,
    load_cases,
)


def _make_case(
    case_id: str = "test_001",
    cuisine: str = "치킨",
    baseline: int = 10_000_000,
    month_3: int | None = 13_000_000,
    month_6: int | None = 16_000_000,
    month_12: int | None = 20_000_000,
    outcome: str = "success",
) -> HistoricalCase:
    return HistoricalCase(
        case_id=case_id,
        shop_name="테스트_매장",
        cuisine=cuisine,
        location="경기 안성시",
        consulting_start=date(2024, 1, 1),
        consulting_months=12,
        revenue=MonthlyRevenue(
            baseline=baseline, month_3=month_3, month_6=month_6, month_12=month_12
        ),
        interventions=["메뉴 개편"],
        outcome=outcome,  # type: ignore[arg-type]
    )


def test_growth_ratio_basic() -> None:
    c = _make_case(baseline=10_000_000, month_3=13_000_000)
    assert c.growth_ratio(3) == 1.3


def test_growth_ratio_none_when_missing() -> None:
    c = _make_case(month_3=None)
    assert c.growth_ratio(3) is None


def test_load_cases_missing_dir(tmp_path: Path) -> None:
    assert load_cases(tmp_path / "nonexistent") == []


def test_load_cases_empty_dir(tmp_path: Path) -> None:
    assert load_cases(tmp_path) == []


def test_load_cases_real_samples() -> None:
    cases = load_cases(DEFAULT_CASES_DIR)
    assert len(cases) == 2
    ids = {c.case_id for c in cases}
    assert "chicken_suwon_2024q4" in ids
    assert "pasta_anseong_2025q1" in ids


def test_filter_cases_cuisine() -> None:
    cases = [
        _make_case(case_id="a", cuisine="치킨"),
        _make_case(case_id="b", cuisine="양식"),
        _make_case(case_id="c", cuisine="치킨"),
    ]
    out = filter_cases(cases, cuisine="치킨")
    assert len(out) == 2
    assert {c.case_id for c in out} == {"a", "c"}


def test_filter_cases_baseline_and_outcome() -> None:
    cases = [
        _make_case(case_id="a", baseline=5_000_000, outcome="success"),
        _make_case(case_id="b", baseline=15_000_000, outcome="partial"),
        _make_case(case_id="c", baseline=25_000_000, outcome="success"),
    ]
    mid = filter_cases(cases, min_baseline=10_000_000, max_baseline=20_000_000)
    assert [c.case_id for c in mid] == ["b"]
    succ = filter_cases(cases, outcome="success")
    assert {c.case_id for c in succ} == {"a", "c"}


def test_growth_distribution_empty() -> None:
    d = growth_distribution([], month=6)
    assert d["n"] == 0
    assert d["mean"] is None
    assert d["p50"] is None
    assert d["std"] is None


def test_growth_distribution_values() -> None:
    # 배수 3, 6개월: 1.3, 1.5, 1.8, 2.0, 2.5 → mean=1.82, median=1.8
    cases = [
        _make_case(
            case_id=f"c{i}",
            baseline=10_000_000,
            month_6=int(10_000_000 * ratio),
        )
        for i, ratio in enumerate([1.3, 1.5, 1.8, 2.0, 2.5])
    ]
    d = growth_distribution(cases, month=6)
    assert d["n"] == 5
    assert d["mean"] == pytest.approx(1.82, abs=0.01)
    assert d["p50"] == pytest.approx(1.8, abs=0.01)
    assert d["min"] == 1.3
    assert d["max"] == 2.5
    # p80은 선형보간 기준 2.0~2.5 사이 (상위 20%)
    assert 1.9 < d["p80"] <= 2.5


def test_growth_distribution_skips_none() -> None:
    # month_12 없는 케이스는 제외되어야 함
    cases = [
        _make_case(case_id="a", month_12=20_000_000),
        _make_case(case_id="b", month_12=None),
        _make_case(case_id="c", month_12=18_000_000),
    ]
    d = growth_distribution(cases, month=12)
    assert d["n"] == 2


def test_load_cases_skips_invalid_json(tmp_path: Path) -> None:
    # 잘못된 JSON 파일 생성
    bad = tmp_path / "broken.json"
    bad.write_text("{not valid json", encoding="utf-8")

    # 유효한 케이스 하나
    good = tmp_path / "good.json"
    good.write_text(
        json.dumps(
            {
                "case_id": "ok_case",
                "shop_name": "테스트",
                "cuisine": "양식",
                "location": "서울",
                "consulting_start": "2025-01-01",
                "consulting_months": 6,
                "revenue": {"baseline": 10_000_000, "month_3": 13_000_000},
            }
        ),
        encoding="utf-8",
    )

    # 스키마 어긋난 케이스
    invalid = tmp_path / "invalid_schema.json"
    invalid.write_text(
        json.dumps({"case_id": "x", "shop_name": "y"}),  # 필드 부족
        encoding="utf-8",
    )

    cases = load_cases(tmp_path)
    assert len(cases) == 1
    assert cases[0].case_id == "ok_case"
