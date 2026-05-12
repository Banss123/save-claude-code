"""
배민 가게통계 + NOW 바 + 광고 상세 지표 수집 (READ-ONLY)

수집:
  - NOW 바 (조리준수율/별점/주문접수율 등) — DOM + iframe 스캔
  - 가게통계 (매출/주문/ROAS/채널 비중 등)
  - 우리가게클릭 광고 상세 (분석 링크 진입)

사용법: python -m src.scraper.baemin_metrics "매장명"
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
    print("playwright 설치 필요")
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


def collect_all_frame_texts(page) -> str:
    """모든 프레임의 innerText를 합쳐서 반환 (iframe 포함)"""
    texts = []
    for frame in page.frames:
        try:
            t = frame.evaluate("document.body?.innerText || ''")
            if t and len(t) > 10:
                texts.append(t)
        except Exception:
            pass
    return "\n\n===FRAME===\n\n".join(texts)


def parse_now_bar(text: str) -> dict:
    m = {}
    patterns = {
        "cook_time_min": (r"조리소요시간\s*\n?\s*(\d+)분", int),
        "order_accept_time_sec": (r"주문접수시간\s*\n?\s*(\d+)초", int),
        "recent_repeat_pct": (r"최근재주문율\s*\n?\s*(\d+)%", int),
        "cook_compliance_pct": (r"조리시간준수율\s*\n?\s*(\d+(?:\.\d+)?)%", float),
        "order_accept_pct": (r"주문접수율\s*\n?\s*(\d+(?:\.\d+)?)%", float),
        "recent_rating": (r"최근별점\s*\n?\s*(\d+(?:\.\d+)?)", float),
    }
    for key, (patt, caster) in patterns.items():
        match = re.search(patt, text)
        if match:
            m[key] = caster(match.group(1))
    return m


def parse_stat_text(text: str) -> dict:
    m = {}
    order_amount = re.search(r"주문금액\s*([\d,]+)원\s*(\d+)건", text)
    if order_amount:
        m["order_amount"] = int(order_amount.group(1).replace(",", ""))
        m["order_count"] = int(order_amount.group(2))

    new_order = re.search(r"전체 신규주문\s*(\d+)건", text)
    repeat_order = re.search(r"전체 재주문\s*(\d+)건", text)
    if new_order:
        m["new_order_count"] = int(new_order.group(1))
    if repeat_order:
        m["repeat_order_count"] = int(repeat_order.group(1))

    click_ads = re.search(
        r"우리가게클릭[^원]+?([\d,]+)원[^원]+?([\d,]+)원",
        text,
    )
    if click_ads:
        m["ugk_revenue"] = int(click_ads.group(1).replace(",", ""))
        m["ugk_cost"] = int(click_ads.group(2).replace(",", ""))
        if m["ugk_cost"] > 0:
            m["ugk_roas"] = round(m["ugk_revenue"] / m["ugk_cost"], 2)

    # 광고 채널별 ROAS (즉시할인 / 배민클럽)
    # 패턴: "{채널명} ⏎ (비용 대비 N배 매출 ⏎)? {매출}원 ⏎ {비용}원"
    # 비용이 0원이면 "비용 대비..." 텍스트가 없음 → optional 그룹으로 처리
    for channel in ["즉시할인", "배민클럽"]:
        patt = (
            rf"{re.escape(channel)}\s+"
            rf"(?:비용 대비\s*([\d.]+)배[^\n]*\s+)?"
            rf"([\d,]+)원\s+([\d,]+)원"
        )
        ad_match = re.search(patt, text)
        if ad_match:
            revenue = int(ad_match.group(2).replace(",", ""))
            cost = int(ad_match.group(3).replace(",", ""))
            m[f"{channel}_금액"] = revenue
            m[f"{channel}_비용"] = cost
            if cost > 0:
                m[f"{channel}_roas"] = round(revenue / cost, 2)
            elif ad_match.group(1):
                m[f"{channel}_roas"] = float(ad_match.group(1))

    for channel in ["배민배달", "가게배달", "픽업"]:
        patt = rf"{channel}\s*([\d,]+)원\s*비중\s*(\d+)%\s*(\d+)건"
        match = re.search(patt, text)
        if match:
            m[f"{channel}_금액"] = int(match.group(1).replace(",", ""))
            m[f"{channel}_비중"] = int(match.group(2))
            m[f"{channel}_건수"] = int(match.group(3))

    return m


def parse_ugk_impression_click(text: str) -> dict:
    """우리가게클릭 광고의 노출수·클릭수·CTR 파싱.

    실제 배민 광고 분석 페이지 텍스트 포맷:
        노출수: 18,639회
        클릭수(클릭률 3.2%): 595회
        주문수(전환율 16%): 94회

    누락·포맷 변이 허용 (쉼표/공백 유연). 빈 텍스트는 전부 None.

    Returns:
        dict with keys (모두 Optional):
          - impression_count: int | None
          - click_count: int | None
          - ctr_pct: float | None        (우리가게클릭 기준, 원문 명시값)
          - conversion_count: int | None (주문수)
          - cvr_pct: float | None
    """
    result: dict[str, int | float | None] = {
        "impression_count": None,
        "click_count": None,
        "ctr_pct": None,
        "conversion_count": None,
        "cvr_pct": None,
    }
    if not text or not text.strip():
        return result

    # 노출수: 18,639회 — 콜론/공백 유연, "회" 단위 필수로 요구해서 오매칭 방지
    imp_match = re.search(r"노출수\s*[:\s]\s*([\d,]+)\s*회", text)
    if imp_match:
        try:
            result["impression_count"] = int(imp_match.group(1).replace(",", ""))
        except ValueError:
            pass

    # 클릭수(클릭률 3.2%): 595회  —  괄호 안 %는 CTR, 콜론 뒤 숫자는 click_count
    click_match = re.search(
        r"클릭수\s*\(\s*클릭률\s*([\d.]+)\s*%\s*\)\s*[:\s]\s*([\d,]+)\s*회",
        text,
    )
    if click_match:
        try:
            result["ctr_pct"] = float(click_match.group(1))
        except ValueError:
            pass
        try:
            result["click_count"] = int(click_match.group(2).replace(",", ""))
        except ValueError:
            pass
    else:
        # 폴백: CTR 괄호 없는 변이 포맷
        click_simple = re.search(r"클릭수\s*[:\s]\s*([\d,]+)\s*회", text)
        if click_simple:
            try:
                result["click_count"] = int(click_simple.group(1).replace(",", ""))
            except ValueError:
                pass
        ctr_simple = re.search(r"클릭률\s*([\d.]+)\s*%", text)
        if ctr_simple:
            try:
                result["ctr_pct"] = float(ctr_simple.group(1))
            except ValueError:
                pass

    # 주문수(전환율 16%): 94회
    conv_match = re.search(
        r"주문수\s*\(\s*전환율\s*([\d.]+)\s*%\s*\)\s*[:\s]\s*([\d,]+)\s*회",
        text,
    )
    if conv_match:
        try:
            result["cvr_pct"] = float(conv_match.group(1))
        except ValueError:
            pass
        try:
            result["conversion_count"] = int(conv_match.group(2).replace(",", ""))
        except ValueError:
            pass
    else:
        cvr_simple = re.search(r"(?:CVR|전환율)\s*([\d.]+)\s*%", text)
        if cvr_simple:
            try:
                result["cvr_pct"] = float(cvr_simple.group(1))
            except ValueError:
                pass

    return result


def parse_ad_detail(text: str) -> dict:
    """우리가게클릭 분석 페이지에서 노출/클릭/전환 추출 (레거시 API 유지).

    기존 `impression` / `click` 키(solution_builder 가 의존) + 새 `impression_count` /
    `click_count` / `ctr_pct` / `cvr_pct` 키를 함께 반환해 양쪽 경로를 동시 지원.

    내부적으로 parse_ugk_impression_click 결과를 사용한다.
    """
    ugk = parse_ugk_impression_click(text)
    m: dict = {}
    # 새 스키마 (비-None 만 복사)
    for key in ("impression_count", "click_count", "ctr_pct",
                "conversion_count", "cvr_pct"):
        if ugk.get(key) is not None:
            m[key] = ugk[key]

    # 레거시 키 (solution_builder._try_build_lever_input 가 읽는 이름)
    if ugk["impression_count"] is not None:
        m["impression"] = ugk["impression_count"]
    if ugk["click_count"] is not None:
        m["click"] = ugk["click_count"]
    if ugk["conversion_count"] is not None:
        m["conversion"] = ugk["conversion_count"]

    return m


def main() -> int:
    if len(sys.argv) < 2:
        print('사용법: python -m src.scraper.baemin_metrics "매장명"')
        return 1

    store_name = sys.argv[1]
    print(f"\n{'='*60}\n  배민 핵심 지표 수집 (v2)\n  매장: {store_name}\n{'='*60}\n")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUTPUT_BASE / "metrics" / f"{store_name}_{timestamp}"
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
        ctx = browser.new_context(**ctx_kwargs)
        page = ctx.new_page()
        bench.mark("브라우저 시작")

        all_metrics: dict = {"shop": store_name, "collected_at": timestamp}

        try:
            login_happened = ensure_login(page, baemin_id, baemin_pw)
            if login_happened:
                save_session(ctx, storage_path)
            bench.mark("로그인/세션")

            # 메뉴판 → shop_id
            page.goto(f"{BASE_URL}/shops/menupan", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2000)
            shop_id = select_shop(page, store_name)
            page.wait_for_timeout(5000)  # NOW 바 로드 대기 길게
            close_popup(page)
            page.wait_for_timeout(1000)
            all_metrics["shop_id"] = shop_id

            # 모든 프레임 텍스트 수집
            all_frame_text = collect_all_frame_texts(page)
            (out_dir / "menupan_all_frames.txt").write_text(all_frame_text, encoding="utf-8")

            all_metrics["now_bar"] = parse_now_bar(all_frame_text)
            print(f"[NOW 바] {all_metrics['now_bar']}")
            bench.mark("NOW 바 수집")

            # 통계 페이지
            page.goto(f"{BASE_URL}/shops/{shop_id}/stat", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(4000)
            close_popup(page)
            page.wait_for_timeout(1000)
            stat_text = page.evaluate("document.body.innerText")
            (out_dir / "stat.txt").write_text(stat_text, encoding="utf-8")
            all_metrics["stat"] = parse_stat_text(stat_text)
            print(f"[통계] {all_metrics['stat']}")
            bench.mark("통계")

            # 우리가게클릭 '분석' 링크 탐색 및 클릭 (read-only 이동)
            try:
                # '분석' 텍스트 링크 중 우리가게클릭 근처 것
                # 가장 간단: 우리가게클릭 텍스트 옆 '분석' 클릭
                analysis_links = page.locator("text=분석").all()
                print(f"[INFO] '분석' 링크 {len(analysis_links)}개 발견")
                if analysis_links:
                    # 3번째가 보통 우리가게클릭 (즉시할인/배민클럽/우리가게클릭 순)
                    idx = min(2, len(analysis_links) - 1)
                    target = analysis_links[idx]
                    if target.is_visible(timeout=2000):
                        target.click()
                        page.wait_for_timeout(4000)
                        ad_text = page.evaluate("document.body.innerText")
                        (out_dir / "ad_detail.txt").write_text(ad_text, encoding="utf-8")
                        page.screenshot(path=str(out_dir / "ad_detail.png"), full_page=True)
                        all_metrics["ugk_detail"] = parse_ad_detail(ad_text)
                        print(f"[우리가게클릭 상세] {all_metrics['ugk_detail']}")
            except Exception as e:
                print(f"[WARN] 우리가게클릭 상세 진입 실패: {e}")
            bench.mark("우리가게클릭 상세")

            (out_dir / "metrics.json").write_text(
                json.dumps(all_metrics, ensure_ascii=False, indent=2), encoding="utf-8"
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
