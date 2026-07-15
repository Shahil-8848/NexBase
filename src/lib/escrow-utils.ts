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
 * Builds a transaction to payout a specific amount of SOL held in the tournament vault to the winner.
 */
export async function createSolEscrowPayoutTx(
  connection: Connection,
  vaultKeypair: Keypair,
  winnerAddress: string,
  amount: number, // in SOL
  feePayer: PublicKey
): Promise<Transaction> {
  const winnerPubkey = new PublicKey(winnerAddress)
  const vaultPubkey = vaultKeypair.publicKey

  // Get current vault balance
  const balance = await connection.getBalance(vaultPubkey)
  const transferAmount = Math.round(amount * LAMPORTS_PER_SOL)

  if (balance < transferAmount) {
    throw new Error(`Vault balance (${balance / LAMPORTS_PER_SOL} SOL) is less than the prize amount (${amount} SOL).`)
  }

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed')

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
 * Builds a transaction to payout a specific amount of USDC held in the tournament vault to the winner's token account.
 */
export async function createUsdcEscrowPayoutTx(
  connection: Connection,
  vaultKeypair: Keypair,
  winnerAddress: string,
  usdcMintAddress: string,
  amount: number, // in USDC
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
  const vaultAmountStr = tokenAccountInfo.value.amount
  const decimals = tokenAccountInfo.value.decimals

  const transferAmountUnits = Math.round(amount * Math.pow(10, decimals))

  if (BigInt(vaultAmountStr) < BigInt(transferAmountUnits)) {
    throw new Error(`USDC Vault balance (${tokenAccountInfo.value.uiAmount} USDC) is less than the prize amount (${amount} USDC).`)
  }

  // Add token transfer instruction from vault to winner
  tx.add(
    createTransferCheckedInstruction(
      vaultAta,
      mintPubkey,
      winnerAta,
      vaultPubkey,
      BigInt(transferAmountUnits),
      decimals
    )
  )

  return tx
}
