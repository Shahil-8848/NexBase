import { useEffect, useRef } from 'react'
import { ArrowLeftRight, RefreshCw, Info } from 'lucide-react'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SOLANA_RPC_URL } from '@/constants'

export function SwapPage() {
  const { wallet, connected, address } = useSolanaWallet()
  const initialized = useRef(false)

  useEffect(() => {
    // Initialize Jupiter Terminal on mount
    const initJupiter = () => {
      const win = window as any
      if (win.Jupiter && !initialized.current) {
        win.Jupiter.init({
          displayMode: 'integrated',
          integratedTargetId: 'integrated-terminal',
          // We use Ankr's public endpoint which doesn't block localhost origins or throw 403 errors
          endpoint: 'https://rpc.ankr.com/solana',
          enableWalletPassthrough: false, // Set to false to prevent Devnet wallet adapter conflicts on Mainnet API
          theme: 'light', // Matches the light theme of the website layout
          formProps: {
            initialInputMint: 'So11111111111111111111111111111111111111112', // SOL
            initialOutputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          }
        })
        initialized.current = true
      }
    }

    // Try initiating immediately or wait for script load
    if ((window as any).Jupiter) {
      initJupiter()
    } else {
      const interval = setInterval(() => {
        if ((window as any).Jupiter) {
          initJupiter()
          clearInterval(interval)
        }
      }, 500)
      return () => clearInterval(interval)
    }
  }, [])

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Token Swap"
        description="Exchange any Solana tokens directly inside your browser."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side Info Panel */}
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-brand-600" />
                About Jupiter Swap
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                Jupiter is the leading liquidity aggregator on Solana, offering the best trade routing, lowest slippage, and access to all token markets.
              </p>
              <div className="p-3 bg-muted/40 rounded-lg flex gap-2 text-xs">
                <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground mb-0.5">Need SOL for Entry Fees?</p>
                  <p>Swap your USDC, BONK, or other tokens directly into SOL to pay tournament registration fees.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Network Status
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Solana Network</span>
                <span className="text-brand-700 capitalize">Devnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connected Wallet</span>
                <span className="truncate max-w-[120px] font-mono">
                  {address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Disconnected'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side Jupiter Embed */}
        <div className="md:col-span-2">
          <Card className="border bg-card">
            <CardContent className="p-4 flex justify-center items-center">
              <div id="integrated-terminal" className="w-full h-[600px] max-w-[420px]" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
