-- Migration: add optional item descriptions.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.

alter table items add column if not exists description text;
