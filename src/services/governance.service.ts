import { supabase } from '@/lib/supabase'

export interface Dispute {
  id: string
  match_id: string
  tournament_id: string
  creator_id: string
  reason: string
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  creator?: {
    username: string
  }
}

export interface Vote {
  id: string
  dispute_id: string
  voter_id: string
  vote_for: string
  signature: string
  created_at: string
  voter?: {
    username: string
    wallet_address: string
  }
}

export const governanceService = {
  async getDisputeByMatchId(matchId: string): Promise<Dispute | null> {
    const { data, error } = await supabase
      .from('disputes')
      .select('*, creator:profiles!creator_id(username)')
      .eq('match_id', matchId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching dispute:', error)
      return null
    }
    return data as Dispute | null
  },

  async createDispute(
    matchId: string,
    tournamentId: string,
    creatorId: string,
    reason: string
  ): Promise<Dispute> {
    const { data, error } = await supabase
      .from('disputes')
      .insert({
        match_id: matchId,
        tournament_id: tournamentId,
        creator_id: creatorId,
        reason,
        status: 'open',
      })
      .select('*, creator:profiles!creator_id(username)')
      .single()

    if (error) throw new Error(error.message)
    return data as Dispute
  },

  async castVote(
    disputeId: string,
    voterId: string,
    voteFor: string,
    wallet: any
  ): Promise<Vote> {
    if (!wallet.signMessage) {
      throw new Error('Connected wallet does not support cryptographic message signing.')
    }

    // Cryptographic message to be signed
    const messageText = `ChainArena Vote: dispute=${disputeId}, voter=${voterId}, choice=${voteFor}`
    const encoder = new TextEncoder()
    const messageBytes = encoder.encode(messageText)

    // Request wallet signature
    const signatureBytes = await wallet.signMessage(messageBytes)
    const signatureHex = Array.from(signatureBytes)
      .map((b: any) => b.toString(16).padStart(2, '0'))
      .join('')

    // Insert vote record containing the cryptographic signature
    const { data, error } = await supabase
      .from('votes')
      .insert({
        dispute_id: disputeId,
        voter_id: voterId,
        vote_for: voteFor,
        signature: signatureHex,
      })
      .select('*, voter:profiles!voter_id(username, wallet_address)')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('You have already voted on this dispute.')
      }
      throw new Error(error.message)
    }

    return data as Vote
  },

  async getDisputeVotes(disputeId: string): Promise<Vote[]> {
    const { data, error } = await supabase
      .from('votes')
      .select('*, voter:profiles!voter_id(username, wallet_address)')
      .eq('dispute_id', disputeId)

    if (error) {
      console.error('Error fetching dispute votes:', error)
      return []
    }
    return data as Vote[]
  },

  async resolveDispute(
    disputeId: string,
    status: 'resolved' | 'dismissed'
  ): Promise<void> {
    const { error } = await supabase
      .from('disputes')
      .update({ status })
      .eq('id', disputeId)

    if (error) throw new Error(error.message)
  },
}
