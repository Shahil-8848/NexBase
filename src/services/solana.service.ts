import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js'
import { SOLANA_RPC_URL } from '@/constants'
import { getSolanaExplorerUrl } from '@/lib/utils'

export const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

export interface VerifiedPayment {
  signature: string
  from: string
  to: string
  amount: number // in SOL or USDC
  confirmed: boolean
  explorerUrl: string
  blockTime: number | null
}

export const solanaService = {
  async getBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress)
      const lamports = await connection.getBalance(pubkey)
      return lamports / LAMPORTS_PER_SOL
    } catch {
      return 0
    }
  },

  async verifyTransaction(
    signature: string,
    expectedTo: string,
    expectedAmount: number, // in SOL or Tokens
    tokenMintAddress?: string
  ): Promise<VerifiedPayment | null> {
    try {
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      })

      if (!tx || !tx.meta) return null

      // Check it's a confirmed, non-error transaction
      if (tx.meta.err) return null

      // Case A: Verify SPL Token Transfer (e.g., USDC)
      if (tokenMintAddress) {
        const preTokenBalances = tx.meta.preTokenBalances || []
        const postTokenBalances = tx.meta.postTokenBalances || []

        let fromAddress = ''
        let toAddress = ''
        let amountTransferred = 0

        const balances = new Map<string, { pre: number; post: number }>()

        for (const item of preTokenBalances) {
          if (item.mint === tokenMintAddress && item.owner) {
            balances.set(item.owner, { pre: item.uiTokenAmount.uiAmount || 0, post: 0 })
          }
        }

        for (const item of postTokenBalances) {
          if (item.mint === tokenMintAddress && item.owner) {
            const current = balances.get(item.owner) || { pre: 0, post: 0 }
            current.post = item.uiTokenAmount.uiAmount || 0
            balances.set(item.owner, current)
          }
        }

        for (const [owner, bal] of balances.entries()) {
          const delta = bal.post - bal.pre
          if (delta > 0) {
            toAddress = owner
            amountTransferred = delta
          } else if (delta < 0) {
            fromAddress = owner
          }
        }

        const toMatches = toAddress.toLowerCase() === expectedTo.toLowerCase()
        const amountMatches = amountTransferred >= expectedAmount * 0.99

        return {
          signature,
          from: fromAddress,
          to: toAddress,
          amount: amountTransferred,
          confirmed: toMatches && amountMatches,
          explorerUrl: getSolanaExplorerUrl(signature),
          blockTime: tx.blockTime ?? null,
        }
      }

      // Case B: Verify SOL Transfer
      const instructions = tx.transaction.message.instructions
      let fromAddress = ''
      let toAddress = ''
      let amountLamports = 0

      for (const ix of instructions) {
        if ('parsed' in ix && ix.parsed?.type === 'transfer') {
          fromAddress = ix.parsed.info.source
          toAddress = ix.parsed.info.destination
          amountLamports = ix.parsed.info.lamports
          break
        }
      }

      // If no parsed transfer, fall back to account key delta scan
      if (!fromAddress) {
        const accounts = tx.transaction.message.accountKeys
        const preBalances = tx.meta.preBalances
        const postBalances = tx.meta.postBalances

        let maxDecrease = 0
        let fromIdx = -1
        let toIdx = -1

        for (let i = 0; i < accounts.length; i++) {
          const delta = postBalances[i] - preBalances[i]
          if (delta < 0 && Math.abs(delta) > maxDecrease) {
            maxDecrease = Math.abs(delta)
            fromIdx = i
          }
        }
        for (let i = 0; i < accounts.length; i++) {
          if (i !== fromIdx) {
            const delta = postBalances[i] - preBalances[i]
            if (delta > 0) {
              toIdx = i
              amountLamports = delta
              break
            }
          }
        }

        if (fromIdx >= 0) fromAddress = accounts[fromIdx].pubkey.toBase58()
        if (toIdx >= 0) toAddress = accounts[toIdx].pubkey.toBase58()
      }

      const amountSOL = amountLamports / LAMPORTS_PER_SOL

      // Validate destination and amount (allow 1% tolerance for fee rounding)
      const toMatches = toAddress.toLowerCase() === expectedTo.toLowerCase()
      const amountMatches = amountSOL >= expectedAmount * 0.99

      return {
        signature,
        from: fromAddress,
        to: toAddress,
        amount: amountSOL,
        confirmed: toMatches && amountMatches,
        explorerUrl: getSolanaExplorerUrl(signature),
        blockTime: tx.blockTime ?? null,
      }
    } catch (err) {
      return null
    }
  },

  async getRecentTransactions(
    walletAddress: string,
    limit = 10
  ): Promise<ParsedTransactionWithMeta[]> {
    try {
      const pubkey = new PublicKey(walletAddress)
      const signatures = await connection.getSignaturesForAddress(pubkey, { limit })
      const txs = await connection.getParsedTransactions(
        signatures.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      )
      return (txs.filter(Boolean) as ParsedTransactionWithMeta[])
    } catch {
      return []
    }
  },

  isValidPublicKey(address: string): boolean {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  },
}
