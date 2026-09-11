import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isCloudConfigured, supabase } from '../lib/supabase'
import type { HouseholdContext } from '../lib/types'
import { localContext } from './useFeedings'

export function useCloudContext() {
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<HouseholdContext | null>(
    isCloudConfigured ? null : localContext,
  )
  const [isLoading, setIsLoading] = useState(isCloudConfigured)
  const [error, setError] = useState<string | null>(null)

  const loadHousehold = useCallback(async (currentSession: Session | null) => {
    if (!supabase || !currentSession) {
      setContext(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    const { data: membership, error: membershipError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', currentSession.user.id)
      .maybeSingle()

    if (membershipError) {
      setError(membershipError.message)
      setIsLoading(false)
      return
    }

    if (!membership) {
      setContext(null)
      setIsLoading(false)
      return
    }

    const { data: baby, error: babyError } = await supabase
      .from('babies')
      .select('id, name')
      .eq('household_id', membership.household_id)
      .order('created_at')
      .limit(1)
      .single()

    if (babyError) {
      setError(babyError.message)
      setIsLoading(false)
      return
    }

    setContext({
      householdId: membership.household_id,
      babyId: baby.id,
      babyName: baby.name,
      userId: currentSession.user.id,
      email: currentSession.user.email ?? 'Partner code access · this device only',
      mode: 'cloud',
    })
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      void loadHousehold(data.session)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      window.setTimeout(() => void loadHousehold(nextSession), 0)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [loadHousehold])

  const sendMagicLink = async (email: string) => {
    if (!supabase) return { error: new Error('Cloud sync is not configured') }
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
  }

  const createFamily = async () => {
    if (!supabase) return { error: new Error('Cloud sync is not configured') }
    const result = await supabase.rpc('create_household_and_baby', {
      household_name: "Maneli's family",
      baby_name: 'Maneli',
    })
    if (!result.error) await loadHousehold(session)
    return result
  }

  const joinFamily = async (code: string) => {
    if (!supabase) return { error: new Error('Cloud sync is not configured') }
    const result = await supabase.rpc('join_household_by_code', { invite_code: code })
    if (!result.error) await loadHousehold(session)
    return result
  }

  const joinWithCode = async (code: string) => {
    if (!supabase) return { error: new Error('Cloud sync is not configured') }

    setError(null)
    setIsLoading(true)
    const { data, error: authError } = await supabase.auth.signInAnonymously()

    if (authError || !data.session) {
      const nextError = authError ?? new Error('Unable to start partner access')
      setError(nextError.message)
      setIsLoading(false)
      return { error: nextError }
    }

    const result = await supabase.rpc('join_household_by_code', {
      invite_code: code.trim().toUpperCase(),
    })

    if (result.error) {
      const nextError = new Error(result.error.message)
      await supabase.auth.signOut()
      setSession(null)
      setContext(null)
      setError(nextError.message)
      setIsLoading(false)
      return { error: nextError }
    }

    setSession(data.session)
    await loadHousehold(data.session)
    return { error: null }
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setContext(null)
  }

  return {
    isCloudConfigured,
    isLoading,
    session,
    context,
    error,
    sendMagicLink,
    createFamily,
    joinFamily,
    joinWithCode,
    signOut,
  }
}
