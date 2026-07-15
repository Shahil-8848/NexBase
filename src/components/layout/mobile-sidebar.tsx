import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, BarChart3, Receipt,
  Settings, Sword, PlusCircle, X, ArrowLeftRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthContext } from '@/app/auth-context'
import { Button } from '@/components/ui/button'
import logoImg from '@/assets/NexBaseLogo.png'

interface MobileSidebarProps {
  open: boolean
  onClose: () => void
}

const playerNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/swap', label: 'Token Swap', icon: ArrowLeftRight },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const organizerNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/organizer', label: 'My Tournaments', icon: Sword },
  { to: '/organizer/create', label: 'Create Tournament', icon: PlusCircle },
  { to: '/tournaments', label: 'Browse', icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/swap', label: 'Token Swap', icon: ArrowLeftRight },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const { isOrganizer } = useAuthContext()
  const location = useLocation()
  const navItems = isOrganizer ? organizerNav : playerNav

  // Close on route change
  useEffect(() => { onClose() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col lg:hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="NexBase Logo" className="w-7 h-7 rounded-lg object-cover shadow-sm" />
            <span className="font-bold tracking-tight font-display text-foreground">NexBase</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(to)

            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all relative',
                  isActive
                    ? 'bg-secondary text-primary font-semibold border-l-2 border-primary pl-2.5 rounded-l-none'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </>
  )
}
