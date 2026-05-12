-- 시트 동기화 정책 변경 (2026-05-05): 양방향 → 읽기 전용.
-- 시트 누락 체크 항목 = quests에 source='sheet_missing'으로 마킹 + external_url(시트 링크).
-- UI는 완료 버튼 숨기고 "체크리스트 ↗" 버튼만 노출 → 영업자가 시트에서 처리하면 다음 cron에서 자동 사라짐.

alter type public.quest_source add value if not exists 'sheet_missing';

alter table public.quests
  add column if not exists external_url text;

comment on column public.quests.external_url is '외부 링크 (시트 동기화 누락 퀘스트의 시트 cell URL 등). UI에서 "체크리스트 ↗" 버튼';
