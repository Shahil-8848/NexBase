import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { teamService } from '@/services/team.service'
import { useAuthContext } from '@/app/auth-context'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAMES } from '@/constants'

const schema = z.object({
  name: z.string().min(3, 'Team name must be at least 3 characters').max(40, 'Team name is too long'),
  game: z.string().min(1, 'Select a game'),
})
type FormData = z.infer<typeof schema>

export function CreateTeamPage() {
  const navigate = useNavigate()
  const { profile } = useAuthContext()
  const queryClient = useQueryClient()

  const {
    register, handleSubmit, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      game: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!profile) throw new Error('Not authenticated')
      return teamService.createTeam(data.name, data.game, profile.id)
    },
    onSuccess: (team) => {
      toast({ title: 'Team Created!', description: `"${team.name}" has been set up successfully.` })
      queryClient.invalidateQueries({ queryKey: ['my-teams', profile?.id] })
      navigate('/teams')
    },
    onError: (err) => {
      toast({
        title: 'Failed to create team',
        description: (err as Error).message.includes('unique')
          ? 'A team with this name already exists.'
          : (err as Error).message,
        variant: 'destructive',
      })
    },
  })

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <PageHeader title="Create a Team" description="Create a roster to compete in team-based tournaments" />

      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Team Name *</Label>
              <Input placeholder="e.g. NexBase Alpha" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Competitive Game *</Label>
              <Select onValueChange={(v) => setValue('game', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team game" />
                </SelectTrigger>
                <SelectContent>
                  {GAMES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.game && <p className="text-xs text-destructive">{errors.game.message}</p>}
              <p className="text-[11px] text-muted-foreground">
                Your team can only register for tournaments hosting this specific game.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending}>
            Register Team
          </Button>
        </div>
      </form>
    </div>
  )
}
