-- Owner and admin roles. Run after 0009 (rosters and awards, from the stats work).
--
-- Two levels, both stored in platform_admins (from 0007):
--   * owner: everything an admin can do, plus making and removing admins. Whoever was already an admin when this
--     runs becomes the owner.
--   * admin: approves organizers, handles reports, lists or takes down competitions, deletes posts, and can see the
--     full rating method. Nobody can change rating rules or past results in the app; those live in the code.
--
-- Same rule as 0002: every permission is enforced here, not only in the app. The table has no insert, update or
-- delete policies, so the app can only change it through add_admin / remove_admin, which check for an owner.

alter table platform_admins add column role text not null default 'admin' check (role in ('owner', 'admin'));
alter table platform_admins add column added_by uuid references auth.users on delete set null;
update platform_admins set role = 'owner';

create function is_owner() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'owner');
$$;

-- Admins can see who the other admins are (names and emails come from list_admins).
create policy "admins see admins" on platform_admins for select using (is_admin());

create function list_admins() returns table (user_id uuid, name text, email text, role text, added_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'Only admins can see the admin list.';
  end if;
  return query
    select a.user_id, coalesce(nullif(p.name, ''), u.email::text), u.email::text, a.role, a.added_at
      from platform_admins a join auth.users u on u.id = a.user_id left join profiles p on p.id = a.user_id
     order by a.role = 'owner' desc, a.added_at;
end $$;

-- The owner makes someone an admin by the email they sign in with. They must have signed in at least once.
create function add_admin(p_email text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target uuid;
begin
  if not is_owner() then
    raise exception 'Only the owner can make admins.';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then
    raise exception 'No account uses that email. Ask them to sign in to the app once, then try again.';
  end if;
  insert into platform_admins (user_id, role, added_by) values (target, 'admin', auth.uid()) on conflict (user_id) do nothing;
  insert into notifications (user_id, kind, title, body, link)
    values (target, 'admin', 'You are now an admin', 'You can approve organizers, handle reports and review listings.', '/admin');
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

revoke execute on function list_admins(), add_admin(text), remove_admin(uuid) from anon;
