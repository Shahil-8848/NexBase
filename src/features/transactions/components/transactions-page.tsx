import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Receipt, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react'
import { transactionService } from '@/services/transaction.service'
import { useAuthContext } from '@/app/auth-context'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatSOL, formatRelative } from '@/utils/format'
import type { TransactionType } from '@/types'

const statusVariant = (status: string) => {
  if (status === 'confirmed') return 'success'
  if (status === 'failed') return 'destructive'
  return 'warning'
}

export function TransactionsPage() {
  const { profile } = useAuthContext()
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', profile?.id],
    queryFn: () => transactionService.getUserTransactions(profile!.id),
    enabled: !!profile?.id,
  })

  const isOrganizer = profile?.role === 'organizer' || profile?.role === 'admin'

  const filtered = (transactions ?? []).filter(
    (t) => typeFilter === 'all' || t.type === typeFilter
  )

  const totalIn = (transactions ?? [])
    .filter((t) => (isOrganizer ? t.type === 'entry_fee' : t.type === 'prize') && t.status === 'confirmed')
    .reduce((s, t) => s + Number(t.amount), 0)

  const totalOut = (transactions ?? [])
    .filter((t) => (isOrganizer ? t.type === 'prize' : t.type === 'entry_fee') && t.status === 'confirmed')
    .reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Your complete on-chain transaction history"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50">
              <ArrowDownRight className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isOrganizer ? 'Total Revenue' : 'Total Earned'}
              </p>
              <p className="text-lg font-bold text-green-600">{formatSOL(totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <ArrowUpRight className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isOrganizer ? 'Prizes Paid' : 'Total Spent'}
              </p>
              <p className="text-lg font-bold">{formatSOL(totalOut)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Transactions</p>
              <p className="text-lg font-bold">{transactions?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TransactionType | 'all')}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="entry_fee">Entry Fees</SelectItem>
            <SelectItem value="prize">Prizes</SelectItem>
            <SelectItem value="refund">Refunds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 border-b">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        ) : !filtered.length ? (
          <CardContent className="p-0">
            <EmptyState
              icon={<Receipt className="h-10 w-10" />}
              title="No transactions found"
              description="Your on-chain transactions will appear here once you join tournaments"
            />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-6 py-3 text-xs text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-6 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">Tournament</th>
                  <th className="text-right px-6 py-3 text-xs text-muted-foreground font-medium">Amount</th>
                  <th className="text-center px-6 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Status</th>
                  <th className="text-right px-6 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Date</th>
                  <th className="text-right px-6 py-3 text-xs text-muted-foreground font-medium">Explorer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const isIncoming =
                    (tx.type === 'prize' && !isOrganizer) ||
                    (tx.type === 'entry_fee' && isOrganizer)
                  return (
                    <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                            tx.type === 'prize' ? 'bg-green-100' :
                            tx.type === 'refund' ? 'bg-amber-100' : 'bg-blue-100'
                          }`}>
                            {tx.type === 'prize' ? '🏆' : tx.type === 'refund' ? '↩️' : '💸'}
                          </div>
                          <div>
                            <p className="font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                            <p className="text-xs text-muted-foreground font-mono hidden sm:block">
                              {tx.signature.slice(0, 12)}...
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 hidden sm:table-cell">
                        <p className="text-sm text-muted-foreground truncate max-w-[160px]">
                          {tx.tournament?.title ?? '—'}
                        </p>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`font-semibold ${isIncoming ? 'text-green-600' : ''}`}>
                          {isIncoming ? '+' : '-'}{formatSOL(Number(tx.amount))}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center hidden md:table-cell">
                        <Badge variant={statusVariant(tx.status) as Parameters<typeof Badge>[0]['variant']}>
                          {tx.status === 'pending' ? (
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tx.status}</span>
                          ) : tx.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground text-xs hidden lg:table-cell">
                        {formatRelative(tx.created_at)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <a
                          href={tx.explorer_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">View</span>
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
