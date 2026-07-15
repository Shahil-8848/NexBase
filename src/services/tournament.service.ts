import { supabase } from '@/lib/supabase'
import type {
  Tournament,
  Participant,
  Match,
  TournamentFilters,
  PaginatedResult,
} from '@/types'
import { PAGE_SIZE } from '@/constants'

export interface CreateTournamentData {
  id?: string
  title: string
  description?: string
  game: string
  banner?: string
  entry_fee: number
  prize_pool?: number
  max_players: number
  start_date?: string
  end_date?: string
  organizer_wallet?: string
  rules?: string
  token_type?: 'SOL' | 'USDC'
  escrow_address?: string
  vault_address?: string
}

export const tournamentService = {
  async getTournaments(filters: Partial<TournamentFilters> = {}): Promise<PaginatedResult<Tournament>> {
    const {
      search = '',
      game = 'all',
      status = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = 1,
    } = filters

    let query = supabase
      .from('tournaments')
      .select('*, organizer:profiles!organizer_id(*)', { count: 'exact' })

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }
    if (game && game !== 'all') {
      query = query.eq('game', game)
    }
    if (status && status !== 'all') {
      query = query.eq('tournament_status', status)
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    return {
      data: (data ?? []) as Tournament[],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
    }
  },

  async getTournamentById(id: string): Promise<Tournament> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, organizer:profiles!organizer_id(*)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Tournament
  },

  async createTournament(
    organizerId: string,
    payload: CreateTournamentData
  ): Promise<Tournament> {
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ ...payload, organizer_id: organizerId })
      .select()
      .single()
    if (error) throw error
    return data as Tournament
  },

  async updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from('tournaments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Tournament
  },

  async deleteTournament(id: string): Promise<void> {
    const { error } = await supabase.from('tournaments').delete().eq('id', id)
    if (error) throw error
  },

  async getOrganizerTournaments(organizerId: string): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Tournament[]
  },

  // ─── Participants ───────────────────────────────────────────────────────────

  async joinTournament(
    tournamentId: string,
    playerId: string,
    paymentStatus: 'pending' | 'verified' = 'pending'
  ): Promise<Participant> {
    const { data, error } = await supabase
      .from('participants')
      .insert({ tournament_id: tournamentId, player_id: playerId, payment_status: paymentStatus })
      .select()
      .single()
    if (error) throw error

    // increment player count
    await supabase.rpc('increment_tournament_players', { t_id: tournamentId })

    return data as Participant
  },

  async getParticipants(tournamentId: string): Promise<Participant[]> {
    const { data, error } = await supabase
      .from('participants')
      .select('*, player:profiles!player_id(*)')
      .eq('tournament_id', tournamentId)
      .order('joined_at')
    if (error) throw error
    return (data ?? []) as Participant[]
  },

  async getPlayerParticipation(
    tournamentId: string,
    playerId: string
  ): Promise<Participant | null> {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .maybeSingle()
    if (error) throw error
    return data as Participant | null
  },

  async submitPayment(
    participantId: string,
    signature: string
  ): Promise<Participant> {
    const { data, error } = await supabase
      .from('participants')
      .update({ transaction_signature: signature, payment_status: 'pending' })
      .eq('id', participantId)
      .select()
      .single()
    if (error) throw error
    return data as Participant
  },

  async verifyParticipantPayment(
    participantId: string,
    status: 'verified' | 'failed'
  ): Promise<Participant> {
    const { data, error } = await supabase
      .from('participants')
      .update({ payment_status: status })
      .eq('id', participantId)
      .select()
      .single()
    if (error) throw error
    return data as Participant
  },

  // ─── Matches ────────────────────────────────────────────────────────────────

  async getMatches(tournamentId: string): Promise<Match[]> {
    const { data, error } = await supabase
      .from('matches')
      .select(
        '*, player_one_profile:profiles!player_one(*), player_two_profile:profiles!player_two(*), winner_profile:profiles!winner(*)'
      )
      .eq('tournament_id', tournamentId)
      .order('round')
      .order('created_at')
    if (error) throw error
    return (data ?? []) as Match[]
  },

  async createMatch(match: Omit<Match, 'id' | 'created_at'>): Promise<Match> {
    const { data, error } = await supabase
      .from('matches')
      .insert(match)
      .select()
      .single()
    if (error) throw error
    return data as Match
  },

  async updateMatch(id: string, updates: Partial<Match>): Promise<Match> {
    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Match
  },

  async setMatchWinner(
    matchId: string,
    winnerId: string
  ): Promise<Match> {
    return this.updateMatch(matchId, {
      winner: winnerId,
      match_status: 'completed',
    })
  },

  // ─── Leaderboard ────────────────────────────────────────────────────────────

  async getLeaderboard() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('trust_score', { ascending: false })
      .limit(50)
    if (error) throw error
    return data ?? []
  },
}
