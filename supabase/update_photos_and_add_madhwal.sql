-- Run in the Supabase SQL editor. Sets photo_url for every existing player,
-- and adds Akash Madhwal, who was missing from the original squad list.
-- (Verified: right-arm fast bowler, signed by CSK in 2026 as an injury replacement.)

update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team1playerImgNoBg_1773206232679.png' where name='MS Dhoni';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team53playerImgNoBg_1773206702889.png' where name='Kartik Sharma';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team50playerImgNoBg_1773207257969.png' where name='Sanju Samson';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team49playerImgNoBg_1773208996000.png' where name='Urvil Patel';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team58playerImgNoBg_1773379183176.png' where name='Sarfaraz Khan';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team54playerImgNoBg_1773206785917.png' where name='Matthew Short';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team4playerImgNoBg_1773207316332.png' where name='Ruturaj Gaikwad (Captain)';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team45playerImgNoBg_1773208902161.png' where name='Ayush Mhatre';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team46playerImgNoBg_1773208945125.png' where name='Dewald Brevis';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team63playerImgNoBg_1779440148298.png' where name='Kuldip Yadav';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team59playerImgNoBg_1773207152530.png' where name='Prashant Veer';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team57playerImgNoBg_1773206999966.png' where name='Zakary Foulkes';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team56playerImgNoBg_1773206941099.png' where name='Rahul Chahar';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team55playerImgNoBg_1773206880148.png' where name='Matt Henry';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team12playerImgNoBg_1773208221215.png' where name='Noor Ahmad';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team15playerImgNoBg_1773208406237.png' where name='Gurjapneet Singh';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team23playerImgNoBg_1774867441932.png' where name='Spencer Johnson';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team16playerImgNoBg_1773208515368.png' where name='Shreyas Gopal';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team24playerImgNoBg_1773208579668.png' where name='Mukesh Choudhary';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team25playerImgNoBg_1773208844367.png' where name='Jamie Overton';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team64playerImgNoBg_1779440300151.png' where name='Macneil Noronha';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team62playerImgNoBg_1779440022276.png' where name='Dian Forrester';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team52playerImgNoBg_1773206632903.png' where name='Aman Khan';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team51playerImgNoBg_1773206570529.png' where name='Akeal Hosein';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team9playerImgNoBg_1773208333913.png' where name='Shivam Dube';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team41playerImgNoBg_1773209044035.png' where name='Ramakrishna Ghosh';
update players set photo_url='https://gallery.chennaisuperkings.com/PROD/TEAM/Team43playerImgNoBg_1773209148564.png' where name='Anshul Kamboj';

-- New player you forgot: Akash Madhwal — right-arm fast bowler, joined CSK in 2026 as a
-- replacement signing, so flagged is_replacement like the other replacement players.
insert into players(name, role, photo_url, is_replacement, is_active)
values('Akash Madhwal', 'Bowler (Replacement)', 'https://gallery.chennaisuperkings.com/PROD/TEAM/Team61playerImgNoBg_1777025305226.png', true, true)
on conflict (name) do update set photo_url=excluded.photo_url, role=excluded.role, is_replacement=excluded.is_replacement;

-- Sanity check: every active player should now have a photo.
-- select name from players where is_active and photo_url is null;
