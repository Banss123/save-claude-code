#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parse taeyeonnam video list into JSON."""
import json

entries = []
with open("C:/Users/반민성/.claude/3 세션공부/_transcripts/taeyeonnam_list.txt", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) < 3:
            continue
        # Handle case where title contains |
        vid = parts[0]
        view = parts[-2]
        dur = parts[-1]
        title = "|".join(parts[1:-2])
        try:
            view_n = int(view)
            dur_n = float(dur)
        except ValueError:
            continue
        entries.append({
            "id": vid,
            "title": title,
            "view_count": view_n,
            "duration_sec": dur_n,
            "url": f"https://youtu.be/{vid}",
        })

# Sort by views desc
entries.sort(key=lambda e: -e["view_count"])

with open("C:/Users/반민성/.claude/3 세션공부/_transcripts/taeyeonnam.json", "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

# Print summary
print(f"총 {len(entries)}개 영상")
print(f"총 조회수: {sum(e['view_count'] for e in entries):,}")
print(f"평균 조회수: {sum(e['view_count'] for e in entries)//len(entries):,}")
print(f"최고: {entries[0]['view_count']:,} - {entries[0]['title']}")
print(f"최저: {entries[-1]['view_count']:,} - {entries[-1]['title']}")
print()
print("상위 10개 (터진 영상):")
for e in entries[:10]:
    print(f"  {e['view_count']:>8,} | {e['title'][:60]}")
print()
print("하위 10개:")
for e in entries[-10:]:
    print(f"  {e['view_count']:>8,} | {e['title'][:60]}")
