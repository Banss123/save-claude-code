-- Kimi(Moonshot) provider를 AIP 실행 로그 provider로 허용한다.

alter table public.aip_execution_logs
  drop constraint if exists aip_execution_logs_provider_check;

alter table public.aip_execution_logs
  add constraint aip_execution_logs_provider_check
  check (provider in ('openai', 'kimi', 'fallback'));

comment on column public.aip_execution_logs.provider is
  'LLM 실행 제공자. openai/kimi/fallback 중 하나.';
