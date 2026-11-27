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
