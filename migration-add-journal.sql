-- Migration: daily journal.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.

create table if not exists journal (
  day        text primary key,           -- "YYYY-MM-DD"
  content    text not null default '',
  updated_at timestamptz not null default now()
);

alter table journal enable row level security;
