-- Run this in your Supabase SQL Editor to update the deadline to 6:59 PM IST (17 Nov 2026).
update competition_settings
set deadline = '2026-11-17 18:59:00+05:30',
    submissions_open = true
where id = 1;

-- Verification query:
select * from competition_settings;
