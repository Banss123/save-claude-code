"""메뉴판 가안 분석기.

배민 스크래핑 원본 JSON을 받아 현안 + 가안 MenuPlan을 생성합니다.
가안은 외식업/배달업 수요가 높은 키워딩으로 메뉴명을 최적화합니다.
"""

from __future__ import annotations

import json
from pathlib import Path

import anthropic

from src.schemas.menu import MenuPlan

_SYSTEM_PROMPT = """\
당신은 요식업 배달 플랫폼 최적화 전문 컨설턴트입니다.
배민 사장님사이트에서 수집한 메뉴 원본 데이터를 분석하여
현안/가안 메뉴판 JSON을 생성합니다.

## 역할
- 입력: 배민 스크래핑 원본 데이터 (menus, options)
- 출력: MenuPlan JSON (현안 + 가안)
- 원칙: **판단만** 수행. 포맷팅/스타일링은 하지 않음.

## 현안 작성 규칙
- 스크래핑 원본 그대로 옮김 (메뉴명, 가격, 설명 변경 금지)
- 옵션그룹은 options 배열에서 no 순서대로 매핑

## 가안 작성 규칙 (★ 핵심)
- **배달앱 검색 수요가 높은 키워드**를 메뉴명에 추가/변경
- 변경 기준:
  1. 재료명을 앞에 (예: "불고기버거" → "한우불고기버거")
  2. 조리법 명시 (예: "감자튀김" → "수제감자튀김")
  3. 용량/인분 추가 (예: "육회" → "육회 1인분")
  4. 지역 특색 키워드 (예: 창원, 부산, 서울식 등)
  5. 배달앱 검색량 높은 수식어 (프리미엄, 당일, 국내산, 수제 등)
- 가격은 **절대 변경하지 말 것**
- is_changed=true + change_detail에 변경 이유 명시
- 변경 안 하는 메뉴는 is_changed=false

## 구체성 규칙
- 실제 메뉴명을 인용하여 변경
- 범용 조언 금지, 이 업장 데이터 기반으로만
"""


def _build_user_message(store_data: dict) -> str:
    return (
        "아래 배민 스크래핑 원본 데이터를 분석하여 MenuPlan JSON을 생성하세요.\n"
        "현안은 원본 그대로, 가안은 배달 수요 키워드 최적화 버전입니다.\n\n"
        f"## 업장 원본 데이터\n\n```json\n{json.dumps(store_data, ensure_ascii=False, indent=2)}\n```"
    )


def analyze_menu(
    store_data: dict,
    model: str = "claude-sonnet-4-20250514",
    api_key: str | None = None,
) -> MenuPlan:
    """배민 원본 데이터 → MenuPlan (현안 + 가안).

    Args:
        store_data: baemin_scraper.py 출력 JSON
        model: Claude 모델 ID
        api_key: API 키 (None이면 환경변수)

    Returns:
        MenuPlan 인스턴스
    """
    client = anthropic.Anthropic(api_key=api_key)

    tools = [
        {
            "name": "generate_menu_plan",
            "description": "현안/가안 메뉴판 JSON을 생성합니다.",
            "input_schema": MenuPlan.model_json_schema(),
        }
    ]

    response = client.messages.create(
        model=model,
        max_tokens=8192,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _build_user_message(store_data)}],
        tools=tools,
        tool_choice={"type": "tool", "name": "generate_menu_plan"},
    )

    for block in response.content:
        if block.type == "tool_use":
            return MenuPlan(**block.input)

    raise ValueError("Claude API가 tool_use 응답을 반환하지 않았습니다")
