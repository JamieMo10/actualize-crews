# Actualize crews

One app for every city's Breaking Bread dinners. It runs on GitHub Pages and a Supabase project in Canada (Central).

## Who uses it, and how

- **Men** never sign in and never give an email. They open the private link their anchor sent them, or at a dinner scan the table QR code and pick their name. The first time a man opens his link he can tap "Yes, remember me" on his own phone. From then on his link opens his own space on that phone: his check-ins and weeks next to the crew's averages, and his commitments. On any other phone his link only sends answers and never shows them back.
- **Anchors** sign in at `crew.html` with an emailed code. They see who has checked in, the crew's averages, every commitment, and a man's own answers only where he chose to share them with his anchor. They make the private links, set dinner dates and hosts, and show the table QR code. Each man has a connection score from dinners, the weekly check-in, commitments kept and when he was last on Circle, so the anchor can see who to check in with. Only the anchor sees it.
- **City leads** sign in the same way. They see counts for every crew in their city, and a man's own answers only where he chose to share them with the city lead.
- Averages only show once three or more men have answered.

## Files

- `index.html`, `checkin.js`: the check-in and each man's own space (`#k=` private link, `#t=` table code)
- `manifest.webmanifest`, `icon-*.png`: so a man can keep his space on his home screen
- `crew.html`, `crew.js`: sign-in and dashboards for anchors and city leads
- `config.js`: the project URL and publishable key. Both are safe to publish. Never put the secret key here.
- `db/schema.sql`: the whole database, with its access rules. Safe to run again.

Member data never goes in this repository: no emails, no answers, no crew lists.

## Adding a city or a crew

In the Supabase SQL editor, add the city, the crew, the anchor (with his email) and the city lead (with his email):

```sql
insert into public.cities (id, name, tz) values ('toronto', 'Toronto', 'America/Toronto');
insert into public.crews (id, city_id, name) values ('tor-east', 'toronto', 'Toronto East Crew');
insert into public.people (id, city_id, crew_id, first_name, role, email) values
  ('tia', 'toronto', 'tor-east', 'Tia', 'anchor', 'tia@example.com'),
  ('lea', 'toronto', null, 'Lea', 'city', 'lea@example.com');
```

Then add the same emails under Authentication > Users > Add user > Create new user, with Auto Confirm User ticked. The anchor adds his men and dinners from the dashboard.

## Backup and restore

- Copy everything: run `select public.export_all();` in the SQL editor and save the result somewhere private.
- Put it back, here or in a fresh project after running `db/schema.sql`: `select public.restore_all('<the saved copy>'::jsonb);`
- Private links and table codes keep working after a restore.

## Before more crews join

1. Move the project to a paid plan, so it never pauses and keeps daily backups.
2. Check city separation with a second city's test accounts.
3. Have another volunteer run a dinner from the dashboard and do a restore into a fresh project.
