-- 자주 추가/변경 가능성 있는 카테고리는 lookup 테이블로 분리.
-- 새 항목 추가 = INSERT 한 줄로 끝 (마이그레이션 X).

-- 업종
create table public.store_types (
  code text primary key,
  label text not null,
  sort_order int not null default 0,
  notes text
);

insert into public.store_types (code, label, sort_order, notes) values
  ('food',    '요식업', 10, '소식글 본사 자동 작성'),
  ('beauty',  '뷰티',  20, '소식글 본사 자동 작성'),
  ('clinic',  '병의원', 30, '의료법 — 4주치 아티클 컨펌 필요 (B.5b 블로커)'),
  ('pharm',   '약국',  40, '의료법 — 4주치 아티클 컨펌 필요 (B.5b 블로커)'),
  ('etc',     '기타',  90, null);

-- 결제수단
create table public.payment_methods (
  code text primary key,
  label text not null,
  sort_order int not null default 0
);

insert into public.payment_methods (code, label, sort_order) values
  ('card_corp',  '법인카드',   10),
  ('card_personal', '개인카드', 20),
  ('transfer',   '계좌이체',   30),
  ('cash',       '현금',       40),
  ('etc',        '기타',       90);

-- 연락 채널 (communications.channel용)
create table public.communication_channels (
  code text primary key,
  label text not null,
  sort_order int not null default 0
);

insert into public.communication_channels (code, label, sort_order) values
  ('call',     '전화',         10),
  ('kakao',    '카카오톡',     20),
  ('email',    '이메일',       30),
  ('discord',  '디스코드',     40),
  ('kakaowork','카카오워크',   50),
  ('meeting',  '대면 미팅',    60),
  ('other',    '기타',         90);

comment on table public.store_types is '재사용 lookup. 신규 업종 = INSERT만';
comment on table public.communication_channels is '업주 연락 채널. process.md 사용 도구 매핑 참조';
