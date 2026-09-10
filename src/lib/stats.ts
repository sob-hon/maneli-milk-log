import { addDays, dayKey, formatMonth, formatShortDay, startOfDay } from './dates'
import type { Feeding, InsightRange } from './types'

export interface ChartBucket {
  key: string
  label: string
  amount: number
}

export interface InsightSummary {
  buckets: ChartBucket[]
  total: number
  count: number
  average: number
  periodLabel: string
}

export const activeFeedings = (feedings: Feeding[]) =>
  feedings
    .filter((feeding) => !feeding.deleted_at)
    .sort((a, b) => new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime())

export const feedingsForDay = (feedings: Feeding[], date: Date) =>
  activeFeedings(feedings).filter((feeding) => dayKey(feeding.fed_at) === dayKey(date))

export const totalAmount = (feedings: Feeding[]) =>
  activeFeedings(feedings).reduce((sum, feeding) => sum + feeding.amount_ml, 0)

const sumForKey = (feedings: Feeding[], key: string) =>
  feedings
    .filter((feeding) => dayKey(feeding.fed_at) === key)
    .reduce((sum, feeding) => sum + feeding.amount_ml, 0)

export const buildInsights = (
  feedings: Feeding[],
  range: InsightRange,
  now = new Date(),
): InsightSummary => {
  const active = activeFeedings(feedings)
  let buckets: ChartBucket[] = []
  let daysInPeriod = 1
  let periodLabel = ''

  if (range === 'week') {
    const first = addDays(startOfDay(now), -6)
    buckets = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(first, index)
      return {
        key: dayKey(date),
        label: formatShortDay(date),
        amount: sumForKey(active, dayKey(date)),
      }
    })
    daysInPeriod = 7
    periodLabel = 'Last 7 days'
  }

  if (range === 'month') {
    const elapsedDays = now.getDate()
    buckets = Array.from({ length: elapsedDays }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), index + 1)
      return {
        key: dayKey(date),
        label: String(index + 1),
        amount: sumForKey(active, dayKey(date)),
      }
    })
    daysInPeriod = elapsedDays
    periodLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now)
  }

  if (range === 'year') {
    const elapsedMonths = now.getMonth() + 1
    buckets = Array.from({ length: elapsedMonths }, (_, month) => {
      const monthDate = new Date(now.getFullYear(), month, 1)
      const amount = active
        .filter((feeding) => {
          const date = new Date(feeding.fed_at)
          return date.getFullYear() === now.getFullYear() && date.getMonth() === month
        })
        .reduce((sum, feeding) => sum + feeding.amount_ml, 0)
      return { key: `${now.getFullYear()}-${month}`, label: formatMonth(monthDate), amount }
    })
    const yearStart = new Date(now.getFullYear(), 0, 1)
    daysInPeriod = Math.floor((startOfDay(now).getTime() - yearStart.getTime()) / 86_400_000) + 1
    periodLabel = String(now.getFullYear())
  }

  const keys = new Set(buckets.map((bucket) => bucket.key))
  const inPeriod = range === 'year'
    ? active.filter((feeding) => new Date(feeding.fed_at).getFullYear() === now.getFullYear())
    : active.filter((feeding) => keys.has(dayKey(feeding.fed_at)))
  const total = inPeriod.reduce((sum, feeding) => sum + feeding.amount_ml, 0)

  return {
    buckets,
    total,
    count: inPeriod.length,
    average: Math.round(total / Math.max(1, daysInPeriod)),
    periodLabel,
  }
}

