import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Trophy, Users, CheckCircle, XCircle,
  Send, Plus, Shield, Ban, RefreshCw, AlertTriangle
} from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { transactionService } from '@/services/transaction.service'
import { governanceService, Dispute, Vote } from '@/services/governance.service'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { TournamentStatusBadge, PaymentStatusBadge, MatchStatusBadge } from '@/components/shared/tournament-status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatSOL, formatRelative } from '@/utils/format'
import { getSolanaExplorerUrl } from '@/lib/utils'
import type { Participant, Match } from '@/types'

export function ManageTournamentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { sendPayment, payoutTournament, refundTournamentRegistration } = useSolanaWallet()
  const queryClient = useQueryClient()

  const [prizeDialogOpen, setPrizeDialogOpen] = useState(false)
  const [prizeTarget, setPrizeTarget] = useState<Participant | null>(null)
  const [prizeAmount, setPrizeAmount] = useState('')
  const [prizeDescription, setPrizeDescription] = useState('1st Place Winner')
  const [customDescription, setCustomDescription] = useState('')
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [newMatchRound, setNewMatchRound] = useState('1')
  const [newMatchP1, setNewMatchP1] = useState('')
  const [newMatchP2, setNewMatchP2] = useState('')

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentService.getTournamentById(id!),
    enabled: !!id,
  })

  const { data: participants, refetch: refetchParticipants } = useQuery({
    queryKey: ['participants', id],
    queryFn: () => tournamentService.getParticipants(id!),
    enabled: !!id,
  })

  const { data: matches } = useQuery({
    queryKey: ['matches', id],
    queryFn: () => tournamentService.getMatches(id!),
    enabled: !!id,
  })

  const { data: prizesSent = 0 } = useQuery({
    queryKey: ['tournament-prizes-sent', id],
    queryFn: () => transactionService.getTournamentPrizesSent(id!),
    enabled: !!id,
  })

  const totalPrizePool = Number(tournament?.prize_pool || 0)
  const remainingPrizePool = Math.max(0, totalPrizePool - prizesSent)

  const verifyPaymentMutation = useMutation({
    mutationFn: ({ participantId, status }: { participantId: string; status: 'verified' | 'failed' }) =>
      tournamentService.verifyParticipantPayment(participantId, status),
    onSuccess: () => {
      toast({ title: 'Payment status updated' })
      queryClient.invalidateQueries({ queryKey: ['participants', id] })
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const setWinnerMutation = useMutation({
    mutationFn: ({ matchId, winnerId }: { matchId: string; winnerId: string }) =>
      tournamentService.setMatchWinner(matchId, winnerId),
    onSuccess: () => {
      toast({ title: 'Match winner set' })
      queryClient.invalidateQueries({ queryKey: ['matches', id] })
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const createMatchMutation = useMutation({
    mutationFn: () =>
      tournamentService.createMatch({
        tournament_id: id!,
        round: Number(newMatchRound),
        player_one: newMatchP1,
        player_two: newMatchP2,
        winner: null,
        match_status: 'pending',
        scheduled_at: null,
      }),
    onSuccess: () => {
      toast({ title: 'Match created' })
      queryClient.invalidateQueries({ queryKey: ['matches', id] })
      setMatchDialogOpen(false)
      setNewMatchP1(''); setNewMatchP2('')
    },
    onError: (err) => toast({ title: 'Failed to create match', description: (err as Error).message, variant: 'destructive' }),
  })

  // Cancel tournament mutation
  const cancelTournamentMutation = useMutation({
    mutationFn: () =>
      tournamentService.updateTournament(id!, { tournament_status: 'cancelled' }),
    onSuccess: () => {
      toast({ title: 'Tournament cancelled', description: 'Players can now receive their refunds.' })
      queryClient.invalidateQueries({ queryKey: ['tournament', id] })
    },
    onError: (err) => toast({ title: 'Failed to cancel', description: (err as Error).message, variant: 'destructive' }),
  })

  // Refund player from escrow vault
  const refundPlayerMutation = useMutation({
    mutationFn: async (p: Participant) => {
      if (!p.player?.wallet_address) throw new Error('Player has no wallet connected.')
      if (tournament!.entry_fee === 0) throw new Error('Tournament entry fee is free.')

      // Trigger Solana transaction sending fee back from vault to player
      const sig = await refundTournamentRegistration(
        id!,
        p.player.wallet_address,
        tournament!.token_type,
        tournament!.entry_fee
      )

      // Update db status to refunded
      await tournamentService.verifyParticipantPayment(p.id, 'refunded')

      // Record transaction
      await transactionService.createTransaction({
        user_id: p.player_id,
        type: 'refund',
        amount: tournament!.entry_fee,
        signature: sig,
        status: 'confirmed',
        tournament_id: id,
        description: `Refund for ${tournament!.title}`,
      })

      return sig
    },
    onSuccess: (sig) => {
      toast({ title: 'Refund processed!', description: `Tx signature: ${sig.slice(0, 15)}...` })
      queryClient.invalidateQueries({ queryKey: ['participants', id] })
    },
    onError: (err) => toast({ title: 'Refund failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const sendPrizeMutation = useMutation({
    mutationFn: async ({
      participant,
      amount,
      description,
    }: {
      participant: Participant
      amount: number
      description: string
    }) => {
      if (!participant.player?.wallet_address) throw new Error('Player has no wallet connected')
      
      let sig: string
      if (tournament?.vault_address) {
        // Decentralized Vault Payout
        sig = await payoutTournament(id!, participant.player.wallet_address, tournament.token_type)
      } else {
        // Direct Transfer Payout
        sig = await sendPayment(participant.player.wallet_address, amount, tournament!.token_type)
      }

      // Record transaction
      await transactionService.createTransaction({
        user_id: participant.player_id,
        type: 'prize',
        amount,
        signature: sig,
        status: 'confirmed',
        tournament_id: id,
        description,
      })

      // Award achievement badge in db (linked to Sol signature)
      await supabase.from('badges').insert({
        player_id: participant.player_id,
        tournament_id: id!,
        title: `Champion: ${tournament!.title}`,
        image_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=60', // Premium trophy badge
        signature: sig,
      })

      return sig
    },
    onSuccess: (sig) => {
      toast({ title: 'Prize sent & badge awarded!', description: `TX: ${sig.slice(0, 20)}...` })
      setPrizeDialogOpen(false)
      setPrizeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['tournament-prizes-sent', id] })
    },
    onError: (err) => toast({ title: 'Prize send failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const verifiedPlayers = participants?.filter((p) => p.payment_status === 'verified') ?? []

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )

  if (!tournament) return (
    <EmptyState icon={<Trophy className="h-12 w-12" />} title="Tournament not found"
      action={<Button onClick={() => navigate('/organizer')}>Back</Button>} />
  )

  const isCancelled = tournament.tournament_status === 'cancelled'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/organizer')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> My Tournaments
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">{tournament.title}</h1>
            <TournamentStatusBadge status={tournament.tournament_status} />
          </div>
          <p className="text-muted-foreground">{tournament.game}</p>
        </div>
        <div className="flex gap-2">
          {tournament.tournament_status !== 'completed' && !isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 border-destructive/20 gap-1.5"
              onClick={() => {
                if (confirm('Are you sure you want to cancel this tournament? This will unlock entry fees for refunds.')) {
                  cancelTournamentMutation.mutate()
                }
              }}
            >
              <Ban className="h-4 w-4" /> Cancel Tournament
            </Button>
          )}
          <Link to={`/tournaments/${id}`}>
            <Button variant="outline" size="sm">View Public Page</Button>
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Players', value: `${tournament.current_players}/${tournament.max_players}` },
          { label: 'Verified', value: String(verifiedPlayers.length) },
          { label: 'Entry Fee', value: formatSOL(tournament.entry_fee, 4, tournament.token_type) },
          { label: 'Prize Pool', value: formatSOL(tournament.prize_pool, 2, tournament.token_type) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="players">
        <TabsList>
          <TabsTrigger value="players">Players ({participants?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="matches">Matches ({matches?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="prizes">Prizes</TabsTrigger>
          <TabsTrigger value="disputes">Match Disputes</TabsTrigger>
        </TabsList>

        {/* Players tab */}
        <TabsContent value="players" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {!participants?.length ? (
                <EmptyState icon={<Users className="h-8 w-8" />} title="No players registered yet" />
              ) : (
                <div className="divide-y">
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p.player?.avatar ?? undefined} />
                        <AvatarFallback className="text-xs">{p.player?.username?.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{p.player?.username}</p>
                        <p className="text-xs text-muted-foreground">{formatRelative(p.joined_at)}</p>
                      </div>
                      <PaymentStatusBadge status={p.payment_status} />
                      {p.transaction_signature && (
                        <a href={getSolanaExplorerUrl(p.transaction_signature)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground font-mono">
                          {p.transaction_signature.slice(0,8)}...
                        </a>
                      )}
                      <div className="flex gap-2">
                        {p.payment_status === 'pending' && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-600 hover:text-green-700"
                              onClick={() => verifyPaymentMutation.mutate({ participantId: p.id, status: 'verified' })}
                              title="Verify payment"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive/80"
                              onClick={() => verifyPaymentMutation.mutate({ participantId: p.id, status: 'failed' })}
                              title="Reject payment"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {isCancelled && p.payment_status === 'verified' && tournament.entry_fee > 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs gap-1 py-1 h-7"
                            loading={refundPlayerMutation.isPending && refundPlayerMutation.variables?.id === p.id}
                            onClick={() => refundPlayerMutation.mutate(p)}
                          >
                            <RefreshCw className="h-3 w-3" /> Refund Fee
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Matches tab */}
        <TabsContent value="matches" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => setMatchDialogOpen(true)} disabled={verifiedPlayers.length < 2}>
              <Plus className="h-4 w-4" /> Add Match
            </Button>
          </div>

          {!matches?.length ? (
            <EmptyState
              icon={<Trophy className="h-8 w-8" />}
              title="No matches set up"
              description="Add matches once you have enough verified players"
            />
          ) : (
            <div className="space-y-2">
              {matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  onSetWinner={(winnerId) => setWinnerMutation.mutate({ matchId: match.id, winnerId })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Prizes tab */}
        <TabsContent value="prizes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribute Prizes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-brand/5 border border-brand/20 text-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Prize Pool</p>
                  <p className="font-bold text-base text-brand-700">{formatSOL(totalPrizePool, 2, tournament.token_type)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prizes Distributed</p>
                  <p className="font-bold text-base text-muted-foreground">{formatSOL(prizesSent, 2, tournament.token_type)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining to Distribute</p>
                  <p className="font-bold text-base text-green-700">{formatSOL(remainingPrizePool, 2, tournament.token_type)}</p>
                </div>
              </div>

              {tournament.vault_address && (
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-brand" /> Smart Escrow Enabled
                  </span>
                  <p>Funds will be paid out directly from the Escrow Vault Address. Phantoms will prompt to sign and transfer vault assets to winners.</p>
                </div>
              )}

              {verifiedPlayers.length === 0 ? (
                <EmptyState icon={<Users className="h-8 w-8" />} title="No verified players yet" description="Verify player payments first" />
              ) : (
                <div className="space-y-2">
                  {verifiedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p.player?.avatar ?? undefined} />
                        <AvatarFallback className="text-xs">{p.player?.username?.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.player?.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.player?.wallet_address ? `Wallet: ${p.player.wallet_address.slice(0,12)}...` : 'No wallet connected'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!p.player?.wallet_address}
                        onClick={() => {
                          setPrizeTarget(p)
                          setPrizeAmount(String(remainingPrizePool))
                          setPrizeDescription('1st Place Winner')
                          setCustomDescription('')
                          setPrizeDialogOpen(true)
                        }}
                        className="gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" /> Send Prize
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Disputes tab */}
        <TabsContent value="disputes" className="mt-4">
          <OrganizerDisputesList matches={matches ?? []} />
        </TabsContent>
      </Tabs>

      {/* Prize confirmation dialog */}
      <Dialog open={prizeDialogOpen} onOpenChange={setPrizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Prize to {prizeTarget?.player?.username}</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <div className="space-y-1.5">
              <Label>Prize Amount ({tournament.token_type})</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.0"
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Remaining pool to distribute: {formatSOL(remainingPrizePool, 2, tournament.token_type)}
              </p>
              {Number(prizeAmount) > remainingPrizePool && (
                <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                  ⚠️ Warning: Amount exceeds remaining prize pool
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Reward Category / Description</Label>
              <Select value={prizeDescription} onValueChange={setPrizeDescription}>
                <SelectTrigger>
                  <SelectValue placeholder="Select description" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1st Place Winner">1st Place Winner</SelectItem>
                  <SelectItem value="2nd Place Runner-Up">2nd Place Runner-Up</SelectItem>
                  <SelectItem value="3rd Place Winner">3rd Place Winner</SelectItem>
                  <SelectItem value="Custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {prizeDescription === 'Custom' && (
              <div className="space-y-1.5">
                <Label>Custom Description</Label>
                <Input
                  placeholder="e.g. Semifinalist, MVP..."
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                />
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Final Transfer Amount</span>
                <span className="font-bold text-brand-700">{prizeAmount || '0'} {tournament.token_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient Wallet</span>
                <span className="font-mono text-xs truncate max-w-[200px]">
                  {prizeTarget?.player?.wallet_address}
                </span>
              </div>
            </div>
            
            <div className="p-2.5 rounded bg-brand-50 border border-brand-100 flex items-center gap-1.5 text-xs text-brand-700">
              <Trophy className="h-4 w-4 shrink-0 text-brand" />
              <span>This will automatically award an achievement badge directly to the player profile!</span>
            </div>

            <p className="text-xs text-muted-foreground">
              {tournament.vault_address
                ? 'This will process an on-chain transfer FROM the escrow vault to the winner. Verify and sign in Phantom.'
                : 'This will initiate a direct transfer from your wallet. Confirm in Phantom.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrizeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={sendPrizeMutation.isPending}
              disabled={!prizeAmount || Number(prizeAmount) <= 0}
              onClick={() =>
                prizeTarget &&
                sendPrizeMutation.mutate({
                  participant: prizeTarget,
                  amount: Number(prizeAmount),
                  description:
                    prizeDescription === 'Custom'
                      ? customDescription || 'Custom Prize'
                      : prizeDescription,
                })
              }
            >
              Confirm &amp; Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Match dialog */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Match</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Round</Label>
              <Input type="number" min="1" value={newMatchRound} onChange={(e) => setNewMatchRound(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Player 1</Label>
              <Select onValueChange={setNewMatchP1}>
                <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                <SelectContent>
                  {verifiedPlayers.map((p) => (
                    <SelectItem key={p.player_id} value={p.player_id}>{p.player?.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Player 2</Label>
              <Select onValueChange={setNewMatchP2}>
                <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                <SelectContent>
                  {verifiedPlayers.filter((p) => p.player_id !== newMatchP1).map((p) => (
                    <SelectItem key={p.player_id} value={p.player_id}>{p.player?.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newMatchP1 || !newMatchP2 || createMatchMutation.isPending}
              loading={createMatchMutation.isPending}
              onClick={() => createMatchMutation.mutate()}
            >
              Create Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MatchRow({ match, onSetWinner }: { match: Match; onSetWinner: (id: string) => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground font-medium">Round {match.round}</span>
          <MatchStatusBadge status={match.match_status} />
        </div>
        <div className="flex items-center gap-3">
          <PlayerSlot
            profile={match.player_one_profile}
            isWinner={match.winner === match.player_one}
            isCompleted={match.match_status === 'completed'}
          />
          <span className="text-muted-foreground text-xs font-medium">vs</span>
          <PlayerSlot
            profile={match.player_two_profile}
            isWinner={match.winner === match.player_two}
            isCompleted={match.match_status === 'completed'}
          />
        </div>
        {match.match_status !== 'completed' && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onSetWinner(match.player_one)}
            >
              {match.player_one_profile?.username ?? 'P1'} wins
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onSetWinner(match.player_two)}
            >
              {match.player_two_profile?.username ?? 'P2'} wins
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlayerSlot({ profile, isWinner, isCompleted }: { profile?: { username: string; avatar?: string | null } | null; isWinner: boolean; isCompleted: boolean }) {
  return (
    <div className={`flex items-center gap-2 flex-1 p-2 rounded-lg ${isCompleted && isWinner ? 'bg-green-50 border border-green-200' : 'bg-muted/30'}`}>
      <Avatar className="h-6 w-6">
        <AvatarImage src={profile?.avatar ?? undefined} />
        <AvatarFallback className="text-[10px]">{profile?.username?.slice(0,2).toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>
      <span className={`text-sm truncate ${isWinner ? 'font-semibold text-green-700' : ''}`}>
        {profile?.username ?? 'TBD'}
      </span>
      {isCompleted && isWinner && <Trophy className="h-3.5 w-3.5 text-brand-600 ml-auto shrink-0" />}
    </div>
  )
}

function OrganizerDisputesList({ matches }: { matches: any[] }) {
  const queryClient = useQueryClient()
  const completedMatches = matches.filter((m) => m.match_status === 'completed')

  if (!completedMatches.length) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="No match disputes"
        description="All results are currently verified by the community."
      />
    )
  }

  return (
    <div className="space-y-4">
      {completedMatches.map((m) => (
        <OrganizerDisputeCard key={m.id} match={m} />
      ))}
    </div>
  )
}

function OrganizerDisputeCard({ match }: { match: any }) {
  const queryClient = useQueryClient()

  // Load dispute state
  const { data: dispute, refetch: refetchDispute } = useQuery({
    queryKey: ['dispute', match.id],
    queryFn: () => governanceService.getDisputeByMatchId(match.id),
  })

  // Load votes
  const { data: votes = [], refetch: refetchVotes } = useQuery({
    queryKey: ['votes', dispute?.id],
    queryFn: () => governanceService.getDisputeVotes(dispute!.id),
    enabled: !!dispute?.id,
  })

  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ status, overrideWinnerId }: { status: 'resolved' | 'dismissed'; overrideWinnerId?: string }) => {
      if (!dispute) return
      
      // Update dispute status
      await governanceService.resolveDispute(dispute.id, status)
      
      // Overturn match score in tournament service if necessary
      if (status === 'resolved' && overrideWinnerId) {
        await tournamentService.setMatchWinner(match.id, overrideWinnerId)
      }
    },
    onSuccess: () => {
      toast({ title: 'Dispute status updated successfully' })
      refetchDispute()
      queryClient.invalidateQueries({ queryKey: ['matches'] })
    },
    onError: (err) => toast({ title: 'Operation failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const p1 = match.player_one_profile
  const p2 = match.player_two_profile
  const winner = match.winner_profile

  if (!dispute) return null

  // Calculate vote splits
  const p1Votes = votes.filter((v) => v.vote_for === p1?.id).length
  const p2Votes = votes.filter((v) => v.vote_for === p2?.id).length
  const totalVotes = votes.length

  const p1Percent = totalVotes > 0 ? (p1Votes / totalVotes) * 100 : 0
  const p2Percent = totalVotes > 0 ? (p2Votes / totalVotes) * 100 : 0

  return (
    <Card className="border border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>Match Dispute: {p1?.username} vs {p2?.username}</span>
          <Badge variant="destructive" className="capitalize">{dispute.status}</Badge>
        </CardTitle>
        <CardDescription>
          Organizer original declared winner: <span className="font-bold">{winner?.username}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="p-3 bg-card border rounded space-y-1">
          <span className="font-bold text-destructive">Reason submitted by player:</span>
          <p>{dispute.reason}</p>
        </div>

        {/* Voting Metrics */}
        <div className="space-y-2">
          <span className="font-bold text-sm text-foreground flex items-center gap-1">
            <Trophy className="h-4 w-4 text-brand-600" />
            Participant Voting Consensus
          </span>
          <div className="p-3 bg-card border rounded space-y-2">
            <div className="flex justify-between font-semibold">
              <span>{p1?.username}: {p1Votes} votes ({p1Percent.toFixed(0)}%)</span>
              <span>{p2?.username}: {p2Votes} votes ({p2Percent.toFixed(0)}%)</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-brand" style={{ width: `${p1Percent}%` }} />
              <div className="h-full bg-orange-500" style={{ width: `${p2Percent}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground block">{totalVotes} signatures verify this poll.</span>
          </div>
        </div>

        {/* Actions to resolve dispute */}
        {dispute.status === 'open' && (
          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              loading={resolveDisputeMutation.isPending}
              onClick={() => resolveDisputeMutation.mutate({ status: 'dismissed' })}
            >
              Dismiss Dispute
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={resolveDisputeMutation.isPending}
              disabled={p1Votes === p2Votes}
              onClick={() => {
                const communityWinnerId = p1Votes > p2Votes ? p1.id : p2.id
                resolveDisputeMutation.mutate({ status: 'resolved', overrideWinnerId: communityWinnerId })
              }}
            >
              Overturn to Consensus Winner ({p1Votes > p2Votes ? p1?.username : p2?.username})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
