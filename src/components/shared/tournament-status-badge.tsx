import { Badge } from '@/components/ui/badge'
import type { TournamentStatus, PaymentStatus, MatchStatus } from '@/types'

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  const map: Record<TournamentStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'secondary' },
    registration: { label: 'Registration Open', variant: 'info' },
    active: { label: 'Live', variant: 'success' },
    completed: { label: 'Completed', variant: 'outline' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={variant as Parameters<typeof Badge>[0]['variant']}>{label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
    pending: { label: 'Pending', variant: 'warning' },
    verified: { label: 'Verified', variant: 'success' },
    failed: { label: 'Failed', variant: 'destructive' },
    refunded: { label: 'Refunded', variant: 'secondary' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={variant as Parameters<typeof Badge>[0]['variant']}>{label}</Badge>
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
    pending: { label: 'Upcoming', variant: 'secondary' },
    active: { label: 'Live', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={variant as Parameters<typeof Badge>[0]['variant']}>{label}</Badge>
}
