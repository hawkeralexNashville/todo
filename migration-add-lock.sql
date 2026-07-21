-- Migration: lockable (pinned) priority items.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.
--
-- A locked item is always in the priority queue and pinned to the top, above
-- all unlocked items, in the order it was locked. It can't be bumped down by
-- unlocked items and survives resets at its pinned rank.

alter table items add column if not exists locked boolean not null default false;
