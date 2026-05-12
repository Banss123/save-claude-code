-- 개발용 시드. supabase db reset 시 자동 로드.
-- 실 사용자는 auth.users에 가입해야 자동 생성. 시드는 매장·퀘스트 모킹만.

-- ===== BizHigh staff 3명 (local auth seed) =====
-- 트리거 tg_create_profile_for_new_user가 profiles row 자동 생성
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated',
   'douglas030305@gmail.com',
   extensions.crypt('test1234', extensions.gen_salt('bf')),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"김민재"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated',
   'sunup6974@gmail.com',
   extensions.crypt('test1234', extensions.gen_salt('bf')),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"김재원"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated',
   'ban951112@gmail.com',
   extensions.crypt('test1234', extensions.gen_salt('bf')),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"반민성"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- profiles role을 'sales'로 명시 (3명 모두 영업자 권한으로 공동 사용)
update public.profiles set role = 'sales'
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);


-- ===== 매장 8건 (mock-data.ts와 정합) =====
insert into public.stores (
  id, name, type_code, status,
  business_number, address,
  owner_name, owner_email, owner_phone,
  gbp_url, gbp_already_created,
  contract_months, keywords_count, monthly_fee, discount_pct, payment_method_code, tax_invoice,
  start_date,
  last_health_check_at
) values
  -- 계약 진행 중
  ('00000000-0000-0000-0000-000000000001', '강남역 한우다이닝', 'food', 'contract_pending',
   '123-45-67890', '서울 강남구 강남대로 123',
   '박사장', 'gangnam@example.com', '010-1234-5678',
   null, false,
   6, 10, 1200000, 10, 'card_corp', true,
   null, now() - interval '1 day'),

  -- 온보딩 중
  ('00000000-0000-0000-0000-000000000002', '성수 카페로스터리', 'food', 'contract_signed',
   '234-56-78901', '서울 성동구 성수동 1가 200',
   '이사장', 'roastery@example.com', '010-2345-6789',
   'https://maps.google.com/?cid=12345', true,
   12, 6, 800000, 15, 'card_personal', true,
   null, now()),

  ('00000000-0000-0000-0000-000000000003', '분당 미소치과', 'clinic', 'contract_signed',
   '345-67-89012', '경기 성남시 분당구 정자동 100',
   '김원장', 'smile@example.com', '010-3456-7890',
   null, false,
   6, 15, 2000000, 0, 'card_corp', true,
   null, now()),

  -- 시작 대기 (시연용: start_date를 일부러 null로 두어 매장 상세에서 시작일 입력 시 트리거 발동 확인)
  ('00000000-0000-0000-0000-000000000004', '송파 우리약국', 'pharm', 'ready_to_start',
   '456-78-90123', '서울 송파구 잠실동 50',
   '최약사', 'woori@example.com', '010-4567-8901',
   'https://maps.google.com/?cid=22222', true,
   6, 8, 1500000, 5, 'card_corp', true,
   null, now() - interval '1 day'),

  -- 활성
  ('00000000-0000-0000-0000-000000000005', '여의도 한방내과', 'clinic', 'active',
   '567-89-01234', '서울 영등포구 여의도동 30',
   '조원장', 'yeoui@example.com', '010-5678-9012',
   'https://maps.google.com/?cid=33333', true,
   12, 20, 2500000, 10, 'card_corp', true,
   '2026-02-01', now() - interval '3 days'),

  ('00000000-0000-0000-0000-000000000006', '이태원 비스트로', 'food', 'active',
   '678-90-12345', '서울 용산구 이태원로 80',
   '한사장', 'bistro@example.com', '010-6789-0123',
   'https://maps.google.com/?cid=44444', true,
   6, 8, 900000, 0, 'card_personal', true,
   '2026-03-15', now()),

  ('00000000-0000-0000-0000-000000000007', '홍대 라멘하우스', 'food', 'active',
   '789-01-23456', '서울 마포구 홍익로 12',
   '서사장', 'ramen@example.com', '010-7890-1234',
   'https://maps.google.com/?cid=55555', true,
   6, 10, 1100000, 5, 'card_corp', true,
   '2026-01-20', now() - interval '7 days'),  -- 매장 점검 stale 시뮬레이션

  -- 일시 중단
  ('00000000-0000-0000-0000-000000000008', '잠실 정형외과', 'clinic', 'paused',
   '890-12-34567', '서울 송파구 올림픽로 200',
   '윤원장', 'jamsil@example.com', '010-8901-2345',
   'https://maps.google.com/?cid=66666', true,
   6, 12, 2200000, 5, 'card_corp', true,
   '2025-12-01', now() - interval '14 days');  -- stale

-- [TEMP-2026-05-03] 일부 매장에 담당자 미리 매핑 (시연용). 4·8번은 미지정 — 변경 시연.
update public.stores set assigned_owner_id = '11111111-1111-1111-1111-111111111111'
  where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005');
update public.stores set assigned_owner_id = '22222222-2222-2222-2222-222222222222'
  where id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006');
update public.stores set assigned_owner_id = '33333333-3333-3333-3333-333333333333'
  where id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000007');

-- [2026-05-05] discount_amount 채움 (할인 적용 매장만). 견적·발행은 이 단가 기준.
update public.stores set discount_amount = monthly_fee - (monthly_fee * discount_pct / 100)
  where discount_pct > 0;

-- ===== [2026-05-05] 메타광고 Lead 시뮬 (병의원·뷰티 캠페인 2건 + Lead 8건) =====
insert into public.lead_campaigns (id, store_id, platform, campaign_name, external_id, started_at, budget_total, status, metadata) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005',
   'meta_lead_ads', '여의도 한방내과 인스턴트양식 1차', 'CAMP-260420-001',
   '2026-04-20', 800000, 'running',
   '{"target_age":"30-50","target_region":"서울","creative_type":"image"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   'meta_lead_ads', '분당 미소치과 임플란트 캠페인', 'CAMP-260415-002',
   '2026-04-15', 500000, 'running',
   '{"target_age":"40-60","creative_type":"video"}'::jsonb);

insert into public.leads (campaign_id, store_id, name, phone, age, region, status, assigned_to, memo, contacted_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005',
   '김지영', '010-1111-2222', 42, '서울 영등포', 'new', '11111111-1111-1111-1111-111111111111', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005',
   '박민수', '010-2222-3333', 38, '서울 마포', 'contacted', '22222222-2222-2222-2222-222222222222',
   '카톡 보냄. 다음주 미팅 예정', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005',
   '이서연', '010-3333-4444', 51, '서울 강서', 'interested', '11111111-1111-1111-1111-111111111111',
   '비염 한약 관심. 견적 요청', now() - interval '5 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005',
   '정현우', '010-4444-5555', 35, '서울 영등포', 'booked', '22222222-2222-2222-2222-222222222222',
   '5/10 첫 방문 예약', now() - interval '7 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   '최영민', '010-5555-6666', 45, '경기 성남', 'new', '33333333-3333-3333-3333-333333333333', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   '강수진', '010-6666-7777', 52, '경기 성남', 'contacted', '33333333-3333-3333-3333-333333333333',
   '임플란트 가격 안내', now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   '윤대호', '010-7777-8888', 28, '서울 송파', 'dropped', '33333333-3333-3333-3333-333333333333',
   '연락 두절. 전화 3회 무응답', now() - interval '10 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', null,
   '문혜진', '010-8888-9999', 39, '서울 종로', 'new', null, null, null);

-- ===== 퀘스트 시드 (process.md 단계 기반) =====
-- 각 매장 현재 단계에 맞는 퀘스트 1-2개
insert into public.quests (
  store_id, title, description, process_step, status, priority, due_date, source
) values
  -- 강남 한우다이닝 (계약 전)
  ('00000000-0000-0000-0000-000000000001',
   '사업자등록증·이메일 수취', '업주에게 사등본·이메일 받아서 보관', 'A.5',
   'pending', 'urgent', current_date, 'auto'),

  -- 성수 카페로스터리 (계약 후)
  ('00000000-0000-0000-0000-000000000002',
   '입금확인 양식 기록', '입금 확인 후 내부 양식에 기록', 'A.7',
   'pending', 'urgent', current_date, 'auto'),
  ('00000000-0000-0000-0000-000000000002',
   'GBP 관리자 권한 요청', '업주에게 GBP 권한 요청 카톡 발송', 'B.4',
   'pending', 'normal', current_date + 1, 'auto'),

  -- 분당 미소치과 (병의원 — 4주치 아티클)
  ('00000000-0000-0000-0000-000000000003',
   '4주치 아티클 주제 컨펌 받기', '4주치 아티클 컨펌이 완료되어야 시작일 확정 가능', 'B.5b',
   'pending', 'urgent', current_date, 'auto'),

  -- 송파 우리약국 (시작 대기, blocked 시뮬)
  ('00000000-0000-0000-0000-000000000004',
   '소식글 원고 전체 컨펌', '4주치 원고 전체 컨펌 후 시작 가능', 'B.5b',
   'blocked', 'normal', current_date + 1, 'auto'),

  -- 활성 매장들의 주간 보고 등
  ('00000000-0000-0000-0000-000000000005',
   '주간보고 작성', '4월 4주차 주간보고 — 키워드 등수 + GBP 인사이트', 'C.weekly',
   'pending', 'normal', current_date + 2, 'auto'),
  ('00000000-0000-0000-0000-000000000006',
   '월간보고 발송', '3월분 월간 보고서 작성 후 업주 카톡 송부', 'C.monthly',
   'pending', 'normal', current_date + 4, 'auto'),
  ('00000000-0000-0000-0000-000000000007',
   '리뷰 작업자 인적사항 본사 전달', '신규 리뷰 작업자 등록', 'B.7',
   'pending', 'normal', current_date + 3, 'auto');

-- 송파 우리약국 차단 사유 명시
update public.quests
set blocked_reason = 'B.5b 4주치 아티클 주제 미수령'
where store_id = '00000000-0000-0000-0000-000000000004' and status = 'blocked';

-- 1건 핀 고정 시뮬
update public.quests
set is_pinned = true
where store_id = '00000000-0000-0000-0000-000000000003' and process_step = 'B.5b';

-- ===== 업주 연락 로그 =====
insert into public.communications (store_id, channel_code, direction, occurred_at, summary, next_action, next_action_date) values
  ('00000000-0000-0000-0000-000000000001', 'call', 'outbound', now() - interval '1 day',
   '계약 의향 통화 — 견적 요청 받음', '견적서 발송', current_date),
  ('00000000-0000-0000-0000-000000000002', 'kakao', 'inbound', now() - interval '2 hours',
   '업주 카톡 — 입금 완료 알림', null, null),
  ('00000000-0000-0000-0000-000000000003', 'meeting', 'outbound', now() - interval '3 days',
   '원장님 대면 미팅 — 4주치 아티클 주제 논의', '주제 확정 받기', current_date + 1),
  ('00000000-0000-0000-0000-000000000005', 'kakao', 'outbound', now() - interval '6 days',
   '주간보고 송부 + 다음 주 일정 안내', null, null),
  ('00000000-0000-0000-0000-000000000007', 'call', 'inbound', now() - interval '8 days',
   '업주 클레임 — 리뷰 답글 톤 조정 요청', '리뷰 작업자 가이드 전달', current_date);

-- ===== 정기 체크 시뮬 (활성 매장 한정) =====
insert into public.recurring_checks (store_id, template_id, scheduled_for, performed_at, performed_by, result)
select
  s.id,
  t.id,
  current_date - 7,
  now() - interval '7 days',
  null,
  'ok'
from public.stores s, public.check_templates t
where s.status = 'active'
  and t.category = 'store'
  and t.name = 'GBP 사진 신규 업로드 확인';

-- 미수행(예정) 1건
insert into public.recurring_checks (store_id, template_id, scheduled_for)
select s.id, t.id, current_date
from public.stores s, public.check_templates t
where s.id = '00000000-0000-0000-0000-000000000005'
  and t.category = 'store' and t.name = '키워드 등수 스크린샷';

-- ===== 캘린더 이벤트 =====
insert into public.calendar_events (store_id, title, event_type, start_at, all_day) values
  ('00000000-0000-0000-0000-000000000003', '미소치과 원고 컨펌 미팅', 'meeting',
   (current_date + 1)::timestamptz + interval '14 hours', false),
  ('00000000-0000-0000-0000-000000000005', '여의도 한방내과 월간보고 마감', 'report_due',
   (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000000000004', '송파 우리약국 시작일', 'milestone',
   '2026-05-04'::timestamptz, true),
  (null, '본사 주간 미팅', 'meeting',
   (current_date + 2)::timestamptz + interval '10 hours', false);

-- ===== 키워드 + 등수 시드 (활성 매장 한정) =====
-- 활성 매장 3개에 매장당 5개 키워드 + 4주치 등수
insert into public.keywords (id, store_id, text, region, sort_order) values
  -- 여의도 한방내과
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', '여의도 한방', '서울 영등포', 10),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', '여의도 내과', '서울 영등포', 20),
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', '여의도 다이어트한약', '서울 영등포', 30),
  ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', '여의도 비염한약', '서울 영등포', 40),
  ('11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', '여의도 보약', '서울 영등포', 50),
  -- 이태원 비스트로
  ('11111111-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000006', '이태원 비스트로', '서울 용산', 10),
  ('11111111-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000006', '이태원 양식', '서울 용산', 20),
  ('11111111-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000006', '이태원 데이트', '서울 용산', 30),
  ('11111111-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000006', '이태원 와인바', '서울 용산', 40),
  -- 홍대 라멘하우스
  ('11111111-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000007', '홍대 라멘', '서울 마포', 10),
  ('11111111-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000007', '홍대 일식', '서울 마포', 20),
  ('11111111-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000007', '홍대 점심', '서울 마포', 30);

-- 4주치 GBP snapshot (활성 매장)
insert into public.gbp_snapshots (store_id, measured_on, period_days, views, calls, direction_requests, website_clicks, reviews_count, reviews_avg, source)
select
  s.id,
  current_date - (w * 7),
  7,
  (1500 + (abs(hashtext(s.id::text)) % 1000) - (w * 100))::int,
  (40 + (abs(hashtext(s.id::text || 'c')) % 30) - (w * 3))::int,
  (60 + (abs(hashtext(s.id::text || 'd')) % 40) - (w * 4))::int,
  (25 + (abs(hashtext(s.id::text || 'w')) % 20) - (w * 2))::int,
  (50 + (3 - w) * 2)::int,
  4.4 + ((3 - w) * 0.05),
  'manual'
from public.stores s, generate_series(0, 3) w
where s.status in ('active', 'paused');

-- 4주치 등수 (개선 추세 시뮬: 과거 = 높은 등수, 최근 = 낮은 등수 = 상승)
insert into public.keyword_rankings (keyword_id, measured_on, rank, source)
select
  k.id,
  current_date - (w * 7),
  greatest(
    1,
    (10 + (abs(hashtext(k.id::text)) % 30))::int + (w * 3)
  )::int,
  'manual'
from public.keywords k, generate_series(0, 3) w;
insert into public.reports (store_id, type, period_start, period_end, status, source_url, body, received_at, received_from) values
  -- 받음, 컨펌 대기
  ('00000000-0000-0000-0000-000000000005', 'weekly', current_date - 7, current_date,
   'received', 'https://drive.google.com/file/d/sample-1', '키워드 5개 등수 평균 상승. GBP 노출 +12%, 통화 +8건.',
   now() - interval '4 hours', '본사 김보고'),
  ('00000000-0000-0000-0000-000000000006', 'weekly', current_date - 7, current_date,
   'received', null, '4월 4주차 주간보고. 리뷰 신규 3건, 부정 0건. 키워드 등수 안정세.',
   now() - interval '6 hours', '본사 박보고'),

  -- 컨펌 완료, 송부 대기
  ('00000000-0000-0000-0000-000000000007', 'mid_rank', current_date - 14, current_date - 7,
   'confirmed', 'https://drive.google.com/file/d/sample-2', '키워드 3개 중 2개 1페이지 진입.',
   now() - interval '2 days', '본사 김보고'),

  -- 송부 완료 (과거)
  ('00000000-0000-0000-0000-000000000005', 'monthly', current_date - 30, current_date,
   'sent', 'https://drive.google.com/file/d/sample-3', '3월 종합 보고서 — 키워드·GBP·리뷰·통화 통계.',
   now() - interval '5 days', '본사 김보고'),
  ('00000000-0000-0000-0000-000000000006', 'monthly', current_date - 30, current_date,
   'sent', null, '3월 종합 보고서.',
   now() - interval '6 days', '본사 박보고');

update public.reports set
  confirmed_at = now() - interval '1 day',
  confirm_note = '오타 1건 수정 요청 후 본사 회신 받음. OK.'
where status in ('confirmed', 'sent');

update public.reports set
  sent_at = now() - interval '4 days',
  sent_to = '업주 카톡',
  send_note = '월간보고 미팅에서 직접 설명 후 PDF 송부'
where status = 'sent';

-- ===== 활동 히트맵용 과거 데이터 (4주치, 트리거 우회 위해 직접 INSERT) =====
-- 사용자 없이 actor_id null로 시뮬 (실 사용자 가입 후엔 그 사용자로 채움)
insert into public.activity_log (actor_id, store_id, category, type, occurred_at)
select
  null,
  s.id,
  case (i % 3) when 0 then 'work' when 1 then 'communication' else 'system' end,
  case (i % 3) when 0 then 'quest_completed' when 1 then 'comm_recorded' else 'check_performed' end,
  now() - (random() * interval '180 days')
from public.stores s,
  generate_series(1, 30) i
where s.archived_at is null;

-- ===== Owner profile 샘플 (palantir-patterns §5 / 업주별 성향 추적) =====
-- E2E 검증용: 시드 매장 3건에 다양한 성향 패턴

update public.stores
   set country_focus = '일본 관광객',
       channel_preferences = array['구글맵', '체험단'],
       owner_priority = 'authority',
       owner_likes = '실시간 보고, 격식 있는 톤',
       owner_dislikes = '복잡한 설명, 영업 전화',
       owner_sensitive = '의료법 광고 규제, 환자 후기 표현',
       owner_memo = '40대 후반 의사. 본인 직접 답장보다 실장님 통해 응대 선호.'
 where id = '00000000-0000-0000-0000-000000000005';

update public.stores
   set country_focus = '국내',
       channel_preferences = array['구글맵', '블로그', 'SNS'],
       owner_priority = 'rapport',
       owner_likes = '친근한 카톡, 빠른 응답',
       owner_dislikes = '정형화된 보고서, 늦은 답장',
       owner_memo = '30대 여성 원장. 카톡 사진/이모지 친화적.'
 where id = '00000000-0000-0000-0000-000000000003';

update public.stores
   set country_focus = '국내',
       channel_preferences = array['체험단'],
       owner_priority = 'revenue',
       owner_likes = '구체적 매출 수치, ROI',
       owner_dislikes = '추상적 표현',
       owner_sensitive = '경쟁 매장 비교',
       owner_memo = '50대 남성. 데이터 위주 응대 선호.'
 where id = '00000000-0000-0000-0000-000000000008';

-- ===== 매장 링크 + 메인 키워드 + 회차 (사용자 비전: 3분할 카드 좌측) =====
update public.stores
   set current_round = 4,
       main_keyword = '여의도 한방내과',
       main_keyword_translation = null,
       naver_place_url = 'https://map.naver.com/p/entry/place/12345678',
       google_map_url = 'https://maps.google.com/?cid=987654321',
       drive_folder_url = 'https://drive.google.com/drive/folders/1abc-yeoui-hanbang',
       onboarding_sheet_url = 'https://docs.google.com/spreadsheets/d/1abc/edit#gid=0'
 where id = '00000000-0000-0000-0000-000000000005';

update public.stores
   set current_round = 2,
       main_keyword = '분당 미소치과',
       naver_place_url = 'https://map.naver.com/p/entry/place/22345678',
       google_map_url = 'https://maps.google.com/?cid=897654321',
       drive_folder_url = 'https://drive.google.com/drive/folders/2abc-bundang-miso',
       onboarding_sheet_url = 'https://docs.google.com/spreadsheets/d/2abc/edit#gid=0'
 where id = '00000000-0000-0000-0000-000000000003';

update public.stores
   set current_round = 6,
       main_keyword = '잠실 정형외과',
       naver_place_url = 'https://map.naver.com/p/entry/place/32345678',
       google_map_url = 'https://maps.google.com/?cid=797654321',
       drive_folder_url = 'https://drive.google.com/drive/folders/3abc-jamsil-ortho'
 where id = '00000000-0000-0000-0000-000000000008';

-- 외국어 키워드 샘플 (일본 관광객 타겟)
update public.stores
   set main_keyword = '여의도 整形外科',
       main_keyword_translation = '여의도 정형외과 (일본어)'
 where id = '00000000-0000-0000-0000-000000000005' and country_focus = '일본 관광객';

-- ===== 메인 키워드 다국어 (마이그 20260506000007) =====
-- 일본 관광객 타겟 매장 = 일본어·영어 위주
update public.stores
   set main_keywords_i18n = '{
     "ko": "여의도 한방내과",
     "ja": "汝矣島 韓医院, 韓方クリニック",
     "en": "Yeouido Korean Medicine Clinic"
   }'::jsonb
 where id = '00000000-0000-0000-0000-000000000005';

-- 분당 미소치과 = 한국어 + 영어
update public.stores
   set main_keywords_i18n = '{
     "ko": "분당 미소치과, 분당 임플란트",
     "en": "Bundang dental clinic"
   }'::jsonb
 where id = '00000000-0000-0000-0000-000000000003';

-- 잠실 정형외과 = 한국어 + 영어 + 중국어 (중국 관광객 가능성)
update public.stores
   set main_keywords_i18n = '{
     "ko": "잠실 정형외과, 잠실 도수치료",
     "en": "Jamsil orthopedic",
     "zh_tw": "蠶室 整形外科"
   }'::jsonb
 where id = '00000000-0000-0000-0000-000000000008';

-- ===== 체크리스트·리뷰 시트 (마이그 20260506000008) =====
update public.stores
   set checklist_sheet_url = 'https://docs.google.com/spreadsheets/d/1abc-checklist/edit#gid=11',
       review_sheet_url = 'https://docs.google.com/spreadsheets/d/1abc-review/edit#gid=22'
 where id = '00000000-0000-0000-0000-000000000005';

update public.stores
   set checklist_sheet_url = 'https://docs.google.com/spreadsheets/d/2abc-checklist/edit#gid=11',
       review_sheet_url = 'https://docs.google.com/spreadsheets/d/2abc-review/edit#gid=22'
 where id = '00000000-0000-0000-0000-000000000003';

update public.stores
   set checklist_sheet_url = 'https://docs.google.com/spreadsheets/d/3abc-checklist/edit#gid=11'
 where id = '00000000-0000-0000-0000-000000000008';

-- ===== 시연용 Decision Brief 데이터 보강 =====
-- 내일 미팅 전 피드백과 무관한 sample 컨텍스트만 채움. 실제 운영 데이터와 연결 전까지는 dev seed 전용.
update public.stores
   set current_round = coalesce(current_round, 1),
       main_keywords_i18n = coalesce(main_keywords_i18n, '{"ko":"강남 한우 오마카세","en":"Gangnam Korean beef omakase","ja":"江南 韓牛"}'::jsonb),
       country_focus = coalesce(country_focus, '일본 관광객'),
       channel_preferences = coalesce(channel_preferences, array['구글맵', 'SNS']),
       owner_priority = coalesce(owner_priority, 'speed'),
       owner_likes = coalesce(owner_likes, '짧고 빠른 보고, 예약 문의 수치'),
       owner_dislikes = coalesce(owner_dislikes, '긴 설명, 늦은 회신'),
       owner_memo = coalesce(owner_memo, '점심 피크 전 10~11시 통화 선호. 카톡은 짧게.'),
       naver_place_url = coalesce(naver_place_url, 'https://map.naver.com/p/entry/place/demo-gangnam'),
       google_map_url = coalesce(google_map_url, 'https://maps.google.com/?cid=111111'),
       drive_folder_url = coalesce(drive_folder_url, 'https://drive.google.com/drive/folders/demo-gangnam'),
       onboarding_sheet_url = coalesce(onboarding_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-gangnam-onboarding'),
       checklist_sheet_url = coalesce(checklist_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-gangnam-checklist'),
       review_sheet_url = coalesce(review_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-gangnam-review')
 where id = '00000000-0000-0000-0000-000000000001';

update public.stores
   set current_round = coalesce(current_round, 1),
       main_keywords_i18n = coalesce(main_keywords_i18n, '{"ko":"성수 카페, 성수 로스터리","en":"Seongsu cafe roastery"}'::jsonb),
       country_focus = coalesce(country_focus, '국내'),
       channel_preferences = coalesce(channel_preferences, array['네이버플레이스', '블로그']),
       owner_priority = coalesce(owner_priority, 'quality'),
       owner_likes = coalesce(owner_likes, '감성 있는 문구, 사진 퀄리티'),
       owner_dislikes = coalesce(owner_dislikes, '가격 할인 위주 카피'),
       owner_memo = coalesce(owner_memo, '브랜드 톤 민감. 사진 선택권을 주면 응답 빠름.'),
       naver_place_url = coalesce(naver_place_url, 'https://map.naver.com/p/entry/place/demo-seongsu'),
       google_map_url = coalesce(google_map_url, 'https://maps.google.com/?cid=222222'),
       drive_folder_url = coalesce(drive_folder_url, 'https://drive.google.com/drive/folders/demo-seongsu'),
       onboarding_sheet_url = coalesce(onboarding_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-seongsu-onboarding'),
       checklist_sheet_url = coalesce(checklist_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-seongsu-checklist'),
       review_sheet_url = coalesce(review_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-seongsu-review')
 where id = '00000000-0000-0000-0000-000000000002';

update public.stores
   set current_round = coalesce(current_round, 1),
       main_keywords_i18n = coalesce(main_keywords_i18n, '{"ko":"송파 약국, 잠실 약국","en":"Songpa pharmacy"}'::jsonb),
       country_focus = coalesce(country_focus, '국내'),
       channel_preferences = coalesce(channel_preferences, array['구글맵', '카카오채널']),
       owner_priority = coalesce(owner_priority, 'authority'),
       owner_likes = coalesce(owner_likes, '정확한 일정표, 본사 컨펌 근거'),
       owner_dislikes = coalesce(owner_dislikes, '의학적 표현 과장'),
       owner_sensitive = coalesce(owner_sensitive, '약사법·의료 표현'),
       owner_memo = coalesce(owner_memo, '직접 통화보다 카톡 문서 정리를 선호.'),
       naver_place_url = coalesce(naver_place_url, 'https://map.naver.com/p/entry/place/demo-songpa'),
       google_map_url = coalesce(google_map_url, 'https://maps.google.com/?cid=444444'),
       drive_folder_url = coalesce(drive_folder_url, 'https://drive.google.com/drive/folders/demo-songpa'),
       onboarding_sheet_url = coalesce(onboarding_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-songpa-onboarding'),
       checklist_sheet_url = coalesce(checklist_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-songpa-checklist'),
       review_sheet_url = coalesce(review_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-songpa-review')
 where id = '00000000-0000-0000-0000-000000000004';

update public.stores
   set current_round = coalesce(current_round, 3),
       main_keywords_i18n = coalesce(main_keywords_i18n, '{"ko":"이태원 비스트로","en":"Itaewon bistro","ja":"梨泰院 ビストロ"}'::jsonb),
       country_focus = coalesce(country_focus, '외국인 관광객'),
       channel_preferences = coalesce(channel_preferences, array['구글맵', 'SNS', '유튜브']),
       owner_priority = coalesce(owner_priority, 'rapport'),
       owner_likes = coalesce(owner_likes, '외국인 리뷰 증가, 사진 기반 보고'),
       owner_dislikes = coalesce(owner_dislikes, '딱딱한 보고서'),
       owner_memo = coalesce(owner_memo, '저녁 영업 전 15~16시 응답 빠름. 영어 키워드 관심 큼.'),
       naver_place_url = coalesce(naver_place_url, 'https://map.naver.com/p/entry/place/demo-itaewon'),
       google_map_url = coalesce(google_map_url, 'https://maps.google.com/?cid=666666'),
       drive_folder_url = coalesce(drive_folder_url, 'https://drive.google.com/drive/folders/demo-itaewon'),
       onboarding_sheet_url = coalesce(onboarding_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-itaewon-onboarding'),
       checklist_sheet_url = coalesce(checklist_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-itaewon-checklist'),
       review_sheet_url = coalesce(review_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-itaewon-review')
 where id = '00000000-0000-0000-0000-000000000006';

update public.stores
   set current_round = coalesce(current_round, 5),
       main_keywords_i18n = coalesce(main_keywords_i18n, '{"ko":"홍대 라멘, 홍대 일본라멘","ja":"弘大 ラーメン","en":"Hongdae ramen"}'::jsonb),
       country_focus = coalesce(country_focus, '일본 관광객'),
       channel_preferences = coalesce(channel_preferences, array['구글맵', '블로그']),
       owner_priority = coalesce(owner_priority, 'revenue'),
       owner_likes = coalesce(owner_likes, '리뷰 수량, 지도 노출 그래프'),
       owner_dislikes = coalesce(owner_dislikes, '브랜딩 이야기만 길게 하는 것'),
       owner_sensitive = coalesce(owner_sensitive, '리뷰 답글 톤'),
       owner_memo = coalesce(owner_memo, '최근 리뷰 답글 톤 클레임 있음. 작업자 가이드 먼저 확인.'),
       naver_place_url = coalesce(naver_place_url, 'https://map.naver.com/p/entry/place/demo-hongdae'),
       google_map_url = coalesce(google_map_url, 'https://maps.google.com/?cid=777777'),
       drive_folder_url = coalesce(drive_folder_url, 'https://drive.google.com/drive/folders/demo-hongdae'),
       onboarding_sheet_url = coalesce(onboarding_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-hongdae-onboarding'),
       checklist_sheet_url = coalesce(checklist_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-hongdae-checklist'),
       review_sheet_url = coalesce(review_sheet_url, 'https://docs.google.com/spreadsheets/d/demo-hongdae-review')
 where id = '00000000-0000-0000-0000-000000000007';

-- 시트 누락 퀘스트 1건: 대시보드에서 완료 버튼 대신 외부 링크 버튼으로 보이는지 시연.
insert into public.quests (
  store_id, title, description, process_step, status, priority, due_date, source, external_url
) values (
  '00000000-0000-0000-0000-000000000005',
  '체크리스트 미기입 확인',
  '본사 시트에서 마감 체크가 비어 있음. SaaS에서는 완료하지 않고 시트에서 처리.',
  'C.check',
  'pending',
  'urgent',
  current_date,
  'sheet_missing',
  'https://docs.google.com/spreadsheets/d/1abc-checklist/edit#gid=11&range=H12'
);

-- pending 알림 seed. fn_compute_notifications 결과가 없더라도 헤더 종 배지가 살아 있게 유지.
insert into public.notifications (type, store_id, title, body, payload)
values
  (
    'sheet_missing',
    '00000000-0000-0000-0000-000000000005',
    '여의도 한방내과 체크리스트 미기입',
    '시트에서 처리하면 다음 동기화 때 자동으로 사라지는 항목.',
    '{"source":"seed"}'::jsonb
  ),
  (
    'medical_law_pending',
    '00000000-0000-0000-0000-000000000003',
    '분당 미소치과 4주치 아티클 컨펌 필요',
    '4주치 아티클 주제 확정 전에는 시작일 산출을 보류.',
    '{"source":"seed"}'::jsonb
  ),
  (
    'health_stale',
    '00000000-0000-0000-0000-000000000007',
    '홍대 라멘하우스 매장 점검 7일 경과',
    '리뷰 답글 톤 클레임 후속 확인 필요.',
    '{"source":"seed"}'::jsonb
  )
on conflict do nothing;
