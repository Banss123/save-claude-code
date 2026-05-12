# 다음 작업 백로그 — BizHigh SalesOps

> 마지막 업데이트: 2026-05-11 (Windows 구조 재파악, Google Calendar/Tasks sync, Kimi AIP, 카톡 import/톤 프로필, 문서 포인터 정리)

---

## ✅ 현재 기준선 (2026-05-11)

현재 기준은 **누락 방지 대시보드 + 외부 입력 제안함 + Google/Kakao 입력 준비**다.

### 검증 통과

```bash
npm run lint
npx tsc --noEmit
npm run build
supabase db reset
npm run smoke:routes
git diff --check
npm run smoke:prod
```

### 시연 준비 완료

- `docs/demo-scenario.md` — 피드백 미팅용 5분 시연 동선
- `/app` — Decision Brief 카드 + 퀘스트 보드
- `/app` 헤더 알림 종 — `notifications.status='pending'` 큐 count/list 연결
- Quest 액션 — 완료/위임/스킵/메모 Server Action 연결 + 대시보드 reload
- 대시보드 write — 핀 토글, 새 퀘스트, 캘린더 추가/삭제 Server Action 연결
- 전체 write 경계 — `src/app`/`src/components`의 Supabase insert/update/delete 직접 호출 제거, `src/lib/actions/*`로 이동
- `sheet_missing` 퀘스트 — 완료 버튼 대신 `체크리스트 ↗` 링크 분기
- Route smoke — `npm run smoke:routes`로 주요 페이지 200/3xx 확인
- Supabase 타입 — `src/lib/database.types.ts` 생성 + client/server/proxy generic 연결
- AIP 준비 — `src/lib/aip/context.ts` 서버 전용 whitelist context builder 추가
- 연락 기록에 `다음 액션 + 날짜`를 넣으면 `COMM.follow_up` 후속 퀘스트 자동 생성
- A/B 표준 프로세스는 퀘스트 완료 시 다음 단계 1건 자동 발급
- 모바일 하단 탭 네비게이션 + Decision Brief 좁은 화면 레이아웃 보강
- 퀘스트 완료 시 업주 연락 기록을 함께 남길 수 있는 완료 처리 패널 추가
- 완료된 퀘스트는 되돌리기 가능. 방금 생성된 다음 단계가 미처리 상태면 함께 자동 취소
- `proposed_actions` 제안함 추가. 카톡 복붙/알림, Google Calendar·Tasks, AIP 입력을 바로 실행하지 않고 승인 대기 후 퀘스트 생성
- Android 카톡 알림 수집 PoC 추가: `kakao_notification_events` raw 로그 + `kakao_room_mappings` + `/api/integrations/kakao-notifications`
- 카톡 ingest v2: batch 로그, 중복 방지, `[SEO]`/`[작업]` 방 매칭, 대화 내보내기 import, 매장별 톤 프로필
- AIP/Kimi: 포워딩 어시스턴트, proposed quest 초안, `aip_execution_logs`, LLM 실패 시 fallback
- Google Calendar/Tasks: 사용자별 OAuth, source 선택, proposed_actions 적재, Vercel Cron 하루 1회 sync
- 수동 퀘스트/퀘스트 완료/연락 기록에 로그인 사용자 ID 기록
- Vercel + Supabase Cloud 테스트 배포 — `https://banss-salesops-vercel.vercel.app`
- GitHub 원격 — `https://github.com/Banss123/banss-salesops.git`
- 프로덕션 스모크 — public route, auth redirect, 테스트 계정 3개 로그인 검증
- seed — 주요 매장에 회차·다국어 키워드·링크·업주 성향·pending 알림 샘플 보강

### 의도적으로 후순위

- 메타광고 DB는 DB/seed/초기 `/app/leads`만 존재. 현재는 후순위라 확장하지 않음.
- AIP/LLM 호출은 아직 넣지 않음. 지금은 SQL view/RPC 기반 deterministic Decision Brief와 서버 전용 context shape가 먼저.

### 다음 추천

1. 미팅 전 `docs/demo-scenario.md` 순서대로 프로덕션 URL에서 실제 클릭 점검
2. Vercel 계정에 GitHub Login Connection 추가 후 자동 배포 연결
3. 피드백 후 대시보드/카드 정보 우선순위 확정
4. 확정된 Decision Brief 데이터만 기반으로 AIP 요약/초안 생성 도입 검토
5. DB 마이그레이션 추가 후에는 `supabase gen types typescript --local --schema public > src/lib/database.types.ts` 재실행

---

## ✅ 오늘까지 완료된 것

### DB (주요 마이그레이션 + seed.sql)

실제 파일 정본은 `supabase/migrations/`이며 2026-05-11 기준 54개다. 아래 표는 초기 핵심 도메인 이력 중심의 요약이다.

| # | 파일 | 내용 |
|---|---|---|
| 001 | extensions_and_enums | pgcrypto·pg_trgm + store_status·quest_status·priority·source·user_role enum |
| 002 | profiles | auth.users 1:1 + 회원가입 트리거 + updated_at 헬퍼 |
| 003 | lookups | store_types·payment_methods·communication_channels |
| 004 | stores | + audit_log + 자동 변경 트리거 + GIN 검색 |
| 005 | quests | + completions + dependencies + 핀 트래킹 |
| 006 | rls | 인증 사용자 = 모두 read/write |
| 007 | communications | 업주 연락 트래킹 ⭐ |
| 008 | recurring_checks | + check_templates 7개 ⭐ |
| 009 | calendar_events + activity_log | |
| 010 | triggers + views | 자동 A.1 + completion·comm·store→activity_log + v_dashboard_stats·v_activity_heatmap·v_quest_dashboard |
| 011 | rls_extra | 새 테이블 RLS |
| 012 | dev_anon_read+write | [TEMP] 인증 후 제거 |
| 013 | quest_workflow_triggers | 시작일→C단계 자동 발급 + GBP 미생성 분기 ⭐ |
| 014 | next_month_rpc | `fn_seed_next_month` 롤링 갱신 ⭐ |
| 015 | reports | 본사→컨펌→송부 흐름 + report_type/status enum ⭐ |
| 016 | link_report_to_quest | 보고서 송부 → 해당 quest 자동 완료 ⭐ |
| 017 | keywords | 키워드 + 시계열 등수 (구글 SEO 핵심 측정) ⭐ |
| 018 | gbp_snapshots | 구글 비즈니스 프로필 인사이트 (조회·통화·길찾기·리뷰) ⭐ |
| 019 | proposed_actions | AI/외부 입력 제안함 — 승인 후 퀘스트 전환 |
| 020 | kakao_notification_events | Android 알림 접근 기반 카톡 raw 로그 |
| 021 | kakao_room_mappings | 카톡방 제목 → 매장 매핑 |
| 022 | kakao_ingest_batches | 카톡 수집 API 호출 단위 로그·중복/실패 집계 |
| 023 | store_tone_profiles / store_tone_examples | 매장별 포워딩 말투 프로필·학습 예시 |
| 024 | kakao_conversation_imports / kakao_conversation_messages | 카톡 대화 내보내기 전체 히스토리 import |

### 자동화 트리거 12개 (process.md 워크플로우 자동화)

1. 매장 등록 → A.1 퀘스트 자동
2. 매장 등록 (GBP 세팅 필요) → B.4* GBP 프로필 세팅 퀘스트 추가
3. A/B 표준 퀘스트 완료 → 다음 단계 1건 자동 발급
4. 시작일 입력 → D+15·주간4·월간1·체크4 자동
5. `fn_seed_next_month` RPC → 다음 1개월 롤링
6. 보고서 송부 → 해당 quest 자동 완료
7. 매장 변경 → audit_log 자동
8. 퀘스트 완료 → activity_log + status update 자동
9. 통신 기록 → activity_log 자동
10. 통신 기록 다음 액션 → 후속 연락 퀘스트 자동 생성
11. 퀘스트 제안함 승인 → `AI.proposed` 퀘스트 생성
12. 카톡 알림 수집 → 액션성 문장만 퀘스트 제안함으로 승격

### 주요 페이지 (모두 Supabase 연결)

- **`/`** — 외부 랜딩 (Hero·통계3·기능6·프로세스3·캘린더 안내)
- **`/app`** — 대시보드 (인사·통계5·**간트차트**·활동히트맵·퀘스트보드 탭·캘린더·완료)
- **`/app/stores`** — 매장 리스트 (필터·검색·stale 강조·행 클릭→상세)
- **`/app/stores/[id]`** — 매장 상세 (정보·시작일 입력·롤링 갱신·진행 퀘스트+**수동 추가**·연락 로그+추가·**키워드 등수+sparkline**·**GBP 인사이트**·정기 체크 수행·보고서 요약·변경 이력·**아카이브 버튼**)
- **`/app/stores/new`** — 매장 등록 (총액 표시 단순화 — 견적서는 엑셀 사용)
- **`/app/checks`** — 글로벌 정기 체크 (탭: 마감/매장/리뷰/전체 + 수행 버튼)
- **`/app/reports`** — 본사 자료 받음 → 컨펌 → 업주 송부 워크플로우 ⭐
- **`/app/settings`** — 내 정보

### 글로벌 UX

- 사이드바 6메뉴 (대시보드/매장등록/매장관리/정기체크/보고서/내정보)
- 글로벌 헤더 (검색 + 알림 종 + 프로필 아바타)
- BizHigh SalesOps 로고·메타데이터 통합

### 도메인 문서

- `docs/product.md` (BizHigh SalesOps·사용자 3명·업종 5·데이터 모델 보강)
- `docs/process.md` (협업 모델·도구 매핑·A·B·C 단계 풀상세)
- `docs/schema.md` (재사용·추출 청사진·query 시나리오)
- `docs/pages/dashboard.md` (간트차트 구조 + 영상 시안 분석)
- `docs/sources/` (카톡 원자료 + 영상 5장)

---

## 🎯 다음 작업 우선순위

### P0 — 본사 구글시트 동기화 ⭐ (2026-05-03 신규, 2026-05-05 정책 변경)

> 본사 운영 시트를 SaaS와 동기화. 명세: `docs/sheet-sync.md`. **2026-05-05: 양방향 → 읽기 전용 정책 전환**.

- [ ] **S1 설계+인증** (활성탭 확정, 사용자 액션 대기)
  - [x] 정책 결정 (2026-05-05 갱신): 시트 source of truth, **5분 cron 읽기 전용**, 매장명 자동매칭+미스매치 알림, D-day 그대로 mirror, **누락 체크 = quests `source='sheet_missing'` + `external_url` (UI는 완료 버튼 X, 시트 링크 버튼만)**
  - [x] 매핑 명세 작성 (`docs/sheet-sync.md`)
  - [x] **활성 탭 7개 확정**: 관리시트·4회차 관리시트·기본정보 셋팅·기본정보 셋팅_작업중·아티클 수취현황·퀄리티 체크리스트·매장리스트
  - [x] SEO 3시트 동기화 제외, 1/2/3회차 archive, 회원가입 화이트리스트 결정
  - [ ] 사용자 액션 ①: Google Cloud `bizhigh-sync` + Sheets API + Service Account JSON 키
  - [ ] 사용자 액션 ②: 본사에 시트 **읽기 권한** 요청 (서비스계정 이메일, 편집자 X)
- [ ] **S2 읽기 PoC** — `4회차 관리시트` 1탭 fetch + 매장 자동매칭 결과 dump
- [ ] **S3 단방향 동기화** — 마이그 (`sheet_aliases`/`setup_checks`/`article_receipts`/`quality_audits`/`sync_log`/`sync_state` + 컬럼 보강), Edge Function `sync-sheet` (7탭), pg_cron 5분, 대시보드 D-day + 퀄리티 이슈 알림 위젯, 누락 퀘스트 시트 링크 UI
- [x] ~~**S4 양방향 write-back**~~ ❌ **폐기 (2026-05-05)** — 읽기 전용 정책으로 충돌·복잡도 회피
- [ ] 영업자 코드 시드 (시트 매장리스트 우측 마스터: 반민성=25SA04, 김재원=25SA05, 김민재=25SA06 + 25SA01~SA23, 25MS01~02, 25OP02~03, 25SP02 등 30+개)
- [x] **매장별 담당자 설정 UI** (2026-05-03 완료) — `/app/stores` 매장관리 탭 select + dev staff 3명 seed + dev_anon_stores_update RLS

### P0' — 메타광고 DB 통합 관리 ⭐ NEW (2026-05-05)

> 메타(FB/IG) 인스턴트 양식 잠재고객(Lead). 명세: `docs/lead-management.md`
> **현재 상태: 후순위.** 기존 `/app/leads`가 빌드/DB reset을 깨지 않는 수준으로 유지.

- [x] DB 모델 (마이그 `20260505000004~000007`) — lead_status enum + lead_campaigns + leads + lead_audit_log + 자동 audit 트리거
- [x] seed 시뮬 — 캠페인 2건, Lead 8건 (status 다양)
- [ ] **Phase 1 사전 확인 5건** (사용자 답변 대기)
  - [ ] `디비관리 (병의원&뷰티)` 탭 컬럼 헤더
  - [ ] 디스코드 webhook 작동 방식
  - [ ] Lead 분배 로직 (라운드로빈/매장별/고정)
  - [ ] lead_status enum 충분성
  - [ ] 매장-Lead 매칭 규칙
- [ ] Phase 1 시트 미러링 (5분 cron, read-only) — 본사 시트와 동일 인프라 활용
- [ ] UI: `/app/leads` 리스트 + 상세 + 캠페인 마스터 + 대시보드 위젯
- [ ] Phase 2 Meta API 직결 (Webhook 권한 받으면)
- [ ] Phase 3 디스코드 → 알림 채널로 강등

### P0'' — UI 보완 6건 ✅ (2026-05-05 완료)

| # | 보완 | 상태 |
|---|---|---|
| 1 | 매장 등록·상세: 월 단가 VAT 10% 자동 표기 | ✅ UI만(DB 변경 X) |
| 2 | 매장 등록·상세: 할인율 → **할인단가 직접 입력** (마이그 `20260505000001` discount_amount 컬럼) | ✅ |
| 3 | 내 설정: 프로필 민재/재원/민성 select + 인라인 수정 (마이그 `20260505000002` profiles UPDATE 정책) | ✅ |
| 4 | 퀘스트 보드 담당자 필터 (본인=localStorage currentUserId 디폴트, 전체/본인/미지정/3명) | ✅ |
| 5 | 퀘스트 보드 "+ 새 퀘스트" 모달 (매장/내용/우선순위/마감/source=manual) | ✅ |
| 6 | 캘린더 날짜 클릭 모달 (이벤트 리스트·자세히·삭제 + 추가 폼) | ✅ |

### P1 — 인증 셋업 (큰, 사용자 답 받음)

- [x] **인증 방식**: Email+PW (사용자 결정 2026-05-01)
- [x] **사용자 권한**: 모든 권한 (3명 공동, RLS 현행 유지)
- [x] **매장 사장 로그인**: 불필요 (직원 3명만)
- [ ] **회원가입 정책 결정**: 화이트리스트(추천) vs 본사 수동 생성 vs 공개
- [x] `/login` 페이지 (Email + PW) — 2026-05-07 추가
- [x] supabase auth signin/signout Server Action — 2026-05-07 추가
- [x] `proxy.ts` 가드 복구 (`APP_AUTH_GUARD_ENABLED=true`) — 2026-05-07
- [x] `012_dev_anon_*` 및 후속 dev anon 정책 제거 migration — `20260507000001_auth_guard_remove_dev_anon.sql`
- [x] 사용자 3명 local auth seed — 민재/재원/민성 실제 이메일 + 초기 비번 `test1234`
- [x] 로그인한 `auth.user.id` → `profiles.id` → `localStorage.currentUserId` 자동 동기화 + 헤더 아바타 반영
- [ ] activity_log·audit_log의 actor_id 실 사용자로 매핑

### P2 — 자동화 보강

- [ ] `fn_seed_next_month`을 pg_cron으로 자동화 (매월 1회)
- [x] status 변경 트리거 — `A.7 완료 → contract_signed + B.1 자동`
- [x] communications.next_action_date 채워두면 → 후속 연락 퀘스트 자동 생성 (`COMM.follow_up`)
- [x] AI/외부 입력 제안함 — 수동 복붙 → 제안 → 승인 시 퀘스트 생성 (`AI.proposed`)
- [ ] 보고서 received → "컨펌해야 한다" 퀘스트 자동 발급?
- [ ] 관리 점검 지연 7일 초과 → 자동 알림 (push 또는 quest)

### P3 — 추가 화면·기능

- [ ] **매장 archive 액션** (현재 status 변경만, archived_at 채우는 명시 액션)
- [ ] **수동 퀘스트 추가** (매장 상세에서, 자동 외 임시 할 일)
- [ ] **키워드·등수 관리** (매장 상세 또는 별도 페이지) — keyword_rankings
- [ ] **GBP snapshot 입력 UI** — 등수·노출·통화 수동 입력
- [ ] **간트차트 필터** (매장 50+개 대비 그루핑·검색)

### P4 — 데이터 모델 추가

- [x] ~~`017` keywords + keyword_rankings~~ ✅
- [x] ~~`018` gbp_snapshots~~ ✅
- [ ] `019` sheet sync (P0 참조 — `sheet_aliases`/`setup_checks`/`article_receipts`/`sync_log`/`sync_state`) ⭐
- [ ] `020` store_metrics_daily (일일 KPI 집계 — keyword·gbp 합쳐 일자 단위 snapshot)
- [ ] `021` v_gantt_month view (현재 client에서 매트릭스, view로 옮기면 더 빠름)
- [ ] (skip) quotes/contracts — 사용자 표명: 견적서 엑셀로 충분, 별도 테이블 X
- [ ] (skip) 전자서명 워크플로우 — 사용자 표명: 본사→이메일→영업자 직접, SaaS 미관여

### P5 — 운영 품질

- [ ] supabase types 자동 생성 (`supabase gen types typescript --local`)
- [x] ~~supabase 폴더 위치 검토~~ ✅ 프로젝트 내부 `supabase/`로 단일 폴더화
- [ ] CI 셋업 (lint·type 체크)
- [ ] shadcn 추가 (input·select·dialog·dropdown·table·badge·tabs)
- [ ] 모바일 반응형 검증

---

## 🚫 사용자 결정 — 보고서·정기 체크 UI 비활성 (2026-04-26)

**의도**: 본사가 자료·텍스트 제공 → 우리가 카톡으로 업주에게 직접 전송. SaaS에서 컨펌·송부 클릭 한 번 더 = 이중 관리 부담.

**처리**:
- 사이드바 메뉴에서 "정기 체크" · "보고서" 제거 (4메뉴 환원)
- 매장 상세에서 두 섹션 제거
- **페이지·DB·트리거는 모두 보존** — 추후 카카오톡 비즈 메시지 API(알림톡·친구톡) 도입 시 부활 검토
- 부활 시 작업: sidebar에 두 메뉴 다시 추가 + 매장 상세에 두 섹션 import 다시

**카톡 자동 전송 검토 (추후)**:
- 카카오톡 비즈 메시지 API: 별도 가입·승인·비용 (KakaoTalk Channel + 알림톡 발신 프로파일)
- 도입 시점에 보고서·체크 워크플로우와 묶어 의사결정

---

## ✅ 사용자 답변 받음

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 분담 | 분담 X. 김민재·김재원·반민성 공동 사용. 전무·상무 사용자 아님 |
| 2 | 대시보드 형식 | 간트차트 메인 (한 달치 한 차수 한 눈에) |
| 3 | 영상 시안 차용 | 다 차용 (Claude 판단으로 효율적인 거 모두) |
| 4 | SaaS 명칭 | BizHigh SalesOps |
| 5 | 마케터 본명 | 반민성 |
| 6 | 영업자 본명 | 김민재 / 김재원 |
| 7 | 업종 분류 | 요식업/뷰티/병의원/약국/기타 |
| 8 | 견적서 | 엑셀로 발행 충분, SaaS에서 별도 빌드 X |
| 9 | 보고서 워크플로우 | 본사 자료 제공 → 우리 컨펌 → 업주 송부 |
| 10 | 퀘스트 적재 | 1개월 롤링 (시작일 입력시 첫 1개월, 끝나면 갱신) |

---

## 🔴 아직 답 필요

1. ~~**인증 방식**~~: Email+PW ✅
2. ~~**사용자 권한**~~: 모든 권한 ✅
3. ~~**전자서명**~~: SaaS 미관여 (본사→이메일→영업자 직접) ✅
4. **신규DB 구글폼 URL** — 나중에. 어디 쓸지 명확화 필요 (매장 등록 1차 입수 vs 외부 링크 노출만)
5. ~~**보고서 양식**~~: 본사 제공 ✅
6. ~~**매장 점검 체크리스트**~~: 본사 구글시트 사용 → P0 시트 동기화로 흡수 ✅
7. ~~**리뷰 점검 체크리스트**~~: 동일 → P0로 흡수 ✅
8. **간트차트 디테일** (3가지): (a) 매장 50+개 처리 — 그루핑·검색·페이지네이션 / (b) 막대 안 정보량 — 퀘스트명·진행률·담당자 / (c) "이번 차수만"·"전체"·"월/주" 뷰 토글
9. ~~**매장 사장 SaaS 로그인**~~: 불필요, 직원 3명만 ✅
10. **회원가입 정책** (NEW): 화이트리스트 / 본사 수동 / 공개?
11. **활성 탭 확정** (P0): 18개 탭 중 🟡 후보(1/2/3/4회차·SEO·퀄리티 등) 어디까지 active?

---

## 🚧 임시 처리 / 정리

- `supabase/migrations/012_dev_anon_*` `[TEMP]` — 인증 셋업 후 reverse migration 검토
- `mock-data.ts`의 todayStr 하드코딩 (`2026-04-26`) — 영상·시드와 정합 위해 시연용. 실 운영 시 동적
- check_templates의 항목 7개 — placeholder, 사용자 실 점검 항목 받아 교체 필요

---

## 📌 다음 세션 시작 추천

1. 이 백로그 보고 우선순위 결정
2. Vercel GitHub Login Connection 연결 후 `npx vercel git connect https://github.com/Banss123/banss-salesops.git`
3. 피드백 미팅 전 프로덕션 URL에서 민재/재원/민성 계정 로그인 확인
4. 또는 P3 추가 기능 신규 요청

### 다음 세션 시작 명령

```bash
# dev 서버 띄우기
cd "$HOME\.claude\2SaaS\해병듀오"
npm run dev
# → http://localhost:3000

# supabase 로컬 (안 떠있으면)
cd "$HOME\.claude\2SaaS\해병듀오"
supabase start
# → studio: http://127.0.0.1:54323

# DB 초기화 (필요 시)
supabase db reset
```

### 외부 공개 기준

- 정식 테스트 URL: https://banss-salesops-vercel.vercel.app
- 수동 배포: `npm run deploy:vercel && npm run smoke:prod`
- 자동 배포: Vercel GitHub Login Connection 연결 후 활성화

## 변경 이력

- 2026-04-26: 신규 작성
- 2026-04-26: 카톡 자료 5건 + 답변 6개 반영
- 2026-04-26: schema.md + 마이그 6개 + seed 1차
- 2026-04-26: ㄱㄱㄱㄱ 대량 디벨롭 — 마이그 12개, 페이지 4개 supabase 연결, 영상 시안 차용
- 2026-04-26: 매장 상세 + 글로벌 검색·알림 + 간트차트 + 활동히트맵
- 2026-04-26: P0.3 명칭·인물·로고 + 외부 랜딩 보강 + 정기 체크
- 2026-04-26: 마이그 13·14 자동 트리거 (시작일·GBP·롤링)
- 2026-04-26: 마이그 15·16 + /app/checks·/app/reports + 보고서→quest 자동 연결
- 2026-04-26: 견적서 패널 제거 (사용자 표명: 엑셀로 충분), mock-data.ts 정리 (사용 안 하는 mock 데이터 모두 제거)
- 2026-04-26: 마이그 17·18 (keywords + gbp_snapshots) + 매장 상세 키워드/GBP 섹션 + 키워드 sparkline + 수동 퀘스트 추가 + 매장 archive 버튼
- 2026-04-26: 사용자 결정 — 보고서·정기 체크 UI 비활성 (카톡 직송이라 SaaS 단계가 부담). 사이드바 4메뉴 환원, 매장 상세 두 섹션 제거. 페이지·DB·트리거 보존. 대시보드 순서 변경 — 1 퀘스트보드+캘린더+완료 / 2 간트차트 / 3 활동히트맵.
- 2026-05-01: 사용자 결정 — 인증 Email+PW, 모든 권한, 매장사장 로그인 X, 전자서명 SaaS 미관여, 보고서 본사 제공.
- 2026-05-03: P0 본사 구글시트 동기화 추가 — 시트 source of truth, 5분 cron, 자동매칭+미스매치알림, D-day mirror. 명세 `docs/sheet-sync.md` 1차안 작성. 슬라이스 4단계(S1~S4) 정의. P5에 마이그 019를 sheet sync로 변경, store_metrics_daily는 020으로 밀림.
- 2026-05-03 (오후): 활성 탭 7개 확정. SEO 3시트 동기화 제외, 1/2/3회차 archive. quality_audits 추가, 매장별 담당자 UI 추가, 회원가입 화이트리스트.
- 2026-05-05: **대규모 디벨롭** — (1) 폴더 비즈하이 → 해병듀오. (2) 마이그 `20260505000001~000007` 추가 (discount_amount, profiles UPDATE 정책, quests external_url+source 'sheet_missing', lead_status enum, lead_campaigns, leads, lead_audit_log + 자동 audit 트리거) + seed 보강 (할인 매장 6건, 메타 캠페인 2건, Lead 8건). (3) UI 보완 6건 적용 (매장등록 VAT 표기/할인단가, 내 설정 프로필 select·수정, 퀘스트보드 담당자 필터+새 퀘스트 모달, 캘린더 날짜 클릭 모달). (4) **P0 시트 정책 양방향 → 읽기 전용** 변경 (S4 폐기, 누락 퀘스트는 sheet_missing+external_url). (5) **P0' 메타광고 DB 통합 관리 신규** (`docs/lead-management.md`).
- 2026-05-05 (2차 보완): 4그룹 12개 ✅ — (A) 대시보드 통계 정리: 매장수=담당자필터 통합, 연체→누락 라벨, stale 합산, 누락 빨강·오늘마감 주황. (B) 캘린더: 라벨(미팅/월보고/방문/돌방/기타), 셀에 텍스트(구글 스타일 +N), 등록순 정렬, 모달 담당자 select. (C) 퀘스트보드: 담당자 select 단순화(전체/3명, 본인 디폴트), `process_step` 한글 매핑(STEP_LABELS), 새 퀘스트 마감일 today 디폴트, "전체보기" 버그 제거, 체크리스트 퀘스트(source=sheet_missing) 완료버튼→"체크리스트 ↗" 링크 분기. (D) **간트+히트맵 통합** — `ActivityHeatmap` 폐기, GanttChart 셀 위(내 작업, emerald) / 아래(업주 소통, violet) 2단 + activity_log fetch + 강도 표시. **유지**: 시작일 별·퀘스트·차단 점.
- 2026-05-06: TS 에러 2건 정리 — `StoreStatus`에 'archived' 추가 (mock-data.ts), `ReportRow`에 `send_note` 추가. **P0' Lead UI** 신규 — 사이드바 "DB 관리" 메뉴 + `/app/leads` 페이지 (리스트·필터(status/담당자/매장)·검색·status select·담당자 select·tel: 링크·메모 인라인·통계 카드·캠페인 요약·시트 링크). lead_audit_log 트리거가 변경 자동 기록.
