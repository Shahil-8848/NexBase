import { type ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
  iconBg?: string
  loading?: boolean
}

export function StatCard({ label, value, change, trend, icon, iconBg, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {change && (
              <p
                className={cn(
                  'text-xs font-medium flex items-center gap-1',
                  trend === 'up' && 'text-green-600',
                  trend === 'down' && 'text-red-500',
                  trend === 'neutral' && 'text-muted-foreground'
                )}
              >
                {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3" />}
                {trend === 'neutral' && <Minus className="h-3 w-3" />}
                {change}
              </p>
            )}
          </div>
          {icon && (
            <div className={cn('p-2 rounded-lg', iconBg ?? 'bg-muted')}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
