import { Trophy } from 'lucide-react'
import type { Match } from '@/types'
import { EmptyState } from '@/components/shared/empty-state'
import { MatchStatusBadge } from '@/components/shared/tournament-status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, getAvatarUrl } from '@/lib/utils'

interface BracketViewProps {
  matches: Match[]
}

export function BracketView({ matches }: BracketViewProps) {
  if (!matches.length) {
    return (
      <EmptyState
        icon={<Trophy className="h-8 w-8" />}
        title="Bracket not set up yet"
        description="The organizer will set up matches once registration closes"
      />
    )
  }

  // Group by round
  const rounds = matches.reduce<Record<number, Match[]>>((acc, m) => {
    if (!acc[m.round]) acc[m.round] = []
    acc[m.round].push(m)
    return acc
  }, {})

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-8 min-w-max pb-4">
        {Object.entries(rounds).map(([round, roundMatches]) => (
          <div key={round} className="flex flex-col gap-4 min-w-[200px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
              Round {round}
            </p>
            <div className="flex flex-col gap-3">
              {roundMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatchCard({ match }: { match: Match }) {
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Match</span>
        <MatchStatusBadge status={match.match_status} />
      </div>
      <div className="divide-y">
        <PlayerRow
          profile={match.player_one_profile}
          isWinner={match.winner === match.player_one}
          isCompleted={match.match_status === 'completed'}
        />
        <PlayerRow
          profile={match.player_two_profile}
          isWinner={match.winner === match.player_two}
          isCompleted={match.match_status === 'completed'}
        />
      </div>
    </div>
  )
}

function PlayerRow({
  profile,
  isWinner,
  isCompleted,
}: {
  profile?: { username: string; avatar?: string | null } | null
  isWinner: boolean
  isCompleted: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 text-sm',
      isCompleted && isWinner && 'bg-green-50',
      isCompleted && !isWinner && 'opacity-50',
    )}>
      <Avatar className="h-5 w-5">
        <AvatarImage src={getAvatarUrl(profile?.avatar, profile?.username ?? 'TBD')} />
        <AvatarFallback className="text-[10px]">
          {profile?.username?.slice(0, 2).toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <span className={cn('flex-1 truncate', isWinner && 'font-semibold')}>
        {profile?.username ?? 'TBD'}
      </span>
      {isCompleted && isWinner && (
        <Trophy className="h-3 w-3 text-brand-600 shrink-0" />
      )}
    </div>
  )
}
