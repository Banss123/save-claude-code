#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rollback: re-add 소분류 column and repopulate from classified.json."""
import json, os, time
import urllib.request, urllib.error

with open(os.path.expanduser("~/.claude/.secrets.json"), "r", encoding="utf-8") as f:
    KEY = json.load(f)["notion_token"]
DB = "34753d16-da25-8018-91ba-efd841cad378"
BASE = os.path.expanduser("~/.claude/5세션공부/_transcripts")

HEADERS = {
    "Authorization": f"Bearer {KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

SUB_OPTIONS = [
    "1.1 시장 분석", "1.2 아이템 개발", "1.3 창업 기본",
    "2.1 전략·해자", "2.2 BM·구조", "2.3 확장·피벗", "2.4 고객·지표", "2.5 가격·수익",
    "3.1 영업 방법론", "3.2 협상·설득",
    "4.1 SNS·인스타", "4.2 브랜딩·인식", "4.3 카피·스토리", "4.4 퍼널·전환", "4.5 기본·원리",
    "5.1 의사결정", "5.2 멘탈·원칙", "5.3 재무·법인", "5.4 돈의 원리",
    "8.1 프로젝트", "8.2 외부 세션",
]


def api(method, endpoint, payload=None):
    body = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(
        f"https://api.notion.com/v1{endpoint}",
        data=body, headers=HEADERS, method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300], "status": e.code}


# Step 1: Re-add 소분류 property
print("Step 1: 소분류 컬럼 복구 중...")
r = api("PATCH", f"/databases/{DB}", {
    "properties": {
        "소분류": {
            "select": {"options": [{"name": n} for n in SUB_OPTIONS]}
        }
    }
})
if "error" in r:
    print("❌ Add column failed:", r)
    exit(1)
print("✅ 소분류 컬럼 추가됨")

# Step 2: Build video_id → page_id mapping
with open(f"{BASE}/pages_created.json", encoding="utf-8") as f:
    pages = json.load(f)  # {idx: {page_id, video_id, title}}
with open(f"{BASE}/classified.json", encoding="utf-8") as f:
    classified = json.load(f)  # list of {idx, title, 소분류, ...}

print(f"\nStep 2: 170개 row에 소분류 재적용...")
success = 0
skipped = 0
errors = []
for entry in classified:
    idx = str(entry["idx"])
    sub = entry.get("소분류")
    if not sub:
        skipped += 1
        continue
    if idx not in pages:
        continue
    page_id = pages[idx]["page_id"]
    r = api("PATCH", f"/pages/{page_id}", {
        "properties": {"소분류": {"select": {"name": sub}}}
    })
    if "error" in r:
        errors.append({"idx": idx, "title": entry["title"], "error": r})
        print(f"  [{idx:>3}] ✗ {entry['title'][:40]}")
    else:
        success += 1
        if success % 30 == 0:
            print(f"  [{idx:>3}] ✓ {success}개 완료")
    time.sleep(0.35)

print(f"\n✅ 복구 완료: {success}")
print(f"⏭  Skipped (번외): {skipped}")
if errors:
    print(f"❌ Errors: {len(errors)}")
