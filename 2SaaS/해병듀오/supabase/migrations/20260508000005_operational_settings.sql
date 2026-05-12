insert into public.app_settings (key, value, description)
values
  ('notification_new_quest_enabled', 'true', '새 퀘스트/수동 알림 표시 여부'),
  ('notification_due_soon_enabled', 'true', '마감/계약 종료 알림 표시 여부'),
  ('notification_blocked_enabled', 'true', '차단/시트 누락/의료법 컨펌 알림 표시 여부'),
  ('notification_store_check_enabled', 'true', '매장 점검 필요 알림 표시 여부'),
  ('integration_kakao_ingest_enabled', 'true', '카톡 알림 수집 API 활성화 여부'),
  ('integration_kakao_ingest_note', null, '카톡 수집 운영 메모')
on conflict (key) do nothing;
