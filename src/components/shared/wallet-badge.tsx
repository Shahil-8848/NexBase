import { CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { truncateAddress } from '@/lib/utils'

interface WalletBadgeProps {
  address?: string | null
  showAddress?: boolean
}

export function WalletBadge({ address, showAddress = false }: WalletBadgeProps) {
  if (!address) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <XCircle className="h-3 w-3 text-muted-foreground" />
        No Wallet
      </Badge>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="success" className="gap-1 text-xs cursor-default">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            {showAddress ? truncateAddress(address) : 'Wallet Verified'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs">{address}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
