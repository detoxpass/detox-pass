import {
  AUDIO_BYTES,
  bindExactTerms,
  bindMentionedTerms,
  leftoverQuery,
  bookToken,
  canBook,
  capToolResult,
  isClinical,
  matchProfessionals,
  parseToolArgs,
  rankTier,
  readOpening,
  rejectAudio,
  relaxationSteps,
  sanitizeBlocks,
  selectToolCalls,
  signOpening,
  type RankPerson,
} from './agent.ts'

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
  }
}

const sarah: RankPerson = { name: 'Sarah Anderson', active: true, serviceIds: ['svc-deep'], cityIds: ['city-boston'], specialtyIds: ['spec-massage'] }
const sarahLike: RankPerson = { name: 'Sarah Anderson Boston', active: true, serviceIds: ['svc-sports'], cityIds: ['city-boston'], specialtyIds: [] }
const hidden: RankPerson = { name: 'Sarah Anderson', active: false, serviceIds: ['svc-deep'], cityIds: ['city-boston'], specialtyIds: [] }
const other: RankPerson = { name: 'Michael Chen', active: true, serviceIds: ['svc-sports'], cityIds: ['city-ny'], specialtyIds: [] }

Deno.test('T1 nome exato fica na frente de nome parcial', () => {
  const filters = { query: 'Sarah Anderson', serviceIds: [], cityIds: [], specialtyIds: [] }
  const ranked = matchProfessionals([sarahLike, sarah], 'Sarah Anderson', filters)
  assertEquals(ranked.map((item) => item.name), ['Sarah Anderson', 'Sarah Anderson Boston'], 'ordem')
  if (rankTier(sarah, 'Sarah Anderson', filters) !== 0) throw new Error('exato')
  if (rankTier(sarahLike, 'Sarah Anderson', filters) !== 1) throw new Error('parcial')
})

Deno.test('T2 inativa some mesmo se o texto bater', () => {
  const found = matchProfessionals([hidden, sarah], 'Sarah Anderson', { query: 'Sarah Anderson', serviceIds: [], cityIds: [], specialtyIds: [] })
  assertEquals(found.map((item) => item.name), ['Sarah Anderson'], 'só ativa')
  if (found.some((item) => !item.active)) throw new Error('inativa passou')
})

Deno.test('T3 serviço e cidade juntos excluem quem só tem um', () => {
  const filters = { query: '', serviceIds: ['svc-deep'], cityIds: ['city-boston'], specialtyIds: [] }
  const found = matchProfessionals([sarah, other, { ...other, name: 'Only service', serviceIds: ['svc-deep'], cityIds: ['city-ny'] }], '', filters)
  assertEquals(found.map((item) => item.name), ['Sarah Anderson'], 'interseção')
})

Deno.test('T4 alargamento na ordem especialidade, cidade, texto', () => {
  const steps = relaxationSteps({ query: 'hands', serviceIds: ['svc-deep'], cityIds: ['city-boston'], specialtyIds: ['spec-massage'] })
  assertEquals(steps.map((step) => step.relaxed), [[], ['specialties'], ['specialties', 'cities'], ['specialties', 'cities', 'query']], 'ordem')
})

Deno.test('T5 o serviço pedido sobrevive ao alargamento', () => {
  const steps = relaxationSteps({ query: 'hands', serviceIds: ['svc-deep'], cityIds: ['city-boston'], specialtyIds: ['spec-massage'] })
  if (steps.some((step) => step.filters.serviceIds.length === 0)) throw new Error('serviço saiu')
})

Deno.test('T6 texto clínico sem serviço igual não vira serviço', () => {
  const bound = bindExactTerms('Dor nas costas', {
    services: [{ id: 'svc-deep', name: 'Deep tissue', slug: 'deep-tissue' }],
    cities: [],
    specialties: [],
  }, { query: 'Dor nas costas', serviceIds: [], cityIds: [], specialtyIds: [] })
  assertEquals(bound.serviceIds, [], 'sem serviço')
  const found = matchProfessionals([sarah], 'Dor nas costas', bound)
  assertEquals(found, [], 'vazio')
})

Deno.test('T6b frase de serviço e cidade vira os dois ids', () => {
  const catalog = {
    services: [{ id: 'svc-deep', name: 'Deep tissue', slug: 'deep-tissue' }],
    cities: [{ id: 'city-boston', name: 'Boston', slug: 'boston' }],
    specialties: [],
  }
  const filters = { query: 'Deep tissue in Boston', serviceIds: [], cityIds: [], specialtyIds: [] }
  const bound = bindMentionedTerms(filters.query, catalog, filters)
  assertEquals(bound.serviceIds, ['svc-deep'], 'serviço')
  assertEquals(bound.cityIds, ['city-boston'], 'cidade')
  if (leftoverQuery(filters.query, catalog) !== '') throw new Error('sobrou texto')
  const loose = parseToolArgs('search_professionals', { service_ids: ['Deep tissue'], city_ids: ['Boston'] })
  if (!loose.ok) throw new Error(loose.error)
  if (loose.args.query !== 'Deep tissue Boston') throw new Error('nomes não viraram texto')
})

Deno.test('T6c texto sem âncora não abre o catálogo', () => {
  const steps = relaxationSteps({ query: 'Dor nas costas', serviceIds: [], cityIds: [], specialtyIds: [] })
  if (steps.some((step) => step.filters.query === '')) throw new Error('alargou para vazio')
})

Deno.test('T7 limit acima de 8 volta 8', () => {
  const people = Array.from({ length: 12 }, (_, index) => ({
    name: `Pro ${String(index).padStart(2, '0')}`,
    active: true,
    serviceIds: [],
    cityIds: [],
    specialtyIds: [],
  }))
  if (matchProfessionals(people, '', { query: '', serviceIds: [], cityIds: [], specialtyIds: [] }).length !== 8) {
    throw new Error('passou de 8')
  }
})

Deno.test('T8 id fora do catálogo não apaga o filtro válido no parser', () => {
  const valid = '7b53d55b-4818-466a-a77b-876a3748f6af'
  const parsed = parseToolArgs('search_professionals', { service_ids: [valid], query: 'deep' })
  if (!parsed.ok) throw new Error(parsed.error)
  assertEquals(parsed.args.service_ids, [valid], 'filtro permanece')
})

Deno.test('T9 T10 T11 T12 token de horário', async () => {
  const secret = 'test-secret'
  const claims = {
    user_id: '9c0bc393-9943-4243-8152-ee8b06ec6576',
    professional_id: '7b53d55b-4818-466a-a77b-876a3748f6af',
    service_id: 'd1fd0148-94cd-47b4-a03d-ff587f06c308',
    city_id: '63314e11-ff01-4719-8f06-db28b9924866',
    starts_at: '2026-10-07T13:00:00.000Z',
    exp: Math.floor(Date.now() / 1000) + 600,
  }
  const token = await signOpening(secret, claims)
  const read = await readOpening(secret, token)
  if (!read || read.starts_at !== claims.starts_at) throw new Error('token válido')
  const broken = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
  if (await readOpening(secret, broken)) throw new Error('byte trocado passou')
  const other = await signOpening(secret, { ...claims, user_id: '8ee0fe26-fda5-4a19-9f09-062a6eedd528' })
  const otherClaims = await readOpening(secret, other)
  if (otherClaims?.user_id === claims.user_id) throw new Error('outra pessoa')
  const expired = await signOpening(secret, { ...claims, exp: Math.floor(Date.now() / 1000) - 5 })
  if (await readOpening(secret, expired)) throw new Error('expirado passou')
  const moved = await signOpening(secret, { ...claims, starts_at: '2026-10-07T14:00:00.000Z' })
  const movedClaims = await readOpening(secret, moved)
  if (movedClaims?.starts_at === claims.starts_at) throw new Error('horário trocado')
})

Deno.test('T13 papel profissional não reserva', () => {
  if (canBook('profissional')) throw new Error('profissional reservou')
  if (canBook('operacao')) throw new Error('operação reservou')
  if (!canBook('cliente')) throw new Error('cliente bloqueada')
})

Deno.test('T14 lista clínica não casa deep tissue', () => {
  if (!isClinical('I need a diagnosis')) throw new Error('diagnosis')
  if (!isClinical('Write a treatment plan')) throw new Error('treatment plan')
  if (isClinical('Deep tissue in Boston')) throw new Error('deep tissue')
})

Deno.test('T15 bloco script vira erro', () => {
  const blocks = sanitizeBlocks([{ type: 'script', text: '<script>alert(1)</script>' }, { type: 'text', text: 'Hello' }])
  if (blocks[0].type !== 'error') throw new Error('script passou')
  if (JSON.stringify(blocks).includes('<script>')) throw new Error('html passou')
  if (blocks[1].type !== 'text') throw new Error('texto sumiu')
})

Deno.test('T16 áudio acima de 2 MB é recusado sem fetch', () => {
  const reason = rejectAudio({ bytes: AUDIO_BYTES + 1, mime: 'audio/webm', durationSeconds: 10 })
  if (!reason) throw new Error('aceitou arquivo grande')
})

Deno.test('T17 áudio wav é recusado', () => {
  const reason = rejectAudio({ bytes: 1000, mime: 'audio/wav', durationSeconds: 10 })
  if (!reason) throw new Error('aceitou wav')
  const webm = 'audio/webm;codecs=opus'
  if (rejectAudio({ bytes: 1000, mime: webm, durationSeconds: 30 })) throw new Error('webm recusado')
  if (!rejectAudio({ bytes: 1000, mime: 'audio/webm', durationSeconds: 61 })) throw new Error('61 segundos passou')
})

Deno.test('T18 a quinta ferramenta não é despachada', () => {
  const selected = selectToolCalls(['a', 'b', 'c', 'd', 'e'], 0)
  assertEquals(selected.run, ['a', 'b', 'c', 'd'], 'quatro')
  if (!selected.limited) throw new Error('sem limite')
  const next = selectToolCalls(['f'], selected.used)
  assertEquals(next.run, [], 'quinta')
})

Deno.test('T19 resposta acima de 12 KB é cortada e marcada', () => {
  const capped = capToolResult({ notes: 'x'.repeat(13_000) })
  if (!capped.truncated) throw new Error('não marcou')
  if (JSON.stringify(capped.result).length > 12 * 1024) throw new Error('não cortou')
})

Deno.test('T20 argumento fora do esquema não segue', () => {
  const parsed = parseToolArgs('search_professionals', { query: 'Sarah', amount_cents: 10000 })
  if (parsed.ok) throw new Error('argumento extra passou')
  const booked = bookToken({ opening_token: 'abc', amount_cents: 10000, price: 50 })
  if (!booked.ok || booked.token !== 'abc') throw new Error('preço não foi ignorado no token')
})
