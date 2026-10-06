import { exchangeSquareCode, grantSquare } from '../_shared/square_account.ts'
import { readOAuthState, squareReturnUrl } from '../_shared/square.ts'

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Use GET', { status: 405, headers: { 'cache-control': 'no-store' } })
  }
  const incoming = new URL(req.url)
  const stateSecret = Deno.env.get('SQUARE_OAUTH_STATE_SECRET')?.trim() ?? ''
  const state = await readOAuthState(stateSecret, incoming.searchParams.get('state') ?? '')
  const back = (result: string) => squareReturnUrl(state?.surface ?? 'agenda', state?.professionalId ?? '', result)
  if (!state) return page(back('error'))
  const error = incoming.searchParams.get('error')
  if (error === 'access_denied') return page(back('denied'))
  if (error) return page(back('error'))
  const code = incoming.searchParams.get('code')?.trim() ?? ''
  if (!code) return page(back('error'))

  const exchanged = await exchangeSquareCode(state.environment, code)
  if (!exchanged.ok) return page(back('error'))
  const granted = await grantSquare({
    professionalId: state.professionalId,
    environment: state.environment,
    accessToken: exchanged.accessToken,
    refreshToken: exchanged.refreshToken,
    expiresAt: exchanged.expiresAt,
    merchantId: exchanged.merchantId,
    obtainedVia: 'oauth',
  })
  if (granted.kind === 'connected') return page(back('connected'))
  if (granted.kind === 'choose') return page(back('choose'))
  if (granted.kind === 'incomplete') return page(back('incomplete'))
  return page(back('error'))
})

function page(location: string) {
  const safe = JSON.stringify(location)
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Detox Pass</title><p>Returning to Detox Pass.</p><p><a href=${safe}>Continue</a></p><script>location.replace(${safe})</script>`
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
