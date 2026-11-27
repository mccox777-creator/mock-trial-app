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
