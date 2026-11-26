-- 우리 가족 이야기: DB 구조
-- Supabase 대시보드 → SQL Editor에 통째로 붙여넣고 Run. 처음 한 번만 실행한다.
-- ⚠ 아래 is_family()의 이메일은 site/js/config.js의 FAMILY_EMAIL과 같아야 한다.

-- 가족 공용 계정인지 확인 (모든 권한 검사의 기준)
create function public.is_family() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'family@example.com'
$$;

-- 사진 용량 상한: 900MB (무료 1GB, 휴지통 포함)
create function public.photo_limit() returns bigint
language sql immutable as $$ select 900::bigint * 1024 * 1024 $$;

create table public.events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('trip', 'gathering')),
  title text not null check (length(trim(title)) > 0),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  destination text not null default '',
  stay text not null default '',
  people int check (people > 0),
  days jsonb not null default '[]',
  cover_photo_id bigint,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events on delete cascade,
  grp text not null,
  text text not null,
  memo text not null default '',
  position int not null default 0,
  checked boolean not null default false,
  unique (event_id, grp, text)
);

create table public.photos (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events on delete cascade,
  path text not null unique,          -- 저장소: full/{path}.jpg, thumb/{path}.jpg
  taken_at timestamp not null,        -- 촬영 시각(현지 시각), 없으면 올린 시각
  caption text not null default '',
  uploader text not null default '',
  width int not null,
  height int not null,
  bytes bigint not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.events
  add foreign key (cover_photo_id) references public.photos on delete set null;

create table public.notes (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events on delete cascade,
  author text not null default '',
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index on public.photos (event_id, taken_at);
create index on public.photos (deleted_at) where deleted_at is not null;
create index on public.events (deleted_at) where deleted_at is not null;
create index on public.checklist_items (event_id);
create index on public.notes (event_id);

-- 홈·상세용: 지우지 않은 모임 + 대표 사진(지정 없으면 첫 사진) + 사진 수
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

-- 권한: 가족 계정만
alter table public.events enable row level security;
alter table public.checklist_items enable row level security;
alter table public.photos enable row level security;
alter table public.notes enable row level security;
create policy family on public.events for all to authenticated using (public.is_family()) with check (public.is_family());
create policy family on public.checklist_items for all to authenticated using (public.is_family()) with check (public.is_family());
create policy family on public.photos for all to authenticated using (public.is_family()) with check (public.is_family());
create policy family on public.notes for all to authenticated using (public.is_family()) with check (public.is_family());

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- 계획 저장: p_event_id가 null이면 새 여행을 만든다.
-- 일정은 통째로 바꾸고, 준비물은 그룹+이름이 같으면 체크 상태를 유지한다.
create function public.save_plan(p_event_id bigint, p_plan jsonb) returns bigint
language plpgsql set search_path = '' as $$
declare
  t jsonb := p_plan -> 'trip';
  v_id bigint;
  items jsonb := coalesce(p_plan -> 'checklist', '[]');
begin
  if p_event_id is null then
    insert into public.events (kind, title, start_date, end_date, destination, stay, people, days)
    values ('trip', t ->> 'title', (t ->> 'startDate')::date, nullif(t ->> 'endDate', '')::date,
            coalesce(t ->> 'destination', ''), coalesce(t ->> 'stay', ''),
            nullif(t ->> 'people', '')::int, coalesce(p_plan -> 'days', '[]'))
    returning id into v_id;
  else
    update public.events set
      title = t ->> 'title',
      start_date = (t ->> 'startDate')::date,
      end_date = nullif(t ->> 'endDate', '')::date,
      destination = coalesce(t ->> 'destination', ''),
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

-- 모임 휴지통: 모임과 아직 안 지운 사진을 같은 시각으로 표시
create function public.trash_event(p_id bigint) returns void
language sql set search_path = '' as $$
  update public.photos set deleted_at = now() where event_id = p_id and deleted_at is null;
  update public.events set deleted_at = now() where id = p_id;
$$;

-- 모임 되살리기: 그 모임과 함께 지워진 사진만 되살린다
create function public.restore_event(p_id bigint) returns void
language sql set search_path = '' as $$
  update public.photos p set deleted_at = null
  from public.events e
  where e.id = p_id and p.event_id = p_id and p.deleted_at = e.deleted_at;
  update public.events set deleted_at = null where id = p_id;
$$;

-- 사진 총 용량(휴지통 포함)
create function public.photo_usage() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)
  from storage.objects where bucket_id = 'photos'
$$;

-- 자동 깨우기용 (로그인 없이 호출 가능, 데이터는 읽지 않음)
create function public.ping() returns int language sql as $$ select 1 $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ping() to anon;

-- 사진 저장소: 비공개, JPEG만, 파일당 5MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create policy family_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_family());
create policy family_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_family());
-- 새 파일이 들어와도 상한을 넘지 않도록 파일 최대 크기(5MB)만큼 여유를 둔다
create policy family_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_family()
              and public.photo_usage() + 5242880 <= public.photo_limit());
