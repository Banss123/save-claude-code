-- 사용자 결정 (2026-05-05): 견적서·발행 모두 할인단가 기준 사용. discount_pct는 자동 역계산 보조.
-- 할인 후 최종 월 단가를 직접 저장.

alter table public.stores
  add column if not exists discount_amount int;

comment on column public.stores.discount_amount is '할인 후 최종 월 단가(원). null이면 할인 없음. discount_pct는 보조 표시용';
