"""밸류체인 자동화 파이프라인 오케스트레이터.

MenuPlan/SolutionPlan JSON (AI 분석 산출)을 입력받아
결정적 코드로 XLSX/DOCX를 생성하고 자동 검수 리포트를 반환합니다.

AI 분석(판단)은 Claude Code 대화에서 수행되어 JSON 파일로 저장됩니다.
이 파이프라인은 그 JSON을 소비하여 결정적으로 문서를 생성/검수합니다.

사용법:
    python -m src.pipeline \\
        --menu data/samples/맛나치킨_menu_plan.json \\
        --solution output/맛나치킨_솔루션.json \\
        --output-dir output

종료 코드:
    0 — 검수 통과 (is_ok)
    1 — 문서 생성 성공, 검수 FAIL 존재
    2 — 입력 파일 없음 / 업장명 불일치 / Pydantic 검증 실패
    3 — 그 외 예외
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from src.generator.docx_builder import build_solution_docx
from src.generator.xlsx_builder import build_menu_xlsx
from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import ValidationReport
from src.validator import validate_all


@dataclass
class PipelineResult:
    """파이프라인 실행 결과."""

    store_name: str
    menu_json_path: Path
    solution_json_path: Path
    xlsx_path: Path
    docx_path: Path
    report: ValidationReport


def _load_menu_plan(path: Path) -> MenuPlan:
    data = json.loads(path.read_text(encoding="utf-8"))
    return MenuPlan(**data)


def _load_solution_plan(path: Path) -> SolutionPlan:
    data = json.loads(path.read_text(encoding="utf-8"))
    return SolutionPlan(**data)


def run_pipeline(
    menu_json: str | Path,
    solution_json: str | Path,
    output_dir: str | Path,
) -> PipelineResult:
    """MenuPlan/SolutionPlan JSON → XLSX/DOCX + 검수 리포트.

    Raises:
        FileNotFoundError: 입력 파일 없음
        ValueError: 업장명 불일치
        pydantic.ValidationError: JSON 스키마 검증 실패
    """
    menu_json = Path(menu_json)
    solution_json = Path(solution_json)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. JSON 로드 + Pydantic 스키마 검증
    menu_plan = _load_menu_plan(menu_json)
    solution_plan = _load_solution_plan(solution_json)

    # 2. 업장명 일관성 검사
    menu_store = menu_plan.current.store_name
    solution_store = solution_plan.store.name
    if menu_store != solution_store:
        raise ValueError(
            f"업장명 불일치: menu='{menu_store}' vs solution='{solution_store}'"
        )

    store_name = solution_store

    # 3. 문서 생성 (결정적)
    xlsx_path = output_dir / f"{store_name}_메뉴판_가안.xlsx"
    docx_path = output_dir / f"{store_name}_솔루션_계획서.docx"

    build_menu_xlsx(menu_plan, xlsx_path)
    build_solution_docx(solution_plan, docx_path)

    # 4. 자동 검수 (XLSX + DOCX + 교차검증)
    report = validate_all(menu_plan, solution_plan, xlsx_path, docx_path)

    return PipelineResult(
        store_name=store_name,
        menu_json_path=menu_json,
        solution_json_path=solution_json,
        xlsx_path=xlsx_path,
        docx_path=docx_path,
        report=report,
    )


def _format_console_report(result: PipelineResult) -> str:
    sep = "=" * 60
    lines: list[str] = [
        sep,
        f"파이프라인 완료: {result.store_name}",
        sep,
        "[입력]",
        f"  MenuPlan:     {result.menu_json_path}",
        f"  SolutionPlan: {result.solution_json_path}",
        "[출력]",
        f"  XLSX: {result.xlsx_path} ({result.xlsx_path.stat().st_size:,} bytes)",
        f"  DOCX: {result.docx_path} ({result.docx_path.stat().st_size:,} bytes)",
        "",
        result.report.detail_report(),
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="밸류체인 자동화 파이프라인 (JSON → XLSX/DOCX + 검수)",
    )
    parser.add_argument(
        "--menu",
        required=True,
        type=Path,
        help="MenuPlan JSON 경로",
    )
    parser.add_argument(
        "--solution",
        required=True,
        type=Path,
        help="SolutionPlan JSON 경로",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "output",
        help="출력 디렉토리 (기본: ./output)",
    )
    parser.add_argument(
        "--save-report",
        type=Path,
        default=None,
        help="검수 리포트를 JSON으로 저장할 경로 (선택)",
    )
    args = parser.parse_args(argv)

    try:
        result = run_pipeline(args.menu, args.solution, args.output_dir)
    except FileNotFoundError as e:
        print(f"[ERROR] 입력 파일 없음: {e}", file=sys.stderr)
        return 2
    except ValueError as e:
        print(f"[ERROR] 검증 실패: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(
            f"[ERROR] 파이프라인 실패: {type(e).__name__}: {e}",
            file=sys.stderr,
        )
        return 3

    print(_format_console_report(result))

    if args.save_report:
        args.save_report.parent.mkdir(parents=True, exist_ok=True)
        args.save_report.write_text(
            result.report.model_dump_json(indent=2),
            encoding="utf-8",
        )
        print(f"\n[리포트 저장] {args.save_report}")

    return 0 if result.report.is_ok else 1


if __name__ == "__main__":
    sys.exit(main())
