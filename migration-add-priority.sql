-- Migration: backlog vs. priority.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.
--
-- Adds a `prioritized` flag. Items with prioritized = true are in the active
-- queue that Home works through (ordered by position). Items with
-- prioritized = false sit in the backlog (their bucket) and do not appear on
-- Home until they are queued on the Organize screen.

alter table items
  add column if not exists prioritized boolean not null default false;

-- Preserve current behavior: every item that shows on Home today (active items,
-- plus evergreens currently done-for-the-day) stays in the priority queue.
-- New items added from now on default to the backlog.
update items set prioritized = true where status in ('active', 'done_today');
