const SECRET_KEYS = [
  'account_number',
  'accountnumber',
  'routing_number',
  'routingnumber',
  'ssn',
  'client_secret',
  'clientsecret',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'client_id',
  'clientid',
]

export function sanitizeText(value: string): string {
  const redacted = value
    .replace(/[0-9]{8,}/g, '[redacted]')
    .replace(/\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g, '[redacted]')
  return redacted.slice(0, 240)
}

export function sanitizeUnknown(value: unknown): string {
  if (typeof value === 'string') return sanitizeText(value)
  try {
    return sanitizeText(JSON.stringify(redact(value)))
  } catch {
    return 'Gusto request failed'
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(item)
  }
  return output
}
