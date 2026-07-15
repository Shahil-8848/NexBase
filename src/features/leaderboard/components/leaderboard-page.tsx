import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Trophy, Medal, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared/page-header'
import { WalletBadge } from '@/components/shared/wallet-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatSOL } from '@/utils/format'
import { getAvatarUrl } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import type { Profile } from '@/types'

interface LeaderboardRow {
  profile: Profile
  wins: number
  total_earnings: number
  matches_played: number
}

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  // Get all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('trust_score', { ascending: false })
    .limit(100)

  if (!profiles) return []

  // Get win counts from matches
  const { data: wins } = await supabase
    .from('matches')
    .select('winner')
    .eq('match_status', 'completed')

  // Get earnings from transactions
  const { data: earnings } = await supabase
    .from('transactions')
    .select('user_id, amount')
    .eq('type', 'prize')
    .eq('status', 'confirmed')

  const winMap: Record<string, number> = {}
  ;(wins ?? []).forEach((m: { winner: string | null }) => {
    if (m.winner) winMap[m.winner] = (winMap[m.winner] ?? 0) + 1
  })

  const earningsMap: Record<string, number> = {}
  ;(earnings ?? []).forEach((t: { user_id: string; amount: number }) => {
    earningsMap[t.user_id] = (earningsMap[t.user_id] ?? 0) + Number(t.amount)
  })

  return (profiles as Profile[]).map((p) => ({
    profile: p,
    wins: winMap[p.id] ?? 0,
    total_earnings: earningsMap[p.id] ?? 0,
    matches_played: 0,
  })).sort((a, b) => b.wins - a.wins || b.total_earnings - a.total_earnings)
}

export function LeaderboardPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
  })

  const filtered = (rows ?? []).filter((r) =>
    !debouncedSearch || r.profile.username.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />
    if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />
    return <span className="text-sm text-muted-foreground font-mono">{rank}</span>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboard"
        description="Top players ranked by wins and earnings"
      />

      <div className="max-w-xs">
        <Input
          placeholder="Search players..."
          startIcon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Top 3 podium */}
      {!isLoading && filtered.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-2">
          {[filtered[1], filtered[0], filtered[2]].map((row, i) => {
            const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3
            const heights = ['h-24', 'h-32', 'h-20']
            return (
              <Link key={row.profile.id} to={`/profile/${row.profile.id}`}>
                <Card className="text-center hover:shadow-md transition-shadow">
                  <CardContent className={`p-3 flex flex-col items-center justify-end ${heights[i]}`}>
                    <Avatar className="h-10 w-10 mb-2">
                      <AvatarImage src={getAvatarUrl(row.profile.avatar, row.profile.username)} />
                      <AvatarFallback className="text-xs font-bold">
                        {row.profile.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="mb-1">{rankIcon(actualRank)}</div>
                    <p className="text-xs font-semibold truncate w-full text-center">{row.profile.username}</p>
                    <p className="text-xs text-muted-foreground">{row.wins}W</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Full table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium w-12">#</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Player</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Wins</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">Earnings</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Trust Score</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 w-28" /></div></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-right hidden md:table-cell"><Skeleton className="h-4 w-10 ml-auto" /></td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell"><Skeleton className="h-5 w-20 ml-auto rounded-full" /></td>
                  </tr>
                ))
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <EmptyState icon={<Trophy className="h-10 w-10" />} title="No players found" />
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr key={row.profile.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center w-6">{rankIcon(idx + 1)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/profile/${row.profile.id}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={getAvatarUrl(row.profile.avatar, row.profile.username)} />
                          <AvatarFallback className="text-xs font-bold bg-brand/20 text-brand-700">
                            {row.profile.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{row.profile.username}</span>
                        {row.profile.role === 'organizer' && (
                          <Badge variant="brand" className="text-xs hidden sm:inline-flex">Organizer</Badge>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{row.wins}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium hidden sm:table-cell">
                      {formatSOL(row.total_earnings)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <Badge variant={row.profile.trust_score >= 100 ? 'success' : 'secondary'}>
                        {row.profile.trust_score}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <WalletBadge address={row.profile.wallet_address} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
