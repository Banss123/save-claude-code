"""메뉴판 가안 Pydantic 스키마.

현안/가안 메뉴 데이터를 정의합니다.
이 스키마가 XLSX 빌더의 입력이 됩니다.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class OptionItem(BaseModel):
    """옵션 항목 1개."""

    name: str = Field(description="옵션명 (예: 콜라 500ml)")
    price: int = Field(default=0, description="추가 가격 (원 단위, 0이면 기본 포함)")

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("옵션명은 비어있을 수 없습니다")
        return v.strip()


class OptionGroup(BaseModel):
    """옵션 그룹 1개."""

    name: str = Field(description="옵션그룹명 (예: 음료 선택)")
    required: bool = Field(default=False, description="필수 여부")
    min_select: int = Field(default=0, description="최소 선택 수")
    max_select: int = Field(default=1, description="최대 선택 수")
    items: list[OptionItem] = Field(description="옵션 항목 목록")


class MenuItem(BaseModel):
    """메뉴 항목 1개."""

    name: str = Field(description="메뉴명 (예: 1++ 한우 불고기버거)")
    price: int = Field(description="가격 (원 단위)")
    description: str = Field(default="", description="구성/설명")
    option_group_ids: list[int] = Field(
        default_factory=list,
        description="연결된 옵션그룹 번호 목록",
    )
    is_changed: bool = Field(
        default=False,
        description="가안에서 변경된 항목인지 (볼드 표시용)",
    )
    change_detail: str = Field(
        default="",
        description="변경 내용 요약 (예: 메뉴명 키워드 추가)",
    )

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("메뉴명은 비어있을 수 없습니다")
        return v.strip()

    @field_validator("price")
    @classmethod
    def price_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("가격은 0 이상이어야 합니다")
        return v


class MenuGroup(BaseModel):
    """메뉴 그룹 1개."""

    name: str = Field(description="메뉴그룹명 (예: 시그니처 버거)")
    items: list[MenuItem] = Field(description="메뉴 항목 목록")

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("메뉴그룹명은 비어있을 수 없습니다")
        return v.strip()


class MenuSheet(BaseModel):
    """메뉴판 전체 스키마 (현안 또는 가안 1장).

    현안과 가안 각각 이 모델의 인스턴스가 됩니다.
    """

    store_name: str = Field(description="업장명")
    sheet_type: str = Field(description="시트 타입: '현안' 또는 '가안'")
    groups: list[MenuGroup] = Field(description="메뉴 그룹 목록")
    option_groups: list[OptionGroup] = Field(
        default_factory=list,
        description="옵션 그룹 목록 (전체 공유)",
    )

    @field_validator("sheet_type")
    @classmethod
    def valid_sheet_type(cls, v: str) -> str:
        if v not in ("현안", "가안"):
            raise ValueError("sheet_type은 '현안' 또는 '가안'이어야 합니다")
        return v

    @property
    def total_menus(self) -> int:
        return sum(len(g.items) for g in self.groups)

    @property
    def total_groups(self) -> int:
        return len(self.groups)


class MenuPlan(BaseModel):
    """현안 + 가안 쌍."""

    current: MenuSheet = Field(description="현안 메뉴판")
    proposed: MenuSheet = Field(description="가안 메뉴판")
