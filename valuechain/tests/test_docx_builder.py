"""DOCX 빌더 테스트."""

import json
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.schemas.solution import SolutionPlan
from src.generator.docx_builder import build_solution_docx


def test_build_sample_docx():
    """더피플버거 샘플 데이터로 DOCX 생성 테스트."""
    # 샘플 데이터 로드
    sample_path = Path(__file__).parent.parent / "data" / "samples" / "더피플버거_sample.json"
    with open(sample_path, encoding="utf-8") as f:
        data = json.load(f)

    # Pydantic 검증
    plan = SolutionPlan(**data)

    # DOCX 생성
    output_path = Path(__file__).parent.parent / "output" / f"{plan.store.name}_솔루션_계획서.docx"
    result = build_solution_docx(plan, output_path)

    # 검증
    assert result.exists(), f"파일이 생성되지 않았습니다: {result}"
    assert result.stat().st_size > 0, "파일이 비어있습니다"

    print(f"\n[OK] DOCX 생성 성공: {result}")
    print(f"   파일 크기: {result.stat().st_size:,} bytes")
    print(f"   업장명: {plan.store.name}")
    print(f"   섹션 수: {len(plan.sections)}개")
    print(f"   KPI: {', '.join(k.label for k in plan.kpi_boxes)}")


if __name__ == "__main__":
    test_build_sample_docx()
