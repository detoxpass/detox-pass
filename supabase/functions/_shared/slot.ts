export function datesToQuery(startsAt: string): string[] {
  const dates = new Set<string>()
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(startsAt)?.[1]
  if (prefix) dates.add(prefix)
  const parsed = Date.parse(startsAt)
  if (Number.isFinite(parsed)) dates.add(new Date(parsed).toISOString().slice(0, 10))
  return [...dates]
}

export function slotIsOpen(payloads: unknown[], startsAt: string): boolean {
  const target = Date.parse(startsAt)
  if (!Number.isFinite(target)) return false
  for (const payload of payloads) {
    if (!Array.isArray(payload)) continue
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue
      const time = (item as { time?: unknown }).time
      if (typeof time !== 'string') continue
      if (Date.parse(time) === target) return true
    }
  }
  return false
}
