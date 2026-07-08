import { useState, useEffect, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { authService } from '@/services/auth.service'
import type { Profile } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  })

  const loadProfile = useCallback(async (userId: string) => {
    console.log('[useAuth.loadProfile] → loading profile for', userId)
    try {
      const profile = await authService.getProfile(userId)
      console.log('[useAuth.loadProfile] ← result:', profile)
      if (!profile) {
        console.warn('[useAuth.loadProfile] ⚠️ profile is null — the DB trigger may not have run, or SQL migration is missing')
      }
      setState((prev) => ({ ...prev, profile, loading: false }))
    } catch (err) {
      console.error('[useAuth.loadProfile] ❌ error loading profile:', err)
      setState((prev) => ({ ...prev, profile: null, loading: false }))
    }
  }, [])

  useEffect(() => {
    let mounted = true
    console.log('[useAuth] → initialising, checking existing session...')

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      console.log('[useAuth] getSession result — session user:', session?.user?.id ?? 'none')

      if (session?.user) {
        setState((prev) => ({ ...prev, session, user: session.user }))
        loadProfile(session.user.id)
      } else {
        console.log('[useAuth] no session → loading false')
        setState((prev) => ({ ...prev, session: null, user: null, profile: null, loading: false }))
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      console.log('[useAuth] onAuthStateChange event:', event, '| user:', session?.user?.id ?? 'none')

      if (session?.user) {
        setState((prev) => ({ ...prev, session, user: session.user, loading: true }))
        loadProfile(session.user.id)
      } else {
        console.log('[useAuth] signed out or no session')
        setState({ session: null, user: null, profile: null, loading: false })
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  return {
    ...state,
    isAuthenticated: !!state.session,
    isOrganizer: state.profile?.role === 'organizer' || state.profile?.role === 'admin',
    isAdmin: state.profile?.role === 'admin',
    refreshProfile: () => {
      if (state.user) loadProfile(state.user.id)
    },
  }
}
