"""비즈니스 룰 검수기.

prompts/solution_planning.md의 도메인 규칙을 자동 검증합니다.

검수 항목:
1. CPC 단가가 카테고리 적정 범위 안인가
2. 한그릇/1인 진입 메뉴 존재 여부 (가안)
3. 즉시할인 0원 아닌가
4. CMG 비율 표준 범위 (신규 9~13% / 재주문 5~9%)
"""

from __future__ import annotations

import re

from src.schemas.menu import MenuPlan
from src.schemas.solution import SolutionPlan
from src.schemas.validation import CheckGroup, CheckItem, CheckStatus

# prompts/solution_planning.md 기준 카테고리별 CPC 적정 단가
CPC_RANGES = {
    "국수": (250, 350),
    "밀면": (250, 350),
    "냉면": (250, 350),
    "덮밥": (250, 350),
    "파스타": (300, 400),
    "양식": (300, 450),
    "버거": (300, 400),
    "분식": (350, 450),
    "떡볶이": (350, 450),
    "치킨": (350, 450),
    "중식": (350, 450),
    "찜탕": (400, 500),
    "감자탕": (400, 500),
    "낙지": (400, 500),
    "피자": (400, 500),
    "족발": (500, 600),
    "보쌈": (500, 600),
    "낙곱새": (500, 600),
    "회": (500, 600),
    "육회": (500, 600),
}

# 한그릇/1인 메뉴 키워드
ONE_PERSON_KEYWORDS = ["1인", "한그릇", "혼술", "혼밥", "1인용"]


def _detect_cpc_range(business_type: str | None) -> tuple[int, int] | None:
    """업종 문자열에서 CPC 적정 범위 추정."""
    if not business_type:
        return None
    for keyword, rng in CPC_RANGES.items():
        if keyword in business_type:
            return rng
    return None


def validate_business_rules(
    menu_plan: MenuPlan, solution_plan: SolutionPlan
) -> CheckGroup:
    """비즈니스 규칙 위반 검출."""
    items: list[CheckItem] = []

    # 솔루션 텍스트 모음
    all_solution_text = ""
    for s in solution_plan.sections:
        for it in s.items:
            all_solution_text += f" {it.title} "
            all_solution_text += " ".join(it.bullets)
            all_solution_text += " ".join(it.sub_descriptions)
            if it.quote_box:
                all_solution_text += f" {it.quote_box}"
    # core_metrics도 포함
    for cm in solution_plan.core_metrics:
        all_solution_text += f" {cm.label} {cm.value}"

    # ── 1. CPC 단가 적정 범위 ──
    cpc_range = _detect_cpc_range(solution_plan.store.business_type)
    if cpc_range:
        # "CPC ... NNN원" 패턴 추출
        cpc_matches = re.findall(
            r"CPC[^0-9]{0,20}([0-9]{2,4})\s*원", all_solution_text
        )
        if cpc_matches:
            cpc_value = int(cpc_matches[0])
            in_range = cpc_range[0] <= cpc_value <= cpc_range[1]
            items.append(CheckItem(
                name=f"CPC 단가 적정 범위 ({solution_plan.store.business_type})",
                status=CheckStatus.PASS if in_range else CheckStatus.WARN,
                message=(
                    f"CPC {cpc_value}원 (범위 {cpc_range[0]}~{cpc_range[1]}원)"
                    if in_range
                    else f"CPC {cpc_value}원이 적정 범위 {cpc_range[0]}~{cpc_range[1]}원 벗어남"
                ),
            ))
        else:
            items.append(CheckItem(
                name="CPC 단가 명시",
                status=CheckStatus.WARN,
                message="솔루션에 CPC 단가 명시 없음",
            ))

    # ── 2. 한그릇/1인 진입 메뉴 존재 (가안) ──
    one_person_found = False
    for g in menu_plan.proposed.groups:
        for it in g.items:
            if any(kw in it.name for kw in ONE_PERSON_KEYWORDS) or \
               any(kw in g.name for kw in ONE_PERSON_KEYWORDS):
                one_person_found = True
                break
        if one_person_found:
            break

    items.append(CheckItem(
        name="한그릇/1인 진입 메뉴 존재 (가안)",
        status=CheckStatus.PASS if one_person_found else CheckStatus.WARN,
        message=(
            "1인 진입 메뉴 존재"
            if one_person_found
            else "1인/한그릇 진입 메뉴 없음 — 신규 객단가 진입 채널 부재"
        ),
    ))

    # ── 3. 즉시할인 0원 아닌가 ──
    discount_matches = re.findall(
        r"즉시할인[^0-9]{0,15}([0-9]{1,4})\s*원", all_solution_text
    )
    if discount_matches:
        nonzero = [int(d) for d in discount_matches if int(d) > 0]
        items.append(CheckItem(
            name="즉시할인 설정",
            status=CheckStatus.PASS if nonzero else CheckStatus.WARN,
            message=(
                f"즉시할인 {nonzero[0]}원 설정"
                if nonzero
                else "즉시할인 0원 — 진입 전환 약화 가능"
            ),
        ))

    # ── 4. CMG 비율 표준 범위 (쿠팡이츠) ──
    cmg_matches = re.findall(
        r"(?:신규|재주문)[^0-9]{0,15}([0-9]{1,2})\s*%", all_solution_text
    )
    if cmg_matches:
        cmg_values = [int(v) for v in cmg_matches]
        # 표준: 신규 9~13%, 재주문 5~9% (느슨한 범위)
        out_of_range = [v for v in cmg_values if v < 5 or v > 15]
        items.append(CheckItem(
            name="CMG 비율 표준 범위",
            status=CheckStatus.PASS if not out_of_range else CheckStatus.WARN,
            message=(
                f"CMG 비율 표준 범위 ({cmg_values})"
                if not out_of_range
                else f"CMG 표준 범위 벗어남: {out_of_range}"
            ),
        ))

    return CheckGroup(name="비즈니스 룰 검증", items=items)
