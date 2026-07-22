-- Migration: brain-break game leaderboard.
-- Run this ONCE in the Supabase SQL editor. Safe to run more than once.

create table if not exists scores (
  id         bigint generated always as identity primary key,
  game       text        not null,
  score      integer     not null,
  created_at timestamptz not null default now()
);

create index if not exists scores_game_score_idx on scores (game, score desc);

alter table scores enable row level security;
