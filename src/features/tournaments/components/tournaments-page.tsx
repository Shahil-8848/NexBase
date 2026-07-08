import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search, SlidersHorizontal, Trophy, Users, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { TournamentStatusBadge } from '@/components/shared/tournament-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/use-debounce'
import { formatSOL, formatDate } from '@/utils/format'
import { GAMES } from '@/constants'
import type { TournamentFilters } from '@/types'

export function TournamentsPage() {
  const [filters, setFilters] = useState<TournamentFilters>({
    search: '',
    game: 'all',
    status: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc',
    page: 1,
  })

  const debouncedSearch = useDebounce(filters.search, 400)

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', 'listing', { ...filters, search: debouncedSearch }],
    queryFn: () =>
      tournamentService.getTournaments({ ...filters, search: debouncedSearch }),
    placeholderData: (prev) => prev,
  })

  const setFilter = <K extends keyof TournamentFilters>(key: K, val: TournamentFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: val, page: key !== 'page' ? 1 : (val as number) }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tournaments"
        description="Browse and join competitive esports tournaments"
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search tournaments..."
                startIcon={<Search className="h-4 w-4" />}
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>
            <Select value={filters.game} onValueChange={(v) => setFilter('game', v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Game" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                {GAMES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(v) => setFilter('status', v as TournamentFilters['status'])}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="registration">Registration Open</SelectItem>
                <SelectItem value="active">Live</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${filters.sortBy}-${filters.sortOrder}`} onValueChange={(v) => {
              const [by, order] = v.split('-') as [TournamentFilters['sortBy'], TournamentFilters['sortOrder']]
              setFilters((f) => ({ ...f, sortBy: by, sortOrder: order, page: 1 }))
            }}>
              <SelectTrigger className="w-full sm:w-44">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at-desc">Newest First</SelectItem>
                <SelectItem value="created_at-asc">Oldest First</SelectItem>
                <SelectItem value="prize_pool-desc">Highest Prize</SelectItem>
                <SelectItem value="entry_fee-asc">Lowest Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results info */}
      {!isLoading && data && (
        <p className="text-sm text-muted-foreground">
          Showing {data.data.length} of {data.total} tournaments
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <TournamentCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title="No tournaments found"
          description="Try adjusting your filters or check back later"
          action={
            <Button variant="outline" onClick={() => setFilters({ search: '', game: 'all', status: 'all', sortBy: 'created_at', sortOrder: 'desc', page: 1 })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.data.map((t) => (
            <Link key={t.id} to={`/tournaments/${t.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                {/* Banner */}
                <div className="h-36 bg-gradient-to-br from-muted to-muted/40 rounded-t-lg overflow-hidden relative">
                  {t.banner ? (
                    <img src={t.banner} alt={t.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Trophy className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <TournamentStatusBadge status={t.tournament_status} />
                  </div>
                </div>

                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.game}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/60 rounded-md p-2">
                      <p className="text-muted-foreground">Entry Fee</p>
                      <p className="font-semibold mt-0.5">{t.entry_fee === 0 ? 'Free' : formatSOL(t.entry_fee)}</p>
                    </div>
                    <div className="bg-muted/60 rounded-md p-2">
                      <p className="text-muted-foreground">Prize Pool</p>
                      <p className="font-semibold mt-0.5 text-brand-700">{formatSOL(t.prize_pool)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t.current_players}/{t.max_players}
                    </span>
                    {t.start_date && (
                      <span>{formatDate(t.start_date)}</span>
                    )}
                  </div>

                  {/* Slots progress */}
                  <div className="space-y-1">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all"
                        style={{ width: `${Math.min(100, (t.current_players / t.max_players) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {t.max_players - t.current_players} slots left
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => setFilter('page', filters.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === filters.page ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('page', p)}
              className="w-8 h-8 p-0"
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= data.totalPages}
            onClick={() => setFilter('page', filters.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function TournamentCardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-36 rounded-b-none" />
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  )
}
