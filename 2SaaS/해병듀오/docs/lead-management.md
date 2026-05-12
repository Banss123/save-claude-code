# 메타광고 DB 통합 관리 명세

> 메타(FB/IG) 인스턴트 양식 잠재고객(Lead) 통합 관리. 본사 운영 시트 동기화(`docs/sheet-sync.md`)와 별개의 외부 데이터.

---

## 1. 배경 및 현황

- **DB**: 메타(FB/IG) 인스턴트 양식 응답 잠재 고객(Lead)
- **현재 흐름**: 메타 광고 응답 → 디스코드 Webhook → 본사/영업자 분배 → 해병듀오 시트 정리
- **외부 시트**: Lead 추적·분배·진행 추적용 운영 SSOT

## 2. 시트 정보

- **Spreadsheet ID**: `1d_18LKEUpP9yxAL8Q86bxGndNToiaAGZ6M51Vc87CHk`
- **인입 탭**: `260324 병의원&뷰티` (Raw Lead 인입, 날짜 prefix)
- **정리 탭 (SSOT)**: `디비관리 (병의원&뷰티)` — 영업/마케팅 분배·상태 추적

## 3. 데이터 모델 (마이그 `20260505000004~000007`)

```sql
-- 마이그 004: enum
CREATE TYPE lead_status AS ENUM (
  'new', 'contacted', 'interested', 'booked', 'closed', 'dropped', 'invalid'
);

-- 마이그 005: 캠페인
CREATE TABLE public.lead_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id),
  platform text NOT NULL,        -- 'meta_lead_ads' | 'instagram' | 'naver'
  campaign_name text NOT NULL,
  external_id text,
  started_at date,
  ended_at date,
  budget_total int,
  status text,                   -- 'running' | 'paused' | 'ended'
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- 마이그 006: Lead
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.lead_campaigns(id),
  store_id uuid REFERENCES public.stores(id),
  name text,
  phone text,
  age int,
  region text,
  raw_data jsonb,
  status lead_status DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id),
  contacted_at timestamptz,
  closed_at timestamptz,
  memo text,
  source_sheet_row int,
  source_cell text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 마이그 007: audit log + 자동 트리거
CREATE TABLE public.lead_audit_log (...);
-- 트리거: status_change | assign | memo | create 자동 기록
```

### Lead 상태 흐름
`new` → `contacted` → `interested` → `booked` → `closed` (정상 진행)
`new` → `dropped` (이탈) | `invalid` (허위 정보)

## 4. 인입 방법 및 로드맵

### Phase 1 (Plan A: 시트 미러링) — **현재**
- 시트 sync 인프라(`docs/sheet-sync.md`) 확장, 다중 시트 지원
- 5분 cron, **읽기 전용** (본사 시트와 동일 정책)
- 시트(SSOT) → SaaS 단방향
- 현재 디스코드/시트 워크플로우 유지

### Phase 2 (Plan B: Meta API 직결)
- Meta App 권한 획득 + Webhook 연동
- `lead_campaigns.external_id` = 메타 캠페인 ID 직접 매핑
- 시트 의존도 점진적 제거 (시트는 백업·수동 보정 용도로만)

### Phase 3 (디스코드 역할 변경)
- 디스코드 Webhook: 인입 채널 ❌ → SaaS 알림 채널 ⭕
- "새 Lead 도착", "5분 미응답 알림" 등 SaaS → 디스코드

## 5. Phase 1 사전 확인 사항 (사용자 답변 대기)

1. `디비관리 (병의원&뷰티)` 탭의 **상세 컬럼 구조** (헤더 매핑용)
2. 현재 디스코드 Webhook 작동 방식 (봇·Zapier·자체 코드 등)
3. Lead 분배 로직 (라운드로빈·매장별·영업자 고정 등)
4. `lead_status` ENUM 항목이 비즈하이 워크플로우에 충분한지
5. 매장(stores)과 Lead의 매칭 규칙 (캠페인 단위 vs 매장 무관)

## 6. UI 인벤토리

| 페이지 | 용도 | 상태 |
|---|---|---|
| `/app/leads` | Lead 리스트 + 필터(status/매장/담당자), 검색, status/담당자/memo 인라인 변경, 캠페인 요약 | ✅ 초기 화면 |
| `/app/leads/[id]` | Lead 상세 — 메모·status 변경·이력·통화 | ⏳ |
| `/app/campaigns` | 캠페인 마스터 + 성과 (CPL·전환율) | ⏳ |
| 대시보드 위젯 | "신규 Lead 5건", "응답 대기 3건" | ⏳ |

## 7. 시뮬 데이터

`supabase/seed.sql`:
- 캠페인 2건 (여의도 한방내과 / 분당 미소치과)
- Lead 8건 (다양한 status: new 3 / contacted 2 / interested 1 / booked 1 / dropped 1)
- 일부 매장 미배정 (분배 대기 시뮬)

## 8. 변경 이력

- 2026-05-05: 신규. 사용자 컨텍스트 그대로 명세화. 마이그 4~7(lead_status/lead_campaigns/leads/lead_audit_log) + seed 시뮬 적용.
- 2026-05-11: `/app/leads` 초기 화면 구현 상태 반영. 상세/캠페인/대시보드 위젯은 후순위 유지.
