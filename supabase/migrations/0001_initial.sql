-- Mock trial platform: initial schema.
-- Column names are snake_case versions of the app's TypeScript fields (src/lib/types.ts).
-- Every competition-facing table carries `level` so law school, collegiate and
-- high school circuits share one database.

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
  program_id text not null references programs on delete cascade,
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
  side_constraint text not null default 'alternate',
  pairing_method text not null default 'power',
  require_approval boolean not null default true,
  case_id text references cases,
  description text not null default '',
  status text not null default 'draft',
  director_ids uuid[] not null,
  staff_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table registrations (
  id text primary key,
  tournament_id text not null references tournaments on delete cascade,
  team_id text not null references teams,
  status text not null default 'pending',
  contact_name text not null,
  contact_email text not null,
  submitted_by uuid not null references auth.users,
  created_at text not null
);

create table matches (
  id text primary key,
  tournament_id text not null references tournaments on delete cascade,
  round int not null,
  starts_at text not null,
  courtroom text not null,
  p_team_id text not null references teams,
  d_team_id text not null references teams
);

create table ballots (
  id text primary key,
  match_id text not null references matches on delete cascade,
  judge text not null,
  p_score numeric not null,
  d_score numeric not null,
  entered_by text not null,
  entered_at text not null
);

create table case_files (
  id text primary key,
  case_id text not null references cases on delete cascade,
  label text not null,
  version text not null,
  url text,
  added_at text not null
);

create table bulletins (
  id text primary key,
  level level not null,
  tournament_id text references tournaments on delete cascade,
  case_id text references cases on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  posted_at text not null,
  posted_by uuid not null references auth.users
);

create table recordings (
  id text primary key,
  match_id text not null references matches on delete cascade,
  title text not null,
  provider text not null default 'link',
  url text not null,
  visibility text not null default 'teams' check (visibility in ('teams', 'coaches', 'public')),
  uploaded_by uuid not null references auth.users,
  created_at text not null
);

-- ---------- Helpers ----------

create function is_director(t_id text) returns boolean language sql stable security definer as $$
  select exists (select 1 from tournaments where id = t_id and auth.uid() = any(director_ids));
$$;

create function is_scorer(t_id text) returns boolean language sql stable security definer as $$
  select exists (select 1 from tournaments where id = t_id and (auth.uid() = any(director_ids) or auth.uid() = any(staff_ids)));
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
alter table matches enable row level security;
alter table ballots enable row level security;
alter table case_files enable row level security;
alter table bulletins enable row level security;
alter table recordings enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- Public directory data: anyone reads, signed-in users add.
create policy "read programs" on programs for select using (true);
create policy "add programs" on programs for insert to authenticated with check (true);
create policy "read teams" on teams for select using (true);
create policy "add teams" on teams for insert to authenticated with check (true);

-- Any signed-in person can create a competition and becomes its director.
create policy "read tournaments" on tournaments for select using (status <> 'draft' or auth.uid() = any(director_ids));
create policy "create tournament" on tournaments for insert to authenticated with check (auth.uid() = any(director_ids));
create policy "director edits" on tournaments for update using (auth.uid() = any(director_ids));
create policy "director deletes" on tournaments for delete using (auth.uid() = any(director_ids));

-- Registrations: a team's contact details are visible only to the submitter and the director.
-- Confirmed team lists are public through the view below.
create policy "see own or directed" on registrations for select using (submitted_by = auth.uid() or is_director(tournament_id));
create policy "sign up" on registrations for insert to authenticated with check (submitted_by = auth.uid() and status in ('pending', 'approved', 'waitlisted'));
create policy "director reviews" on registrations for update using (is_director(tournament_id));
create policy "withdraw" on registrations for delete using (submitted_by = auth.uid() or is_director(tournament_id));
create view confirmed_teams with (security_invoker = false) as
  select tournament_id, team_id from registrations where status = 'approved';

-- Pairings: public; director posts.
create policy "read matches" on matches for select using (true);
create policy "director pairs" on matches for all using (is_director(tournament_id)) with check (is_director(tournament_id));

-- Ballots: public; director and tab staff enter after each round.
create policy "read ballots" on ballots for select using (true);
create policy "staff score" on ballots for all
  using (is_scorer((select tournament_id from matches where id = match_id)))
  with check (is_scorer((select tournament_id from matches where id = match_id)));

-- Cases: summary is public; files unlock at release time for everyone but the author
-- and the directors of competitions using the case.
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
create policy "author manages files" on case_files for all using (
  exists (select 1 from cases c where c.id = case_id and (c.created_by = auth.uid()
    or exists (select 1 from tournaments t where t.case_id = c.id and auth.uid() = any(t.director_ids))))
) with check (
  exists (select 1 from cases c where c.id = case_id and (c.created_by = auth.uid()
    or exists (select 1 from tournaments t where t.case_id = c.id and auth.uid() = any(t.director_ids))))
);

-- Bulletins: public; posted by a competition's director or a case's author.
create policy "read bulletins" on bulletins for select using (true);
create policy "post bulletins" on bulletins for insert to authenticated with check (
  posted_by = auth.uid() and (
    (tournament_id is not null and is_director(tournament_id))
    or (case_id is not null and exists (select 1 from cases c where c.id = case_id and c.created_by = auth.uid()))
  )
);

-- Recordings: visibility enforced here, not just in the app.
create policy "watch recordings" on recordings for select using (
  visibility = 'public'
  or uploaded_by = auth.uid()
  or exists (select 1 from matches m where m.id = match_id and (
    is_scorer(m.tournament_id) or on_team(m.p_team_id) or on_team(m.d_team_id)
  ))
);
create policy "add recordings" on recordings for insert to authenticated with check (
  uploaded_by = auth.uid() and exists (select 1 from matches m where m.id = match_id and (
    is_scorer(m.tournament_id) or on_team(m.p_team_id) or on_team(m.d_team_id)
  ))
);

-- Case packets live in a private storage bucket.
insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false);
create policy "case authors upload" on storage.objects for insert to authenticated with check (bucket_id = 'case-files');

-- Live updates for scores, pairings and bulletins.
alter publication supabase_realtime add table matches, ballots, bulletins, tournaments, registrations;
