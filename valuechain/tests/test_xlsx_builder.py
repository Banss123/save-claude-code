"""XLSX 빌더 테스트."""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.schemas.menu import MenuPlan
from src.generator.xlsx_builder import build_menu_xlsx


def test_build_sample_xlsx():
    """더피플버거 샘플 데이터로 XLSX 생성 테스트."""
    sample_path = Path(__file__).parent.parent / "data" / "samples" / "더피플버거_menu_sample.json"
    with open(sample_path, encoding="utf-8") as f:
        data = json.load(f)

    plan = MenuPlan(**data)
    output_path = (
        Path(__file__).parent.parent / "output" / f"{plan.current.store_name}_메뉴판_가안.xlsx"
    )
    result = build_menu_xlsx(plan, output_path)

    assert result.exists()
    assert result.stat().st_size > 0

    print(f"[OK] XLSX 생성 성공: {result}")
    print(f"   파일 크기: {result.stat().st_size:,} bytes")
    print(f"   현안: {plan.current.total_groups}그룹, {plan.current.total_menus}메뉴")
    print(f"   가안: {plan.proposed.total_groups}그룹, {plan.proposed.total_menus}메뉴")
    changed = sum(
        1 for g in plan.proposed.groups for item in g.items if item.is_changed
    )
    print(f"   변경 항목: {changed}건")


if __name__ == "__main__":
    test_build_sample_xlsx()
