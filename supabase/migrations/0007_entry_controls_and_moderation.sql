-- Registration controls, organizer approval, rate limits and reports. Run after 0006_past_results.sql.
--
-- Same rule as 0002: the app is a convenience, so every limit here is enforced in the database.
--
-- Registration:
--   * An organizer can close registration (status 'registration_closed') and reopen it; nobody else can enter
--     a closed competition, even before the deadline.
--   * Optional limit on teams per school (max_teams_per_school).
--   * A coach can withdraw their own team. When a confirmed team leaves an open competition that confirms
--     automatically, the first team on the waitlist moves up.
-- Stopping fake competitions:
--   * A platform admin approves organizers. A competition from an organizer who is not approved yet stays
--     unlisted (only its organizers and admins can see it, and nobody can register) until an admin approves
--     the organizer or the competition. Because unlisted competitions can't be read, they never reach the
--     public ratings either.
--   * Admins can hide any competition (even a locked one) and delete bulletins and chat messages.
--   * Anyone signed in can report a competition, bulletin, message, case, team or person to the admins.
--   * Rate limits on creating competitions, registrations, teams, cases, bulletins, messages and reports.
--
-- After running this, make yourself an admin in the SQL editor (type your own email):
--   insert into platform_admins (user_id) select id from auth.users where email = 'you@example.org';

-- ---------- Admins ----------

create table platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table platform_admins enable row level security;  -- no policies: only the dashboard can change it

create function is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- True for requests from the app (the anon and authenticated roles), false for the dashboard and server jobs.
-- Reads the role the request set, so it gives the same answer inside security definer functions.
create function is_app_user() returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(nullif(current_setting('role', true), 'none'), current_user::text) in ('anon', 'authenticated');
$$;

-- ---------- Organizer approval ----------

create table organizer_requests (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  name text not null,
  school text not null,
  role text not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users,
  decided_at timestamptz,
  constraint org_req_sizes check (char_length(name) between 1 and 200 and char_length(school) between 1 and 200
    and char_length(role) between 1 and 200 and char_length(note) <= 1000)
);
alter table organizer_requests enable row level security;
create policy "see own request" on organizer_requests for select using (user_id = auth.uid() or is_admin());
create policy "ask to organize" on organizer_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
-- A rejected person may ask again with new details; it goes back to pending.
create policy "ask again" on organizer_requests for update using (user_id = auth.uid() and status = 'rejected')
  with check (user_id = auth.uid() and status = 'pending');
create policy "admin decides" on organizer_requests for update using (is_admin()) with check (is_admin());
create policy "admin removes request" on organizer_requests for delete using (is_admin());

create function guard_organizer_request() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if is_app_user() and not is_admin() then
    new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.requested_at := now();
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.decided_by := auth.uid(); new.decided_at := now();
  end if;
  return new;
end $$;
create trigger guard_organizer_request before insert or update on organizer_requests for each row execute function guard_organizer_request();
create trigger log_organizer_requests after insert or update or delete on organizer_requests for each row execute function log_change();

create function is_verified_organizer(uid uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from organizer_requests where user_id = uid and status = 'approved');
$$;

-- ---------- Competitions: listing, approval, hiding ----------

-- Competitions made before this change stay listed: the column starts true for existing rows (adding it fires
-- no triggers, so locked competitions are fine), then new rows default to false.
alter table tournaments
  add column approved boolean not null default true,
  add column hidden boolean not null default false,
  add column max_teams_per_school int check (max_teams_per_school between 1 and 20);
alter table tournaments alter column approved set default false;

-- Only admins change approved and hidden. A new competition is approved at once if its organizer is.
create function guard_listing() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_app_user() or is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hidden := false;
    new.approved := is_verified_organizer(auth.uid());
  else
    new.hidden := old.hidden;
    new.approved := old.approved or (not old.hidden and is_verified_organizer(auth.uid()));
  end if;
  return new;
end $$;
create trigger guard_listing before insert or update on tournaments for each row execute function guard_listing();

drop policy "read tournaments" on tournaments;
create policy "read tournaments" on tournaments for select using (
  (status <> 'draft' and approved and not hidden) or auth.uid() = any(director_ids) or is_admin()
);
create policy "admin moderates" on tournaments for update using (is_admin()) with check (is_admin());

-- Approving an organizer lists the competitions they have already published.
create function organizer_decided() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update tournaments set approved = true where new.user_id = any(director_ids) and not hidden and not approved;
  end if;
  return new;
end $$;
create trigger organizer_decided after update on organizer_requests for each row execute function organizer_decided();

-- An admin may hide or list a locked competition; nothing else about it can change.
create or replace function reject_if_locked() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t_id text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'tournaments' then
    t_id := old.id;
    if tg_op = 'UPDATE' and is_admin() and (to_jsonb(new) - 'approved' - 'hidden') = (to_jsonb(old) - 'approved' - 'hidden') then
      return new;
    end if;
  elsif tg_table_name = 'ballots' then
    select tournament_id into t_id from matches where id = coalesce(new.match_id, old.match_id);
  else
    t_id := coalesce(new.tournament_id, old.tournament_id);
  end if;
  if tournament_locked(t_id) then
    raise exception 'This competition is final and locked. Contact a platform admin to correct it.';
  end if;
  return coalesce(new, old);
end $$;

-- Announce a competition when it becomes visible to everyone, not when an unapproved one is published.
create or replace function notify_tournament() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  listed boolean := new.status <> 'draft' and new.approved and not new.hidden;
  was_listed boolean := tg_op = 'UPDATE' and old.status <> 'draft' and old.approved and not old.hidden;
begin
  if listed and not was_listed and new.status = 'registration_open' and (tg_op = 'INSERT' or old.status in ('draft', 'registration_open')) then
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

create or replace view judge_calls as
  select b.id, b.tournament_id, b.title, b.body, b.posted_at, t.level, t.name, t.start_date, t.city
  from bulletins b join tournaments t on t.id = b.tournament_id
  where b.kind = 'judges_needed' and t.end_date >= current_date and t.status <> 'draft' and t.approved and not t.hidden;

-- ---------- Registration controls ----------

alter table registrations drop constraint reg_status;
alter table registrations add constraint reg_status check (status in ('pending', 'approved', 'waitlisted', 'declined', 'withdrawn'));

-- A coach can take their own team out (and only that: status withdrawn).
create policy "coach withdraws" on registrations for update
  using (is_coach(team_id) and status <> 'withdrawn') with check (is_coach(team_id) and status = 'withdrawn');

create or replace function guard_registration() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t tournaments; prog text; n int;
begin
  select * into t from tournaments where id = new.tournament_id;
  if tg_op = 'UPDATE' and (new.tournament_id <> old.tournament_id or new.team_id <> old.team_id or new.submitted_by <> old.submitted_by) then
    raise exception 'A registration cannot be moved to another team or competition.';
  end if;
  if tg_op = 'INSERT' and is_app_user() and not (auth.uid() = any(t.director_ids)) then
    if t.status = 'draft' or not t.approved or t.hidden then raise exception 'This competition is not open yet.'; end if;
    if t.status <> 'registration_open' then raise exception 'The organizer has closed registration for this competition.'; end if;
    if current_date > t.registration_deadline then raise exception 'Registration for this competition has closed.'; end if;
  end if;
  -- Teams per school: counted across every entry that is still in (pending, confirmed or waitlisted).
  if t.max_teams_per_school is not null and new.status in ('pending', 'approved', 'waitlisted')
     and (tg_op = 'INSERT' or old.status in ('declined', 'withdrawn')) then
    select program_id into prog from teams where id = new.team_id;
    perform pg_advisory_xact_lock(hashtext(new.tournament_id || ':school'));
    select count(*) into n from registrations r join teams tm on tm.id = r.team_id
      where r.tournament_id = new.tournament_id and tm.program_id = prog and r.id <> new.id and r.status in ('pending', 'approved', 'waitlisted');
    if n >= t.max_teams_per_school then
      raise exception 'This competition allows at most % team(s) per school.', t.max_teams_per_school;
    end if;
  end if;
  -- Never confirm past the team limit; extra teams go on the waitlist.
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    perform pg_advisory_xact_lock(hashtext(new.tournament_id));
    if (select count(*) from registrations where tournament_id = new.tournament_id and status = 'approved' and id <> new.id) >= t.team_cap then
      new.status := 'waitlisted';
    end if;
  end if;
  return new;
end $$;

-- When a confirmed team leaves an open, automatically confirmed competition, the first waitlisted team moves up.
create function promote_waitlist() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t tournaments; nxt text;
begin
  if old.status = 'approved' and new.status <> 'approved' then
    select * into t from tournaments where id = new.tournament_id;
    if t.entry_type = 'open' and not t.require_approval and not tournament_locked(t.id) then
      select id into nxt from registrations where tournament_id = t.id and status = 'waitlisted' order by created_at, id limit 1;
      if nxt is not null then
        update registrations set status = 'approved' where id = nxt;
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger promote_waitlist after update on registrations for each row execute function promote_waitlist();

-- ---------- Rate limits ----------
-- Each limited table gets inserted_at, set by the server, and a per-person count over a window.

alter table tournaments add column inserted_at timestamptz not null default now();
alter table registrations add column inserted_at timestamptz not null default now();
alter table teams add column inserted_at timestamptz not null default now();
alter table cases add column inserted_at timestamptz not null default now();
alter table bulletins add column inserted_at timestamptz not null default now();
alter table messages add column inserted_at timestamptz not null default now();

-- rate_limit(who-column, max per day, max per hour)
create function rate_limit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare col text := tg_argv[0]; per_day int := tg_argv[1]::int; per_hour int := tg_argv[2]::int; n_day int; n_hour int;
begin
  if not is_app_user() then
    return new;  -- the dashboard and server jobs are not limited
  end if;
  if tg_op = 'UPDATE' then
    new.inserted_at := old.inserted_at;
    return new;
  end if;
  new.inserted_at := now();
  if is_admin() then
    return new;
  end if;
  execute format('select count(*) filter (where inserted_at > now() - interval ''1 day''), count(*) filter (where inserted_at > now() - interval ''1 hour'')'
    || ' from %I where %s and inserted_at > now() - interval ''1 day''', tg_table_name,
    case when col = 'director_ids' then '$1 = any(director_ids)' else format('%I = $1', col) end)
    into n_day, n_hour using auth.uid();
  if n_day >= per_day or n_hour >= per_hour then
    raise exception 'Too many in a short time. Please wait and try again, or contact the site if you need more.';
  end if;
  return new;
end $$;

create trigger rate_tournaments before insert or update on tournaments for each row execute function rate_limit('director_ids', '5', '3');
create trigger rate_registrations before insert or update on registrations for each row execute function rate_limit('submitted_by', '40', '20');
create trigger rate_teams before insert or update on teams for each row execute function rate_limit('created_by', '20', '10');
create trigger rate_cases before insert or update on cases for each row execute function rate_limit('created_by', '10', '5');
create trigger rate_bulletins before insert or update on bulletins for each row execute function rate_limit('posted_by', '20', '10');
create trigger rate_messages before insert or update on messages for each row execute function rate_limit('author_id', '300', '60');

-- ---------- Reports ----------

create table reports (
  id bigserial primary key,
  kind text not null check (kind in ('tournament', 'bulletin', 'message', 'case', 'team', 'user')),
  target_id text not null check (char_length(target_id) <= 200),
  reason text not null check (reason in ('fake', 'spam', 'abusive', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  inserted_at timestamptz not null default now(),
  resolved_by uuid references auth.users,
  resolved_at timestamptz,
  unique (reporter, kind, target_id)
);
alter table reports enable row level security;
create policy "report" on reports for insert to authenticated with check (reporter = auth.uid() and status = 'open');
create policy "see own reports" on reports for select using (reporter = auth.uid() or is_admin());
create policy "admin handles reports" on reports for update using (is_admin()) with check (is_admin());
create trigger rate_reports before insert or update on reports for each row execute function rate_limit('reporter', '20', '10');

create function guard_report() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.resolved_by := auth.uid(); new.resolved_at := now();
  end if;
  if tg_op = 'INSERT' then new.created_at := now(); new.resolved_by := null; new.resolved_at := null; end if;
  return new;
end $$;
create trigger guard_report before insert or update on reports for each row execute function guard_report();

-- ---------- Admin removal ----------

create policy "admin removes bulletins" on bulletins for delete using (is_admin());
create policy "admin removes chat" on messages for delete using (is_admin());

-- ---------- Tell the admins ----------

create function admins() returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select user_id from platform_admins;
$$;

create function notify_admins_request() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    insert into notifications (user_id, kind, title, body, link)
    select a, 'admin', 'Organizer request: ' || left(new.name, 100), left(new.school || ' · ' || new.role, 500), '/admin' from admins() a;
  end if;
  return new;
end $$;
create function notify_admins_report() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notifications (user_id, kind, title, body, link)
  select a, 'admin', 'Report: ' || new.reason || ' ' || new.kind, left(new.details, 500), '/admin' from admins() a;
  return new;
end $$;
create function notify_admins_competition() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not new.approved then
    insert into notifications (user_id, kind, title, body, link)
    select a, 'admin', 'Competition waiting for review: ' || left(new.name, 100), 'From an organizer who is not approved yet.', '/admin' from admins() a;
  end if;
  return new;
end $$;
create trigger notify_admins_requests after insert or update on organizer_requests for each row execute function notify_admins_request();
create trigger notify_admins_reports after insert on reports for each row execute function notify_admins_report();
create trigger notify_admins_tournaments after insert on tournaments for each row execute function notify_admins_competition();

revoke execute on function is_verified_organizer(uuid), admins(), rate_limit(), guard_listing(), notify_admins_request(), notify_admins_report(),
  notify_admins_competition(), promote_waitlist(), organizer_decided()
  from public, anon;
