-- Account deletion (Apple requires apps with sign-up to offer it in the app).
--
-- delete_my_account() removes the signed-in person's account. What is only theirs goes: profile, team memberships,
-- notifications and settings, push tokens, organizer request, reports they filed, admin role and their chat messages.
-- Shared records other people rely on stay, without their name or contact details: competition results, ballots
-- they judged, registrations they sent for a team, bulletins, cases, recordings and teams they set up.
--
-- Someone who is the only organizer of a competition that has not finished is asked to finish it first, so teams
-- entered in it are not left without anyone running it. The last site admin cannot delete their account.

alter table registrations alter column submitted_by drop not null;
alter table judge_signups alter column user_id drop not null;
alter table bulletins alter column posted_by drop not null;
alter table recordings alter column uploaded_by drop not null;
alter table cases alter column created_by drop not null;
alter table messages alter column author_id drop not null;

create function delete_my_account() returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  update change_log set actor = null where actor = uid;
  delete from messages where author_id = uid;
  set local session_replication_role = origin;

  -- Everything else that is only theirs is removed by "on delete cascade".
  delete from auth.users where id = uid;
end $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
