import { invalid, notConfigured, type GustoResult } from './client.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function paymentKey(bookingId: string) {
  return `detox-payment-${bookingId}`
}

// This cut never calls Gusto for a contractor payment.
// A later cut will load the booking, the contractor, the ledger amount and the
// preview creation token, then POST with paymentKey(bookingId).
export async function createGustoContractorPayment(bookingId: string): Promise<GustoResult> {
  if (!UUID.test(bookingId)) return invalid('Booking is missing')
  return notConfigured()
}
