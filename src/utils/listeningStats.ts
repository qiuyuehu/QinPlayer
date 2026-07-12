export interface ListeningDayLike {
  date: string
  seconds: number
}

export interface ListeningTrendDay extends ListeningDayLike {
  ratio: number
}

export interface ListeningSummary {
  totalSeconds: number
  monthSeconds: number
  weekSeconds: number
  todaySeconds: number
  activeDaysThisWeek: number
  activeRatio: number
  streakDays: number
  firstDate: string | null
  lastSevenDays: ListeningTrendDay[]
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function getLocalWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

function shiftLocalDate(date: Date, days: number): Date {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

function normalizeDays(days: readonly ListeningDayLike[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue
    if (!Number.isFinite(day.seconds) || day.seconds <= 0) continue
    result.set(day.date, (result.get(day.date) ?? 0) + day.seconds)
  }
  return result
}

function getStreakDays(activeDates: Set<string>, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let cursor = activeDates.has(formatLocalDate(today)) ? today : shiftLocalDate(today, -1)
  if (!activeDates.has(formatLocalDate(cursor))) return 0

  let streak = 0
  while (activeDates.has(formatLocalDate(cursor))) {
    streak++
    cursor = shiftLocalDate(cursor, -1)
  }
  return streak
}

export function buildListeningSummary(
  days: readonly ListeningDayLike[],
  now: Date = new Date(),
): ListeningSummary {
  const secondsByDate = normalizeDays(days)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayKey = formatLocalDate(today)
  const weekStartKey = formatLocalDate(getLocalWeekStart(today))
  const monthStartKey = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1))

  let totalSeconds = 0
  let monthSeconds = 0
  let weekSeconds = 0
  let activeDaysThisWeek = 0

  for (const [date, seconds] of secondsByDate) {
    totalSeconds += seconds
    if (date >= monthStartKey && date <= todayKey) monthSeconds += seconds
    if (date >= weekStartKey && date <= todayKey) {
      weekSeconds += seconds
      activeDaysThisWeek++
    }
  }

  const rawLastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = formatLocalDate(shiftLocalDate(today, index - 6))
    return { date, seconds: secondsByDate.get(date) ?? 0 }
  })
  const maxSeconds = Math.max(0, ...rawLastSevenDays.map((day) => day.seconds))
  const lastSevenDays = rawLastSevenDays.map((day) => ({
    ...day,
    ratio: maxSeconds > 0 ? day.seconds / maxSeconds : 0,
  }))
  const sortedDates = [...secondsByDate.keys()].sort()

  return {
    totalSeconds,
    monthSeconds,
    weekSeconds,
    todaySeconds: secondsByDate.get(todayKey) ?? 0,
    activeDaysThisWeek,
    activeRatio: Math.max(0, Math.min(1, activeDaysThisWeek / 7)),
    streakDays: getStreakDays(new Set(secondsByDate.keys()), today),
    firstDate: sortedDates[0] ?? null,
    lastSevenDays,
  }
}

export function formatListeningDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (safeSeconds === 0) return '0 分钟'
  if (safeSeconds < 60) return '少于 1 分钟'

  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分钟`
  if (minutes === 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分钟`
}
