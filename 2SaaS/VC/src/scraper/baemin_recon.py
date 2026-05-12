"""
배민 사장님사이트 추가 정보 수집 + 상세설정 탐색 (READ-ONLY)

수집 대상:
  - 대시보드 (우리가게 NOW: 조리준수율/별점 등)
  - 통계 (매출/주문/노출/클릭)
  - 광고 (CPC 단가/예산)
  - 리뷰 (평점/건수)
  - 매장 정보 (영업시간/즉시할인 등 설정 페이지 구조)

안전 원칙 (READ-ONLY):
  - page.goto / innerText / screenshot 만 허용
  - fill / click으로 저장/수정 절대 금지
  - 로그인 외 폼 입력 금지

사용법:
  python -m src.scraper.baemin_recon "매장명"
"""

from __future__ import annotations

import os
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


# 방문할 페이지 목록 — 경로 템플릿 + 라벨
PAGES_TO_VISIT = [
    # (경로, 라벨, 페이지 뜬 후 추가 대기(ms))
    ("/shops/{shop_id}/menupan", "00_menupan_and_nowbar", 3000),
    ("/shop/statistics", "01_statistics", 3000),
    ("/shop/statistics/sales", "02_statistics_sales", 3000),
    ("/shop/statistics/exposure", "03_statistics_exposure", 3000),
    ("/ad", "04_ad", 3000),
    ("/ad/naru", "05_ad_naru", 3000),
    ("/ad/openlist", "06_ad_openlist", 3000),
    ("/review", "07_review", 3000),
    ("/shop/info", "08_shop_info", 3000),
    ("/shop/info/operation", "09_shop_operation_hours", 3000),
    ("/shop/discount", "10_discount", 3000),
    ("/shop/promotion/review-event", "11_review_event", 3000),
    ("/menu?tab=option", "12_option_master", 3000),
]


def main() -> int:
    if len(sys.argv) < 2:
        print('사용법: python -m src.scraper.baemin_recon "매장명"')
        return 1

    store_name = sys.argv[1]
    print(f"\n{'='*60}\n  배민 정보 수집 + 상세설정 탐색 (READ-ONLY)\n  매장: {store_name}\n{'='*60}\n")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    recon_dir = OUTPUT_BASE / "recon" / f"{store_name}_{timestamp}"
    recon_dir.mkdir(parents=True, exist_ok=True)
    print(f"[출력 디렉토리] {recon_dir}\n")

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
            print(f"[OK] 기존 세션 로드")
        ctx = browser.new_context(**ctx_kwargs)
        page = ctx.new_page()
        bench.mark("브라우저 시작")

        try:
            login_happened = ensure_login(page, baemin_id, baemin_pw)
            if login_happened:
                save_session(ctx, storage_path)
            bench.mark("로그인/세션 확인")

            # 메뉴판 페이지 통해 샵 id 확보
            page.goto(
                f"{BASE_URL}/shops/menupan",
                wait_until="domcontentloaded",
                timeout=60000,
            )
            page.wait_for_timeout(1500)
            shop_id = select_shop(page, store_name)
            bench.mark(f"샵 확인 (id={shop_id})")

            # 각 페이지 방문 + 덤프
            results: list[dict] = []
            for path_tpl, label, extra_wait in PAGES_TO_VISIT:
                path = path_tpl.format(shop_id=shop_id)
                url = f"{BASE_URL}{path}"
                print(f"\n[방문] {label}: {path}")
                result = {"label": label, "path": path, "url": url}
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(extra_wait)
                    close_popup(page)
                    page.wait_for_timeout(500)

                    # 실제 최종 URL (리디렉션 반영)
                    final_url = page.url
                    result["final_url"] = final_url

                    # innerText 덤프
                    body_text = page.evaluate("document.body.innerText")
                    txt_path = recon_dir / f"{label}.txt"
                    txt_path.write_text(body_text, encoding="utf-8")

                    # 스크린샷 (full page)
                    png_path = recon_dir / f"{label}.png"
                    page.screenshot(path=str(png_path), full_page=True)

                    result["text_chars"] = len(body_text)
                    result["ok"] = True
                    print(f"  [OK] {len(body_text):,}자, final_url={final_url}")
                except Exception as e:
                    result["ok"] = False
                    result["error"] = str(e)[:200]
                    print(f"  [ERROR] {str(e)[:150]}")

                results.append(result)

            bench.mark("페이지 순회")

            # 요약 저장
            import json

            summary_path = recon_dir / "_summary.json"
            summary_path.write_text(
                json.dumps({"shop_id": shop_id, "pages": results}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"\n[DONE] 결과: {recon_dir}")

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
