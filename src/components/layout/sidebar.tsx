import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Trophy,
  BarChart3,
  Receipt,
  Settings,
  Sword,
  PlusCircle,
  ChevronRight,
  ArrowLeftRight,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthContext } from '@/app/auth-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import logoImg from '@/assets/NexBaseLogo.png'

const playerNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/swap', label: 'Token Swap', icon: ArrowLeftRight },
  { to: '/teams', label: 'Teams', icon: Users },
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
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { profile, isOrganizer } = useAuthContext()
  const location = useLocation()
  const navItems = isOrganizer ? organizerNav : playerNav

  return (
    <aside className="hidden lg:flex w-60 flex-col border-r bg-card h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b">
        <img src={logoImg} alt="NexBase Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
        <span className="font-bold text-lg tracking-tight font-display text-foreground">NexBase</span>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(to)

            return (
              <NavLink
                key={to}
                to={to}
                id={`tour-${label.toLowerCase().replace(/\s+/g, '-')}-link`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all relative',
                  isActive
                    ? 'bg-secondary text-primary font-semibold border-l-2 border-primary pl-2.5 rounded-l-none'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60 text-primary" />}
              </NavLink>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Profile footer */}
      <div className="border-t px-4 py-3">
        {profile && (
          <NavLink
            to={`/profile/${profile.id}`}
            className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {profile.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile.username}</p>
              <p className="text-xs text-muted-foreground truncate capitalize">{profile.role}</p>
            </div>
            {isOrganizer && (
              <Badge variant="destructive" className="text-[10px] uppercase font-bold shrink-0 bg-primary/20 text-primary hover:bg-primary/20 border-none px-1.5 py-0.5">Pro</Badge>
            )}
          </NavLink>
        )}
      </div>
    </aside>
  )
}
