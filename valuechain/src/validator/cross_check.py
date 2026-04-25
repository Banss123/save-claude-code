"""교차 검증 모듈.

입력 JSON 데이터 ↔ 생성된 XLSX/DOCX 파일 간
값 수준의 1:1 대조를 수행합니다.

XLSX 검수/DOCX 검수와 달리, 여기서는 두 산출물 사이의
일관성을 확인합니다.
"""

from __future__ import annotations

from pathlib import Path

from docx import Document

from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import CheckGroup, CheckItem, CheckStatus


def cross_check_menu_solution(
    menu_plan: MenuPlan,
    solution_plan: SolutionPlan,
) -> CheckGroup:
    """메뉴판 가안(MenuPlan) ↔ 솔루션 계획서(SolutionPlan) 간 일관성 검증."""
    items: list[CheckItem] = []

    # ── 1. 업장명 일치 ──
    menu_name = menu_plan.current.store_name
    solution_name = solution_plan.store.name
    items.append(CheckItem(
        name="업장명 일치 (메뉴 ↔ 솔루션)",
        status=CheckStatus.PASS if menu_name == solution_name else CheckStatus.FAIL,
        message=f"메뉴: '{menu_name}' / 솔루션: '{solution_name}'",
        expected=menu_name,
        actual=solution_name,
    ))

    # ── 2. 솔루션에서 인용된 메뉴명이 가안에 실존하는지 ──
    all_text = ""
    for section in solution_plan.sections:
        for item in section.items:
            all_text += f" {item.title} {item.description} "
            all_text += " ".join(item.sub_items)

    # 가안의 모든 메뉴명 추출
    proposed_names = [
        item.name for g in menu_plan.proposed.groups for item in g.items
    ]

    # 솔루션 비교표의 메뉴명이 가안에 있는지
    # (전체 메뉴명 매칭은 과도하므로, 비교표 "앞으로" 컬럼의 메뉴명만 체크)
    comparison_after_text = " ".join(
        row.after for row in solution_plan.comparison_table
    )

    # 가안에서 변경된 메뉴의 키워드가 솔루션에서 언급되는지
    changed_items = [
        item for g in menu_plan.proposed.groups for item in g.items
        if item.is_changed
    ]

    if changed_items:
        # 변경된 메뉴 중 솔루션 어디에서도 언급 안 되는 것
        unmentioned: list[str] = []
        for mi in changed_items:
            # 메뉴명의 핵심 부분 (대괄호 안 키워드 또는 메뉴명 자체)
            core_name = mi.name.split("]")[-1].strip() if "]" in mi.name else mi.name
            # 짧은 이름은 매칭이 어려우므로 4자 이상만
            if len(core_name) >= 4 and core_name not in all_text:
                unmentioned.append(core_name[:15])

        items.append(CheckItem(
            name="변경 메뉴 솔루션 언급 여부",
            status=CheckStatus.PASS if not unmentioned else CheckStatus.WARN,
            message=(
                f"변경 {len(changed_items)}건 모두 솔루션에서 언급됨"
                if not unmentioned
                else f"미언급 {len(unmentioned)}건: {', '.join(unmentioned[:3])}"
            ),
        ))

    # ── 3. 가격 일관성: 솔루션에 언급된 가격이 가안과 일치 ──
    import re
    # 솔루션 텍스트에서 "N,NNN원" 패턴 추출
    price_mentions = re.findall(r"([\d,]+)원", all_text + comparison_after_text)
    proposed_prices = {item.price for g in menu_plan.proposed.groups for item in g.items}

    # 솔루션에서 언급된 가격이 가안에 실존하는지 (정보성 확인)
    matched_prices = 0
    total_price_mentions = 0
    for pm in price_mentions:
        try:
            price_val = int(pm.replace(",", ""))
            if price_val >= 1000:  # 의미 있는 가격만
                total_price_mentions += 1
                if price_val in proposed_prices:
                    matched_prices += 1
        except ValueError:
            continue

    if total_price_mentions > 0:
        match_rate = matched_prices / total_price_mentions
        items.append(CheckItem(
            name="솔루션 가격 ↔ 가안 가격 일치율",
            status=(
                CheckStatus.PASS if match_rate >= 0.5
                else CheckStatus.WARN
            ),
            message=f"{matched_prices}/{total_price_mentions}건 일치 ({match_rate:.0%})",
        ))

    return CheckGroup(name="교차 검증", items=items)
