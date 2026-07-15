import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Trophy, Users, CheckCircle, XCircle,
  Send, Plus, Shield, Ban, RefreshCw, AlertTriangle, Crown
} from 'lucide-react'
import { getAvatarUrl } from '@/lib/utils'
import { tournamentService } from '@/services/tournament.service'
import { transactionService } from '@/services/transaction.service'
import { governanceService, Dispute, Vote } from '@/services/governance.service'
import { solanaService } from '@/services/solana.service'
import { USDC_MINT } from '@/constants'
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
  const [payoutSource, setPayoutSource] = useState<'vault' | 'direct'>('vault')
  const [vaultBalance, setVaultBalance] = useState<number | null>(null)
  const [isLoadingVaultBalance, setIsLoadingVaultBalance] = useState(false)

  const [newMatchRound, setNewMatchRound] = useState('1')
  const [newMatchP1, setNewMatchP1] = useState('')
  const [newMatchP2, setNewMatchP2] = useState('')

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentService.getTournamentById(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (prizeDialogOpen && tournament?.vault_address) {
      setIsLoadingVaultBalance(true)
      solanaService.getBalance(tournament.vault_address)
        .then((bal) => {
          setVaultBalance(bal)
          if (bal < Number(prizeAmount || 0.0001)) {
            setPayoutSource('direct')
          } else {
            setPayoutSource('vault')
          }
        })
        .catch((err) => {
          setVaultBalance(0)
          setPayoutSource('direct')
        })
        .finally(() => {
          setIsLoadingVaultBalance(false)
        })
    } else {
      setVaultBalance(null)
      setPayoutSource('direct')
    }
  }, [prizeDialogOpen, tournament?.vault_address])

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
    mutationFn: async ({ participant, status }: { participant: Participant; status: 'verified' | 'failed' }) => {
      if (status === 'verified') {
        // If the tournament has a fee, we must verify the transaction on-chain
        if (tournament && tournament.entry_fee > 0) {
          if (!participant.transaction_signature) {
            throw new Error('No transaction signature submitted by player.')
          }

          const paymentDest = tournament.vault_address || tournament.organizer_wallet
          if (!paymentDest) {
            throw new Error('Tournament has no payment destination (organizer wallet or escrow vault) configured.')
          }

          const verified = await solanaService.verifyTransaction(
            participant.transaction_signature,
            paymentDest,
            tournament.entry_fee,
            tournament.token_type === 'USDC' ? USDC_MINT : undefined
          )

          if (!verified || !verified.confirmed) {
            throw new Error('On-chain transaction verification failed. The transfer could not be found or amount/destination did not match.')
          }
        }
      }
      return tournamentService.verifyParticipantPayment(participant.id, status)
    },
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
      source,
    }: {
      participant: Participant
      amount: number
      description: string
      source: 'vault' | 'direct'
    }) => {
      if (!participant.player?.wallet_address) throw new Error('Player has no wallet connected')
      
      let sig: string
      if (tournament?.vault_address && source === 'vault') {
        // Decentralized Vault Payout
        sig = await payoutTournament(id!, participant.player.wallet_address, amount, tournament.token_type)
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
        title: `${description}: ${tournament!.title}`,
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

  // Update tournament status mutation (e.g. active, completed)
  const updateStatusMutation = useMutation({
    mutationFn: (status: Tournament['tournament_status']) =>
      tournamentService.updateTournament(id!, { tournament_status: status }),
    onSuccess: () => {
      toast({ title: 'Tournament status updated' })
      queryClient.invalidateQueries({ queryKey: ['tournament', id] })
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  // Helper to compute active players for any round
  const getActivePlayersForRound = (R: number): string[] => {
    if (!verifiedPlayers.length) return []
    if (R === 1) {
      return verifiedPlayers.map((p) => p.player_id)
    }

    const prevActive = getActivePlayersForRound(R - 1)
    const prevMatches = matches?.filter((m) => m.round === R - 1) ?? []
    const prevWinners = prevMatches.map((m) => m.winner).filter(Boolean) as string[]

    const prevMatchedPlayers = new Set(
      prevMatches.flatMap((m) => [m.player_one, m.player_two])
    )
    const prevByes = prevActive.filter((pId) => !prevMatchedPlayers.has(pId))

    return [...prevWinners, ...prevByes]
  }

  // Generate matches for the next round mutation
  const generateRoundMutation = useMutation({
    mutationFn: async () => {
      if (!verifiedPlayers.length) throw new Error('No verified players to match.')

      const R = matches && matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0

      let activePlayerIds: string[] = []
      if (R === 0) {
        // Round 1
        activePlayerIds = verifiedPlayers.map((p) => p.player_id)
        // Shuffle players for fair pairings
        activePlayerIds = [...activePlayerIds].sort(() => Math.random() - 0.5)
      } else {
        // Verify all matches in round R are completed
        const roundMatches = matches!.filter((m) => m.round === R)
        const pending = roundMatches.filter((m) => m.match_status !== 'completed')
        if (pending.length > 0) {
          throw new Error(`Please complete all matches of Round ${R} first.`)
        }

        // Get active players for round R + 1
        activePlayerIds = getActivePlayersForRound(R + 1)
      }

      if (activePlayerIds.length <= 1) {
        throw new Error('Tournament has already reached its final winner.')
      }

      // Create pairings
      const nextRound = R + 1
      const matchPromises = []

      for (let i = 0; i < activePlayerIds.length; i += 2) {
        if (i + 1 < activePlayerIds.length) {
          matchPromises.push(
            tournamentService.createMatch({
              tournament_id: id!,
              round: nextRound,
              player_one: activePlayerIds[i],
              player_two: activePlayerIds[i + 1],
              winner: null,
              match_status: 'pending',
              scheduled_at: null,
            })
          )
        }
      }

      await Promise.all(matchPromises)
      return nextRound
    },
    onSuccess: (round) => {
      toast({ title: `Round ${round} matches generated!` })
      queryClient.invalidateQueries({ queryKey: ['matches', id] })
    },
    onError: (err) => {
      toast({
        title: 'Failed to generate round',
        description: (err as Error).message,
        variant: 'destructive',
      })
    },
  })

  // Get active players of the highest round
  const nextActivePlayers = useMemo(() => {
    if (!verifiedPlayers.length) return []
    const R = matches && matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0
    if (R === 0) return verifiedPlayers.map((p) => p.player_id)
    
    // Check if the current round matches are completed
    const roundMatches = matches!.filter((m) => m.round === R)
    const isRoundCompleted = roundMatches.every((m) => m.match_status === 'completed')

    if (isRoundCompleted) {
      return getActivePlayersForRound(R + 1)
    } else {
      return getActivePlayersForRound(R)
    }
  }, [matches, verifiedPlayers])

  // Map player ID to team name if in team mode
  const teamNamesMap = useMemo(() => {
    const mapping: Record<string, string> = {}
    if (tournament?.mode === 'team' && participants) {
      participants.forEach((p) => {
        if (p.team_id && p.team) {
          mapping[p.player_id] = p.team.name
        }
      })
    }
    return mapping
  }, [tournament, participants])

  // Get tournament winner if finals are completed
  const tournamentWinnerParticipant = useMemo(() => {
    const R = matches && matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0
    if (R === 0) return null
    const roundMatches = matches!.filter((m) => m.round === R)
    const isRoundCompleted = roundMatches.every((m) => m.match_status === 'completed')

    if (isRoundCompleted && nextActivePlayers.length === 1) {
      return verifiedPlayers.find((p) => p.player_id === nextActivePlayers[0]) ?? null
    }
    return null
  }, [matches, nextActivePlayers, verifiedPlayers])

  const tournamentWinner = tournamentWinnerParticipant?.player ?? null

  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped: Record<number, Match[]> = {}
    matches?.forEach((m) => {
      if (!grouped[m.round]) grouped[m.round] = []
      grouped[m.round].push(m)
    })
    return grouped
  }, [matches])

  // Get placements (1st, 2nd, 3rd) based on single-elimination knockout results
  const playerPlacements = useMemo(() => {
    const placements: Record<string, { rank: number; label: string; badge: string }> = {}
    if (!matches || matches.length === 0) return placements

    const R_max = Math.max(...matches.map((m) => m.round))
    const finalMatches = matches.filter((m) => m.round === R_max)

    if (finalMatches.length === 1 && finalMatches[0].match_status === 'completed') {
      const finalMatch = finalMatches[0]
      const firstPlace = finalMatch.winner
      const secondPlace = finalMatch.winner === finalMatch.player_one ? finalMatch.player_two : finalMatch.player_one

      if (firstPlace) {
        placements[firstPlace] = { rank: 1, label: '1st Place Winner', badge: 'Champion' }
      }
      if (secondPlace) {
        placements[secondPlace] = { rank: 2, label: '2nd Place Runner-Up', badge: '2nd Place' }
      }

      if (R_max > 1) {
        const semifinalMatches = matches.filter((m) => m.round === R_max - 1)
        semifinalMatches.forEach((m) => {
          if (m.match_status === 'completed') {
            const loser = m.winner === m.player_one ? m.player_two : m.player_one
            if (loser) {
              placements[loser] = { rank: 3, label: '3rd Place Winner', badge: '3rd Place' }
            }
          }
        })
      }
    }

    return placements
  }, [matches])

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
          {tournament.tournament_status === 'registration' && (
            <Button
              size="sm"
              disabled={verifiedPlayers.length < 2 || updateStatusMutation.isPending}
              loading={updateStatusMutation.isPending}
              onClick={() => updateStatusMutation.mutate('active')}
              className="bg-brand text-white hover:bg-brand/90 gap-1.5"
            >
              <Trophy className="h-4 w-4" /> Start Tournament
            </Button>
          )}
          {tournament.tournament_status === 'active' && tournamentWinner && (
            <Button
              size="sm"
              loading={updateStatusMutation.isPending}
              onClick={() => updateStatusMutation.mutate('completed')}
              className="bg-green-600 text-white hover:bg-green-700 gap-1.5"
            >
              <CheckCircle className="h-4 w-4" /> Complete Tournament
            </Button>
          )}
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Players', value: `${tournament.current_players}/${tournament.max_players}` },
          { label: 'Verified', value: String(verifiedPlayers.length) },
          { label: 'Entry Fee', value: formatSOL(tournament.entry_fee, 4, tournament.token_type) },
          { label: 'Prize Pool', value: formatSOL(tournament.prize_pool, 2, tournament.token_type) },
          { label: 'Collected Fees', value: formatSOL(tournament.collected_fees || 0, 2, tournament.token_type) },
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
                        <AvatarImage src={getAvatarUrl(p.player?.avatar, p.player?.username || '')} />
                        <AvatarFallback className="text-xs">{p.player?.username?.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{p.team_id ? p.team?.name : p.player?.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.team_id ? `Captain: ${p.player?.username} · ` : ''}Joined {formatRelative(p.joined_at)}
                        </p>
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
                              onClick={() => verifyPaymentMutation.mutate({ participant: p, status: 'verified' })}
                              title="Verify payment"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive/80"
                              onClick={() => verifyPaymentMutation.mutate({ participant: p, status: 'failed' })}
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
        <TabsContent value="matches" className="mt-4 space-y-4">
          {/* Bracket Actions & Status Banner */}
          <Card className="border border-brand/10 bg-brand/5">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-brand" />
                  Bracket Management
                </h4>
                <p className="text-xs text-muted-foreground">
                  {tournament.tournament_status !== 'active'
                    ? 'Matches can only be generated when the tournament is active (Start Tournament above).'
                    : tournamentWinner
                    ? `🏆 Tournament complete! Champion is ${tournamentWinnerParticipant?.team_id ? tournamentWinnerParticipant?.team?.name : tournamentWinner.username}.`
                    : matches && matches.length > 0
                    ? `Round ${Math.max(...matches.map(m => m.round))} matches are in progress.`
                    : 'Pair verified players into the opening matches of Round 1.'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {tournament.tournament_status === 'active' && !tournamentWinner && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    loading={generateRoundMutation.isPending}
                    onClick={() => generateRoundMutation.mutate()}
                  >
                    <Plus className="h-4 w-4" />
                    {matches && matches.length > 0 ? 'Generate Next Round' : 'Generate Round 1 Bracket'}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMatchDialogOpen(true)} disabled={verifiedPlayers.length < 2}>
                  <Plus className="h-4 w-4" /> Add Match Manually
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tournament Winner Announcement */}
          {tournamentWinner && (
            <div className="p-4 rounded-xl border border-green-200 bg-green-50/50 flex flex-col items-center justify-center text-center space-y-2">
              <Trophy className="h-10 w-10 text-yellow-500 animate-bounce" />
              <div>
                <h3 className="font-bold text-lg text-green-900">Tournament Complete!</h3>
                <p className="text-sm text-green-700">
                  Winner: <span className="font-bold text-green-900">{tournamentWinnerParticipant?.team_id ? tournamentWinnerParticipant?.team?.name : tournamentWinner.username}</span>
                </p>
              </div>
              {tournament.tournament_status === 'active' && (
                <Button
                  size="sm"
                  onClick={() => updateStatusMutation.mutate('completed')}
                  className="bg-green-600 hover:bg-green-700 text-white mt-1"
                >
                  Mark Tournament Completed
                </Button>
              )}
            </div>
          )}

          {!matches?.length ? (
            <EmptyState
              icon={<Trophy className="h-8 w-8" />}
              title="No matches generated yet"
              description="Start the tournament and generate the bracket pairings to play matches."
            />
          ) : (
            <div className="space-y-6">
              {Object.keys(matchesByRound).sort((a,b) => Number(a) - Number(b)).map((roundStr) => {
                const roundNum = Number(roundStr)
                const roundMatches = matchesByRound[roundNum]
                return (
                  <div key={roundNum} className="space-y-2">
                    <div className="flex items-center gap-2 border-b pb-1.5">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 px-1">
                        <Trophy className="h-4 w-4 text-brand" />
                        Round {roundNum}
                      </h3>
                      <span className="text-xs text-muted-foreground">({roundMatches.length} matches)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {roundMatches.map((match) => (
                        <MatchRow
                          key={match.id}
                          match={match}
                          teamNamesMap={teamNamesMap}
                          onSetWinner={(winnerId) => setWinnerMutation.mutate({ matchId: match.id, winnerId })}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
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
                        <AvatarImage src={getAvatarUrl(p.player?.avatar, p.player?.username || '')} />
                        <AvatarFallback className="text-xs">{p.player?.username?.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{p.team_id ? p.team?.name : p.player?.username}</p>
                          {playerPlacements[p.player_id] && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 border
                                ${playerPlacements[p.player_id].rank === 1
                                  ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                                  : playerPlacements[p.player_id].rank === 2
                                  ? 'bg-slate-50 text-slate-800 border-slate-200'
                                  : 'bg-amber-50/50 text-amber-800 border-amber-100'
                                }`}
                            >
                              {playerPlacements[p.player_id].rank === 1 && (
                                <Crown className="h-3 w-3 text-yellow-500 fill-yellow-400 mr-0.5" />
                              )}
                              {playerPlacements[p.player_id].badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.team_id ? `Captain: ${p.player?.username} · ` : ''}{p.player?.wallet_address ? `Wallet: ${p.player.wallet_address.slice(0,12)}...` : 'No wallet connected'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!p.player?.wallet_address}
                        onClick={() => {
                          setPrizeTarget(p)
                          setPrizeAmount(String(remainingPrizePool))
                          const placement = playerPlacements[p.player_id]
                          if (placement) {
                            setPrizeDescription(placement.label)
                          } else {
                            setPrizeDescription('1st Place Winner')
                          }
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
            <DialogTitle>Send Prize to {prizeTarget?.team_id ? prizeTarget.team?.name : prizeTarget?.player?.username}</DialogTitle>
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

            {tournament.vault_address && (
              <div className="space-y-2">
                <Label>Payout Method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutSource('vault')}
                    disabled={vaultBalance !== null && vaultBalance < Number(prizeAmount)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-sm font-medium transition-colors gap-1
                      ${payoutSource === 'vault'
                        ? 'border-brand bg-brand/5 text-brand-700'
                        : 'border-input hover:border-muted-foreground/40'
                      } ${vaultBalance !== null && vaultBalance < Number(prizeAmount) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Shield className="h-4 w-4" />
                    <span>Smart Escrow</span>
                    <span className="text-[10px] text-muted-foreground">
                      {isLoadingVaultBalance ? 'Loading...' : `Vault Bal: ${vaultBalance !== null ? formatSOL(vaultBalance, 2, tournament.token_type) : '0'}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutSource('direct')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-sm font-medium transition-colors gap-1
                      ${payoutSource === 'direct'
                        ? 'border-brand bg-brand/5 text-brand-700'
                        : 'border-input hover:border-muted-foreground/40'
                      }`}
                  >
                    <Send className="h-4 w-4" />
                    <span>Direct Wallet</span>
                    <span className="text-[10px] text-muted-foreground">Pays from your wallet</span>
                  </button>
                </div>

                {vaultBalance !== null && vaultBalance < Number(prizeAmount) && (
                  <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                    ⚠️ Escrow vault has insufficient balance ({formatSOL(vaultBalance, 2, tournament.token_type)}). Must pay directly from your wallet.
                  </p>
                )}
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
              {tournament.vault_address && payoutSource === 'vault'
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
                  source: payoutSource,
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
                    <SelectItem key={p.player_id} value={p.player_id}>
                      {p.team_id ? `${p.team?.name} (Capt. ${p.player?.username})` : p.player?.username}
                    </SelectItem>
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
                    <SelectItem key={p.player_id} value={p.player_id}>
                      {p.team_id ? `${p.team?.name} (Capt. ${p.player?.username})` : p.player?.username}
                    </SelectItem>
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

function MatchRow({ match, teamNamesMap, onSetWinner }: { match: Match; teamNamesMap: Record<string, string>; onSetWinner: (id: string) => void }) {
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
            teamName={teamNamesMap[match.player_one]}
            isWinner={match.winner === match.player_one}
            isCompleted={match.match_status === 'completed'}
          />
          <span className="text-muted-foreground text-xs font-medium">vs</span>
          <PlayerSlot
            profile={match.player_two_profile}
            teamName={teamNamesMap[match.player_two]}
            isWinner={match.winner === match.player_two}
            isCompleted={match.match_status === 'completed'}
          />
        </div>
        {match.match_status !== 'completed' && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs font-semibold"
              onClick={() => onSetWinner(match.player_one)}
            >
              {teamNamesMap[match.player_one] || match.player_one_profile?.username || 'P1'} wins
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs font-semibold"
              onClick={() => onSetWinner(match.player_two)}
            >
              {teamNamesMap[match.player_two] || match.player_two_profile?.username || 'P2'} wins
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlayerSlot({
  profile,
  teamName,
  isWinner,
  isCompleted,
}: {
  profile?: { username: string; avatar?: string | null } | null
  teamName?: string
  isWinner: boolean
  isCompleted: boolean
}) {
  return (
    <div className={`flex items-center gap-2 flex-1 p-2 rounded-lg ${isCompleted && isWinner ? 'bg-green-50 border border-green-200' : 'bg-muted/30'}`}>
      <Avatar className="h-6 w-6">
        <AvatarImage src={getAvatarUrl(profile?.avatar, profile?.username ?? 'TBD')} />
        <AvatarFallback className="text-[10px]">{profile?.username?.slice(0,2).toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>
      <span className={`text-sm truncate ${isWinner ? 'font-semibold text-green-700' : ''}`}>
        {teamName || profile?.username || 'TBD'}
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
