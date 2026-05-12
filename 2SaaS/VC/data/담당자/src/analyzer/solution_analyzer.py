"""Claude API 솔루션 분석기.

원본 업장 데이터를 받아 SolutionPlan JSON을 생성합니다.
Structured Output으로 스키마 준수를 보장합니다.
"""

from __future__ import annotations

import json
from pathlib import Path

import anthropic

from src.schemas.solution import SolutionPlan

# 시스템 프롬프트 로드
_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "solution_planning.md"


def _load_system_prompt() -> str:
    """시스템 프롬프트를 파일에서 로드합니다."""
    return _PROMPT_PATH.read_text(encoding="utf-8")


def _build_user_message(store_data: dict) -> str:
    """업장 데이터를 사용자 메시지로 변환합니다."""
    return (
        "아래 업장 데이터를 분석하여 솔루션 계획서를 작성해주세요.\n"
        "SolutionPlan JSON 스키마에 맞춰 출력하세요.\n\n"
        f"## 업장 데이터\n\n```json\n{json.dumps(store_data, ensure_ascii=False, indent=2)}\n```"
    )


def analyze_store(
    store_data: dict,
    model: str = "claude-sonnet-4-20250514",
    api_key: str | None = None,
) -> SolutionPlan:
    """업장 데이터를 분석하여 SolutionPlan을 생성합니다.

    Args:
        store_data: 업장 원본 데이터 (메뉴, 가격, 운영 지표 등)
        model: Claude 모델 ID
        api_key: API 키 (None이면 환경변수에서 로드)

    Returns:
        SolutionPlan 인스턴스
    """
    client = anthropic.Anthropic(api_key=api_key)

    system_prompt = _load_system_prompt()
    user_message = _build_user_message(store_data)

    # Claude API 호출 (Structured Output은 tool_use로 구현)
    tools = [
        {
            "name": "generate_solution_plan",
            "description": "솔루션 계획서 JSON을 생성합니다.",
            "input_schema": SolutionPlan.model_json_schema(),
        }
    ]

    response = client.messages.create(
        model=model,
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        tools=tools,
        tool_choice={"type": "tool", "name": "generate_solution_plan"},
    )

    # tool_use 블록에서 JSON 추출
    for block in response.content:
        if block.type == "tool_use":
            return SolutionPlan(**block.input)

    raise ValueError("Claude API가 tool_use 응답을 반환하지 않았습니다")


def analyze_and_build(
    store_data: dict,
    output_dir: str | Path = "output",
    model: str = "claude-sonnet-4-20250514",
    api_key: str | None = None,
) -> tuple[SolutionPlan, Path]:
    """분석 + 문서 생성을 한번에 수행합니다.

    Args:
        store_data: 업장 원본 데이터
        output_dir: 출력 디렉토리
        model: Claude 모델 ID
        api_key: API 키

    Returns:
        (SolutionPlan, 생성된 DOCX 경로) 튜플
    """
    from src.generator.docx_builder import build_solution_docx

    plan = analyze_store(store_data, model=model, api_key=api_key)

    output_dir = Path(output_dir)
    output_path = output_dir / f"{plan.store.name}_솔루션_계획서.docx"
    docx_path = build_solution_docx(plan, output_path)

    return plan, docx_path
