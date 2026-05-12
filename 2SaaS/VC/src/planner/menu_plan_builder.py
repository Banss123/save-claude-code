"""스크래핑 JSON + 업종 키워드 DB → MenuPlan JSON.

자동 가안 생성:
1. 메뉴명 프리픽스 (업종 키워드 매칭)
2. 설명문 보강 (리뷰/업종 키워드 삽입)
3. 한그릇·1인 진입 메뉴 자동 추가 (객단가 기반)
4. 이름 치환 (포크→돼지고기 등)
5. 획일화 방지: 같은 그룹 프리픽스 중복 시 변주 키워드로 대체
6. 방어: 이상한 그룹명(매장ID 패턴) 필터링, 옵션 매칭 exact 우선
"""
from __future__ import annotations

import re
from collections import Counter

from src.knowledge.industry_keywords import (
    apply_name_replacements,
    get_industry,
    match_patterns,
    match_variations,
)

UI_NOISE = {"메뉴판 편집", "매장가격 인증", "가게 메뉴판 편집"}

# 매장ID 헤더 패턴 (예: "14630162 | 양식")
SHOP_HEADER_RE = re.compile(r"^\d{5,}\s*\|\s*")


def _clean_group_name(raw: str) -> str:
    """그룹명 방어: 매장ID/공백/옵션그룹 잔재 필터링."""
    if not raw:
        return "기타"
    cleaned = SHOP_HEADER_RE.sub("", raw).strip()
    # 옵션그룹처럼 긴 조합 문자열은 뒤에 "외" 축약
    if len(cleaned) > 40 and ("+" in cleaned or "(" in cleaned):
        return "기타 세트"
    return cleaned or "기타"


def _scraped_menus_to_groups(menus: list[dict], options: list[dict]) -> list[dict]:
    filtered = [m for m in menus if not any(k in m["name"] for k in UI_NOISE)]
    # 옵션그룹 이름 → no 맵 (exact match 우선)
    opt_name_to_no = {o["group_name"]: o["no"] for o in options}

    groups_dict: dict[str, list[dict]] = {}
    for m in filtered:
        g = _clean_group_name(m.get("group_name") or "")
        groups_dict.setdefault(g, [])
        opt_ids: list[int] = []
        seen_ids: set[int] = set()
        for name in m.get("assigned_options", []):
            # 1순위: exact match
            if name in opt_name_to_no:
                no = opt_name_to_no[name]
                if no not in seen_ids:
                    opt_ids.append(no)
                    seen_ids.add(no)
                continue
            # 2순위: 공백/기호 제거 후 exact (오타 대응)
            key_norm = re.sub(r"\s+", "", name)
            for o_name, o_no in opt_name_to_no.items():
                if re.sub(r"\s+", "", o_name) == key_norm:
                    if o_no not in seen_ids:
                        opt_ids.append(o_no)
                        seen_ids.add(o_no)
                    break
        groups_dict[g].append({
            "name": m["name"],
            "price": m["price"],
            "description": m.get("composition") or m.get("description") or "",
            "option_group_ids": opt_ids,
            "is_changed": False,
            "change_detail": "",
        })
    return [{"name": g, "items": items} for g, items in groups_dict.items()]


def _scraped_options_to_option_groups(options: list[dict]) -> list[dict]:
    result = []
    for o in options:
        cond = o.get("condition", "")
        required = "[필수]" in cond
        min_m = re.search(r"최소\s*(\d+)", cond)
        max_m = re.search(r"최대\s*(\d+)", cond)
        result.append({
            "name": o["group_name"],
            "required": required,
            "min_select": int(min_m.group(1)) if min_m else 0,
            "max_select": int(max_m.group(1)) if max_m else 1,
            "items": [{"name": it["name"], "price": it["price"]} for it in o.get("items", [])],
        })
    return result


def _build_proposed_item(
    item: dict,
    industry_db: dict | None,
    *,
    group_prefix_counter: Counter | None = None,
) -> dict:
    """단일 메뉴에 업종 룰 + 변주 키워드 적용."""
    orig_name = item["name"]
    orig_desc = item["description"]

    if industry_db is None:
        return {**item}

    matches = match_patterns(orig_name, industry_db)
    variations = match_variations(orig_name)

    if not matches and not variations:
        return {**item}

    # 메뉴명 변경
    new_name = apply_name_replacements(orig_name, matches)
    prefixes = [m.get("prefix") for m in matches if m.get("prefix")]
    primary_prefix = prefixes[0] if prefixes else None
    if primary_prefix and not new_name.startswith("["):
        new_name = f"{primary_prefix} {new_name}"

    # 설명 조합
    desc_parts: list[str] = []
    if orig_desc:
        desc_parts.append(orig_desc)

    desc_keywords: list[str] = []
    for m in matches:
        desc_keywords.extend(m.get("desc_keywords", []))

    # 변주 토큰 추가 (획일화 방지의 핵심)
    # 같은 그룹에서 이 프리픽스가 2번째 이상 등장하면 변주 비중 ↑
    prefix_count = (group_prefix_counter or Counter()).get(primary_prefix, 0)
    variation_weight = 2 if prefix_count > 0 else 1
    var_tokens = variations[: 1 + variation_weight]  # 기본 1개, 중복이면 2-3개

    # 중복 제거 + 순서 유지
    all_kw = desc_keywords + var_tokens
    seen: set = set()
    dedup_kw = [k for k in all_kw if not (k in seen or seen.add(k))]

    if dedup_kw:
        # 공통 업종 키워드 1개 + 변주 1-2개 순서로 배치
        head = dedup_kw[:1]
        tail_candidates = var_tokens[:2]
        combined = head + [t for t in tail_candidates if t not in head]
        desc_parts.insert(0, " · ".join(combined[:3]))

    new_desc = " · ".join(desc_parts) if desc_parts else industry_db.get("base_desc", "")

    changed = new_name != orig_name or new_desc != orig_desc
    change_notes: list[str] = []
    if new_name != orig_name:
        change_notes.append("프리픽스·치환")
    if new_desc != orig_desc:
        change_notes.append("설명 보강" + (f"(+{len(var_tokens)}변주)" if var_tokens else ""))

    return {
        "name": new_name,
        "price": item["price"],
        "description": new_desc,
        "option_group_ids": item["option_group_ids"],
        "is_changed": changed,
        "change_detail": ", ".join(change_notes) if change_notes else "",
    }


def build_menu_plan(
    scraped: dict,
    store_name: str,
    cuisine: str,
    *,
    add_one_person_entry: bool = True,
    aov: int | None = None,
) -> dict:
    """스크래핑 JSON → MenuPlan JSON (현안 + 가안)."""
    industry_db = get_industry(cuisine)

    current_groups = _scraped_menus_to_groups(scraped["menus"], scraped["options"])
    opt_groups = _scraped_options_to_option_groups(scraped["options"])

    proposed_groups = []
    for g in current_groups:
        # 1차 pass: 프리픽스 빈도 측정 (획일화 감지용)
        prefix_counter: Counter = Counter()
        for it in g["items"]:
            matches = match_patterns(it["name"], industry_db) if industry_db else []
            prefixes = [m.get("prefix") for m in matches if m.get("prefix")]
            if prefixes:
                prefix_counter[prefixes[0]] += 1
        # 2차 pass: 아이템 생성 (프리픽스 카운트 참조)
        new_items: list[dict] = []
        running_counter: Counter = Counter()
        for it in g["items"]:
            matches = match_patterns(it["name"], industry_db) if industry_db else []
            primary_prefix = next(
                (m.get("prefix") for m in matches if m.get("prefix")), None
            )
            new_items.append(
                _build_proposed_item(it, industry_db, group_prefix_counter=running_counter)
            )
            if primary_prefix:
                running_counter[primary_prefix] += 1
        proposed_groups.append({"name": g["name"], "items": new_items})

    # 한그릇·1인 진입 메뉴 자동 추가 (객단가 < 25,000원일 때)
    if add_one_person_entry and aov and aov < 25000 and industry_db:
        lowest_price = min(
            (item["price"] for g in current_groups for item in g["items"] if item["price"] > 0),
            default=10000,
        )
        entry_price = max(lowest_price + 1900, 9900)
        proposed_groups.append({
            "name": "[한그릇·1인] 진입세트",
            "items": [{
                "name": "[1인 실속] 가성비 세트",
                "price": entry_price,
                "description": "1인 고객을 위한 가성비 세트 (대표 메뉴 1인 구성)",
                "option_group_ids": [1] if opt_groups else [],
                "is_changed": False,
                "change_detail": "",
            }],
        })

    return {
        "current": {
            "store_name": store_name,
            "sheet_type": "현안",
            "groups": current_groups,
            "option_groups": opt_groups,
        },
        "proposed": {
            "store_name": store_name,
            "sheet_type": "가안",
            "groups": proposed_groups,
            "option_groups": opt_groups,
        },
    }
