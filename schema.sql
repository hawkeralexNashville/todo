-- Database schema for the personal to-do app.
-- Paste this into the Supabase SQL editor (Database -> SQL Editor -> New query)
-- and run it once.

-- Buckets are optional labels items can be filed under. They do not affect
-- priority order; an item's position is individual and global.
create table if not exists buckets (
  id         bigint generated always as identity primary key,
  name       text        not null,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id          bigint generated always as identity primary key,
  name        text        not null,
  description text,
  type        text        not null check (type in ('one_off', 'evergreen')),
  status      text        not null default 'active'
                          check (status in ('active', 'done_today', 'deleted')),
  position    integer     not null default 0,
  prioritized boolean     not null default false,
  locked      boolean     not null default false, -- pinned to the top of the queue
  bucket_id   bigint      references buckets (id) on delete set null,
  completed_at timestamptz,
  skipped_at  timestamptz,
  time_estimate integer,               -- estimated duration, in seconds (nullable)
  time_spent   integer not null default 0, -- accumulated actual time, in seconds
  timer_started_at timestamptz,        -- set while the timer is running, else null
  created_at  timestamptz not null default now()
);

create index if not exists items_status_position_idx
  on items (status, position);

-- Single key/value row store for app state (used for the daily-reset marker).
create table if not exists app_meta (
  key   text primary key,
  value text
);

-- This app talks to the database only from the server, using the service role
-- key, which bypasses row level security. We still enable RLS with no policies
-- so that the public anon key (if it were ever used from a browser) has no
-- access at all.
alter table items enable row level security;
alter table buckets enable row level security;
alter table app_meta enable row level security;
