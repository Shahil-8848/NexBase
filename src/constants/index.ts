export const APP_NAME = 'NexBase'
export const APP_TAGLINE = 'Competitive Esports powered by Solana'

export const SOLANA_NETWORK = (import.meta.env.VITE_SOLANA_NETWORK as string) || 'devnet'
export const SOLANA_RPC_URL =
  (import.meta.env.VITE_SOLANA_RPC_URL as string) || 'https://api.devnet.solana.com'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const TOURNAMENT_STATUS = {
  DRAFT: 'draft',
  REGISTRATION: 'registration',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const

export const MATCH_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const

export const TRANSACTION_TYPE = {
  ENTRY_FEE: 'entry_fee',
  PRIZE: 'prize',
  REFUND: 'refund',
} as const

export const USER_ROLE = {
  PLAYER: 'player',
  ORGANIZER: 'organizer',
  ADMIN: 'admin',
} as const

export const GAMES = [
  'Valorant',
  'CS2',
  'League of Legends',
  'Dota 2',
  'PUBG',
  'Fortnite',
  'Apex Legends',
  'Overwatch 2',
  'Rainbow Six Siege',
  'Rocket League',
] as const

export const PAGE_SIZE = 10

export const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com'

export const USDC_MINT = '4zMMC9sXzTL2gNNrtfPUPQvTSS14hxatbi2S6JKZ2sVZ'

