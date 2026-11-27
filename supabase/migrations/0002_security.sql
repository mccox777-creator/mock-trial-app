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
