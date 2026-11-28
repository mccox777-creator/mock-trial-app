-- Rosters and individual awards, for student, coach and school stats; and one circuit per account.
--
--   * profiles.level: the circuit a person chose when they made their account (law school, collegiate or
--     high school). There is no crossover: an account only creates, enters, judges and posts in its own
--     circuit. The person sets it once; after that only a site admin can change it.
--   * roster_entries: who was on a team at one competition (coaches and students), with each
--     student's class year AT THAT competition (2L this fall, 3L next fall). People are matched
--     across competitions by school + name, so there is no separate people table to keep in sync.
--     Each student's roles (attorney or witness, for which side) are set at registration.
--   * awards: individual awards an organizer gives at a competition (best advocate, best witness, ...).
--
-- Who sees what:
--   * The organizer sees and edits every roster and award at their competition.
--   * A team's coaches, its members and whoever registered it see and edit its roster.
--   * Everyone sees rosters and awards once results are published, except at high school
--     competitions, where students are minors: those stay with the organizer and the team.
--   * Like everything else, nothing changes once the competition is final and locked.

create table roster_entries (
  id text primary key check (char_length(id) <= 80),
  tournament_id text not null references tournaments on delete restrict,
  registration_id text not null references registrations on delete cascade,
  team_id text not null references teams,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text not null check (role in ('coach', 'student')),
  class_year text check (class_year in ('2L', '3L', 'other')),
  -- What the student does at this competition, set at registration: attorney or witness, plaintiff/prosecution or defense.
  roles text[] not null default '{}' check (roles <@ array['p_attorney', 'p_witness', 'd_attorney', 'd_witness']::text[]),
  added_by uuid references auth.users on delete set null default auth.uid(),
  inserted_at timestamptz not null default now(),
  constraint roster_class_year check (role = 'student' or class_year is null),
  constraint roster_roles check (role = 'student' or roles = '{}')
);
create index roster_entries_tournament on roster_entries (tournament_id);
create index roster_entries_team on roster_entries (team_id);
alter table roster_entries enable row level security;

create table awards (
  id text primary key check (char_length(id) <= 80),
  tournament_id text not null references tournaments on delete restrict,
  kind text not null check (kind in ('best_advocate', 'best_witness', 'best_opening', 'best_closing', 'best_direct', 'best_cross', 'other')),
  -- The organizer's own name for the award; required for 'other', optional otherwise ("Outstanding Advocate").
  label text not null default '' check (char_length(label) <= 120),
  -- 1 for the top award, 2 for second, and so on; null when the award is not ranked.
  place int check (place between 1 and 50),
  team_id text not null references teams,
  -- Who won it, as listed on the team's roster. roster_entry_id links it when the organizer picked from the roster.
  recipient text not null check (char_length(btrim(recipient)) between 1 and 120),
  roster_entry_id text references roster_entries on delete set null,
  created_by uuid references auth.users on delete set null default auth.uid(),
  inserted_at timestamptz not null default now(),
  constraint award_other_label check (kind <> 'other' or char_length(btrim(label)) > 0)
);
create index awards_tournament on awards (tournament_id);
alter table awards enable row level security;

-- ---------- Helpers ----------

create function roster_public(t_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from tournaments where id = t_id and results_published and level <> 'high_school' and approved and not hidden);
$$;

create function can_edit_roster(reg text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from registrations r
    where r.id = reg and (r.submitted_by = auth.uid() or is_coach(r.team_id) or is_director(r.tournament_id))
  );
$$;

-- ---------- Roster rules ----------

create policy "see rosters" on roster_entries for select using (
  roster_public(tournament_id) or is_director(tournament_id) or on_team(team_id)
  or exists (select 1 from registrations r where r.id = registration_id and r.submitted_by = auth.uid())
);
create policy "team or organizer adds" on roster_entries for insert to authenticated with check (can_edit_roster(registration_id));
create policy "team or organizer edits" on roster_entries for update using (can_edit_roster(registration_id)) with check (can_edit_roster(registration_id));
create policy "team or organizer removes" on roster_entries for delete using (can_edit_roster(registration_id));

-- The competition and team always come from the registration, so a roster can't be filed under someone else.
create function guard_roster_entry() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r registrations;
begin
  select * into r from registrations where id = new.registration_id;
  if r.id is null then raise exception 'That registration does not exist.'; end if;
  if tg_op = 'UPDATE' and new.registration_id <> old.registration_id then
    raise exception 'A roster entry cannot be moved to another team.';
  end if;
  new.tournament_id := r.tournament_id;
  new.team_id := r.team_id;
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    new.added_by := old.added_by;
  elsif is_app_user() then
    new.added_by := auth.uid();
  end if;
  -- A roster is a team list, not a database of everyone: keep it to a sensible size.
  if tg_op = 'INSERT' and (select count(*) from roster_entries where registration_id = new.registration_id) >= 40 then
    raise exception 'A team roster can list at most 40 people.';
  end if;
  return new;
end $$;
create trigger guard_roster_entry before insert or update on roster_entries for each row execute function guard_roster_entry();
create trigger lock_roster_entries before insert or update or delete on roster_entries for each row execute function reject_if_locked();
create trigger log_roster_entries after insert or update or delete on roster_entries for each row execute function log_change();

-- ---------- Award rules ----------

create policy "see awards" on awards for select using (roster_public(tournament_id) or is_director(tournament_id) or on_team(team_id));
create policy "organizer gives awards" on awards for insert to authenticated with check (is_director(tournament_id));
create policy "organizer edits awards" on awards for update using (is_director(tournament_id)) with check (is_director(tournament_id));
create policy "organizer removes awards" on awards for delete using (is_director(tournament_id));

create function guard_award() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare e roster_entries;
begin
  if tg_op = 'UPDATE' and new.tournament_id <> old.tournament_id then
    raise exception 'An award cannot be moved to another competition.';
  end if;
  -- Only teams entered in this competition can win its awards.
  if not exists (select 1 from registrations where tournament_id = new.tournament_id and team_id = new.team_id and status = 'approved') then
    raise exception 'That team is not entered in this competition.';
  end if;
  if new.roster_entry_id is not null then
    select * into e from roster_entries where id = new.roster_entry_id;
    if e.tournament_id <> new.tournament_id or e.team_id <> new.team_id then
      raise exception 'That person is not on this team''s roster for this competition.';
    end if;
    new.recipient := e.name;
  end if;
  new.recipient := btrim(new.recipient);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  elsif is_app_user() then
    new.created_by := auth.uid();
  end if;
  if tg_op = 'INSERT' and (select count(*) from awards where tournament_id = new.tournament_id) >= 200 then
    raise exception 'A competition can list at most 200 awards.';
  end if;
  return new;
end $$;
create trigger guard_award before insert or update on awards for each row execute function guard_award();
create trigger lock_awards before insert or update or delete on awards for each row execute function reject_if_locked();
create trigger log_awards after insert or update or delete on awards for each row execute function log_change();

-- ---------- One circuit per account ----------

alter table profiles add column if not exists level level;
-- Everyone who signed up so far did so for law school, the only circuit open until now.
update profiles set level = 'law_school' where level is null;

create function my_level() returns level language sql stable security definer set search_path = public, pg_temp as $$
  select level from profiles where id = auth.uid();
$$;

-- Who may act outside their own circuit or move someone to another one. Site admins for now; 0010 narrows it to the owner.
create function can_cross_levels() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_admin();
$$;

create or replace function guard_profile() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') and new.team_ids is distinct from old.team_ids then
    raise exception 'Team membership is managed by each team''s coach.';
  end if;
  if current_user in ('anon', 'authenticated') and old.level is not null and new.level is distinct from old.level and not can_cross_levels() then
    raise exception 'Your circuit is already set. Ask a site admin to change it.';
  end if;
  return new;
end $$;

-- Anything a person creates in a circuit must be in their own circuit.
create function same_level() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare target level; mine level;
begin
  if not is_app_user() or can_cross_levels() then
    return new;
  end if;
  if tg_table_name in ('registrations', 'judge_signups') then
    select level into target from tournaments where id = new.tournament_id;
  else
    target := new.level;
  end if;
  mine := my_level();
  if mine is null then
    raise exception 'Choose your circuit (law school, collegiate or high school) first.';
  end if;
  if target is distinct from mine then
    raise exception 'Your account is for the % circuit only.', replace(mine::text, '_', ' ');
  end if;
  return new;
end $$;
create trigger same_level_tournaments before insert on tournaments for each row execute function same_level();
create trigger same_level_programs before insert on programs for each row execute function same_level();
create trigger same_level_teams before insert on teams for each row execute function same_level();
create trigger same_level_registrations before insert on registrations for each row execute function same_level();
create trigger same_level_judge_signups before insert on judge_signups for each row execute function same_level();
create trigger same_level_cases before insert on cases for each row execute function same_level();
create trigger same_level_bulletins before insert on bulletins for each row execute function same_level();

-- ---------- Account deletion ----------

-- Same as 0008, and also detaches the person from rosters and awards they entered (the names stay, like results do).
create or replace function delete_my_account() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  busy text;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  select string_agg(name, ', ' order by start_date) into busy from tournaments
   where director_ids = array[uid] and status <> 'draft' and finalized_at is null and end_date + 7 > current_date;
  if busy is not null then
    raise exception 'You are the only organizer of %. Finalize the results first (or wait until a week after it ends), then delete your account.', busy;
  end if;
  if exists (select 1 from platform_admins where user_id = uid) and (select count(*) from platform_admins) = 1 then
    raise exception 'You are the only site admin. Make someone else an admin before deleting your account.';
  end if;

  -- Detach the person from shared records. Triggers are paused for these updates because the records may belong to
  -- finished, locked competitions, and the edit is only removing this person's link and details.
  set local session_replication_role = replica;
  update tournaments set director_ids = array_remove(director_ids, uid) where uid = any(director_ids);
  update matches set judge_ids = array_remove(judge_ids, uid) where uid = any(judge_ids);
  update registrations set submitted_by = null, contact_name = 'Deleted account', contact_email = '', note = null where submitted_by = uid;
  update judge_signups set user_id = null, name = 'Deleted account', email = '', background = '', conflicts = '' where user_id = uid;
  update ballots set judge_id = null where judge_id = uid;
  update bulletins set posted_by = null where posted_by = uid;
  update recordings set uploaded_by = null where uploaded_by = uid;
  update cases set created_by = null where created_by = uid;
  update teams set created_by = null where created_by = uid;
  update team_members set added_by = null where added_by = uid;
  update organizer_requests set decided_by = null where decided_by = uid;
  update reports set resolved_by = null where resolved_by = uid;
  update roster_entries set added_by = null where added_by = uid;
  update awards set created_by = null where created_by = uid;
  update change_log set actor = null where actor = uid;
  delete from messages where author_id = uid;
  set local session_replication_role = origin;

  -- Everything else that is only theirs is removed by "on delete cascade".
  delete from auth.users where id = uid;
end $$;

-- ---------- Privileges ----------

revoke insert, update, delete, truncate on roster_entries, awards from anon;
revoke truncate on roster_entries, awards from authenticated;
revoke execute on function roster_public(text), can_edit_roster(text), guard_roster_entry(), guard_award(), same_level(), my_level(), can_cross_levels() from public, anon;
grant execute on function my_level(), can_cross_levels() to authenticated;
-- Read rules call these for every visitor, signed in or not.
grant execute on function roster_public(text), can_edit_roster(text) to anon, authenticated;

alter publication supabase_realtime add table roster_entries, awards;
