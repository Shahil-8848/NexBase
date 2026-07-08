import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Wallet, BarChart3, CheckCircle2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { transactionService } from '@/services/transaction.service'
import { useAuthContext } from '@/app/auth-context'
import { PageHeader } from '@/components/shared/page-header'
import { WalletBadge } from '@/components/shared/wallet-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { formatSOL, formatRelative } from '@/utils/format'
import type { Profile } from '@/types'

async function getProfileById(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
  return data as Profile | null
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuthContext()
  const isOwn = currentUser?.id === id

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => getProfileById(id!),
    enabled: !!id,
  })

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => transactionService.getUserTransactions(id!),
    enabled: !!id,
  })

  const { data: participations, isLoading: partLoading } = useQuery({
    queryKey: ['participations-by-player', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('participants')
        .select('*, tournament:tournaments(id,title,game,tournament_status)')
        .eq('player_id', id!)
        .order('joined_at', { ascending: false })
      return data ?? []
    },
    enabled: !!id,
  })

  const totalEarnings = (transactions ?? [])
    .filter((t) => t.type === 'prize' && t.status === 'confirmed')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const verifiedTx = (transactions ?? []).filter((t) => t.status === 'confirmed').length

  if (profileLoading) return <ProfileSkeleton />
  if (!profile) return <EmptyState icon={<BarChart3 className="h-12 w-12" />} title="Profile not found" />

  return (
    <div className="space-y-6">
      <PageHeader title={isOwn ? 'My Profile' : profile.username} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <Avatar className="h-20 w-20 mx-auto">
              <AvatarImage src={profile.avatar ?? undefined} />
              <AvatarFallback className="text-2xl font-bold bg-brand/20 text-brand-700">
                {profile.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-bold text-xl">{profile.username}</h2>
              <Badge variant="secondary" className="mt-1 capitalize">{profile.role}</Badge>
            </div>
            <WalletBadge address={profile.wallet_address} showAddress />
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-brand-600">{profile.trust_score}</p>
                <p className="text-xs text-muted-foreground">Trust Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{participations?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Tournaments</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Joined {formatRelative(profile.created_at)}
            </p>
          </CardContent>
        </Card>

        {/* Stats + Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile icon={<Trophy className="h-4 w-4 text-brand-600" />} label="Total Earnings" value={formatSOL(totalEarnings)} />
            <StatTile icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Confirmed Tx" value={String(verifiedTx)} />
            <StatTile icon={<BarChart3 className="h-4 w-4 text-purple-500" />} label="Joined" value={String(participations?.length ?? 0)} />
          </div>

          {/* Tournament history */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tournament History</CardTitle>
            </CardHeader>
            <CardContent>
              {partLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : !participations?.length ? (
                <EmptyState icon={<Trophy className="h-8 w-8" />} title="No tournaments yet" />
              ) : (
                <div className="divide-y -mx-6">
                  {participations.map((p: Record<string, unknown>) => {
                    const tour = p.tournament as { id: string; title: string; game: string; tournament_status: string } | null
                    return (
                      <div key={p.id as string} className="flex items-center gap-3 px-6 py-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm">🎮</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tour?.title ?? 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{tour?.game}</p>
                        </div>
                        <Badge variant={(p.payment_status as string) === 'verified' ? 'success' : 'secondary'} className="text-xs">
                          {(p.payment_status as string)}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transaction timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transaction Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : !transactions?.length ? (
                <EmptyState icon={<Wallet className="h-8 w-8" />} title="No transactions" />
              ) : (
                <div className="relative pl-5 space-y-4">
                  <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                  {transactions.slice(0, 8).map((tx) => (
                    <div key={tx.id} className="relative flex items-start gap-3">
                      <div className={`absolute -left-3 w-2 h-2 rounded-full mt-1.5 ${tx.type === 'prize' ? 'bg-green-500' : 'bg-blue-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{formatRelative(tx.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-semibold ${tx.type === 'prize' ? 'text-green-600' : ''}`}>
                          {tx.type === 'prize' ? '+' : '-'}{formatSOL(Number(tx.amount))}
                        </span>
                        <a href={tx.explorer_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Skeleton className="h-80 rounded-lg" />
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}
