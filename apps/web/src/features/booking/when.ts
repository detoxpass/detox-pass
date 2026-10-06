export function appointmentParts(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: value, time: '', long: value }
  return {
    day: new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date),
    long: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date),
  }
}

export function formatWhen(value: string) {
  const parts = appointmentParts(value)
  return parts.time ? `${parts.day}, ${parts.time}` : parts.day
}

export function formatDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day))
}

export function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

export function formatClock(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatReviewDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export function monthCells(month: string) {
  const [year, raw] = month.split('-').map(Number)
  if (!year || !raw) return []
  const first = new Date(year, raw - 1, 1).getDay()
  const count = new Date(year, raw, 0).getDate()
  const cells: { key: string; date: string | null; day: number | null }[] = []
  for (let index = 0; index < first; index += 1) cells.push({ key: `pad-${index}`, date: null, day: null })
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${String(raw).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key: date, date, day })
  }
  return cells
}

export function monthOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, delta: number) {
  const [year, raw] = month.split('-').map(Number)
  const next = new Date(year, raw - 1 + delta, 1)
  return monthOf(next)
}
