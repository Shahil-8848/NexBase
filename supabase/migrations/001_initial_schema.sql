-- ChainArena: Initial Schema Migration
-- Run this in your Supabase SQL editor

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar text,
  wallet_address text unique,
  role text not null default 'player' check (role in ('player', 'organizer', 'admin')),
  trust_score integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ─── Tournaments ──────────────────────────────────────────────────────────────
create table public.tournaments (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  game text not null,
  banner text,
  organizer_id uuid references public.profiles(id) on delete cascade not null,
  entry_fee numeric(18,9) not null default 0,
  prize_pool numeric(18,9) not null default 0,
  max_players integer not null default 16,
  current_players integer not null default 0,
  tournament_status text not null default 'draft'
    check (tournament_status in ('draft','registration','active','completed','cancelled')),
  start_date timestamptz,
  end_date timestamptz,
  organizer_wallet text,
  rules text,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "Tournaments viewable by everyone"
  on public.tournaments for select using (true);

create policy "Organizers can create tournaments"
  on public.tournaments for insert
  with check (auth.uid() = organizer_id);

create policy "Organizers can update their own tournaments"
  on public.tournaments for update
  using (auth.uid() = organizer_id);

create policy "Organizers can delete their own tournaments"
  on public.tournaments for delete
  using (auth.uid() = organizer_id);

-- ─── Participants ─────────────────────────────────────────────────────────────
create table public.participants (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','verified','failed','refunded')),
  transaction_signature text,
  joined_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

alter table public.participants enable row level security;

create policy "Participants viewable by everyone"
  on public.participants for select using (true);

create policy "Authenticated users can join tournaments"
  on public.participants for insert
  with check (auth.uid() = player_id);

create policy "Players can update their own participation"
  on public.participants for update
  using (auth.uid() = player_id);

create policy "Organizers can update participants in their tournaments"
  on public.participants for update
  using (
    auth.uid() = (
      select organizer_id from public.tournaments where id = tournament_id
    )
  );

-- ─── Matches ──────────────────────────────────────────────────────────────────
create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  round integer not null default 1,
  player_one uuid references public.profiles(id) not null,
  player_two uuid references public.profiles(id) not null,
  winner uuid references public.profiles(id),
  match_status text not null default 'pending'
    check (match_status in ('pending','active','completed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;

create policy "Matches viewable by everyone"
  on public.matches for select using (true);

create policy "Organizers can manage matches"
  on public.matches for all
  using (
    auth.uid() = (
      select organizer_id from public.tournaments where id = tournament_id
    )
  );

-- ─── Payments ─────────────────────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  participant_id uuid references public.participants(id) on delete cascade not null,
  wallet_address text not null,
  transaction_signature text not null unique,
  amount numeric(18,9) not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','failed','refunded')),
  explorer_url text not null,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Payments viewable by participant or organizer"
  on public.payments for select
  using (
    auth.uid() = (select player_id from public.participants where id = participant_id)
    or
    auth.uid() = (
      select t.organizer_id from public.participants p
      join public.tournaments t on t.id = p.tournament_id
      where p.id = participant_id
    )
  );

create policy "Players can insert their own payments"
  on public.payments for insert
  with check (
    auth.uid() = (select player_id from public.participants where id = participant_id)
  );

-- ─── Transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('entry_fee','prize','refund')),
  amount numeric(18,9) not null,
  signature text not null unique,
  explorer_url text not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','failed')),
  tournament_id uuid references public.tournaments(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Users and organizers can view transactions"
  on public.transactions for select
  using (
    auth.uid() = user_id
    or auth.uid() = (
      select organizer_id from public.tournaments where id = tournament_id
    )
  );

create policy "Users and organizers can insert transactions"
  on public.transactions for insert
  with check (
    auth.uid() = user_id
    or auth.uid() = (
      select organizer_id from public.tournaments where id = tournament_id
    )
  );

-- ─── Functions ────────────────────────────────────────────────────────────────

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Increment/decrement participant count
create or replace function public.increment_tournament_players(t_id uuid)
returns void language plpgsql security definer
as $$
begin
  update public.tournaments
  set current_players = current_players + 1
  where id = t_id;
end;
$$;

create or replace function public.decrement_tournament_players(t_id uuid)
returns void language plpgsql security definer
as $$
begin
  update public.tournaments
  set current_players = greatest(0, current_players - 1)
  where id = t_id;
end;
$$;

-- Update prize pool when payment verified
create or replace function public.update_prize_pool()
returns trigger language plpgsql security definer
as $$
declare
  v_tournament_id uuid;
  v_entry_fee numeric;
begin
  if new.verification_status = 'verified' and old.verification_status != 'verified' then
    select t.id, t.entry_fee into v_tournament_id, v_entry_fee
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    where p.id = new.participant_id;

    update public.tournaments
    set prize_pool = prize_pool + v_entry_fee
    where id = v_tournament_id;
  end if;
  return new;
end;
$$;

create trigger on_payment_verified
  after update on public.payments
  for each row execute procedure public.update_prize_pool();

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index idx_tournaments_organizer on public.tournaments(organizer_id);
create index idx_tournaments_status on public.tournaments(tournament_status);
create index idx_tournaments_game on public.tournaments(game);
create index idx_participants_tournament on public.participants(tournament_id);
create index idx_participants_player on public.participants(player_id);
create index idx_matches_tournament on public.matches(tournament_id);
create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_tournament on public.transactions(tournament_id);
