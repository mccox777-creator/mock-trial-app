-- Notifications, email, and judge recruiting. Run after 0003_scoring_and_video.sql.
--
-- How it works: database triggers decide who should hear about each event and write one row
-- per person into notifications (which doubles as each person's in-app inbox). The
-- send-notifications function delivers those rows as phone alerts and emails, following each
-- person's settings. Nothing here lets anyone message people directly.

-- Kinds of notice a person can turn on or off:
--   my_competitions  pairings, schedule changes, announcements for competitions you organize, judge, or compete in
--   chat             new chat messages in those competitions (phone alerts and inbox only, never email)
--   results          results published for those competitions
--   new_competition  a new competition opens in a circuit you follow
--   case_release     a case is released or corrected in a circuit you follow
--   judges_needed    an organizer is looking for judges in a circuit you judge in (only if you're willing to judge)

alter table bulletins drop constraint if exists bulletins_kind_check;
alter table bulletins add constraint bulletins_kind_check check (kind in ('general', 'case', 'schedule', 'results', 'judges_needed'));

create table notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  levels level[] not null default '{}', -- circuits followed; none until the person picks
  kinds text[] not null default '{my_competitions,chat,results,new_competition,case_release,judges_needed}',
  push boolean not null default true,
  email boolean not null default true,
  email_digest boolean not null default false, -- one email a day instead of one per notice
  willing_to_judge boolean not null default false,
  judge_levels level[] not null default '{}',
  judge_region text not null default '' check (char_length(judge_region) <= 100),
  updated_at timestamptz not null default now(),
  check (kinds <@ array['my_competitions', 'chat', 'results', 'new_competition', 'case_release', 'judges_needed'])
);
alter table notification_prefs enable row level security;
create policy "own settings" on notification_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table push_tokens (
  token text primary key check (char_length(token) <= 200),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null default '' check (platform in ('', 'ios', 'android', 'web')),
  created_at timestamptz not null default now()
);
alter table push_tokens enable row level security;
create policy "own devices" on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '',  -- an in-app path, e.g. /tournament/<id>
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  email_sent_at timestamptz
);
alter table notifications enable row level security;
create index notifications_inbox on notifications (user_id, created_at desc);
create index notifications_unsent on notifications (created_at) where push_sent_at is null or email_sent_at is null;
-- Your inbox: read it and mark things read. Only the server creates notices.
create policy "own inbox" on notifications for select using (user_id = auth.uid());
create policy "mark read" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on notifications from anon, authenticated;
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

-- ---------- Who hears about what ----------

-- Everyone taking part in a competition: organizers, confirmed judges, members of confirmed teams.
create function competition_people(t_id text) returns table (user_id uuid) language sql stable security definer set search_path = public, pg_temp as $$
  select unnest(director_ids) from tournaments where id = t_id
  union select js.user_id from judge_signups js where js.tournament_id = t_id and js.status = 'approved'
  union select tm.user_id from registrations r join team_members tm on tm.team_id = r.team_id where r.tournament_id = t_id and r.status = 'approved';
$$;

-- A person's settings. Notices about your own competitions are on by default; circuit-wide
-- notices (new competitions, case releases, judge calls) only reach people who chose that circuit.
create function wants(uid uuid, k text, lvl level) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select k = any(p.kinds) and (lvl is null or lvl = any(p.levels) or (k = 'judges_needed' and lvl = any(p.judge_levels)))
     from notification_prefs p where p.user_id = uid),
    lvl is null);
$$;

create function notify(uids uuid[], k text, lvl level, t text, b text, l text, skip uuid default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into notifications (user_id, kind, title, body, link)
  select distinct u, k, left(t, 200), left(b, 1000), l from unnest(uids) u
  where u is not null and u is distinct from skip and wants(u, k, lvl);
$$;

-- Bulletins: competition notices go to that competition's people; circuit-wide notices to followers.
create function notify_bulletin() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare lvl level := new.level; link text := coalesce('/tournament/' || new.tournament_id, '/bulletins');
begin
  if new.kind = 'judges_needed' then
    perform notify(array(
      select p.user_id from notification_prefs p
      where p.willing_to_judge and lvl = any(p.judge_levels)
        and p.user_id not in (select user_id from judge_signups where tournament_id = new.tournament_id)),
      'judges_needed', lvl, new.title, new.body, link, new.posted_by);
  elsif new.tournament_id is not null then
    perform notify(array(select user_id from competition_people(new.tournament_id)),
      case when new.kind = 'results' then 'results' else 'my_competitions' end, null, new.title, new.body, link, new.posted_by);
  elsif new.kind = 'case' then
    perform notify(array(select id from auth.users), 'case_release', lvl, new.title, new.body, link, new.posted_by);
  end if;
  return new;
end $$;
create trigger notify_bulletin after insert on bulletins for each row execute function notify_bulletin();

-- A competition opening for registration, and results being published.
create function notify_tournament() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'registration_open' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform notify(array(select id from auth.users), 'new_competition', new.level,
      'New competition: ' || new.name,
      to_char(new.start_date, 'Mon FMDD, YYYY') || ' in ' || coalesce(nullif(new.city, ''), new.host_name) || '. Registration closes ' || to_char(new.registration_deadline, 'Mon FMDD') || '.',
      '/tournament/' || new.id, new.director_ids[1]);
  end if;
  if tg_op = 'UPDATE' and new.results_published and not old.results_published then
    perform notify(array(select user_id from competition_people(new.id)), 'results', null,
      'Results are out: ' || new.name, 'Standings are now posted.', '/tournament/' || new.id, new.director_ids[1]);
  end if;
  return new;
end $$;
create trigger notify_tournament after insert or update on tournaments for each row execute function notify_tournament();

-- Chat: everyone who can read that room, except the author.
create function notify_message() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t tournaments;
begin
  select * into t from tournaments where id = new.tournament_id;
  perform notify(array(
      select cp.user_id from competition_people(new.tournament_id) cp
      where new.channel = 'all'
         or cp.user_id = any(t.director_ids)
         or (new.channel = 'judges' and exists (select 1 from judge_signups where tournament_id = t.id and user_id = cp.user_id and status = 'approved'))
         or (new.channel = 'coaches' and exists (select 1 from registrations r join team_members tm on tm.team_id = r.team_id
               where r.tournament_id = t.id and r.status = 'approved' and tm.user_id = cp.user_id and tm.role = 'coach'))),
    'chat', null, new.author_name || ' · ' || t.name, left(new.body, 200), '/tournament/' || t.id, new.author_id);
  return new;
end $$;
create trigger notify_message after insert on messages for each row execute function notify_message();

-- Who is looking for judging: competitions whose organizers asked for judges, for the "Open judging" list.
-- (Bulletins are already public; this view only saves the app a join.)
create view judge_calls as
  select b.id, b.tournament_id, b.title, b.body, b.posted_at, t.level, t.name, t.start_date, t.city
  from bulletins b join tournaments t on t.id = b.tournament_id
  where b.kind = 'judges_needed' and t.end_date >= current_date and t.status <> 'draft';

revoke execute on function competition_people(text), wants(uuid, text, level), notify(uuid[], text, level, text, text, text, uuid) from public, anon, authenticated;
alter publication supabase_realtime add table notifications;
