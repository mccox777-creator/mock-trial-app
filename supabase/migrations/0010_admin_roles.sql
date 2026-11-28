-- Owner and admin roles, each admin scoped to one level. Run after 0009_rosters_and_awards.sql (it doesn't need
-- anything from 0009 except profiles.level, which both add if missing, so either order works).
--
-- People pick law school, collegiate or high school when they sign up, and there is no crossover. Admins are the same:
--   * owner: every level. Makes and removes admins, and is the only one who can move a person to another level.
--     Whoever was already an admin when this runs becomes the owner.
--   * admin: one level. Approves organizers, handles reports, lists or takes down competitions and deletes posts
--     for that level only, and can read the full rating method. Nobody can change rating rules or past results in
--     the app; those live in the code.
--
-- Same rule as 0002: every permission is enforced here, not only in the app. platform_admins has no insert, update
-- or delete policies, so the app can only change it through add_admin / remove_admin, which check for the owner.

alter table profiles add column if not exists level level;

-- ---------- Roles ----------

alter table platform_admins add column role text not null default 'admin' check (role in ('owner', 'admin'));
alter table platform_admins add column level level;
alter table platform_admins add column added_by uuid references auth.users on delete set null;
update platform_admins set role = 'owner', level = null;
-- An owner covers every level; an admin has exactly one.
alter table platform_admins add constraint admin_level_set check ((role = 'owner') = (level is null));

create function is_owner() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'owner');
$$;

-- Admin for this level (the owner is admin for every level). is_admin() from 0007 still means "admin of any level",
-- which only lifts rate limits.
create function is_admin_for(lvl level) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and (role = 'owner' or level = lvl));
$$;

-- For the app: 'all' for the owner, the level for an admin, null for everyone else.
create function my_admin_level() returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when role = 'owner' then 'all' else level::text end from platform_admins where user_id = auth.uid();
$$;

create policy "admins see admins" on platform_admins for select using (is_admin() and (role = 'owner' or is_admin_for(level)));

create function list_admins() returns table (user_id uuid, name text, email text, role text, level text, added_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'Only admins can see the admin list.';
  end if;
  -- The owner sees every admin; an admin sees the owner and the admins for their own level.
  return query
    select a.user_id, coalesce(nullif(p.name, ''), u.email::text), u.email::text, a.role, a.level::text, a.added_at
      from platform_admins a join auth.users u on u.id = a.user_id left join profiles p on p.id = a.user_id
     where a.role = 'owner' or is_admin_for(a.level)
     order by a.role = 'owner' desc, a.level, a.added_at;
end $$;

-- The owner makes someone an admin for their own level (the one they picked at sign-up), by the email they sign in
-- with. They must have signed in at least once.
create function add_admin(p_email text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target uuid;
  lvl level;
begin
  if not is_owner() then
    raise exception 'Only the owner can make admins.';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then
    raise exception 'No account uses that email. Ask them to sign in to the app once, then try again.';
  end if;
  if exists (select 1 from platform_admins where user_id = target) then
    return target;
  end if;
  select coalesce(level, 'law_school') into lvl from profiles where id = target;
  insert into platform_admins (user_id, role, level, added_by) values (target, 'admin', coalesce(lvl, 'law_school'), auth.uid());
  insert into notifications (user_id, kind, title, body, link)
    values (target, 'admin', 'You are now an admin', 'You can approve organizers, handle reports and review listings for your level.', '/admin');
  return target;
end $$;

-- The owner removes an admin. Owners can't be removed in the app (only in the dashboard).
create function remove_admin(p_user uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_owner() then
    raise exception 'Only the owner can remove admins.';
  end if;
  if exists (select 1 from platform_admins where user_id = p_user and role = 'owner') then
    raise exception 'The owner can''t be removed in the app.';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;

-- The last owner can't leave through the app (for example by deleting their account).
create function keep_an_owner() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if is_app_user() and old.role = 'owner'
     and not exists (select 1 from platform_admins where role = 'owner' and user_id <> old.user_id) then
    raise exception 'You are the only owner. Make someone else the owner in the dashboard first.';
  end if;
  return old;
end $$;
create trigger keep_an_owner before delete on platform_admins for each row execute function keep_an_owner();

-- Once a person's level is set, only the owner (or the dashboard) can move them to another level.
create function only_owner_moves_level() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if is_app_user() and old.level is not null and new.level is distinct from old.level and not is_owner() then
    raise exception 'Only the site owner can move someone to another level.';
  end if;
  return new;
end $$;
create trigger only_owner_moves_level before update on profiles for each row execute function only_owner_moves_level();

-- ---------- Organizer approval, per level ----------

alter table organizer_requests add column level level;
update organizer_requests r set level = coalesce((select p.level from profiles p where p.id = r.user_id), 'law_school');
alter table organizer_requests alter column level set not null;

-- A request is for the level the person signed up for.
create function set_request_level() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if is_app_user() then
    new.level := coalesce((select level from profiles where id = new.user_id), case when tg_op = 'UPDATE' then old.level end, new.level, 'law_school');
  else
    new.level := coalesce(new.level, (select level from profiles where id = new.user_id), 'law_school');
  end if;
  return new;
end $$;
create trigger set_request_level before insert or update on organizer_requests for each row execute function set_request_level();

drop policy "see own request" on organizer_requests;
drop policy "admin decides" on organizer_requests;
drop policy "admin removes request" on organizer_requests;
create policy "see own request" on organizer_requests for select using (user_id = auth.uid() or is_admin_for(level));
create policy "admin decides" on organizer_requests for update using (is_admin_for(level)) with check (is_admin_for(level));
create policy "admin removes request" on organizer_requests for delete using (is_admin_for(level));

create or replace function guard_organizer_request() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if is_app_user() and not is_admin_for(new.level) then
    new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.requested_at := now();
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.decided_by := auth.uid(); new.decided_at := now();
  end if;
  return new;
end $$;

create function is_verified_organizer_for(uid uuid, lvl level) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from organizer_requests where user_id = uid and status = 'approved' and level = lvl);
$$;

-- ---------- Competitions, per level ----------

create or replace function guard_listing() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_app_user() or is_admin_for(new.level) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hidden := false;
    new.approved := is_verified_organizer_for(auth.uid(), new.level);
  else
    new.hidden := old.hidden;
    new.approved := old.approved or (not old.hidden and is_verified_organizer_for(auth.uid(), new.level));
  end if;
  return new;
end $$;

drop policy "read tournaments" on tournaments;
drop policy "admin moderates" on tournaments;
create policy "read tournaments" on tournaments for select using (
  (status <> 'draft' and approved and not hidden) or auth.uid() = any(director_ids) or is_admin_for(level)
);
create policy "admin moderates" on tournaments for update using (is_admin_for(level)) with check (is_admin_for(level));

-- Approving an organizer lists the competitions they already published at that level.
create or replace function organizer_decided() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update tournaments set approved = true where new.user_id = any(director_ids) and level = new.level and not hidden and not approved;
  end if;
  return new;
end $$;

-- ---------- Reports, per level ----------

-- The level of the thing reported; for a person, their level. Falls back to the reporter's level.
create function report_level(k text, target text, who uuid) returns level language plpgsql stable security definer set search_path = public, pg_temp as $$
declare lvl level;
begin
  case k
    when 'tournament' then select level into lvl from tournaments where id = target;
    when 'bulletin' then select level into lvl from bulletins where id = target;
    when 'message' then select t.level into lvl from messages m join tournaments t on t.id = m.tournament_id where m.id = target;
    when 'case' then select level into lvl from cases where id = target;
    when 'team' then select level into lvl from teams where id = target;
    when 'user' then
      if target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select level into lvl from profiles where id = target::uuid;
      end if;
    else null;
  end case;
  return coalesce(lvl, (select level from profiles where id = who), 'law_school');
end $$;

alter table reports add column level level;
update reports set level = report_level(kind, target_id, reporter);
alter table reports alter column level set not null;

create function set_report_level() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.level := report_level(new.kind, new.target_id, new.reporter);
  else
    new.level := old.level;
  end if;
  return new;
end $$;
-- Named to run before notify (after) triggers; before-insert so the not-null level is filled in.
create trigger set_report_level before insert or update on reports for each row execute function set_report_level();

drop policy "see own reports" on reports;
drop policy "admin handles reports" on reports;
create policy "see own reports" on reports for select using (reporter = auth.uid() or is_admin_for(level));
create policy "admin handles reports" on reports for update using (is_admin_for(level)) with check (is_admin_for(level));

-- ---------- Removing posts, per level ----------

drop policy "admin removes bulletins" on bulletins;
drop policy "admin removes chat" on messages;
create policy "admin removes bulletins" on bulletins for delete using (is_admin_for(level));
create policy "admin removes chat" on messages for delete using (
  is_admin_for((select t.level from tournaments t where t.id = messages.tournament_id))
);

-- ---------- Telling the right admins ----------

create function admins_for(lvl level) returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select user_id from platform_admins where role = 'owner' or level = lvl;
$$;

create or replace function notify_admins_request() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    insert into notifications (user_id, kind, title, body, link)
    select a, 'admin', 'Organizer request: ' || left(new.name, 100), left(new.school || ' · ' || new.role, 500), '/admin' from admins_for(new.level) a;
  end if;
  return new;
end $$;
create or replace function notify_admins_report() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notifications (user_id, kind, title, body, link)
  select a, 'admin', 'Report: ' || new.reason || ' ' || new.kind, left(new.details, 500), '/admin' from admins_for(new.level) a;
  return new;
end $$;
create or replace function notify_admins_competition() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not new.approved then
    insert into notifications (user_id, kind, title, body, link)
    select a, 'admin', 'Competition waiting for review: ' || left(new.name, 100), 'From an organizer who is not approved yet.', '/admin' from admins_for(new.level) a;
  end if;
  return new;
end $$;

revoke execute on function list_admins(), add_admin(text), remove_admin(uuid) from public, anon;
revoke execute on function keep_an_owner(), only_owner_moves_level(), set_request_level(), set_report_level(), report_level(text, text, uuid),
  admins_for(level), is_verified_organizer_for(uuid, level)
  from public, anon;

-- 0009 routes its "may this person act outside their own level?" checks through can_cross_levels().
-- Only the owner may; admins stay in their level.
create or replace function can_cross_levels() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_owner();
$$;
