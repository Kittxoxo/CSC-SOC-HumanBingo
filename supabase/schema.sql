-- Human Bingo (CSC-SoC) : database schema for Supabase.
-- Run this ONCE: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

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
  sec         text not null,                                      -- course / year & section
  mask        int  not null default 0 check (mask >= 0 and mask < 33554432), -- which boxes are filled (25 bits)
  t_ms        bigint not null,                                    -- when they reached their current box count
  checkin_ms  bigint not null,                                    -- attendance: first check-in
  bingo_ms    bigint not null default 0,                          -- first BINGO (0 = none yet)
  claimed_ms  bigint not null default 0,                          -- incentive handed out (0 = not yet)
  created_at  timestamptz not null default now()
);
create index if not exists players_checkin_idx on public.players (checkin_ms);

create table if not exists public.photos (
  pid        text not null references public.players (pid) on delete cascade,
  box        smallint not null check (box between 0 and 24 and box <> 12),
  thumb      text not null,                                       -- small picture for the live board
  full_img   text not null,                                       -- 400px picture for cards / downloads
  created_ms bigint not null,
  primary key (pid, box)
);

-- Security: switch Row Level Security ON and add NO policies.
-- Phones never talk to Supabase directly. Only the server (secret key) can read/write.
alter table public.game_state enable row level security;
alter table public.players    enable row level security;
alter table public.photos     enable row level security;
revoke all on public.game_state, public.players, public.photos from anon, authenticated;
