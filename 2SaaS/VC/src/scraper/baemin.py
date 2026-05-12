"""
배민 사장님사이트 메뉴/옵션 스크래퍼 (정확도 우선 버전)

원본: data/담당자/baemin_scraper.py
변경 방침: **정확도 1순위**. 속도 개선은 원본 대비 정확도 손상 없는 것만 적용.

적용 최적화 (정확도 영향 없음):
  1. slow_mo=0 (기본값 50 제거)
  2. storage_state로 세션 재사용 (재로그인 스킵)
  3. 이미지/폰트/미디어 리소스 차단 (텍스트 데이터 무영향)
  4. 단계별 타이밍 벤치마크 출력

원본과 동일하게 유지 (정확도 보존):
  - headless=False 기본값
  - wait_until="domcontentloaded" (XHR 완료 대기)
  - SCROLL_PAUSE=0.25
  - 옵션 마스터 30회 강제 스크롤

추가 정확도 보강:
  - 로그인 성공 명시 검증
  - 메뉴/옵션 수집 0건 시 재시도 1회
  - 메뉴 모달 스크롤: scrollTop 5회 반복 (원본 휠 14회 대비 짧지만 가상 리스트 안전)
  - 동명 메뉴 감지 시 경고

사용법:
  python -m src.scraper.baemin "매장명"
  HEADLESS=1 python -m src.scraper.baemin "매장명"   # 헤드리스 (빠름, 배민 탐지 시 false 대신)
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

try:
    from playwright.sync_api import (
        Browser,
        BrowserContext,
        Page,
        Route,
        TimeoutError as PWTimeout,
        sync_playwright,
    )
except ImportError:
    print("playwright 설치 필요: pip install playwright && playwright install chromium")
    sys.exit(1)


# ─────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────
ACCOUNTS_CSV = Path(__file__).resolve().parents[2] / "data" / "담당자" / "accounts.csv"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "output"
SESSIONS_DIR = (
    Path(os.environ.get("APPDATA", str(Path.home()))) / "valuechain" / "sessions"
)
BASE_URL = "https://self.baemin.com"

# 원본 상수 복원 (정확도 보존)
SCROLL_PAUSE = 0.25
PANEL_PAUSE = 1.5
GOTO_TIMEOUT = 60000

BLOCKED_TYPES = {"image", "font", "media"}
MAX_RETRY = 2


# ─────────────────────────────────────────────
# 타이밍 벤치마크
# ─────────────────────────────────────────────
class Bench:
    def __init__(self) -> None:
        self.t0 = time.perf_counter()
        self.last = self.t0
        self.marks: list[tuple[str, float]] = []

    def mark(self, label: str) -> None:
        now = time.perf_counter()
        delta = now - self.last
        total = now - self.t0
        self.marks.append((label, delta))
        print(f"  [⏱ {delta:6.2f}s | total {total:6.1f}s] {label}")
        self.last = now

    def report(self) -> None:
        total = time.perf_counter() - self.t0
        print(f"\n{'='*50}\n  벤치마크 ({total:.1f}s 총)\n{'='*50}")
        for label, delta in self.marks:
            pct = (delta / total) * 100 if total > 0 else 0
            print(f"  {delta:6.2f}s ({pct:4.1f}%)  {label}")


# ─────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────
def load_account(store_name: str) -> tuple[str, str]:
    if not ACCOUNTS_CSV.exists():
        raise FileNotFoundError(f"accounts.csv 없음: {ACCOUNTS_CSV}")
    with open(ACCOUNTS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["매장명"] == store_name:
                return row["배민_id"], row["배민_pw"]
    raise ValueError(f"accounts.csv에 '{store_name}' 없음")


def parse_price(text: str) -> int:
    m = re.search(r"[\d,]+", text.replace(",", ""))
    return int(m.group()) if m else 0


def _block_resources(route: Route) -> None:
    """이미지/폰트/미디어만 차단. 스타일/스크립트/XHR/fetch는 통과 (데이터 무영향)"""
    if route.request.resource_type in BLOCKED_TYPES:
        route.abort()
    else:
        route.continue_()


# ─────────────────────────────────────────────
# 브라우저 + 세션 재사용
# ─────────────────────────────────────────────
def open_browser(pw, baemin_id: str) -> tuple[Browser, BrowserContext, Page, Path]:
    # 정확도 우선: 기본 headless=False. HEADLESS=1로만 끌 수 있음
    headless = os.environ.get("HEADLESS", "0") == "1"
    # 사람인 척 (봇 탐지 회피). SLOW_MO 환경변수로 조절 (기본 80ms)
    slow_mo = int(os.environ.get("SLOW_MO", "80"))
    browser = pw.chromium.launch(headless=headless, slow_mo=slow_mo)

    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    storage_path = SESSIONS_DIR / f"baemin_{baemin_id}.json"

    ctx_kwargs: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}
    if storage_path.exists():
        ctx_kwargs["storage_state"] = str(storage_path)
        print(f"[OK] 기존 세션 로드: {storage_path.name}")
    ctx = browser.new_context(**ctx_kwargs)
    ctx.route("**/*", _block_resources)

    page = ctx.new_page()
    return browser, ctx, page, storage_path


def save_session(ctx: BrowserContext, storage_path: Path) -> None:
    try:
        ctx.storage_state(path=str(storage_path))
    except Exception as e:
        print(f"[WARN] 세션 저장 실패: {e}")


# ─────────────────────────────────────────────
# 팝업 / 오류 페이지 처리
# ─────────────────────────────────────────────
def close_popup(page: Page) -> None:
    try:
        page.evaluate(
            """
            () => {
              const btns = Array.from(document.querySelectorAll('button'));
              const btn = btns.find(b =>
                b.innerText.includes('오늘 하루 보지 않기') ||
                b.innerText.trim() === '닫기'
              );
              if (btn) btn.click();
            }
            """
        )
        page.wait_for_timeout(500)
    except Exception:
        pass


def recover_error_page(page: Page) -> None:
    try:
        if page.locator("text=그 페이지를 찾을 수 없어요").is_visible(timeout=2000):
            print("[INFO] 오류 페이지 감지 → 홈 이동")
            page.locator("text=홈으로 이동").first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)
    except Exception:
        pass


# ─────────────────────────────────────────────
# 로그인 + 성공 검증
# ─────────────────────────────────────────────
def ensure_login(page: Page, baemin_id: str, baemin_pw: str) -> bool:
    """로그인 수행 여부 반환. 실패 시 RuntimeError.

    2026-04 기준: 배민이 로그인을 biz-member.baemin.com 도메인으로 분리.
    self.baemin.com 진입 시 세션 없으면 biz-member.baemin.com/login으로 리다이렉트됨.
    """
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
    # 리다이렉트 안착 대기 (biz-member.baemin.com로 이동하는 시간)
    page.wait_for_timeout(1500)
    recover_error_page(page)

    current_url = page.url
    is_login_page = (
        "/login" in current_url
        or "biz-member.baemin.com" in current_url
        or "로그인" in (page.title() or "")
    )

    if not is_login_page:
        # 세션 살아있음 — 추가 검증 (샵 드롭다운 노출)
        try:
            page.locator("select").nth(1).wait_for(state="attached", timeout=5000)
            print("[OK] 세션 살아있음 → 로그인 스킵")
            return False
        except PWTimeout:
            print("[WARN] 세션 있으나 샵 셀렉터 미노출 → 재로그인")
            # 새로고침 후 한 번 더 확인
            page.reload(wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
            page.wait_for_timeout(2000)
            if "biz-member.baemin.com" not in page.url and "/login" not in page.url:
                try:
                    page.locator("select").nth(1).wait_for(state="attached", timeout=5000)
                    print("[OK] 재시도 후 세션 확인")
                    return False
                except PWTimeout:
                    pass

    print("[INFO] 로그인 진행 (URL: {})".format(page.url[:80]))

    # ID/PW input 렌더 대기 (biz-member.baemin.com SPA 로딩)
    try:
        page.wait_for_selector('input[name="id"]', state="visible", timeout=20000)
    except PWTimeout:
        # fallback — 다른 속성으로 탐색
        try:
            page.wait_for_selector(
                'input[type="text"], input[placeholder*="아이디"]',
                state="visible",
                timeout=10000,
            )
        except PWTimeout:
            raise RuntimeError(
                f"로그인 input 필드 미노출 — URL={page.url} 배민 로그인 DOM 구조 재확인 필요"
            )

    page.fill('input[name="id"], input[type="text"], input[placeholder*="아이디"]', baemin_id)
    page.fill('input[name="password"], input[type="password"]', baemin_pw)
    # 로그인 버튼 클릭 (submit 또는 버튼 텍스트)
    try:
        page.click('button[type="submit"]', timeout=3000)
    except PWTimeout:
        page.get_by_role("button", name="로그인").first.click()

    # 로그인 후 self.baemin.com으로 복귀 대기
    try:
        page.wait_for_url("**/self.baemin.com/**", timeout=20000)
    except PWTimeout:
        pass
    page.wait_for_load_state("domcontentloaded", timeout=10000)
    page.wait_for_timeout(2000)

    # 로그인 성공 검증: 샵 셀렉터 등장
    try:
        page.locator("select").nth(1).wait_for(state="attached", timeout=20000)
    except PWTimeout:
        if page.locator('input[type="password"]').is_visible(timeout=1000):
            raise RuntimeError("로그인 실패 — 비밀번호 필드 여전히 보임 (ID/PW 오류 가능)")
        raise RuntimeError(f"로그인 후 샵 셀렉터 미노출 — URL={page.url}")

    print("[OK] 로그인 완료")
    return True


# ─────────────────────────────────────────────
# 샵 선택
# ─────────────────────────────────────────────
def _name_similarity(a: str, b: str) -> int:
    """간단 유사도: 공통 문자 수 (공백/특수문자 제외)."""
    clean = lambda s: re.sub(r"[\s\[\]·/()]+", "", s)
    ca, cb = clean(a), clean(b)
    if not ca or not cb:
        return 0
    # 연속 공통 부분 문자열 찾기
    longest = 0
    for i in range(len(ca)):
        for j in range(len(cb)):
            k = 0
            while i + k < len(ca) and j + k < len(cb) and ca[i + k] == cb[j + k]:
                k += 1
            longest = max(longest, k)
    return longest


def select_shop(page: Page, store_name: str) -> str:
    # 팝업이 드롭다운을 가리면 안 됨 — 먼저 닫기
    close_popup(page)
    page.wait_for_timeout(500)

    select = page.locator("select").nth(1)
    select.wait_for(state="visible", timeout=10000)

    # 옵션이 채워질 때까지 대기 (최대 15초)
    for _ in range(30):
        options = select.locator("option").all()
        if len(options) > 1:
            break
        page.wait_for_timeout(500)

    options = select.locator("option").all()
    option_texts = []
    option_values = []
    for opt in options:
        text = (opt.text_content() or "").strip()
        val = opt.get_attribute("value")
        option_texts.append(text)
        option_values.append(val)

    # 1차: 정확 매칭
    for text, val in zip(option_texts, option_values):
        if store_name in text:
            select.select_option(value=val)
            page.wait_for_timeout(1500)
            m = re.search(r"/shops/(\d+)/", page.url)
            shop_id = m.group(1) if m else val
            print(f"[OK] 샵 선택: {text} (id={shop_id})")
            return shop_id

    # 2차: 유사 매칭 (공통 연속 문자 ≥ 50%)
    store_len = len(re.sub(r"[\s\[\]·/()]+", "", store_name))
    best_idx = -1
    best_score = 0
    for i, text in enumerate(option_texts):
        score = _name_similarity(store_name, text)
        if score > best_score and score >= max(4, store_len // 2):
            best_score = score
            best_idx = i
    if best_idx >= 0:
        text = option_texts[best_idx]
        val = option_values[best_idx]
        print(f"[WARN] 정확 매칭 실패 → 유사 매칭: '{store_name}' ≈ '{text}' (공통 {best_score}자)")
        select.select_option(value=val)
        page.wait_for_timeout(1500)
        m = re.search(r"/shops/(\d+)/", page.url)
        shop_id = m.group(1) if m else val
        print(f"[OK] 샵 선택: {text} (id={shop_id})")
        return shop_id

    # 실패 시 디버그
    print("[DEBUG] 드롭다운 실제 옵션 목록:")
    for i, t in enumerate(option_texts):
        print(f"  [{i}] {t!r}")
    raise ValueError(f"드롭다운에서 '{store_name}' 찾지 못함 (옵션 {len(option_texts)}개)")


def select_shop_option_page(page: Page, store_name: str) -> None:
    close_popup(page)
    btn = page.locator("text=가게 전체").first
    try:
        if btn.is_visible(timeout=3000):
            btn.click()
            page.wait_for_timeout(800)
            page.get_by_role("option", name=f"[음식배달] {store_name}").click()
            page.wait_for_timeout(1500)
            page.wait_for_load_state("networkidle", timeout=10000)
            print(f"[OK] 옵션 페이지 샵 선택: {store_name}")
            return
    except Exception:
        pass
    print("[OK] 옵션 페이지 샵 단일 계정 → 그대로 진행")


# ─────────────────────────────────────────────
# 메뉴 목록 파싱 (정확도 우선: networkidle 대기 + 재시도)
# ─────────────────────────────────────────────
def _parse_menus_from_body(body: str) -> list[dict]:
    start = body.find("메뉴판 편집")
    end = body.find("이용가이드")
    if start == -1:
        start = 0
    if end == -1:
        end = len(body)
    content = body[start:end]

    menus: list[dict] = []
    current_group = ""
    badges = {"인기", "사장님 추천", "한그릇 할인"}

    lines = [line.strip() for line in content.split("\n") if line.strip()]
    i = 0
    while i < len(lines):
        line = lines[i]

        if (
            not re.search(r"\d+,\d+원", line)
            and len(line) > 4
            and not any(
                k in line
                for k in ["인기", "사장님 추천", "배달", "픽업", "메뉴판 편집", "OFF", "원산지", "주문안내"]
            )
            and i + 1 < len(lines)
            and (
                re.search(r"\d+,\d+원", lines[i + 1])
                or "인기" in lines[i + 1]
                or "사장님 추천" in lines[i + 1]
                or lines[i + 1].startswith("[")
            )
        ):
            current_group = line
            i += 1
            continue

        if any(b in line for b in badges) or (
            not re.search(r"\d+,\d+원|\d+%", line) and len(line) > 3 and current_group
        ):
            name_line = line
            for badge in badges:
                name_line = name_line.replace(badge, "").strip()
            if not name_line:
                i += 1
                continue

            desc = ""
            composition = ""
            price = 0
            discount_price = None
            j = i + 1
            while j < len(lines) and j < i + 8:
                l2 = lines[j]
                if re.search(r"배달\d*%?\d+,\d+원", l2):
                    nums = re.findall(r"[\d,]+원", l2)
                    if len(nums) >= 2:
                        discount_price = int(nums[0].replace(",", "").replace("원", ""))
                        price = int(nums[1].replace(",", "").replace("원", ""))
                    elif nums:
                        price = int(nums[0].replace(",", "").replace("원", ""))
                    break
                elif re.search(r"배달[\d,]+원", l2):
                    price = parse_price(l2)
                    break
                elif l2 in ["오늘만 품절", "숨김", "노출 기간", "가격 변경"]:
                    break
                elif re.search(r"^\d+인분$|^[A-Za-z0-9]+[Pp]$", l2) or (
                    len(l2) < 10 and re.search(r"[0-9]", l2)
                ):
                    composition = l2
                elif len(l2) > 5 and not re.search(r"\d+,\d+원", l2):
                    desc = l2
                j += 1

            if name_line and price > 0:
                menus.append(
                    {
                        "group_name": current_group,
                        "name": name_line,
                        "price": price,
                        "discount_price": discount_price,
                        "composition": composition,
                        "description": desc,
                        "assigned_options": [],
                    }
                )

        i += 1
    return menus


_DOM_MENU_JS = r"""
() => {
    const UI_NOISE = new Set(['메뉴판 편집', '매장가격 인증', '가게 메뉴판 편집']);
    const out = [];
    const groups = document.querySelectorAll('li.menuGroup-module__menuGroup--TZUT, [class*="menuGroup-module__menuGroup--"]');
    groups.forEach(g => {
        // 그룹 헤더: menuGroup 컨테이너 직계 자식 중 첫 번째 DIV (Typography)
        let groupName = '';
        for (const child of g.children) {
            if (child.tagName === 'DIV') {
                groupName = (child.textContent || '').trim();
                break;
            }
        }
        if (!groupName) groupName = '기타';

        const items = g.querySelectorAll('li.menuItem-module__content--YQDd, [class*="menuItem-module__content--"]');
        items.forEach(it => {
            // 메뉴명
            const nameEl = it.querySelector('.menuInfo-module__name--BtnE, [class*="menuInfo-module__name--"]');
            const name = nameEl ? (nameEl.textContent || '').trim() : '';
            if (!name || UI_NOISE.has(name)) return;

            // 가격: priceListItem 행에서 '배달XX,XXX원' 추출
            let price = 0, discountPrice = null;
            const priceRows = it.querySelectorAll('.priceListItem-module__row--m2Vf, [class*="priceListItem-module__row--"]');
            const prices = [];
            priceRows.forEach(pr => {
                const txt = (pr.textContent || '').trim();
                const m = txt.match(/배달([\d,]+)원/);
                if (m) prices.push(parseInt(m[1].replace(/,/g, ''), 10));
            });
            if (prices.length === 1) price = prices[0];
            else if (prices.length >= 2) {
                discountPrice = prices[0];
                price = prices[1];
            }

            // description: title 컨테이너 다음 ~ priceList 이전 span/div
            let description = '';
            const titleEl = it.querySelector('.menuInfo-module__title--lPMB, [class*="menuInfo-module__title--"]');
            const priceListEl = it.querySelector('.menuInfo-module__priceList--sHZE, [class*="menuInfo-module__priceList--"]');
            if (titleEl) {
                let next = titleEl.nextElementSibling;
                while (next && next !== priceListEl) {
                    const t = (next.textContent || '').trim();
                    if (t && t.length > 0 && t.length < 200 && !t.startsWith('배달')) {
                        description = t;
                        break;
                    }
                    next = next.nextElementSibling;
                }
            }

            out.push({
                group_name: groupName,
                name: name,
                price: price,
                discount_price: discountPrice,
                composition: '',
                description: description,
                assigned_options: [],
            });
        });
    });
    return out;
}
"""


def _scrape_menus_from_dom(page: Page) -> list[dict]:
    """DOM selector 기반 메뉴 + 그룹 추출.
    그룹 헤더가 menuItem 위 형제 DIV로 분리되어 있어 텍스트 휴리스틱 한계 극복.
    selector 확인: tasks/probe_results/menupan_*/anchors.json + main_outerhtml.html
    """
    raw = page.evaluate(_DOM_MENU_JS)
    # price 0인 메뉴 제외 (display 메뉴/숨김 등)
    return [m for m in raw if m.get("price", 0) > 0 and m.get("name")]


def scrape_menus(page: Page, shop_id: str) -> list[dict]:
    """재시도 포함. DOM 우선 → 실패 시 텍스트 파서 fallback."""
    for attempt in range(1, MAX_RETRY + 1):
        page.goto(
            f"{BASE_URL}/shops/{shop_id}/menupan",
            wait_until="domcontentloaded",
            timeout=GOTO_TIMEOUT,
        )
        recover_error_page(page)
        try:
            page.locator("text=메뉴판 편집").first.wait_for(timeout=15000)
        except PWTimeout:
            pass
        page.wait_for_timeout(1500)

        # ── 1순위: DOM 기반 ──
        try:
            menus = _scrape_menus_from_dom(page)
            if menus:
                print(f"[OK] 메뉴 {len(menus)}개 수집 (DOM)")
                return menus
        except Exception as e:
            print(f"[WARN] DOM 파싱 실패 ({e}) — 텍스트 fallback")

        # ── 2순위: 텍스트 파싱 (legacy fallback) ──
        body = page.evaluate("document.body.innerText")
        menus = _parse_menus_from_body(body)
        if menus:
            print(f"[OK] 메뉴 {len(menus)}개 수집 (텍스트 fallback)")
            return menus

        print(f"[WARN] 메뉴 0건 (시도 {attempt}/{MAX_RETRY}) — 재시도")
        page.wait_for_timeout(3000)

    raise RuntimeError("메뉴 수집 실패 — 0건. 매장 상태 또는 DOM 변경 확인 필요")


# ─────────────────────────────────────────────
# 메뉴별 옵션그룹 (정확도 우선: scrollTop 5회 반복 + 동명 메뉴 경고)
# ─────────────────────────────────────────────
# 모달 selector — 챗봇 dialog 제외 (옵션 모달만)
_MODAL_SELECTOR = (
    '[role="dialog"]:not([aria-label="챗봇"]):not([class*="ChatRoom"]), '
    '[class*="Modal"]:not([class*="ChatRoom"])'
)


# ─────────────────────────────────────────────
# 옵션 파서 유틸리티
# ─────────────────────────────────────────────
# 배민 사장님사이트 일부 매장(특히 요식 커스텀 폰트)에서 렌더 후 DOM에
# 한글-Latin 룩얼라이크가 섞여 들어오는 현상 관측.
# 실측 사례(파스타앤포크 안성점): "리뷰 이벤트 선택" → "ZI뷰 OI벤트 선택".
# 'A급', '300g', 'PoP만두' 같은 정상 영문 혼용은 손대지 않아야 하므로
# 한글 블록과 바로 인접한 특정 Latin 토큰만 선택적으로 치환한다.
_LATIN_LOOKALIKE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # ZI + 한글  → 리 + 한글 (예: ZI뷰 → 리뷰)
    (re.compile(r"ZI(?=[가-힣])"), "리"),
    # OI + 한글  → 이 + 한글 (예: OI벤트 → 이벤트)
    (re.compile(r"OI(?=[가-힣])"), "이"),
)


def _normalize_latin_lookalike(text: str) -> str:
    """한글 옆에 달라붙은 Latin 룩얼라이크 토큰을 한글로 교정.

    - 한글 경계 조건을 걸어 '300g', 'A급', 'PoP만두' 등 정상 혼용은 보존.
    - 현재 관측된 깨진 케이스(ZI→리, OI→이)만 좁게 치환.
    - 신규 패턴 발견 시 _LATIN_LOOKALIKE_PATTERNS 에 추가.
    """
    if not text:
        return text
    for pat, repl in _LATIN_LOOKALIKE_PATTERNS:
        text = pat.sub(repl, text)
    return text


def _extract_option_groups(page: Page) -> list[str]:
    """모달에서 옵션 그룹 이름 리스트 (assigned_options용, legacy 시그니처)."""
    text = page.evaluate("document.body.innerText")
    text = _normalize_latin_lookalike(text)
    idx = text.find("\n옵션\n")
    if idx == -1:
        return []
    section = text[idx : idx + 4000]
    groups: list[str] = []
    lines = section.split("\n")
    for k, line in enumerate(lines):
        if line.strip() == "옵션그룹 설정" and k > 0:
            raw = lines[k - 1].strip()
            clean = re.sub(r"\[필수\]\s*최소\s*\d+개(\s*최대\s*\d+개)?$", "", raw).strip()
            clean = re.sub(r"최대\s*\d+개$", "", clean).strip()
            if clean and "변경" not in clean:
                groups.append(clean)
    return groups


def _extract_option_groups_detailed(page: Page) -> list[dict]:
    """모달 텍스트에서 옵션 그룹 상세 dict 리스트 추출.

    옵션 마스터 페이지(매장 분리 안 됨)를 대체. 메뉴 모달은 매장별로 정확.
    """
    text = page.evaluate("document.body.innerText")
    return _parse_option_groups_from_modal_text(text)


def _parse_option_groups_from_modal_text(text: str) -> list[dict]:
    """순수 텍스트 파서 (테스트 용이).

    Returns:
        [{"group_name": str, "condition": str, "items": [{"name": str, "price": int}]}]
    """
    text = _normalize_latin_lookalike(text)
    idx = text.find("\n옵션\n")
    if idx == -1:
        return []
    section = text[idx:]

    # 빈 줄 제거 + strip
    lines = [ln.strip() for ln in section.split("\n") if ln.strip()]

    groups: list[dict] = []
    i = 0
    while i < len(lines):
        if lines[i] == "옵션그룹 설정" and i > 0:
            header = lines[i - 1]
            if "변경" in header:
                i += 1
                continue

            # 그룹명 / 조건 분리: 헤더에 "[필수]..." 또는 "최대 N개" 또는 "최소 N개" 붙음
            cond_match = re.search(r"(\[필수\][^[]*$|최대\s*\d+개$|최소\s*\d+개$)", header)
            if cond_match:
                group_name = header[: cond_match.start()].strip()
                condition = cond_match.group(1).strip()
            else:
                group_name = header
                condition = ""

            if not group_name:
                i += 1
                continue

            # "보기" 마커 위치 찾기 (다음 옵션그룹 마커 전까지)
            j = i + 1
            while j < len(lines) and lines[j] != "보기":
                if lines[j] == "옵션그룹 설정":
                    break
                j += 1
            j += 1  # "보기" 다음 줄부터 아이템 시작

            items: list[dict] = []
            current_name = ""
            while j < len(lines) and lines[j] != "옵션그룹 설정":
                line = lines[j]
                m_price = re.match(r"^배달([\d,]+)원$", line)
                if m_price and current_name:
                    items.append({
                        "name": current_name,
                        "price": int(m_price.group(1).replace(",", "")),
                    })
                    current_name = ""
                elif (
                    re.match(r"^픽업[\d,]+원$", line)
                    or line in {"오늘만 품절", "숨김", "변경"}
                ):
                    pass  # 메타 라인 무시
                else:
                    # 다음 줄이 "배달N원"이면 이건 아이템 이름
                    if j + 1 < len(lines) and re.match(r"^배달[\d,]+원$", lines[j + 1]):
                        current_name = line
                j += 1

            if items:
                groups.append({
                    "group_name": group_name,
                    "condition": condition,
                    "items": items,
                })

            i = j
        else:
            i += 1

    return groups


_TRAILING_NUM_RE = re.compile(r"\s*\d+$")


def _base_group_name(name: str) -> str:
    """옵션그룹명에서 쌍둥이 접미사(공백+숫자)를 제거한 기준명.

    예시:
      '맵기 선택'      → '맵기 선택'
      '맵기 선택2'     → '맵기 선택'
      '세트 파스타선택 2' → '세트 파스타선택'
    """
    if not name:
        return name
    return _TRAILING_NUM_RE.sub("", name).strip()


def _condition_capacity(condition: str) -> int:
    """조건 문자열에서 최대 개수를 뽑아 비교용 용량 스코어로 환산.

    최대값을 찾지 못하면 0 (필수가 아닌 경우가 일반적으로 제약이 더 관대).
    """
    if not condition:
        return 0
    m = re.search(r"최대\s*(\d+)\s*개", condition)
    if m:
        return int(m.group(1))
    return 0


def _items_signature(items: list[dict]) -> set[str]:
    """아이템 이름 집합 (merge 유사도 계산용).

    비교 시 공백·대소문자 차이는 무시 (저장값은 원본 유지). 예: "치킨가라아게3P 추가"
    와 "치킨가라아게3p 추가"를 동일로 판정해 쌍둥이 merge 성사.
    """
    return {
        re.sub(r"\s+", "", (it.get("name") or "").lower())
        for it in items
        if it.get("name")
    }


def _merge_twin_option_groups(
    groups: list[dict],
    *,
    item_overlap_threshold: float = 0.7,
) -> list[dict]:
    """쌍둥이 옵션그룹 병합.

    규칙:
      - base_name(숫자 접미사 제거) 가 같고
      - 아이템 이름 교집합 / min(|A|, |B|) >= threshold
      - 앞에서 본 쪽을 canonical 로 유지, 뒤 쪽은 버림 (items 확장 없음 —
        쌍둥이로 판정된 시점에 원본 집합이 거의 동일하다고 간주).
      - 병합 시 condition 은 최대 허용량이 큰 쪽을 보존 (더 관대한 조건).

    주의:
      - base_name 만 같고 교집합이 낮으면(= 실제로 다른 집합) 별개 유지.
      - no 는 최종 결과 기준으로 재할당.
    """
    canonical: list[dict] = []
    base_index: dict[str, int] = {}

    for og in groups:
        name = og.get("group_name", "")
        if not name:
            continue
        base = _base_group_name(name)
        idx = base_index.get(base)
        if idx is None:
            canonical.append(og)
            base_index[base] = len(canonical) - 1
            continue

        prev = canonical[idx]
        prev_items = _items_signature(prev.get("items", []))
        curr_items = _items_signature(og.get("items", []))
        denom = min(len(prev_items), len(curr_items)) or 0
        inter = len(prev_items & curr_items)
        ratio = (inter / denom) if denom else 0.0

        if ratio >= item_overlap_threshold:
            # 쌍둥이 확정 → condition 만 더 관대한 쪽으로 승격
            if _condition_capacity(og.get("condition", "")) > _condition_capacity(
                prev.get("condition", "")
            ):
                prev["condition"] = og.get("condition", "")
            # 캐노니컬 이름은 더 짧은 base 형태를 선호 (깔끔)
            if len(name) < len(prev.get("group_name", "")):
                prev["group_name"] = name
        else:
            # 동일 base 지만 아이템 교집합 낮음 → 별개 옵션그룹으로 유지
            canonical.append(og)

    # no 재할당
    for i, og in enumerate(canonical, start=1):
        og["no"] = i
    return canonical


def build_options_from_menus(menus: list[dict]) -> list[dict]:
    """메뉴별 option_groups_detailed → unique 옵션 그룹 list (no 재할당).

    옵션 마스터 페이지 호출 대체. 매장별 정확.
    추가 보강:
      - Latin 룩얼라이크 정규화 (그룹명/아이템명 모두)
      - 쌍둥이 옵션그룹 merge (공백+숫자 접미사 + 아이템 교집합 기준)
    """
    seen: set[str] = set()
    collected: list[dict] = []
    for m in menus:
        for og in (m.get("option_groups_detailed") or []):
            name = _normalize_latin_lookalike(og.get("group_name", ""))
            if not name or name in seen:
                continue
            seen.add(name)
            items_norm = [
                {
                    "name": _normalize_latin_lookalike(it.get("name", "")),
                    "price": it.get("price", 0),
                }
                for it in og.get("items", [])
            ]
            collected.append({
                "no": 0,  # merge 후 재할당
                "group_name": name,
                "condition": og.get("condition", ""),
                "items": items_norm,
            })

    return _merge_twin_option_groups(collected)


def _scroll_modal_safely(page: Page) -> None:
    """모달 내부를 8회 반복 스크롤 (가상 리스트 전체 렌더 유도).
    챗봇 dialog 제외."""
    page.evaluate(
        f"""
        async () => {{
          const m = document.querySelector('{_MODAL_SELECTOR}');
          if (!m) return;
          for (let i = 0; i < 8; i++) {{
            m.scrollTop = m.scrollHeight;
            await new Promise(r => setTimeout(r, 250));
          }}
          m.scrollTop = 0;
        }}
        """
    )


def scrape_menu_options(page: Page, menus: list[dict]) -> None:
    """메뉴 클릭 → 옵션 모달 → 그룹명(assigned_options) + 상세(option_groups_detailed) 둘 다 추출."""
    close_popup(page)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)

    modal_locator = page.locator(_MODAL_SELECTOR).first

    for menu in menus:
        name = menu["name"]
        try:
            count = page.locator(f"text={name}").count()
            if count > 1:
                print(f"  [WARN] '{name}' 동명 요소 {count}개 — 첫 번째만 클릭")

            page.locator(f"text={name}").first.click(force=True)
            try:
                modal_locator.wait_for(state="visible", timeout=int(PANEL_PAUSE * 2000))
            except PWTimeout:
                page.wait_for_timeout(int(PANEL_PAUSE * 1000))

            _scroll_modal_safely(page)

            # 그룹명 (assigned_options) + 상세 (option_groups_detailed) 둘 다 추출
            groups = _extract_option_groups(page)
            detailed = _extract_option_groups_detailed(page)

            # 빈 결과 1회 재시도: 모달이 아직 열려있다면 scrollTop 0 → 재스크롤 → 재추출.
            # 가상 리스트가 첫 스크롤에서 렌더 지연된 케이스 회복.
            if not groups and not detailed:
                try:
                    page.evaluate(
                        f"""
                        () => {{
                          const m = document.querySelector('{_MODAL_SELECTOR}');
                          if (m) m.scrollTop = 0;
                        }}
                        """
                    )
                    page.wait_for_timeout(300)
                    _scroll_modal_safely(page)
                    groups = _extract_option_groups(page)
                    detailed = _extract_option_groups_detailed(page)
                    if groups or detailed:
                        print(f"  └ [RETRY-OK] {name[:30]}: 재시도로 옵션 회복")
                except Exception:
                    pass

            menu["assigned_options"] = groups
            menu["option_groups_detailed"] = detailed

            page.keyboard.press("Escape")
            try:
                modal_locator.wait_for(state="hidden", timeout=3000)
            except PWTimeout:
                page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(200)

            status = f"{len(groups)}개" if groups else "없음"
            print(f"  └ {name[:30]}: 옵션 {status}")

        except Exception as e:
            print(f"  └ [ERROR] {name}: {e}")
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            page.wait_for_timeout(400)


# ─────────────────────────────────────────────
# 옵션 마스터 (원본 30회 강제 스크롤 유지)
# ─────────────────────────────────────────────
def _parse_option_master_from_text(merged: str) -> list[dict]:
    options: list[dict] = []
    no = 0
    lines = merged.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        cond_match = re.match(r"^(\[필수\].+|최대\s*\d+개)$", line)
        if cond_match and i > 0:
            group_name = lines[i - 1].strip()
            condition = line.strip()
            if i + 1 < len(lines) and lines[i + 1].strip() == "변경":
                no += 1
                items: list[dict] = []
                j = i + 2
                while j < len(lines):
                    if (
                        re.match(r"^(\[필수\].+|최대\s*\d+개)$", lines[j])
                        and j + 1 < len(lines)
                        and lines[j + 1].strip() == "변경"
                    ):
                        break
                    item_price_m = re.match(r"^배달([\d,]+)원$", lines[j])
                    if item_price_m and j > 0:
                        item_name = lines[j - 1].strip()
                        if (
                            item_name
                            and "이 옵션을 사용하는 메뉴" not in item_name
                            and item_name not in {"변경", "보기", "픽업"}
                            and not re.match(r"^\[음식배달\]", item_name)
                        ):
                            price_val = int(item_price_m.group(1).replace(",", ""))
                            items.append({"name": item_name, "price": price_val})
                    j += 1

                if group_name and items:
                    options.append(
                        {
                            "no": no,
                            "group_name": group_name,
                            "condition": condition,
                            "items": items,
                        }
                    )
                    print(f"  └ 옵션그룹 {no}: {group_name} ({len(items)}개)")
        i += 1
    return options


def scrape_option_master(page: Page, store_name: str) -> list[dict]:
    """재시도 포함. 0건이면 재시도 1회."""
    for attempt in range(1, MAX_RETRY + 1):
        page.goto(
            f"{BASE_URL}/menu?tab=option",
            wait_until="domcontentloaded",
            timeout=GOTO_TIMEOUT,
        )
        recover_error_page(page)
        page.wait_for_timeout(1000)  # 원본 유지

        select_shop_option_page(page, store_name)

        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(600)  # 원본 유지

        # 30회 스크롤로 모든 옵션그룹 렌더 유도 (옵션 마스터는 가상 렌더링 아님)
        # 기존 line-level seen dedupe는 "변경", "보기" 같은 구조 텍스트도
        # 중복 제거 → 두 번째 이후 옵션그룹의 "변경" 마커 누락 → 파싱 실패.
        # 해결: 매번 innerText 청크를 그대로 누적 + 파싱 후 group_name으로 dedupe.
        text_chunks: list[str] = []
        for _ in range(30):
            text_chunks.append(page.evaluate("document.body.innerText"))

            scroll_y = page.evaluate("window.scrollY")
            max_scroll = page.evaluate("document.body.scrollHeight - window.innerHeight")
            if scroll_y >= max_scroll - 20:
                break
            page.evaluate("window.scrollBy(0, 400)")
            page.wait_for_timeout(int(SCROLL_PAUSE * 1000) + 150)

        merged = "\n".join(text_chunks)
        raw_options = _parse_option_master_from_text(merged)

        # group_name 기준 dedupe (no 재할당)
        seen_groups: set[str] = set()
        options: list[dict] = []
        for opt in raw_options:
            if opt["group_name"] not in seen_groups:
                seen_groups.add(opt["group_name"])
                opt["no"] = len(options) + 1
                options.append(opt)

        if options:
            print(f"[OK] 옵션그룹 {len(options)}개 수집 (raw {len(raw_options)} → unique {len(options)})")
            return options

        print(f"[WARN] 옵션 0건 (시도 {attempt}/{MAX_RETRY}) — 재시도")
        page.wait_for_timeout(3000)

    # 옵션 0건은 경고로만 두고 빈 리스트 반환 (일부 매장은 실제로 옵션 없음)
    print("[WARN] 옵션 마스터 0건 — 매장에 옵션이 없거나 DOM 변경 가능")
    return []


# ─────────────────────────────────────────────
# 매장 메타데이터: 개업일/입점일 추출 (PoC)
# ─────────────────────────────────────────────
# 우선순위 순서 — 인덱스 작을수록 우선
_OPENING_DATE_KEYWORDS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (1, ("개업일", "오픈일")),
    (2, ("입점일", "배민 가입일", "배민가입일")),
    (3, ("등록일", "계정 생성일", "계정생성일")),
    (4, ("운영 시작일", "운영시작일")),
)

# 날짜 포맷 후보 — raw 문자열을 (year, month, day) 튜플로 파싱
# day 캡처가 없으면(월만 있는 케이스) group('day')가 None이 되고 1일로 보정됨
_DATE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    re.compile(r"(?P<year>\d{4})[./-](?P<month>\d{1,2})[./-](?P<day>\d{1,2})"),
    # YYYY년 M월 D일
    re.compile(r"(?P<year>\d{4})\s*년\s*(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일"),
    # YYYY년 M월 (일 없음)
    re.compile(r"(?P<year>\d{4})\s*년\s*(?P<month>\d{1,2})\s*월(?!\s*\d)"),
)

# 상대 표현: "개업한 지 1년 2개월 전", "오픈한지 3개월 전" 등
_RELATIVE_RE = re.compile(
    r"(?:개업|오픈|입점)(?:한\s*지|한지|\s*후)?\s*"
    r"(?:(?P<years>\d+)\s*년)?\s*"
    r"(?:(?P<months>\d+)\s*개월)?\s*"
    r"전"
)


def _safe_build_date(year: int, month: int, day: int) -> str | None:
    """(년, 월, 일) → ISO YYYY-MM-DD. 실패 시 None."""
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _find_first_date_after(text: str, start: int, window: int = 60) -> tuple[str, str] | None:
    """text[start:start+window] 구간에서 첫 번째 날짜 포맷 매칭.

    Returns:
        (raw_matched_string, iso_date) 또는 None.
    """
    segment = text[start : start + window]
    for pat in _DATE_PATTERNS:
        m = pat.search(segment)
        if not m:
            continue
        try:
            year = int(m.group("year"))
            month = int(m.group("month"))
        except (IndexError, ValueError):
            continue
        # day 그룹이 패턴에 없으면 IndexError → 1일 기본값
        try:
            day_raw = m.group("day") if "day" in m.groupdict() else None
        except IndexError:
            day_raw = None
        day = int(day_raw) if day_raw else 1
        iso = _safe_build_date(year, month, day)
        if iso:
            return (m.group(0), iso)
    return None


def _parse_relative_expression(text: str, today: date | None = None) -> tuple[str, str] | None:
    """'개업한 지 N년 M개월 전' → today 기준 역산.

    단순 근사: 1년 = 365일, 1개월 = 30일. 정확한 달력 연산은 과도하므로 PoC 수준에서 근사.
    """
    m = _RELATIVE_RE.search(text)
    if not m:
        return None
    years_s = m.group("years")
    months_s = m.group("months")
    if not years_s and not months_s:
        return None
    years = int(years_s) if years_s else 0
    months = int(months_s) if months_s else 0
    if years == 0 and months == 0:
        return None
    days_back = years * 365 + months * 30
    base = today or date.today()
    try:
        target = base - timedelta(days=days_back)
    except OverflowError:
        return None
    return (m.group(0), target.isoformat())


def _parse_opening_date_from_text(text: str, *, today: date | None = None) -> dict | None:
    """사장님사이트 매장정보/계정 페이지 텍스트에서 개업일/입점일 추출.

    정규식으로 다음 키워드+날짜 조합 탐색 (우선순위):
      1. "개업일", "오픈일"
      2. "입점일", "배민 가입일"
      3. "등록일", "계정 생성일"
      4. "운영 시작일"

    날짜 포맷:
      - YYYY.MM.DD / YYYY-MM-DD / YYYY/MM/DD
      - YYYY년 M월 D일
      - YYYY년 M월 (일 생략 → 1일 기본값)
      - "개업한 지 N개월/N년 전" 상대 표현 → today 기준 역산

    매칭 여러 개면 우선순위 1순위 필드 반환.

    Returns:
        {"iso": "YYYY-MM-DD", "raw": 원본 문자열, "keyword": 매칭된 키워드, "priority": int}
        또는 None.

    주의:
      - 이 함수는 dict를 반환하지만, scrape_shop_info에서 풀어서 사용함.
      - 내부적으로 편의 반환이지만 요구스펙 상 "str | None" 인터페이스를 만족시키려면
        상위 호출자가 iso만 꺼내면 됨.
    """
    if not text:
        return None

    best: dict | None = None
    # 유니코드 전각 공백 정규화 (배민 사이트에서 간헐 관측)
    # 키워드/날짜 사이 공백 변이 허용 범위를 넓히되, 키워드 자체의 공백은
    # 명시적 regex로 처리.
    normalized = text.replace("\u3000", " ")  # 전각 공백 → 일반 공백

    for priority, keywords in _OPENING_DATE_KEYWORDS:
        for kw in keywords:
            # 키워드 내부 공백 허용 (예: "개 업 일") — 문자 사이에 \s* 삽입
            kw_pat = r"\s*".join(re.escape(c) for c in kw)
            for m_kw in re.finditer(kw_pat, normalized):
                # 키워드 끝 바로 뒤 60자 이내에서 날짜 탐색
                date_hit = _find_first_date_after(normalized, m_kw.end(), window=60)
                if date_hit:
                    raw, iso = date_hit
                    candidate = {
                        "iso": iso,
                        "raw": raw,
                        "keyword": kw,
                        "priority": priority,
                    }
                    if best is None or candidate["priority"] < best["priority"]:
                        best = candidate
                    break  # 같은 키워드 내 첫 매칭만 사용
            if best and best["priority"] == priority:
                # 이미 현 우선순위 성공 → 같은 우선순위 다른 키워드 탐색 불필요
                break
        if best and best["priority"] == priority:
            # 현 우선순위 성공 → 더 낮은 우선순위 확인 불필요
            break

    if best:
        return best

    # 마지막 fallback: 상대 표현
    rel = _parse_relative_expression(normalized, today=today)
    if rel:
        raw, iso = rel
        return {"iso": iso, "raw": raw, "keyword": "_relative_", "priority": 5}

    return None


def scrape_shop_info(page: "Page", shop_id: str) -> dict:
    """매장 info/account/settings 페이지에서 메타데이터 수집 (PoC).

    방문 순서 (첫 성공에서 stop):
      1. /shops/{shop_id}/info
      2. /shops/{shop_id}/account
      3. /shops/{shop_id}/settings

    Returns:
        {
            "opening_date": str | None,         # ISO "YYYY-MM-DD" 또는 None
            "opening_date_raw": str | None,     # 원본 문자열 (디버깅)
            "opening_date_source": str | None,  # 방문 성공한 경로
            "visited_paths": list[str],         # 시도한 경로들
            "error": str | None,                # 실패 시 에러 메시지
        }

    주의:
      - 각 URL 방문 실패(404/타임아웃)는 조용히 다음 경로로 이동.
      - 전체 실패해도 예외 던지지 않고 error 필드에 기록 (파이프라인 영향 0).
    """
    paths = [
        f"{BASE_URL}/shops/{shop_id}/info",
        f"{BASE_URL}/shops/{shop_id}/account",
        f"{BASE_URL}/shops/{shop_id}/settings",
    ]
    result: dict = {
        "opening_date": None,
        "opening_date_raw": None,
        "opening_date_source": None,
        "visited_paths": [],
        "error": None,
    }

    last_error: str | None = None
    for url in paths:
        result["visited_paths"].append(url)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
            page.wait_for_timeout(1200)
            try:
                recover_error_page(page)
            except Exception:
                pass

            body_text = page.evaluate("document.body.innerText") or ""
            hit = _parse_opening_date_from_text(body_text)
            if hit:
                result["opening_date"] = hit["iso"]
                result["opening_date_raw"] = hit["raw"]
                result["opening_date_source"] = url
                print(f"[INFO] shop info scraping: {url} ... 성공 ({hit['raw']} → {hit['iso']})")
                return result
            print(f"[INFO] shop info scraping: {url} ... 키워드 없음")
        except Exception as e:
            last_error = f"{url}: {type(e).__name__}: {e}"
            print(f"[INFO] shop info scraping: {url} ... 실패 ({last_error})")
            continue

    if last_error:
        result["error"] = last_error
    return result


# ─────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────
def main() -> int:
    if len(sys.argv) < 2:
        print('사용법: python -m src.scraper.baemin "매장명"')
        return 1

    store_name = sys.argv[1]
    print(f"\n{'='*50}\n  배민 스크래퍼 (정확도 우선) 시작: {store_name}\n{'='*50}\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    baemin_id, baemin_pw = load_account(store_name)
    bench = Bench()

    with sync_playwright() as pw:
        browser, ctx, page, storage_path = open_browser(pw, baemin_id)
        bench.mark("브라우저 시작")

        try:
            login_happened = ensure_login(page, baemin_id, baemin_pw)
            if login_happened:
                save_session(ctx, storage_path)
                print(f"[OK] 세션 저장: {storage_path.name}")
            bench.mark("로그인/세션 확인")

            print("\n[Step 2] 메뉴판 접속 + 샵 선택")
            page.goto(
                f"{BASE_URL}/shops/menupan",
                wait_until="domcontentloaded",
                timeout=GOTO_TIMEOUT,
            )
            page.wait_for_timeout(1000)
            shop_id = select_shop(page, store_name)
            bench.mark("샵 선택")

            print("\n[Step 3] 메뉴 목록 수집")
            menus = scrape_menus(page, shop_id)
            bench.mark(f"메뉴 수집 ({len(menus)}건)")

            print("\n[Step 4] 메뉴별 옵션그룹 수집 (그룹명 + 상세)")
            page.goto(
                f"{BASE_URL}/shops/{shop_id}/menupan",
                wait_until="domcontentloaded",
                timeout=GOTO_TIMEOUT,
            )
            page.wait_for_timeout(1000)
            scrape_menu_options(page, menus)
            bench.mark("메뉴별 옵션 수집")

            # 옵션 마스터 페이지는 매장 분리 못 함 → 모달 데이터에서 unique 옵션 그룹 빌드
            options = build_options_from_menus(menus)
            print(f"[OK] 옵션 그룹 (모달 통합) {len(options)}개 / 원본 모달 {sum(len(m.get('option_groups_detailed') or []) for m in menus)}그룹")
            bench.mark(f"옵션 그룹 빌드 ({len(options)}그룹)")

            # 최종 검증
            if not menus:
                raise RuntimeError("메뉴 0건 — 수집 실패")

            # raw JSON: option_groups_detailed는 options에 이미 통합되어 있으므로 menus에서 제거
            menus_clean = [
                {k: v for k, v in m.items() if k != "option_groups_detailed"}
                for m in menus
            ]

            # ── shop_info (PoC): 개업일/입점일 — 실패해도 파이프라인 무영향 ──
            shop_info: dict | None = None
            try:
                shop_info = scrape_shop_info(page, shop_id)
                bench.mark("매장 메타데이터 (shop_info)")
            except Exception as e:
                print(f"[WARN] shop_info 수집 실패 — 스킵: {e}")
                shop_info = None

            data = {
                "shop": store_name,
                "shop_id": shop_id,
                "menus": menus_clean,
                "options": options,
                "shop_info": shop_info,
            }
            json_path = OUTPUT_DIR / f"{store_name}_현안.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"\n[OK] JSON 저장: {json_path}")
            bench.mark("JSON 저장")

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
