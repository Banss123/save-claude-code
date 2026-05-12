#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload markdown plan + checklist + session summaries to Notion under 해병듀오 마케팅 page."""
import json
import os
import re
import time
import urllib.request
import urllib.error

with open(os.path.expanduser("~/.claude/.secrets.json"), "r", encoding="utf-8") as f:
    NOTION_API_KEY = json.load(f)["notion_token"]
PARENT_PAGE_ID = "2c453d16-da25-8006-8900-d0f6271cd316"  # 해병듀오 마케팅

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

BASE = "C:/Users/반민성/.claude/인스타/해병듀오"


def api(method, endpoint, payload=None):
    body = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(
        f"https://api.notion.com/v1{endpoint}",
        data=body,
        headers=HEADERS,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode("utf-8"), "status": e.code}


# Parse inline formatting: **bold**, `code`, [text](url)
def parse_inline(text, max_len=1900):
    """Convert inline markdown to Notion rich_text array."""
    if not text:
        return []
    # Simple: treat as single text for now, handle bold
    chunks = []
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))', text)
    for p in parts:
        if not p:
            continue
        if p.startswith("**") and p.endswith("**"):
            chunks.append({
                "type": "text",
                "text": {"content": p[2:-2][:max_len]},
                "annotations": {"bold": True},
            })
        elif p.startswith("`") and p.endswith("`"):
            chunks.append({
                "type": "text",
                "text": {"content": p[1:-1][:max_len]},
                "annotations": {"code": True},
            })
        elif p.startswith("[") and "](" in p:
            m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', p)
            if m:
                chunks.append({
                    "type": "text",
                    "text": {"content": m.group(1)[:max_len], "link": {"url": m.group(2)}},
                })
        else:
            # Chunk long text
            while len(p) > max_len:
                chunks.append({"type": "text", "text": {"content": p[:max_len]}})
                p = p[max_len:]
            if p:
                chunks.append({"type": "text", "text": {"content": p}})
    return chunks


def md_to_blocks(md_text):
    """Convert markdown to Notion blocks."""
    blocks = []
    lines = md_text.split("\n")
    i = 0
    in_code = False
    code_buf = []
    in_table = False
    table_rows = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Code block
        if stripped.startswith("```"):
            if in_code:
                blocks.append({
                    "type": "code",
                    "code": {
                        "rich_text": [{"type": "text", "text": {"content": "\n".join(code_buf)[:1900]}}],
                        "language": "plain text",
                    },
                })
                code_buf = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # Table (skip, convert rows to paragraphs for simplicity)
        if "|" in stripped and stripped.count("|") >= 2:
            cols = [c.strip() for c in stripped.strip("|").split("|")]
            if not in_table:
                in_table = True
                table_rows = []
            # skip separator row with ---
            if not all(re.match(r'^-+$', c.strip() or "-") or c.strip() == "" for c in cols):
                table_rows.append(cols)
            i += 1
            continue
        elif in_table:
            # Flush table as paragraphs (simple)
            for row in table_rows:
                row_text = " | ".join(row)
                if row_text.strip():
                    blocks.append({
                        "type": "paragraph",
                        "paragraph": {"rich_text": parse_inline(row_text)},
                    })
            in_table = False
            table_rows = []

        # Headings
        if stripped.startswith("# "):
            blocks.append({
                "type": "heading_1",
                "heading_1": {"rich_text": parse_inline(stripped[2:])},
            })
        elif stripped.startswith("## "):
            blocks.append({
                "type": "heading_2",
                "heading_2": {"rich_text": parse_inline(stripped[3:])},
            })
        elif stripped.startswith("### "):
            blocks.append({
                "type": "heading_3",
                "heading_3": {"rich_text": parse_inline(stripped[4:])},
            })
        # Divider
        elif stripped == "---":
            blocks.append({"type": "divider", "divider": {}})
        # To-do
        elif stripped.startswith("- [ ] "):
            blocks.append({
                "type": "to_do",
                "to_do": {
                    "rich_text": parse_inline(stripped[6:]),
                    "checked": False,
                },
            })
        elif stripped.startswith("- [x] ") or stripped.startswith("- [X] "):
            blocks.append({
                "type": "to_do",
                "to_do": {
                    "rich_text": parse_inline(stripped[6:]),
                    "checked": True,
                },
            })
        # Bulleted list
        elif stripped.startswith("- ") or stripped.startswith("* "):
            blocks.append({
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": parse_inline(stripped[2:])},
            })
        # Numbered list
        elif re.match(r'^\d+\.\s', stripped):
            content = re.sub(r'^\d+\.\s', '', stripped)
            blocks.append({
                "type": "numbered_list_item",
                "numbered_list_item": {"rich_text": parse_inline(content)},
            })
        # Blockquote
        elif stripped.startswith("> "):
            blocks.append({
                "type": "quote",
                "quote": {"rich_text": parse_inline(stripped[2:])},
            })
        # Empty
        elif stripped == "":
            pass  # skip blank lines
        # Paragraph
        else:
            blocks.append({
                "type": "paragraph",
                "paragraph": {"rich_text": parse_inline(stripped)},
            })

        i += 1

    # flush pending table
    if in_table:
        for row in table_rows:
            row_text = " | ".join(row)
            if row_text.strip():
                blocks.append({
                    "type": "paragraph",
                    "paragraph": {"rich_text": parse_inline(row_text)},
                })

    return blocks


def create_page(parent_id, title, icon_emoji=None):
    props = {"title": {"title": [{"text": {"content": title}}]}}
    payload = {
        "parent": {"page_id": parent_id},
        "properties": props,
    }
    if icon_emoji:
        payload["icon"] = {"type": "emoji", "emoji": icon_emoji}
    return api("POST", "/pages", payload)


def append_blocks(page_id, blocks, batch=90):
    """Append blocks in batches to avoid 100-block limit."""
    total = 0
    for i in range(0, len(blocks), batch):
        chunk = blocks[i : i + batch]
        r = api("PATCH", f"/blocks/{page_id}/children", {"children": chunk})
        if "error" in r:
            return r
        total += len(chunk)
        time.sleep(0.35)
    return {"uploaded": total}


def upload_md(parent_id, file_path, title, icon=None):
    with open(file_path, encoding="utf-8") as f:
        md = f.read()
    blocks = md_to_blocks(md)
    page = create_page(parent_id, title, icon)
    if "error" in page:
        print(f"❌ Page create failed: {title} — {page}")
        return None
    pid = page["id"]
    r = append_blocks(pid, blocks)
    if "error" in r:
        print(f"❌ Blocks failed: {title} — {r}")
        return pid
    print(f"✅ {title}: {r['uploaded']}개 블록")
    return pid


def main():
    # 1. 확장 플랜
    upload_md(
        PARENT_PAGE_ID,
        f"{BASE}/해병듀오_확장플랜.md",
        "🚀 해병듀오 확장 플랜",
        "🚀",
    )
    time.sleep(0.5)

    # 2. 통합 체크리스트
    upload_md(
        PARENT_PAGE_ID,
        f"{BASE}/해병듀오_통합체크리스트.md",
        "📋 마케팅 통합 체크리스트 (31개 세션 기반)",
        "📋",
    )
    time.sleep(0.5)

    # 3. 세션 요약 부모 페이지
    summary_parent = create_page(
        PARENT_PAGE_ID, "📚 마케팅 세션 요약 (31개)", "📚"
    )
    if "error" in summary_parent:
        print("❌ summary parent failed")
        return
    summary_pid = summary_parent["id"]
    print(f"✅ Summary parent created: {summary_pid}")
    time.sleep(0.5)

    # 4. 5개 세션 요약 업로드
    files = [
        ("세션요약_SNS퍼널.md", "4.1 + 4.4 SNS · 퍼널", "📱"),
        ("세션요약_브랜딩.md", "4.2 브랜딩 · 인식", "🎨"),
        ("세션요약_카피스토리.md", "4.3 카피 · 스토리", "✍️"),
        ("세션요약_기본원리1.md", "4.5 기본 · 원리 (전반)", "📖"),
        ("세션요약_기본원리2.md", "4.5 기본 · 원리 (후반)", "📖"),
    ]
    for fname, title, icon in files:
        upload_md(summary_pid, f"{BASE}/{fname}", title, icon)
        time.sleep(0.5)

    print("\n✅ 전체 완료")


if __name__ == "__main__":
    main()
