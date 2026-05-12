"""
baemin_scraper.py
사용법: python baemin_scraper.py "매장명"
예:    python baemin_scraper.py "동양카츠 창원본점"

동작:
  1. accounts.csv에서 배민 ID/PW 로드
  2. Chrome에 연결 (CDP) → 로그인 → 샵 선택
  3. 메뉴판(/shops/menupan)에서 메뉴 전체 파싱
  4. 메뉴별 옵션그룹 순서 수집 (패널 열기 → 휠 스크롤 → 텍스트 파싱)
  5. 옵션 마스터(/menu?tab=option)에서 전체 옵션 파싱
  6. JSON 저장 → json_to_xlsx.py 실행
"""

import sys
import csv
import json
import time
import re
import subprocess
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("playwright 설치 필요: pip install playwright && playwright install chromium")
    sys.exit(1)

# ─────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────
ACCOUNTS_CSV  = Path(__file__).parent / "accounts.csv"
OUTPUT_DIR    = Path(__file__).parent / "output"
BASE_URL      = "https://self.baemin.com"
SCROLL_PAUSE  = 0.25          # 스크롤 후 대기(초)
PANEL_PAUSE   = 1.5           # 패널 열린 후 대기(초)


# ─────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────
def load_account(store_name: str) -> tuple[str, str]:
    with open(ACCOUNTS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["매장명"] == store_name:
                return row["배민_id"], row["배민_pw"]
    raise ValueError(f"accounts.csv에 '{store_name}' 없음")


def parse_price(text: str) -> int:
    """'14,000원' → 14000"""
    m = re.search(r"[\d,]+", text.replace(",", ""))
    return int(m.group()) if m else 0


# ─────────────────────────────────────────────
# 브라우저 연결
# ─────────────────────────────────────────────
def connect_browser(pw):
    """Playwright Chromium 직접 실행."""
    browser = pw.chromium.launch(headless=False, slow_mo=50)
    ctx = browser.new_context(
        viewport={"width": 1280, "height": 900},
    )
    page = ctx.new_page()
    print("[OK] 새 Chromium 브라우저 시작")
    return browser, ctx, page


# ─────────────────────────────────────────────
# 팝업 닫기
# ─────────────────────────────────────────────
def close_popup(page):
    """도어스티커 등 팝업 닫기 (JS로 backdrop 우회)"""
    try:
        page.evaluate("""
            () => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b =>
                    b.innerText.includes('오늘 하루 보지 않기') ||
                    b.innerText.trim() === '닫기'
                );
                if (btn) btn.click();
            }
        """)
        page.wait_for_timeout(500)
    except Exception:
        pass


def recover_error_page(page):
    """'그 페이지를 찾을 수 없어요' 오류 페이지 → 홈으로 이동"""
    try:
        if page.locator("text=그 페이지를 찾을 수 없어요").is_visible(timeout=2000):
            print("[INFO] 오류 페이지 감지 → 홈으로 이동")
            page.locator("text=홈으로 이동").first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)
    except Exception:
        pass


# ─────────────────────────────────────────────
# 로그인
# ─────────────────────────────────────────────
def ensure_login(page, baemin_id: str, baemin_pw: str):
    page.goto(BASE_URL, wait_until="networkidle")
    recover_error_page(page)
    if "/login" in page.url or "로그인" in page.title():
        print("[INFO] 로그인 필요 → 진행")
        page.fill('input[type="text"], input[name*="id"]', baemin_id)
        page.fill('input[type="password"]', baemin_pw)
        page.click('button[type="submit"]')
        page.wait_for_url(f"{BASE_URL}/**", timeout=15000)
        time.sleep(3)
        print("[OK] 로그인 완료")
    else:
        print("[OK] 이미 로그인됨")


# ─────────────────────────────────────────────
# 샵 선택 (select.nth(1) 패턴 - menupan / menu 공통)
# ─────────────────────────────────────────────
def select_shop(page, store_name: str) -> str:
    """
    [음식배달] 드롭다운(select.nth(1))에서 매장명으로 선택.
    선택된 샵 ID를 반환.
    """
    select = page.locator("select").nth(1)
    options = select.locator("option").all()
    for opt in options:
        text = opt.text_content() or ""
        if store_name in text:
            value = opt.get_attribute("value")
            select.select_option(value=value)
            page.wait_for_timeout(1500)
            # URL에서 shop_id 추출
            m = re.search(r"/shops/(\d+)/", page.url)
            shop_id = m.group(1) if m else value
            print(f"[OK] 샵 선택: {text.strip()} (id={shop_id})")
            return shop_id
    raise ValueError(f"드롭다운에서 '{store_name}' 찾지 못함")


def select_shop_option_page(page, store_name: str):
    """
    /menu?tab=option 의 '가게 전체' 버튼 → dialog → get_by_role("option") 클릭
    없으면 샵 하나뿐인 계정이므로 그냥 진행
    """
    close_popup(page)
    btn = page.locator("text=가게 전체").first
    if btn.is_visible(timeout=3000):
        btn.click()
        page.wait_for_timeout(800)
        page.get_by_role("option", name=f"[음식배달] {store_name}").click()
        page.wait_for_timeout(1500)
        print(f"[OK] 옵션 페이지 샵 선택: {store_name}")
    else:
        print(f"[OK] 옵션 페이지 샵 단일 계정 → 그대로 진행")


# ─────────────────────────────────────────────
# Step 3: 메뉴 목록 파싱
# ─────────────────────────────────────────────
def scrape_menus(page, shop_id: str) -> list[dict]:
    page.goto(f"{BASE_URL}/shops/{shop_id}/menupan", wait_until="networkidle")
    recover_error_page(page)
    page.wait_for_timeout(1000)

    body = page.evaluate("document.body.innerText")

    # body에서 메뉴 섹션만 추출 (사이드바 이후부터)
    # 기준: '메뉴판 편집' 이후 ~ '이용가이드' 이전
    start = body.find("메뉴판 편집")
    end   = body.find("이용가이드")
    if start == -1: start = 0
    if end   == -1: end = len(body)
    content = body[start:end]

    menus = []
    current_group = ""

    lines = [l.strip() for l in content.split("\n") if l.strip()]
    i = 0
    while i < len(lines):
        line = lines[i]

        # 그룹명 감지: 가격 없고, 짧고, 다음 줄이 '인기'/'사장님 추천' or 메뉴명 패턴
        if (
            not re.search(r"\d+,\d+원", line)
            and len(line) > 4
            and not any(k in line for k in ["인기", "사장님 추천", "배달", "픽업", "메뉴판 편집", "OFF", "원산지", "주문안내"])
            and i + 1 < len(lines)
            and (re.search(r"\d+,\d+원", lines[i+1]) or "인기" in lines[i+1] or "사장님 추천" in lines[i+1] or lines[i+1].startswith("["))
        ):
            current_group = line
            i += 1
            continue

        # 메뉴명 감지: 가격 있는 블록의 첫 번째 텍스트 줄
        # 메뉴 블록: [뱃지들...] 메뉴명 / 설명 / 구성 / 배달N원 / 픽업N원
        badges = {"인기", "사장님 추천", "한그릇 할인"}
        if any(b in line for b in badges) or (
            not re.search(r"\d+,\d+원|\d+%", line)
            and len(line) > 3
            and current_group
        ):
            # 배지 스킵
            name_line = line
            for badge in badges:
                name_line = name_line.replace(badge, "").strip()
            if not name_line:
                i += 1
                continue

            # 이후 줄에서 설명/구성/가격 수집
            desc = ""
            composition = ""
            price = 0
            discount_price = None
            j = i + 1
            while j < len(lines) and j < i + 8:
                l2 = lines[j]
                if re.search(r"배달\d*%?\d+,\d+원", l2):
                    # 할인가 포함 여부
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
                elif re.search(r"^\d+인분$|^[A-Za-z0-9]+[Pp]$", l2) or (len(l2) < 10 and re.search(r"[0-9]", l2)):
                    composition = l2
                elif len(l2) > 5 and not re.search(r"\d+,\d+원", l2):
                    desc = l2
                j += 1

            if name_line and price > 0:
                menus.append({
                    "group_name": current_group,
                    "name": name_line,
                    "price": price,
                    "discount_price": discount_price,
                    "composition": composition,
                    "description": desc,
                    "assigned_options": []
                })

        i += 1

    print(f"[OK] 메뉴 {len(menus)}개 수집")
    return menus


# ─────────────────────────────────────────────
# Step 4: 메뉴별 옵션그룹 순서 수집
# ─────────────────────────────────────────────
def scrape_menu_options(page, menus: list[dict]):
    """각 메뉴 클릭 → 휠 스크롤(클릭 없음) → 옵션그룹명 파싱 → ESC"""

    def extract_option_groups() -> list[str]:
        """body.innerText에서 '옵션그룹 설정' 앞 줄 = 그룹명+조건 → 그룹명만 추출"""
        text = page.evaluate("document.body.innerText")
        idx = text.find("\n옵션\n")
        if idx == -1:
            return []
        section = text[idx: idx + 4000]
        groups = []
        lines = section.split("\n")
        for i, line in enumerate(lines):
            if line.strip() == "옵션그룹 설정" and i > 0:
                raw = lines[i - 1].strip()
                # '[필수] 최소 N개 최대 N개' 또는 '최대 N개' 제거
                clean = re.sub(r"\[필수\]\s*최소\s*\d+개(\s*최대\s*\d+개)?$", "", raw).strip()
                clean = re.sub(r"최대\s*\d+개$", "", clean).strip()
                if clean and "변경" not in clean:
                    groups.append(clean)
        return groups

    close_popup(page)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)

    for menu in menus:
        name = menu["name"]
        try:
            page.locator(f"text={name}").first.click(force=True)
            page.wait_for_timeout(int(PANEL_PAUSE * 1000))

            # 패널 위에서 휠 스크롤 (클릭 없음)
            page.mouse.move(762, 350)
            for _ in range(14):
                page.mouse.wheel(0, 300)
                page.wait_for_timeout(int(SCROLL_PAUSE * 1000))

            groups = extract_option_groups()
            menu["assigned_options"] = groups

            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(200)

            status = f"{len(groups)}개" if groups else "없음"
            print(f"  └ {name[:30]}: 옵션 {status}")

        except Exception as e:
            print(f"  └ [ERROR] {name}: {e}")
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)


# ─────────────────────────────────────────────
# Step 5: 옵션 마스터 수집
# ─────────────────────────────────────────────
def scrape_option_master(page, store_name: str) -> list[dict]:
    page.goto(f"{BASE_URL}/menu?tab=option", wait_until="networkidle")
    recover_error_page(page)
    page.wait_for_timeout(1000)

    select_shop_option_page(page, store_name)

    # 가상 스크롤: 각 위치에서 body.innerText 수집 → 유니크 라인 합산
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(600)

    all_lines_ordered = []
    seen = set()

    for _ in range(30):
        text = page.evaluate("document.body.innerText")
        for line in text.split("\n"):
            line = line.strip()
            if line and line not in seen:
                seen.add(line)
                all_lines_ordered.append(line)

        scroll_y = page.evaluate("window.scrollY")
        max_scroll = page.evaluate("document.body.scrollHeight - window.innerHeight")
        if scroll_y >= max_scroll - 20:
            break
        page.evaluate("window.scrollBy(0, 400)")
        page.wait_for_timeout(int(SCROLL_PAUSE * 1000) + 150)

    merged = "\n".join(all_lines_ordered)

    # 파싱: 그룹명 + 조건 + 아이템
    options = []
    no = 0

    # 그룹 블록 찾기: 그룹명 줄 바로 다음에 '최대 N개' 또는 '[필수]...' → '변경'
    lines = merged.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        # 조건 줄: '최대 N개' 또는 '[필수] 최소 N개...'
        cond_match = re.match(r"^(\[필수\].+|최대\s*\d+개)$", line)
        if cond_match and i > 0:
            group_name = lines[i - 1].strip()
            condition = line.strip()

            # 다음 줄이 '변경'이면 확인
            if i + 1 < len(lines) and lines[i + 1].strip() == "변경":
                no += 1
                items = []
                j = i + 2
                # 아이템 수집: '배달N원' 줄 바로 앞 줄이 아이템명
                while j < len(lines):
                    if re.match(r"^(\[필수\].+|최대\s*\d+개)$", lines[j]) and j + 1 < len(lines) and lines[j+1].strip() == "변경":
                        break  # 다음 그룹 시작
                    item_price_m = re.match(r"^배달([\d,]+)원$", lines[j])
                    if item_price_m and j > 0:
                        item_name = lines[j - 1].strip()
                        # 아이템명이 실제 아이템인지 확인 (그룹 관련 텍스트 제외)
                        if (item_name and
                            "이 옵션을 사용하는 메뉴" not in item_name and
                            item_name not in {"변경", "보기", "픽업"} and
                            not re.match(r"^\[음식배달\]", item_name)):
                            price_val = int(item_price_m.group(1).replace(",", ""))
                            items.append({"name": item_name, "price": price_val})
                    j += 1

                if group_name and items:
                    options.append({
                        "no": no,
                        "group_name": group_name,
                        "condition": condition,
                        "items": items
                    })
                    print(f"  └ 옵션그룹 {no}: {group_name} ({len(items)}개 항목)")

        i += 1

    print(f"[OK] 옵션그룹 {len(options)}개 수집")
    return options


# ─────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print("사용법: python baemin_scraper.py \"매장명\"")
        sys.exit(1)

    store_name = sys.argv[1]
    print(f"\n{'='*50}")
    print(f"  배민 스크래퍼 시작: {store_name}")
    print(f"{'='*50}\n")

    OUTPUT_DIR.mkdir(exist_ok=True)
    baemin_id, baemin_pw = load_account(store_name)

    with sync_playwright() as pw:
        browser, ctx, page = connect_browser(pw)

        try:
            # 1. 로그인 확인
            ensure_login(page, baemin_id, baemin_pw)

            # 2. 메뉴판 접속 + 샵 선택
            print("\n[Step 2] 메뉴판 접속 및 샵 선택")
            page.goto(f"{BASE_URL}/shops/menupan", wait_until="networkidle")
            page.wait_for_timeout(1000)
            shop_id = select_shop(page, store_name)

            # 3. 메뉴 목록 수집
            print("\n[Step 3] 메뉴 목록 수집")
            menus = scrape_menus(page, shop_id)

            # 4. 메뉴별 옵션 순서 수집
            print("\n[Step 4] 메뉴별 옵션그룹 수집")
            page.goto(f"{BASE_URL}/shops/{shop_id}/menupan", wait_until="networkidle")
            page.wait_for_timeout(1000)
            scrape_menu_options(page, menus)

            # 5. 옵션 마스터 수집
            print("\n[Step 5] 옵션 마스터 수집")
            options = scrape_option_master(page, store_name)

            # 6. JSON 저장
            data = {
                "shop": store_name,
                "shop_id": shop_id,
                "menus": menus,
                "options": options
            }
            json_path = OUTPUT_DIR / f"{store_name}_현안.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"\n[OK] JSON 저장: {json_path}")

            # 7. xlsx 생성
            print("\n[Step 7] xlsx 생성")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "json_to_xlsx.py"), store_name],
                capture_output=True, text=True
            )
            print(result.stdout or result.stderr)

        finally:
            try:
                browser.close()
            except Exception:
                pass

    print(f"\n{'='*50}")
    print(f"  완료: output/{store_name}_현안.xlsx")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
