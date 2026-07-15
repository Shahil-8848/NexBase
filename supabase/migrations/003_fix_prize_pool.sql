-- ChainArena: Fix Prize Pool and Track Entry Fee Collections
-- Run this in your Supabase SQL editor

-- 1. Add collected_fees column to tournaments
alter table public.tournaments 
  add column if not exists collected_fees numeric(18,9) not null default 0;

-- 2. Create trigger function to update collected_fees instead of prize_pool
create or replace function public.update_collected_fees()
returns trigger language plpgsql security definer as $$
declare
  v_tournament_id uuid;
  v_entry_fee numeric;
begin
  -- Case A: Trigger fired on participants table (when payment_status changes to verified)
  if TG_TABLE_NAME = 'participants' then
    if new.payment_status = 'verified' and (old.payment_status is null or old.payment_status != 'verified') then
      -- Get the entry fee for the tournament
      select entry_fee into v_entry_fee
      from public.tournaments
      where id = new.tournament_id;

      -- Update the collected_fees
      update public.tournaments
      set collected_fees = collected_fees + coalesce(v_entry_fee, 0)
      where id = new.tournament_id;
    end if;
  
  -- Case B: Trigger fired on payments table (when verification_status changes to verified)
  elsif TG_TABLE_NAME = 'payments' then
    if new.verification_status = 'verified' and (old.verification_status is null or old.verification_status != 'verified') then
      select t.id, t.entry_fee into v_tournament_id, v_entry_fee
      from public.participants p
      join public.tournaments t on t.id = p.tournament_id
      where p.id = new.participant_id;

      update public.tournaments
      set collected_fees = collected_fees + coalesce(v_entry_fee, 0)
      where id = v_tournament_id;
    end if;
  end if;
  
  return new;
end;
$$;

-- 3. Drop existing update_prize_pool triggers and redefine them using update_collected_fees
drop trigger if exists on_payment_verified on public.payments;
create trigger on_payment_verified
  after update on public.payments
  for each row execute procedure public.update_collected_fees();

drop trigger if exists on_participant_payment_verified on public.participants;
create trigger on_participant_payment_verified
  after update on public.participants
  for each row execute procedure public.update_collected_fees();
