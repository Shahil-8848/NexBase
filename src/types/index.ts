export type UserRole = 'player' | 'organizer' | 'admin'

export type TournamentStatus =
  | 'draft'
  | 'registration'
  | 'active'
  | 'completed'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'verified' | 'failed' | 'refunded'

export type MatchStatus = 'pending' | 'active' | 'completed'

export type TransactionType = 'entry_fee' | 'prize' | 'refund'

export type TransactionStatus = 'pending' | 'confirmed' | 'failed'

// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id: string
  username: string
  avatar: string | null
  wallet_address: string | null
  role: UserRole
  trust_score: number
  created_at: string
}

export interface Tournament {
  id: string
  title: string
  description: string | null
  game: string
  banner: string | null
  organizer_id: string
  entry_fee: number
  prize_pool: number
  collected_fees: number
  max_players: number
  current_players: number
  tournament_status: TournamentStatus
  start_date: string | null
  end_date: string | null
  organizer_wallet: string | null
  rules: string | null
  token_type: 'SOL' | 'USDC'
  escrow_address: string | null
  vault_address: string | null
  created_at: string
  category?: '1v1' | 'high_score'
  mode?: 'solo' | 'team'
  // joined via query
  organizer?: Profile
}

export interface Participant {
  id: string
  tournament_id: string
  player_id: string
  payment_status: PaymentStatus
  transaction_signature: string | null
  joined_at: string
  team_id?: string | null
  // joined
  player?: Profile
  tournament?: Tournament
  team?: Team
}

export interface Match {
  id: string
  tournament_id: string
  round: number
  player_one: string
  player_two: string
  winner: string | null
  match_status: MatchStatus
  scheduled_at: string | null
  // joined
  player_one_profile?: Profile
  player_two_profile?: Profile
  winner_profile?: Profile
}

export interface Payment {
  id: string
  participant_id: string
  wallet_address: string
  transaction_signature: string
  amount: number
  verification_status: PaymentStatus
  explorer_url: string
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  type: TransactionType
  amount: number
  signature: string
  explorer_url: string
  status: TransactionStatus
  tournament_id: string | null
  description: string | null
  created_at: string
  // joined
  tournament?: Pick<Tournament, 'id' | 'title' | 'game'>
}

// ─── App-level types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  profile: Profile | null
}

export interface TournamentFilters {
  search: string
  game: string
  status: TournamentStatus | 'all'
  sortBy: 'created_at' | 'prize_pool' | 'entry_fee' | 'start_date'
  sortOrder: 'asc' | 'desc'
  page: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface StatsCard {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
}

export interface LeaderboardEntry {
  rank: number
  player: Profile
  wins: number
  matches_played: number
  win_rate: number
  total_earnings: number
  wallet_verified: boolean
}

export interface Team {
  id: string
  name: string
  game: string
  captain_id: string
  created_at: string
  captain?: Profile
}

export interface TeamMember {
  id: string
  team_id: string
  player_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  player?: Profile
  team?: Team
}
