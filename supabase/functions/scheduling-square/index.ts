import { preflight } from '../_shared/supabase.ts'
import { notReady } from '../_shared/not-ready.ts'

Deno.serve((req) => preflight(req) ?? notReady('square', 'Escrita depende de plano e permissão. Sem teste autenticado.'))
