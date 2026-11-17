-- Run once in the Supabase SQL editor on your LIVE project.
-- Changes the prediction deadline to 17 Nov 2026, 6:59 PM IST (18:59 +05:30).
update competition_settings
set deadline = '2026-11-17 18:59:00+05:30'
where id = 1;

-- Check it:
select deadline, deadline at time zone 'Asia/Kolkata' as deadline_ist, submissions_open from competition_settings;
