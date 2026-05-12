-- 메타광고 Lead 상태 enum (2026-05-05 추가).
-- 사용자 정의: 'new'(신규) → 'contacted'(연락) → 'interested'(관심) → 'booked'(예약/계약) → 'closed'(완료/성사) | 'dropped'(이탈) | 'invalid'(허위)

create type public.lead_status as enum (
  'new', 'contacted', 'interested', 'booked', 'closed', 'dropped', 'invalid'
);
