"""단일 엔트리 — 매장명 하나로 전체 파이프라인 실행.

흐름:
    1. baemin.py — 메뉴/옵션 스크래핑
    2. baemin_final.py — 대시보드 / 통계 / 광고 수집
    3. planner — MenuPlan + SolutionPlan 자동 생성 (업종 키워드 DB 기반)
    4. pipeline.py — JSON → XLSX/DOCX 생성 + 검수
    5. 바탕화면 복사

사용법:
    python -m src.orchestrator "매장명"
    python -m src.orchestrator "매장명" --cuisine "돈까스·회·일식" --location "경기 안성"
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = Path.home() / "Desktop"
OUTPUT_DIR = ROOT / "output"

# 단계별 소요 시간 기록 (key=단계명, value=초)
TIMINGS: dict[str, float] = {}


def _fmt(sec: float) -> str:
    if sec < 60:
        return f"{sec:.1f}s"
    return f"{int(sec // 60)}m {sec % 60:.1f}s"


def run_subprocess(cmd: list[str], desc: str) -> bool:
    print(f"\n{'='*60}\n  [단계] {desc}\n{'='*60}")
    t0 = time.perf_counter()
    result = subprocess.run(cmd, cwd=ROOT, encoding="utf-8")
    TIMINGS[desc] = time.perf_counter() - t0
    print(f"  [TIME] {desc}: {_fmt(TIMINGS[desc])}")
    if result.returncode != 0:
        print(f"[ERROR] {desc} 실패 (exit={result.returncode})")
        return False
    return True


def run_store(
    store_name: str,
    cuisine: str = "돈까스·회·일식",
    location: str = "",
    skip_scrape: bool = False,
) -> int:
    from src.planner.menu_plan_builder import build_menu_plan
    from src.planner.solution_builder import build_solution_plan

    print(f"\n{'#'*60}\n#  매장 자동 온보딩 파이프라인\n#  매장: {store_name}\n#  업종: {cuisine}\n{'#'*60}\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    overall_start = time.perf_counter()
    TIMINGS.clear()

    # ── 1. 메뉴 스크래핑 ──
    if not skip_scrape:
        if not run_subprocess(
            ["uv", "run", "python", "-m", "src.scraper.baemin", store_name],
            "1단계: 메뉴/옵션 스크래핑",
        ):
            return 2

    # ── 2. 메트릭 스크래핑 (NOW바 + 통계 + 광고) ──
    if not skip_scrape:
        if not run_subprocess(
            ["uv", "run", "python", "-m", "src.scraper.baemin_final", store_name],
            "2단계: 통계/광고/NOW바 수집",
        ):
            return 2

    # ── 3. 최신 스크래핑 결과 로드 ──
    scraped_menu_path = OUTPUT_DIR / f"{store_name}_현안.json"
    if not scraped_menu_path.exists():
        print(f"[ERROR] 메뉴 스크래핑 결과 없음: {scraped_menu_path}")
        return 2
    scraped_menu = json.loads(scraped_menu_path.read_text(encoding="utf-8"))

    final_dirs = sorted((OUTPUT_DIR / "final").glob(f"{store_name}_*"))
    if not final_dirs:
        print(f"[ERROR] 통계 스크래핑 결과 없음")
        return 2
    metrics = json.loads((final_dirs[-1] / "final.json").read_text(encoding="utf-8"))

    # ── 4. 객단가 계산 ──
    stat = metrics.get("stat", {})
    order_amt = stat.get("order_amount", 0)
    order_cnt = stat.get("order_count", 0) or 1
    aov = order_amt // order_cnt if order_cnt else 0

    # ── 5. MenuPlan 자동 생성 ──
    print(f"\n{'='*60}\n  [단계] 3단계: 가안 자동 생성 (업종 키워드 DB)\n{'='*60}")
    t0 = time.perf_counter()
    menu_plan = build_menu_plan(
        scraped_menu, store_name, cuisine, add_one_person_entry=True, aov=aov
    )
    TIMINGS["3단계: 가안 생성"] = time.perf_counter() - t0
    menu_json_path = OUTPUT_DIR / f"{store_name}_menu_plan.json"
    menu_json_path.write_text(
        json.dumps(menu_plan, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    changed = sum(1 for g in menu_plan["proposed"]["groups"] for it in g["items"] if it.get("is_changed"))
    total = sum(len(g["items"]) for g in menu_plan["proposed"]["groups"])
    print(f"  [OK] MenuPlan 생성: {total}개 메뉴, {changed}개 변경 ({_fmt(TIMINGS['3단계: 가안 생성'])})")

    # ── 6. SolutionPlan 자동 생성 ──
    print(f"\n{'='*60}\n  [단계] 4단계: 솔루션 자동 조립 (규칙 기반)\n{'='*60}")
    t0 = time.perf_counter()
    document_date = datetime.now().strftime("%y.%m.%d.") + "금토일월화수목"[datetime.now().weekday()]
    # TODO(γ-4): 과거 실적 분포 기반 배수 오버라이드
    # from src.knowledge.historical_cases import load_cases, filter_cases, growth_distribution
    # cases = load_cases()
    # dist = growth_distribution(filter_cases(cases, cuisine=cuisine), month=6)
    # if dist["n"] >= 5:
    #     multiplier = dist["p50"]  # 내부 벤치마크 우선
    solution_plan = build_solution_plan(
        store_name, cuisine, location, document_date, metrics, menu_plan
    )
    TIMINGS["4단계: 솔루션 조립"] = time.perf_counter() - t0
    sol_json_path = OUTPUT_DIR / f"{store_name}_solution_plan.json"
    sol_json_path.write_text(
        json.dumps(solution_plan, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  [OK] SolutionPlan 생성: 섹션 {len(solution_plan['sections'])}개 ({_fmt(TIMINGS['4단계: 솔루션 조립'])})")

    # ── 7. Pipeline 실행 (JSON → XLSX/DOCX) ──
    if not run_subprocess(
        ["uv", "run", "python", "-m", "src.pipeline",
         "--menu", str(menu_json_path),
         "--solution", str(sol_json_path),
         "--output-dir", str(OUTPUT_DIR)],
        "5단계: 파이프라인 실행 (문서 생성 + 검수)",
    ):
        return 1

    # ── 8. 바탕화면 복사 ──
    print(f"\n{'='*60}\n  [단계] 6단계: 바탕화면 복사\n{'='*60}")
    DESKTOP.mkdir(parents=True, exist_ok=True)
    for name in [
        f"{store_name}_메뉴판_가안.xlsx",
        f"{store_name}_솔루션_계획서.docx",
        f"{store_name}_목표매출_산정근거.xlsx",
    ]:
        src = OUTPUT_DIR / name
        if src.exists():
            dst = DESKTOP / name
            shutil.copy2(src, dst)
            print(f"  [OK] → {dst}")

    # ── 9. 시간 측정 리포트 ──
    total = time.perf_counter() - overall_start
    print(f"\n{'#'*60}\n#  완료: {store_name}\n{'#'*60}")
    print(f"\n[시간 분석]")
    for stage, sec in TIMINGS.items():
        pct = (sec / total * 100) if total else 0
        print(f"  {stage:<30s} {_fmt(sec):>10s}  ({pct:4.1f}%)")
    print(f"  {'─' * 52}")
    print(f"  {'총 소요':<30s} {_fmt(total):>10s}")

    # 리포트 저장
    report = {
        "store": store_name,
        "cuisine": cuisine,
        "timestamp": datetime.now().isoformat(),
        "total_seconds": round(total, 2),
        "stages": {k: round(v, 2) for k, v in TIMINGS.items()},
    }
    report_path = OUTPUT_DIR / f"{store_name}_timing.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n[저장] 시간 리포트: {report_path}\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="매장 온보딩 자동 파이프라인")
    parser.add_argument("store", help="매장명 (accounts.csv 기준)")
    parser.add_argument("--cuisine", default="돈까스·회·일식", help="업종 (키워드 DB 매칭용)")
    parser.add_argument("--location", default="", help="매장 위치")
    parser.add_argument("--skip-scrape", action="store_true",
                        help="기존 스크래핑 결과 재사용 (스크래핑 스킵)")
    args = parser.parse_args()

    return run_store(args.store, args.cuisine, args.location, args.skip_scrape)


if __name__ == "__main__":
    sys.exit(main())
