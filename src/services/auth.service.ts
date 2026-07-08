import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export interface SignUpData {
  email: string
  password: string
  username: string
  role: 'player' | 'organizer'
}

export interface SignInData {
  email: string
  password: string
}

export const authService = {
  async signUp({ email, password, username, role }: SignUpData) {
    console.log('[authService.signUp] → starting', { email, username, role })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, role },
      },
    })

    console.log('[authService.signUp] ← raw response', { data, error })

    if (error) {
      console.error('[authService.signUp] ❌ SUPABASE ERROR:', error.message, error)
      throw error
    }

    if (!data.user) {
      console.warn('[authService.signUp] ⚠️ No user returned — this email may already be registered or email confirmation is blocking creation')
    } else {
      console.log('[authService.signUp] ✅ user created, id:', data.user.id)
      console.log('[authService.signUp] session present?', !!data.session)
      if (!data.session) {
        console.warn('[authService.signUp] ⚠️ session is NULL → email confirmation is still ON in Supabase')
        console.warn('   Fix: Supabase Dashboard → Authentication → Providers → Email → toggle "Confirm email" OFF → Save')
      }
    }

    return data
  },

  async signIn({ email, password }: SignInData) {
    console.log('[authService.signIn] → starting', { email })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    console.log('[authService.signIn] ← raw response', { data, error })
    if (error) {
      console.error('[authService.signIn] ❌ SUPABASE ERROR:', error.message, error)
      throw error
    }
    console.log('[authService.signIn] ✅ session user id:', data.session?.user?.id)
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) throw error
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  async getProfile(userId: string): Promise<Profile | null> {
    console.log('[authService.getProfile] → fetching profile for user id:', userId)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[authService.getProfile] ❌ ERROR:', error.message, error)
      if (error.message.includes('does not exist') || error.code === '42P01') {
        console.error('   ☝️ The "profiles" table does not exist.')
        console.error('   Fix: Go to Supabase SQL Editor → paste supabase/migrations/001_initial_schema.sql → Run')
      }
      if (error.code === 'PGRST116') {
        console.warn('   ☝️ Profile row not found for this user. The DB trigger may not have fired.')
        console.warn('   Fix: Make sure the SQL migration was run BEFORE registering any users.')
      }
      return null
    }

    console.log('[authService.getProfile] ✅ profile loaded:', data)
    return data as Profile
  },

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data as Profile
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback)
  },
}
