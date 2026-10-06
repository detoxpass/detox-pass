const lovedKey = 'detox-pass-loved'

export function readLoved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(lovedKey) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writeLoved(ids: string[]) {
  localStorage.setItem(lovedKey, JSON.stringify(ids))
}
