import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { addDays } from '../lib/dates'
import {
  deletePendingOperation,
  getMeta,
  getPendingOperations,
  getStoredFeedings,
  putPendingOperation,
  putStoredFeeding,
  putStoredFeedings,
  setMeta,
} from '../lib/storage'
import { supabase } from '../lib/supabase'
import type { Feeding, FeedingInput, HouseholdContext, PendingOperation, SyncState } from '../lib/types'
import { createId } from '../lib/uuid'

export const localContext: HouseholdContext = {
  householdId: 'local-household',
  babyId: 'maneli',
  babyName: 'Maneli',
  userId: 'local-parent',
  mode: 'local',
}

const makeDemoFeedings = (): Feeding[] => {
  const now = new Date()
  const amounts = [90, 110, 100, 120, 90]
  return amounts.map((amount, index) => {
    const fedAt = new Date(now)
    fedAt.setHours(6 + index * 3, index % 2 ? 20 : 5, 0, 0)
    if (fedAt > now) fedAt.setDate(fedAt.getDate() - 1)
    const stamp = fedAt.toISOString()
    return {
      id: createId(),
      household_id: localContext.householdId,
      baby_id: localContext.babyId,
      amount_ml: amount,
      fed_at: stamp,
      created_by: localContext.userId,
      created_at: stamp,
      updated_at: stamp,
      deleted_at: null,
      sync_state: 'local',
    }
  })
}

const fromCloudRow = (row: Record<string, unknown>): Feeding => ({
  id: String(row.id),
  household_id: String(row.household_id),
  baby_id: String(row.baby_id),
  amount_ml: Number(row.amount_ml),
  fed_at: String(row.fed_at),
  created_by: String(row.created_by),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  sync_state: 'synced',
})

const cloudPayload = (feeding: Feeding) => ({
  id: feeding.id,
  household_id: feeding.household_id,
  baby_id: feeding.baby_id,
  amount_ml: feeding.amount_ml,
  fed_at: feeding.fed_at,
  created_by: feeding.created_by,
  created_at: feeding.created_at,
  updated_at: feeding.updated_at,
  deleted_at: feeding.deleted_at,
})

export function useFeedings(context: HouseholdContext | null) {
  const activeContext = context ?? localContext
  const [feedings, setFeedings] = useState<Feeding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncState, setSyncState] = useState<SyncState>(context?.mode === 'cloud' ? 'synced' : 'local')
  const [syncError, setSyncError] = useState<string | null>(null)
  const flushing = useRef(false)

  const replaceFeeding = useCallback((feeding: Feeding) => {
    setFeedings((current) => {
      const exists = current.some((item) => item.id === feeding.id)
      return exists
        ? current.map((item) => (item.id === feeding.id ? feeding : item))
        : [...current, feeding]
    })
  }, [])

  const flushQueue = useCallback(async () => {
    if (!supabase || activeContext.mode !== 'cloud' || !navigator.onLine || flushing.current) return
    flushing.current = true
    setSyncState('pending')
    setSyncError(null)
    try {
      const operations = await getPendingOperations()
      for (const operation of operations) {
        const { error } = await supabase.from('feedings').upsert(cloudPayload(operation.payload))
        if (error) {
          await putPendingOperation({ ...operation, attempts: operation.attempts + 1 })
          throw error
        }
        await deletePendingOperation(operation.id)
        const synced = { ...operation.payload, sync_state: 'synced' as const }
        await putStoredFeeding(synced)
        replaceFeeding(synced)
      }
      setSyncState('synced')
    } catch (error) {
      setSyncState('failed')
      setSyncError(error instanceof Error ? error.message : 'Unable to sync changes')
    } finally {
      flushing.current = false
    }
  }, [activeContext.mode, replaceFeeding])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      void flushQueue()
    }
    const handleOffline = () => {
      setIsOnline(false)
      if (activeContext.mode === 'cloud') setSyncState('pending')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [activeContext.mode, flushQueue])

  useEffect(() => {
    let cancelled = false
    let channel: RealtimeChannel | null = null

    const load = async () => {
      setIsLoading(true)
      let stored = (await getStoredFeedings()).filter(
        (feeding) => feeding.household_id === activeContext.householdId,
      )

      if (activeContext.mode === 'local') {
        const seeded = await getMeta('demo-seeded')
        if (!seeded && stored.length === 0) {
          stored = makeDemoFeedings()
          await putStoredFeedings(stored)
          await setMeta('demo-seeded', 'true')
        }
      }

      if (!cancelled) setFeedings(stored)

      if (supabase && activeContext.mode === 'cloud' && navigator.onLine) {
        const earliest = addDays(new Date(), -370).toISOString()
        const { data, error } = await supabase
          .from('feedings')
          .select('*')
          .eq('household_id', activeContext.householdId)
          .gte('fed_at', earliest)

        if (!error && data) {
          const cloudFeedings = data.map((row) => fromCloudRow(row as Record<string, unknown>))
          await putStoredFeedings(cloudFeedings)
          if (!cancelled) setFeedings(cloudFeedings)
        } else if (error) {
          setSyncState('failed')
          setSyncError(error.message)
        }

        channel = supabase
          .channel(`feedings:${activeContext.householdId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'feedings',
              filter: `household_id=eq.${activeContext.householdId}`,
            },
            (payload) => {
              if (!payload.new || !('id' in payload.new)) return
              const feeding = fromCloudRow(payload.new as Record<string, unknown>)
              void putStoredFeeding(feeding)
              replaceFeeding(feeding)
            },
          )
          .subscribe()

        await flushQueue()
      }

      if (!cancelled) setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [activeContext.householdId, activeContext.mode, flushQueue, replaceFeeding])

  const saveFeeding = useCallback(
    async (input: FeedingInput, existing?: Feeding) => {
      const now = new Date().toISOString()
      const feeding: Feeding = existing
        ? {
            ...existing,
            amount_ml: input.amountMl,
            fed_at: input.fedAt,
            updated_at: now,
            sync_state: activeContext.mode === 'cloud' ? 'pending' : 'local',
          }
        : {
            id: createId(),
            household_id: activeContext.householdId,
            baby_id: activeContext.babyId,
            amount_ml: input.amountMl,
            fed_at: input.fedAt,
            created_by: activeContext.userId,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            sync_state: activeContext.mode === 'cloud' ? 'pending' : 'local',
          }

      await putStoredFeeding(feeding)
      replaceFeeding(feeding)

      if (activeContext.mode === 'cloud') {
        const operation: PendingOperation = {
          id: createId(),
          feedingId: feeding.id,
          type: 'upsert',
          payload: feeding,
          createdAt: now,
          attempts: 0,
        }
        await putPendingOperation(operation)
        setSyncState('pending')
        void flushQueue()
      }
      return feeding
    },
    [activeContext, flushQueue, replaceFeeding],
  )

  const deleteFeeding = useCallback(
    async (feeding: Feeding) => {
      const now = new Date().toISOString()
      const deleted = {
        ...feeding,
        deleted_at: now,
        updated_at: now,
        sync_state: activeContext.mode === 'cloud' ? ('pending' as const) : ('local' as const),
      }
      await putStoredFeeding(deleted)
      replaceFeeding(deleted)
      if (activeContext.mode === 'cloud') {
        await putPendingOperation({
          id: createId(),
          feedingId: feeding.id,
          type: 'delete',
          payload: deleted,
          createdAt: now,
          attempts: 0,
        })
        setSyncState('pending')
        void flushQueue()
      }
    },
    [activeContext.mode, flushQueue, replaceFeeding],
  )

  const visibleFeedings = useMemo(
    () => feedings.filter((feeding) => feeding.household_id === activeContext.householdId),
    [activeContext.householdId, feedings],
  )

  return {
    feedings: visibleFeedings,
    isLoading,
    isOnline,
    syncState,
    syncError,
    saveFeeding,
    deleteFeeding,
    retrySync: flushQueue,
  }
}
