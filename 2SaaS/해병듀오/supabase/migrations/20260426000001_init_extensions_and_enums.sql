-- 확장 + 도메인 enum 정의.
-- 자주 안 변하는 카테고리만 enum. 자주 변경 가능한 건 lookup 테이블(다음 마이그레이션).

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;  -- 전역 검색용

-- 매장 상태 머신
create type public.store_status as enum (
  'contract_pending',
  'contract_signed',
  'ready_to_start',
  'active',
  'paused',
  'churned',
  'archived'
);

create type public.quest_status as enum (
  'pending',
  'blocked',
  'completed',
  'cancelled'
);

create type public.quest_priority as enum (
  'urgent',
  'normal',
  'low'
);

create type public.quest_source as enum (
  'auto',     -- 프로세스 단계 자동 생성
  'manual'    -- 사용자 직접 추가
);

create type public.user_role as enum (
  'sales',     -- 영업자 (김민재·김재원)
  'marketer',  -- 인하우스 마케터 (반민성)
  'admin'
);

comment on type public.store_status is 'process.md A/B/C 단계와 매핑';
comment on type public.quest_priority is '대시보드 라벨 + 정렬 (urgent < normal < low)';
