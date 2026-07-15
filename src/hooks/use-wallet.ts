import { useWallet } from '@solana/wallet-adapter-react'
import { useCallback } from 'react'
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token'
import { SOLANA_RPC_URL, USDC_MINT } from '@/constants'
import { solanaService } from '@/services/solana.service'
import {
  getTournamentVaultKeypair,
  createSolEscrowPayoutTx,
  createUsdcEscrowPayoutTx,
} from '@/lib/escrow-utils'

export function useSolanaWallet() {
  const wallet = useWallet()

  /**
   * Sends a payment (SOL or USDC) from the player's wallet to a destination wallet.
   * Can be used to deposit into tournament escrow or send direct transfers.
   */
  const sendPayment = useCallback(
    async (
      toAddress: string,
      amount: number,
      tokenType: 'SOL' | 'USDC' = 'SOL'
    ): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error('Wallet not connected')
      }

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const toPubkey = new PublicKey(toAddress)
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed')

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: wallet.publicKey,
      })

      if (tokenType === 'USDC') {
        const mintPubkey = new PublicKey(USDC_MINT)
        const fromAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey)
        const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey, true)

        // Check if destination ATA exists, if not, create it
        const toAtaInfo = await connection.getAccountInfo(toAta)
        if (!toAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              toAta,
              toPubkey,
              mintPubkey,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          )
        }

        // USDC has 6 decimals on Solana
        const decimals = 6
        const amountUnits = Math.round(amount * Math.pow(10, decimals))

        tx.add(
          createTransferCheckedInstruction(
            fromAta,
            mintPubkey,
            toAta,
            wallet.publicKey,
            BigInt(amountUnits),
            decimals
          )
        )
      } else {
        // SOL transfer
        const lamports = Math.round(amount * LAMPORTS_PER_SOL)
        tx.add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey,
            lamports,
          })
        )
      }

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

  /**
   * Triggers the disbursement of the tournament's vaulted escrow funds to the winner.
   * Derives the vault private key deterministically on the client, signs the tx,
   * and uses the organizer's connected wallet to pay the transaction fee.
   */
  const payoutTournament = useCallback(
    async (
      tournamentId: string,
      winnerAddress: string,
      tokenType: 'SOL' | 'USDC'
    ): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error('Organizer wallet not connected')
      }

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const vaultKeypair = await getTournamentVaultKeypair(tournamentId)
      
      let tx: Transaction
      if (tokenType === 'USDC') {
        tx = await createUsdcEscrowPayoutTx(
          connection,
          vaultKeypair,
          winnerAddress,
          USDC_MINT,
          wallet.publicKey
        )
      } else {
        tx = await createSolEscrowPayoutTx(
          connection,
          vaultKeypair,
          winnerAddress,
          wallet.publicKey
        )
      }

      // Partially sign with the derived vault keypair
      tx.partialSign(vaultKeypair)

      // Sign with the connected organizer wallet (who is the fee payer)
      const signed = await wallet.signTransaction(tx)
      const signature = await connection.sendRawTransaction(signed.serialize())

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      )

      return signature
    },
    [wallet]
  )

  /**
   * Refounds a player's entry fee from the tournament vault.
   */
  const refundTournamentRegistration = useCallback(
    async (
      tournamentId: string,
      playerAddress: string,
      tokenType: 'SOL' | 'USDC',
      amount: number
    ): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error('Organizer wallet not connected')
      }

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const vaultKeypair = await getTournamentVaultKeypair(tournamentId)
      const playerPubkey = new PublicKey(playerAddress)
      const vaultPubkey = vaultKeypair.publicKey

      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: wallet.publicKey,
      })

      if (tokenType === 'USDC') {
        const mintPubkey = new PublicKey(USDC_MINT)
        const vaultAta = await getAssociatedTokenAddress(mintPubkey, vaultPubkey, true)
        const playerAta = await getAssociatedTokenAddress(mintPubkey, playerPubkey)

        // Make sure player ATA exists
        const playerAtaInfo = await connection.getAccountInfo(playerAta)
        if (!playerAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              playerAta,
              playerPubkey,
              mintPubkey,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          )
        }

        const decimals = 6
        const amountUnits = Math.round(amount * Math.pow(10, decimals))

        tx.add(
          createTransferCheckedInstruction(
            vaultAta,
            mintPubkey,
            playerAta,
            vaultPubkey,
            BigInt(amountUnits),
            decimals
          )
        )
      } else {
        const lamports = Math.round(amount * LAMPORTS_PER_SOL)
        tx.add(
          SystemProgram.transfer({
            fromPubkey: vaultPubkey,
            toPubkey: playerPubkey,
            lamports,
          })
        )
      }

      // Partially sign with the vault
      tx.partialSign(vaultKeypair)

      // Sign with organizer fee payer
      const signed = await wallet.signTransaction(tx)
      const signature = await connection.sendRawTransaction(signed.serialize())

      const { lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
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
    payoutTournament,
    refundTournamentRegistration,
    getBalance,
  }
}
