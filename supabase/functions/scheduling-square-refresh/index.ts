import { refreshDueSquareTokens } from '../_shared/square_account.ts'
import { signaturesMatch } from '../_shared/square.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'use POST' }, { status: 405 })
  const expected = Deno.env.get('SQUARE_REFRESH_SECRET')?.trim() ?? ''
  const received = req.headers.get('x-square-refresh') ?? ''
  if (!expected || !signaturesMatch(expected, received)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 })
  }
  const result = await refreshDueSquareTokens()
  return Response.json({ ...result, homologated: false })
})
