-- Migration 004: Add Teams Feature & Format Categories

-- 1. Alter Tournaments table to support category and mode
alter table public.tournaments 
  add column if not exists category text not null default '1v1' check (category in ('1v1', 'high_score')),
  add column if not exists mode text not null default 'solo' check (mode in ('solo', 'team'));

-- 2. Create Teams table
create table if not exists public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  game text not null,
  captain_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;

create policy "Teams viewable by everyone"
  on public.teams for select using (true);

create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.uid() = captain_id);

create policy "Captains can update their own teams"
  on public.teams for update
  using (auth.uid() = captain_id);

create policy "Captains can delete their own teams"
  on public.teams for delete
  using (auth.uid() = captain_id);

-- 3. Create Team Members table
create table if not exists public.team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references public.teams(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);

alter table public.team_members enable row level security;

create policy "Team members viewable by everyone"
  on public.team_members for select using (true);

create policy "Team captains can invite players"
  on public.team_members for insert
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id
      and t.captain_id = auth.uid()
    )
  );

create policy "Players can update their own membership status"
  on public.team_members for update
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

create policy "Captains or members can remove/leave membership"
  on public.team_members for delete
  using (
    auth.uid() = player_id
    or exists (
      select 1 from public.teams t
      where t.id = team_id
      and t.captain_id = auth.uid()
    )
  );

-- 4. Alter Participants table to support registering a team
alter table public.participants 
  add column if not exists team_id uuid references public.teams(id) on delete set null;
