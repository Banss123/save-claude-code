"""검수 리포트 Pydantic 스키마.

검수 항목별 pass/fail 결과를 구조화합니다.
슬랙 메시지 및 로깅에 활용됩니다.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, computed_field


class CheckStatus(str, Enum):
    """검수 항목 결과."""

    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"  # 치명적이진 않지만 확인 필요


class CheckItem(BaseModel):
    """검수 항목 1개."""

    name: str = Field(description="검수 항목명 (예: 현안 메뉴 수 일치)")
    status: CheckStatus = Field(description="결과")
    message: str = Field(default="", description="상세 메시지")
    expected: str = Field(default="", description="기대값")
    actual: str = Field(default="", description="실제값")


class CheckGroup(BaseModel):
    """검수 그룹 (XLSX, DOCX, 교차검증 등)."""

    name: str = Field(description="그룹명 (예: XLSX 검수)")
    items: list[CheckItem] = Field(default_factory=list)

    @computed_field
    @property
    def passed(self) -> int:
        return sum(1 for i in self.items if i.status == CheckStatus.PASS)

    @computed_field
    @property
    def failed(self) -> int:
        return sum(1 for i in self.items if i.status == CheckStatus.FAIL)

    @computed_field
    @property
    def warned(self) -> int:
        return sum(1 for i in self.items if i.status == CheckStatus.WARN)


class ValidationReport(BaseModel):
    """검수 리포트 전체."""

    store_name: str = Field(description="업장명")
    groups: list[CheckGroup] = Field(default_factory=list)

    @computed_field
    @property
    def total_checks(self) -> int:
        return sum(len(g.items) for g in self.groups)

    @computed_field
    @property
    def total_passed(self) -> int:
        return sum(g.passed for g in self.groups)

    @computed_field
    @property
    def total_failed(self) -> int:
        return sum(g.failed for g in self.groups)

    @computed_field
    @property
    def is_ok(self) -> bool:
        """fail이 0이면 통과."""
        return self.total_failed == 0

    def summary(self) -> str:
        """슬랙 메시지용 한 줄 요약."""
        icon = "✅" if self.is_ok else "⚠️"
        return (
            f"{icon} {self.store_name} 검수: "
            f"{self.total_passed}/{self.total_checks} 통과"
            + (f" (실패 {self.total_failed}건)" if self.total_failed else "")
        )

    def detail_report(self) -> str:
        """상세 리포트 (슬랙 스레드용)."""
        lines: list[str] = [self.summary(), ""]
        for group in self.groups:
            lines.append(f"**{group.name}** ({group.passed}/{len(group.items)})")
            for item in group.items:
                icon = {"pass": "✅", "fail": "❌", "warn": "⚠️"}[item.status.value]
                line = f"  {icon} {item.name}"
                if item.message:
                    line += f" — {item.message}"
                lines.append(line)
            lines.append("")
        return "\n".join(lines)
