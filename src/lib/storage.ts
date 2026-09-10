import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Feeding, PendingOperation } from './types'

interface ManeliDatabase extends DBSchema {
  feedings: {
    key: string
    value: Feeding
    indexes: { 'by-fed-at': string }
  }
  operations: {
    key: string
    value: PendingOperation
    indexes: { 'by-created-at': string }
  }
  meta: {
    key: string
    value: { key: string; value: string }
  }
}

let databasePromise: Promise<IDBPDatabase<ManeliDatabase>> | undefined

const database = () => {
  if (!databasePromise) {
    databasePromise = openDB<ManeliDatabase>('maneli-milk-tracker', 1, {
      upgrade(db) {
        const feedings = db.createObjectStore('feedings', { keyPath: 'id' })
        feedings.createIndex('by-fed-at', 'fed_at')
        const operations = db.createObjectStore('operations', { keyPath: 'id' })
        operations.createIndex('by-created-at', 'createdAt')
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }
  return databasePromise
}

export const getStoredFeedings = async () => (await database()).getAll('feedings')

export const putStoredFeeding = async (feeding: Feeding) =>
  (await database()).put('feedings', feeding)

export const putStoredFeedings = async (feedings: Feeding[]) => {
  const db = await database()
  const transaction = db.transaction('feedings', 'readwrite')
  await Promise.all([...feedings.map((feeding) => transaction.store.put(feeding)), transaction.done])
}

export const clearStoredFeedings = async () => (await database()).clear('feedings')

export const getPendingOperations = async () => {
  const operations = await (await database()).getAllFromIndex('operations', 'by-created-at')
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const putPendingOperation = async (operation: PendingOperation) =>
  (await database()).put('operations', operation)

export const deletePendingOperation = async (id: string) =>
  (await database()).delete('operations', id)

export const getMeta = async (key: string) => (await database()).get('meta', key)

export const setMeta = async (key: string, value: string) =>
  (await database()).put('meta', { key, value })

export const clearLocalDatabase = async () => {
  const db = await database()
  const transaction = db.transaction(['feedings', 'operations', 'meta'], 'readwrite')
  await Promise.all([
    transaction.objectStore('feedings').clear(),
    transaction.objectStore('operations').clear(),
    transaction.objectStore('meta').clear(),
    transaction.done,
  ])
}

