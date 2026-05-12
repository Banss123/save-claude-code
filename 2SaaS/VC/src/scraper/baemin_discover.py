"""
배민 사장님사이트 페이지 URL 디스커버리 (READ-ONLY)

사이드바 및 페이지 내 a[href]를 수집해서 실제 관리 페이지 URL을 알아냄.
각 URL 방문해서 텍스트 + 스크린샷 저장, 404 여부 기록.

사용법:
  python -m src.scraper.baemin_discover "매장명"
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PWTimeout, sync_playwright
except ImportError:
    print("playwright 설치 필요: uv sync --extra scraper")
    sys.exit(1)

from src.scraper.baemin import (
    BASE_URL,
    Bench,
    SESSIONS_DIR,
    close_popup,
    ensure_login,
    load_account,
    save_session,
    select_shop,
)

OUTPUT_BASE = Path(__file__).resolve().parents[2] / "output"

MANAGEMENT_PATTERNS = [
    "/shops/",
    "/shop/",
    "/menu",
    "/ad",
    "/review",
    "/settlement",
    "/announcement",
    "/order",
    "/promotion",
    "/statistics",
    "/manage",
    "/business",
    "/service",
    "/benefit",
    "/operation",
]


def extract_links(page) -> list[dict]:
    return page.evaluate(
        """
        () => {
            const anchors = document.querySelectorAll('a[href]');
            const seen = new Set();
            return Array.from(anchors)
                .map(a => ({
                    href: a.href,
                    text: (a.innerText || '').trim().substring(0, 80),
                }))
                .filter(x => {
                    if (!x.text) return false;
                    if (seen.has(x.href)) return false;
                    seen.add(x.href);
                    if (!x.href.includes('baemin.com')) return false;
                    // exclude hash-only anchors
                    if (x.href.endsWith('#') || /#[^/]*$/.test(x.href.replace(/^https?:\\/\\/[^/]+/, ''))) return false;
                    return true;
                });
        }
        """
    )


def is_management_url(href: str) -> bool:
    path = href.replace(BASE_URL, "").split("?")[0]
    if path == "" or path == "/":
        return False
    return any(p in path for p in MANAGEMENT_PATTERNS)


def main() -> int:
    if len(sys.argv) < 2:
        print('사용법: python -m src.scraper.baemin_discover "매장명"')
        return 1

    store_name = sys.argv[1]
    print(f"\n{'='*60}\n  배민 URL 디스커버리 (READ-ONLY)\n  매장: {store_name}\n{'='*60}\n")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUTPUT_BASE / "discover" / f"{store_name}_{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    baemin_id, baemin_pw = load_account(store_name)
    bench = Bench()

    with sync_playwright() as pw:
        headless = os.environ.get("HEADLESS", "0") == "1"
        slow_mo = int(os.environ.get("SLOW_MO", "80"))
        browser = pw.chromium.launch(headless=headless, slow_mo=slow_mo)

        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        storage_path = SESSIONS_DIR / f"baemin_{baemin_id}.json"
        ctx_kwargs: dict = {"viewport": {"width": 1440, "height": 900}}
        if storage_path.exists():
            ctx_kwargs["storage_state"] = str(storage_path)
            print("[OK] 기존 세션 로드")
        ctx = browser.new_context(**ctx_kwargs)
        page = ctx.new_page()
        bench.mark("브라우저 시작")

        try:
            login_happened = ensure_login(page, baemin_id, baemin_pw)
            if login_happened:
                save_session(ctx, storage_path)
            bench.mark("로그인/세션 확인")

            page.goto(f"{BASE_URL}/shops/menupan", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)
            shop_id = select_shop(page, store_name)
            page.wait_for_timeout(2000)
            close_popup(page)
            bench.mark("메뉴판 진입")

            # 메뉴판 페이지에서 모든 링크 수집
            links = extract_links(page)
            print(f"\n[수집] 메뉴판 페이지 a[href] 총 {len(links)}개")

            mgmt_links = [link for link in links if is_management_url(link["href"])]
            print(f"[필터] 관리 페이지 패턴 매치: {len(mgmt_links)}개")

            # 전체 링크 저장
            (out_dir / "_all_links.json").write_text(
                json.dumps(links, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            # 각 링크 방문
            results: list[dict] = []
            for i, link in enumerate(mgmt_links, 1):
                label_safe = re.sub(r"[^\w가-힣]+", "_", link["text"])[:30]
                fname = f"{i:02d}_{label_safe}"
                print(f"\n[{i}/{len(mgmt_links)}] {link['text']}")
                print(f"   → {link['href']}")

                result = {
                    "index": i,
                    "text": link["text"],
                    "href": link["href"],
                    "fname": fname,
                }
                try:
                    page.goto(link["href"], wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(2500)
                    close_popup(page)
                    page.wait_for_timeout(500)

                    body_text = page.evaluate("document.body.innerText")
                    not_found = "페이지를 찾을 수 없어요" in body_text[:500]

                    (out_dir / f"{fname}.txt").write_text(body_text, encoding="utf-8")
                    page.screenshot(path=str(out_dir / f"{fname}.png"), full_page=True)

                    result["chars"] = len(body_text)
                    result["not_found"] = not_found
                    result["final_url"] = page.url
                    result["ok"] = True

                    flag = "❌ 404" if not_found else f"✅ {len(body_text)}자"
                    print(f"   {flag} (final_url={page.url})")
                except Exception as e:
                    result["ok"] = False
                    result["error"] = str(e)[:200]
                    print(f"   [ERROR] {str(e)[:100]}")

                results.append(result)

            bench.mark(f"페이지 순회 ({len(mgmt_links)}개)")

            summary = {
                "shop_id": shop_id,
                "total_links": len(links),
                "management_links": len(mgmt_links),
                "results": results,
            }
            (out_dir / "_summary.json").write_text(
                json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            # 콘솔 요약
            print(f"\n{'='*60}\n  유효 페이지\n{'='*60}")
            successful = [r for r in results if r.get("ok") and not r.get("not_found")]
            for r in successful:
                print(f"  ✅ {r['text']:30s}  →  {r.get('final_url')}")
            print(f"\n  총 {len(successful)}/{len(mgmt_links)} 유효\n[DONE] {out_dir}")

        finally:
            try:
                save_session(ctx, storage_path)
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass

    bench.report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
