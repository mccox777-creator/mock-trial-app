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
