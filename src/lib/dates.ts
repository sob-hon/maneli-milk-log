const pad = (value: number) => String(value).padStart(2, '0')

export const dayKey = (date: Date | string) => {
  const value = typeof date === 'string' ? new Date(date) : date
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export const toDateTimeInput = (date: Date | string) => {
  const value = typeof date === 'string' ? new Date(date) : date
  return `${dayKey(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

export const fromDateTimeInput = (value: string) => new Date(value).toISOString()

export const formatDayTitle = (date: Date) => {
  const today = dayKey(new Date())
  const yesterday = dayKey(addDays(new Date(), -1))
  const key = dayKey(date)
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

export const formatTime = (date: Date | string) =>
  new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date)

export const formatShortDay = (date: Date) =>
  new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date).slice(0, 2)

export const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat('en', { month: 'short' }).format(date)

export const isSameLocalDay = (a: Date | string, b: Date | string) =>
  dayKey(a) === dayKey(b)

export const minutesSince = (date: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000))

export const formatElapsed = (date?: string) => {
  if (!date) return 'No feeds yet'
  const minutes = minutesSince(date)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours < 24) return `${hours}h ${remainder}m ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

