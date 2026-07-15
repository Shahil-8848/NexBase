import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserMinus, Plus, Shield, Search, Check, X, ShieldAlert, Award, TrendingUp, Clock } from 'lucide-react'
import { teamService } from '@/services/team.service'
import { useAuthContext } from '@/app/auth-context'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getAvatarUrl } from '@/lib/utils'

export function TeamsPage() {
  const { profile } = useAuthContext()
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [searchVal, setSearchVal] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // 1. Fetch user's teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['my-teams', profile?.id],
    queryFn: () => teamService.getMyTeams(profile!.id),
    enabled: !!profile?.id,
  })

  // 2. Fetch pending invites sent to user
  const { data: invites = [], refetch: refetchInvites } = useQuery({
    queryKey: ['pending-invites', profile?.id],
    queryFn: () => teamService.getPendingInvites(profile!.id),
    enabled: !!profile?.id,
  })

  // Determine active team
  const activeTeam = teams.find((t) => t.id === selectedTeamId) || teams[0] || null

  // 3. Fetch active team members
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['team-members', activeTeam?.id],
    queryFn: () => teamService.getTeamMembers(activeTeam!.id),
    enabled: !!activeTeam?.id,
  })

  // 4. Fetch invites sent by captain for active team
  const { data: sentInvites = [], refetch: refetchSentInvites } = useQuery({
    queryKey: ['team-invites-sent', activeTeam?.id],
    queryFn: () => teamService.getTeamInvitesSent(activeTeam!.id),
    enabled: !!activeTeam?.id && activeTeam.captain_id === profile?.id,
  })

  // 5. Fetch team stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['team-stats', activeTeam?.id],
    queryFn: () => teamService.getTeamStats(activeTeam!.id),
    enabled: !!activeTeam?.id,
  })

  // Fetch suggested free agent players
  const { data: suggestedPlayers = [], refetch: refetchSuggested } = useQuery({
    queryKey: ['suggested-players', profile?.id, activeTeam?.id, members],
    queryFn: () => teamService.getSuggestedPlayers(profile!.id),
    enabled: !!profile?.id && !!activeTeam?.id && activeTeam.captain_id === profile?.id,
  })

  const isCaptain = activeTeam?.captain_id === profile?.id

  const inviteMutation = useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      teamService.inviteMember(teamId, playerId),
    onSuccess: () => {
      toast({ title: 'Invitation Sent!' })
      refetchSentInvites()
      refetchSuggested()
      setSearchVal('')
      setSearchResults([])
    },
    onError: (err) => toast({ title: 'Failed to invite', description: (err as Error).message, variant: 'destructive' }),
  })

  const responseMutation = useMutation({
    mutationFn: ({ inviteId, status }: { inviteId: string; status: 'accepted' | 'rejected' }) =>
      teamService.respondToInvite(inviteId, status),
    onSuccess: (_, variables) => {
      toast({ title: variables.status === 'accepted' ? 'Joined team!' : 'Invitation declined' })
      queryClient.invalidateQueries({ queryKey: ['my-teams', profile?.id] })
      refetchInvites()
    },
    onError: (err) => toast({ title: 'Action failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      teamService.removeMember(teamId, playerId),
    onSuccess: () => {
      toast({ title: 'Roster updated' })
      refetchMembers()
      refetchSuggested()
    },
    onError: (err) => toast({ title: 'Failed to remove member', description: (err as Error).message, variant: 'destructive' }),
  })

  const searchProfiles = async (val: string) => {
    setSearchVal(val)
    if (!val.trim() || !profile) {
      setSearchResults([])
      return
    }
    try {
      const results = await teamService.searchProfiles(val, profile.id)
      // Filter out players who are already members or invited
      const memberIds = new Set(members.map((m) => m.player_id))
      const invitedIds = new Set(sentInvites.map((i) => i.player_id))
      const filtered = results.filter((p) => !memberIds.has(p.id) && !invitedIds.has(p.id))
      setSearchResults(filtered)
    } catch (err) {
      // Ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Teams Hub" description="Form roster squads to enter team tournaments" />
        <Link to="/teams/create">
          <Button size="sm" className="gap-1.5 bg-brand text-white hover:bg-brand/90">
            <Plus className="h-4 w-4" /> Create Team
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: List of teams and incoming invites */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">My Teams</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">{teams.length} Roster{teams.length !== 1 ? 's' : ''}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {teamsLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !teams.length ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-muted-foreground">You are not in any competitive teams yet.</p>
                  <Link to="/teams/create" className="inline-block">
                    <Button size="xs" variant="outline" className="gap-1">
                      <Plus className="h-3 w-3" /> Register Team
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {teams.map((t) => {
                    const isSelected = activeTeam?.id === t.id
                    const isUserCaptain = t.captain_id === profile?.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTeamId(t.id)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors
                          ${isSelected ? 'bg-brand/5 border-l-4 border-brand' : 'hover:bg-muted/30 border-l-4 border-transparent'}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate text-foreground">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{t.game}</p>
                        </div>
                        <Badge variant={isUserCaptain ? 'brand' : 'secondary'} className="text-[9px] uppercase tracking-wider">
                          {isUserCaptain ? 'Captain' : 'Member'}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations Box */}
          {invites.length > 0 && (
            <Card className="border border-brand/20 bg-brand/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-brand" />
                  Pending Team Invites ({invites.length})
                </CardTitle>
                <CardDescription className="text-[11px]">Accept to register and play under their banner.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-brand/10">
                  {invites.map((invite) => (
                    <div key={invite.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate text-foreground">
                          {invite.team?.name}
                        </p>
                        <p className="text-[9px] text-muted-foreground capitalize">
                          {invite.team?.game} · By {invite.team?.captain?.username}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          className="h-6 w-6 bg-green-600 hover:bg-green-700 text-white rounded-full"
                          onClick={() => responseMutation.mutate({ inviteId: invite.id, status: 'accepted' })}
                          loading={responseMutation.isPending && responseMutation.variables?.inviteId === invite.id}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10 border-destructive/20 rounded-full"
                          onClick={() => responseMutation.mutate({ inviteId: invite.id, status: 'rejected' })}
                          loading={responseMutation.isPending && responseMutation.variables?.inviteId === invite.id}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Roster Details and Stats */}
        <div className="lg:col-span-2 space-y-6">
          {!activeTeam ? (
            <EmptyState
              icon={<Users className="h-10 w-10 text-muted-foreground/50" />}
              title="No Team Selected"
              description="Create or select a roster to view stats, manage members, and send invites."
            />
          ) : (
            <>
              {/* Pro Team Profile Banner */}
              <Card className="overflow-hidden border-2 border-brand/5">
                <div className="h-2 bg-brand" />
                <CardContent className="p-6 space-y-6">
                  {/* Header Title */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">{activeTeam.name}</h2>
                        <Badge variant="brand" className="text-[10px] uppercase font-semibold">
                          {activeTeam.game}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Captained by <span className="font-semibold text-foreground">{activeTeam.captain?.username}</span>
                      </p>
                    </div>

                    {!isCaptain && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Are you sure you want to leave ${activeTeam.name}?`)) {
                            removeMemberMutation.mutate({ teamId: activeTeam.id, playerId: profile!.id })
                          }
                        }}
                        loading={removeMemberMutation.isPending && removeMemberMutation.variables?.playerId === profile?.id}
                      >
                        Leave Team
                      </Button>
                    )}
                  </div>

                  {/* Pro Stats Cards Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-1 shadow-sm">
                      <p className="text-3xl font-black text-zinc-100 tracking-tight">
                        {statsLoading ? '...' : stats?.tournamentsPlayed}
                      </p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tournaments Played</p>
                    </div>
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-1 shadow-sm">
                      <p className="text-3xl font-black text-yellow-500 tracking-tight flex items-center justify-center gap-1">
                        {statsLoading ? '...' : stats?.earnedSol.toFixed(2)}
                        <span className="text-xs font-bold text-yellow-600">SOL</span>
                      </p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">SOL Winnings</p>
                    </div>
                    <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-xl text-center space-y-1 shadow-md">
                      <p className="text-3xl font-black text-sky-400 tracking-tight flex items-center justify-center gap-1">
                        {statsLoading ? '...' : stats?.earnedUsdc.toFixed(2)}
                        <span className="text-xs font-bold text-sky-500">USDC</span>
                      </p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">USDC Winnings</p>
                    </div>
                  </div>

                  {/* Active Roster List */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-brand" />
                      Active Roster List ({members.length}/5 members)
                    </h3>
                    <div className="divide-y border rounded-lg overflow-hidden bg-card">
                      {members.map((member) => {
                        const memberCaptain = member.player_id === activeTeam.captain_id
                        return (
                          <div key={member.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={getAvatarUrl(member.player?.avatar, member.player?.username || '')} />
                              <AvatarFallback className="text-[10px] font-bold">
                                {member.player?.username?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-foreground">{member.player?.username}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {memberCaptain ? (
                                <Badge className="text-[9px] bg-yellow-100 text-yellow-800 hover:bg-yellow-100 flex items-center gap-0.5 rounded border border-yellow-200">
                                  <Shield className="h-2.5 w-2.5" /> Captain
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] capitalize rounded">Member</Badge>
                              )}

                              {isCaptain && !memberCaptain && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive/10"
                                  title="Kick member"
                                  onClick={() => {
                                    if (confirm(`Kick ${member.player?.username} from team?`)) {
                                      removeMemberMutation.mutate({ teamId: activeTeam.id, playerId: member.player_id })
                                    }
                                  }}
                                  loading={removeMemberMutation.isPending && removeMemberMutation.variables?.playerId === member.player_id}
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Invites & Player Recruiting (Only for Captains) */}
                  {isCaptain && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-brand">
                          <Search className="h-4 w-4" />
                          Recruit &amp; Invite Members
                        </h3>
                        <p className="text-[11px] text-muted-foreground">Search and invite active platform users to your roster.</p>
                      </div>

                      {/* User search bar */}
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search players by username..."
                          className="pl-9 text-xs"
                          value={searchVal}
                          onChange={(e) => searchProfiles(e.target.value)}
                        />
                      </div>

                      {/* Search Results / Suggestions */}
                      {searchVal.trim() === '' ? (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Suggested Players (Without a Team)
                          </h4>
                          {suggestedPlayers.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground bg-muted/20 p-3 rounded-lg border text-center">
                              No suggested players available right now.
                            </p>
                          ) : (
                            <div className="border rounded-lg bg-card divide-y">
                              {suggestedPlayers.map((user) => {
                                const isUserMember = members.some((m) => m.player_id === user.id)
                                const isUserInvited = sentInvites.some((i) => i.player_id === user.id)
                                return (
                                  <div key={user.id} className="flex items-center justify-between p-2.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={getAvatarUrl(user.avatar, user.username)} />
                                        <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                                      </Avatar>
                                      <span className="font-medium">{user.username}</span>
                                    </div>
                                    {isUserMember ? (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        disabled
                                        className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 font-semibold rounded-md shadow-sm gap-1"
                                      >
                                        <Check className="h-3 w-3" /> Roster
                                      </Button>
                                    ) : isUserInvited ? (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        disabled
                                        className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 font-semibold rounded-md shadow-sm gap-1"
                                      >
                                        <Clock className="h-3 w-3" /> Invited
                                      </Button>
                                    ) : (
                                      <Button
                                        size="xs"
                                        className="bg-brand/10 hover:bg-brand text-brand hover:text-white border border-brand/20 transition-all font-semibold rounded-md shadow-sm gap-1"
                                        onClick={() => inviteMutation.mutate({ teamId: activeTeam.id, playerId: user.id })}
                                        loading={inviteMutation.isPending && inviteMutation.variables?.playerId === user.id}
                                      >
                                        <Plus className="h-3 w-3" /> Invite
                                      </Button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        searchResults.length > 0 && (
                          <div className="border rounded-lg bg-card max-h-[150px] overflow-y-auto divide-y">
                            {searchResults.map((user) => {
                              const isUserMember = members.some((m) => m.player_id === user.id)
                              const isUserInvited = sentInvites.some((i) => i.player_id === user.id)
                              return (
                                <div key={user.id} className="flex items-center justify-between p-2.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={getAvatarUrl(user.avatar, user.username)} />
                                      <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{user.username}</span>
                                  </div>
                                  {isUserMember ? (
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      disabled
                                      className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 font-semibold rounded-md shadow-sm gap-1"
                                    >
                                      <Check className="h-3 w-3" /> Roster
                                    </Button>
                                  ) : isUserInvited ? (
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      disabled
                                      className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 font-semibold rounded-md shadow-sm gap-1"
                                    >
                                      <Clock className="h-3 w-3" /> Invited
                                    </Button>
                                  ) : (
                                    <Button
                                      size="xs"
                                      className="bg-brand/10 hover:bg-brand text-brand hover:text-white border border-brand/20 transition-all font-semibold rounded-md shadow-sm gap-1"
                                      onClick={() => inviteMutation.mutate({ teamId: activeTeam.id, playerId: user.id })}
                                      loading={inviteMutation.isPending && inviteMutation.variables?.playerId === user.id}
                                    >
                                      <Plus className="h-3 w-3" /> Invite
                                    </Button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      )}

                      {/* Sent Invites list */}
                      {sentInvites.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sent Invites</h4>
                          <div className="border rounded-lg bg-muted/20 divide-y max-h-[120px] overflow-y-auto">
                            {sentInvites.map((invite) => (
                              <div key={invite.id} className="flex items-center justify-between px-3 py-2 text-xs">
                                <span className="font-medium">{invite.player?.username}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                    Invite Pending
                                  </span>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className="text-destructive hover:bg-destructive/10 h-6 px-1.5"
                                    onClick={() => removeMemberMutation.mutate({ teamId: activeTeam.id, playerId: invite.player_id })}
                                    loading={removeMemberMutation.isPending && removeMemberMutation.variables?.playerId === invite.player_id}
                                  >
                                    Revoke
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
