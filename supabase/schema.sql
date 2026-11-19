-- Kabanata XXI Bingo (CSC-SoC): database schema for Supabase.
-- Run this in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again, and safe to run on top of the older version (it upgrades it).

create table if not exists public.game_state (
  id            int primary key default 1 check (id = 1),         -- a single row
  status        text not null default 'waiting' check (status in ('waiting', 'running')),
  started_ms    bigint,
  duration_ms   int  not null default 600000,
  reset_at      bigint not null default 0,
  showcase_open boolean not null default false,
  showcase_rank int  not null default 1 check (showcase_rank between 1 and 5),
  prompts       jsonb,                                            -- the host's 24 prompts
  updated_at    timestamptz not null default now()
);
insert into public.game_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.players (
  pid         text primary key check (pid ~ '^[a-z0-9]{8,24}$'),  -- random id made by each phone
  name        text not null,
  sec         text not null,                                      -- block / section
  mask        int  not null default 0 check (mask >= 0 and mask < 33554432), -- which boxes are filled (25 bits)
  t_ms        bigint not null,                                    -- when they reached their current box count
  checkin_ms  bigint not null,                                    -- attendance: first check-in
  bingo_ms    bigint not null default 0,                          -- first BINGO (0 = none yet)
  claimed_ms  bigint not null default 0,                          -- incentive handed out (0 = not yet)
  created_at  timestamptz not null default now()
);
create index if not exists players_checkin_idx on public.players (checkin_ms);

-- ONE picture per student: their whole bingo card (all selfies already placed on it), not 24 separate photos.
alter table public.game_state add column if not exists event_name text;
alter table public.players add column if not exists card_img   text;                       -- the card, about 640px wide
alter table public.players add column if not exists card_thumb text;                       -- tiny version for the collage
alter table public.players add column if not exists card_at    bigint not null default 0;  -- when it was last saved (0 = none)

-- older versions stored every selfie in this table; it is no longer used
drop table if exists public.photos;

-- Security: Row Level Security ON with NO policies. Phones never talk to Supabase directly.
alter table public.game_state enable row level security;
alter table public.players    enable row level security;
revoke all on public.game_state, public.players from anon, authenticated;

-- Newer Supabase projects do not give the server role access to new tables automatically.
grant usage on schema public to service_role;
grant all on public.game_state, public.players to service_role;
