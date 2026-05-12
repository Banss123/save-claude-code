"""솔루션 계획서 Pydantic 스키마 v2.

ValueChain 표준 양식 (5건 검증 후 확정)에 맞춘 유연한 컴포넌트 모델.
양식 명세 마스터: data/references/_솔루션양식_표준.md

핵심 설계:
- 모든 표지 컴포넌트가 가변 (KPI 박스 2~6개, 비교표 3~5행)
- 본문 섹션 수 가변 (3~8개)
- 꼬리 (사장님 확인 + 수수료) 옵션
- 변종 A.전통형 / B.진단형 모두 동일 스키마로 표현 가능

AI가 이 구조로 JSON 출력 → DocxBuilder가 결정적으로 DOCX 생성.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class StoreInfo(BaseModel):
    """업장 정보."""

    name: str = Field(description="업장명 (예: 담솥 청주점)")
    business_type: str | None = Field(
        default=None, description="업종 (예: 한식·도시락, 밀면 전문점)"
    )
    location: str | None = Field(default=None, description="위치 (예: 부산 서면)")
    document_date: str | None = Field(
        default=None, description="작성일자 (예: 26.03.18.화)"
    )

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("업장명은 비어있을 수 없습니다")
        return v.strip()


class CoreMetricBox(BaseModel):
    """표지 핵심 지표 박스 1개.

    매장별 자유 조합:
    - 매출 KPI: "계약서 작성 기준 월매출", "1,100만원" (is_baseline=True)
    - 목표 KPI: "목표 매출 (+3%)", "1,800만원" (is_target=True)
    - 진단 KPI: "현재 CTR", "2.5%"
    - 광고 KPI: "배민 CPC 단가 (예정)", "388원"
    """

    label: str = Field(description="지표명 (예: 현재 CTR, 계약서 작성 기준 월매출)")
    value: str = Field(description="수치 (단위 포함, 예: 388원, 1,100만원, 2.5%)")
    sub_label: str | None = Field(default=None, description="보조 설명")
    is_target: bool = Field(default=False, description="목표값 (녹색 강조)")
    is_baseline: bool = Field(default=False, description="기준값 (오렌지 강조)")


class ComparisonRow(BaseModel):
    """비교표 행 1개."""

    category: str = Field(
        description="구분 (메뉴판/썸네일/광고/운영/플랫폼 등)"
    )
    before_lines: list[str] = Field(
        min_length=1, description="현재 상태 (여러 줄 가능)"
    )
    after_lines: list[str] = Field(
        min_length=1, description="개선 후 (여러 줄 가능)"
    )
    after_first_bold: bool = Field(
        default=True, description="개선 첫 줄 볼드 강조"
    )


class ComparisonTable(BaseModel):
    """비교표 전체 (표지에 위치)."""

    title: str = Field(
        default="그래서, 배달 앱 이렇게 바뀝니다",
        description="비교표 제목",
    )
    header_label: Literal["Before/After", "지금/앞으로"] = Field(
        default="지금/앞으로",
        description="헤더 라벨 (변종 A=Before/After / B=지금/앞으로)",
    )
    rows: list[ComparisonRow] = Field(min_length=3, max_length=5)
    footer_quote: str | None = Field(
        default=None,
        description="비교표 끝 컨설턴트 코멘트 (회색 인용)",
    )


class SectionItem(BaseModel):
    """섹션 내 항목 1개."""

    number: str | None = Field(
        default=None,
        description="번호 ('1' 직렬 / '1.1' 섹션별 / None)",
    )
    title: str = Field(description="항목 제목 (예: 사장님추천 6개 구성)")
    marker: Literal["star", "arrow", "warning", "none"] = Field(
        default="arrow",
        description="강조 마커 (★/▸/빨간경고/없음)",
    )
    bullets: list[str] = Field(
        default_factory=list, description="▸ 항목들 (1단계)"
    )
    sub_descriptions: list[str] = Field(
        default_factory=list, description="– 추가 설명 (2단계)"
    )
    quote_box: str | None = Field(
        default=None, description="회색/녹색 인용 박스 (컨설턴트 코멘트)"
    )
    quote_box_color: Literal["gray", "green"] = Field(
        default="gray", description="인용 박스 색상"
    )

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("항목 제목은 비어있을 수 없습니다")
        return v.strip()


class Section(BaseModel):
    """본문 섹션 1개 (① ② ... 번호)."""

    number: int = Field(ge=1, le=8, description="섹션 번호 (1~8)")
    title: str = Field(description="섹션 제목 (예: 배민 기본 세팅)")
    items: list[SectionItem] = Field(min_length=1)
    footer_quote: str | None = Field(
        default=None, description="섹션 끝 코멘트"
    )

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("섹션 제목은 비어있을 수 없습니다")
        return v.strip()


class OwnerCheckItem(BaseModel):
    """⑥ 사장님 확인 항목 1개 (전통형 양식만)."""

    number: int = Field(ge=1, description="번호 (1, 2, ... )")
    description: str = Field(description="확인/요청 사항")


class FeeTier(BaseModel):
    """수수료 구간 1개."""

    label: str = Field(description="라벨 (예: 1차 목표 매출)")
    amount: str = Field(description="매출 구간 (예: 1,800만원)")
    rate_pct: int = Field(ge=0, le=100, description="수수료율 %")


class FeeStructure(BaseModel):
    """⑦ 수수료 구조 (전통형 양식만)."""

    tiers: list[FeeTier] = Field(min_length=1)
    notes: list[str] = Field(
        default_factory=lambda: [
            "후불제: 매출 목표 달성 시에만 과금",
            "목표 매출 미달 시 수수료 없음",
        ]
    )


class SolutionPlan(BaseModel):
    """ValueChain 솔루션 계획서 (유연 컴포넌트 모델 v2).

    AI가 이 구조로 JSON 출력 → DocxBuilder가 결정적으로 DOCX 변환.
    양식 명세: data/references/_솔루션양식_표준.md
    """

    # ── 표지 ──
    store: StoreInfo = Field(description="업장 정보")
    document_title: str = Field(default="솔루션 계획서")
    subtitle_suffix: str = Field(
        default="배달앱 매출 최적화 컨설팅",
        description="부제 끝부분",
    )
    core_metrics: list[CoreMetricBox] = Field(
        min_length=2,
        max_length=6,
        description="핵심 지표 박스 (가변 2~6개)",
    )
    comparison: ComparisonTable = Field(description="비교표")
    key_message: str | None = Field(
        default=None,
        description="핵심 한줄 메시지 (표지, 비교표 다음 박스). 옵션.",
    )
    cover_footer_note: str = Field(
        default=(
            "※ 아래 세부 계획을 검토하신 후, "
            "조정이 필요한 부분을 말씀해주시면 반영하겠습니다."
        ),
        description="표지 끝 안내문",
    )

    # ── 본문 ──
    sections: list[Section] = Field(
        min_length=3, description="본문 섹션들 (3~8개)"
    )
    item_numbering: Literal["per_section", "serial"] = Field(
        default="serial",
        description="항목 번호 매김 (per_section: 1.1, 1.2... / serial: 1, 2, ...)",
    )

    # ── 꼬리 (모두 옵션) ──
    owner_checks: list[OwnerCheckItem] | None = Field(
        default=None, description="⑥ 사장님 확인 (전통형만, 없으면 None)"
    )
    owner_check_intro: str = Field(
        default=(
            "아래 항목은 메뉴판 VMD 제작 및 콘텐츠보드 적용을 위해 "
            "사장님 확인이 필요한 사항입니다."
        ),
        description="사장님 확인 섹션 도입 문구",
    )
    fee_structure: FeeStructure | None = Field(
        default=None, description="⑦ 수수료 (전통형만, 없으면 None)"
    )

    # ── 메타 ──
    company_name: str = Field(default="ValueChain")
    company_subtitle: str = Field(default="배달 플랫폼 매출 최적화 컨설팅")
    company_footer_note: str = Field(
        default=(
            "본 계획서는 매장 현황 분석을 기반으로 작성되었으며, "
            "사장님과의 협의 후 최종 확정됩니다."
        ),
    )
    show_page_numbers: bool = Field(
        default=False, description="페이지 헤더 'N/M' 표시"
    )
    variant: Literal["traditional", "diagnostic"] = Field(
        default="diagnostic",
        description="양식 변종 (A.전통형 / B.진단형)",
    )
