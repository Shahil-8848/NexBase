import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { SOLANA_NETWORK, SOLANA_RPC_URL } from '@/constants'
import { toast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'

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
    const errorMsg = error.message.toLowerCase()
    const errorName = error.name

    // 1. Suppress user cancellations/rejections
    if (
      errorMsg.includes('user rejected') ||
      errorMsg.includes('rejected the request') ||
      errorMsg.includes('cancelled') ||
      errorMsg.includes('cancel') ||
      errorMsg.includes('declined')
    ) {
      console.log('Wallet connection/request rejected by user.')
      return
    }

    // 2. Wallet not installed/detected (WalletNotReadyError or WalletNotFoundError)
    if (
      errorName === 'WalletNotReadyError' ||
      errorName === 'WalletNotFoundError' ||
      errorMsg.includes('not ready') ||
      errorMsg.includes('not found') ||
      errorMsg.includes('notdetected')
    ) {
      toast({
        title: 'Phantom Wallet Required',
        description: 'You need the Phantom Wallet extension installed to connect. Click the button to install it.',
        variant: 'destructive',
        action: (
          <ToastAction
            altText="Install Phantom"
            onClick={() => window.open('https://phantom.app/download', '_blank')}
          >
            Install
          </ToastAction>
        ),
      })
      return
    }

    // 3. Popup / Window blocked by browser
    if (
      errorName === 'WalletWindowBlockedError' ||
      errorMsg.includes('window blocked') ||
      errorMsg.includes('popup')
    ) {
      toast({
        title: 'Pop-up Blocked',
        description: 'Your browser blocked the connection pop-up. Please enable pop-ups for this site and try again.',
        variant: 'destructive',
      })
      return
    }

    // 4. Window closed by user before connecting
    if (
      errorName === 'WalletWindowClosedError' ||
      errorMsg.includes('window closed')
    ) {
      toast({
        title: 'Connection Cancelled',
        description: 'The connection window was closed. Please try connecting again.',
        variant: 'destructive',
      })
      return
    }

    // 5. Default fallback
    toast({
      title: 'Wallet Connection Error',
      description: error.message || 'An unexpected error occurred during wallet connection.',
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
