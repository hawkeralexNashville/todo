-- Migration: per-item time estimates and a work timer.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.
--
--   time_estimate    - estimated duration in seconds (nullable)
--   time_spent       - accumulated actual time in seconds
--   timer_started_at - set while the timer is running, else null; live elapsed
--                      is time_spent + (now - timer_started_at)

alter table items add column if not exists time_estimate integer;
alter table items add column if not exists time_spent integer not null default 0;
alter table items add column if not exists timer_started_at timestamptz;
