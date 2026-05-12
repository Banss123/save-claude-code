# 본사 구글시트 → BizHigh SalesOps 읽기 전용 동기화 명세

> 본사 운영 체크리스트 시트를 SaaS DB로 읽기 전용 mirror한다. **시트가 source of truth**, SaaS는 대시보드·D-day 카운트·누락 알림 레이어다.

---

## 1. 개요

### 목적
- 본사가 시트로 운영하는 매장별 체크리스트(주차별 보고·기본정보 셋팅·아티클 수취 등)를 SaaS에서 가시화
- D-day·누락·진행률을 자동 카운트해 영업자가 놓치지 않게 함
- 본사·영업자 워크플로우 변경 0 (시트 그대로 사용)

### 핵심 정책 (2026-05-05 변경: 양방향 → **읽기 전용**)
| 항목 | 결정 |
|---|---|
| Source of truth | **시트** (절대) |
| 동기화 방향 | **시트 → SaaS 단방향 읽기 전용**. SaaS에서 시트로 write-back 안 함 |
| 읽기 주기 | **5분 cron** (pg_cron + Edge Function) |
| 시트 누락 체크 | quests에 `source='sheet_missing'` + `external_url` 마킹. UI는 **완료 버튼 숨김** + "체크리스트 ↗" 링크 버튼만. 영업자가 시트에서 처리하면 다음 cron에서 자동 사라짐 |
| 매장 매칭 | 매장명 정확매칭 → fuzzy fallback → 미스매치는 알림 큐로 보내고 사용자가 alias 확정 |
| D-day | 시트 `5일전`/`마감일` 컬럼 그대로 mirror (SaaS가 재계산 X) |
| 영업자 체크 | `관리시트`만 영업자체크+마감, 다른 시트는 마감만 카운트 |

### 시트 정보
- **본사 시트 (Spreadsheet ID)**: `117u2PT14pZrpAeYsk8GpPItQtAU9rNygJ9CQUnXhpbI`
- **메타광고 시트 (2026-05-05 추가)**: `1d_18LKEUpP9yxAL8Q86bxGndNToiaAGZ6M51Vc87CHk` — 9장 참조
- **인증**: Service Account (Google Cloud `bizhigh-sync` 프로젝트, Sheets API)
- **권한**: 서비스계정 이메일에 **읽기** (편집자 불필요 — 읽기 전용 정책)

---

## 2. 탭 분류 (18개) — 확정 (2026-05-03)

| 분류 | 탭 | 동기화 | 비고 |
|---|---|---|---|
| **🟢 active** | `관리시트` | ✅ 영업자체크+마감 | 1회차 진행 매장 — 주차별 보고/체크/작업 |
| | `4회차 관리시트` | ✅ 영업자체크+마감 | **현재 운영 통합본** — 4/5/6/7회차 매장 모두 포함 ⭐ |
| | `기본정보 셋팅` | ✅ 마감만 | 셋업 완료된 매장. transpose(열=매장, 행=항목) |
| | `기본정보 셋팅_작업중` | ✅ 마감만 + D-day | **신규 셋업 진행** — `D+7`/`D+14`/`D+3`/`D+5` 컬럼 ⭐ |
| | `아티클 수취현황` | ✅ 마감만 | 4주차 × 5항목 |
| | `퀄리티 체크리스트` | ✅ 별도 테이블 | **주간 리뷰 품질 감사** 8항목 (답글4+수량4). `이슈`/`X` 자동 알림 ⭐ |
| | `매장리스트` (gid=0) | ✅ 마스터 | 영업자 코드 마스터 (25SA01~SA23, 25MS01~02, 25OP02~03 등) |
| **❌ 동기화 제외** | `SEO 매장 키워드`, `SEO 매장상태`, `매장별 순위체크` | ❌ | 본사 시트만 사용. SaaS는 자체 `keyword_rankings`·`gbp_snapshots` 유지 |
| **📦 archive** | `1/2/3회차 관리시트` | ❌ | 4회차 통합본에 흡수됨 (사용자 결정) |
| | `관리시트_0422/0113/0120/컬럼형`, `보고항목 1회차_구` | ❌ | 일자별 백업/구 버전 |

---

## 3. 매장·영업자 매칭

### 매장 매칭 정책
1. **정확매칭** — `stores.name == sheet.매장명`
2. **alias 매칭** — `sheet_aliases.sheet_store_name → store_id`
3. **fuzzy 매칭** — Levenshtein/n-gram 유사도 ≥ 0.85 → "후보 추천"으로 미스매치 큐에 적재
4. 미매칭 시 → `sheet_sync_log`에 `unmatched_store` 이벤트 기록, 영업자에게 알림

### 영업자 매핑 (시트 → DB)
- 시트 `매장리스트` 우측에 영업자 코드 마스터 보유 (예: `반민성 25SA04`, `김재원 25SA05`, `김민재 25SA06`)
- DB `profiles`에 `sheet_code` 컬럼 추가 → 자동 매핑
- 코드 패턴: `25{ROLE}{##}` — `SA`(영업), `SP`(스페셜), `MS`(마케팅), `OP`(운영) 추정

---

## 4. DB 변경 (마이그 019)

### 신규 테이블
```sql
-- 시트 매장명 ↔ DB stores.id 매핑
create table public.sheet_aliases (
  sheet_store_name text primary key,
  store_id uuid references public.stores(id) on delete cascade,
  confirmed_at timestamptz default now(),
  confirmed_by uuid references public.profiles(id)
);

-- 기본정보 셋팅 체크 (1회성, 항목별)
create table public.setup_checks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  item_key text not null,           -- 'photo_exterior', 'menu_setup_w2', ...
  item_label text not null,          -- '가게 외부 사진', '메뉴판 세팅(2주차)'
  category text,                     -- '작업전', '자료캡쳐', '프로필수정', '그외'
  due_date date,                     -- 시트 마감일 (없을 수 있음)
  done_date date,                    -- 시트 영업자 체크날짜
  is_preset boolean default false,   -- '기설정' 값 처리
  source_cell text,                  -- 'B5' 같은 cell 좌표 (추적/링크용)
  synced_at timestamptz default now(),
  unique(store_id, item_key)
);

-- 아티클 수취 추적 (4주차 × 항목)
create table public.article_receipts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  week_no int not null check (week_no between 1 and 4),
  due_date date,
  received_date date,                -- 시트의 날짜
  note text,                         -- '특이사항' 컬럼
  source_cell text,
  synced_at timestamptz default now(),
  unique(store_id, week_no)
);

-- 주간 리뷰 품질 감사 (퀄리티 체크리스트)
create table public.quality_audits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  check_date date not null,            -- 시트의 매주 금요일 날짜
  item_code text not null,             -- '1-1', '1-2', ..., '2-4'
  item_label text not null,            -- '등록된 모든 리뷰에 빠짐없이 답글이 작성되었는가?'
  status text not null,                -- '영업자_O' | '영업자_X' | '작업자_O' | '작업자_X' | '이슈'
  source_cell text,
  synced_at timestamptz default now(),
  unique(store_id, check_date, item_code)
);
create index quality_audits_store_idx on public.quality_audits(store_id);
create index quality_audits_issue_idx on public.quality_audits(status)
  where status in ('영업자_X','작업자_X','이슈');  -- 알림용 부분 인덱스

-- 동기화 로그·미스매치 큐
create table public.sheet_sync_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tab text not null,
  event_type text not null,          -- 'fetched', 'upserted', 'unmatched_store', 'parse_error', 'stale_removed'
  payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- 마지막 동기화 상태
create table public.sheet_sync_state (
  tab text primary key,
  last_run_at timestamptz,
  last_row_hash text,                -- 변경 감지용
  last_modified_time timestamptz,    -- 시트 modifiedTime
  rows_synced int,
  errors int default 0
);
```

### 기존 테이블 보강
```sql
alter table public.stores
  add column if not exists sheet_alias text,                 -- 매장명 alias (캐시)
  add column if not exists assigned_owner_codes text[],      -- 시트 영업자1/2/3 코드 mirror (다중)
  add column if not exists current_round int,                -- 현재 회차 (1/4/5/6/7)
  add column if not exists current_round_sheet text;         -- 어느 시트에서 추적 중인지

alter table public.profiles
  add column if not exists sheet_code text unique,           -- '25SA04' 등
  add column if not exists sheet_role text;                  -- 'SA'(영업)/'MS'(마케팅)/'SP'(스페셜)/'OP'(운영)

alter table public.recurring_checks
  add column if not exists source_cell text,                 -- 시트 cell 좌표
  add column if not exists due_date_from_sheet date,         -- 시트 마감일 mirror
  add column if not exists round_no int;                     -- 회차 (4회차 시트용)

alter table public.quests
  add column if not exists source_cell text,
  add column if not exists due_date_from_sheet date,
  add column if not exists round_no int;
```

### 매장 담당자 정책 (사용자 신규 요구 2026-05-03)
- `stores.assigned_owner_id` (이미 존재) = **메인 담당자** (민재/재원/민성 중 1명)
- `stores.assigned_owner_codes[]` = 시트 영업자1/2/3 코드 전부 mirror (참조용)
- 시트 → SaaS 동기화 시: 영업자1 코드(25SA*)를 `profiles.sheet_code`로 lookup → `assigned_owner_id` 설정
- SaaS UI에서 담당자를 변경해도 시트에는 쓰지 않는다. 다음 sync에서 시트 영업자1 기준 mirror가 다시 적용될 수 있다.

---

## 5. 탭별 컬럼 매핑

### 5.1 관리시트 (메인)

**구조**: 1 row = 1 매장. 컬럼 100+개. 회차별·작업유형별 wide 형태.

**헤더 row 4개** (병합·다단):
- row 1: 카테고리 (`날짜 검색`, `루틴`, `1주차`, `2주차`, `3주차`, `4주차`, `비주기`, `다음회차 예고`)
- row 2: 서브카테고리 (`종료일`, `5일전`, `보고서 제작 후 공유`, `중간 등수 보고`, `리뷰 답글`, ...)
- row 3: 세부 (`체크날짜`, `보고날짜`, `작업날짜`, `영업자 체크`)
- row 4: 매장명 + 영업자 컬럼

**파싱 전략**: 컬럼 인덱스 → (period, task_type, sub_type) 매핑을 코드에 박음 (시트 구조 변경 시 깨지지만 대안 없음).

**핵심 컬럼 추정 (인덱스는 PoC에서 검증)**:
| 시트 컬럼 | DB 매핑 |
|---|---|
| `순서` | (스킵, 시트 정렬용) |
| `매장명` | `stores.name` (매칭 키) |
| `종료일` (4행 `작업시작일`?) | `stores.start_date`/`end_date` |
| `5일전` | **D-day 표시** → `quests.due_date_from_sheet` 직접 mirror |
| `1주차 보고날짜` | `quests` (week=1, type='weekly_report') `due_date_from_sheet` |
| `1주차 작업날짜` | `recurring_checks` (week=1, type='weekly_work') `last_done_at` |
| `1주차 영업자 체크` | `recurring_checks` (week=1) `verified_at` |
| `2~4주차` | 동일 패턴, week 2~4 |
| `중간 등수 보고` | `recurring_checks` (type='midterm_ranking') |
| `리뷰 답글 정확` | `recurring_checks` (type='review_reply') |
| `리뷰 수량 (주2회)` | `recurring_checks` (type='review_count') |
| `상호명 변경여부` | `recurring_checks` (type='store_name_check') |
| `다음회차 예고` | `quests` (type='next_round_notice') |

**값 정규화**:
- `26-04-20 월` → `2026-04-20` (YY-MM-DD + 요일, prefix `26` = 2026)
- `#N/A`, ``, `-`, `기설정` → null (단 `기설정`은 `is_preset=true` 마크)

### 5.2 기본정보 셋팅 (transpose)

**구조**: **행 = 체크 항목**, **열 = 매장**. 행 30+개, 열 N개 매장.

**카테고리** (왼쪽 첫 컬럼):
- `작업전`: 가게 외부/내부/메뉴/메뉴판 사진, 가게 특이사항
- `자료캡쳐`: 상호작용, 경로, 프로필 조회수/검색수
- `프로필수정`: 매장 이름 변경, 매장 소개, 개업일, 연락처, 영업시간, 모르는 부분 전달/적용, 프로필 수정 완료 공유
- `그외`: 표지·로고, 메뉴판 세팅(2주차), 예약링크

**파싱 전략**:
1. row 1~4: 헤더 (매장명은 row 3 추정)
2. row 5+: 항목별 데이터
3. **transpose 후 unpivot** → `(store, item, done_date)` 트리플
4. `setup_checks` upsert (`unique(store_id, item_key)`)

**`item_key` 생성 규칙**: 카테고리·라벨을 slug화 — `photo_exterior`, `profile_search_count`, `menu_setup_w2`, `reservation_link`

### 5.3 아티클 수취현황

**구조**: 1 row = 1 매장. 4주차 × 5칸씩 + 특이사항.

| 시트 컬럼 | DB 매핑 |
|---|---|
| `매장명` | 매칭 키 |
| `작업시작일` | `stores.start_date` (보조 검증) |
| `1주차 마감일` (5컬럼) | `article_receipts (week=1, due_date)` + `received_date`(첫 비어있지 않은 값) |
| `2/3/4주차 마감일` | 동일, week 2~4 |
| `특이사항` | `article_receipts.note` (week=특이사항 row?) |

**5컬럼의 의미**: row 1~3 헤더에서 5칸이 무엇인지 추가 확인 필요 (체크 항목 5개 추정 — PoC 시 컬럼 라벨 확정).

### 5.4 4회차 관리시트 (현재 운영 통합본) ⭐

**구조**: 1 row = 1 매장. 매장당 컬럼 2개씩 (작업자 체크날짜 + 영업자 체크날짜) × 회차(4/5/6/7).

**핵심 컬럼**:
- `관리 시작일/종료일` (한 매장당 2컬럼) → `stores.start_date`/`end_date`
- `회차` 표기 (각 매장 컬럼군 위) → `stores.current_round`, `recurring_checks.round_no`
- `작업자/영업자` 코드 — 매장별 담당자 추출용 → `stores.assigned_owner_codes`
- `매장상태` (`진행중`/`대기`/`진행완료`) → `stores.status` 매핑
- `반복1`, `반복2`, ... 행 = 회차별 반복 작업 → `recurring_checks` (round_no 포함)

**관리시트와의 차이**:
- 관리시트 = **1회차 진행 중 매장** (주차별 wide)
- 4회차 관리시트 = **4회차 이상 진행 중 매장** (회차별 wide)
- 매장 한 곳은 **둘 중 한 시트에만 등장** (회차에 따라)
- 동기화 시: 매장이 어느 시트에 있는지 추적해서 `current_round_sheet` 기록

### 5.5 기본정보 셋팅_작업중 (신규 셋업) ⭐

**구조**: `기본정보 셋팅`과 동일하지만 **신규 매장만** 포함, **D-day 컬럼 강조**.

| 시트 컬럼 | DB 매핑 |
|---|---|
| `D+7`/`D+14`/`D+3`/`D+5` (헤더) | `setup_checks.due_offset_days` (작업시작일 기준) |
| 카테고리 (`작업전`/`자료캡쳐`/`프로필 수정`) | `setup_checks.category` |
| 항목 (`1차 프로필 세팅 공유`, `메뉴판 세팅(2주차)`, ...) | `setup_checks.item_label` |
| 작업날짜·보고날짜·영업자체크 | `setup_checks.done_date`/`reported_date`/`verified_at` |

**파싱 전략**: `setup_checks` 테이블에 `is_in_progress boolean` 컬럼 추가 → `_작업중` 시트의 매장은 true, 셋업 완료되어 `기본정보 셋팅`으로 이관되면 false. 우선순위 높은 D-day 알림은 `is_in_progress=true`만 표시.

### 5.6 퀄리티 체크리스트 (주간 리뷰 품질) ⭐

**구조**: 1 row = 1 (체크 항목 × 주차), 1 col = 1 매장.

**파싱**:
- row 1: 매장명 (`진행중 텅앤그루브조인트`, `진행완료 휴본 한의원` 등 — 상태 prefix 분리)
- 첫 컬럼 묶음 (label/순서/항목명/체크날짜)
- 데이터 cell: `영업자 O`/`영업자 X`/`작업자 O`/`작업자 X`/`이슈`/(빈칸)

**transpose + unpivot** → `(store, check_date, item_code, status)` → `quality_audits` upsert.

**알림 정책**: `status in ('영업자_X','작업자_X','이슈')` → 영업자 알림 큐로 자동 발송. 부분 인덱스로 빠르게 조회.

### 5.7 매장리스트 (마스터)

**구조**: 좌측 매장 정보 + 우측 영업자 코드 마스터.

| 시트 영역 | DB 매핑 |
|---|---|
| `매장명 (링크)` 컬럼 | `stores.name`, `stores.external_link` (셀 hyperlink) |
| `영업자1/2/3` | `stores.assigned_staff_codes[]` 또는 별도 join 테이블 |
| `내부 작업자` | `stores.internal_worker_code` |
| `작업자1/2` | (보조) |
| `코드` | `stores.sheet_code` (매장 코드, 있으면) |
| 우측 `영업자 / 코드` 마스터 | `profiles.sheet_code` 시드 |

**영업자 코드 일괄 시드** (S1 단계):
```sql
-- 시트 매장리스트 우측에서 추출, 마이그 019 또는 seed.sql
insert into profiles_pending (name, sheet_code) values
  ('진영우', '25SP02'),
  ('오강래', '25SA01'),
  -- ... 25SA01~SA23, 25MS01~02, 25OP02~03 등
  ('반민성', '25SA04'),
  ('김재원', '25SA05'),
  ('김민재', '25SA06');
```

---

## 6. 동기화 흐름

```
[pg_cron 5분] 
  → call sync_all_sheets_rpc()
    → for each tab in active_tabs:
      → http call edge function 'sync-sheet?tab=<tab>'
        ├ JWT auth (service account)
        ├ fetch CSV via Sheets API v4 / gviz
        ├ parse + normalize
        ├ resolve store (alias → fuzzy → unmatched)
        ├ upsert (setup_checks / article_receipts / recurring_checks / quests)
        ├ log to sheet_sync_log
        └ update sheet_sync_state (last_run_at, hash)
```

### 충돌 처리
- 시트가 source of truth다. DB mirror 값과 시트 값이 다르면 다음 sync에서 시트값으로 덮는다.
- SaaS는 시트로 write-back하지 않는다. 충돌은 `sheet_sync_log`에 `upserted`/`stale_removed`/`parse_error` 등으로 남긴다.
- 미매칭 매장이나 파싱 실패는 알림/제안 큐로 올리고 수동 alias 확정 후 다음 sync에서 반영한다.

---

## 7. 환경변수

```env
# .env.local (서버 전용, NEXT_PUBLIC_ 절대 X)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}  # JSON 한 줄
SHEET_ID_BIZHIGH=117u2PT14pZrpAeYsk8GpPItQtAU9rNygJ9CQUnXhpbI
SHEET_SYNC_INTERVAL_MIN=5
```

---

## 8. 슬라이스 진행 상태

| Slice | 산출물 | 상태 |
|---|---|---|
| **S1** 설계+인증 | 본 명세 문서, 서비스계정, 활성탭 확정 | 🟡 진행 중 (사용자 액션 대기) |
| **S2** 읽기 PoC | 관리시트 1탭 fetch + 매장 매칭 결과 dump | ⏳ |
| **S3** 단방향 동기화 | 마이그 019, Edge Function, pg_cron, D-day 위젯 | ⏳ |
| ~~**S4** 양방향 write-back~~ | ❌ 폐기 (2026-05-05 — 읽기 전용 정책) | — |

---

## 9. 메타광고 시트 동기화 (2026-05-05 추가)

본사 운영 시트와 별개. 메타(FB/IG) 인스턴트 양식 잠재고객(Lead) 관리.

### 시트 정보
- **Spreadsheet ID**: `1d_18LKEUpP9yxAL8Q86bxGndNToiaAGZ6M51Vc87CHk`
- **인입 탭**: `260324 병의원&뷰티` (Raw Lead, 날짜 prefix)
- **정리 탭 (SSOT)**: `디비관리 (병의원&뷰티)` — 영업/마케팅 분배·진행 추적

### 데이터 모델
DB 마이그 `20260505000004~000007`에서 정의: `lead_campaigns`(부모) → `leads`(잠재고객) → `lead_audit_log`(이력). `lead_status` enum: `new`/`contacted`/`interested`/`booked`/`closed`/`dropped`/`invalid`.

자세한 명세는 `docs/lead-management.md`.

### 인입 흐름
- **Phase 1 (현재)**: 메타 응답 → 디스코드 webhook → 본사/영업자 시트 정리 → SaaS 동기화 (read-only)
- **Phase 2**: Meta API 직결 (App 권한 획득 후)
- **Phase 3**: 디스코드는 SaaS 알림 채널로 강등

### Phase 1 동기화 사양
- `디비관리` 탭 SSOT만 동기화 (Raw 탭은 백업용)
- 5분 cron, 읽기 전용 (본사 시트와 동일 정책)
- 매장 매칭: campaign_name → store_id (캠페인-매장 1:1 가정, 모호하면 unmatched 큐)
- 변경 자동 audit (status·assign·memo)

### Phase 1 사전 확인 (사용자 답변 대기)
1. `디비관리 (병의원&뷰티)` 탭 헤더 행 컬럼 매핑
2. 디스코드 webhook 작동 방식 (봇/Zapier/자체 코드)
3. Lead 분배 로직 (라운드로빈 / 매장별 / 영업자 고정)
4. `lead_status` enum 항목이 충분한지
5. 매장-Lead 매칭 규칙 (캠페인 단위 vs 매장 무관)

---

## 10. 변경 이력

- 2026-05-03: 신규. S1 설계 1차안. 시트 4탭(관리시트·기본정보·아티클·매장리스트) 구조 분석. 매핑 명세, DB 마이그 019 설계, 동기화 아키텍처 정의.
- 2026-05-03 (오후): 활성 탭 확정 (사용자 답변 반영) — 7개 active. SEO 3시트는 동기화 제외, 1/2/3회차 archive. 매장별 담당자 설정 신규 요구. quality_audits 테이블 신규 + 컬럼 보강. 5.4(4회차)·5.5(_작업중)·5.6(퀄리티) 매핑 명세 추가.
- 2026-05-05: **정책 변경** — 양방향 → **읽기 전용**. S4 폐기. 시트 누락 체크 = quests `source='sheet_missing'`+`external_url`로 마킹, UI는 완료 버튼 숨김 + 시트 링크 버튼만. 마이그 `20260505000003`에 quests.external_url + source enum 'sheet_missing' 추가. **메타광고 시트** 동기화 추가 (`1d_18LK...`, 디비관리 탭 SSOT) — 9장 명세, lead_campaigns/leads/lead_audit_log 마이그 4~7 추가, 자세한 건 `docs/lead-management.md`.
