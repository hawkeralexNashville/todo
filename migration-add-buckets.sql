-- Migration: add buckets.
-- Run this ONCE in the Supabase SQL editor if your database was created before
-- buckets existed. Safe to run more than once.

create table if not exists buckets (
  id         bigint generated always as identity primary key,
  name       text        not null,
  created_at timestamptz not null default now()
);

alter table buckets enable row level security;

alter table items
  add column if not exists bucket_id bigint references buckets (id) on delete set null;
