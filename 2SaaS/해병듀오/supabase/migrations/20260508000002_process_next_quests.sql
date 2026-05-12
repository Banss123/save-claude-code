-- A/B 기본 프로세스 체인.
-- 퀘스트를 완료하면 다음 표준 단계 1건만 자동 발급한다.
-- 체크리스트/카톡 외부 연동 전에도 대시보드 큐가 끊기지 않게 하는 내부 안전장치.

create or replace function public.fn_insert_process_quest_if_missing(
  p_store_id uuid,
  p_title text,
  p_description text,
  p_process_step text,
  p_priority public.quest_priority default 'normal',
  p_due_date date default current_date,
  p_created_by uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_store_id is null or p_process_step is null or btrim(p_process_step) = '' then
    return;
  end if;

  if exists (
    select 1
      from public.quests q
     where q.store_id = p_store_id
       and q.process_step = p_process_step
       and q.status in ('pending', 'blocked')
  ) then
    return;
  end if;

  insert into public.quests (
    store_id,
    title,
    description,
    process_step,
    status,
    priority,
    source,
    due_date,
    created_by,
    metadata
  ) values (
    p_store_id,
    p_title,
    p_description,
    p_process_step,
    'pending',
    p_priority,
    'auto',
    p_due_date,
    p_created_by,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.tg_seed_next_process_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_step text;
  v_type_code text;
begin
  select q.store_id, q.process_step, s.type_code
    into v_store_id, v_step, v_type_code
    from public.quests q
    join public.stores s on s.id = q.store_id
   where q.id = new.quest_id;

  if v_store_id is null or v_step is null then
    return new;
  end if;

  case v_step
    when 'A.1' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '견적서 엑셀 작성',
        '개월수·금액·매장명을 기준으로 견적서를 작성하고 이미지로 추출',
        'A.2',
        'urgent',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.2' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '본사 내부 컨펌 + 온보딩 자료 수취',
        '견적 컨펌을 받고 업주에게 전달할 온보딩 자료를 확보',
        'A.3',
        'urgent',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.3' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '업주에게 견적서·온보딩 자료 전송',
        '견적서 이미지와 온보딩 자료를 업주에게 전달',
        'A.4',
        'urgent',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.4' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '사업자등록증·이메일 수취',
        '계약서 발송 전 필요한 사업자등록증과 이메일 확보',
        'A.5',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.5' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '계약서 요청·전자서명 발송',
        '전자서명 계약서를 요청하고 업주에게 발송',
        'A.6',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.6' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '입금 확인',
        '입금 확인 후 내부 기록까지 완료',
        'A.7',
        'urgent',
        current_date + 2,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'A.7' then
      update public.stores
         set status = 'contract_signed'
       where id = v_store_id
         and status = 'contract_pending';

      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '신규DB 구글폼 작성',
        '온보딩 자료를 기준으로 신규DB 구글폼을 수동 작성',
        'B.1',
        'urgent',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.1' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '업주 팀채팅방 개설',
        '업주 소통용 팀채팅방을 개설',
        'B.2',
        'normal',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.2' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '팀채팅방 초대',
        '영업자·업주·본사·인하우스 마케터를 팀채팅방에 초대',
        'B.3',
        'normal',
        current_date,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.3' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        'GBP 관리자 권한 요청',
        '업주에게 구글 비즈니스 프로필 관리자 권한 요청',
        'B.4',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.4' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        'GBP 비즈니스 인증 완료 확인',
        '구글 비즈니스 프로필 인증 상태를 확인',
        'B.4a',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.4a' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '매장 자료 요청',
        '사진·메뉴·정보·어필 포인트 등 초기 자료 요청',
        'B.5',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.5' then
      if v_type_code in ('clinic', 'pharm') then
        perform public.fn_insert_process_quest_if_missing(
          v_store_id,
          '4주치 아티클 주제 컨펌 받기',
          '병의원·약국은 시작일 산출 전 아티클 주제 컨펌 필요',
          'B.5b',
          'urgent',
          current_date + 1,
          new.completed_by,
          jsonb_build_object('created_from_completion_id', new.id)
        );
      else
        perform public.fn_insert_process_quest_if_missing(
          v_store_id,
          '사진 자료 드라이브·전달 양식 정리',
          '사진 자료 드라이브를 만들고 매장 자료 전달 양식을 워크방에 공유',
          'B.5c',
          'normal',
          current_date + 1,
          new.completed_by,
          jsonb_build_object('created_from_completion_id', new.id)
        );
      end if;
    when 'B.5b' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '사진 자료 드라이브·전달 양식 정리',
        '사진 자료 드라이브를 만들고 매장 자료 전달 양식을 워크방에 공유',
        'B.5c',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.5c' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '리뷰 작업자 구인',
        '리뷰 작업자를 구인',
        'B.6',
        'normal',
        current_date + 2,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.6' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '리뷰 작업자 인적사항 본사 전달',
        '리뷰 작업자 인적사항을 본사에 보고',
        'B.7',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.7' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '리뷰 작업자 톡방 개설',
        '리뷰 작업자 톡방을 만들고 필요한 인원을 초대',
        'B.8',
        'normal',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    when 'B.8' then
      perform public.fn_insert_process_quest_if_missing(
        v_store_id,
        '시작일 요청·확정',
        '선행 준비가 끝난 뒤 본사에 시작일을 요청하고 확정',
        'B.9',
        'urgent',
        current_date + 1,
        new.completed_by,
        jsonb_build_object('created_from_completion_id', new.id)
      );
    else
      null;
  end case;

  return new;
end;
$$;

drop trigger if exists quest_completions_process_next on public.quest_completions;
create trigger quest_completions_process_next
  after insert on public.quest_completions
  for each row execute function public.tg_seed_next_process_quest();

comment on function public.tg_seed_next_process_quest() is
  'A/B 표준 프로세스 퀘스트 완료 시 다음 단계 1건을 자동 발급한다.';
