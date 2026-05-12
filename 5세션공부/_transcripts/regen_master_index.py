#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate MASTER_INDEX.md from classified.json (no priority, 6 categories)."""
import json
import re
from collections import defaultdict

with open("C:/Users/반민성/.claude/3 세션공부/_transcripts/classified.json", encoding="utf-8") as f:
    entries = json.load(f)

def extract_sid(title):
    """Extract session ID from title."""
    m = re.search(r'Session\s*(\d+)', title, re.I)
    if m:
        return f"S{int(m.group(1)):03d}"
    m = re.search(r'세션\s*(\d+)', title)
    if m:
        return f"S{int(m.group(1)):03d}"
    # External / special — use date or index
    return None

def clean_title(title):
    """Remove Session prefix, keep core title."""
    t = re.sub(r'^(Session|Sesssion|Seesion|세션)\s*\d+\s*[:|]?\s*', '', title, flags=re.I)
    t = re.sub(r'^\d{4}[/-]\d{1,2}[/-]\d{1,2}\s*[-:]*\s*', '', t)
    t = re.sub(r'^\d{4}\s+\d{2}\s+\d{2}.*?\s{2}', '', t)
    return t.strip()

grouped = defaultdict(list)
for e in entries:
    grouped[e["대분류"]].append(e)

lines = [
    "# MASTER INDEX — Sessions R&D",
    "",
    "> 상태: ⬜ 미시작 / 🔄 공부중 / ✅ 완료",
    "",
    "---",
    "",
]

order = [
    "1. 사업구상",
    "2. 사업구조",
    "3. 영업/협상",
    "4. 마케팅/브랜딩",
    "5. 조직/경영",
    "6. 번외/프로젝트",
]

total = 0
summary_counts = {}
for main in order:
    items = grouped.get(main, [])
    summary_counts[main] = len(items)
    total += len(items)
    lines.append(f"## {main} ({len(items)}개)")
    lines.append("")
    lines.append("| ID | 제목 | 소분류 | 상태 | 링크 |")
    lines.append("|----|------|--------|------|------|")
    # Sort by extracted session number desc (newer first), None last
    def sort_key(e):
        sid = extract_sid(e["title"])
        if sid:
            return (0, -int(sid[1:]))
        return (1, e["idx"])
    for e in sorted(items, key=sort_key):
        sid = extract_sid(e["title"]) or f"X{e['idx']:03d}"
        title = clean_title(e["title"])
        sub = e.get("소분류") or "—"
        status = "⬜"
        url = e["url"]
        lines.append(f"| {sid} | {title} | {sub} | {status} | [→]({url}) |")
    lines.append("")
    lines.append("---")
    lines.append("")

lines.append("## 진행 현황")
lines.append("")
lines.append("| 카테고리 | 전체 | 완료 | 진행중 |")
lines.append("|---------|------|------|--------|")
for main in order:
    lines.append(f"| {main} | {summary_counts[main]} | 0 | 0 |")
lines.append(f"| **합계** | **{total}** | **0** | **0** |")
lines.append("")

output = "\n".join(lines)
with open("C:/Users/반민성/.claude/3 세션공부/_INDEX/MASTER_INDEX.md", "w", encoding="utf-8") as f:
    f.write(output)

print(f"✅ MASTER_INDEX.md 재생성 완료 ({total}개 세션)")
for main in order:
    print(f"  {main}: {summary_counts[main]}")
