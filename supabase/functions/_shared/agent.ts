export const TOOL_LIMIT = 4
export const RESULT_BYTES = 12 * 1024
export const AUDIO_BYTES = 2 * 1024 * 1024
export const AUDIO_SECONDS = 60
export const SEARCH_LIMIT = 8
export const TEXT_LIMIT = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

const CLINICAL = [/\bdiagnos(?:is|e)\b/i, /\btreatment plan\b/i, /\bmedical advice\b/i]

export const BLOCK_TYPES = new Set([
  'text',
  'user',
  'professional_cards',
  'professional_detail',
  'choice',
  'openings',
  'booking_receipt',
  'account',
  'empty',
  'pending',
  'error',
  'limit',
])

export type SearchFilters = {
  query: string
  serviceIds: string[]
  cityIds: string[]
  specialtyIds: string[]
}

export type CatalogTerm = { id: string; name: string; slug?: string }

export type RankPerson = {
  name: string
  active: boolean
  serviceIds: string[]
  cityIds: string[]
  specialtyIds: string[]
}

export function canBook(role: string) {
  return role === 'cliente'
}

export function isClinical(text: string) {
  return CLINICAL.some((pattern) => pattern.test(text))
}

export function clipText(value: string) {
  return value.slice(0, TEXT_LIMIT)
}

export function isUuid(value: string) {
  return UUID.test(value)
}

export function isDay(value: string) {
  return DAY.test(value)
}

export function bindExactTerms(query: string, catalog: { services: CatalogTerm[]; cities: CatalogTerm[]; specialties: CatalogTerm[] }, filters: SearchFilters): SearchFilters {
  const needle = query.trim().toLowerCase()
  if (!needle) return filters
  const next = {
    query: filters.query,
    serviceIds: [...filters.serviceIds],
    cityIds: [...filters.cityIds],
    specialtyIds: [...filters.specialtyIds],
  }
  for (const service of catalog.services) {
    if (service.name.toLowerCase() === needle || service.slug?.toLowerCase() === needle) next.serviceIds.push(service.id)
  }
  for (const city of catalog.cities) {
    if (city.name.toLowerCase() === needle || city.slug?.toLowerCase() === needle) next.cityIds.push(city.id)
  }
  for (const specialty of catalog.specialties) {
    if (specialty.name.toLowerCase() === needle || specialty.slug?.toLowerCase() === needle) next.specialtyIds.push(specialty.id)
  }
  next.serviceIds = unique(next.serviceIds).slice(0, 3)
  next.cityIds = unique(next.cityIds).slice(0, 3)
  next.specialtyIds = unique(next.specialtyIds).slice(0, 3)
  return next
}

export function bindMentionedTerms(query: string, catalog: { services: CatalogTerm[]; cities: CatalogTerm[]; specialties: CatalogTerm[] }, filters: SearchFilters): SearchFilters {
  const next = bindExactTerms(query, catalog, filters)
  const groups: ['services' | 'cities' | 'specialties', 'serviceIds' | 'cityIds' | 'specialtyIds'][] = [
    ['services', 'serviceIds'],
    ['cities', 'cityIds'],
    ['specialties', 'specialtyIds'],
  ]
  for (const [group, key] of groups) {
    for (const term of catalog[group]) {
      if (mentions(query, term.name) || mentions(query, term.slug ?? '')) next[key].push(term.id)
    }
  }
  next.serviceIds = unique(next.serviceIds).slice(0, 3)
  next.cityIds = unique(next.cityIds).slice(0, 3)
  next.specialtyIds = unique(next.specialtyIds).slice(0, 3)
  return next
}

export function leftoverQuery(query: string, catalog: { services: CatalogTerm[]; cities: CatalogTerm[]; specialties: CatalogTerm[] }) {
  let rest = ` ${query} `
  for (const term of [...catalog.services, ...catalog.cities, ...catalog.specialties]) {
    for (const label of [term.name, term.slug ?? '']) {
      if (!mentions(query, label)) continue
      rest = rest.replace(new RegExp(phrase(label), 'ig'), ' ')
    }
  }
  rest = rest.replace(/\b(a|an|and|at|for|in|me|please|the|with)\b/gi, ' ')
  return rest.replace(/\s+/g, ' ').trim()
}

function mentions(query: string, label: string) {
  const needle = label.trim()
  if (needle.length < 3) return false
  return new RegExp(phrase(needle), 'i').test(query)
}

function phrase(label: string) {
  const body = label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return `(^|[^a-z0-9])${body}([^a-z0-9]|$)`
}

export function relaxationSteps(filters: SearchFilters) {
  const steps: { filters: SearchFilters; relaxed: string[] }[] = [{ filters, relaxed: [] }]
  if (filters.specialtyIds.length > 0) {
    steps.push({
      filters: { ...filters, specialtyIds: [] },
      relaxed: ['specialties'],
    })
  }
  if (filters.cityIds.length > 0) {
    const previous = steps[steps.length - 1].filters
    const relaxed = [...steps[steps.length - 1].relaxed]
    if (!relaxed.includes('cities')) relaxed.push('cities')
    steps.push({ filters: { ...previous, cityIds: [] }, relaxed })
  }
  if (filters.query.trim()) {
    const previous = steps[steps.length - 1].filters
    const anchored = previous.serviceIds.length + previous.cityIds.length + previous.specialtyIds.length > 0
    if (anchored) {
      const relaxed = [...steps[steps.length - 1].relaxed]
      if (!relaxed.includes('query')) relaxed.push('query')
      steps.push({ filters: { ...previous, query: '' }, relaxed })
    }
  }
  return steps
}

export function rankTier(person: RankPerson, query: string, filters: SearchFilters) {
  const needle = query.trim().toLowerCase()
  const name = person.name.toLowerCase()
  if (needle && name === needle) return 0
  if (needle && name.includes(needle)) return 1
  const wantsService = filters.serviceIds.length > 0
  const wantsCity = filters.cityIds.length > 0
  const wantsSpecialty = filters.specialtyIds.length > 0
  const hasService = filters.serviceIds.some((id) => person.serviceIds.includes(id))
  const hasCity = filters.cityIds.some((id) => person.cityIds.includes(id))
  const hasSpecialty = filters.specialtyIds.some((id) => person.specialtyIds.includes(id))
  if (wantsService && wantsCity && hasService && hasCity) return 2
  if (wantsService && hasService) return 3
  if (wantsCity && hasCity) return 4
  if (wantsSpecialty && hasSpecialty) return 5
  return 6
}

export function matchProfessionals<T extends RankPerson>(people: T[], query: string, filters: SearchFilters) {
  const needle = query.trim().toLowerCase()
  return people
    .filter((person) => person.active)
    .filter((person) => filters.serviceIds.length === 0 || filters.serviceIds.some((id) => person.serviceIds.includes(id)))
    .filter((person) => filters.cityIds.length === 0 || filters.cityIds.some((id) => person.cityIds.includes(id)))
    .filter((person) => filters.specialtyIds.length === 0 || filters.specialtyIds.some((id) => person.specialtyIds.includes(id)))
    .filter((person) => !needle || person.name.toLowerCase().includes(needle))
    .sort((a, b) => rankTier(a, query, filters) - rankTier(b, query, filters) || a.name.localeCompare(b.name))
    .slice(0, SEARCH_LIMIT)
}

export function selectToolCalls<T>(calls: T[], used: number, max = TOOL_LIMIT) {
  const room = Math.max(0, max - used)
  const run = calls.slice(0, room)
  return { run, limited: calls.length > room, used: used + run.length }
}

export function capToolResult(value: unknown, max = RESULT_BYTES) {
  const raw = JSON.stringify(value)
  if (raw.length <= max) return { result: value, truncated: false }
  return { result: { truncated: true, bytes: raw.length }, truncated: true }
}

export function rejectAudio(input: { bytes: number; mime: string; durationSeconds: number }) {
  const mime = input.mime.split(';')[0].trim().toLowerCase()
  if (mime !== 'audio/webm' && mime !== 'audio/mp4') return 'This recording needs to be a browser audio file.'
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0 || input.durationSeconds > AUDIO_SECONDS) {
    return 'Keep the recording to 60 seconds.'
  }
  if (input.bytes > AUDIO_BYTES) return 'That recording is too large.'
  return ''
}

const SEARCH_KEYS = new Set(['query', 'service_ids', 'city_ids', 'specialty_ids'])
const ACCOUNT_KEYS = new Set(['user_id', 'id', 'profile_id'])
const OPENING_KEYS = new Set(['professional_id', 'service_id', 'city_id', 'date'])

export function parseToolArgs(name: string, raw: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'The tool arguments are not an object.' }
  const record = raw as Record<string, unknown>
  const allowed = name === 'search_professionals'
    ? SEARCH_KEYS
    : name === 'get_openings'
      ? OPENING_KEYS
      : name === 'get_professional'
        ? new Set(['professional_id'])
        : name === 'get_my_account'
          ? ACCOUNT_KEYS
          : null
  if (!allowed) return { ok: false, error: 'Unknown tool.' }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return { ok: false, error: `Unknown argument ${key}.` }
  }
  if (name === 'get_my_account') return { ok: true, args: {} }
  if (name === 'search_professionals') {
    if (record.query != null && typeof record.query !== 'string') return { ok: false, error: 'query must be text.' }
    const words: string[] = []
    for (const key of ['service_ids', 'city_ids', 'specialty_ids']) {
      const value = record[key]
      if (value == null) continue
      const list = Array.isArray(value) ? value : [value]
      const ids: string[] = []
      for (const item of list) {
        if (typeof item !== 'string') return { ok: false, error: `${key} must be ids.` }
        if (isUuid(item)) ids.push(item)
        else if (item.trim()) words.push(item.trim().slice(0, 80))
      }
      if (ids.length > 3) return { ok: false, error: `${key} accepts up to 3 ids.` }
      record[key] = ids
    }
    if (words.length > 0) {
      const query = typeof record.query === 'string' ? record.query.trim() : ''
      record.query = [query, ...words].filter(Boolean).join(' ').slice(0, 80)
    }
  }
  if (name === 'get_professional' || name === 'get_openings') {
    if (typeof record.professional_id !== 'string' || !isUuid(record.professional_id)) {
      return { ok: false, error: 'professional_id must be an id.' }
    }
  }
  if (name === 'get_openings') {
    if (record.service_id != null && (typeof record.service_id !== 'string' || !isUuid(record.service_id))) {
      return { ok: false, error: 'service_id must be an id.' }
    }
    if (record.city_id != null && (typeof record.city_id !== 'string' || !isUuid(record.city_id))) {
      return { ok: false, error: 'city_id must be an id.' }
    }
    if (record.date != null && (typeof record.date !== 'string' || !isDay(record.date))) {
      return { ok: false, error: 'date must be YYYY-MM-DD.' }
    }
  }
  return { ok: true, args: record }
}

export function bookToken(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false as const, error: 'The booking arguments are not an object.' }
  const record = raw as Record<string, unknown>
  if (typeof record.opening_token !== 'string' || !record.opening_token) return { ok: false as const, error: 'opening_token is required.' }
  return { ok: true as const, token: record.opening_token }
}

export type OpeningClaims = {
  user_id: string
  professional_id: string
  service_id: string
  city_id: string
  starts_at: string
  exp: number
}

export async function signOpening(secret: string, claims: OpeningClaims) {
  const payload = canonical(claims)
  const signature = await hmac(secret, payload)
  return `${encode(payload)}.${encode(signature)}`
}

export async function readOpening(secret: string, token: string, now = Date.now()): Promise<OpeningClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const payload = decodeText(parts[0])
  const signature = decode(parts[1])
  if (!payload || !signature) return null
  const expected = await hmac(secret, payload)
  if (expected.length !== signature.length) return null
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) diff |= expected[index] ^ signature[index]
  if (diff !== 0) return null
  try {
    const claims = JSON.parse(payload) as OpeningClaims
    if (!claims.exp || claims.exp * 1000 <= now) return null
    if (![claims.user_id, claims.professional_id, claims.service_id, claims.city_id].every(isUuid)) return null
    if (!claims.starts_at) return null
    return claims
  } catch {
    return null
  }
}

export function sanitizeBlocks(blocks: unknown) {
  const hidden = { type: 'error', text: 'This reply could not be shown.' }
  if (!Array.isArray(blocks)) return [hidden]
  return blocks.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return hidden
    const type = (block as { type?: unknown }).type
    if (typeof type !== 'string' || !BLOCK_TYPES.has(type)) return hidden
    return block as { type: string; text?: string }
  })
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function canonical(claims: OpeningClaims) {
  return JSON.stringify({
    city_id: claims.city_id,
    exp: claims.exp,
    professional_id: claims.professional_id,
    service_id: claims.service_id,
    starts_at: claims.starts_at,
    user_id: claims.user_id,
  })
}

function encode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function decodeText(value: string) {
  const bytes = decode(value)
  if (!bytes) return null
  return new TextDecoder().decode(bytes)
}

function decode(value: string) {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const binary = atob(padded)
    return new Uint8Array([...binary].map((char) => char.charCodeAt(0)))
  } catch {
    return null
  }
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return new Uint8Array(signed)
}
