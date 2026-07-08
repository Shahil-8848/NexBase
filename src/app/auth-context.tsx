import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '@/hooks/use-auth'
import type { Profile } from '@/types'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  isAuthenticated: boolean
  isOrganizer: boolean
  isAdmin: boolean
  refreshProfile: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
