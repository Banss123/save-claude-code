"""솔루션 계획서 Pydantic 스키마.

AI가 출력하는 JSON 구조를 정의합니다.
이 스키마가 DOCX 빌더의 입력이 됩니다.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class StoreInfo(BaseModel):
    """업장 기본 정보."""

    name: str = Field(description="업장명 (예: 더피플버거)")
    date: str = Field(description="작성일 (예: 26.03.27.목)")
    cuisine_type: str = Field(description="업종 (예: 버거, 치킨, 피자, 분식, 돈까스, 양식)")

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("업장명은 비어있을 수 없습니다")
        return v.strip()


class KpiBox(BaseModel):
    """KPI 박스 1개 (총 4개)."""

    label: str = Field(description="지표명 (예: 배민 CPC)")
    value: str = Field(description="수치 (예: 351원)")
    sub_label: str = Field(default="", description="보조 설명 (예: 최저 200원 목표)")


class ComparisonRow(BaseModel):
    """비교표 행 1개 (메뉴판/광고/운영)."""

    category: str = Field(description="구분 (메뉴판, 광고, 운영)")
    before: str = Field(description="지금 상태")
    after: str = Field(description="앞으로 방향")


class SectionItem(BaseModel):
    """섹션 내 항목 1개."""

    title: str = Field(description="항목 제목 (예: 메뉴모음컷 재배치)")
    description: str = Field(default="", description="상세 설명")
    is_warning: bool = Field(default=False, description="경고 문구 여부 (빨간색 강조)")
    sub_items: list[str] = Field(default_factory=list, description="하위 불릿 항목들")


class Section(BaseModel):
    """솔루션 계획서 섹션 1개."""

    title: str = Field(description="섹션 제목 (예: 배민 기본 세팅)")
    items: list[SectionItem] = Field(description="섹션 내 항목 목록")
    message: str | None = Field(
        default=None,
        description="섹션 뒤 강조 메시지 (파란 박스). 광고/운영 섹션에 사용.",
    )


class FeeTier(BaseModel):
    """수수료 구간 1개."""

    condition: str = Field(description="조건 (예: 월매출 2,000만원 이상)")
    rate: str = Field(description="수수료율 (예: 3%)")


class FeeStructure(BaseModel):
    """수수료 구조."""

    tiers: list[FeeTier] = Field(description="수수료 구간 목록")
    no_fee_condition: str = Field(
        default="목표 매출 미달성 시 수수료 미발생",
        description="수수료 미발생 조건",
    )


class SolutionPlan(BaseModel):
    """솔루션 계획서 전체 스키마.

    AI가 이 구조로 JSON을 출력하면,
    DOCX 빌더가 이를 소비하여 문서를 생성합니다.
    """

    store: StoreInfo = Field(description="업장 기본 정보")

    kpi_boxes: list[KpiBox] = Field(
        min_length=4,
        max_length=4,
        description="KPI 박스 4개 (고정)",
    )

    comparison_table: list[ComparisonRow] = Field(
        min_length=3,
        max_length=3,
        description="비교표 3행 (메뉴판/광고/운영)",
    )

    key_message: str = Field(description="핵심 메시지 (녹색 강조)")

    sections: list[Section] = Field(
        min_length=1,
        description="섹션 목록 (최소 1개, 최대 8개)",
    )

    fee_structure: FeeStructure | None = Field(
        default=None,
        description="수수료 구조 (없으면 None)",
    )
