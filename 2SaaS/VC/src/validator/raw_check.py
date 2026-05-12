"""raw → 가안 역추적 검수기 (Hallucination 차단).

raw 데이터에 없는 메뉴/옵션이 가안에 있는지 검증합니다.
AI가 raw를 무시하고 메뉴를 임의로 만들어내는 것을 차단.

원칙:
- 가안 메뉴명 정규화 후 raw 메뉴명과 매칭
- 매칭 안 되면 hallucination (단, [신규] 태그는 의도된 추가로 인정)
- 옵션 동일

검수 항목:
1. 가안 메뉴 ↔ raw 메뉴 정합 (hallucination 검출)
2. 가안 옵션 ↔ raw 옵션 정합
3. raw 메뉴 누락 검출 ([삭제] 태그 없이 가안에서 빠진 메뉴)
"""

from __future__ import annotations

import re

from src.schemas.menu import MenuPlan
from src.schemas.validation import CheckGroup, CheckItem, CheckStatus


def _normalize(name: str) -> str:
    """메뉴/옵션 이름 정규화 (정합 비교용)."""
    # [...] 브래킷 키워드 제거
    s = re.sub(r"\[[^\]]*\]", "", name)
    # 모든 공백 제거
    s = re.sub(r"\s+", "", s)
    # 소문자 + strip
    return s.strip().lower()


def _is_intentional_new(name: str) -> bool:
    """[신규] 태그가 있으면 의도된 신메뉴."""
    return "[신규]" in name or "[신메뉴]" in name


def _is_marked_deleted(name: str) -> bool:
    """[삭제] 태그가 있으면 의도된 삭제."""
    return "[삭제]" in name


def validate_no_hallucination(
    raw_data: dict, menu_plan: MenuPlan
) -> CheckGroup:
    """raw 데이터 기준 hallucination/누락 검수.

    Args:
        raw_data: 스크래퍼 출력 raw JSON (dict).
                  구조: {current_menu: {groups: [{items: [{name, ...}]}]},
                          option_groups: [{items: [{name, ...}]}]}
        menu_plan: 가안 MenuPlan
    """
    items: list[CheckItem] = []

    # ── raw에서 메뉴/옵션 이름 추출 ──
    raw_menu_names: set[str] = set()
    for g in raw_data.get("current_menu", {}).get("groups", []):
        for it in g.get("items", []):
            n = it.get("name", "")
            if n:
                raw_menu_names.add(_normalize(n))

    raw_option_names: set[str] = set()
    for og in raw_data.get("option_groups", []):
        for oi in og.get("items", []):
            n = oi.get("name", "")
            if n:
                raw_option_names.add(_normalize(n))

    # ── 1. 가안 메뉴 hallucination ──
    # 부분 매칭: raw 정규화 이름이 가안 정규화 이름에 부분 포함되면 OK
    # (가안에서 키워드 추가 [당일도축], 한우 등은 의도된 카피 보강)
    hallucinated_menus: list[str] = []
    for g in menu_plan.proposed.groups:
        for it in g.items:
            if _is_intentional_new(it.name):
                continue
            cleaned = _normalize(it.name)
            matched = cleaned in raw_menu_names or any(
                rn and rn in cleaned for rn in raw_menu_names
            )
            if not matched:
                hallucinated_menus.append(it.name)

    items.append(CheckItem(
        name="가안 메뉴 ↔ raw 정합 (hallucination 차단)",
        status=(
            CheckStatus.PASS if not hallucinated_menus else CheckStatus.FAIL
        ),
        message=(
            f"raw 기반 가안 메뉴 {sum(len(g.items) for g in menu_plan.proposed.groups)}건 모두 정합"
            if not hallucinated_menus
            else f"raw에 없는 메뉴 {len(hallucinated_menus)}건: {', '.join(hallucinated_menus[:3])}"
            f" ([신규] 태그 누락 또는 AI 임의 생성)"
        ),
    ))

    # ── 2. 가안 옵션 hallucination ──
    hallucinated_options: list[str] = []
    for og in menu_plan.proposed.option_groups:
        for oi in og.items:
            if _normalize(oi.name) not in raw_option_names:
                hallucinated_options.append(oi.name)

    items.append(CheckItem(
        name="가안 옵션 ↔ raw 정합",
        status=(
            CheckStatus.PASS if not hallucinated_options else CheckStatus.WARN
        ),
        message=(
            f"가안 옵션 {sum(len(og.items) for og in menu_plan.proposed.option_groups)}건 모두 정합"
            if not hallucinated_options
            else f"raw에 없는 옵션 {len(hallucinated_options)}건: {', '.join(hallucinated_options[:3])}"
        ),
    ))

    # ── 3. raw 메뉴 누락 검출 (raw에는 있는데 가안엔 없음) ──
    # 부분 매칭: raw 정규화 이름이 가안 어떤 정규화 이름에든 포함되면 존재 인정
    proposed_normalized = [
        _normalize(it.name)
        for g in menu_plan.proposed.groups
        for it in g.items
    ]
    missing_menus: list[str] = []
    for g in raw_data.get("current_menu", {}).get("groups", []):
        for it in g.get("items", []):
            n = it.get("name", "")
            if not n:
                continue
            raw_norm = _normalize(n)
            exists_in_proposed = any(
                raw_norm in pn for pn in proposed_normalized
            )
            if not exists_in_proposed:
                # [삭제] 태그가 명시된 경우는 의도된 누락
                deleted_marked = any(
                    _is_marked_deleted(pi.name) and raw_norm in _normalize(pi.name)
                    for pg in menu_plan.proposed.groups
                    for pi in pg.items
                )
                if not deleted_marked:
                    missing_menus.append(n)

    items.append(CheckItem(
        name="raw 메뉴 누락 검출",
        status=(
            CheckStatus.PASS if not missing_menus else CheckStatus.WARN
        ),
        message=(
            f"raw 메뉴 {len(raw_menu_names)}건 모두 가안에 반영"
            if not missing_menus
            else f"가안에서 누락 {len(missing_menus)}건: {', '.join(missing_menus[:3])}"
            f" ([삭제] 태그 없는 누락)"
        ),
    ))

    return CheckGroup(name="Hallucination 차단 (raw 역추적)", items=items)
