import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trophy, Users, Calendar, Wallet, ExternalLink,
  CheckCircle2, Clock, Copy, ArrowLeft,
  Shield, AlertTriangle, Vote as VoteIcon, RefreshCw
} from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { transactionService } from '@/services/transaction.service'
import { solanaService } from '@/services/solana.service'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { governanceService, Dispute, Vote } from '@/services/governance.service'
import { toast } from '@/hooks/use-toast'
import { TournamentStatusBadge, PaymentStatusBadge } from '@/components/shared/tournament-status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { formatSOL, formatDateTime } from '@/utils/format'
import { truncateAddress, getSolanaExplorerUrl, getAvatarUrl } from '@/lib/utils'
import { BracketView } from './bracket-view'
import { USDC_MINT } from '@/constants'

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthContext()
  const { connected, sendPayment, wallet } = useSolanaWallet()
  const queryClient = useQueryClient()

  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [payStep, setPayStep] = useState<'info' | 'paying' | 'signature' | 'verifying' | 'done'>('info')
  const [txSignature, setTxSignature] = useState('')
  const [manualSignature, setManualSignature] = useState('')

  // Dispute state
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false)
  const [disputeMatchId, setDisputeMatchId] = useState('')
  const [disputeReason, setDisputeReason] = useState('')

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentService.getTournamentById(id!),
    enabled: !!id,
  })

  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ['participants', id],
    queryFn: () => tournamentService.getParticipants(id!),
    enabled: !!id,
  })

  const { data: participation } = useQuery({
    queryKey: ['participation', id, profile?.id],
    queryFn: () => tournamentService.getPlayerParticipation(id!, profile!.id),
    enabled: !!id && !!profile?.id,
  })

  const { data: matches } = useQuery({
    queryKey: ['matches', id],
    queryFn: () => tournamentService.getMatches(id!),
    enabled: !!id,
  })

  // Join mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !id) throw new Error('Not authenticated')
      return tournamentService.joinTournament(id, profile.id, tournament!.entry_fee === 0 ? 'verified' : 'pending')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participation', id, profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['participants', id] })
      queryClient.invalidateQueries({ queryKey: ['tournament', id] })
      setPayStep(tournament!.entry_fee > 0 ? 'paying' : 'done')
    },
    onError: (err) => {
      toast({ title: 'Failed to join', description: (err as Error).message, variant: 'destructive' })
    },
  })

  // Pay with wallet
  const handlePayWithWallet = async () => {
    const paymentDest = tournament?.vault_address || tournament?.organizer_wallet
    if (!paymentDest) {
      toast({ title: 'No payment destination configured', variant: 'destructive' })
      return
    }
    setPayStep('paying')
    try {
      const sig = await sendPayment(paymentDest, tournament.entry_fee, tournament.token_type)
      setTxSignature(sig)
      await handleSubmitSignature(sig)
    } catch (err) {
      toast({ title: 'Payment failed', description: (err as Error).message, variant: 'destructive' })
      setPayStep('info')
    }
  }

  const handleSubmitSignature = async (sig: string) => {
    if (!participation && !joinMutation.data) return
    const p = participation ?? joinMutation.data!
    setPayStep('verifying')
    try {
      // Verify on-chain (using USDC mint address if token is USDC)
      const paymentDest = tournament!.vault_address || tournament!.organizer_wallet!
      const verified = await solanaService.verifyTransaction(
        sig,
        paymentDest,
        tournament!.entry_fee,
        tournament!.token_type === 'USDC' ? USDC_MINT : undefined
      )

      const status = verified?.confirmed ? 'verified' : 'pending'

      // Submit to backend
      await tournamentService.submitPayment(p.id, sig)
      if (status === 'verified') {
        await tournamentService.verifyParticipantPayment(p.id, 'verified')
      }

      // Record transaction
      if (profile) {
        await transactionService.createTransaction({
          user_id: profile.id,
          type: 'entry_fee',
          amount: tournament!.entry_fee,
          signature: sig,
          status: status === 'verified' ? 'confirmed' : 'pending',
          tournament_id: tournament!.id,
          description: `Entry fee for ${tournament!.title} (${tournament!.token_type})`,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['participation', id, profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['participants', id] })
      setPayStep('done')
      toast({
        title: status === 'verified' ? 'Payment verified!' : 'Payment submitted',
        description: status === 'verified'
          ? `Your entry has been confirmed on Solana (${tournament!.token_type}).`
          : 'Your payment is pending verification.',
      })
    } catch (err) {
      toast({ title: 'Verification failed', description: (err as Error).message, variant: 'destructive' })
      setPayStep('signature')
    }
  }

  // Dispute creation
  const createDisputeMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not authenticated')
      return governanceService.createDispute(disputeMatchId, id!, profile.id, disputeReason)
    },
    onSuccess: () => {
      toast({ title: 'Dispute raised!', description: 'Match score is now locked for community review.' })
      queryClient.invalidateQueries({ queryKey: ['matches', id] })
      setDisputeDialogOpen(false)
      setDisputeReason('')
    },
    onError: (err) => {
      toast({ title: 'Dispute failed', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }

  if (isLoading) return <TournamentDetailSkeleton />
  if (!tournament) return (
    <EmptyState icon={<Trophy className="h-12 w-12" />} title="Tournament not found" action={
      <Button onClick={() => navigate('/tournaments')}>Back to Tournaments</Button>
    } />
  )

  const isRegistered = !!participation
  const isFull = tournament.current_players >= tournament.max_players
  const slots = tournament.max_players - tournament.current_players

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      {/* Banner */}
      <div className="h-48 sm:h-64 rounded-xl bg-gradient-to-br from-muted to-muted/40 overflow-hidden relative">
        {tournament.banner ? (
          <img src={tournament.banner} alt={tournament.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Trophy className="h-16 w-16 text-muted-foreground/20" />
          </div>
        )}
        <div className="absolute bottom-4 left-4">
          <TournamentStatusBadge status={tournament.tournament_status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{tournament.title}</h1>
            <p className="text-muted-foreground mt-1">{tournament.game}</p>
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="players">Players ({participants?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="bracket">Bracket</TabsTrigger>
              <TabsTrigger value="governance">Governance &amp; Disputes</TabsTrigger>
              {tournament.rules && <TabsTrigger value="rules">Rules</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              {tournament.description && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">{tournament.description}</p>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InfoTile icon={<Trophy className="h-4 w-4" />} label="Prize Pool" value={formatSOL(tournament.prize_pool, 2, tournament.token_type)} highlight />
                <InfoTile icon={<Wallet className="h-4 w-4" />} label="Entry Fee" value={tournament.entry_fee === 0 ? 'Free' : formatSOL(tournament.entry_fee, 4, tournament.token_type)} />
                <InfoTile icon={<Users className="h-4 w-4" />} label="Players" value={`${tournament.current_players}/${tournament.max_players}`} />
                <InfoTile icon={<Calendar className="h-4 w-4" />} label="Slots Left" value={slots > 0 ? String(slots) : 'Full'} />
              </div>
              
              {/* Escrow Contract Address Tag */}
              {tournament.vault_address && (
                <Card className="border border-brand-100 bg-brand-50/20">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-brand" />
                      <div>
                        <p className="text-xs font-semibold text-brand">Escrow Vault Active (On-Chain)</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px] sm:max-w-md">
                          {tournament.vault_address}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-brand" onClick={() => copyToClipboard(tournament.vault_address!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {tournament.start_date && (
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Start Date</p>
                      <p className="text-sm font-medium">{formatDateTime(tournament.start_date)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {tournament.organizer && (
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={getAvatarUrl(tournament.organizer.avatar, tournament.organizer.username)} />
                      <AvatarFallback className="text-xs font-bold bg-brand/20 text-brand-700">
                        {tournament.organizer.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs text-muted-foreground">Organized by</p>
                      <p className="text-sm font-medium">{tournament.organizer.username}</p>
                    </div>
                    <Badge variant="brand" className="ml-auto text-xs">Organizer</Badge>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="players" className="mt-4">
              {participantsLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
                </div>
              ) : !participants?.length ? (
                <EmptyState icon={<Users className="h-8 w-8" />} title="No players yet" description="Be the first to register!" />
              ) : (
                <div className="space-y-2">
                  {participants.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <span className="text-sm text-muted-foreground w-5 text-center font-mono">{i + 1}</span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={getAvatarUrl(p.player?.avatar, p.player?.username || '')} />
                        <AvatarFallback className="text-xs bg-muted">
                          {p.player?.username?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium">{p.player?.username}</span>
                      <PaymentStatusBadge status={p.payment_status} />
                      {p.transaction_signature && (
                        <a href={getSolanaExplorerUrl(p.transaction_signature)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bracket" className="mt-4">
              <BracketView matches={matches ?? []} />
            </TabsContent>

            <TabsContent value="governance" className="mt-4">
              <GovernanceMatchesList
                matches={matches ?? []}
                tournamentId={id!}
                isRegistered={isRegistered}
                profileId={profile?.id}
                wallet={wallet}
                onDisputeTriggered={(matchId) => {
                  setDisputeMatchId(matchId)
                  setDisputeDialogOpen(true)
                }}
              />
            </TabsContent>

            {tournament.rules && (
              <TabsContent value="rules" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    <pre className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans">
                      {tournament.rules}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Right: Action panel */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Join Tournament</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Payment status if registered */}
              {isRegistered && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Your Status</span>
                    <PaymentStatusBadge status={participation.payment_status} />
                  </div>
                  {participation.transaction_signature && (
                    <div className="flex flex-col gap-2">
                      <a
                        href={getSolanaExplorerUrl(participation.transaction_signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View on Explorer
                      </a>
                      {participation.payment_status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs py-1 h-7 gap-1 mt-1"
                          onClick={() => {
                            setJoinDialogOpen(true)
                            handleSubmitSignature(participation.transaction_signature)
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Re-verify Payment
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Fee</span>
                  <span className="font-semibold">{tournament.entry_fee === 0 ? 'Free' : formatSOL(tournament.entry_fee, 4, tournament.token_type)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prize Pool</span>
                  <span className="font-semibold text-brand-700">{formatSOL(tournament.prize_pool, 2, tournament.token_type)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slots</span>
                  <span className="font-semibold">{slots > 0 ? `${slots} remaining` : 'Full'}</span>
                </div>
              </div>

              <Separator />

              {!connected ? (
                <div className="text-center space-y-2">
                  <p className="text-xs text-muted-foreground">Connect wallet to join</p>
                  <Shield className="h-5 w-5 text-muted-foreground mx-auto" />
                </div>
              ) : isRegistered ? (
                <div className="space-y-3 w-full">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    You&apos;re registered
                  </div>
                  {participation.payment_status !== 'verified' && (
                    <Button
                      className="w-full text-xs py-1.5 h-8 mt-1"
                      onClick={() => {
                        setJoinDialogOpen(true)
                        setPayStep('paying')
                      }}
                    >
                      {participation.transaction_signature ? 'Retry Payment' : 'Pay Entry Fee'}
                    </Button>
                  )}
                </div>
              ) : tournament.tournament_status !== 'registration' ? (
                <p className="text-sm text-muted-foreground text-center">Registration is closed</p>
              ) : isFull ? (
                <p className="text-sm text-muted-foreground text-center">Tournament is full</p>
              ) : (
                <Button className="w-full" onClick={() => setJoinDialogOpen(true)}>
                  Join Tournament
                </Button>
              )}

              {/* Escrow vault/wallet address */}
              {tournament.vault_address && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-1">Escrow Vault Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                      {truncateAddress(tournament.vault_address, 6)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(tournament.vault_address!)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Join / Payment Dialog */}
      <Dialog open={joinDialogOpen} onOpenChange={(v) => { setJoinDialogOpen(v); if (!v) { setPayStep('info'); setManualSignature('') } }}>
        <DialogContent className="max-w-md">
          {payStep === 'info' && (
            <>
              <DialogHeader>
                <DialogTitle>Join {tournament.title}</DialogTitle>
                <DialogDescription>Review the details before joining</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Entry Fee</span><span className="font-semibold">{formatSOL(tournament.entry_fee, 4, tournament.token_type)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Prize Pool</span><span className="font-semibold text-brand-700">{formatSOL(tournament.prize_pool, 2, tournament.token_type)}</span></div>
                  {tournament.vault_address && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Held in Escrow PDA</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono">{truncateAddress(tournament.vault_address)}</code>
                        <button onClick={() => copyToClipboard(tournament.vault_address!)}><Copy className="h-3 w-3 text-muted-foreground" /></button>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Jupiter Swap Integration prompt */}
                {tournament.entry_fee > 0 && (
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-100 flex flex-col gap-1 text-xs text-yellow-800">
                    <span className="font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                      Token Swap Available
                    </span>
                    <span>
                      Don&apos;t have enough {tournament.token_type}? Swap your other tokens on our{' '}
                      <a href="/swap" className="font-bold underline hover:text-yellow-950">
                        Token Swap Page
                      </a>{' '}
                      using Jupiter Aggregator instantly.
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">Your entry fee will be held in a decentralized Solana escrow vault and will only be distributed to verified winners.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>Cancel</Button>
                <Button loading={joinMutation.isPending} onClick={() => joinMutation.mutate()}>
                  {tournament.entry_fee === 0 ? 'Join Free' : 'Proceed to Payment'}
                </Button>
              </DialogFooter>
            </>
          )}

          {payStep === 'paying' && (
            <>
              <DialogHeader>
                <DialogTitle>Pay Entry Fee</DialogTitle>
                <DialogDescription>Send exactly {formatSOL(tournament.entry_fee, 4, tournament.token_type)} to the Escrow PDA</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg border space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Escrow Contract Account</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono flex-1 bg-muted px-2 py-1.5 rounded break-all">
                      {tournament.vault_address || tournament.organizer_wallet}
                    </code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(tournament.vault_address || tournament.organizer_wallet!)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-center font-semibold">Amount: {formatSOL(tournament.entry_fee, 4, tournament.token_type)}</p>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button className="w-full" onClick={handlePayWithWallet}>
                  Pay with Phantom
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setPayStep('signature')}>
                  I already paid — enter signature
                </Button>
              </DialogFooter>
            </>
          )}

          {payStep === 'signature' && (
            <>
              <DialogHeader>
                <DialogTitle>Submit Transaction</DialogTitle>
                <DialogDescription>Paste the Solana transaction signature after paying</DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="space-y-1.5">
                  <Label>Transaction Signature</Label>
                  <Input
                    placeholder="Paste your tx signature here..."
                    value={manualSignature}
                    onChange={(e) => setManualSignature(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> How to find my signature?
                </a>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayStep('paying')}>Back</Button>
                <Button disabled={!manualSignature.trim()} onClick={() => handleSubmitSignature(manualSignature.trim())}>
                  Verify Payment
                </Button>
              </DialogFooter>
            </>
          )}

          {payStep === 'verifying' && (
            <div className="py-10 text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-brand border-t-transparent animate-spin" />
              </div>
              <p className="font-semibold">Verifying on Solana...</p>
              <p className="text-sm text-muted-foreground font-mono text-xs">{txSignature ? `${txSignature.slice(0, 32)}...` : ''}</p>
            </div>
          )}

          {payStep === 'done' && (
            <>
              <DialogHeader>
                <DialogTitle>You&apos;re in!</DialogTitle>
              </DialogHeader>
              <div className="py-4 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {tournament.entry_fee > 0
                    ? `Your payment has been submitted and is verified in the tournament escrow.`
                    : 'You have successfully registered for this tournament.'}
                </p>
                {txSignature && (
                  <a href={getSolanaExplorerUrl(txSignature)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs text-brand-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> View on Solana Explorer
                  </a>
                )}
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => setJoinDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Dispute Match Result
            </DialogTitle>
            <DialogDescription>
              Submit details explaining why this match score is incorrect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Reason for Dispute *</Label>
              <Textarea
                placeholder="E.g., Player A disconnected in round 2 but organizer marked them as the winner. Proof link: twitch.tv/clip..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={createDisputeMutation.isPending}
              disabled={!disputeReason.trim()}
              onClick={() => createDisputeMutation.mutate()}
            >
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoTile({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3 rounded-lg border bg-card space-y-1">
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? 'text-brand-600' : 'text-muted-foreground'}`}>
        {icon}
        {label}
      </div>
      <p className={`text-sm font-bold ${highlight ? 'text-brand-700' : ''}`}>{value}</p>
    </div>
  )
}

function TournamentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}

interface GovernanceMatchesListProps {
  matches: any[]
  tournamentId: string
  isRegistered: boolean
  profileId?: string
  wallet: any
  onDisputeTriggered: (matchId: string) => void
}

function GovernanceMatchesList({
  matches,
  tournamentId,
  isRegistered,
  profileId,
  wallet,
  onDisputeTriggered,
}: GovernanceMatchesListProps) {
  const completedMatches = matches.filter((m) => m.match_status === 'completed')

  if (!completedMatches.length) {
    return (
      <EmptyState
        icon={<VoteIcon className="h-8 w-8" />}
        title="No completed matches yet"
        description="Once matches are completed and scores are entered, they will be listable here for community verification."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/40 rounded-lg border text-sm text-muted-foreground space-y-1.5">
        <span className="font-semibold text-foreground flex items-center gap-1">
          <Shield className="h-4 w-4 text-brand-600" />
          Esports Decentralized Governance
        </span>
        <p className="text-xs">
          If an organizer inputs a fraudulent or incorrect result, players can dispute it.
          All participants can vote on-chain with signature authorization to resolve result accuracy.
        </p>
      </div>

      <div className="space-y-4">
        {completedMatches.map((match) => (
          <GovernanceMatchCard
            key={match.id}
            match={match}
            tournamentId={tournamentId}
            isRegistered={isRegistered}
            profileId={profileId}
            wallet={wallet}
            onDisputeTriggered={onDisputeTriggered}
          />
        ))}
      </div>
    </div>
  )
}

function GovernanceMatchCard({
  match,
  tournamentId,
  isRegistered,
  profileId,
  wallet,
  onDisputeTriggered,
}: {
  match: any
  tournamentId: string
  isRegistered: boolean
  profileId?: string
  wallet: any
  onDisputeTriggered: (matchId: string) => void
}) {
  const queryClient = useQueryClient()
  const [selectedCandidate, setSelectedCandidate] = useState('')

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

  const voteMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !dispute) throw new Error('Not authenticated or no active dispute')
      if (!selectedCandidate) throw new Error('Select a candidate')
      return governanceService.castVote(dispute.id, profileId, selectedCandidate, wallet)
    },
    onSuccess: () => {
      toast({ title: 'Vote recorded!', description: 'Your signature has been registered.' })
      refetchVotes()
    },
    onError: (err) => {
      toast({ title: 'Voting failed', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const p1 = match.player_one_profile
  const p2 = match.player_two_profile
  const winner = match.winner_profile

  // Calculate vote splits
  const p1Votes = votes.filter((v) => v.vote_for === p1?.id).length
  const p2Votes = votes.filter((v) => v.vote_for === p2?.id).length
  const totalVotes = votes.length

  const p1Percent = totalVotes > 0 ? (p1Votes / totalVotes) * 100 : 0
  const p2Percent = totalVotes > 0 ? (p2Votes / totalVotes) * 100 : 0

  const hasVoted = votes.some((v) => v.voter_id === profileId)

  return (
    <Card className="border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>Round {match.round} Match</span>
          {dispute ? (
            <Badge variant="destructive" className="animate-pulse">Disputed ({dispute.status})</Badge>
          ) : (
            <Badge variant="outline" className="text-green-600 bg-green-50/50">Settled</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Organizer set winner: <span className="font-bold text-foreground">{winner?.username || 'Draw'}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Match Players comparison */}
        <div className="flex justify-around items-center py-2 bg-muted/20 rounded-lg">
          <div className="text-center space-y-1">
            <span className="font-medium text-sm">{p1?.username}</span>
            {winner?.id === p1?.id && <Badge variant="secondary" className="block text-[10px] py-0">Declared Winner</Badge>}
          </div>
          <span className="text-xs text-muted-foreground font-bold">VS</span>
          <div className="text-center space-y-1">
            <span className="font-medium text-sm">{p2?.username}</span>
            {winner?.id === p2?.id && <Badge variant="secondary" className="block text-[10px] py-0">Declared Winner</Badge>}
          </div>
        </div>

        {dispute ? (
          <div className="space-y-3 pt-2 border-t text-xs">
            <div className="bg-destructive/5 p-3 rounded border border-destructive/10 text-destructive space-y-1">
              <span className="font-bold block">Dispute Reason:</span>
              <p>{dispute.reason}</p>
              <span className="text-[10px] text-muted-foreground block">Raised by {dispute.creator?.username}</span>
            </div>

            {/* Voting panel */}
            <div className="space-y-2">
              <span className="font-bold text-sm text-foreground flex items-center gap-1">
                <VoteIcon className="h-4 w-4" />
                Community Vote Verification
              </span>
              
              {/* Vote split display */}
              <div className="space-y-1 bg-muted/40 p-3 rounded border">
                <div className="flex justify-between text-[11px] font-semibold mb-1">
                  <span>{p1?.username}: {p1Votes} votes ({p1Percent.toFixed(0)}%)</span>
                  <span>{p2?.username}: {p2Votes} votes ({p2Percent.toFixed(0)}%)</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                  <div className="h-full bg-brand" style={{ width: `${p1Percent}%` }} />
                  <div className="h-full bg-orange-500" style={{ width: `${p2Percent}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground block text-right mt-1">{totalVotes} verified participant signatures</span>
              </div>

              {/* Vote action */}
              {isRegistered && !hasVoted && (
                <div className="space-y-2 pt-1.5">
                  <Label className="text-xs">Who is the rightful winner of this match?</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedCandidate(p1.id); voteMutation.mutate() }}>
                      Vote for {p1?.username}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedCandidate(p2.id); voteMutation.mutate() }}>
                      Vote for {p2?.username}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Note: Voting requires signing a cryptographic message with your connected wallet. This is gasless.
                  </p>
                </div>
              )}

              {hasVoted && (
                <p className="text-[11px] font-medium text-green-600 text-center py-1">
                  ✓ Your cryptographic vote signature has been successfully registered.
                </p>
              )}
            </div>
          </div>
        ) : (
          isRegistered && (
            <div className="flex justify-end pt-1 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                onClick={() => onDisputeTriggered(match.id)}
              >
                <AlertTriangle className="h-3 w-3" /> Dispute Score
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
