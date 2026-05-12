# 현재 프로젝트: BizHigh SalesOps

> 비즈하이 내부 매장 관리 SaaS. 정식 명칭 = **BizHigh SalesOps**. 현재 repo 폴더명은 `해병듀오/`. 구글 SEO(GBP·검색 노출), 메타광고 Lead, 카톡/Google 입력을 **관리 매장이 늘어도 누락 없이** 추적·관리하는 툴.

## 프로덕트 메타

- **고객사**: 비즈하이 (자체 사용)
- **사용자 (총 3명, 분담 없이 공동 사용)**:
  - **영업자**: 김민재, 김재원
  - **인하우스 마케터**: 반민성
- 전무·상무 등 외부 인물은 "본사" 컨펌·보고 대상일 뿐 SaaS 사용자 아님
- **존재 이유**: 매장 수가 많아지면서 누락·관리 부실 발생 → 단일 진실 원천 + 추적 가능한 툴 필요
- **범위**: DB 관리부터 매장관리까지 **범용적으로**. 특정 KPI에 묶이지 않고, 영업/마케팅이 실무에서 유용하게 쓸 수 있는 통합 매장 관리.
- **핵심 평가 기준**: "영업자·마케터가 매일 열어볼 만큼 유용한가". 관리 도구지 보고서가 아님.
- **인터페이스**: 랜딩페이지 진입 → 내부 툴
- **관리 매장 규모**: seed/운영 시트 기준으로 계속 늘어나는 다중 매장 운영 전제
- **현재 핵심 화면**: `/app`, `/app/stores`, `/app/stores/[id]`, `/app/leads`, `/app/settings`
- **현재 외부 입력**: 카톡 알림 ingest, 카톡 대화 내보내기 import, Google Calendar/Tasks read-only sync, 본사 Sheet read-only sync 설계

## 기술 스택 (잠정 — 변경 가능)

- **프론트**: Next.js **16.2.4** (App Router, `proxy.ts`) + React 19.2.4 + TypeScript
- **UI**: shadcn/ui + Tailwind
- **백엔드/DB**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **호스팅**: Vercel (프론트) + Supabase 클라우드 (DB)
- **로컬 개발**: `supabase start`로 로컬 스택 부팅 후 작업 (`../../.claude/rules/supabase-workflow.md`)

선택 이유: Auth/RLS 즉시 활용, Postgres view/RPC/trigger로 운영 자동화 구현, Vercel 배포와 Supabase Cloud 연결이 단순함.

다른 스택으로 바꾸려면 이 섹션 수정 + `supabase-workflow.md` 영향 검토.

## 누락 방지 정책 (비타협)

"관리 매장 누락 없이" 가 이 SaaS 존재 이유. 모든 설계 결정에서 이 가드 우선.

### 1. 단일 진실 원천: `stores` 테이블

매장 데이터는 `public.stores`만 권위 있는 소스. 스프레드시트·노션·메모는 **참고용**, 진실은 DB.

```sql
-- 최소 컬럼 (실제 마이그레이션은 도메인 확정 후)
id                    uuid primary key
name                  text not null
type                  store_type not null      -- enum: 요식업·뷰티·병의원·약국·기타
status                store_status not null    -- enum (아래 2번 참조)
business_number       text                     -- 사업자등록번호
address               text
owner_name            text                     -- 업주 이름
owner_email           text                     -- 견적서·계약서 발송용
owner_phone           text                     -- 카카오톡 연결
gbp_url               text
gbp_already_created   boolean default false    -- false면 GBP 프로필 세팅 단계 추가
tax_invoice           boolean default true     -- 세금계산서 발행 여부
contract_months       int                      -- 약정 기간
keywords_count        int                      -- 키워드 수
monthly_fee           int                      -- 월 단가 (원)
discount_pct          int default 0            -- 할인율 (%)
payment_method        text                     -- card·cash·transfer 등
start_date            date                     -- 시작일 (B.9, 모든 C 일정의 anchor)
assigned_owner        uuid references auth.users  -- 영업자
assigned_marketer     uuid references auth.users  -- 인하우스 마케터
created_at            timestamptz default now()
last_health_check_at  timestamptz
archived_at           timestamptz
```

### 2. 상태 머신 (enum `store_status`)

```
contract_pending      # A 단계 진행 중 (계약 전)
contract_signed       # A 완료, B 진행 중 (온보딩)
ready_to_start        # B 완료, 시작일 대기
active                # C 진행 중 (관리 중)
paused                # 일시 중단
churned               # 이탈
archived              # 보존
```

- **임의 status 추가 금지**. 새 상태 필요하면 마이그레이션으로 enum 확장.
- **삭제 대신 `archived_at` 채우기**. 물리 삭제 금지 (감사 추적 위해).
- 자세한 단계 정의는 `process.md` A·B·C 섹션 참조.

### 2-1. 업종 enum (`store_type`)

```
요식업, 뷰티, 병의원, 약국, 기타
```

- **요식업·뷰티**: 본사가 소식글 알아서 작성. 업주 컨펌 불필요.
- **병의원·약국**: 의료법으로 4주치 아티클 미리 컨펌 필요 (B.5b 블로커).

### 3. 헬스체크 신선도

- 매주 1회 이상 `last_health_check_at` 갱신 (자동 또는 수동).
- 7일 초과 stale → reconciliation 스킬이 알림.
- 14일 초과 → 자동 `paused` 후보로 표시.

### 4. 감사 로그 (audit log)

`stores` 상태 변경, owner 변경, 삭제 시도 → `store_audit_log`에 기록.

```sql
store_audit_log: id, store_id, actor, action, before, after, reason, occurred_at
```

매주 reconciliation으로 `stores`와 외부 소스(스프레드시트·CRM) diff하고 누락 발견 시 audit 기록.

### 5. RLS 기본값

- 모든 매장 테이블 RLS 활성화 기본.
- `service_role` 키는 코드/로그/채팅에 절대 노출 금지.
- 매장 사장 사용자가 추가될 경우 본인 매장만 보이도록 정책 적용.

## 데이터 모델 초안 (확장 예정)

```
stores              # 매장 마스터 (위 컬럼)
store_audit_log     # 변경 이력 (status·owner·delete 시도 등)
quests              # 퀘스트 큐 (process.md 단계 자동 풀어내기)
quest_completions   # 완료 이력 (메모·완료자·시점)
communications      # 업주 연락 트래킹 (통화·카톡·이메일·미팅 로그)
recurring_checks    # 매장별 정기 점검 (체크리스트 항목 + 결과)
store_metrics       # 시계열 KPI (date 단위 snapshot)
keywords            # 추적 키워드
keyword_rankings    # 키워드별 일일 순위
gbp_snapshots       # GBP API 응답 원본 보관 (raw json)
reports             # 주간/중간등수/월간 리포트 메타
quotes              # 견적서 (계약 전 발행 이력)
contracts           # 계약서 (전자서명 발송·완료 추적)
team_calendar_events # 팀 공유 캘린더 (미팅·방문·보고 일정)
notifications       # in-app 알림 큐
proposed_actions    # 카톡/Google/AIP 입력 승인 대기
lead_campaigns      # 메타광고 캠페인
leads               # 메타광고 잠재고객
lead_audit_log      # Lead 변경 이력
kakao_*             # 카톡 알림·대화 import·방 매핑·수집 batch
store_tone_profiles # 매장별 포워딩 말투 프로필
google_*            # 개인 Google OAuth·Calendar/Tasks sync source
aip_execution_logs  # AIP/LLM 초안 생성 감사 로그
```

실제 마이그레이션은 도메인 확정 후 점진 추가.

### 활동 추적용 (영상 시안 발견)

- `activity_log`: actor / type (작업·업주소통·내부협업) / occurred_at
  - **활동 히트맵** 위젯 데이터 소스 (github contribution 스타일, 26주치)

## 작업 우선순위

이 SaaS 작업할 때 거는 우선순위:

1. **누락 방지 매커니즘** > 새 기능
2. **데이터 신뢰성** > UI 화려함
3. **수동 입력 흐름 먼저** > 자동 수집 (자동화는 수동 흐름 검증된 후)
4. **읽기 화면 먼저** > 쓰기/편집 화면

## 변경 이력

- 2026-04-25: 신규. 비즈하이 SaaS 컨텍스트·스택·누락방지 정책 초기 작성.
- 2026-04-26: 카톡 자료 반영 — 업종 enum에 뷰티 추가, stores 테이블 컬럼 대거 보강(사업자번호·주소·업주정보·세금계산서·GBP생성여부 등), 데이터 모델에 quests·communications·recurring_checks·quotes·contracts·team_calendar_events 추가, 활동 히트맵 데이터 모델 신설. Next.js 버전 16.2.4로 정정.
- 2026-04-26: 사용자 답변 반영 — 정식 명칭 = **BizHigh SalesOps**, 사용자 3명 확정 (영업자: 김민재·김재원, 마케터: 반민성), 전무·상무 사용자 아님 (외부 컨펌 대상).
- 2026-05-11: Windows repo 기준 최신화. 폴더명 `해병듀오/`, Google/Kakao/AIP/notifications/Lead 현재 데이터 모델 반영, 깨진 `supabase-workflow` 경로 수정.
