#!/usr/bin/env python3
"""
Claude Code UserPromptSubmit hook — 노션 대화 라이브러리 비동기 적재.

설계:
  부모(클로드 차일드 프로세스)는 stdin 읽고 자식 detach 후 즉시 exit 0.
  자식(백그라운드)은 큐 flush → 자기 메시지 노션 전송 → 실패 시 큐 저장.
  모든 단계에서 예외는 캐치되어 hook 자체가 죽지 않는다.
"""
import sys, json, urllib.request, datetime, os, subprocess, glob

QUEUE_DIR = os.path.expanduser("~/.claude/hooks/notion-queue")
ERROR_LOG = os.path.expanduser("~/.claude/hooks/notion-error.log")


def load_token():
    path = os.path.expanduser("~/.claude/.secrets.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("notion_token", "")
    except Exception:
        return os.environ.get("NOTION_TOKEN", "")


TOKEN = load_token()
DB_ID = "4c86dd0a-4d34-41b6-a19f-c6b5c037258f"

PROJECTS = [
    ("1구글SEO", "구글SEO"),
    ("2SaaS", "SaaS"),
    ("3콘텐츠", "콘텐츠"),
    ("4HyperFrames", "HyperFrames"),
    ("5세션공부", "세션공부"),
    ("6아카이브", "아카이브"),
    ("7어시스턴트", "어시스턴트"),
    ("8앰비언트사운드", "앰비언트사운드"),
]


def now_iso():
    s = datetime.datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    return s[:-2] + ":" + s[-2:]


def log_error(msg):
    try:
        with open(ERROR_LOG, "a", encoding="utf-8") as f:
            f.write(f"{now_iso()} {msg}\n")
    except Exception:
        pass


def detect_project(cwd):
    for needle, name in PROJECTS:
        if needle in cwd:
            return name
    return "기타"


def detect_type(stripped):
    if any(k in stripped for k in ["?", "어떻게", "뭐야", "뭐가", "알려줘", "뭔지", "설명", "이게", "왜"]):
        return "질문"
    if any(k in stripped for k in ["해줘", "해", "하자", "ㄱㄱ", "진행", "바꿔", "추가", "수정", "만들어", "작성"]):
        return "지시"
    if any(k in stripped for k in ["잘못", "틀렸", "아니야", "다시", "고쳐", "오류", "에러"]):
        return "피드백"
    return "기타"


def detect_source():
    if os.name == "nt":
        return "윈도우"
    elif sys.platform == "darwin":
        return "Mac"
    return "모바일"


def build_payload(prompt, cwd, ts):
    stripped = prompt.strip()
    title = stripped[:30].replace("\n", " ") or "(제목 없음)"
    return {
        "parent": {"type": "database_id", "database_id": DB_ID},
        "properties": {
            "제목": {"title": [{"text": {"content": title}}]},
            "일시": {"date": {"start": ts}},
            "원문": {"rich_text": [{"text": {"content": stripped[:2000]}}]},
            "프로젝트": {"multi_select": [{"name": detect_project(cwd)}]},
            "타입": {"select": {"name": detect_type(stripped)}},
            "소스": {"select": {"name": detect_source()}},
        },
    }


def post_notion(payload):
    req = urllib.request.Request(
        "https://api.notion.com/v1/pages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as _:
        pass


def queue_save(payload):
    try:
        os.makedirs(QUEUE_DIR, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        path = os.path.join(QUEUE_DIR, f"{ts}_{os.getpid()}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    except Exception as e:
        log_error(f"QUEUE_SAVE_FAIL: {e}")


def queue_flush():
    if not os.path.isdir(QUEUE_DIR):
        return
    try:
        paths = sorted(glob.glob(os.path.join(QUEUE_DIR, "*.json")))
    except Exception:
        return
    for path in paths:
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            post_notion(payload)
            os.remove(path)
        except Exception:
            # 한 건 실패하면 멈춤. 다음 hook 호출 때 다시 시도.
            break


def spawn_background(stdin_bytes):
    env = os.environ.copy()
    env["NOTION_HOOK_BG"] = "1"
    kwargs = {
        "stdin": subprocess.PIPE,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "env": env,
        "close_fds": True,
    }
    if os.name == "nt":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        kwargs["creationflags"] = 0x00000008 | 0x00000200 | 0x08000000
    else:
        kwargs["start_new_session"] = True

    p = subprocess.Popen([sys.executable, __file__], **kwargs)
    try:
        p.stdin.write(stdin_bytes)
        p.stdin.close()
    except Exception:
        pass


def parent_main(raw_bytes):
    """부모: 자식 detach 후 즉시 종료. 실패해도 큐로 fallback."""
    try:
        spawn_background(raw_bytes)
        return
    except Exception as e:
        log_error(f"SPAWN_FAIL: {e}")

    # spawn 실패 시 인라인 큐 저장 (메시지 손실 방지)
    try:
        data = json.loads(raw_bytes.decode("utf-8"))
        prompt = data.get("user_prompt") or data.get("prompt", "")
        cwd = data.get("cwd", "")
        if len(prompt.strip()) > 3:
            queue_save(build_payload(prompt, cwd, now_iso()))
    except Exception as e:
        log_error(f"FALLBACK_QUEUE_FAIL: {e}")


def child_main(raw_bytes):
    """자식: 큐 flush → 자기 메시지 전송 → 실패 시 큐 저장."""
    queue_flush()

    try:
        data = json.loads(raw_bytes.decode("utf-8"))
        prompt = data.get("user_prompt") or data.get("prompt", "")
        cwd = data.get("cwd", "")
    except Exception:
        return

    stripped = prompt.strip()
    if len(stripped) <= 3:
        return

    payload = build_payload(prompt, cwd, now_iso())
    try:
        post_notion(payload)
    except Exception as e:
        log_error(f"POST_FAIL: {e} | {stripped[:200]}")
        queue_save(payload)


def main():
    try:
        raw_bytes = sys.stdin.buffer.read()
    except Exception:
        sys.exit(0)

    try:
        if os.environ.get("NOTION_HOOK_BG") == "1":
            child_main(raw_bytes)
        else:
            parent_main(raw_bytes)
    except Exception as e:
        log_error(f"TOP_LEVEL: {e}")

    sys.exit(0)


if __name__ == "__main__":
    main()
