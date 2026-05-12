# 과거 컨설팅 실적 DB — 입력 가이드

γ-4(분포 기반 배수 산출)의 입력. 매장당 1개 파일로 추가한다.

## 파일 명명
- `{case_id}.json` (예: `chicken_suwon_2024q4.json`)
- case_id는 영문 소문자·숫자·언더스코어. 실명 금지, 세그먼트 식별용.

## 최소 필수 필드
- `case_id`, `shop_name`, `cuisine`, `location`, `consulting_start` (YYYY-MM-DD)
- `consulting_months` (3·6·12 중 하나)
- `revenue.baseline` (원 단위 정수)

## 선택 필드 (실적 확정 시점에 채움)
- `revenue.month_3` / `month_6` / `month_12` (원 단위, 없으면 `null`)
- `interventions`: ["메뉴 개편", "광고 2배", ...]
- `outcome`: `"success"` | `"partial"` | `"stall"` | `"ongoing"` (기본 ongoing)
- `notes`: 자유 서술

## 업데이트 주기
컨설팅 시작 시 baseline만 먼저 등록 → 3/6/12개월 실적 확정 시 해당 필드 채움.
`cuisine` 값은 `src/knowledge/industry_keywords.py`의 키(예: "돈까스·회·일식", "양식", "치킨", "분식")와 일치시키면 세그먼트 필터가 정확해진다.
