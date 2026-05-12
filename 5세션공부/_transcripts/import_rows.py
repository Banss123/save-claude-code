#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import 170 rows into Notion DB."""
import json
import os
import time
import urllib.request
import urllib.error

with open(os.path.expanduser("~/.claude/.secrets.json"), "r", encoding="utf-8") as f:
    NOTION_API_KEY = json.load(f)["notion_token"]
DB_ID = "34753d16-da25-8018-91ba-efd841cad378"

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}


def api_post(endpoint, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.notion.com/v1{endpoint}",
        data=body,
        headers=HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode("utf-8"), "status": e.code}


def create_row(entry):
    properties = {
        "이름": {"title": [{"text": {"content": entry["title"]}}]},
        "URL": {"url": entry["url"]},
        "대분류": {"select": {"name": entry["대분류"]}},
        "공부상태": {"select": {"name": "⬜ 미시작"}},
    }
    if entry["소분류"]:
        properties["소분류"] = {"select": {"name": entry["소분류"]}}

    return api_post("/pages", {
        "parent": {"database_id": DB_ID},
        "properties": properties,
    })


def main():
    with open("C:/Users/반민성/.claude/세션공부/_transcripts/classified.json", encoding="utf-8") as f:
        entries = json.load(f)

    result_map = {}
    errors = []
    for i, entry in enumerate(entries, 1):
        r = create_row(entry)
        if "id" in r:
            result_map[entry["idx"]] = {
                "page_id": r["id"],
                "video_id": entry["video_id"],
                "title": entry["title"],
            }
            if i % 20 == 0:
                print(f"  [{i}/170] {entry['idx']:03d} ✓")
        else:
            errors.append({"idx": entry["idx"], "title": entry["title"], "error": r})
            print(f"  [{i}/170] {entry['idx']:03d} ✗ {entry['title'][:40]}")
        time.sleep(0.35)

    with open("C:/Users/반민성/.claude/세션공부/_transcripts/pages_created.json", "w", encoding="utf-8") as f:
        json.dump(result_map, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Created: {len(result_map)}/170")
    if errors:
        print(f"❌ Errors: {len(errors)}")
        with open("C:/Users/반민성/.claude/세션공부/_transcripts/import_errors.json", "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
        print("  → import_errors.json 확인")


if __name__ == "__main__":
    main()
