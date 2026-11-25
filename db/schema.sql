-- Actualize crews: one database for every city. Run it in the Supabase SQL editor (Postgres 15 or later).
-- Safe to run again.
--
-- Who can do what
--   men         never sign in and never give an email. They answer through their dinner's table QR code or
--               their own private link. A link shows a man his own answers over time only on the one phone he
--               chose to be remembered on; anywhere else it only takes answers.
--   anchors     sign in with an email code and see their own crew: who came, whether each man did the weekly
--               check-in (never what he said), each man's commitments and whether he kept them, totals, and a
--               man's scores and what he brought only where he chose to share them with his anchor.
--   city leads  sign in with an email code and see counts for every crew in their city, and a man's own answers
--               only where he chose to share them with Actualize.
-- Totals and averages need three or more answers. Emails, link keys, table codes and answers can't be read from the tables
-- by any page. Everything goes through the functions further down, which check who is asking.

-- ---------- tables ----------
create table if not exists public.cities (
  id   text primary key,
  name text not null,
  tz   text not null default 'America/Vancouver'          -- for weekly check-ins and dinner times
);

create table if not exists public.crews (
  id      text primary key,
  city_id text not null references public.cities(id),
  name    text not null,
  area    text
);

create table if not exists public.people (
  id         text primary key,                             -- short and stable, such as 'ben'
  city_id    text not null references public.cities(id),
  crew_id    text references public.crews(id),              -- empty for city leads
  first_name text not null,
  role       text not null default 'member' check (role in ('member', 'anchor', 'city')),
  email      text check (email = lower(email)),             -- anchors and city leads only
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (role = 'city' or crew_id is not null),
  check (role <> 'member' or email is null)                 -- men never give an email
);
create unique index if not exists people_email_key on public.people (email) where email is not null;
-- When he was last on Circle, as his anchor saw on his Circle profile, and when the anchor looked. One signal in the
-- anchor's drift check; likes and comments can join it once Circle's own figures are shared.
alter table public.people add column if not exists circle_seen_on date;
alter table public.people add column if not exists circle_checked_at timestamptz;

-- A man's private link. Only a fingerprint of the key is kept, so nobody can read a key back from here.
create table if not exists public.links (
  person_id text primary key references public.people(id),
  key_hash  bytea not null unique,
  issued_at timestamptz not null default now(),
  issued_by text references public.people(id),
  used_at   timestamptz
);
-- The phone a man chose to be remembered on. Only a fingerprint of that phone's own secret is kept.
alter table public.links add column if not exists device_hash bytea;
alter table public.links add column if not exists paired_at timestamptz;

create table if not exists public.dinners (
  key        text primary key,                             -- such as 'bb2'
  crew_id    text not null references public.crews(id),
  n          int  not null,
  job        text not null,                                -- Set, Check, Close
  starts_at  timestamptz,
  ends_at    timestamptz,
  host_id    text references public.people(id),
  table_code text not null default replace(gen_random_uuid()::text, '-', '') unique,   -- goes in the table QR link
  unique (crew_id, n)
);

-- Nine areas of life, each scored 1 to 5.
create or replace function public.valid_scores(s jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(s) = 'object' and not exists (
    select 1 from jsonb_each(s) e
    where e.key not in ('money', 'career', 'health', 'fun', 'environment', 'community', 'family', 'partner', 'growth')
       or jsonb_typeof(e.value) <> 'number'
       or (e.value)::text not in ('1', '2', '3', '4', '5'))
$$;

create table if not exists public.checkins (
  dinner_key   text not null references public.dinners(key),
  person_id    text not null references public.people(id),
  scores       jsonb not null default '{}'::jsonb check (public.valid_scores(scores)),
  problem      text,
  problem_area text,
  commitment   text,
  by_when      text,
  offer        text,
  share        text not null default 'none' check (share in ('none', 'anchor', 'city')),   -- his choice
  kept         boolean,
  kept_at      timestamptz,
  arrived_at   timestamptz,
  closed_at    timestamptz,
  via          text check (via in ('link', 'table', 'import')),
  updated_at   timestamptz not null default now(),
  primary key (dinner_key, person_id)
);
-- At the close each man rates how useful the night was, 1 to 5. Only ever shown as an average of three or more.
alter table public.checkins add column if not exists useful smallint check (useful between 1 and 5);

create table if not exists public.pulses (
  week       date not null check (extract(isodow from week) = 1),   -- the Monday of the week
  person_id  text not null references public.people(id),
  scores     jsonb not null check (public.valid_scores(scores)),
  updated_at timestamptz not null default now(),
  primary key (week, person_id)
);

-- What the crew page shows from Circle: offers, interests and shared ground, one document per crew.
create table if not exists public.crew_profiles (
  crew_id    text primary key references public.crews(id),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- who is signed in ----------
-- Only anchors and city leads sign in. These find the person behind the signed-in email.
create or replace function public.my_person_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.people
  where active and role in ('anchor', 'city') and email = lower(nullif(auth.jwt() ->> 'email', '')) limit 1
$$;
create or replace function public.my_crew_id() returns text
language sql stable security definer set search_path = public as $$
  select crew_id from public.people
  where active and role in ('anchor', 'city') and email = lower(nullif(auth.jwt() ->> 'email', '')) limit 1
$$;
create or replace function public.my_city_id() returns text
language sql stable security definer set search_path = public as $$
  select city_id from public.people
  where active and role in ('anchor', 'city') and email = lower(nullif(auth.jwt() ->> 'email', '')) limit 1
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.people
  where active and role in ('anchor', 'city') and email = lower(nullif(auth.jwt() ->> 'email', '')) limit 1
$$;
-- The policies run these as the signed-in person. Granted here, so the schema works whatever defaults the project has.
revoke execute on function public.my_person_id(), public.my_crew_id(), public.my_city_id(), public.my_role() from public, anon;
grant execute on function public.my_person_id(), public.my_crew_id(), public.my_city_id(), public.my_role() to authenticated;

-- ---------- row level security ----------
alter table public.cities        enable row level security;
alter table public.crews         enable row level security;
alter table public.people        enable row level security;
alter table public.links         enable row level security;
alter table public.dinners       enable row level security;
alter table public.checkins      enable row level security;
alter table public.pulses        enable row level security;
alter table public.crew_profiles enable row level security;

drop policy if exists cities_read on public.cities;
create policy cities_read on public.cities for select to authenticated
  using (id = (select public.my_city_id()));

drop policy if exists crews_read on public.crews;
create policy crews_read on public.crews for select to authenticated
  using (id = (select public.my_crew_id())
         or ((select public.my_role()) = 'city' and city_id = (select public.my_city_id())));

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (crew_id = (select public.my_crew_id())
         or ((select public.my_role()) = 'city' and city_id = (select public.my_city_id())));

drop policy if exists dinners_read on public.dinners;
create policy dinners_read on public.dinners for select to authenticated
  using (crew_id = (select public.my_crew_id())
         or ((select public.my_role()) = 'city'
             and exists (select 1 from public.crews c where c.id = dinners.crew_id and c.city_id = (select public.my_city_id()))));

drop policy if exists profiles_read on public.crew_profiles;
create policy profiles_read on public.crew_profiles for select to authenticated
  using (crew_id = (select public.my_crew_id())
         or ((select public.my_role()) = 'city'
             and exists (select 1 from public.crews c where c.id = crew_profiles.crew_id and c.city_id = (select public.my_city_id()))));

-- links, checkins and pulses have no read policy: nobody reads them directly, only through the functions below.
revoke all on public.cities, public.crews, public.people, public.links, public.dinners, public.checkins,
              public.pulses, public.crew_profiles from anon, authenticated;
grant select on public.cities, public.crews, public.crew_profiles to authenticated;
grant select (id, city_id, crew_id, first_name, role, active) on public.people to authenticated;
grant select (key, crew_id, n, job, starts_at, ends_at, host_id) on public.dinners to authenticated;

-- ---------- shared pieces, used only inside the functions below ----------
-- A dinner takes answers from three hours before it starts until a day after it ends.
create or replace function public.dinner_is_open(d public.dinners) returns boolean
language sql stable set search_path = public as $$
  select d.starts_at is not null and d.ends_at is not null
     and now() between d.starts_at - interval '3 hours' and d.ends_at + interval '24 hours'
$$;

-- The man behind a private link, or nobody.
create or replace function public.link_person(p_key text) returns public.people
language sql stable security definer set search_path = public as $$
  select p.* from public.links l join public.people p on p.id = l.person_id
  where l.key_hash = sha256(convert_to(coalesce(p_key, ''), 'UTF8')) and p.active and p.role in ('member', 'anchor')
$$;

-- Saves arrival or closing answers. Times come from the server, not the phone.
create or replace function public.save_answers(p_dinner text, p_person text, p_stage text, p jsonb, p_via text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  choice text := lower(coalesce(p ->> 'share', ''));
begin
  if p_stage = 'arrive' then
    insert into public.checkins as c (dinner_key, person_id, scores, problem, problem_area, arrived_at, via, updated_at)
    values (p_dinner, p_person, coalesce(p -> 'scores', '{}'::jsonb), left(nullif(trim(p ->> 'problem'), ''), 500),
            left(nullif(trim(p ->> 'area'), ''), 40), now(), p_via, now())
    on conflict (dinner_key, person_id) do update
      set scores = excluded.scores, problem = excluded.problem, problem_area = excluded.problem_area,
          arrived_at = coalesce(c.arrived_at, excluded.arrived_at), via = excluded.via, updated_at = now();
  elsif p_stage = 'close' then
    if choice not in ('none', 'anchor', 'city') then choice := 'none'; end if;
    if coalesce(trim(p ->> 'useful'), '') !~ '^[1-5]?$' then
      raise exception 'how useful tonight was must be 1 to 5' using errcode = '22023';
    end if;
    insert into public.checkins as c (dinner_key, person_id, commitment, by_when, offer, share, useful, closed_at, via, updated_at)
    values (p_dinner, p_person, left(nullif(trim(p ->> 'commitment'), ''), 500), left(nullif(trim(p ->> 'by_when'), ''), 60),
            left(nullif(trim(p ->> 'offer'), ''), 300), choice, nullif(trim(p ->> 'useful'), '')::smallint, now(), p_via, now())
    on conflict (dinner_key, person_id) do update
      set commitment = excluded.commitment, by_when = excluded.by_when, offer = excluded.offer, share = excluded.share,
          useful = coalesce(excluded.useful, c.useful),
          closed_at = coalesce(c.closed_at, excluded.closed_at), via = excluded.via, updated_at = now();
  else
    raise exception 'unknown stage' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'stage', p_stage);
end $$;

-- The crew's averages for one dinner, area by area, once three or more men have checked in.
create or replace function public.dinner_averages(p_dinner text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('count', a.n, 'averages', case when a.n >= 3 then b.avgs end)
  from (select count(*)::int as n from public.checkins c where c.dinner_key = p_dinner and c.arrived_at is not null) a,
       lateral (select jsonb_object_agg(k, v) as avgs from (
         select e.key as k, round(avg((e.value)::text::numeric), 1) as v
         from public.checkins c, jsonb_each(c.scores) e
         where c.dinner_key = p_dinner and c.arrived_at is not null
         group by e.key having count(*) >= 3) s) b
$$;

-- The crew's averages for one week of check-ins, the same way.
create or replace function public.week_averages(p_crew text, p_week date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('count', a.n, 'averages', case when a.n >= 3 then b.avgs end)
  from (select count(*)::int as n from public.pulses pl join public.people p on p.id = pl.person_id
        where p.crew_id = p_crew and pl.week = p_week) a,
       lateral (select jsonb_object_agg(k, v) as avgs from (
         select e.key as k, round(avg((e.value)::text::numeric), 1) as v
         from public.pulses pl join public.people p on p.id = pl.person_id cross join lateral jsonb_each(pl.scores) e
         where p.crew_id = p_crew and pl.week = p_week
         group by e.key having count(*) >= 3) s) b
$$;

revoke execute on function public.valid_scores(jsonb), public.dinner_is_open(public.dinners), public.link_person(text),
  public.save_answers(text, text, text, jsonb, text), public.dinner_averages(text), public.week_averages(text, date)
  from public, anon, authenticated;

-- ---------- for the men: private links and the table QR code ----------
-- What a private link may know: his first name, his crew, and what's open to answer. Never his answers.
create or replace function public.link_open(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me     public.people := public.link_person(p_key);
  d      public.dinners;
  k      public.checkins;
  last_d public.dinners;
  wk     date;
begin
  if me.id is null then return null; end if;
  wk := date_trunc('week', now() at time zone (select tz from public.cities where id = me.city_id))::date;
  select x.* into d from public.dinners x
  where x.crew_id = me.crew_id and public.dinner_is_open(x) order by x.starts_at limit 1;
  if d.key is not null then
    select c.* into k from public.checkins c where c.dinner_key = d.key and c.person_id = me.id;
  end if;
  select x.* into last_d from public.dinners x
  join public.checkins c on c.dinner_key = x.key and c.person_id = me.id
  where x.crew_id = me.crew_id and x.ends_at < now() and c.commitment is not null and c.kept is null
  order by x.ends_at desc limit 1;
  return jsonb_build_object(
    'first_name', me.first_name,
    'crew', (select name from public.crews where id = me.crew_id),
    'tz', (select tz from public.cities where id = me.city_id),
    'anchor', (select first_name from public.people where crew_id = me.crew_id and role = 'anchor' and active
               order by created_at limit 1),
    'city_lead', (select first_name from public.people where city_id = me.city_id and role = 'city' and active
                  order by created_at limit 1),
    'dinner', case when d.key is null then null else jsonb_build_object(
        'key', d.key, 'n', d.n, 'job', d.job, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
        'arrived', k.arrived_at is not null, 'closed', k.closed_at is not null) end,
    'next_dinner', (select jsonb_build_object('n', x.n, 'job', x.job, 'starts_at', x.starts_at)
                    from public.dinners x where x.crew_id = me.crew_id and x.starts_at > now()
                    and not public.dinner_is_open(x) order by x.starts_at limit 1),
    'kept_ask', case when last_d.key is null then null else jsonb_build_object('key', last_d.key, 'n', last_d.n) end,
    'pulse_week', wk,
    -- A week he checked in at a dinner counts as done: nobody is asked twice in one week.
    'pulse_done', exists (select 1 from public.pulses where week = wk and person_id = me.id)
      or exists (select 1 from public.checkins c join public.dinners x on x.key = c.dinner_key
                 where c.person_id = me.id and c.arrived_at is not null
                   and date_trunc('week', x.starts_at at time zone (select tz from public.cities where id = me.city_id))::date = wk));
end $$;

create or replace function public.link_checkin(p_key text, p_dinner text, p_stage text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.link_person(p_key);
  d  public.dinners;
begin
  if me.id is null then raise exception 'this link is not active' using errcode = '42501'; end if;
  select x.* into d from public.dinners x where x.key = p_dinner and x.crew_id = me.crew_id;
  if d.key is null or not public.dinner_is_open(d) then
    raise exception 'this dinner is not open for check-in' using errcode = '42501';
  end if;
  update public.links set used_at = now() where person_id = me.id;
  return public.save_answers(d.key, me.id, p_stage, p, 'link');
end $$;

-- After a dinner, a man marks the commitment he made there as kept, or not yet.
create or replace function public.link_kept(p_key text, p_dinner text, p_kept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.link_person(p_key);
begin
  if me.id is null then raise exception 'this link is not active' using errcode = '42501'; end if;
  update public.checkins c set kept = p_kept, kept_at = now(), updated_at = now()
  from public.dinners d
  where d.key = c.dinner_key and c.dinner_key = p_dinner and c.person_id = me.id
    and d.crew_id = me.crew_id and d.ends_at < now() and c.commitment is not null;
  if not found then raise exception 'there is no commitment to mark' using errcode = 'P0002'; end if;
  update public.links set used_at = now() where person_id = me.id;
  return jsonb_build_object('ok', true, 'kept', p_kept);
end $$;

-- The weekly check-in: the same nine areas, once a week.
create or replace function public.link_pulse(p_key text, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.link_person(p_key);
  wk date;
begin
  if me.id is null then raise exception 'this link is not active' using errcode = '42501'; end if;
  wk := date_trunc('week', now() at time zone (select tz from public.cities where id = me.city_id))::date;
  insert into public.pulses as pl (week, person_id, scores, updated_at) values (wk, me.id, p_scores, now())
  on conflict (week, person_id) do update set scores = excluded.scores, updated_at = now();
  update public.links set used_at = now() where person_id = me.id;
  return jsonb_build_object('ok', true, 'week', wk);
end $$;

-- A man asks to be remembered on this phone. The first phone he says yes on keeps it, until his anchor makes him
-- a new link. The phone keeps its own secret; only a fingerprint of it is kept here.
create or replace function public.link_pair(p_key text, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.link_person(p_key);
  h  bytea;
  l  public.links;
begin
  if me.id is null then raise exception 'this link is not active' using errcode = '42501'; end if;
  if length(coalesce(p_device, '')) < 32 then raise exception 'that phone code is too short' using errcode = '22023'; end if;
  h := sha256(convert_to(p_device, 'UTF8'));
  select x.* into l from public.links x where x.person_id = me.id for update;
  if l.device_hash is null then
    update public.links set device_hash = h, paired_at = now(), used_at = now() where person_id = me.id;
    return jsonb_build_object('paired', true, 'state', 'new');
  elsif l.device_hash = h then
    return jsonb_build_object('paired', true, 'state', 'this');
  end if;
  return jsonb_build_object('paired', false, 'state', 'other');
end $$;

-- His own space. On the phone he chose: his answers over time and the crew's averages. Anywhere else: only the
-- dinners, so a forwarded link never shows his answers.
create or replace function public.link_space(p_key text, p_device text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me    public.people := public.link_person(p_key);
  l     public.links;
  state text;
begin
  if me.id is null then return null; end if;
  select x.* into l from public.links x where x.person_id = me.id;
  state := case when l.device_hash is null then 'none'
                when p_device is not null and l.device_hash = sha256(convert_to(p_device, 'UTF8')) then 'this'
                else 'other' end;
  return jsonb_build_object(
    'first_name', me.first_name,
    'crew', (select name from public.crews where id = me.crew_id),
    'anchor', (select first_name from public.people where crew_id = me.crew_id and role = 'anchor' and active
               order by created_at limit 1),
    'tz', (select tz from public.cities where id = me.city_id),
    'phone', state,
    'dinners', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'n', d.n, 'job', d.job, 'starts_at', d.starts_at,
                   'ends_at', d.ends_at, 'open', public.dinner_is_open(d),
                   'host', (select h.first_name from public.people h where h.id = d.host_id)) order by d.n)
                 from public.dinners d where d.crew_id = me.crew_id), '[]'::jsonb),
    'mine', case when state = 'this' then jsonb_build_object(
      'checkins', coalesce((select jsonb_agg(jsonb_build_object('dinner', c.dinner_key, 'n', d.n, 'scores', c.scores,
                     'problem', c.problem, 'area', c.problem_area, 'commitment', c.commitment, 'by_when', c.by_when,
                     'kept', c.kept, 'share', c.share, 'arrived', c.arrived_at is not null, 'closed', c.closed_at is not null)
                     order by d.n)
                   from public.checkins c join public.dinners d on d.key = c.dinner_key
                   where c.person_id = me.id and d.crew_id = me.crew_id), '[]'::jsonb),
      'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', pl.week, 'scores', pl.scores) order by pl.week)
                 from public.pulses pl where pl.person_id = me.id and pl.week >= current_date - 182), '[]'::jsonb)) end,
    'crew_picture', case when state = 'this' then jsonb_build_object(
      'dinners', coalesce((select jsonb_agg(jsonb_build_object('dinner', d.key, 'n', d.n) || public.dinner_averages(d.key) order by d.n)
                   from public.dinners d where d.crew_id = me.crew_id and d.starts_at - interval '3 hours' < now()), '[]'::jsonb),
      'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w.week) || public.week_averages(me.crew_id, w.week) order by w.week)
                 from (select distinct pl.week from public.pulses pl join public.people p on p.id = pl.person_id
                       where p.crew_id = me.crew_id and pl.week >= current_date - 182) w), '[]'::jsonb)) end);
end $$;

-- Right after he answers, something back: the crew's averages for that dinner, or for this week when p_dinner is
-- empty, once three or more have answered. Only for a man who has answered it himself.
create or replace function public.link_crew_now(p_key text, p_dinner text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.people := public.link_person(p_key);
  wk date;
begin
  if me.id is null then return null; end if;
  if p_dinner is null then
    wk := date_trunc('week', now() at time zone (select tz from public.cities where id = me.city_id))::date;
    if not exists (select 1 from public.pulses where week = wk and person_id = me.id) then return null; end if;
    return public.week_averages(me.crew_id, wk);
  end if;
  if not exists (select 1 from public.checkins c join public.dinners d on d.key = c.dinner_key
                 where c.dinner_key = p_dinner and c.person_id = me.id and c.arrived_at is not null
                   and d.crew_id = me.crew_id) then
    return null;
  end if;
  return public.dinner_averages(p_dinner);
end $$;

-- The table QR code: the crew's first names, while the dinner is open.
create or replace function public.table_open(p_dinner text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d public.dinners;
begin
  select x.* into d from public.dinners x where x.key = p_dinner and x.table_code = p_code;
  if d.key is null or not public.dinner_is_open(d) then return null; end if;
  return jsonb_build_object(
    'dinner', jsonb_build_object('key', d.key, 'n', d.n, 'job', d.job, 'starts_at', d.starts_at, 'ends_at', d.ends_at),
    'crew', (select name from public.crews where id = d.crew_id),
    'tz', (select ci.tz from public.crews c join public.cities ci on ci.id = c.city_id where c.id = d.crew_id),
    'anchor', (select first_name from public.people where crew_id = d.crew_id and role = 'anchor' and active
               order by created_at limit 1),
    'city_lead', (select p.first_name from public.people p join public.crews c on c.city_id = p.city_id
                  where c.id = d.crew_id and p.role = 'city' and p.active order by p.created_at limit 1),
    'men', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name) order by p.first_name)
                     from public.people p
                     where p.crew_id = d.crew_id and p.active and p.role in ('member', 'anchor')), '[]'::jsonb));
end $$;

create or replace function public.table_checkin(p_dinner text, p_code text, p_person text, p_stage text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.dinners;
begin
  select x.* into d from public.dinners x where x.key = p_dinner and x.table_code = p_code;
  if d.key is null or not public.dinner_is_open(d) then
    raise exception 'this dinner is not open for check-in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.people p where p.id = p_person and p.crew_id = d.crew_id and p.active
                 and p.role in ('member', 'anchor')) then
    raise exception 'that name is not on this crew' using errcode = '42501';
  end if;
  return public.save_answers(d.key, p_person, p_stage, p, 'table');
end $$;

-- The same something back at the table, for a man who has checked in there.
create or replace function public.table_crew_now(p_dinner text, p_code text, p_person text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d public.dinners;
begin
  select x.* into d from public.dinners x where x.key = p_dinner and x.table_code = p_code;
  if d.key is null or not public.dinner_is_open(d) then return null; end if;
  if not exists (select 1 from public.checkins c where c.dinner_key = d.key and c.person_id = p_person and c.arrived_at is not null) then
    return null;
  end if;
  return public.dinner_averages(d.key);
end $$;

-- For the keep-awake job on the free plan.
create or replace function public.ping() returns text language sql stable set search_path = public as $$ select 'ok'::text $$;

-- ---------- for anchors ----------
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'role', p.role, 'crew_id', p.crew_id,
                            'crew_name', c.name, 'city_id', p.city_id, 'city_name', ci.name, 'tz', ci.tz)
  from public.people p left join public.crews c on c.id = p.crew_id join public.cities ci on ci.id = p.city_id
  where p.id = public.my_person_id()
$$;

create or replace function public.anchor_crew() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  crew text := public.my_crew_id();
begin
  if public.my_role() is distinct from 'anchor' then return null; end if;
  return jsonb_build_object(
    'crew', (select jsonb_build_object('id', c.id, 'name', c.name, 'area', c.area, 'city', ci.name, 'tz', ci.tz)
             from public.crews c join public.cities ci on ci.id = c.city_id where c.id = crew),
    'men', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'role', p.role,
                       'active', p.active, 'link_issued_at', l.issued_at, 'link_used_at', l.used_at)
                       order by p.active desc, p.first_name)
                     from public.people p left join public.links l on l.person_id = p.id
                     where p.crew_id = crew), '[]'::jsonb),
    'dinners', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'n', d.n, 'job', d.job,
                       'starts_at', d.starts_at, 'ends_at', d.ends_at, 'host_id', d.host_id,
                       'table_code', d.table_code, 'open', public.dinner_is_open(d)) order by d.n)
                     from public.dinners d where d.crew_id = crew), '[]'::jsonb));
end $$;

-- New private links for some of the crew. Each key is shown once, here, and any older link stops working.
create or replace function public.issue_links(p_people text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  crew text := public.my_crew_id();
  me   text := public.my_person_id();
  r    record;
  k    text;
  issued jsonb := '[]'::jsonb;
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor issues links' using errcode = '42501'; end if;
  for r in select p.id, p.first_name from public.people p
           where p.id = any(p_people) and p.crew_id = crew and p.active and p.role in ('member', 'anchor')
           order by p.first_name loop
    k := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.links (person_id, key_hash, issued_at, issued_by, used_at)
    values (r.id, sha256(convert_to(k, 'UTF8')), now(), me, null)
    on conflict (person_id) do update
      set key_hash = excluded.key_hash, issued_at = now(), issued_by = me, used_at = null, device_hash = null, paired_at = null;
    issued := issued || jsonb_build_array(jsonb_build_object('id', r.id, 'first_name', r.first_name, 'key', k));
  end loop;
  return issued;
end $$;

-- A fresh table code for a dinner, if a QR card has gone astray. The old code stops working.
create or replace function public.new_table_code(p_dinner text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor can do this' using errcode = '42501'; end if;
  update public.dinners set table_code = replace(gen_random_uuid()::text, '-', '')
  where key = p_dinner and crew_id = public.my_crew_id() returning table_code into c;
  if c is null then raise exception 'not a dinner of your crew' using errcode = '42501'; end if;
  return c;
end $$;

-- Sets a dinner's date, time and host.
create or replace function public.save_dinner(p_dinner text, p_starts_at timestamptz, p_ends_at timestamptz, p_host text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor can do this' using errcode = '42501'; end if;
  if p_starts_at is not null and (p_ends_at is null or p_ends_at <= p_starts_at) then
    raise exception 'the dinner has to end after it starts' using errcode = '22023';
  end if;
  if p_host is not null and not exists (select 1 from public.people where id = p_host and crew_id = public.my_crew_id() and active) then
    raise exception 'the host has to be on your crew' using errcode = '22023';
  end if;
  update public.dinners set starts_at = p_starts_at, ends_at = p_ends_at, host_id = p_host
  where key = p_dinner and crew_id = public.my_crew_id();
  if not found then raise exception 'not a dinner of your crew' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Adds a man to the crew. No email: he answers through his link or the table code.
create or replace function public.add_member(p_first_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  crew text := public.my_crew_id();
  nm   text := left(trim(p_first_name), 40);
  base text;
  pid  text;
  i    int := 1;
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor can do this' using errcode = '42501'; end if;
  if nm is null or nm = '' then raise exception 'a first name is needed' using errcode = '22023'; end if;
  base := coalesce(nullif(regexp_replace(lower(nm), '[^a-z]', '', 'g'), ''), 'man');
  pid := base;
  while exists (select 1 from public.people where id = pid) loop
    i := i + 1;
    pid := base || i;
  end loop;
  insert into public.people (id, city_id, crew_id, first_name, role)
  values (pid, (select city_id from public.crews where id = crew), crew, nm, 'member');
  return jsonb_build_object('ok', true, 'id', pid, 'first_name', nm);
end $$;

-- Takes a man off the crew list, or puts him back. Taking him off also switches his link off.
create or replace function public.set_member_active(p_person text, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor can do this' using errcode = '42501'; end if;
  update public.people set active = p_active where id = p_person and crew_id = public.my_crew_id() and role = 'member';
  if not found then raise exception 'not a member of your crew' using errcode = '42501'; end if;
  if not p_active then delete from public.links where person_id = p_person; end if;
  return jsonb_build_object('ok', true, 'active', p_active);
end $$;

-- A dinner for the anchor: who has checked in, totals, everyone's commitments, and the scores and answers that
-- men chose to share with him.
create or replace function public.dinner_report(p_dinner text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d    public.dinners;
  n    int;
  avgs jsonb;
begin
  if public.my_role() is distinct from 'anchor' then return null; end if;
  select x.* into d from public.dinners x where x.key = p_dinner and x.crew_id = public.my_crew_id();
  if d.key is null then return null; end if;
  select count(*) into n from public.checkins c where c.dinner_key = d.key and c.arrived_at is not null;
  select jsonb_object_agg(k, v) into avgs from (
    select e.key as k, round(avg((e.value)::text::numeric), 1) as v
    from public.checkins c, jsonb_each(c.scores) e
    where c.dinner_key = d.key and c.arrived_at is not null
    group by e.key having count(*) >= 3) s;
  return jsonb_build_object(
    'dinner', jsonb_build_object('key', d.key, 'n', d.n, 'job', d.job, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
                                 'open', public.dinner_is_open(d)),
    'crew_size', (select count(*) from public.people p where p.crew_id = d.crew_id and p.active and p.role <> 'city'),
    'arrived', n,
    'closed', (select count(*) from public.checkins c where c.dinner_key = d.key and c.closed_at is not null),
    'commitments', (select count(*) from public.checkins c where c.dinner_key = d.key and c.commitment is not null),
    'kept', (select count(*) from public.checkins c where c.dinner_key = d.key and c.kept is true),
    'not_yet', (select count(*) from public.checkins c where c.dinner_key = d.key and c.kept is false),
    'commitments_list', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name,
                          'commitment', c.commitment, 'by_when', c.by_when, 'kept', c.kept) order by p.first_name)
                        from public.checkins c join public.people p on p.id = c.person_id
                        where c.dinner_key = d.key and c.commitment is not null), '[]'::jsonb),
    'averages', case when n >= 3 then avgs end,
    'useful', (select jsonb_build_object('count', count(*), 'average', case when count(*) >= 3 then round(avg(c.useful), 1) end)
               from public.checkins c where c.dinner_key = d.key and c.useful is not null),
    'status', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name,
                          'arrived', c.arrived_at is not null, 'closed', c.closed_at is not null) order by p.first_name)
                        from public.people p left join public.checkins c on c.person_id = p.id and c.dinner_key = d.key
                        where p.crew_id = d.crew_id and p.active and p.role <> 'city'), '[]'::jsonb),
    'shared', coalesce((select jsonb_agg(jsonb_build_object('first_name', p.first_name, 'scores', c.scores,
                          'problem', c.problem, 'area', c.problem_area, 'commitment', c.commitment, 'by_when', c.by_when,
                          'offer', c.offer, 'kept', c.kept, 'share', c.share) order by p.first_name)
                        from public.checkins c join public.people p on p.id = c.person_id
                        where c.dinner_key = d.key and c.share in ('anchor', 'city')), '[]'::jsonb));
end $$;

-- The crew's weekly line: each week's average across the nine areas, only for weeks three or more men answered.
create or replace function public.crew_pulse(p_weeks int default 13) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.my_role() = 'anchor' then coalesce(jsonb_agg(jsonb_build_object(
           'week', week, 'answered', answered, 'average', average) order by week), '[]'::jsonb) end
  from (
    select pl.week, count(*) as answered,
           round(avg((select avg((e.value)::text::numeric) from jsonb_each(pl.scores) e)), 2) as average
    from public.pulses pl join public.people p on p.id = pl.person_id
    where p.crew_id = public.my_crew_id() and pl.week >= (current_date - (p_weeks * 7))
    group by pl.week having count(*) >= 3
  ) w
$$;

-- A page per man for his anchor: whether he came, whether he did the weekly check-in (never what he said), his
-- commitments and whether he kept them, and his scores and what he brought only where he chose to share them.
create or replace function public.anchor_people() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  crew text := public.my_crew_id();
begin
  if public.my_role() is distinct from 'anchor' then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'role', p.role, 'active', p.active,
      'link_issued_at', l.issued_at, 'link_used_at', l.used_at, 'paired', l.device_hash is not null,
      'circle_seen_on', p.circle_seen_on, 'circle_checked_at', p.circle_checked_at,
      'dinners', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'n', d.n,
                     'arrived', c.arrived_at is not null, 'closed', c.closed_at is not null) order by d.n)
                   from public.dinners d left join public.checkins c on c.dinner_key = d.key and c.person_id = p.id
                   where d.crew_id = crew), '[]'::jsonb),
      'weeks', coalesce((select jsonb_agg(pl.week order by pl.week) from public.pulses pl
                 where pl.person_id = p.id and pl.week >= current_date - 91), '[]'::jsonb),
      'commitments', coalesce((select jsonb_agg(jsonb_build_object('dinner', c.dinner_key, 'n', d.n,
                         'commitment', c.commitment, 'by_when', c.by_when, 'kept', c.kept) order by d.n)
                       from public.checkins c join public.dinners d on d.key = c.dinner_key
                       where c.person_id = p.id and d.crew_id = crew and c.commitment is not null), '[]'::jsonb),
      'shared', coalesce((select jsonb_agg(jsonb_build_object('dinner', c.dinner_key, 'n', d.n, 'scores', c.scores,
                    'problem', c.problem, 'area', c.problem_area, 'offer', c.offer, 'share', c.share) order by d.n)
                  from public.checkins c join public.dinners d on d.key = c.dinner_key
                  where c.person_id = p.id and d.crew_id = crew and c.share in ('anchor', 'city')), '[]'::jsonb))
    order by p.active desc, p.first_name)
    from public.people p left join public.links l on l.person_id = p.id
    where p.crew_id = crew and p.role in ('member', 'anchor')), '[]'::jsonb);
end $$;

-- The anchor notes when a man was last on Circle, from his Circle profile.
create or replace function public.set_circle_seen(p_person text, p_seen_on date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'anchor' then raise exception 'only an anchor can do this' using errcode = '42501'; end if;
  if p_seen_on is not null and (p_seen_on > current_date + 1 or p_seen_on < date '2020-01-01') then
    raise exception 'that date is not possible' using errcode = '22023';
  end if;
  update public.people set circle_seen_on = p_seen_on, circle_checked_at = now()
  where id = p_person and crew_id = public.my_crew_id() and role in ('member', 'anchor');
  if not found then raise exception 'not a member of your crew' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'circle_seen_on', p_seen_on);
end $$;

-- ---------- for city leads ----------
-- Counts by crew across the city. Averages only where three or more men answered. No names.
create or replace function public.city_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'city' then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'crew', c.name,
      'men', (select count(*) from public.people p where p.crew_id = c.id and p.active and p.role <> 'city'),
      'dinners_held', (select count(*) from public.dinners d where d.crew_id = c.id and d.ends_at < now()),
      'checkins', (select count(*) from public.checkins k join public.dinners d on d.key = k.dinner_key
                   where d.crew_id = c.id and k.arrived_at is not null),
      'commitments', (select count(*) from public.checkins k join public.dinners d on d.key = k.dinner_key
                      where d.crew_id = c.id and k.commitment is not null),
      'kept', (select count(*) from public.checkins k join public.dinners d on d.key = k.dinner_key
               where d.crew_id = c.id and k.kept is true),
      'last_dinner_average', (
        select case when count(*) >= 3 then round(avg(x.v), 1) end
        from (select (select avg((e.value)::text::numeric) from jsonb_each(k.scores) e) as v
              from public.checkins k
              where k.dinner_key = (select d.key from public.dinners d where d.crew_id = c.id and d.ends_at < now()
                                    order by d.ends_at desc limit 1)
                and k.arrived_at is not null and k.scores <> '{}'::jsonb) x),
      'last_dinner_useful', (
        select case when count(*) >= 3 then round(avg(k.useful), 1) end
        from public.checkins k
        where k.dinner_key = (select d.key from public.dinners d where d.crew_id = c.id and d.ends_at < now()
                              order by d.ends_at desc limit 1)
          and k.useful is not null),
      'asks', (select coalesce(jsonb_agg(jsonb_build_object(
                 'theme', t ->> 'name',
                 'asking', coalesce((t ->> 'asking')::int, 0),
                 'offering', jsonb_array_length(coalesce(t -> 'offering', '[]'::jsonb)))), '[]'::jsonb)
               from public.crew_profiles pr, jsonb_array_elements(pr.data -> 'themes') t
               where pr.crew_id = c.id)
    ) order by c.name)
    from public.crews c where c.city_id = public.my_city_id()), '[]'::jsonb);
end $$;

-- Answers that men chose to share with the city lead, for crews in his city only.
create or replace function public.city_shared() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'city' then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('crew', cr.name, 'dinner', d.n, 'first_name', p.first_name, 'scores', c.scores,
                     'problem', c.problem, 'area', c.problem_area, 'commitment', c.commitment, 'by_when', c.by_when,
                     'kept', c.kept) order by cr.name, d.n, p.first_name)
    from public.checkins c
    join public.dinners d on d.key = c.dinner_key
    join public.crews cr on cr.id = d.crew_id
    join public.people p on p.id = c.person_id
    where c.share = 'city' and cr.city_id = public.my_city_id()), '[]'::jsonb);
end $$;

-- ---------- backup and restore, from the SQL editor only ----------
-- Copy everything into one document: select public.export_all();
create or replace function public.export_all() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(), 'version', 2,
    'cities',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.cities x),
    'crews',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.crews x),
    'people',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.people x),
    'links',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.person_id), '[]'::jsonb) from public.links x),
    'dinners',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.key), '[]'::jsonb) from public.dinners x),
    'checkins',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.dinner_key, x.person_id), '[]'::jsonb) from public.checkins x),
    'pulses',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.week, x.person_id), '[]'::jsonb) from public.pulses x),
    'crew_profiles', (select coalesce(jsonb_agg(to_jsonb(x) order by x.crew_id), '[]'::jsonb) from public.crew_profiles x))
$$;

-- Put a copy back, into this project or a fresh one after running this file: select public.restore_all('<the copy>'::jsonb);
create or replace function public.restore_all(doc jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cities select * from jsonb_populate_recordset(null::public.cities, doc -> 'cities')
  on conflict (id) do update set name = excluded.name, tz = excluded.tz;
  insert into public.crews select * from jsonb_populate_recordset(null::public.crews, doc -> 'crews')
  on conflict (id) do update set city_id = excluded.city_id, name = excluded.name, area = excluded.area;
  insert into public.people select * from jsonb_populate_recordset(null::public.people, doc -> 'people')
  on conflict (id) do update set city_id = excluded.city_id, crew_id = excluded.crew_id, first_name = excluded.first_name,
    role = excluded.role, email = excluded.email, active = excluded.active, created_at = excluded.created_at,
    circle_seen_on = excluded.circle_seen_on, circle_checked_at = excluded.circle_checked_at;
  insert into public.dinners select * from jsonb_populate_recordset(null::public.dinners, doc -> 'dinners')
  on conflict (key) do update set crew_id = excluded.crew_id, n = excluded.n, job = excluded.job,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, host_id = excluded.host_id, table_code = excluded.table_code;
  insert into public.links select * from jsonb_populate_recordset(null::public.links, doc -> 'links')
  on conflict (person_id) do update set key_hash = excluded.key_hash, issued_at = excluded.issued_at,
    issued_by = excluded.issued_by, used_at = excluded.used_at, device_hash = excluded.device_hash, paired_at = excluded.paired_at;
  insert into public.checkins select * from jsonb_populate_recordset(null::public.checkins, doc -> 'checkins')
  on conflict (dinner_key, person_id) do update set scores = excluded.scores, problem = excluded.problem,
    problem_area = excluded.problem_area, commitment = excluded.commitment, by_when = excluded.by_when,
    offer = excluded.offer, share = excluded.share, kept = excluded.kept, kept_at = excluded.kept_at,
    arrived_at = excluded.arrived_at, closed_at = excluded.closed_at, via = excluded.via, updated_at = excluded.updated_at,
    useful = excluded.useful;
  insert into public.pulses select * from jsonb_populate_recordset(null::public.pulses, doc -> 'pulses')
  on conflict (week, person_id) do update set scores = excluded.scores, updated_at = excluded.updated_at;
  insert into public.crew_profiles select * from jsonb_populate_recordset(null::public.crew_profiles, doc -> 'crew_profiles')
  on conflict (crew_id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true,
    'people', jsonb_array_length(coalesce(doc -> 'people', '[]'::jsonb)),
    'checkins', jsonb_array_length(coalesce(doc -> 'checkins', '[]'::jsonb)));
end $$;

-- ---------- who may run what ----------
revoke execute on function public.link_open(text), public.link_checkin(text, text, text, jsonb),
  public.link_kept(text, text, boolean), public.link_pulse(text, jsonb), public.table_open(text, text),
  public.table_checkin(text, text, text, text, jsonb), public.ping(),
  public.link_pair(text, text), public.link_space(text, text), public.link_crew_now(text, text),
  public.table_crew_now(text, text, text), public.anchor_people(), public.set_circle_seen(text, date),
  public.whoami(), public.anchor_crew(), public.issue_links(text[]), public.new_table_code(text),
  public.save_dinner(text, timestamptz, timestamptz, text), public.add_member(text), public.set_member_active(text, boolean),
  public.dinner_report(text), public.crew_pulse(int), public.city_summary(), public.city_shared(),
  public.export_all(), public.restore_all(jsonb) from public, anon, authenticated;
-- Men's links and table codes work without signing in.
grant execute on function public.link_open(text), public.link_checkin(text, text, text, jsonb),
  public.link_kept(text, text, boolean), public.link_pulse(text, jsonb), public.table_open(text, text),
  public.table_checkin(text, text, text, text, jsonb), public.ping(),
  public.link_pair(text, text), public.link_space(text, text), public.link_crew_now(text, text),
  public.table_crew_now(text, text, text) to anon, authenticated;
-- Everything else needs a signed-in anchor or city lead, and each function checks which.
grant execute on function public.whoami(), public.anchor_crew(), public.issue_links(text[]), public.new_table_code(text),
  public.save_dinner(text, timestamptz, timestamptz, text), public.add_member(text), public.set_member_active(text, boolean),
  public.dinner_report(text), public.crew_pulse(int), public.anchor_people(), public.set_circle_seen(text, date),
  public.city_summary(), public.city_shared() to authenticated;
-- export_all and restore_all stay with the project owner, through the SQL editor.
