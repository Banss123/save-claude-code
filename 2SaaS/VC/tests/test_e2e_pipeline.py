"""End-to-end 파이프라인 테스트.

원본 데이터 → Claude API 분석 → SolutionPlan JSON → DOCX 생성
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analyzer.solution_analyzer import analyze_and_build


def test_e2e_pipeline():
    """맛나치킨 테스트 데이터로 전체 파이프라인 테스트."""
    # API 키 확인
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[ERROR] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
        print("  설정 방법: export ANTHROPIC_API_KEY=sk-ant-...")
        return

    # 원본 데이터 로드
    sample_path = Path(__file__).parent.parent / "data" / "samples" / "테스트업장_raw.json"
    with open(sample_path, encoding="utf-8") as f:
        store_data = json.load(f)

    print(f"[1/3] 원본 데이터 로드: {store_data['store_name']}")
    print(f"  업종: {store_data['cuisine_type']}")
    print(f"  현재 월매출: {store_data['current_metrics']['monthly_revenue']:,}원")
    print(f"  CTR: {store_data['current_metrics']['ctr']}%")
    print(f"  CVR: {store_data['current_metrics']['cvr']}%")

    # Claude API 분석 + DOCX 생성
    print("\n[2/3] Claude API 분석 중...")
    output_dir = Path(__file__).parent.parent / "output"

    plan, docx_path = analyze_and_build(
        store_data=store_data,
        output_dir=output_dir,
        model="claude-sonnet-4-20250514",
        api_key=api_key,
    )

    # 결과 출력
    print("\n[3/3] 결과:")
    print(f"  DOCX: {docx_path}")
    print(f"  크기: {docx_path.stat().st_size:,} bytes")
    print(f"\n  KPI 4개:")
    for kpi in plan.kpi_boxes:
        print(f"    - {kpi.label}: {kpi.value}")
    print(f"\n  비교표:")
    for row in plan.comparison_table:
        print(f"    {row.category}: {row.before} -> {row.after}")
    print(f"\n  핵심 메시지: {plan.key_message}")
    print(f"\n  섹션 {len(plan.sections)}개:")
    for i, sec in enumerate(plan.sections):
        print(f"    {i+1}. {sec.title} ({len(sec.items)}항목)")
    if plan.fee_structure:
        print(f"\n  수수료:")
        for tier in plan.fee_structure.tiers:
            print(f"    - {tier.condition}: {tier.rate}")
        print(f"    * {plan.fee_structure.no_fee_condition}")

    # JSON도 저장
    json_path = output_dir / f"{plan.store.name}_솔루션.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(plan.model_dump(), f, ensure_ascii=False, indent=2)
    print(f"\n  JSON: {json_path}")

    print("\n[OK] End-to-end 파이프라인 테스트 완료!")


if __name__ == "__main__":
    test_e2e_pipeline()
