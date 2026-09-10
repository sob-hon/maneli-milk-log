export type SyncState = 'synced' | 'pending' | 'failed' | 'local'

export interface Feeding {
  id: string
  household_id: string
  baby_id: string
  amount_ml: number
  fed_at: string
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_state: SyncState
}

export interface FeedingInput {
  amountMl: number
  fedAt: string
}

export type PendingOperation = {
  id: string
  feedingId: string
  type: 'upsert' | 'delete'
  payload: Feeding
  createdAt: string
  attempts: number
}

export type AppTab = 'today' | 'history' | 'insights' | 'settings'
export type InsightRange = 'week' | 'month' | 'year'

export interface HouseholdContext {
  householdId: string
  babyId: string
  babyName: string
  userId: string
  email?: string
  mode: 'local' | 'cloud'
}

