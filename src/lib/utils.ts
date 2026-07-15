import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSOL(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(4)
}

export function lamportsToSOL(lamports: number): number {
  return lamports / 1_000_000_000
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000)
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function formatCurrency(amount: number, currency = 'SOL'): string {
  if (currency === 'SOL') {
    return `${amount.toFixed(4)} SOL`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function getSolanaExplorerUrl(
  signature: string,
  network: 'devnet' | 'mainnet-beta' = 'devnet'
): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${network}`
}

export function getSolanaAddressUrl(
  address: string,
  network: 'devnet' | 'mainnet-beta' = 'devnet'
): string {
  return `https://explorer.solana.com/address/${address}?cluster=${network}`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diff = now.getTime() - then.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) return then.toLocaleDateString()
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getAvatarUrl(avatarUrl: string | null | undefined, username: string): string {
  if (avatarUrl && avatarUrl.trim() !== '') return avatarUrl
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username || 'player')}`
}
