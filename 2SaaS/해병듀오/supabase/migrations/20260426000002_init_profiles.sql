-- profiles: auth.users 1:1 확장. 우리 도메인 정보 (이름·역할·연락처).
-- supabase auth가 회원가입시 트리거로 자동 생성.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.user_role not null default 'sales',
  email text,
  phone text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);

-- updated_at 자동 갱신 트리거 (재사용)
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- auth.users 신규 생성 시 profile 자동 발급
create or replace function public.tg_create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_create_profile_for_new_user();

comment on table public.profiles is 'auth.users 1:1 확장. SaaS 사용자 = 김민재·김재원·반민성 3명 (분담 X, 공동 사용)';
