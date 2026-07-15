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
    try {
      const profile = await authService.getProfile(userId)
      setState((prev) => ({ ...prev, profile, loading: false }))
    } catch (err) {
      setState((prev) => ({ ...prev, profile: null, loading: false }))
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return

      if (session?.user) {
        setState((prev) => ({ ...prev, session, user: session.user }))
        loadProfile(session.user.id)
      } else {
        setState((prev) => ({ ...prev, session: null, user: null, profile: null, loading: false }))
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (session?.user) {
        setState((prev) => ({ ...prev, session, user: session.user, loading: true }))
        loadProfile(session.user.id)
      } else {
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
