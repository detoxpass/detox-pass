import { preflight } from '../_shared/supabase.ts'
import { notReady } from '../_shared/not-ready.ts'

Deno.serve((req) => preflight(req) ?? notReady('zenoti', 'Cancelamento ainda precisa validar a invoice. Sem teste autenticado.'))
