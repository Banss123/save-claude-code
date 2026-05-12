---
name: baemin-collect
description: 배민 사장님사이트에서 매장 메뉴/옵션 + 통계·광고·NOW바를 수집한다. onboarding-full의 1·2단계를 개별 재실행할 때 사용(예: 스크래핑만 갱신하고 후속 단계는 `--skip-scrape`로 재돌리기).
---

## 입력

- **매장명** (필수) — `data/담당자/accounts.csv` 기준
- 작업 디렉토리: `C:/Users/반민성/.claude/a`

## 실행

두 커맨드를 순서대로 실행한다. 두 번째는 첫 번째 성공을 전제로 한다.

```bash
# 1) 메뉴/옵션 스크래핑
uv run python -m src.scraper.baemin "<매장명>"

# 2) 통계 + 광고 + NOW바 스크래핑
uv run python -m src.scraper.baemin_final "<매장명>"
```

두 커맨드 모두 동일한 세션 쿠키(`data/담당자/sessions/baemin_<ID>.json`)를 공유한다. 첫 번째 실행에서 세션이 저장되면 두 번째는 재로그인 없이 재사용한다.

## 출력

- `output/<매장명>_현안.json` — 메뉴/옵션 raw (RawMenuData 상위)
- `output/final/<매장명>_<YYYYMMDD_HHMMSS>/final.json` — 통계·광고·NOW바
- `data/담당자/sessions/baemin_<ID>.json` — 세션 쿠키 (재사용용)

## 검증

- [ ] `output/<매장명>_현안.json` 존재, 파일 크기 > 0
- [ ] `output/final/<매장명>_*/final.json` 중 최신 타임스탬프 폴더에 `final.json` 존재
- [ ] `final.json` 안에 `stat.order_amount`, `stat.order_count` 숫자 필드 존재 (객단가 계산용)
- [ ] 두 커맨드 모두 exit code 0

## 에러 처리

| 증상 | 원인 | 대응 |
|------|------|------|
| `accounts.csv에 '<매장명>' 없음` | 계정 미등록 | CSV에 ID/PW 추가 |
| 로그인 페이지에서 멈춤 / 캡차 노출 | 세션 만료 or 계정 이상 | `data/담당자/sessions/baemin_<ID>.json` 삭제 → 재실행. 반복되면 수동 로그인 필요 |
| 샵 선택 실패 | 매장명이 사장님사이트의 표기와 다름 | 배민 사장님사이트에서 정확한 표기 확인 |
| `final.json` 내 `stat` 필드가 빈 객체 | 대시보드 DOM 변화 | 스크래퍼 버그. `src.scraper.baemin_metrics` 확인 필요 (단, 이 스킬은 수정 금지) |

### 재시도 정책
- 브라우저 자동화는 간헐적으로 실패하므로 **동일 명령 1회 재시도** 허용
- 2회 연속 실패 시 로그 그대로 사용자에게 보고
