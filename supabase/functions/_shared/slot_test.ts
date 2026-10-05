import { compensationResult } from './compensate.ts'
import { datesToQuery, slotIsOpen } from './slot.ts'

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
  }
}

Deno.test('horário presente na revalidação permanece aberto', () => {
  const start = '2026-10-06T15:00:00-0500'
  assertEquals(slotIsOpen([[{ time: '2026-10-06T15:00:00-0500' }]], start), true, 'slot presente')
})

Deno.test('horário ausente fecha a reserva', () => {
  assertEquals(
    slotIsOpen([[{ time: '2026-10-06T16:00:00-0500' }]], '2026-10-06T15:00:00-0500'),
    false,
    'slot ausente',
  )
})

Deno.test('mesmo instante com offset diferente continua aberto', () => {
  assertEquals(
    slotIsOpen([[{ time: '2026-10-06T20:00:00Z' }]], '2026-10-06T15:00:00-0500'),
    true,
    'instante equivalente',
  )
})

Deno.test('lista vazia ou resposta inválida não abre o horário', () => {
  assertEquals(slotIsOpen([[]], '2026-10-06T15:00:00Z'), false, 'lista vazia')
  assertEquals(slotIsOpen([{ error: 'nope' }], '2026-10-06T15:00:00Z'), false, 'payload inválido')
})

Deno.test('falha de SQL depois da agenda não vira sucesso', () => {
  if (compensationResult(true, null) !== 'ok') throw new Error('sql salvo')
  if (compensationResult(false, true) !== 'reverted') throw new Error('revertido')
  if (compensationResult(false, false) !== 'compensation_required') throw new Error('divergente')
  if (compensationResult(false, null) !== 'compensation_required') throw new Error('sem reversão')
})

Deno.test('a consulta cobre a data informada e a data UTC', () => {
  const dates = datesToQuery('2026-10-06T23:30:00-0500')
  if (!dates.includes('2026-10-06') || !dates.includes('2026-10-07')) {
    throw new Error(`datas incompletas: ${dates.join(',')}`)
  }
})
