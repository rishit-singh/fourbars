-- Run in Supabase SQL Editor. Also upgrades the original flat-column starter.
begin;
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'Untitled melody' check (char_length(btrim(title)) between 1 and 80),
 bpm integer not null default 120 check (bpm between 40 and 240),
 key text not null default 'C',
 instrument text not null default 'piano' check (instrument in ('piano','bass','drums')),
 notes jsonb not null default '[]'::jsonb,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 published_at timestamptz
);

-- Public rows contain only explicitly published snapshots, never draft columns.
create table if not exists public.publications (
 id uuid primary key references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 composition jsonb not null,
 published_at timestamptz not null default now(),
 version integer not null default 1
);

create index if not exists publications_feed on public.publications (published_at desc, id desc);
create index if not exists projects_owner_cursor on public.projects (user_id, updated_at desc, id desc);

create or replace function public.valid_composition(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n jsonb;
begin
 if jsonb_typeof(c) <> 'object'
   or jsonb_typeof(c->'bpm') is distinct from 'number'
   or (c->>'bpm')::numeric not between 40 and 240
   or (c->>'bpm')::numeric <> trunc((c->>'bpm')::numeric)
   or jsonb_typeof(c->'key') is distinct from 'string'
   or char_length(c->>'key') not between 1 and 8
   or coalesce(c->>'instrument','') not in ('piano','bass','drums')
   or jsonb_typeof(c->'notes') is distinct from 'array' then return false; end if;
 if jsonb_array_length(c->'notes') > 512 then return false; end if;
 for n in select value from jsonb_array_elements(c->'notes') loop
   if jsonb_typeof(n) <> 'object'
     or jsonb_typeof(n->'id') is distinct from 'string'
     or char_length(n->>'id') not between 1 and 100
     or jsonb_typeof(n->'pitch') is distinct from 'number'
     or jsonb_typeof(n->'start') is distinct from 'number'
     or jsonb_typeof(n->'duration') is distinct from 'number'
     or jsonb_typeof(n->'velocity') is distinct from 'number' then return false; end if;
   if (n->>'pitch')::numeric not between 0 and 127
     or (n->>'pitch')::numeric <> trunc((n->>'pitch')::numeric)
     or (n->>'velocity')::numeric not between 1 and 127
     or (n->>'velocity')::numeric <> trunc((n->>'velocity')::numeric)
     or (n->>'start')::numeric < 0 or (n->>'start')::numeric >= 16
     or (n->>'duration')::numeric <= 0
     or (n->>'start')::numeric + (n->>'duration')::numeric > 16 then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create or replace function public.validate_project() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.title := btrim(new.title);
 if char_length(new.title) not between 1 and 80 or not public.valid_composition(
   jsonb_build_object('bpm',new.bpm,'key',new.key,'instrument',new.instrument,'notes',new.notes)
 ) then raise exception 'Invalid title or composition' using errcode = '22023'; end if;
 new.updated_at := clock_timestamp();
 return new;
end $$;
drop trigger if exists projects_validate on public.projects;
create trigger projects_validate before insert or update on public.projects
for each row execute function public.validate_project();

alter table public.projects enable row level security;
alter table public.publications enable row level security;
drop policy if exists "public read published or owner" on public.projects;
drop policy if exists "owners read" on public.projects;
drop policy if exists "owners insert" on public.projects;
drop policy if exists "owners update" on public.projects;
drop policy if exists "owners delete" on public.projects;
create policy "owners read" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners insert" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "public snapshots" on public.publications;
create policy "public snapshots" on public.publications for select to anon, authenticated using (true);
revoke all on public.projects from anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert (user_id, title, bpm, key, instrument, notes) on public.projects to authenticated;
grant update (title, bpm, key, instrument, notes) on public.projects to authenticated;
revoke all on public.publications from anon, authenticated;
grant select on public.publications to anon, authenticated;

-- The row lock makes the saved draft -> public snapshot copy atomic.
create or replace function public.publish_project(project_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects; c jsonb;
begin
 select * into p from public.projects where id = project_id and user_id = auth.uid() for update;
 if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
 c := jsonb_build_object('bpm',p.bpm,'key',p.key,'instrument',p.instrument,'notes',p.notes);
 if not public.valid_composition(c) or jsonb_array_length(p.notes) = 0 then
   raise exception 'Add valid notes before publishing' using errcode = '22023';
 end if;
 insert into public.publications (id,user_id,title,composition,published_at)
 values (p.id,p.user_id,p.title,c,clock_timestamp())
 on conflict (id) do update set title = excluded.title, composition = excluded.composition,
 published_at = excluded.published_at, version = public.publications.version + 1;
 update public.projects set published = true, published_at = clock_timestamp() where id = p.id;
end $$;
create or replace function public.unpublish_project(project_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.projects where id = project_id and user_id = auth.uid() for update;
 if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
 delete from public.publications where id = project_id;
 update public.projects set published = false, published_at = null where id = project_id;
end $$;
revoke all on function public.publish_project(uuid) from public, anon;
revoke all on function public.unpublish_project(uuid) from public, anon;
grant execute on function public.publish_project(uuid) to authenticated;
grant execute on function public.unpublish_project(uuid) to authenticated;

-- Preserve any existing starter publications once; future saves cannot update them.
insert into public.publications (id,user_id,title,composition,published_at)
select id,user_id,title,jsonb_build_object('bpm',bpm,'key',key,'instrument',instrument,'notes',notes),coalesce(published_at,created_at)
from public.projects where published and jsonb_array_length(notes) > 0
on conflict (id) do nothing;

-- Profiles deliberately contain public identity only, never auth metadata or emails.
-- Existing users can create a profile when they next visit account settings.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 60)
);
alter table public.profiles enable row level security;
drop policy if exists "public profile fields" on public.profiles;
drop policy if exists "owners create profile" on public.profiles;
drop policy if exists "owners edit profile" on public.profiles;
create policy "public profile fields" on public.profiles for select to anon, authenticated using (true);
create policy "owners create profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "owners edit profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
revoke all on public.profiles from anon, authenticated;
grant select (id,username,display_name) on public.profiles to anon, authenticated;
-- PostgREST upserts include id in their UPDATE list; WITH CHECK prevents changing it.
grant insert (id,username,display_name), update (id,username,display_name) on public.profiles to authenticated;

create table if not exists public.publication_likes (
 publication_id uuid not null references public.publications(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key (publication_id,user_id)
);
create index if not exists publication_likes_user on public.publication_likes (user_id,publication_id);
alter table public.publication_likes enable row level security;
drop policy if exists "owners read likes" on public.publication_likes;
drop policy if exists "owners add likes" on public.publication_likes;
drop policy if exists "owners remove likes" on public.publication_likes;
create policy "owners read likes" on public.publication_likes for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners add likes" on public.publication_likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners remove likes" on public.publication_likes for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.publication_likes from anon, authenticated;
-- Anonymous SELECT sees zero rows through RLS, allowing the same feed view for everyone.
grant select on public.publication_likes to anon, authenticated;
grant insert (publication_id,user_id), delete on public.publication_likes to authenticated;

-- Only the aggregate is public: individual likers remain private via RLS above.
-- The fixed search path and qualified objects prevent search-path hijacking.
create or replace function public.publication_like_count(publication_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
 select count(*) from public.publication_likes l
 join public.publications p on p.id = l.publication_id
 where l.publication_id = $1
$$;
revoke all on function public.publication_like_count(uuid) from public;
grant execute on function public.publication_like_count(uuid) to anon, authenticated;

-- Security-invoker views retain base-table RLS. In particular no public draft read
-- is introduced, and a feed page needs only one request (no per-row profile queries).
create or replace view public.publication_details with (security_invoker = true) as
select p.id, p.user_id, p.title, p.composition, p.published_at, p.version,
 coalesce(pr.display_name, 'Anonymous') as creator_name,
 public.publication_like_count(p.id) as like_count,
 exists(select 1 from public.publication_likes l where l.publication_id = p.id and l.user_id = (select auth.uid())) as liked_by_me,
 'published'::text as publication_status
from public.publications p left join public.profiles pr on pr.id = p.user_id;

create or replace view public.project_details with (security_invoker = true) as
select p.id, p.user_id, p.title, p.bpm, p.key, p.instrument, p.notes,
 (pub.id is not null) as published, p.created_at, p.updated_at, pub.published_at,
 coalesce(pr.display_name, 'Anonymous') as creator_name,
 public.publication_like_count(p.id) as like_count,
 exists(select 1 from public.publication_likes l where l.publication_id = p.id and l.user_id = (select auth.uid())) as liked_by_me,
 case when pub.id is null then 'draft'
      when p.title = pub.title and
        jsonb_build_object('bpm',p.bpm,'key',p.key,'instrument',p.instrument,'notes',p.notes) = pub.composition
      then 'published' else 'changed' end as publication_status
from public.projects p
left join public.publications pub on pub.id = p.id
left join public.profiles pr on pr.id = p.user_id;
revoke all on public.publication_details, public.project_details from anon, authenticated;
grant select on public.publication_details to anon, authenticated;
grant select on public.project_details to authenticated;
commit;
