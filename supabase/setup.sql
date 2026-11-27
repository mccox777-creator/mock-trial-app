-- Mock trial app: full database setup (migrations 0001-0006 in order). Paste all of it into Supabase > SQL Editor > New query, then Run.

-- ===== supabase/migrations/0001_initial.sql =====
-- Mock trial platform: initial schema.
-- Column names are snake_case versions of the app's TypeScript fields (src/lib/types.ts).
-- Every competition-facing table carries `level` so law school, collegiate and
-- high school circuits share one database.
--
-- Data safety, in three layers:
--   1. Supabase daily backups + point-in-time recovery (enable PITR on the Pro plan).
--   2. change_log below: every insert, update and delete on competition data is kept,
--      with who did it and the full before/after row. Nothing is lost by a "delete".
--   3. A nightly export (see supabase/functions/nightly-export) to separate storage.
--
-- Locking: a competition locks when its organizer finalizes it, or automatically
-- 7 days after its last day. After that the database rejects every change to it,
-- from anyone, including the organizer.

create type level as enum ('law_school', 'collegiate', 'high_school');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  team_ids text[] not null default '{}'
);

create table programs (
  id text primary key,
  name text not null,
  level level not null,
  region text not null default ''
);

create table teams (
  id text primary key,
  program_id text not null references programs on delete restrict,
  name text not null,
  level level not null
);

create table cases (
  id text primary key,
  level level not null,
  title text not null,
  docket text not null default '',
  kind text not null check (kind in ('civil', 'criminal')),
  summary text not null default '',
  release_at timestamp not null,
  created_by uuid not null references auth.users
);

create table tournaments (
  id text primary key,
  level level not null,
  name text not null,
  host_program_id text references programs,
  host_name text not null default '',
  city text not null default '',
  venue text not null default '',
  start_date date not null,
  end_date date not null,
  registration_deadline date not null,
  team_cap int not null default 16,
  entry_fee numeric not null default 0,
  prelim_rounds int not null default 4,
  ballots_per_round int not null default 3,
  witnesses_per_side int not null default 3 check (witnesses_per_side between 1 and 5),
  side_constraint text not null default 'alternate',
  random_rounds int not null default 1 check (random_rounds between 1 and 4),
  pairing_method text not null default 'power',
  entry_type text not null default 'open' check (entry_type in ('open', 'invitational')),
  require_approval boolean not null default true,
  case_id text references cases,
  description text not null default '',
  rules jsonb not null default '{}'::jsonb,   -- ticked items from the rules checklist (src/lib/rules.ts)
  custom_rules text not null default '',
  status text not null default 'draft',
  director_ids uuid[] not null,
  results_published boolean not null default false,
  ballots_returned boolean not null default false,
  finalized_at text,
  created_at timestamptz not null default now()
);

create table registrations (
  id text primary key,
  tournament_id text not null references tournaments on delete restrict,
  team_id text not null references teams,
  status text not null default 'pending',
  contact_name text not null,
  contact_email text not null,
  note text,
  submitted_by uuid not null references auth.users,
  created_at text not null
);

create table judge_signups (
  id text primary key,
  tournament_id text not null references tournaments on delete restrict,
  user_id uuid not null references auth.users,
  name text not null,
  email text not null,
  background text not null,
  rounds int[] not null,
  conflicts text not null default '',
  status text not null default 'pending',
  created_at text not null,
  unique (tournament_id, user_id)
);

create table matches (
  id text primary key,
  tournament_id text not null references tournaments on delete restrict,
  round int not null,
  starts_at text not null,
  courtroom text not null,
  p_team_id text not null references teams,
  d_team_id text not null references teams,
  judge_ids uuid[] not null default '{}'
);

create table ballots (
  id text primary key,
  match_id text not null references matches on delete restrict,
  judge text not null,
  judge_id uuid references auth.users,
  source text not null default 'paper' check (source in ('app', 'paper')),
  sheet jsonb,
  p_score numeric not null,
  d_score numeric not null,
  entered_by text not null,
  entered_at text not null
);

create table case_files (
  id text primary key,
  case_id text not null references cases on delete restrict,
  label text not null,
  version text not null,
  url text,
  added_at text not null
);

create table bulletins (
  id text primary key,
  level level not null,
  tournament_id text references tournaments,
  case_id text references cases,
  kind text not null,
  title text not null,
  body text not null,
  posted_at text not null,
  posted_by uuid not null references auth.users
);

create table recordings (
  id text primary key,
  match_id text not null references matches,
  title text not null,
  provider text not null default 'link',
  url text not null,
  visibility text not null default 'teams' check (visibility in ('teams', 'coaches', 'public')),
  uploaded_by uuid not null references auth.users,
  created_at text not null
);

-- ---------- Change history (append-only) ----------

create table change_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  table_name text not null,
  row_id text not null,
  action text not null,
  before jsonb,
  after jsonb
);

create function log_change() returns trigger language plpgsql security definer as $$
begin
  insert into change_log (table_name, row_id, action, before, after)
  values (tg_table_name, coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger log_tournaments after insert or update or delete on tournaments for each row execute function log_change();
create trigger log_registrations after insert or update or delete on registrations for each row execute function log_change();
create trigger log_judge_signups after insert or update or delete on judge_signups for each row execute function log_change();
create trigger log_matches after insert or update or delete on matches for each row execute function log_change();
create trigger log_ballots after insert or update or delete on ballots for each row execute function log_change();
create trigger log_case_files after insert or update or delete on case_files for each row execute function log_change();

-- Nobody edits history: no policies are granted on change_log, so clients cannot read or write it.
alter table change_log enable row level security;

-- ---------- Locking ----------

create function tournament_locked(t_id text) returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tournaments
    where id = t_id and (finalized_at is not null or end_date + 7 <= current_date)
  );
$$;

create function reject_if_locked() returns trigger language plpgsql security definer as $$
declare t_id text;
begin
  if tg_table_name = 'tournaments' then
    t_id := old.id;
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

create trigger lock_tournaments before update or delete on tournaments for each row execute function reject_if_locked();
create trigger lock_registrations before insert or update or delete on registrations for each row execute function reject_if_locked();
create trigger lock_judge_signups before insert or update or delete on judge_signups for each row execute function reject_if_locked();
create trigger lock_matches before insert or update or delete on matches for each row execute function reject_if_locked();
create trigger lock_ballots before insert or update or delete on ballots for each row execute function reject_if_locked();

-- ---------- Helpers ----------

-- Called by the read-ballot function to confirm the caller organizes the competition.
create function is_director(t_id text) returns boolean language sql stable security definer as $$
  select exists (select 1 from tournaments where id = t_id and auth.uid() = any(director_ids));
$$;

create function on_team(team text) returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and team = any(team_ids));
$$;

-- ---------- Row level security ----------

alter table profiles enable row level security;
alter table programs enable row level security;
alter table teams enable row level security;
alter table cases enable row level security;
alter table tournaments enable row level security;
alter table registrations enable row level security;
alter table judge_signups enable row level security;
alter table matches enable row level security;
alter table ballots enable row level security;
alter table case_files enable row level security;
alter table bulletins enable row level security;
alter table recordings enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy "read programs" on programs for select using (true);
create policy "add programs" on programs for insert to authenticated with check (true);
create policy "read teams" on teams for select using (true);
create policy "add teams" on teams for insert to authenticated with check (true);

-- Any signed-in person can create a competition and becomes its organizer.
create policy "read tournaments" on tournaments for select using (status <> 'draft' or auth.uid() = any(director_ids));
create policy "create tournament" on tournaments for insert to authenticated with check (auth.uid() = any(director_ids) and finalized_at is null);
create policy "organizer edits" on tournaments for update using (auth.uid() = any(director_ids));
-- No delete policy: competitions are never deleted.

-- Registrations: contact details visible only to the submitter and the organizer.
create policy "see own or organized" on registrations for select using (submitted_by = auth.uid() or is_director(tournament_id));
create policy "sign up or request" on registrations for insert to authenticated with check (
  submitted_by = auth.uid() and (
    status = 'pending'
    or (status in ('approved', 'waitlisted') and exists (
      select 1 from tournaments t where t.id = tournament_id and t.entry_type = 'open' and not t.require_approval))
  )
);
create policy "organizer reviews" on registrations for update using (is_director(tournament_id));
-- Confirmed teams are public.
create view confirmed_teams as select tournament_id, team_id from registrations where status = 'approved';

-- Judges: volunteers see their own sign-up; the organizer sees and confirms all.
create policy "see own or organized" on judge_signups for select using (user_id = auth.uid() or is_director(tournament_id));
create policy "volunteer" on judge_signups for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "organizer confirms" on judge_signups for update using (is_director(tournament_id));

-- Pairings are public; only the organizer posts them and assigns judges.
create policy "read matches" on matches for select using (true);
create policy "organizer pairs" on matches for insert with check (is_director(tournament_id));
create policy "organizer edits pairings" on matches for update using (is_director(tournament_id));

-- Ballots: the organizer sees all; a judge sees their own; a team sees its own trials'
-- ballots only after the organizer publishes results and returns ballots.
create policy "read ballots" on ballots for select using (
  judge_id = auth.uid()
  or exists (select 1 from matches m join tournaments t on t.id = m.tournament_id where m.id = match_id and (
    auth.uid() = any(t.director_ids)
    or (t.results_published and t.ballots_returned and (on_team(m.p_team_id) or on_team(m.d_team_id)))
  ))
);
-- Assigned judges submit and revise their own ballot until results are published.
create policy "judge scores" on ballots for insert with check (
  judge_id = auth.uid() and source = 'app' and exists (
    select 1 from matches m join tournaments t on t.id = m.tournament_id
    where m.id = match_id and auth.uid() = any(m.judge_ids) and not t.results_published)
);
create policy "judge revises" on ballots for update using (
  judge_id = auth.uid() and exists (
    select 1 from matches m join tournaments t on t.id = m.tournament_id where m.id = match_id and not t.results_published)
);
-- The organizer enters paper ballots and corrects any ballot.
create policy "organizer enters" on ballots for all
  using (is_director((select tournament_id from matches where id = match_id)))
  with check (is_director((select tournament_id from matches where id = match_id)));

-- Public results: standings are computed from these rows, exposed only for published competitions.
create view published_results as
  select b.match_id, b.p_score, b.d_score
  from ballots b join matches m on m.id = b.match_id join tournaments t on t.id = m.tournament_id
  where t.results_published;

-- Cases: summary is public; files unlock at release time.
create policy "read cases" on cases for select using (true);
create policy "author creates" on cases for insert to authenticated with check (created_by = auth.uid());
create policy "author edits" on cases for update using (created_by = auth.uid());
create policy "read released files" on case_files for select using (
  exists (select 1 from cases c where c.id = case_id and (
    c.release_at <= (now() at time zone 'utc')
    or c.created_by = auth.uid()
    or exists (select 1 from tournaments t where t.case_id = c.id and auth.uid() = any(t.director_ids))
  ))
);
create policy "author adds files" on case_files for insert with check (
  exists (select 1 from cases c where c.id = case_id and (c.created_by = auth.uid()
    or exists (select 1 from tournaments t where t.case_id = c.id and auth.uid() = any(t.director_ids))))
);

create policy "read bulletins" on bulletins for select using (true);
create policy "post bulletins" on bulletins for insert to authenticated with check (
  posted_by = auth.uid() and (
    (tournament_id is not null and is_director(tournament_id))
    or (case_id is not null and exists (select 1 from cases c where c.id = case_id and c.created_by = auth.uid()))
  )
);

create policy "watch recordings" on recordings for select using (
  visibility = 'public'
  or uploaded_by = auth.uid()
  or exists (select 1 from matches m where m.id = match_id and (
    is_director(m.tournament_id) or on_team(m.p_team_id) or on_team(m.d_team_id)
  ))
);
create policy "add recordings" on recordings for insert to authenticated with check (
  uploaded_by = auth.uid() and exists (select 1 from matches m where m.id = match_id and (
    is_director(m.tournament_id) or on_team(m.p_team_id) or on_team(m.d_team_id)
  ))
);

insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false);
insert into storage.buckets (id, name, public) values ('backups', 'backups', false); -- service role only
create policy "case authors upload" on storage.objects for insert to authenticated with check (bucket_id = 'case-files');

alter publication supabase_realtime add table matches, ballots, bulletins, tournaments, registrations, judge_signups;

-- ===== supabase/migrations/0002_security.sql =====
-- Security hardening. Run after 0001_initial.sql.
--
-- The rule behind every change here: the app is only a convenience. Anyone can call the
-- database directly with the public key, so every promise the app makes (who sees scores,
-- who can change what, when things lock) has to be enforced here, in the database.
--
-- What this closes:
--   * Team membership was self-service: a user could add any team to their own profile and
--     then read that team's returned ballots and recordings. Membership now lives in
--     team_members, granted only by the team's coach.
--   * Several update rules checked the row before the change but not after it, so an
--     assigned judge could move their ballot onto a different trial, and an organizer could
--     move a registration, sign-up or pairing into someone else's competition.
--   * A judge could submit more than one ballot for the same trial, or type any total.
--     Now one ballot per judge per trial, every line is 1 to 10, and totals are computed here.
--   * An organizer could push the last day later to dodge the 7-day lock. Dates freeze once
--     results are published.
--   * Team caps and registration deadlines were only checked in the app.
--   * Anyone signed in could upload any file to the case-files bucket, and case files had no
--     download rule. Uploads now go under the case's folder, only its author or organizer can
--     add files, and nobody else can download before the release time.
--   * Links (recordings, case files) must be https, so a stored link can't run script.
--   * security-definer functions now pin search_path; helper functions are not callable
--     anonymously; free-text and JSON fields have size limits.
--   * Ballot photo reading is limited per organizer per day (see claim_ballot_scan).

-- ---------- Pin search_path on the functions from 0001 ----------

alter function log_change() set search_path = public, pg_temp;
alter function tournament_locked(text) set search_path = public, pg_temp;
alter function reject_if_locked() set search_path = public, pg_temp;
alter function is_director(text) set search_path = public, pg_temp;

-- ---------- Profiles are created by the server, not the client ----------

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, name) values (new.id, '') on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
insert into profiles (id) select id from auth.users on conflict (id) do nothing;

drop policy "own profile" on profiles;
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "edit own name" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- team_ids is a read-only mirror of team_members, kept up to date by the server.
create function guard_profile() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') and new.team_ids is distinct from old.team_ids then
    raise exception 'Team membership is managed by each team''s coach.';
  end if;
  return new;
end $$;
create trigger guard_profile before update on profiles for each row execute function guard_profile();

-- ---------- Team membership ----------

alter table teams add column created_by uuid references auth.users default auth.uid();

create table team_members (
  team_id text not null references teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('coach', 'competitor')),
  added_by uuid references auth.users default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table team_members enable row level security;

create function is_coach(team text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from team_members where team_id = team and user_id = auth.uid() and role = 'coach');
$$;

create or replace function on_team(team text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from team_members where team_id = team and user_id = auth.uid());
$$;

-- Whoever creates a team becomes its first coach.
create function team_creator_is_coach() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.created_by is not null then
    insert into team_members (team_id, user_id, role, added_by) values (new.id, new.created_by, 'coach', new.created_by)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger team_creator_is_coach after insert on teams for each row execute function team_creator_is_coach();

-- Keep profiles.team_ids in step with team_members.
create function sync_team_ids() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  update profiles set team_ids = coalesce((select array_agg(team_id order by team_id) from team_members where user_id = uid), '{}')
  where id = uid;
  return null;
end $$;
create trigger sync_team_ids after insert or delete on team_members for each row execute function sync_team_ids();
create trigger log_team_members after insert or update or delete on team_members for each row execute function log_change();

-- log_change() reads new.id; team_members has a composite key, so give it a row_id.
create or replace function log_change() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into change_log (table_name, row_id, action, before, after)
  values (tg_table_name, coalesce(r->>'id', concat_ws(':', r->>'team_id', r->>'user_id')), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create policy "see own teams" on team_members for select using (user_id = auth.uid() or on_team(team_id));
create policy "coach adds" on team_members for insert to authenticated with check (is_coach(team_id) and added_by = auth.uid());
create policy "coach removes, or leave" on team_members for delete using (is_coach(team_id) or user_id = auth.uid());

-- Coaches add teammates by email. Says only whether it worked, so it can't be used to
-- look up who has an account beyond a coach's own team.
create function add_team_member(p_team text, p_email text, p_role text default 'competitor') returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  if not is_coach(p_team) then raise exception 'Only a coach of this team can add members.'; end if;
  if p_role not in ('coach', 'competitor') then raise exception 'Role must be coach or competitor.'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return false; end if;
  insert into team_members (team_id, user_id, role, added_by) values (p_team, uid, p_role, auth.uid())
  on conflict (team_id, user_id) do update set role = excluded.role;
  return true;
end $$;

drop policy "add teams" on teams;
create policy "add teams" on teams for insert to authenticated with check (created_by = auth.uid());
create policy "coach renames" on teams for update using (is_coach(id)) with check (is_coach(id));

-- ---------- Competitions ----------

drop policy "create tournament" on tournaments;
create policy "create tournament" on tournaments for insert to authenticated with check (
  director_ids = array[auth.uid()] and finalized_at is null and not results_published
);
drop policy "organizer edits" on tournaments;
create policy "organizer edits" on tournaments for update
  using (auth.uid() = any(director_ids)) with check (auth.uid() = any(director_ids));

alter table tournaments
  add constraint dates_in_order check (end_date >= start_date and registration_deadline <= end_date),
  add constraint sane_sizes check (team_cap between 2 and 256 and prelim_rounds between 1 and 8 and ballots_per_round between 1 and 5 and entry_fee between 0 and 100000),
  add constraint text_sizes check (char_length(name) <= 200 and char_length(description) <= 4000 and char_length(custom_rules) <= 4000
    and char_length(host_name) <= 200 and char_length(city) <= 200 and char_length(venue) <= 200),
  add constraint rules_size check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) <= 8000);

create function guard_tournament() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'A competition''s id and creation time cannot change.';
  end if;
  -- Moving the dates after results are out would push back the automatic lock.
  if (old.results_published or old.end_date < current_date) and (new.start_date <> old.start_date or new.end_date <> old.end_date) then
    raise exception 'Dates cannot change once the competition is over or results are published.';
  end if;
  if old.finalized_at is not null and new.finalized_at is distinct from old.finalized_at then
    raise exception 'A finalized competition cannot be reopened.';
  end if;
  return new;
end $$;
create trigger guard_tournament before update on tournaments for each row execute function guard_tournament();

-- ---------- Registrations ----------

alter table registrations
  add constraint one_entry_per_team unique (tournament_id, team_id),
  add constraint reg_text_sizes check (char_length(contact_name) <= 200 and char_length(contact_email) <= 320 and char_length(coalesce(note, '')) <= 1000),
  add constraint reg_status check (status in ('pending', 'approved', 'waitlisted', 'declined'));

drop policy "sign up or request" on registrations;
create policy "sign up or request" on registrations for insert to authenticated with check (
  submitted_by = auth.uid() and is_coach(team_id) and (
    status = 'pending'
    or (status in ('approved', 'waitlisted') and exists (
      select 1 from tournaments t where t.id = tournament_id and t.entry_type = 'open' and not t.require_approval))
  )
);
drop policy "organizer reviews" on registrations;
create policy "organizer reviews" on registrations for update
  using (is_director(tournament_id)) with check (is_director(tournament_id));

create function guard_registration() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t tournaments;
begin
  select * into t from tournaments where id = new.tournament_id;
  if tg_op = 'UPDATE' and (new.tournament_id <> old.tournament_id or new.team_id <> old.team_id or new.submitted_by <> old.submitted_by) then
    raise exception 'A registration cannot be moved to another team or competition.';
  end if;
  if tg_op = 'INSERT' and not (auth.uid() = any(t.director_ids)) then
    if t.status = 'draft' then raise exception 'This competition is not open yet.'; end if;
    if current_date > t.registration_deadline then raise exception 'Registration for this competition has closed.'; end if;
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
create trigger guard_registration before insert or update on registrations for each row execute function guard_registration();

-- ---------- Judges ----------

alter table judge_signups
  add constraint js_status check (status in ('pending', 'approved', 'declined')),
  add constraint js_text_sizes check (char_length(name) <= 200 and char_length(email) <= 320 and char_length(background) <= 40
    and char_length(conflicts) <= 1000 and cardinality(rounds) <= 8);

drop policy "volunteer" on judge_signups;
create policy "volunteer" on judge_signups for insert to authenticated with check (
  user_id = auth.uid() and status = 'pending'
  and exists (select 1 from tournaments t where t.id = tournament_id and t.status <> 'draft')
);
drop policy "organizer confirms" on judge_signups;
create policy "organizer confirms" on judge_signups for update
  using (is_director(tournament_id)) with check (is_director(tournament_id));

create function guard_judge_signup() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.tournament_id <> old.tournament_id or new.user_id <> old.user_id then
    raise exception 'A judge sign-up cannot be moved to another person or competition.';
  end if;
  return new;
end $$;
create trigger guard_judge_signup before update on judge_signups for each row execute function guard_judge_signup();

-- ---------- Pairings ----------

alter table matches add constraint different_teams check (p_team_id <> d_team_id),
  add constraint sane_round check (round between 1 and 12 and cardinality(judge_ids) <= 7 and char_length(courtroom) <= 100);

drop policy "organizer pairs" on matches;
create policy "organizer pairs" on matches for insert to authenticated with check (is_director(tournament_id));
drop policy "organizer edits pairings" on matches;
create policy "organizer edits pairings" on matches for update
  using (is_director(tournament_id)) with check (is_director(tournament_id));

create function guard_match() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare j uuid;
begin
  if tg_op = 'UPDATE' and new.tournament_id <> old.tournament_id then
    raise exception 'A trial cannot be moved to another competition.';
  end if;
  if not exists (select 1 from registrations where tournament_id = new.tournament_id and team_id = new.p_team_id and status = 'approved')
     or not exists (select 1 from registrations where tournament_id = new.tournament_id and team_id = new.d_team_id and status = 'approved') then
    raise exception 'Both teams must be confirmed in this competition.';
  end if;
  -- Only confirmed judges (or the organizer) can be put on a trial, so only they can score it.
  foreach j in array new.judge_ids loop
    if not exists (select 1 from judge_signups where tournament_id = new.tournament_id and user_id = j and status = 'approved')
       and not exists (select 1 from tournaments where id = new.tournament_id and j = any(director_ids)) then
      raise exception 'Only confirmed judges can be assigned to a trial.';
    end if;
  end loop;
  return new;
end $$;
create trigger guard_match before insert or update on matches for each row execute function guard_match();

-- ---------- Ballots ----------

create unique index one_ballot_per_judge on ballots (match_id, judge_id) where judge_id is not null;
alter table ballots
  add constraint score_range check (p_score between 0 and 1000 and d_score between 0 and 1000),
  add constraint sheet_size check (sheet is null or pg_column_size(sheet) <= 4000),
  add constraint ballot_text_sizes check (char_length(judge) <= 200 and char_length(entered_by) <= 200);

drop policy "judge scores" on ballots;
create policy "judge scores" on ballots for insert to authenticated with check (
  judge_id = auth.uid() and source = 'app' and exists (
    select 1 from matches m join tournaments t on t.id = m.tournament_id
    where m.id = match_id and auth.uid() = any(m.judge_ids) and not t.results_published)
);
drop policy "judge revises" on ballots;
create policy "judge revises" on ballots for update
  using (judge_id = auth.uid() and exists (
    select 1 from matches m join tournaments t on t.id = m.tournament_id
    where m.id = match_id and auth.uid() = any(m.judge_ids) and not t.results_published))
  with check (judge_id = auth.uid() and source = 'app' and exists (
    select 1 from matches m join tournaments t on t.id = m.tournament_id
    where m.id = match_id and auth.uid() = any(m.judge_ids) and not t.results_published));

create function guard_ballot() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; i int; organizer boolean;
begin
  if tg_op = 'UPDATE' and (new.match_id <> old.match_id or new.judge_id is distinct from old.judge_id) then
    raise exception 'A ballot cannot be moved to another trial or judge.';
  end if;
  select auth.uid() = any(t.director_ids) into organizer
    from matches m join tournaments t on t.id = m.tournament_id where m.id = new.match_id;
  if new.sheet is null then
    -- Totals-only entry is for the organizer's paper ballots. Judges score line by line.
    if not coalesce(organizer, false) and auth.uid() is not null then
      raise exception 'Judges score each line of the sheet.';
    end if;
    return new;
  end if;
  if jsonb_typeof(new.sheet->'p') <> 'array' or jsonb_typeof(new.sheet->'d') <> 'array' then
    raise exception 'Score sheet is malformed.';
  end if;
  n := jsonb_array_length(new.sheet->'p');
  if n <> jsonb_array_length(new.sheet->'d') or n < 1 or n > 40 then
    raise exception 'Score sheet is malformed.';
  end if;
  for i in 0 .. n - 1 loop
    if jsonb_typeof(new.sheet->'p'->i) <> 'number' or jsonb_typeof(new.sheet->'d'->i) <> 'number'
       or (new.sheet->'p'->>i)::numeric not in (1,2,3,4,5,6,7,8,9,10)
       or (new.sheet->'d'->>i)::numeric not in (1,2,3,4,5,6,7,8,9,10) then
      raise exception 'Each line is scored from 1 to 10.';
    end if;
  end loop;
  -- Totals always come from the lines, never from what the client sent.
  select sum(v::numeric) into new.p_score from jsonb_array_elements_text(new.sheet->'p') v;
  select sum(v::numeric) into new.d_score from jsonb_array_elements_text(new.sheet->'d') v;
  return new;
end $$;
create trigger guard_ballot before insert or update on ballots for each row execute function guard_ballot();

-- ---------- Cases, files, links ----------

alter table cases add constraint case_text_sizes check (char_length(title) <= 300 and char_length(docket) <= 100 and char_length(summary) <= 8000);
drop policy "author edits" on cases;
create policy "author edits" on cases for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create function can_edit_case(c_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from cases c where c.id = c_id and (
    c.created_by = auth.uid()
    or exists (select 1 from tournaments t where t.case_id = c.id and auth.uid() = any(t.director_ids))));
$$;
create function case_released(c_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from cases where id = c_id and release_at <= (now() at time zone 'utc'));
$$;

-- Files are stored privately and referenced as storage:<path>; the app asks for a short-lived link.
alter table case_files add constraint safe_link check (url is null or url ~ '^(https://|storage:case-files/)'),
  add constraint cf_text_sizes check (char_length(label) <= 200 and char_length(version) <= 40);
alter table recordings add constraint safe_link check (url ~ '^https://'),
  add constraint rec_text_sizes check (char_length(title) <= 200 and char_length(url) <= 2000);
alter table bulletins add constraint bulletin_text_sizes check (char_length(title) <= 200 and char_length(body) <= 10000);

drop policy "author adds files" on case_files;
create policy "author adds files" on case_files for insert to authenticated with check (can_edit_case(case_id));

drop policy "case authors upload" on storage.objects;
create policy "case authors upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'case-files' and can_edit_case((storage.foldername(name))[1])
);
create policy "download released case files" on storage.objects for select using (
  bucket_id = 'case-files' and (case_released((storage.foldername(name))[1]) or can_edit_case((storage.foldername(name))[1]))
);
update storage.buckets set file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
  where id = 'case-files';

-- ---------- Ballot photo reading: daily limit per organizer ----------

create table ballot_scans (
  id bigserial primary key,
  user_id uuid not null default auth.uid(),
  match_id text not null,
  at timestamptz not null default now()
);
alter table ballot_scans enable row level security; -- no policies: only claim_ballot_scan() writes it

create function claim_ballot_scan(p_match text) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from matches m where m.id = p_match and is_director(m.tournament_id)) then return false; end if;
  if (select count(*) from ballot_scans where user_id = auth.uid() and at > now() - interval '1 day') >= 300 then return false; end if;
  insert into ballot_scans (match_id) values (p_match);
  return true;
end $$;

-- ---------- Privileges ----------

-- Nobody but the server touches history or scan counts.
revoke all on change_log, ballot_scans from anon, authenticated;
-- RLS does not cover TRUNCATE.
revoke truncate on all tables in schema public from anon, authenticated;
-- Signed-out visitors can read public pages but never call helpers or change data.
revoke insert, update, delete on all tables in schema public from anon;

revoke execute on all functions in schema public from public, anon;
-- Read rules call these for every visitor, signed in or not; they only answer about the caller.
grant execute on function is_director(text), on_team(text), is_coach(text), tournament_locked(text),
  can_edit_case(text), case_released(text) to anon, authenticated;
grant execute on function add_team_member(text, text, text), claim_ballot_scan(text) to authenticated;

alter publication supabase_realtime add table team_members;

-- ===== supabase/migrations/0003_scoring_and_video.sql =====
-- Score sheet setup and YouTube recordings. Run after 0002_security.sql.

-- How judges score: the scale (1-10 or 1-15) and which parts of the trial get a line.
alter table tournaments add column scoring jsonb not null
  default '{"max": 10, "parts": ["opening", "direct", "witness", "cross", "closing"], "extra": []}'::jsonb;
alter table tournaments add constraint scoring_shape check (
  (scoring->>'max')::int in (10, 15)
  and jsonb_typeof(scoring->'parts') = 'array'
  and jsonb_typeof(scoring->'extra') = 'array'
  and jsonb_array_length(scoring->'extra') <= 6
  and pg_column_size(scoring) <= 2000
);

-- The scale can't change once anyone has scored, or old ballots would be on a different scale.
create function guard_scoring() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.scoring is distinct from old.scoring
     and exists (select 1 from ballots b join matches m on m.id = b.match_id where m.tournament_id = new.id) then
    raise exception 'The score sheet can''t change after ballots are in.';
  end if;
  return new;
end $$;
create trigger guard_scoring before update on tournaments for each row execute function guard_scoring();

-- Ballot lines are checked against the competition's own scale.
create or replace function guard_ballot() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; i int; organizer boolean; top int;
begin
  if tg_op = 'UPDATE' and (new.match_id <> old.match_id or new.judge_id is distinct from old.judge_id) then
    raise exception 'A ballot cannot be moved to another trial or judge.';
  end if;
  select auth.uid() = any(t.director_ids), coalesce((t.scoring->>'max')::int, 10) into organizer, top
    from matches m join tournaments t on t.id = m.tournament_id where m.id = new.match_id;
  if new.sheet is null then
    -- Totals-only entry is for the organizer's paper ballots. Judges score line by line.
    if not coalesce(organizer, false) and auth.uid() is not null then
      raise exception 'Judges score each line of the sheet.';
    end if;
    return new;
  end if;
  if jsonb_typeof(new.sheet->'p') <> 'array' or jsonb_typeof(new.sheet->'d') <> 'array' then
    raise exception 'Score sheet is malformed.';
  end if;
  n := jsonb_array_length(new.sheet->'p');
  if n <> jsonb_array_length(new.sheet->'d') or n < 1 or n > 40 then
    raise exception 'Score sheet is malformed.';
  end if;
  for i in 0 .. n - 1 loop
    if jsonb_typeof(new.sheet->'p'->i) <> 'number' or jsonb_typeof(new.sheet->'d'->i) <> 'number'
       or (new.sheet->'p'->>i)::numeric <> trunc((new.sheet->'p'->>i)::numeric)
       or (new.sheet->'d'->>i)::numeric <> trunc((new.sheet->'d'->>i)::numeric)
       or (new.sheet->'p'->>i)::numeric not between 1 and coalesce(top, 10)
       or (new.sheet->'d'->>i)::numeric not between 1 and coalesce(top, 10) then
      raise exception 'Each line is scored from 1 to %.', coalesce(top, 10);
    end if;
  end loop;
  -- Totals always come from the lines, never from what the client sent.
  select sum(v::numeric) into new.p_score from jsonb_array_elements_text(new.sheet->'p') v;
  select sum(v::numeric) into new.d_score from jsonb_array_elements_text(new.sheet->'d') v;
  return new;
end $$;

-- Round video lives on YouTube (unlisted); the app stores a clean watch link.
alter table recordings drop constraint safe_link;
alter table recordings add constraint youtube_link check (url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{6,20}$') not valid;
alter table recordings alter column provider set default 'youtube';

-- Restoring from a backup runs with the service-role key (never shipped in the app). It must be
-- able to put back ballots for competitions that are already locked, so the lock lets it through.
-- Every row it writes is still recorded in change_log.
create or replace function reject_if_locked() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t_id text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'tournaments' then
    t_id := old.id;
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

-- ---------- Ballot comments and ranking ----------

alter table tournaments drop constraint scoring_shape;
alter table tournaments add constraint scoring_shape check (
  (scoring->>'max')::int in (10, 15)
  and jsonb_typeof(scoring->'parts') = 'array'
  and jsonb_typeof(scoring->'extra') = 'array'
  and jsonb_array_length(scoring->'extra') <= 6
  and coalesce(scoring->>'comments', 'overall') in ('none', 'overall', 'per_line', 'both')
  and pg_column_size(scoring) <= 2000
);
alter table tournaments add column rank_by text not null default 'ballots' check (rank_by in ('ballots', 'wins'));

-- Judges' written comments ride with the ballot, so they follow the same visibility rules.
alter table ballots add column comments jsonb check (comments is null or (jsonb_typeof(comments) = 'object' and pg_column_size(comments) <= 30000));

-- Public standings: totals only (no judge, no lines, no comments), for published competitions.
drop view published_results;
create view published_results as
  select b.id, b.match_id, b.p_score, b.d_score
  from ballots b join matches m on m.id = b.match_id join tournaments t on t.id = m.tournament_id
  where t.results_published;

-- ---------- Competition chat ----------
-- Group channels only; there are no private messages, so no adult can message a student privately.
-- In high school competitions students can read but not post: their coach speaks for the team.

alter table tournaments add column chat_replies boolean not null default true; -- false: announcements only

create function chat_role(t_id text) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (select 1 from tournaments where id = t_id and auth.uid() = any(director_ids)) then 'organizer'
    when exists (select 1 from judge_signups where tournament_id = t_id and user_id = auth.uid() and status = 'approved') then 'judge'
    when exists (select 1 from registrations r join team_members tm on tm.team_id = r.team_id
                 where r.tournament_id = t_id and r.status = 'approved' and tm.user_id = auth.uid() and tm.role = 'coach') then 'coach'
    when exists (select 1 from registrations r join team_members tm on tm.team_id = r.team_id
                 where r.tournament_id = t_id and r.status = 'approved' and tm.user_id = auth.uid()) then 'competitor'
  end;
$$;

create table messages (
  id text primary key,
  tournament_id text not null references tournaments on delete restrict,
  channel text not null default 'all' check (channel in ('all', 'judges', 'coaches')),
  author_id uuid not null default auth.uid() references auth.users,
  author_name text not null default '',
  author_role text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table messages enable row level security;
create index messages_by_competition on messages (tournament_id, created_at);

create policy "read chat" on messages for select using (
  case chat_role(tournament_id)
    when 'organizer' then true
    when 'judge' then channel in ('all', 'judges')
    when 'coach' then channel in ('all', 'coaches')
    when 'competitor' then channel = 'all'
    else false
  end
);

create policy "post in chat" on messages for insert to authenticated with check (
  author_id = auth.uid() and (
    chat_role(tournament_id) = 'organizer'
    or exists (select 1 from tournaments t where t.id = tournament_id and t.chat_replies and (
      (channel = 'judges' and chat_role(t.id) = 'judge')
      or (channel = 'coaches' and chat_role(t.id) = 'coach')
      or (channel = 'all' and (
        chat_role(t.id) in ('judge', 'coach')
        or (chat_role(t.id) = 'competitor' and t.level <> 'high_school')))
    ))
  )
);
-- Authors can take back their own message; the organizer can remove any (moderation). Removals are logged.
create policy "delete chat" on messages for delete using (author_id = auth.uid() or chat_role(tournament_id) = 'organizer');

-- Name and role come from the server, so nobody can post as "Organizer". Also a simple flood limit.
create function stamp_message() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.author_role := coalesce(chat_role(new.tournament_id), '');
  new.author_name := coalesce(
    nullif((select name from profiles where id = new.author_id), ''),
    (select name from judge_signups where tournament_id = new.tournament_id and user_id = new.author_id),
    initcap(new.author_role));
  new.created_at := now();
  if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little: too many messages in a minute.';
  end if;
  return new;
end $$;
create trigger stamp_message before insert on messages for each row execute function stamp_message();
create trigger log_messages after insert or update or delete on messages for each row execute function log_change();

revoke execute on function chat_role(text) from public;
grant execute on function chat_role(text) to anon, authenticated;
revoke insert, update, delete on messages from anon;
alter publication supabase_realtime add table messages;

-- ===== supabase/migrations/0004_notifications.sql =====
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

-- ===== supabase/migrations/0005_pairing_options.sql =====
-- Power-matching options chosen by the organizer.
alter table tournaments
  add column power_style text not null default 'high_high' check (power_style in ('high_high', 'high_low', 'slide')),
  add column bracketed boolean not null default false,
  add column avoid_same_school boolean not null default true;

-- side_constraint and pairing_method were free text; hold them to the values the app understands.
update tournaments set side_constraint = 'alternate' where side_constraint not in ('alternate', 'flip_even', 'balanced', 'none');
update tournaments set pairing_method = 'power' where pairing_method not in ('power', 'random');
alter table tournaments
  add constraint side_constraint_known check (side_constraint in ('alternate', 'flip_even', 'balanced', 'none')),
  add constraint pairing_method_known check (pairing_method in ('power', 'random'));

-- ===== supabase/migrations/0006_past_results.sql =====
-- Past competitions imported from the circuit's results record. Everyone can read them; only the import
-- script (service_role) writes them, so no app user can rewrite history.
create table past_events (
  id text primary key check (id ~ '^[a-z0-9-]{3,120}$'),
  level level not null,
  season text not null check (season ~ '^\d{4}-\d{2}$'),
  term text not null check (term in ('Fall', 'Spring')),
  name text not null check (length(name) between 1 and 300),
  host text check (length(host) <= 200),
  region text check (length(region) <= 200),
  dates text check (length(dates) <= 100),
  team_count int check (team_count between 1 and 500),
  school_count int check (school_count between 1 and 500),
  results jsonb not null default '[]' check (jsonb_typeof(results) = 'array' and pg_column_size(results) < 20000),
  participants jsonb not null default '[]' check (jsonb_typeof(participants) = 'array' and pg_column_size(participants) < 20000),
  needs_review boolean not null default false,
  ord int not null default 0
);
create index past_events_level_season on past_events (level, season);

alter table past_events enable row level security;
create policy past_events_read on past_events for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on past_events from anon, authenticated;

create trigger log_past_events after insert or update or delete on past_events for each row execute function log_change();
