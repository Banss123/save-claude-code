"""Phase J — 에이전트·스킬 설정 파일 정합성 테스트.

에이전트가 실제로 동작하는지가 아니라, `.claude/agents/*.md` 와 `.claude/skills/*/SKILL.md`
의 frontmatter + 본문이 담당자 이식 시 정합한 상태인지 검증한다.

검사 항목:
  1. value-chain-onboarding.md 존재 + YAML frontmatter 파싱 가능
  2. 본문에 `data/references/목표매출_산정로직.md` 경로 참조 포함 (정본 로드 지시)
  3. 4개 스킬 SKILL.md 존재 + frontmatter 파싱 + bash 코드블록 내 `uv run python -m src.xxx` 포함
  4. quality-check SKILL.md 에 REF-1~8 언급 존재

에이전트 실행 자체는 테스트 범위 밖.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
AGENT_PATH = PROJECT_ROOT / ".claude" / "agents" / "value-chain-onboarding.md"
SKILLS_DIR = PROJECT_ROOT / ".claude" / "skills"
SKILL_NAMES = ["baemin-collect", "document-build", "onboarding-full", "quality-check"]

# 정본 경로 — 에이전트가 반드시 로드해야 하는 문서
REFERENCE_DOC = "data/references/목표매출_산정로직.md"


def _parse_frontmatter(content: str) -> dict[str, str] | None:
    """단순 YAML frontmatter 파싱 (k: v 한 줄 단위만).

    외부 의존성 없이 정합성만 검증. 복잡한 YAML 구조는 검사 대상 아님.
    """
    m = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not m:
        return None
    fm_text = m.group(1)
    result: dict[str, str] = {}
    for line in fm_text.splitlines():
        if ":" not in line or line.strip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        result[key.strip()] = value.strip()
    return result


def _extract_bash_blocks(content: str) -> list[str]:
    """마크다운 bash 코드블록 내부 텍스트만 추출."""
    pattern = re.compile(r"```bash\n(.*?)\n```", re.DOTALL)
    return pattern.findall(content)


# ── 1. 에이전트 파일 ───────────────────────────────────────────
def test_agent_md_exists():
    assert AGENT_PATH.exists(), (
        f"에이전트 파일 미존재: {AGENT_PATH}"
    )


def test_agent_md_frontmatter_parses():
    content = AGENT_PATH.read_text(encoding="utf-8")
    fm = _parse_frontmatter(content)
    assert fm is not None, "frontmatter (--- 블록) 파싱 실패"
    assert fm.get("name") == "value-chain-onboarding", (
        f"frontmatter name 불일치: {fm.get('name')}"
    )
    assert fm.get("description"), "frontmatter description 누락"


def test_agent_md_references_reference_doc():
    """정본 경로 참조가 본문에 명시되어야 담당자가 찾을 수 있다."""
    content = AGENT_PATH.read_text(encoding="utf-8")
    assert REFERENCE_DOC in content, (
        f"에이전트 본문에 정본 경로 '{REFERENCE_DOC}' 참조 누락"
    )


# ── 2. 스킬 파일 ───────────────────────────────────────────────
@pytest.mark.parametrize("skill_name", SKILL_NAMES)
def test_skill_md_exists(skill_name: str):
    path = SKILLS_DIR / skill_name / "SKILL.md"
    assert path.exists(), f"스킬 파일 미존재: {path}"


@pytest.mark.parametrize("skill_name", SKILL_NAMES)
def test_skill_md_frontmatter_parses(skill_name: str):
    path = SKILLS_DIR / skill_name / "SKILL.md"
    content = path.read_text(encoding="utf-8")
    fm = _parse_frontmatter(content)
    assert fm is not None, f"{skill_name}: frontmatter 파싱 실패"
    assert fm.get("name") == skill_name, (
        f"{skill_name}: frontmatter name 불일치 (실제: {fm.get('name')})"
    )
    assert fm.get("description"), f"{skill_name}: description 누락"


@pytest.mark.parametrize("skill_name", SKILL_NAMES)
def test_skill_md_contains_uv_cli_command(skill_name: str):
    """각 SKILL.md 는 bash 코드블록 안에 실제 CLI 명령을 포함해야 담당자가 바로 실행 가능."""
    path = SKILLS_DIR / skill_name / "SKILL.md"
    content = path.read_text(encoding="utf-8")
    blocks = _extract_bash_blocks(content)
    assert blocks, f"{skill_name}: bash 코드블록 없음"
    joined = "\n".join(blocks)
    assert "uv run python -m src." in joined, (
        f"{skill_name}: bash 코드블록에 'uv run python -m src.xxx' CLI 명령 누락"
    )


def test_quality_check_mentions_ref_rules():
    """정본 §필수 준수 REF-1~8 모두 quality-check SKILL.md 에 언급돼야 담당자가 체크리스트를 안다."""
    path = SKILLS_DIR / "quality-check" / "SKILL.md"
    content = path.read_text(encoding="utf-8")
    missing: list[str] = []
    for i in range(1, 9):
        ref_id = f"REF-{i}"
        if ref_id not in content:
            missing.append(ref_id)
    assert not missing, (
        f"quality-check SKILL.md 에 누락된 REF: {', '.join(missing)}"
    )


if __name__ == "__main__":
    # 수동 실행 지원
    sys.exit(pytest.main([__file__, "-v"]))
