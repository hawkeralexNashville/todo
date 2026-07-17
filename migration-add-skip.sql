-- Migration: add the "skip" feature.
-- Run this ONCE in the Supabase SQL editor if your database was created before
-- the Skip button existed. It adds the column used to defer an item for a day.
-- Safe to run more than once (it's a no-op if the column already exists).

alter table items add column if not exists skipped_at timestamptz;
