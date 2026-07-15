-- ChainArena: Upgrades Migration for Bounty Features
-- Run this in your Supabase SQL editor to enable Escrow, USDC, Disputes, and Badges

-- ─── 1. Alter Tournaments Table ───────────────────────────────────────────────
alter table public.tournaments 
  add column if not exists token_type text not null default 'SOL' check (token_type in ('SOL', 'USDC')),
  add column if not exists escrow_address text,
  add column if not exists vault_address text;

-- ─── 2. Create Disputes Table ──────────────────────────────────────────────────
create table if not exists public.disputes (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid references public.matches(id) on delete cascade not null,
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique(match_id) -- One dispute per match maximum
);

alter table public.disputes enable row level security;

create policy "Disputes viewable by everyone"
  on public.disputes for select using (true);

create policy "Participants can create disputes for matches in their tournaments"
  on public.disputes for insert
  with check (
    auth.uid() = creator_id
    and exists (
      select 1 from public.participants p 
      where p.player_id = auth.uid() 
      and p.tournament_id = tournament_id
    )
  );

create policy "Organizers can resolve disputes in their tournaments"
  on public.disputes for update
  using (
    auth.uid() = (
      select organizer_id from public.tournaments where id = tournament_id
    )
  );

-- ─── 3. Create Votes Table ─────────────────────────────────────────────────────
create table if not exists public.votes (
  id uuid primary key default uuid_generate_v4(),
  dispute_id uuid references public.disputes(id) on delete cascade not null,
  voter_id uuid references public.profiles(id) on delete cascade not null,
  vote_for uuid references public.profiles(id) not null, -- The player they believe won the match
  signature text not null, -- Cryptographic signature from wallet.signMessage proving the vote authenticity
  created_at timestamptz not null default now(),
  unique (dispute_id, voter_id)
);

alter table public.votes enable row level security;

create policy "Votes viewable by everyone"
  on public.votes for select using (true);

create policy "Participants can vote on disputes in their tournaments"
  on public.votes for insert
  with check (
    auth.uid() = voter_id
    and exists (
      select 1 from public.participants p
      join public.disputes d on d.tournament_id = p.tournament_id
      where p.player_id = auth.uid()
      and d.id = dispute_id
    )
  );

-- ─── 4. Create Badges Table ────────────────────────────────────────────────────
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references public.profiles(id) on delete cascade not null,
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  title text not null,
  image_url text not null,
  mint_address text, -- Address of the minted compressed NFT on Solana
  signature text, -- Transaction signature for the mint
  created_at timestamptz not null default now()
);

alter table public.badges enable row level security;

create policy "Badges viewable by everyone"
  on public.badges for select using (true);

create policy "Only organizers can award/insert badges"
  on public.badges for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
      and t.organizer_id = auth.uid()
    )
  );
