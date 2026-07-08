import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Wallet, Shield, Bell } from 'lucide-react'
import { useAuthContext } from '@/app/auth-context'
import { useSolanaWallet } from '@/hooks/use-wallet'
import { authService } from '@/services/auth.service'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { WalletBadge } from '@/components/shared/wallet-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { truncateAddress } from '@/lib/utils'

const profileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  avatar: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})
type ProfileForm = z.infer<typeof profileSchema>

const passwordSchema = z.object({
  newPassword: z.string().min(8),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
})
type PasswordForm = z.infer<typeof passwordSchema>

export function SettingsPage() {
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') ?? 'profile'
  const { profile, user, refreshProfile } = useAuthContext()
  const { connected, address } = useSolanaWallet()
  const queryClient = useQueryClient()

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: profile?.username ?? '', avatar: profile?.avatar ?? '' },
  })

  useEffect(() => {
    if (profile) {
      profileForm.reset({ username: profile.username, avatar: profile.avatar ?? '' })
    }
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      authService.updateProfile(user!.id, { username: data.username, avatar: data.avatar || null }),
    onSuccess: () => {
      toast({ title: 'Profile updated successfully' })
      refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  const saveWalletMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      authService.updateProfile(user!.id, { wallet_address: walletAddress }),
    onSuccess: () => {
      toast({ title: 'Wallet linked to your account' })
      refreshProfile()
    },
    onError: (err) => toast({ title: 'Failed to save wallet', description: (err as Error).message, variant: 'destructive' }),
  })

  const updatePasswordMutation = useMutation({
    mutationFn: ({ newPassword }: PasswordForm) => authService.updatePassword(newPassword),
    onSuccess: () => {
      toast({ title: 'Password updated' })
      passwordForm.reset()
    },
    onError: (err) => toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Settings" description="Manage your account preferences" />

      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="wallet" className="gap-2"><Wallet className="h-4 w-4" />Wallet</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />Security</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />Notifications</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your public profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar preview */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profileForm.watch('avatar') || profile?.avatar || undefined} />
                  <AvatarFallback className="text-xl font-bold bg-brand/20 text-brand-700">
                    {profile?.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{profile?.username}</p>
                  <p className="text-sm text-muted-foreground capitalize">{profile?.role}</p>
                </div>
              </div>

              <form onSubmit={profileForm.handleSubmit((d) => updateProfileMutation.mutate(d))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input {...profileForm.register('username')} />
                  {profileForm.formState.errors.username && (
                    <p className="text-xs text-destructive">{profileForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Avatar URL</Label>
                  <Input placeholder="https://example.com/avatar.jpg" {...profileForm.register('avatar')} />
                  {profileForm.formState.errors.avatar && (
                    <p className="text-xs text-destructive">{profileForm.formState.errors.avatar.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={user?.email ?? ''} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <Button type="submit" loading={updateProfileMutation.isPending}>
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet Tab */}
        <TabsContent value="wallet" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Phantom Wallet</CardTitle>
              <CardDescription>Connect your Solana wallet to join tournaments and receive prizes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium text-sm">Wallet Status</p>
                  <WalletBadge address={address ?? profile?.wallet_address} showAddress />
                </div>
                <WalletMultiButton style={{
                  background: connected ? 'transparent' : '#9FD347',
                  color: connected ? 'hsl(var(--foreground))' : '#111827',
                  border: connected ? '1px solid hsl(var(--border))' : 'none',
                  borderRadius: '6px',
                  height: '36px',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '0 14px',
                }} />
              </div>

              {connected && address && (
                <>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">Address</span>
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {truncateAddress(address, 8)}
                      </code>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium">Solana Devnet</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted-foreground">Linked to account</span>
                      <span className="font-medium">{profile?.wallet_address === address ? '✓ Yes' : '✗ No'}</span>
                    </div>
                  </div>
                  {profile?.wallet_address !== address && (
                    <Button
                      onClick={() => saveWalletMutation.mutate(address)}
                      loading={saveWalletMutation.isPending}
                    >
                      Link This Wallet to Account
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About Blockchain Payments</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>ChainArena uses Solana to handle tournament entry fees and prize distributions transparently.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>All payments are recorded on-chain</li>
                <li>Transaction signatures are publicly verifiable</li>
                <li>No fake payment screenshots — everything is on Solana</li>
                <li>Prizes are distributed directly to your wallet</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit((d) => updatePasswordMutation.mutate(d))} className="space-y-4 max-w-sm">
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input type="password" placeholder="Min. 8 characters" {...passwordForm.register('newPassword')} />
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input type="password" placeholder="Repeat password" {...passwordForm.register('confirmPassword')} />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
                <Button type="submit" loading={updatePasswordMutation.isPending}>
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what you want to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Tournament registration open', description: 'When new tournaments open for registration', defaultChecked: true },
                { label: 'Match scheduled', description: 'When your match is scheduled', defaultChecked: true },
                { label: 'Payment verified', description: 'When your entry payment is confirmed', defaultChecked: true },
                { label: 'Prize distributed', description: 'When you receive prize money', defaultChecked: true },
                { label: 'Marketing updates', description: 'News, events and announcements', defaultChecked: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch defaultChecked={item.defaultChecked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
