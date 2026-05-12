# 범용화·SaaS화 가능성 검토

> 조사일 2026-04-21 · 현재 구조: 단일 담당자 1명 PC + Claude Code 에이전트 · 검토 목표: 타 배달 컨설팅 업체 공용화

---

## 1. 범용화 단계별 옵션

| 단계 | 배포 방식 | 난이도 | 월 비용(당사 부담) | 업체 수용성 | 비고 |
|------|-----------|:---:|-----|-----|------|
| A | git repo 공유 + `uv sync` | 낮 | 0 | 낮 (설치·업데이트 난감) | 현 구조. Claude Code Pro $20/월은 각 업체 부담 |
| B | PyPI + CLI 패키지 (`uvx valuechain`) | 중 | 0 | 중 (명령 1줄) | 에이전트·스킬은 별도 배포 필요 |
| C | Docker 이미지 | 중 | 0 | 중 (Docker 익숙도 요구) | Playwright + 한글 폰트 + `.venv` 캡슐화 |
| D | Slack Bot 멀티테넌트 | 상 | 서버 $50~/월 + Claude API 종량 | 상 (UX 자연) | Bolt 앱 1개 + 워크스페이스별 토큰·DB row |
| E | 웹 SaaS (FastAPI + 관리자 UI) | 최상 | $150~500/월 + Claude 종량 | 최상 | 인증·결제·로그·권한 전부 구현. 12~20주 소요 |

Claude API는 종량(선불 크레딧), Claude Code 구독 $20/월(Pro)·팀 $25~100/월([가격 정책](https://support.anthropic.com/en/articles/8977456-how-do-i-pay-for-my-api-usage)).

---

## 2. 범용화 준비도

### 준비된 것
- **결정적 생성 분리**: `src/generator/`는 순수 함수. 테넌트 분기 불필요
- **레버 로직 격리**: `target_revenue.py`·`lever_analysis.py`는 인자로만 동작 → IP 블랙박스화 가능
- **케이스 라이브러리 외부화**: `data/rules/suggestions.yaml` 단일 파일 → 오버라이드 용이
- **업종 키워드 12종**: `src/knowledge/industry_keywords.py`
- **마이그레이션 정책**: `INSTALL.md` "안전 절차" 섹션
- **과거실적 DB 스키마**: `data/historical_cases/*.json` + `historical_cases.py`

### 블로커
- **평문 계정 CSV**: `data/담당자/accounts.csv`에 배민 ID/PW 평문. 멀티테넌트 즉시 불가
- **경로 하드코딩**: `ACCOUNTS_CSV = parents[2] / "data" / "담당자"`. 테넌트 레이어 없음
- **슬랙 봇 미구현**: CLAUDE.md 설계만 있고 `src/bot/` 없음
- **출력 격리 없음**: `output/` 단일 디렉토리 → 테넌트 파일 누수 리스크
- **인증·결제·관제 전무**
- **배민 ToS 불확실**: 공식 Write API 없음([`baemin_write_api_feasibility.md`](./baemin_write_api_feasibility.md)). 제3자 배포 시 "자동화 도구 금지" 약관 위반 가능성 — [크롤링 법적 쟁점](https://www.shinkim.com/kor/media/newsletter/1843) 참고

### Phase 로드맵
- **0 (현재)**: 당사 1인, PC 로컬
- **1 (1개월, MVP 이식)**: Docker + `.env` 계정 주입 + `--tenant` 플래그 → 베타 2~3업체
- **2 (3~6개월, Slack Bot)**: 워크스페이스별 토큰, Postgres 이관. 업체 수동 온보딩
- **3 (12개월+, 웹 SaaS)**: 자가 가입·결제. 당사는 관제만

---

## 3. 기술 블로커

1. **계정 분리**: `accounts.csv` → Postgres + AES-GCM. 복호화 키 KMS. 개인정보보호법 제26조 위탁 계약서 필수([법제처](https://www.law.go.kr/LSW//lsLawLinkInfo.do?lsJoLnkSeq=900079061&lsId=011357&chrClsCd=010202&print=print))
2. **계정 보관 책임**: 수탁자 지위 → 유출 시 위탁자(업체) 책임 전이. **보험 + 2차 인증 저장소 분리** 최소선
3. **룰 오버라이드**: `rules/base.yaml` + `rules/tenants/{id}.yaml` 병합. `case_engine.py` 30~50줄 추가
4. **업데이트 배포**: ghcr.io + watchtower, CLI는 `uvx valuechain --upgrade`
5. **Playwright 안정성**: 배민 UI 변경 분기 주기. 유지보수 월 0.3 MM 추산
6. **API 비용 전가**: 업체별 Org 분리 vs 당사 단일 + 미터링. 후자 선택 시 토큰 카운팅 미들웨어

---

## 4. 비즈니스 모델 후보

| # | 모델 | 타겟 | 가격 | 수익 예측 (10업체·매장 500개) |
|---|------|------|------|--------|
| 1 | **매장당 과금** (Bariview 방식 — 매장당 12.9k/월) | 중형 컨설팅 업체 | 매장당 15~25k/월 | 월 750~1,250만 |
| 2 | **월 정액 + 매장 슬롯** (Popmenu 방식, $79+ / 추가매장 $300) | 소형 업체 (매장 10개 미만) | 기본 20만 + 매장당 10k | 월 220만+ (10업체) |
| 3 | **업체 규모별 티어** (Olo 방식 — Silver/Gold/Platinum 매장 수 기준) | 전체 | Starter 30만 / Pro 80만 / Enterprise 200만+ | 월 1,000만 수준 도달 |
| 4 | **Revenue Share** | 성과 공유 업체 | 컨설팅 수수료의 5~10% | 변동. 정본 레버 IP 리스크 |
| 5 | **Local Partner 추천 수수료** (Toast 방식 — 1회성 $500 per location) | 프리랜서 컨설턴트 | 매장당 30만원 일회성 | 일회성. 재계약 필요 |

**권장**: 매장당 종량(모델 1) + 상한 티어(모델 3) 혼합. 매장당 원가 약 300~800원 추정(Opus 4.6 + 캐싱) → 15~25k 가격 가능.

---

## 5. 다음 스텝

### 최단 MVP (4주)
1. `accounts.csv` → `.env` + `tenants/{id}/accounts.csv` 경로화 (하위호환)
2. Docker (Playwright + 한글 폰트 + `uv sync` 번들)
3. `rules/tenants/*.yaml` 오버라이드 엔진 30줄 추가
4. 당사 + 베타 1곳 duo 운영 2주

### SaaS 12개월 로드맵
- **M2**: Slack Bot + 워크스페이스별 토큰. 3업체 유료 베타
- **M4**: 배민 ToS 법무 자문 + 수탁자 계약 명문화. 보험 가입
- **M6**: FastAPI 웹 대시보드
- **M9**: 자가 가입 + Toss 결제
- **M12**: 멀티테넌트 관제

### 즉시 Go/No-Go
- 레버 로직(`target_revenue.py`) 공개 여부 — **비공개 권고**. 입력·출력만 노출
- 배민 공식 제휴 문의(woowabros) — 거절 시 Phase 2+ 리스크 ↑

---

관련 파일:
- `C:/Users/반민성/.claude/a/INSTALL.md` (마이그레이션 정책)
- `C:/Users/반민성/.claude/a/docs/external_tools_scan.md` (경쟁사 15종 가격 벤치마크)
- `C:/Users/반민성/.claude/a/docs/baemin_write_api_feasibility.md` (배민 API 현황)
- `C:/Users/반민성/.claude/a/data/담당자/accounts.csv` (현재 평문 계정 — 블로커)
- `C:/Users/반민성/.claude/a/data/rules/suggestions.yaml` (테넌트 오버라이드 대상)
