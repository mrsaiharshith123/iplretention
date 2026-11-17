-- STEP 1: paste + Run. Official results: these 11 are RELEASED, every other active player is RETAINED.
insert into official_results(player_id, decision)
select id, case when name in ('MS Dhoni','Prashant Veer','Matthew Short','Matt Henry','Zakary Foulkes',
  'Aman Khan','Kuldip Yadav','Akash Madhwal','Dian Forrester','Spencer Johnson','Macneil Noronha')
  then 'release' else 'retain' end
from players where is_active
on conflict (player_id) do update set decision = excluded.decision;

-- STEP 2: CHECK. You must see release = 11 and retain = 17 (28 total). If not, a name did not match.
select decision, count(*) from official_results group by decision;

-- STEP 3: publish and score (safe to re-run).
update competition_settings set results_published = true, submissions_open = false;
select recalculate_scores();

-- STEP 4: look at the final ranking.
select * from leaderboard order by rank, name;
