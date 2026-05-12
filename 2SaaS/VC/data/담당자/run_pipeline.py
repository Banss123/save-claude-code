"""전체 파이프라인 실행 스크립트.

사용법: uv run python run_pipeline.py "매장명"
예:     uv run python run_pipeline.py "대흥육회"

흐름:
  1. baemin_scraper.py → 현안 JSON 수집
  2. menu_analyzer.py → Claude API → 현안+가안 MenuPlan JSON
  3. xlsx_builder.py → 현안/가안 XLSX 생성
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"


def step1_scrape(store_name: str) -> Path:
    """배민 스크래핑 → {store_name}_현안.json"""
    json_path = OUTPUT_DIR / f"{store_name}_현안.json"

    print(f"\n{'='*55}")
    print(f"  [Step 1] 배민 스크래핑: {store_name}")
    print(f"{'='*55}")

    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "baemin_scraper.py"), store_name],
        cwd=str(BASE_DIR),
    )

    if result.returncode != 0:
        raise RuntimeError(f"스크래퍼 실패 (exit={result.returncode})")

    if not json_path.exists():
        raise FileNotFoundError(f"현안 JSON 없음: {json_path}")

    print(f"\n[OK] 현안 JSON: {json_path}")
    return json_path


def step2_analyze(store_name: str, json_path: Path) -> Path:
    """Claude API → 현안+가안 MenuPlan JSON"""
    print(f"\n{'='*55}")
    print(f"  [Step 2] 가안 분석 (Claude API): {store_name}")
    print(f"{'='*55}")

    store_data = json.loads(json_path.read_text(encoding="utf-8"))

    from src.analyzer.menu_analyzer import analyze_menu

    menu_plan = analyze_menu(store_data)
    print(f"  현안 메뉴 수: {menu_plan.current.total_menus}")
    print(f"  가안 변경 메뉴: {sum(1 for g in menu_plan.proposed.groups for m in g.items if m.is_changed)}")

    plan_path = OUTPUT_DIR / f"{store_name}_menu_plan.json"
    plan_path.write_text(
        menu_plan.model_dump_json(indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[OK] MenuPlan JSON: {plan_path}")
    return plan_path


def step3_build_xlsx(store_name: str, plan_path: Path) -> Path:
    """MenuPlan JSON → 현안/가안 XLSX"""
    print(f"\n{'='*55}")
    print(f"  [Step 3] XLSX 생성: {store_name}")
    print(f"{'='*55}")

    import json as _json
    from src.schemas.menu import MenuPlan
    from src.generator.xlsx_builder import build_menu_xlsx

    data = _json.loads(plan_path.read_text(encoding="utf-8"))
    menu_plan = MenuPlan(**data)

    xlsx_path = OUTPUT_DIR / f"{store_name}_메뉴판_가안.xlsx"
    build_menu_xlsx(menu_plan, xlsx_path)

    print(f"[OK] XLSX: {xlsx_path} ({xlsx_path.stat().st_size:,} bytes)")
    return xlsx_path


def main():
    if len(sys.argv) < 2:
        print("사용법: uv run python run_pipeline.py \"매장명\"")
        sys.exit(1)

    store_name = sys.argv[1]
    OUTPUT_DIR.mkdir(exist_ok=True)

    try:
        json_path = step1_scrape(store_name)
        plan_path = step2_analyze(store_name, json_path)
        xlsx_path = step3_build_xlsx(store_name, plan_path)

        print(f"\n{'='*55}")
        print(f"  완료: {store_name}")
        print(f"  XLSX: {xlsx_path}")
        print(f"{'='*55}\n")

    except Exception as e:
        print(f"\n[ERROR] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
