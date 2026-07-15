import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Trophy, Wallet, TrendingUp, DollarSign,
  ArrowRight, ExternalLink, Plus, Shield,
  Check, X, Bell, ShieldAlert,
} from 'lucide-react'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { tournamentService } from '@/services/tournament.service'
import { transactionService } from '@/services/transaction.service'
import { StatCard } from '@/components/shared/stat-card'
import { PageHeader } from '@/components/shared/page-header'
import { WalletBadge } from '@/components/shared/wallet-badge'
import { TournamentStatusBadge } from '@/components/shared/tournament-status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { formatSOL, formatRelative } from '@/utils/format'
import { truncateAddress } from '@/lib/utils'
import { teamService } from '@/services/team.service'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import targetIcon from '@/assets/3d-target.png'
import solCoinIcon from '@/assets/SOL_COIN.png'
import trophyIcon from '@/assets/trophy.png'

export function DashboardPage() {
  const { profile, isOrganizer } = useAuthContext()
  const { connected, address } = useSolanaWallet()

  // Teams Queries & Mutations
  const queryClient = useQueryClient()
  const { data: invites = [] } = useQuery({
    queryKey: ['pending-invites', profile?.id],
    queryFn: () => teamService.getPendingInvites(profile!.id),
    enabled: !!profile?.id,
  })

  const { data: teamMemberships = [] } = useQuery({
    queryKey: ['my-team-memberships', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data, error } = await supabase
        .from('team_members')
        .select('team_id, team:teams(*)')
        .eq('player_id', profile.id)
        .eq('status', 'accepted')
      if (error) throw error
      return data
    },
    enabled: !!profile?.id,
  })

  const teamIds = teamMemberships.map((m: any) => m.team_id)

  const { data: teamRegistrations = [] } = useQuery({
    queryKey: ['my-team-registrations', teamIds],
    queryFn: async () => {
      if (!teamIds.length) return []
      const { data, error } = await supabase
        .from('participants')
        .select('*, tournament:tournaments(*), team:teams(*)')
        .in('team_id', teamIds)
        .eq('payment_status', 'verified')
      if (error) throw error
      return data
    },
    enabled: teamIds.length > 0,
  })

  const responseMutation = useMutation({
    mutationFn: ({ inviteId, status }: { inviteId: string; status: 'accepted' | 'rejected' }) =>
      teamService.respondToInvite(inviteId, status),
    onSuccess: (_, variables) => {
      toast({ title: variables.status === 'accepted' ? 'Joined team!' : 'Invitation declined' })
      queryClient.invalidateQueries({ queryKey: ['pending-invites', profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['my-team-memberships', profile?.id] })
    },
    onError: (err) => toast({ title: 'Action failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const { data: tournamentsData, isLoading: toursLoading } = useQuery({
    queryKey: ['tournaments', 'listing', { status: 'registration', page: 1 }],
    queryFn: () => tournamentService.getTournaments({ status: 'registration', page: 1, sortBy: 'created_at', sortOrder: 'desc' }),
  })

  const { data: activeTournaments } = useQuery({
    queryKey: ['tournaments', 'listing', { status: 'active', page: 1 }],
    queryFn: () => tournamentService.getTournaments({ status: 'active', page: 1 }),
  })

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', profile?.id],
    queryFn: () => transactionService.getUserTransactions(profile!.id),
    enabled: !!profile?.id,
  })

  const { data: organizerTours, isLoading: orgToursLoading } = useQuery({
    queryKey: ['organizer-tournaments', profile?.id],
    queryFn: () => tournamentService.getOrganizerTournaments(profile!.id),
    enabled: !!profile?.id && isOrganizer,
  })

  const totalEarnings = (transactions ?? [])
    .filter((t) => t.type === 'prize' && t.status === 'confirmed')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalSpent = (transactions ?? [])
    .filter((t) => t.type === 'entry_fee' && t.status === 'confirmed')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${profile?.username ?? 'Player'}`}
        description="Here's what's happening on ChainArena today."
        actions={
          isOrganizer ? (
            <Link to="/organizer/create">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Tournament
              </Button>
            </Link>
          ) : (
            <Link to="/tournaments">
              <Button size="sm" className="gap-2">
                <Trophy className="h-4 w-4" />
                Browse Tournaments
              </Button>
            </Link>
          )
        }
      />

      {/* Pending Team Invites Alert */}
      {invites.length > 0 && (
        <div className="space-y-3">
          {invites.map((invite) => (
            <Card key={invite.id} className="border border-brand/20 bg-brand/5">
              <CardContent className="p-4 flex flex-row items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-brand/10 text-brand">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Team Invitation Received</p>
                    <p className="text-xs text-muted-foreground">
                      You have been invited to join <span className="font-semibold text-foreground">{invite.team?.name}</span> ({invite.team?.game}) by <span className="font-semibold text-foreground">{invite.team?.captain?.username}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => responseMutation.mutate({ inviteId: invite.id, status: 'accepted' })}
                    loading={responseMutation.isPending && responseMutation.variables?.inviteId === invite.id}
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 border-destructive/20 gap-1"
                    onClick={() => responseMutation.mutate({ inviteId: invite.id, status: 'rejected' })}
                    loading={responseMutation.isPending && responseMutation.variables?.inviteId === invite.id}
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Member Tournament Registration Alerts */}
      {teamRegistrations.length > 0 && (
        <div className="space-y-2">
          {teamRegistrations.map((reg) => (
            <Card key={reg.id} className="border-l-4 border-l-green-500 bg-green-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-600 shrink-0">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">Registered squad!</span>
                    <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-green-100 text-green-800 hover:bg-green-100 font-semibold border-green-200">
                      Team Mode
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your team <span className="font-semibold text-foreground">{reg.team?.name}</span> has been registered for the tournament <span className="font-semibold text-foreground">{reg.tournament?.title}</span> starting on <span className="font-semibold text-foreground">{formatRelative(reg.tournament?.start_date)}</span>.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Wallet connect banner */}
      {!connected && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Connect your Phantom wallet</p>
                <p className="text-xs text-muted-foreground">Required to join tournaments and receive prizes</p>
              </div>
            </div>
            <WalletMultiButton style={{
              background: 'hsl(var(--primary))',
              color: 'white',
              borderRadius: '6px',
              height: '36px',
              fontSize: '13px',
              fontWeight: 600,
              padding: '0 16px',
              border: 'none',
            }} />
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Earnings"
          value={formatSOL(totalEarnings)}
          trend="up"
          icon={<img src={solCoinIcon} alt="Total Earnings" className="h-10 w-10 object-contain" />}
          iconBg=""
          loading={txLoading}
        />
        <StatCard
          label="Entry Fees Paid"
          value={formatSOL(totalSpent)}
          icon={<Wallet className="h-5 w-5 text-blue-500" />}
          iconBg="bg-blue-500/10"
          loading={txLoading}
        />
        <StatCard
          label="Open Tournaments"
          value={tournamentsData?.total ?? 0}
          icon={<img src={targetIcon} alt="Open Tournaments" className="h-10 w-10 object-contain" />}
          iconBg=""
          loading={toursLoading}
        />
        <StatCard
          label={isOrganizer ? 'My Tournaments' : 'Trust Score'}
          value={isOrganizer ? (organizerTours?.length ?? 0) : profile?.trust_score ?? 0}
          icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
          iconBg="bg-purple-500/10"
          loading={isOrganizer ? orgToursLoading : false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wallet card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Wallet Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WalletBadge address={profile?.wallet_address ?? address} showAddress />
            {connected && address && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-mono text-xs">{truncateAddress(address, 6)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <Badge variant="info" className="text-xs">Devnet</Badge>
                </div>
              </div>
            )}
            {!connected && (
              <p className="text-xs text-muted-foreground">
                Connect your wallet to participate in tournaments and receive prizes on Solana.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming tournaments */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Open Registration</CardTitle>
            <Link to="/tournaments" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {toursLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-7 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : !tournamentsData?.data.length ? (
              <EmptyState
                icon={<img src={trophyIcon} alt="No tournaments" className="h-16 w-16 object-contain" />}
                title="No open tournaments"
                description="Check back soon for new competitions"
              />
            ) : (
              <div className="divide-y -mx-6">
                {tournamentsData.data.slice(0, 4).map((t) => (
                  <Link
                    key={t.id}
                    to={`/tournaments/${t.id}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-14 h-9 rounded-lg border border-border overflow-hidden shrink-0 flex items-center justify-center bg-zinc-950/20 shadow-sm">
                      {t.banner ? (
                        <img src={t.banner} alt={t.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-brand/10 flex items-center justify-center text-lg">
                          🎮
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.game} · {t.current_players}/{t.max_players} players</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatSOL(t.entry_fee)}</p>
                      <p className="text-xs text-muted-foreground">entry</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
          <Link to="/transactions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : !(transactions?.length) ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title="No transactions yet"
              description="Your on-chain transactions will appear here"
            />
          ) : (
            <div className="divide-y -mx-6">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tx.type === 'prize' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                      {tx.type === 'prize' ? '🏆' : '💸'}
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(tx.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${tx.type === 'prize' ? 'text-green-500' : ''}`}>
                      {tx.type === 'prize' ? '+' : '-'}{formatSOL(Number(tx.amount))}
                    </span>
                    <a href={tx.explorer_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Tournaments */}
      {(activeTournaments?.data.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live Now</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeTournaments!.data.slice(0, 4).map((t) => (
                <Link
                  key={t.id}
                  to={`/tournaments/${t.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.game}</p>
                  </div>
                  <TournamentStatusBadge status={t.tournament_status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
