import { json } from './supabase.ts'

export function notReady(provider: string, detail: string): Response {
  return json({
    provider,
    status: 'pending',
    supported: false,
    detail,
  }, 501)
}
