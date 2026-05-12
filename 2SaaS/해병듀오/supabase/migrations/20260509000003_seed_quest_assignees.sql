create or replace function public.tg_seed_quest_assignees()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.quest_assignees qa where qa.quest_id = new.id
  ) then
    return new;
  end if;

  if new.assignee_id is not null then
    insert into public.quest_assignees (quest_id, profile_id, is_primary)
    values (new.id, new.assignee_id, true)
    on conflict (quest_id, profile_id) do update
    set is_primary = excluded.is_primary;
    return new;
  end if;

  insert into public.quest_assignees (quest_id, profile_id, is_primary)
  select new.id, sa.profile_id, sa.is_primary
  from public.store_assignees sa
  where sa.store_id = new.store_id
  on conflict (quest_id, profile_id) do nothing;

  update public.quests
     set assignee_id = (
       select sa.profile_id
       from public.store_assignees sa
       where sa.store_id = new.store_id
       order by sa.is_primary desc, sa.created_at
       limit 1
     )
   where id = new.id
     and assignee_id is null;

  return new;
end;
$$;

drop trigger if exists quests_seed_assignees on public.quests;
create trigger quests_seed_assignees
  after insert on public.quests
  for each row execute function public.tg_seed_quest_assignees();

insert into public.quest_assignees (quest_id, profile_id, is_primary)
select q.id, sa.profile_id, sa.is_primary
from public.quests q
join public.store_assignees sa on sa.store_id = q.store_id
where not exists (
  select 1 from public.quest_assignees qa where qa.quest_id = q.id
)
on conflict (quest_id, profile_id) do nothing;

update public.quests q
   set assignee_id = qa.profile_id
  from public.quest_assignees qa
 where qa.quest_id = q.id
   and qa.is_primary
   and q.assignee_id is null;
