import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trophy, Users, DollarSign, BarChart3,
  Edit, Trash2, Eye, MoreHorizontal, CheckCircle, XCircle,
} from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { useAuthContext } from '@/app/auth-context'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { TournamentStatusBadge } from '@/components/shared/tournament-status-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatSOL, formatDate } from '@/utils/format'
import type { Tournament } from '@/types'

export function OrganizerDashboardPage() {
  const { profile } = useAuthContext()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null)

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['organizer-tournaments', profile?.id],
    queryFn: () => tournamentService.getOrganizerTournaments(profile!.id),
    enabled: !!profile?.id,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tournamentService.deleteTournament(id),
    onSuccess: () => {
      toast({ title: 'Tournament deleted' })
      queryClient.invalidateQueries({ queryKey: ['organizer-tournaments', profile?.id] })
      setDeleteTarget(null)
    },
    onError: (err) => toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Tournament['tournament_status'] }) =>
      tournamentService.updateTournament(id, { tournament_status: status }),
    onSuccess: () => {
      toast({ title: 'Tournament status updated' })
      queryClient.invalidateQueries({ queryKey: ['organizer-tournaments', profile?.id] })
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const stats = {
    total: tournaments?.length ?? 0,
    active: tournaments?.filter((t) => t.tournament_status === 'active').length ?? 0,
    totalPlayers: tournaments?.reduce((s, t) => s + t.current_players, 0) ?? 0,
    totalPrize: tournaments?.reduce((s, t) => s + Number(t.prize_pool), 0) ?? 0,
  }

  const nextStatus: Record<string, Tournament['tournament_status']> = {
    draft: 'registration',
    registration: 'active',
    active: 'completed',
  }
  const nextStatusLabel: Record<string, string> = {
    draft: 'Open Registration',
    registration: 'Start Tournament',
    active: 'End Tournament',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tournaments"
        description="Manage your tournaments and track performance"
        actions={
          <Link to="/organizer/create">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Create Tournament
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tournaments" value={stats.total} icon={<Trophy className="h-5 w-5 text-brand-600" />} iconBg="bg-brand/10" loading={isLoading} />
        <StatCard label="Active Now" value={stats.active} icon={<BarChart3 className="h-5 w-5 text-blue-500" />} iconBg="bg-blue-50" loading={isLoading} />
        <StatCard label="Total Players" value={stats.totalPlayers} icon={<Users className="h-5 w-5 text-purple-500" />} iconBg="bg-purple-50" loading={isLoading} />
        <StatCard label="Total Prize Pool" value={formatSOL(stats.totalPrize)} icon={<DollarSign className="h-5 w-5 text-green-600" />} iconBg="bg-green-50" loading={isLoading} />
      </div>

      {/* Tournaments list */}
      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 border-b">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-28" /></div>
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </CardContent>
        ) : !tournaments?.length ? (
          <CardContent>
            <EmptyState
              icon={<Trophy className="h-12 w-12" />}
              title="No tournaments yet"
              description="Create your first tournament to get started"
              action={
                <Link to="/organizer/create">
                  <Button className="gap-2"><Plus className="h-4 w-4" />Create Tournament</Button>
                </Link>
              }
            />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-6 py-3 text-xs text-muted-foreground font-medium">Tournament</th>
                  <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">Status</th>
                  <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Players</th>
                  <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Prize Pool</th>
                  <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Created</th>
                  <th className="text-right px-6 py-3 text-xs text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Trophy className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.game}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <TournamentStatusBadge status={t.tournament_status} />
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="font-medium">{t.current_players}</span>
                      <span className="text-muted-foreground">/{t.max_players}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell font-medium text-brand-700">
                      {formatSOL(t.prize_pool)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs hidden lg:table-cell">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link to={`/tournaments/${t.id}`} className="flex items-center gap-2">
                              <Eye className="h-4 w-4" /> View Tournament
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/organizer/tournaments/${t.id}`} className="flex items-center gap-2">
                              <Edit className="h-4 w-4" /> Manage
                            </Link>
                          </DropdownMenuItem>
                          {nextStatus[t.tournament_status] && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ id: t.id, status: nextStatus[t.tournament_status] })}
                                className="flex items-center gap-2"
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                {nextStatusLabel[t.tournament_status]}
                              </DropdownMenuItem>
                            </>
                          )}
                          {t.tournament_status !== 'cancelled' && t.tournament_status !== 'completed' && (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'cancelled' })}
                              className="flex items-center gap-2 text-destructive"
                            >
                              <XCircle className="h-4 w-4" /> Cancel
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(t)}
                            className="flex items-center gap-2 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This action cannot be undone. All participants and matches will be permanently removed."
        confirmLabel="Delete Tournament"
        variant="destructive"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id) }}
      />
    </div>
  )
}
