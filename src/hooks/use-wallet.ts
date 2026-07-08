import { useWallet } from '@solana/wallet-adapter-react'
import { useCallback } from 'react'
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { SOLANA_RPC_URL } from '@/constants'
import { solanaService } from '@/services/solana.service'

export function useSolanaWallet() {
  const wallet = useWallet()

  const sendPayment = useCallback(
    async (toAddress: string, amountSOL: number): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error('Wallet not connected')
      }

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const toPubkey = new PublicKey(toAddress)
      const lamports = Math.round(amountSOL * LAMPORTS_PER_SOL)

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed')

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: wallet.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey,
          lamports,
        })
      )

      const signed = await wallet.signTransaction(tx)
      const signature = await connection.sendRawTransaction(signed.serialize())

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      )

      return signature
    },
    [wallet]
  )

  const getBalance = useCallback(async (): Promise<number> => {
    if (!wallet.publicKey) return 0
    return solanaService.getBalance(wallet.publicKey.toBase58())
  }, [wallet.publicKey])

  return {
    wallet,
    connected: wallet.connected,
    publicKey: wallet.publicKey,
    address: wallet.publicKey?.toBase58() ?? null,
    connecting: wallet.connecting,
    disconnecting: wallet.disconnecting,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
    sendPayment,
    getBalance,
  }
}
