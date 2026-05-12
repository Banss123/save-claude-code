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
            all_text += f" {item.title} "
            all_text += " ".join(item.bullets)
            all_text += " ".join(item.sub_descriptions)

    # 가안의 모든 메뉴명 추출
    proposed_names = [
        item.name for g in menu_plan.proposed.groups for item in g.items
    ]

    # 솔루션 비교표의 "앞으로" 텍스트
    comparison_after_text = " ".join(
        " ".join(row.after_lines) for row in solution_plan.comparison.rows
    )

    # 가안에서 변경된 메뉴의 키워드가 솔루션에서 언급되는지
    changed_items = [
        item for g in menu_plan.proposed.groups for item in g.items
        if item.is_changed
    ]

    if changed_items:
        # 솔루션 본문은 설계상 전량 나열 대신 샘플만 인용 → 일부 미언급은 정상.
        # 언급률 ≥20% 또는 ≥3건 이상 언급되면 PASS, 그 외 WARN.
        mentioned_count = 0
        unmentioned: list[str] = []
        eligible_count = 0  # 4자 이상만 매칭 가능 (짧은 이름 제외)
        for mi in changed_items:
            core_name = mi.name.split("]")[-1].strip() if "]" in mi.name else mi.name
            if len(core_name) >= 4:
                eligible_count += 1
                if core_name in all_text:
                    mentioned_count += 1
                else:
                    unmentioned.append(core_name[:15])

        mention_rate = (
            mentioned_count / eligible_count if eligible_count > 0 else 1.0
        )
        enough_mentions = mentioned_count >= 3 or mention_rate >= 0.20

        items.append(CheckItem(
            name="변경 메뉴 솔루션 언급 여부",
            status=CheckStatus.PASS if enough_mentions else CheckStatus.WARN,
            message=(
                f"변경 {len(changed_items)}건 중 {mentioned_count}건 언급됨 "
                f"({mention_rate:.0%}) — 샘플 인용 설계상 정상"
                if enough_mentions
                else (
                    f"언급 {mentioned_count}건 / 대상 {eligible_count}건 "
                    f"({mention_rate:.0%}) — 최소 3건 또는 20% 권장"
                )
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
