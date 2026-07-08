import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trophy, Users, Calendar, Wallet, ExternalLink,
  CheckCircle2, Clock, Copy, ArrowLeft,
  Shield,
} from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { transactionService } from '@/services/transaction.service'
import { solanaService } from '@/services/solana.service'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { toast } from '@/hooks/use-toast'
import { TournamentStatusBadge, PaymentStatusBadge } from '@/components/shared/tournament-status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatSOL, formatDateTime } from '@/utils/format'
import { truncateAddress, getSolanaExplorerUrl } from '@/lib/utils'
import { BracketView } from './bracket-view'

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthContext()
  const { connected, sendPayment } = useSolanaWallet()
  const queryClient = useQueryClient()

  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [payStep, setPayStep] = useState<'info' | 'paying' | 'signature' | 'verifying' | 'done'>('info')
  const [txSignature, setTxSignature] = useState('')
  const [manualSignature, setManualSignature] = useState('')

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
      return tournamentService.joinTournament(id, profile.id)
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
    if (!tournament?.organizer_wallet) {
      toast({ title: 'No organizer wallet configured', variant: 'destructive' })
      return
    }
    setPayStep('paying')
    try {
      const sig = await sendPayment(tournament.organizer_wallet, tournament.entry_fee)
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
      // Verify on-chain
      const verified = await solanaService.verifyTransaction(
        sig,
        tournament!.organizer_wallet!,
        tournament!.entry_fee
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
          description: `Entry fee for ${tournament!.title}`,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['participation', id, profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['participants', id] })
      setPayStep('done')
      toast({
        title: status === 'verified' ? 'Payment verified!' : 'Payment submitted',
        description: status === 'verified'
          ? 'Your entry has been confirmed on Solana.'
          : 'Your payment is pending verification.',
      })
    } catch (err) {
      toast({ title: 'Verification failed', description: (err as Error).message, variant: 'destructive' })
      setPayStep('signature')
    }
  }

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
                <InfoTile icon={<Trophy className="h-4 w-4" />} label="Prize Pool" value={formatSOL(tournament.prize_pool)} highlight />
                <InfoTile icon={<Wallet className="h-4 w-4" />} label="Entry Fee" value={tournament.entry_fee === 0 ? 'Free' : formatSOL(tournament.entry_fee)} />
                <InfoTile icon={<Users className="h-4 w-4" />} label="Players" value={`${tournament.current_players}/${tournament.max_players}`} />
                <InfoTile icon={<Calendar className="h-4 w-4" />} label="Slots Left" value={slots > 0 ? String(slots) : 'Full'} />
              </div>
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
                      <AvatarImage src={tournament.organizer.avatar ?? undefined} />
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
                        <AvatarImage src={p.player?.avatar ?? undefined} />
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
                    <a
                      href={getSolanaExplorerUrl(participation.transaction_signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View on Explorer
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Fee</span>
                  <span className="font-semibold">{tournament.entry_fee === 0 ? 'Free' : formatSOL(tournament.entry_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prize Pool</span>
                  <span className="font-semibold text-brand-700">{formatSOL(tournament.prize_pool)}</span>
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
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  You&apos;re registered
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

              {/* Organizer wallet for reference */}
              {tournament.organizer_wallet && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-1">Organizer Wallet</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                      {truncateAddress(tournament.organizer_wallet, 6)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(tournament.organizer_wallet!)}
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Entry Fee</span><span className="font-semibold">{formatSOL(tournament.entry_fee)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Prize Pool</span><span className="font-semibold text-brand-700">{formatSOL(tournament.prize_pool)}</span></div>
                  {tournament.organizer_wallet && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Pay to</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono">{truncateAddress(tournament.organizer_wallet)}</code>
                        <button onClick={() => copyToClipboard(tournament.organizer_wallet!)}><Copy className="h-3 w-3 text-muted-foreground" /></button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">Your payment will be recorded on Solana for full transparency. The entry fee contributes to the prize pool.</p>
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
                <DialogDescription>Send exactly {formatSOL(tournament.entry_fee)} to the organizer</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg border space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Destination Wallet</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono flex-1 bg-muted px-2 py-1.5 rounded break-all">
                      {tournament.organizer_wallet}
                    </code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(tournament.organizer_wallet!)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-center font-semibold">Amount: {formatSOL(tournament.entry_fee)}</p>
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
              <p className="text-sm text-muted-foreground">Checking your transaction on the blockchain</p>
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
                    ? 'Your payment has been submitted and is being verified on Solana.'
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
