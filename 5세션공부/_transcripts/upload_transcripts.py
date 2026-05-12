#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload cleaned VTT transcripts to each Notion page."""
import json
import os
import re
import time
import urllib.request
import urllib.error

with open(os.path.expanduser("~/.claude/.secrets.json"), "r", encoding="utf-8") as f:
    NOTION_API_KEY = json.load(f)["notion_token"]
TRANS_DIR = os.path.expanduser("~/.claude/5세션공부/_transcripts")

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}


def api_patch(endpoint, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.notion.com/v1{endpoint}",
        data=body,
        headers=HEADERS,
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode("utf-8"), "status": e.code}


# Regex: remove inline timestamp tags and c tags
TAG_RE = re.compile(r"<\d{2}:\d{2}:\d{2}\.\d{3}>|</?c>")
TS_LINE_RE = re.compile(r"^\d{2}:\d{2}:\d{2}\.\d{3} --> ")


def parse_vtt(path):
    lines = []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            raw = raw.rstrip("\n")
            if not raw:
                continue
            if raw in ("WEBVTT",) or raw.startswith("Kind:") or raw.startswith("Language:"):
                continue
            if TS_LINE_RE.match(raw):
                continue
            cleaned = TAG_RE.sub("", raw).strip()
            if cleaned:
                lines.append(cleaned)
    # Dedup consecutive duplicates (YouTube overlaps)
    dedup = []
    prev = None
    for line in lines:
        if line != prev:
            dedup.append(line)
            prev = line
    return dedup


def chunk_text(lines, max_chars=1900):
    """Merge lines into paragraph chunks under Notion's 2000-char block limit."""
    chunks = []
    buf = ""
    for line in lines:
        if len(buf) + len(line) + 1 > max_chars:
            if buf:
                chunks.append(buf)
            buf = line
        else:
            buf = f"{buf} {line}" if buf else line
    if buf:
        chunks.append(buf)
    return chunks


def upload_transcript(page_id, chunks):
    """POST blocks in batches of 100 (Notion API limit)."""
    total = 0
    for i in range(0, len(chunks), 100):
        batch = chunks[i : i + 100]
        children = [
            {
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": c}}]
                },
            }
            for c in batch
        ]
        r = api_patch(f"/blocks/{page_id}/children", {"children": children})
        if "error" in r:
            return r
        total += len(batch)
        time.sleep(0.35)
    return {"uploaded": total}


def main():
    with open(f"{TRANS_DIR}/pages_created.json", encoding="utf-8") as f:
        pages = json.load(f)

    # List all VTT files
    vtt_files = {}
    for fname in os.listdir(TRANS_DIR):
        if fname.endswith(".ko.vtt"):
            # format: "001_5ESggNo7Dug.ko.vtt"
            parts = fname.split("_", 1)
            idx = int(parts[0])
            vtt_files[idx] = f"{TRANS_DIR}/{fname}"

    success = 0
    skipped = 0
    errors = []
    for idx_str, info in pages.items():
        idx = int(idx_str)
        vtt_path = vtt_files.get(idx)
        if not vtt_path:
            skipped += 1
            print(f"  [{idx:03d}] ⏭  VTT 없음: {info['title'][:40]}")
            continue
        lines = parse_vtt(vtt_path)
        if not lines:
            skipped += 1
            continue
        # Add header paragraph
        header = f"📄 자동 자막 (YouTube) — {len(lines)}줄"
        chunks = [header, "━━━━━━━━━━━━"] + chunk_text(lines)
        r = upload_transcript(info["page_id"], chunks)
        if "error" in r:
            errors.append({"idx": idx, "title": info["title"], "error": r})
            print(f"  [{idx:03d}] ✗ {info['title'][:40]} — {r.get('status')}")
        else:
            success += 1
            if success % 10 == 0:
                print(f"  [{idx:03d}] ✓ {success}개 완료")

    print(f"\n✅ Success: {success}")
    print(f"⏭  Skipped: {skipped}")
    if errors:
        print(f"❌ Errors: {len(errors)}")
        with open(f"{TRANS_DIR}/upload_errors.json", "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
