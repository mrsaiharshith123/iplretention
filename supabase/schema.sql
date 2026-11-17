-- CSK Retention Predictor 2027 — fresh-install schema (v2: no login, anonymous participants).
-- Run this once in the Supabase SQL editor on a brand-new project.
-- Already have the v1 (login-based) schema installed? Run supabase/migration_v2_remove_auth.sql instead.

create table players(
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  role text not null,
  nationality text,
  photo_url text,
  is_replacement boolean not null default false,
  is_active boolean not null default true,
  note text,
  created_at timestamptz default now()
);

create table competition_settings(
  id int primary key default 1 check(id=1),
  deadline timestamptz not null,
  submissions_open boolean not null default true,
  results_published boolean not null default false
);

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

create table official_results(
  player_id uuid primary key references players on delete cascade,
  decision text not null check(decision in('retain','release'))
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

-- Row Level Security. Nobody logs in, so there is no "owner" to check against; instead:
--  * players / competition_settings / official_results(after publish) / participants / scores
--    are readable by anyone (anon key) — nothing in them is sensitive.
--  * predictions / prediction_items have NO select/insert/update/delete policy for anon at all,
--    so they are reachable only through the SECURITY DEFINER RPCs below, each scoped to the
--    one participant_id the caller already holds (generated server-side, stored in their browser).
--  * Every admin action (adding/editing players, setting the deadline, publishing official
--    results, recalculating scores) is done in the Supabase dashboard / SQL editor with the
--    service role, which bypasses RLS — there is no admin login in the app itself.
alter table players enable row level security;
alter table competition_settings enable row level security;
alter table participants enable row level security;
alter table predictions enable row level security;
alter table prediction_items enable row level security;
alter table official_results enable row level security;
alter table scores enable row level security;

create policy pl_read on players for select using(true);
create policy cs_read on competition_settings for select using(true);
create policy part_read on participants for select using(true);
create policy sc_read on scores for select using(true);
create policy or_read on official_results for select using((select results_published from competition_settings));

create function create_participant(p_display_name text) returns uuid
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

create function submit_prediction(p_participant_id uuid, items jsonb) returns uuid
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

create function get_my_prediction(p_participant_id uuid)
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

-- Idempotent — safe to re-run. Admin-only: execute is revoked from anon/authenticated,
-- so run it from the SQL editor (service role) after publishing official_results.
create function recalculate_scores() returns void
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

create view leaderboard as
  select rank() over(order by s.points desc, s.correct desc, s.bonus desc) rank,
    pt.display_name as name, s.points, s.correct, s.total, s.bonus,
    round(100.0*s.correct/nullif(s.total,0),2) accuracy
  from scores s join participants pt on pt.id = s.participant_id;

alter publication supabase_realtime add table scores;

-- Open until 17 Nov 2026 18:59 IST (6:59 PM) — change this before launch if it has already passed.
insert into competition_settings(deadline) values('2026-11-17 18:59:00+05:30');

-- Eligible squad (names and roles exactly as supplied), with photo_url baked in.
insert into players(name,role,is_replacement,photo_url) values
('Ruturaj Gaikwad (Captain)','Batter',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team4playerImgNoBg_1773207316332.png'),
('MS Dhoni','Wicket-keeper',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team1playerImgNoBg_1773206232679.png'),
('Sanju Samson','Wicket-keeper',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team50playerImgNoBg_1773207257969.png'),
('Urvil Patel','Wicket-keeper',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team49playerImgNoBg_1773208996000.png'),
('Kartik Sharma','Wicket-keeper',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team53playerImgNoBg_1773206702889.png'),
('Sarfaraz Khan','Batter',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team58playerImgNoBg_1773379183176.png'),
('Dewald Brevis','Batter',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team46playerImgNoBg_1773208945125.png'),
('Ayush Mhatre','Batter',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team45playerImgNoBg_1773208902161.png'),
('Shivam Dube','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team9playerImgNoBg_1773208333913.png'),
('Matthew Short','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team54playerImgNoBg_1773206785917.png'),
('Aman Khan','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team52playerImgNoBg_1773206632903.png'),
('Prashant Veer','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team59playerImgNoBg_1773207152530.png'),
('Anshul Kamboj','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team43playerImgNoBg_1773209148564.png'),
('Shreyas Gopal','All-rounder / Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team16playerImgNoBg_1773208515368.png'),
('Zakary Foulkes','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team57playerImgNoBg_1773206999966.png'),
('Macneil Noronha','All-rounder (Replacement)',true,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team64playerImgNoBg_1779440300151.png'),
('Dian Forrester','All-rounder (Replacement)',true,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team62playerImgNoBg_1779440022276.png'),
('Noor Ahmad','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team12playerImgNoBg_1773208221215.png'),
('Rahul Chahar','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team56playerImgNoBg_1773206941099.png'),
('Matt Henry','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team55playerImgNoBg_1773206880148.png'),
('Akeal Hosein','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team51playerImgNoBg_1773206570529.png'),
('Mukesh Choudhary','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team24playerImgNoBg_1773208579668.png'),
('Gurjapneet Singh','Bowler',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team15playerImgNoBg_1773208406237.png'),
('Spencer Johnson','Bowler (Replacement)',true,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team23playerImgNoBg_1774867441932.png'),
('Kuldip Yadav','Bowler (Replacement)',true,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team63playerImgNoBg_1779440148298.png'),
('Ramakrishna Ghosh','Bowler/All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team41playerImgNoBg_1773209044035.png'),
('Jamie Overton','All-rounder',false,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team25playerImgNoBg_1773208844367.png'),
('Akash Madhwal','Bowler (Replacement)',true,'https://gallery.chennaisuperkings.com/PROD/TEAM/Team61playerImgNoBg_1777025305226.png');
-- Traded to SRH: kept for records, excluded from predictions (is_active=false). Flip to re-include.
insert into players(name,role,is_active,note) values('Khaleel Ahmed','Bowler (traded)',false,'Traded to SRH'),('Nathan Ellis','Bowler (traded)',false,'Traded to SRH');
