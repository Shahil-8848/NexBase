import { supabase } from '@/lib/supabase'
import type { Team, TeamMember, Profile } from '@/types'

export const teamService = {
  async createTeam(name: string, game: string, captainId: string): Promise<Team> {
    // 1. Insert the team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ name, game, captain_id: captainId })
      .select()
      .single()

    if (teamError) throw teamError

    // 2. Add captain as accepted member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        player_id: captainId,
        status: 'accepted'
      })

    if (memberError) throw memberError

    return team as Team
  },

  async getMyTeams(playerId: string): Promise<Team[]> {
    // Get teams captained by player
    const { data: captained, error: err1 } = await supabase
      .from('teams')
      .select('*, captain:profiles(*)')
      .eq('captain_id', playerId)

    if (err1) throw err1

    // Get teams joined by player as member (accepted)
    const { data: memberOf, error: err2 } = await supabase
      .from('team_members')
      .select('team:teams(*, captain:profiles(*))')
      .eq('player_id', playerId)
      .eq('status', 'accepted')

    if (err2) throw err2

    const memberTeams = (memberOf || []).map((m: any) => m.team).filter(Boolean)

    // Combine and deduplicate
    const allTeams = [...(captained || [])]
    memberTeams.forEach((t: Team) => {
      if (!allTeams.some((ex) => ex.id === t.id)) {
        allTeams.push(t)
      }
    })

    return allTeams
  },

  async getTeamDetails(teamId: string): Promise<Team> {
    const { data, error } = await supabase
      .from('teams')
      .select('*, captain:profiles(*)')
      .eq('id', teamId)
      .single()

    if (error) throw error
    return data as Team
  },

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, player:profiles(*)')
      .eq('team_id', teamId)
      .eq('status', 'accepted')

    if (error) throw error
    return data as TeamMember[]
  },

  async getPendingInvites(playerId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, team:teams(*, captain:profiles(*))')
      .eq('player_id', playerId)
      .eq('status', 'pending')

    if (error) throw error
    return data as TeamMember[]
  },

  async inviteMember(teamId: string, playerId: string): Promise<TeamMember> {
    const { data, error } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, player_id: playerId, status: 'pending' })
      .select()
      .single()

    if (error) throw error
    return data as TeamMember
  },

  async respondToInvite(teamMemberId: string, status: 'accepted' | 'rejected'): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .update({ status })
      .eq('id', teamMemberId)

    if (error) throw error
  },

  async removeMember(teamId: string, playerId: string): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId)

    if (error) throw error
  },

  async getTeamInvitesSent(teamId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, player:profiles(*)')
      .eq('team_id', teamId)
      .eq('status', 'pending')

    if (error) throw error
    return data as TeamMember[]
  },

  async searchProfiles(query: string, currentUserId: string): Promise<Profile[]> {
    if (!query.trim()) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
      .ilike('username', `%${query}%`)
      .limit(10)

    if (error) throw error
    return data as Profile[]
  },

  async getSuggestedPlayers(currentUserId: string): Promise<Profile[]> {
    // 1. Fetch team members (accepted)
    const { data: members, error: membersErr } = await supabase
      .from('team_members')
      .select('player_id')
      .eq('status', 'accepted')

    if (membersErr) throw membersErr
    const memberIds = (members || []).map((m: any) => m.player_id)

    // 2. Fetch team captains
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('captain_id')

    if (teamsErr) throw teamsErr
    const captainIds = (teams || []).map((t: any) => t.captain_id)

    const excludedIds = new Set([...memberIds, ...captainIds, currentUserId])

    // 3. Fetch recent profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
      .limit(100)

    if (error) throw error

    // Filter to get 5 suggested players
    const filtered = (profiles || [])
      .filter((p) => !excludedIds.has(p.id))
      .slice(0, 5)

    return filtered as Profile[]
  },

  async getTeamStats(teamId: string): Promise<{ tournamentsPlayed: number; earnedSol: number; earnedUsdc: number }> {
    // 1. Get all participations for the team
    const { data: participations, error: partError } = await supabase
      .from('participants')
      .select('tournament_id, payment_status, tournament:tournaments(token_type)')
      .eq('team_id', teamId)

    if (partError) throw partError

    const verifiedParts = (participations || []).filter((p) => p.payment_status === 'verified')
    const tournamentsPlayed = verifiedParts.length

    // 2. Get prizes won by this team
    const tournamentIds = verifiedParts.map((p) => p.tournament_id)
    let earnedSol = 0
    let earnedUsdc = 0

    if (tournamentIds.length > 0) {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('amount, type, status, tournament_id, tournament:tournaments(token_type)')
        .in('tournament_id', tournamentIds)
        .eq('type', 'prize')
        .eq('status', 'confirmed')

      if (!txError && transactions) {
        transactions.forEach((tx: any) => {
          const token = tx.tournament?.token_type || 'SOL'
          if (token === 'SOL') {
            earnedSol += Number(tx.amount)
          } else {
            earnedUsdc += Number(tx.amount)
          }
        })
      }
    }

    return { tournamentsPlayed, earnedSol, earnedUsdc }
  }
}
