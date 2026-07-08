import { supabase } from '@/lib/supabase'
import type { Transaction, TransactionType, TransactionStatus } from '@/types'
import { getSolanaExplorerUrl } from '@/lib/utils'

export interface CreateTransactionData {
  user_id: string
  type: TransactionType
  amount: number
  signature: string
  status: TransactionStatus
  tournament_id?: string
  description?: string
}

export const transactionService = {
  async createTransaction(data: CreateTransactionData): Promise<Transaction> {
    const explorer_url = getSolanaExplorerUrl(data.signature)
    const { data: result, error } = await supabase
      .from('transactions')
      .insert({ ...data, explorer_url })
      .select('*, tournament:tournaments(id,title,game)')
      .single()
    if (error) throw error
    return result as Transaction
  },

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, tournament:tournaments(id,title,game,organizer_id)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Transaction[]
  },

  async updateTransactionStatus(
    id: string,
    status: TransactionStatus
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Transaction
  },

  async getTournamentRevenue(tournamentId: string): Promise<number> {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('tournament_id', tournamentId)
      .eq('type', 'entry_fee')
      .eq('status', 'confirmed')
    if (error) throw error
    return (data ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0)
  },

  async getTournamentPrizesSent(tournamentId: string): Promise<number> {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('tournament_id', tournamentId)
      .eq('type', 'prize')
      .eq('status', 'confirmed')
    if (error) throw error
    return (data ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0)
  },
}
