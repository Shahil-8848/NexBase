import {
  Connection,
  Keypair,
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

// Salt to ensure tournament vault seeds are unique to ChainArena
const VAULT_SALT = 'chainarena-tournament-vault-salt-v1'

/**
 * Deterministically derives a Solana Keypair from a tournament UUID.
 * This acts as the secure, trust-minimized escrow account for the tournament.
 */
export async function getTournamentVaultKeypair(tournamentId: string): Promise<Keypair> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${tournamentId}-${VAULT_SALT}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const seed = new Uint8Array(hashBuffer)
  return Keypair.fromSeed(seed)
}

/**
 * Builds a transaction to payout all SOL held in the tournament vault to the winner.
 * The transaction fees are paid by the vault itself (deducted from balance).
 */
export async function createSolEscrowPayoutTx(
  connection: Connection,
  vaultKeypair: Keypair,
  winnerAddress: string,
  feePayer: PublicKey
): Promise<Transaction> {
  const winnerPubkey = new PublicKey(winnerAddress)
  const vaultPubkey = vaultKeypair.publicKey

  // Get current vault balance
  const balance = await connection.getBalance(vaultPubkey)
  if (balance === 0) {
    throw new Error('Vault has 0 SOL balance.')
  }

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

  // Calculate rent-exempt minimum for system account (should be 0 since we can empty it)
  // Let's leave a tiny fraction of SOL (0.00001 SOL) to cover the tx fee
  const feeEstimate = 5000 // 5000 lamports is standard Solana signature fee
  const transferAmount = balance - feeEstimate

  if (transferAmount <= 0) {
    throw new Error('Vault balance is too low to cover transaction fees.')
  }

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: feePayer,
  }).add(
    SystemProgram.transfer({
      fromPubkey: vaultPubkey,
      toPubkey: winnerPubkey,
      lamports: transferAmount,
    })
  )

  return tx
}

/**
 * Builds a transaction to payout USDC held in the tournament vault to the winner's token account.
 * Since USDC is an SPL Token, the vault token account is emptied. The fee payer (organizer) covers the SOL fee.
 */
export async function createUsdcEscrowPayoutTx(
  connection: Connection,
  vaultKeypair: Keypair,
  winnerAddress: string,
  usdcMintAddress: string,
  feePayer: PublicKey
): Promise<Transaction> {
  const winnerPubkey = new PublicKey(winnerAddress)
  const vaultPubkey = vaultKeypair.publicKey
  const mintPubkey = new PublicKey(usdcMintAddress)

  // Find Associated Token Accounts for vault and winner
  const vaultAta = await getAssociatedTokenAddress(mintPubkey, vaultPubkey, true)
  const winnerAta = await getAssociatedTokenAddress(mintPubkey, winnerPubkey)

  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: feePayer,
  })

  // Check if winner ATA exists, if not, add instruction to create it
  const info = await connection.getAccountInfo(winnerAta)
  if (!info) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        feePayer,
        winnerAta,
        winnerPubkey,
        mintPubkey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    )
  }

  // Get vault token balance
  const tokenAccountInfo = await connection.getTokenAccountBalance(vaultAta)
  const amount = tokenAccountInfo.value.amount
  const decimals = tokenAccountInfo.value.decimals

  if (Number(amount) === 0) {
    throw new Error('USDC Vault has 0 balance.')
  }

  // Add token transfer instruction from vault to winner
  tx.add(
    createTransferCheckedInstruction(
      vaultAta,
      mintPubkey,
      winnerAta,
      vaultPubkey,
      BigInt(amount),
      decimals
    )
  )

  return tx
}
