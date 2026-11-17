-- CSK Retention Predictor 2027 — v2 migration: remove login/auth, add anonymous participants, add photo_url.
-- Run this once in the Supabase SQL editor on a project that still has the v1 schema.
--
-- WARNING: this assumes no real predictions have been collected yet (fine for a pre-launch project).
-- It drops and recreates predictions, prediction_items and scores. If you already have real
-- submissions tied to real user accounts, export them first — this migration does not carry them over.

-- 1. Remove everything that depended on Supabase Auth.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_protect_admin on profiles;
drop function if exists handle_new_user();
drop function if exists protect_admin_flag();
drop function if exists is_admin();
drop table if exists profiles cascade;

-- 2. Rebuild predictions / prediction_items / scores around anonymous participants.
drop table if exists scores cascade;
drop table if exists prediction_items cascade;
drop table if exists predictions cascade;

create table participants(
  id uuid primary key default gen_random_uuid(),
  display_name text not null check(char_length(trim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table predictions(
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references participants on delete cascade,
  competition_id int not null default 1,
  submitted_at timestamptz not null default now()
);

create table prediction_items(
  prediction_id uuid references predictions on delete cascade,
  player_id uuid references players on delete restrict,
  decision text not null check(decision in('retain','release')),
  primary key(prediction_id,player_id)
);

create table scores(
  participant_id uuid primary key references participants on delete cascade,
  correct int not null,
  total int not null,
  bonus int not null,
  points int not null,
  updated_at timestamptz not null default now()
);
create index on prediction_items(player_id);
create index on scores(points desc,correct desc,bonus desc);

-- 3. Player photos.
alter table players add column if not exists photo_url text;

-- 4. RLS: public can read players/settings/leaderboard. Nothing is publicly writable —
--    admin changes (players, competition_settings, official_results, scores) are made in the
--    Supabase dashboard / SQL editor with the service role, which bypasses RLS. There is no
--    app-facing admin panel, matching the current build.
alter table participants enable row level security;
alter table predictions enable row level security;
alter table prediction_items enable row level security;
alter table scores enable row level security;

drop policy if exists pl_admin on players; -- was admin-via-auth; no longer applicable
drop policy if exists cs_admin on competition_settings;
drop policy if exists or_admin on official_results;
drop policy if exists pr_read on predictions;
drop policy if exists pi_read on prediction_items;
drop policy if exists or_read on official_results;
drop policy if exists sc_read on scores;

create policy part_read on participants for select using(true); -- display names only, nothing sensitive
create policy sc_read on scores for select using(true);
create policy or_read on official_results for select using((select results_published from competition_settings));
-- No select policy on predictions / prediction_items for anon: reachable only via the
-- SECURITY DEFINER RPCs below, each scoped to the one participant_id the caller supplies.

-- 5. RPCs used by the (login-free) frontend.
create or replace function create_participant(p_display_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; n text;
begin
  n := trim(p_display_name);
  if char_length(n) < 1 or char_length(n) > 40 then raise exception 'Enter a name up to 40 characters'; end if;
  insert into participants(display_name) values(n) returning id into pid;
  return pid;
end$$;
revoke all on function create_participant(text) from public;
grant execute on function create_participant(text) to anon, authenticated;

create or replace function submit_prediction(p_participant_id uuid, items jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare s competition_settings; pid uuid; n int;
begin
  if p_participant_id is null or not exists(select 1 from participants where id=p_participant_id) then
    raise exception 'Unknown participant — refresh and try again';
  end if;
  select * into s from competition_settings;
  if not s.submissions_open or now() >= s.deadline then raise exception 'Submissions are closed'; end if;
  if exists(select 1 from predictions where participant_id=p_participant_id) then raise exception 'You have already submitted'; end if;
  select count(distinct (i->>'player_id')) into n from jsonb_array_elements(items) i
    where (i->>'decision') in('retain','release') and (i->>'player_id')::uuid in(select id from players where is_active);
  if n <> (select count(*) from players where is_active) or jsonb_array_length(items) <> n then
    raise exception 'Classify every eligible player exactly once';
  end if;
  insert into predictions(participant_id) values(p_participant_id) returning id into pid;
  insert into prediction_items select pid,(i->>'player_id')::uuid,i->>'decision' from jsonb_array_elements(items) i;
  return pid;
end$$;
revoke all on function submit_prediction(uuid, jsonb) from public;
grant execute on function submit_prediction(uuid, jsonb) to anon, authenticated;

create or replace function get_my_prediction(p_participant_id uuid)
returns table(player_id uuid, player_name text, decision text, submitted_at timestamptz)
language sql security definer set search_path=public as $$
  select pi.player_id, pl.name, pi.decision, pr.submitted_at
  from predictions pr
  join prediction_items pi on pi.prediction_id = pr.id
  join players pl on pl.id = pi.player_id
  where pr.participant_id = p_participant_id;
$$;
revoke all on function get_my_prediction(uuid) from public;
grant execute on function get_my_prediction(uuid) to anon, authenticated;

-- 6. Scoring, rewritten for participants. Idempotent; admin-only (dashboard/service role —
--    execute is revoked from anon/authenticated so the public app can never call it).
create or replace function recalculate_scores() returns void
language plpgsql security definer set search_path=public as $$
declare rc int; rl int;
begin
  select count(*) filter(where decision='retain'), count(*) filter(where decision='release') into rc, rl from official_results;
  delete from scores;
  insert into scores(participant_id,correct,total,bonus,points)
  select p.participant_id, x.c, x.t, x.b, x.c*10+x.b from predictions p cross join lateral(
    select count(*) filter(where o.decision=i.decision)::int c, count(*)::int t,
      (case when count(*) filter(where i.decision='retain')=rc then 15 else 0 end
       + case when count(*) filter(where i.decision='release')=rl then 15 else 0 end)::int b
    from prediction_items i join official_results o using(player_id) where i.prediction_id=p.id) x;
end$$;
revoke all on function recalculate_scores() from public, anon, authenticated;

create or replace view leaderboard as
  select rank() over(order by s.points desc, s.correct desc, s.bonus desc) rank,
    pt.display_name as name, s.points, s.correct, s.total, s.bonus,
    round(100.0*s.correct/nullif(s.total,0),2) accuracy
  from scores s join participants pt on pt.id = s.participant_id;

-- The old `scores` table was dropped (cascaded) in step 2 above, which already removes it
-- from the publication, so we only need to add the newly created one back.
alter publication supabase_realtime add table scores;
