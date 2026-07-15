import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { tournamentService } from '@/services/tournament.service'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { getTournamentVaultKeypair } from '@/lib/escrow-utils'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAMES } from '@/constants'

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(80),
  description: z.string().max(1000).optional(),
  game: z.string().min(1, 'Select a game'),
  entry_fee: z.coerce.number().min(0, 'Entry fee cannot be negative'),
  token_type: z.enum(['SOL', 'USDC']).default('SOL'),
  prize_pool: z.coerce.number().min(0, 'Prize pool cannot be negative'),
  max_players: z.coerce.number().min(2).max(256),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  organizer_wallet: z.string().optional(),
  rules: z.string().max(2000).optional(),
  banner: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  category: z.enum(['1v1', 'high_score']).default('1v1'),
  mode: z.enum(['solo', 'team']).default('solo'),
})
type FormData = z.infer<typeof schema>

import { useEffect } from 'react'

export function CreateTournamentPage() {
  const navigate = useNavigate()
  const { profile } = useAuthContext()
  const { address } = useSolanaWallet()
  const queryClient = useQueryClient()

  // Load saved draft if it exists
  const getSavedDraft = (): Partial<FormData> => {
    try {
      const saved = localStorage.getItem('nexbase_create_tournament_draft')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error(e)
    }
    return {
      max_players: 16,
      entry_fee: 0,
      token_type: 'SOL',
      prize_pool: 0,
      organizer_wallet: address ?? profile?.wallet_address ?? '',
      category: '1v1',
      mode: 'solo',
    }
  }

  const {
    register, handleSubmit, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: getSavedDraft(),
  })

  const formValues = watch()

  // Save to localStorage when form changes
  useEffect(() => {
    localStorage.setItem('nexbase_create_tournament_draft', JSON.stringify(formValues))
  }, [formValues])

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const tournamentId = crypto.randomUUID()
      const vaultKey = await getTournamentVaultKeypair(tournamentId)

      return tournamentService.createTournament(profile!.id, {
        id: tournamentId,
        ...data,
        vault_address: vaultKey.publicKey.toBase58(),
        description: data.description || undefined,
        rules: data.rules || undefined,
        banner: data.banner || undefined,
        organizer_wallet: data.organizer_wallet || undefined,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
      })
    },
    onSuccess: (tournament) => {
      localStorage.removeItem('nexbase_create_tournament_draft')
      toast({ title: 'Tournament created!', description: 'You can now manage it from your dashboard.' })
      queryClient.invalidateQueries({ queryKey: ['organizer-tournaments', profile?.id] })
      navigate(`/organizer/tournaments/${tournament.id}`)
    },
    onError: (err) => toast({ title: 'Create failed', description: (err as Error).message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <PageHeader title="Create Tournament" description="Set up a new tournament for your community" />

      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tournament Title *</Label>
              <Input placeholder="e.g. Valorant Monthly Open" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Game *</Label>
              <Select value={watch('game')} onValueChange={(v) => setValue('game', v)}>
                <SelectTrigger><SelectValue placeholder="Select a game" /></SelectTrigger>
                <SelectContent>
                  {GAMES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.game && <p className="text-xs text-destructive">{errors.game.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Describe your tournament..." rows={3} {...register('description')} />
            </div>
            <div className="space-y-1.5">
              <Label>Banner Image URL</Label>
              <Input placeholder="https://example.com/banner.jpg" {...register('banner')} />
              {errors.banner && <p className="text-xs text-destructive">{errors.banner.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Tournament Format */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tournament Format</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tournament Mode</Label>
                <Select value={watch('mode')} onValueChange={(v) => setValue('mode', v as 'solo' | 'team')}>
                  <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo Mode (Individual Players)</SelectItem>
                    <SelectItem value="team">Team Mode (4 or 5-Player Teams)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Choose whether players compete individually or as a team.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tournament Category / Format</Label>
                <Select value={watch('category')} onValueChange={(v) => setValue('category', v as '1v1' | 'high_score')}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1v1">1v1 Knockout Bracket (Single Elimination)</SelectItem>
                    <SelectItem value="high_score">Map-Based / Leaderboard High Score</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Choose how match winners are determined.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Registration Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">Registration &amp; Fees</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Entry Fee</Label>
                <div className="flex gap-2">
                  <Input type="number" className="flex-1" step="0.0001" min="0" placeholder="0" {...register('entry_fee')} />
                  <Select value={watch('token_type')} onValueChange={(v) => setValue('token_type', v as 'SOL' | 'USDC')}>
                    <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOL">SOL</SelectItem>
                      <SelectItem value="USDC">USDC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {errors.entry_fee && <p className="text-xs text-destructive">{errors.entry_fee.message}</p>}
                <p className="text-xs text-muted-foreground">Set 0 for a free tournament</p>
              </div>
              <div className="space-y-1.5">
                <Label>Base Prize Pool</Label>
                <Input type="number" step="0.0001" min="0" placeholder="0" {...register('prize_pool')} />
                {errors.prize_pool && <p className="text-xs text-destructive">{errors.prize_pool.message}</p>}
                <p className="text-xs text-muted-foreground">Initial sponsored amount</p>
              </div>
              <div className="space-y-1.5">
                <Label>{watch('mode') === 'team' ? 'Max Teams' : 'Max Players'}</Label>
                <Select value={String(watch('max_players'))} onValueChange={(v) => setValue('max_players', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[4, 8, 16, 32, 64, 128].map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n} {watch('mode') === 'team' ? 'teams' : 'players'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Your Wallet Address (Payment Destination)</Label>
              <Input
                placeholder="Solana wallet address for receiving payments"
                {...register('organizer_wallet')}
              />
              <p className="text-xs text-muted-foreground">Players will send entry fees to this address</p>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="datetime-local" {...register('start_date')} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="datetime-local" {...register('end_date')} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        <Card>
          <CardHeader><CardTitle className="text-base">Rules &amp; Format</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>Tournament Rules</Label>
              <Textarea
                placeholder="Describe the format, rules, and any special conditions..."
                rows={5}
                {...register('rules')}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending}>
            Create Tournament
          </Button>
        </div>
      </form>
    </div>
  )
}
