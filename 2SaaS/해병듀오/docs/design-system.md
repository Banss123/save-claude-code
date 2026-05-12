# Design System — BizHigh SalesOps

> 목표: **민재·재원이가 처음 봐도 5초 안에 "이게 우선순위" "이건 누르면 처리됨"을 안다.**
> 복잡한 시각 효과·그라데이션·과한 아이콘 X. 정보 밀도보다 가독성.

---

## 1. 현재 진단 (2026-05-11)

| 영역 | 상태 | 문제 |
|---|---|---|
| 색상 토큰 | shadcn 기본 neutral 그레이 + chart 1~5도 무채색 | 의미 색 없음. urgent도 due-today도 done도 시각적으로 구분 X |
| 의미 색 사용 | 페이지 코드에 `bg-rose-100`·`bg-emerald-100` 직접 박힘 | 일관성·재사용 X. step별 색이 페이지마다 다를 위험 |
| 폰트 | Geist Sans (라틴), Geist Mono | **한국어 폰트 미할당** — 시스템 폴백(Apple SD Gothic Neo) 의존 |
| 시각 위계 | 텍스트 크기 산발적 | "이게 메인 액션"이라는 신호 약함 |
| 테마 | 라이트 고정 | 내부 업무툴은 한 가지 화면 기준으로 먼저 안정화 |

### 페이지에 이미 박혀 있는 임시 컬러 룰 (공식화 대상)

- **process_step**: A=blue / B=violet / C=emerald
- **priority**: urgent=rose / normal=zinc / low=zinc-50
- **due_bucket**: overdue=빨강 / today=주황 / tomorrow=파랑 / later=회색

→ 이 룰을 **시스템 토큰으로 승격**하고 일관 적용.

---

## 2. 디자인 원칙 (5개)

### 2-1. 5초 룰
화면 진입 후 5초 안에 **(a) 가장 급한 게 뭐고 (b) 다음에 뭘 누르면 되는지** 알아야 한다.
- 한 화면에 메인 액션 1개 (Primary 버튼 1개)
- urgent는 단 하나의 시각 신호로 (색 + 위치)
- 부가 정보는 회색 ghost 처리

### 2-2. 색은 의미만
색 = 정보. 장식 X.
- 빨강 = 위급/연체 (이 색 보이면 행동 필요)
- 주황 = 주의/오늘 마감 (오늘 안에 처리)
- 파랑 = 일반 액션·정보 (브랜드 컬러, 누를 수 있음)
- 초록 = 완료·정상
- 회색 = 부가 정보·완료된 과거

→ 같은 의미는 항상 같은 색. 페이지마다 다른 색 X.

### 2-3. 카드 1개 = 컨텍스트 1개
Quest Context Card처럼 한 카드 안에 매장 360을 넣되, **섹션은 보더 없는 spacing으로** 분리. 카드 중첩 X.

### 2-4. 텍스트 위계 3단
- **Display** (페이지 타이틀, 큰 숫자) — 24~32px, semibold
- **Body** (대부분의 텍스트) — 14~16px, regular
- **Caption** (보조 정보) — 12~13px, muted color

→ 추가 단계 만들지 마. 3단으로 충분.

### 2-5. 여백 > 라인
구분선 남발 X. Tailwind의 `space-y-*` / `gap-*`로 분리. 보더는 카드 외곽만.

---

## 3. 색 팔레트 — 옵션 A vs B (사용자 선택 필요)

의미 색(semantic)은 두 옵션이 동일. **브랜드 컬러(액션 / 강조)** 만 다름.

### 옵션 A — **Marine Navy** (해병듀오 어울림)

```
brand     = Navy 800     #1E3A5F   (사이드바·강조 텍스트)
primary   = Sky 600      #0284C7   (액션 버튼 = "딸깍" 색)
accent    = Cyan 500     #06B6D4   (포커스·링크 호버)
```
→ 차분, 진중, "비즈하이 영업·관리"라는 도메인과 톤 매칭.

### 옵션 B — **Forest Slate** (성장·신뢰)

```
brand     = Slate 800    #1E293B   (사이드바·강조 텍스트)
primary   = Emerald 600  #059669   (액션 버튼)
accent    = Teal 500     #14B8A6   (포커스·링크 호버)
```
→ 차분 + 성장 뉘앙스. "관리해서 성장시킨다"는 LTV 메시지에 맞음.

### 의미 색 (양쪽 공통)

```
urgent    = Red 600       #DC2626   bg: Red 50  #FEF2F2
warning   = Amber 600     #D97706   bg: Amber 50 #FFFBEB
info      = Sky 500       #0EA5E9   bg: Sky 50   #F0F9FF
success   = Emerald 600   #059669   bg: Emerald 50 #ECFDF5
neutral   = Slate 500     #64748B   bg: Slate 50 #F8FAFC
```

### Process Step 색 (양쪽 공통)

```
A 단계 (계약 전)   = Sky      bg: #F0F9FF text: #0369A1
B 단계 (온보딩)    = Violet   bg: #F5F3FF text: #6D28D9
C 단계 (관리)      = Emerald  bg: #ECFDF5 text: #047857
D 단계 (안부)      = Amber    bg: #FFFBEB text: #B45309
```

→ **현재 페이지에 이미 박힌 임시 룰과 호환** (rose→red, zinc→slate로 정착, 나머지 그대로).

### Due Bucket 색 (양쪽 공통)

```
overdue   = urgent      "오늘까지 못 끝낸 = 빨강"
today     = warning     "오늘 마감 = 주황"
tomorrow  = info        "내일 = 파랑"
later     = neutral     "나중 = 회색"
```

→ Quest 카드의 due_bucket을 이 룰로 통일.

---

## 4. 타이포그래피

### 4-1. 폰트 채택

**한국어 = Pretendard Variable** (필수)
- 무료 / 한국 UI 표준 / 가변 폰트(가벼움) / 영문은 Inter 기반 → 영문도 자연스러움
- 라이선스: SIL OFL (상업 OK)
- npm: `pretendard` 패키지 또는 CDN

**코드 = JetBrains Mono** (Geist Mono 대체 옵션, 유지도 OK)

→ **추천: Pretendard Variable + Geist Mono 유지** (Geist Mono도 변경할 이유 없음)

### 4-2. 타입 스케일

```
text-xs    12px   caption / 보조 정보 / 배지 안 텍스트
text-sm    14px   body 작은 (테이블 셀, 사이드바)
text-base  16px   body 기본 (카드 본문)
text-lg    18px   섹션 헤더
text-xl    20px   카드 제목
text-2xl   24px   페이지 보조 헤더
text-3xl   30px   대시보드 통계 큰 숫자
text-4xl   36px   페이지 메인 타이틀 (드물게)
```

### 4-3. 굵기 룰

```
font-normal     400   본문
font-medium     500   강조 (버튼·라벨)
font-semibold   600   헤더 / 큰 숫자
font-bold       700   극히 드물게 (사용 자제)
```

### 4-4. 라인 높이·자간

```
leading-tight    헤더 (1.25)
leading-normal   본문 (1.5)
tracking-tight   영문 헤더 (-0.01em)
```
한국어는 자간 건드리지 X (`tracking-normal`).

---

## 5. 스페이싱·라운드·그림자

```
간격 단위  = Tailwind 기본 (4px 베이스)
카드 패딩  = p-4 (16px) / p-6 (24px) — 내부 컴포넌트 따라
섹션 사이  = space-y-4 (16px) / space-y-6 (24px)
라운드     = rounded-md (10px) / rounded-lg (12.5px) — 카드 = lg
그림자     = shadow-sm (border 같이) / shadow X — border-only 권장
```

### 그림자 사용 룰
- 카드: `border` 만, `shadow X`
- 모달: `shadow-lg`
- 호버: `bg-muted/50` (그림자 X, 배경만 약간)

→ 깊이 효과 남발 X. 평면적 + 색으로 위계.

---

## 6. 컴포넌트 톤 가이드

### 6-1. Badge (상태·우선순위 표시)

| 종류 | 클래스 패턴 |
|---|---|
| 우선순위 urgent | `bg-red-50 text-red-700 border border-red-200` |
| 우선순위 normal | `bg-slate-100 text-slate-700` |
| 우선순위 low | `bg-slate-50 text-slate-500` |
| 상태 active | `bg-emerald-50 text-emerald-700` |
| 상태 paused | `bg-amber-50 text-amber-700` |
| 상태 churned | `bg-red-50 text-red-700` |
| step A/B/C/D | §3 process step 색 사용 |

→ `src/components/status-badge.tsx`의 `StatusBadge` / `PriorityBadge` / `StepBadge` / `StoreStatusBadge`가 현재 통합 배지 기준이다.

### 6-2. Button (액션)

```
Primary       bg-primary text-primary-foreground
              "이 화면에서 가장 중요한 액션 1개" (예: 완료 / 저장 / 적용)

Secondary     border border-input bg-background hover:bg-muted
              "보조 액션" (취소·뒤로·필터)

Ghost         hover:bg-muted text-foreground
              "부가 액션" (링크·삭제 외)

Destructive   bg-red-600 text-white hover:bg-red-700
              "되돌리기 어려움" (삭제·archive·escalate)
```

규칙:
- 한 카드/모달 = Primary 1개. 2개 이상 = 위계 깨짐.
- 큰 액션 옆 작은 액션은 모두 Ghost.

### 6-3. Card (콘텐츠 컨테이너)

```
<div class="rounded-lg border bg-card p-6 space-y-4">
  <div>  <!-- 헤더 -->
    <h3 class="text-lg font-semibold">제목</h3>
    <p class="text-sm text-muted-foreground">부가 설명</p>
  </div>
  <div class="space-y-2">  <!-- 본문 -->
    ...
  </div>
  <div class="flex justify-end gap-2 pt-2 border-t">  <!-- 액션 -->
    <Button variant="ghost">취소</Button>
    <Button>저장</Button>
  </div>
</div>
```

### 6-4. StatCard (대시보드 통계)

```
<div class="rounded-lg border bg-card p-5">
  <p class="text-sm text-muted-foreground">관리 매장</p>
  <p class="mt-1 text-3xl font-semibold tracking-tight">42</p>
  <p class="mt-1 text-xs text-emerald-600">+3 이번 주</p>
</div>
```
- 라벨(작게) → 큰 숫자 → 변화량(작게)
- 변화량 색: 증가=초록, 감소=빨강, 변화없음=회색

### 6-5. QuestCard (퀘스트 1건)

```
┌─────────────────────────────────────────┐
│ [B.5b] [urgent]               [⋮]      │  ← step badge + priority + 메뉴
│ 의료법 4주차 컨펌                        │  ← title (text-base, font-medium)
│ ○○병원 · 김민재                          │  ← store + 담당자 (text-sm muted)
│                          오늘 마감 ⏰    │  ← due (text-xs, today=주황)
└─────────────────────────────────────────┘
```
- urgent priority면 카드 좌측에 빨강 4px 라인
- 클릭 시 hover bg-muted/50
- 마감 임박은 due 텍스트 색으로만 표현

---

## 7. 적용 토큰 (globals.css에 추가될 것)

옵션 A·B 결정 후 아래 토큰을 globals.css에 추가:

```css
:root {
  /* 브랜드 — 옵션 선택에 따라 한 세트만 활성 */
  --brand:           ...;   /* A: navy 800 / B: slate 800 */
  --primary:         ...;   /* A: sky 600 / B: emerald 600 */
  --accent:          ...;   /* A: cyan 500 / B: teal 500 */

  /* 의미 색 (양쪽 공통) */
  --urgent:          oklch(0.58 0.22 25);    /* red 600 */
  --urgent-bg:       oklch(0.97 0.02 25);    /* red 50 */
  --warning:         oklch(0.66 0.18 60);    /* amber 600 */
  --warning-bg:      oklch(0.98 0.04 80);    /* amber 50 */
  --info:            oklch(0.66 0.18 240);   /* sky 500 */
  --info-bg:         oklch(0.97 0.03 240);   /* sky 50 */
  --success:         oklch(0.6  0.16 155);   /* emerald 600 */
  --success-bg:      oklch(0.97 0.03 155);   /* emerald 50 */
  --neutral:         oklch(0.5  0    0);     /* slate 500 */
  --neutral-bg:      oklch(0.97 0    0);     /* slate 50 */
}
```

타이포 토큰:

```css
@theme inline {
  --font-sans:    "Pretendard Variable", "Pretendard",
                  -apple-system, BlinkMacSystemFont,
                  "Apple SD Gothic Neo", system-ui,
                  "Segoe UI", sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, monospace;
  --font-heading: var(--font-sans);
}
```

---

## 8. 적용 순서 (단계 슬라이스)

### Step 1 — 토큰·폰트 셋업 (15분)
- `globals.css` 토큰 추가 (선택된 옵션 적용)
- `layout.tsx` Pretendard 로드 (next/font 또는 CDN)
- `components.json` 업데이트 X (style 유지)

### Step 2 — 데모 페이지 1개 토큰화 (30분)
- 대시보드 (`src/app/app/page.tsx`)의 Stats 영역만 토큰 사용으로 리팩
- 비교 스크린샷 / 사용자 피드백 받음

### Step 3 — Badge / Button 토큰화
- Badge 통합 컴포넌트는 1차 완료
- 남은 작업은 페이지별 raw 색상과 버튼 위계 정리

### Step 4 — Card 표준화 (1시간)
- 매장 상세·퀘스트 보드의 카드 패턴 통일
- §6-3 표준 적용

### Step 5 — Quest Context Card v0
- Quest Context Card는 1차 구현됨
- 남은 작업은 정보 우선순위와 모바일 밀도 조정

---

## 9. 사용자 결정 필요

- [ ] **D1**: 색 팔레트 — **A (Marine Navy)** vs **B (Forest Slate)**
- [x] **D2**: 테마 — 다크모드는 제외, 라이트 고정으로 운영 안정화
- [ ] **D3**: Pretendard 로드 방식 — `next/font/local` (자체 호스팅, 빠름) vs CDN (셋업 빠름)
- [ ] **D4**: 사이드바 톤 — 현재처럼 흰색 / 또는 brand 색 사용 (네이비/슬레이트 진한 배경)

---

## 10. 변경 이력

- 2026-05-06: 신규 작성. 현재 진단 + 5원칙 + 색 옵션 A/B + Pretendard + 컴포넌트 가이드 + 적용 단계.
- 2026-05-11: StatusBadge/Quest Context Card 구현 상태 반영. 오래된 “다음 슬라이스” 표현을 정리.
