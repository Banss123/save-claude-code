"""
최종 통합: NOW 바 찾기 + 우리가게클릭 상세 + 리뷰 평점
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

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
from src.scraper.baemin_metrics import parse_stat_text, parse_now_bar, parse_ad_detail

OUTPUT_BASE = Path(__file__).resolve().parents[2] / "output"


def main() -> int:
    if len(sys.argv) < 2:
        print('사용법: python -m src.scraper.baemin_final "매장명"')
        return 1

    store_name = sys.argv[1]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUTPUT_BASE / "final" / f"{store_name}_{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}\n  최종 통합 수집: {store_name}\n{'='*60}\n")

    baemin_id, baemin_pw = load_account(store_name)
    bench = Bench()
    result: dict = {"shop": store_name}

    with sync_playwright() as pw:
        headless = os.environ.get("HEADLESS", "0") == "1"
        slow_mo = int(os.environ.get("SLOW_MO", "80"))
        browser = pw.chromium.launch(headless=headless, slow_mo=slow_mo)
        storage_path = SESSIONS_DIR / f"baemin_{baemin_id}.json"
        ctx_kwargs: dict = {"viewport": {"width": 1440, "height": 900}}
        if storage_path.exists():
            ctx_kwargs["storage_state"] = str(storage_path)
        ctx = browser.new_context(**ctx_kwargs)
        page = ctx.new_page()

        try:
            login_happened = ensure_login(page, baemin_id, baemin_pw)
            if login_happened:
                save_session(ctx, storage_path)
            bench.mark("로그인")

            # 메뉴판으로 샵 id 확보
            page.goto(f"{BASE_URL}/shops/menupan", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2000)
            shop_id = select_shop(page, store_name)
            result["shop_id"] = shop_id
            page.wait_for_timeout(3000)
            close_popup(page)
            bench.mark("샵 확인")

            # [1] 홈/대시보드 후보 URL 탐색 (NOW 바)
            home_candidates = [
                "/",
                "/home",
                f"/shops/{shop_id}",
                f"/shops/{shop_id}/home",
                f"/shops/{shop_id}/dashboard",
                f"/shops/{shop_id}/status",
            ]
            for path in home_candidates:
                url = f"{BASE_URL}{path}"
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(3000)
                    close_popup(page)
                    text = page.evaluate("document.body.innerText")
                    if "조리" in text or "조리시간준수율" in text:
                        (out_dir / f"home_found_{path.replace('/', '_')}.txt").write_text(text, encoding="utf-8")
                        page.screenshot(path=str(out_dir / "home.png"), full_page=True)
                        result["home_url_found"] = url
                        result["now_bar"] = parse_now_bar(text)
                        print(f"[NOW 바 발견] {url} → {result['now_bar']}")
                        break
                except Exception:
                    pass
            else:
                print("[WARN] NOW 바 URL 찾기 실패")
            bench.mark("NOW 바 탐색")

            # [2] 리뷰 평점
            page.goto(f"{BASE_URL}/shops/{shop_id}/reviews", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3000)
            close_popup(page)
            review_text = page.evaluate("document.body.innerText")
            (out_dir / "reviews.txt").write_text(review_text, encoding="utf-8")
            rating_match = re.search(r"평균\s*별점\s*\n?\s*([\d.]+)", review_text)
            review_count_match = re.search(r"(?:리뷰|총)\s*([\d,]+)\s*건", review_text)
            review_data = {}
            if rating_match:
                review_data["avg_rating"] = float(rating_match.group(1))
            if review_count_match:
                review_data["review_count"] = int(review_count_match.group(1).replace(",", ""))
            result["reviews"] = review_data
            print(f"[리뷰] {review_data}")
            bench.mark("리뷰")

            # [3] 가게통계 기본
            page.goto(f"{BASE_URL}/shops/{shop_id}/stat", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(4000)
            close_popup(page)
            stat_text = page.evaluate("document.body.innerText")
            (out_dir / "stat.txt").write_text(stat_text, encoding="utf-8")
            result["stat"] = parse_stat_text(stat_text)
            print(f"[통계] order={result['stat'].get('order_amount')}, new={result['stat'].get('new_order_count')}, repeat={result['stat'].get('repeat_order_count')}")
            bench.mark("통계")

            # [4] 우리가게클릭 분석 링크 href 추출해서 직접 이동
            ad_urls = page.evaluate(
                """
                () => {
                    const anchors = Array.from(document.querySelectorAll('a[href]'));
                    return anchors
                        .filter(a => a.innerText.trim() === '분석')
                        .map(a => a.href);
                }
                """
            )
            print(f"[INFO] '분석' 링크 URL {len(ad_urls)}개: {ad_urls[:3]}")
            # 우리가게클릭 전용 분석 URL 추론 (보통 2번째 또는 3번째)
            ugk_parsed: dict | None = None  # impression_count 가 수집된 슬롯을 우선 채택
            for i, ad_url in enumerate(ad_urls[:3]):
                try:
                    page.goto(ad_url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(3500)
                    close_popup(page)
                    text = page.evaluate("document.body.innerText")
                    (out_dir / f"ad_analysis_{i}.txt").write_text(text, encoding="utf-8")
                    page.screenshot(path=str(out_dir / f"ad_analysis_{i}.png"), full_page=True)
                    parsed = parse_ad_detail(text)
                    if parsed:
                        result[f"ad_analysis_{i}"] = {"url": ad_url, **parsed}
                        print(f"  [{i}] {ad_url} → {parsed}")
                        # 우리가게클릭 페이지만 "노출수/클릭수" 포맷을 갖는다.
                        # impression_count 가 수집된 첫 슬롯을 우리가게클릭으로 확정.
                        if parsed.get("impression_count") is not None and ugk_parsed is None:
                            ugk_parsed = parsed
                except Exception as e:
                    print(f"  [{i}] ERROR: {e}")

            # 레버 분석 입력 경로: stat.ugk_detail (solution_builder 가 읽는 필드) +
            # 최상위 stat.impression_count / click_count / ctr_pct (스키마 확장용)
            stat_block = result.setdefault("stat", {})
            if ugk_parsed is not None:
                stat_block["ugk_detail"] = {
                    "impression": ugk_parsed.get("impression_count"),
                    "click": ugk_parsed.get("click_count"),
                    "conversion": ugk_parsed.get("conversion_count"),
                    "ctr_pct": ugk_parsed.get("ctr_pct"),
                    "cvr_pct": ugk_parsed.get("cvr_pct"),
                }
                stat_block["impression_count"] = ugk_parsed.get("impression_count")
                stat_block["click_count"] = ugk_parsed.get("click_count")
                stat_block["ctr_pct"] = ugk_parsed.get("ctr_pct")
            else:
                # 파싱 실패 시 None 고정 — solution_builder 가 폴백 경로로 떨어지도록
                stat_block.setdefault("impression_count", None)
                stat_block.setdefault("click_count", None)
                stat_block.setdefault("ctr_pct", None)
            bench.mark("광고 분석")

            # 저장
            (out_dir / "final.json").write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"\n[DONE] {out_dir}")

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
