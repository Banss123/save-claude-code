"""검수 파이프라인 통합 모듈."""

from __future__ import annotations

from pathlib import Path

from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import ValidationReport

from .docx_check import validate_docx
from .xlsx_check import validate_xlsx
from .cross_check import cross_check_menu_solution


def validate_all(
    menu_plan: MenuPlan,
    solution_plan: SolutionPlan,
    xlsx_path: str | Path,
    docx_path: str | Path,
) -> ValidationReport:
    """전체 검수를 수행하고 ValidationReport를 반환합니다."""
    store_name = menu_plan.current.store_name

    xlsx_group = validate_xlsx(menu_plan, xlsx_path)
    docx_group = validate_docx(solution_plan, docx_path)
    cross_group = cross_check_menu_solution(menu_plan, solution_plan)

    return ValidationReport(
        store_name=store_name,
        groups=[xlsx_group, docx_group, cross_group],
    )
