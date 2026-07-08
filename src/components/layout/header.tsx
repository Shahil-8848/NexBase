import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, LogOut, User, Settings, Wallet, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuthContext } from '@/app/auth-context'
import { authService } from '@/services/auth.service'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { truncateAddress } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

interface HeaderProps {
  onMenuToggle?: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const navigate = useNavigate()
  const { profile, user, refreshProfile } = useAuthContext()
  const { connected, address, disconnect } = useSolanaWallet()

  useEffect(() => {
    if (profile && connected && address && profile.wallet_address !== address) {
      console.log('Auto-linking connected wallet to user profile:', address)
      authService.updateProfile(profile.id, { wallet_address: address })
        .then(() => {
          refreshProfile()
        })
        .catch((err) => {
          console.error('Failed to auto-link wallet:', err)
        })
    }
  }, [profile, connected, address, refreshProfile])

  const handleSignOut = async () => {
    try {
      if (connected) {
        await disconnect()
      }
      await authService.signOut()
      navigate('/auth/login')
    } catch {
      toast({ title: 'Error signing out', variant: 'destructive' })
    }
  }

  return (
    <header className="h-14 border-b bg-card flex items-center px-4 gap-4 shrink-0">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Wallet status */}
        {connected && address ? (
          <Badge variant="success" className="hidden sm:flex items-center gap-1.5 px-3 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {truncateAddress(address)}
          </Badge>
        ) : (
          <div className="hidden sm:block">
            <WalletMultiButton
              style={{
                background: 'transparent',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                borderRadius: '6px',
                height: '36px',
                fontSize: '13px',
                fontWeight: 500,
                padding: '0 12px',
              }}
            />
          </div>
        )}

        {/* Notifications placeholder */}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar ?? undefined} />
                <AvatarFallback className="bg-brand/20 text-brand-700 text-xs font-bold">
                  {profile?.username?.slice(0, 2).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="font-medium">{profile?.username}</p>
              <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/profile/${profile?.id}`)}>
              <User className="mr-2 h-4 w-4" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings?tab=wallet')}>
              <Wallet className="mr-2 h-4 w-4" />
              Wallet
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
