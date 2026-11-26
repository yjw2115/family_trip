-- 업데이트 1: 지도 버튼용 "나라" 칸 추가 (2026-11-26)
-- 이미 schema.sql을 실행한 프로젝트에서만, SQL Editor에 붙여넣고 Run. 한 번만 실행한다.
-- (새로 설치할 때는 schema.sql에 이미 들어 있어서 필요 없다)

alter table public.events add column country text not null default '';

drop view public.event_list;
create view public.event_list with (security_invoker = true) as
select e.*,
  coalesce(c.path, (select p.path from public.photos p
                    where p.event_id = e.id and p.deleted_at is null
                    order by p.taken_at, p.id limit 1)) as cover_path,
  (select count(*) from public.photos p
   where p.event_id = e.id and p.deleted_at is null) as photo_count
from public.events e
left join public.photos c on c.id = e.cover_photo_id and c.deleted_at is null
where e.deleted_at is null;
grant select on public.event_list to authenticated;
revoke all on public.event_list from anon;

create or replace function public.save_plan(p_event_id bigint, p_plan jsonb) returns bigint
language plpgsql set search_path = '' as $$
declare
  t jsonb := p_plan -> 'trip';
  v_id bigint;
  items jsonb := coalesce(p_plan -> 'checklist', '[]');
begin
  if p_event_id is null then
    insert into public.events (kind, title, start_date, end_date, destination, country, stay, people, days)
    values ('trip', t ->> 'title', (t ->> 'startDate')::date, nullif(t ->> 'endDate', '')::date,
            coalesce(t ->> 'destination', ''), coalesce(t ->> 'country', ''), coalesce(t ->> 'stay', ''),
            nullif(t ->> 'people', '')::int, coalesce(p_plan -> 'days', '[]'))
    returning id into v_id;
  else
    update public.events set
      title = t ->> 'title',
      start_date = (t ->> 'startDate')::date,
      end_date = nullif(t ->> 'endDate', '')::date,
      destination = coalesce(t ->> 'destination', ''),
      country = coalesce(t ->> 'country', ''),
      stay = coalesce(t ->> 'stay', ''),
      people = nullif(t ->> 'people', '')::int,
      days = coalesce(p_plan -> 'days', '[]')
    where id = p_event_id and kind = 'trip' and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception '여행을 찾을 수 없어요';
    end if;
  end if;

  delete from public.checklist_items c
  where c.event_id = v_id and not exists (
    select 1 from jsonb_array_elements(items) x
    where x ->> 'group' = c.grp and x ->> 'text' = c.text);

  insert into public.checklist_items (event_id, grp, text, memo, position)
  select v_id, x ->> 'group', x ->> 'text', coalesce(x ->> 'memo', ''), (n - 1)::int
  from jsonb_array_elements(items) with ordinality as a(x, n)
  on conflict (event_id, grp, text)
  do update set memo = excluded.memo, position = excluded.position;

  return v_id;
end $$;
