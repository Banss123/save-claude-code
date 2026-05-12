# PLAYBOOK: 배민 메뉴판 현안 스크래핑

> 클로드 코드 전용 지침서
> 브라우저를 직접 보고 조작하며 현안 데이터를 수집한다.

---

## 0. 사전 준비

### Playwright MCP 연결 (자동)

토큰이 MCP 설정에 고정되어 있어 별도 연결 불필요. 세션 시작 시 자동 연결됨.
(`PLAYWRIGHT_MCP_EXTENSION_TOKEN`이 `~/.claude/plugins/marketplaces/ecc/.mcp.json`에 설정되어 있음)

---

### accounts.csv에서 계정 추출

```
경로: C:\Users\LG\.claude\밸류체인컨설팅\accounts.csv
컬럼: 매장명, 배민_id, 배민_pw, ...

매장명 입력받기 → CSV에서 해당 행 찾기 → 배민_id, 배민_pw 추출
```

### 출력 파일

```
output/{매장명}_현안.json   ← 수집 데이터
output/{매장명}_현안.xlsx   ← 최종 결과물
```

---

## 1. 로그인 및 샵 확인

```
1. https://self.baemin.com 접속
2. 이미 로그인된 경우 그냥 진행 (snapshot에서 이기황님 + 샵명 확인)
3. 로그인 필요 시: ID/PW 입력 후 로그인
4. snapshot에서 현재 선택된 샵 확인 → 매장명 불일치면 드롭다운에서 변경
```

---

## 2. 메뉴판 접속

```
1. URL 직접 접속: https://self.baemin.com/shops/{shopId}/menupan
   (shopId는 snapshot의 URL 또는 샵 선택 콤보박스에서 확인)
2. 샵이 자동 선택되어 있으면 그냥 진행
```

---

## 3. 메뉴 목록 수집

```javascript
// 한 번에 전체 텍스트 파싱 (스크롤 불필요)
document.body.innerText
```

텍스트에서 그룹명 / 메뉴명 / 가격 / 구성 / 설명 추출 후 JSON 구성.
`assigned_options`는 이 단계에서 빈 배열로 남겨둠.

---

## 4. 메뉴별 옵션 순서 수집 (핵심)

### 메뉴 버튼 목록 확인

```javascript
// 전체 메뉴 버튼 인덱스 확인 (반드시 먼저 실행)
document.querySelectorAll('li > button').forEach((btn, i) => {
  const name = btn.innerText.trim().replace(/^(인기\s*|사장님 추천\s*)+/, '').split('\n')[0];
  console.log(i, name);
})
```

### 각 메뉴 클릭 → 옵션 수집 → 닫기 반복

```javascript
// [1] 메뉴 클릭 (idx = 버튼 인덱스)
document.querySelectorAll('li > button')[idx].click()

// [2] 모달 전체 텍스트 읽기 (scrollTop = 9999로 맨 아래까지)
const modal = document.querySelector('[class*="Modal"]');
modal.scrollTop = 9999;
modal.innerText   // → "옵션\n변경\n..그룹명.." 패턴으로 파싱

// [3] 옵션그룹 파싱 기준
// "옵션\n변경\n" 이후 텍스트에서 "옵션그룹 설정" 앞에 붙은 그룹명+조건 추출
// 예: "초밥 선택[필수] 최소 1개 최대 1개\n옵션그룹 설정" → "초밥 선택"

// [4] 닫기
[...document.querySelectorAll('button')]
  .find(b => b.innerText.trim() === '닫기' || b.getAttribute('aria-label') === '닫기')
  ?.click()
```

**주의:**
- `assigned_options`에는 **옵션그룹명 문자열이 아닌 no 숫자**를 넣을 것
  (같은 이름 옵션그룹이 2개 이상일 때 문자열로 매핑하면 충돌 발생)
- 순서 = 배민 앱 노출 순서 → 절대 임의로 변경 금지
- 옵션 없는 메뉴: `assigned_options = []`

---

## 5. 옵션 마스터 수집

### 접속

```
https://self.baemin.com/menu?tab=option
```

샵이 이미 선택된 상태이면 그냥 진행.

### ⚠️ 이 페이지는 가상스크롤 — 반드시 아래 방법 사용

`optionList-module__container`만 읽으면 **화면에 렌더링된 일부만 잡힘**.
전체 옵션그룹을 수집하려면 **스크롤 위치별로 나눠서 수집** 후 합산해야 함.

```javascript
// [STEP 1] 맨 위로 리셋
document.documentElement.scrollTop = 0

// [STEP 2] 현재 위치의 모든 optionGroup 텍스트 수집
document.querySelector('[class*="optionList-module__container"]').innerText
// → 현재 뷰포트에 렌더링된 그룹들

// [STEP 3] PageDown 키로 스크롤
// keyboard.press('PageDown') 반복

// [STEP 4] 스크롤 후 다시 수집
// 새로운 그룹이 나오면 누산, 안 나오면 종료

// [STEP 5] 아직 못 잡은 그룹이 있으면 DOM walker로 탐색
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while (node = walker.nextNode()) {
  if (node.textContent.includes('초밥 선택')) {  // ← 못 찾은 그룹명으로 교체
    let el = node.parentElement;
    for (let i = 0; i < 15; i++) {
      el = el.parentElement;
      if (!el) break;
      if (el.innerText.includes('최대') || el.innerText.includes('필수')) {
        console.log(el.innerText);
        break;
      }
    }
    break;
  }
}
```

### 수집 완료 기준

`optionList-module__container` 텍스트 + DOM walker 결과를 합쳐서
모든 메뉴 패널에서 발견된 옵션그룹명이 전부 포함되면 완료.

### JSON 구조

```json
{
  "options": [
    {
      "no": 1,
      "group_name": "추가 선택",
      "condition": "최대 7개",
      "items": [
        { "name": "뭉티기장", "price": 300 }
      ]
    }
  ]
}
```

**no는 페이지 상단부터 발견 순서대로 부여**

---

## 6. assigned_options no 매핑

메뉴 패널에서 수집한 옵션그룹명을 옵션 마스터의 no로 변환해서 저장.

```
메뉴 패널에서: ["초밥 선택", "추가 선택(7개)", "리뷰이벤트"]
옵션 마스터:   초밥 선택 = no:4, 추가 선택(7개) = no:1, 리뷰이벤트 = no:2

→ assigned_options = [4, 1, 2]   ← 반드시 숫자로 저장
```

**동명 옵션그룹(예: "추가 선택"이 2개) 구분 방법:**
- 패널에서 보이는 조건(최대 N개)으로 구분
- 이용 메뉴 목록(옵션 마스터 페이지에 표시)으로 교차 확인

---

## 7. xlsx 생성

```bash
cd C:\Users\LG\.claude\밸류체인컨설팅
python json_to_xlsx.py {매장명}
```

### xlsx 구조

**B~G열 (메뉴)**

| 열 | 내용 |
|---|---|
| B | 메뉴그룹명 |
| C | 메뉴명 |
| D | 가격 (할인가 있으면 할인가) |
| E | 구성 |
| F | 설명 |
| G | 할당옵션 순서 (no 숫자, 쉼표 구분) |

**H열** — 구분자

**I~M열 (옵션 마스터)**

| 열 | 내용 |
|---|---|
| I | 번호 (no) |
| J | 옵션그룹명 |
| K | 조건 |
| L | 옵션항목명 |
| M | 가격 |

---

## 8. 검증 체크리스트

- [ ] 메뉴 수가 실제 배민 화면과 동일한지
- [ ] assigned_options 비어있는 메뉴가 의도된 것인지
- [ ] 옵션그룹 no 번호가 페이지 상단→하단 발견 순서인지
- [ ] G열 할당옵션 숫자가 실제 패널 순서와 일치하는지
- [ ] 동명 옵션그룹이 있을 경우 올바른 no로 매핑됐는지
- [ ] 가격이 0이거나 비어있는 항목이 의도된 것인지

---

## 9. 에러 대응

| 상황 | 대응 |
|---|---|
| 옵션그룹이 optionList-module__container에 안 보임 | PageDown으로 스크롤 후 재수집 + DOM walker 병행 |
| 동명 옵션그룹 구분 불가 | 패널의 "최대 N개" 조건 + "이 옵션을 사용하는 메뉴" 목록으로 구분 |
| 모달이 안 열림 | 스크린샷 찍고 사용자에게 보고 |
| 닫기 버튼 못 찾음 | `[aria-label="닫기"]` 또는 dialog 바깥 클릭 |
| 샵 드롭다운에 매장명 없음 | 스크린샷 찍고 전체 목록 출력 후 사용자 확인 요청 |

---

## 10. 파일 구조

```
C:\Users\LG\.claude\밸류체인컨설팅\
├── accounts.csv                  ← 계정 정보
├── PLAYBOOK_클로드코드_v2.md     ← 이 파일
├── json_to_xlsx.py
└── output\
    ├── {매장명}_현안.json
    └── {매장명}_현안.xlsx
```
