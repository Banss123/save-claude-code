"""검수 파이프라인 통합 모듈."""

from __future__ import annotations

from pathlib import Path

from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import ValidationReport

from .docx_check import validate_docx
from .xlsx_check import validate_xlsx
from .cross_check import cross_check_menu_solution
from .raw_check import validate_no_hallucination
from .business_rules_check import validate_business_rules
from .reference_check import check_reference, to_check_group


def validate_all(
    menu_plan: MenuPlan,
    solution_plan: SolutionPlan,
    xlsx_path: str | Path,
    docx_path: str | Path,
    raw_data: dict | None = None,
) -> ValidationReport:
    """전체 검수를 수행하고 ValidationReport를 반환합니다.

    Args:
        raw_data: 스크래퍼 raw JSON (옵션). 제공 시 hallucination 검수 활성화.
    """
    store_name = menu_plan.current.store_name

    xlsx_group = validate_xlsx(menu_plan, xlsx_path)
    docx_group = validate_docx(solution_plan, docx_path)
    cross_group = cross_check_menu_solution(menu_plan, solution_plan)
    business_group = validate_business_rules(menu_plan, solution_plan)
    # Phase J: 정본 §필수 준수 사항 1~8 검증 (비즈니스 룰 뒤에 부착)
    reference_group = to_check_group(check_reference(solution_plan))

    groups = [xlsx_group, docx_group, cross_group, business_group, reference_group]

    # raw_data 있으면 hallucination 검수 추가
    if raw_data is not None:
        raw_group = validate_no_hallucination(raw_data, menu_plan)
        groups.insert(0, raw_group)  # 가장 앞 (가장 중요)

    return ValidationReport(
        store_name=store_name,
        groups=groups,
    )
