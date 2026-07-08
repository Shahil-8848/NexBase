import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { SOLANA_NETWORK, SOLANA_RPC_URL } from '@/constants'
import { toast } from '@/hooks/use-toast'

// Solana wallet adapter default modal styles
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletConnectionProviderProps {
  children: ReactNode
}

export function WalletConnectionProvider({ children }: WalletConnectionProviderProps) {
  const network =
    SOLANA_NETWORK === 'mainnet-beta'
      ? WalletAdapterNetwork.Mainnet
      : WalletAdapterNetwork.Devnet

  const endpoint = useMemo(
    () => SOLANA_RPC_URL || clusterApiUrl(network),
    [network]
  )

  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  const onError = (error: Error) => {
    // Suppress "user rejected" — that's expected behaviour
    if (error.message.toLowerCase().includes('user rejected')) return

    toast({
      title: 'Wallet error',
      description: error.message,
      variant: 'destructive',
    })
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
