import { preflight } from '../_shared/supabase.ts'
import { notReady } from '../_shared/not-ready.ts'

Deno.serve((req) => preflight(req) ?? notReady('mindbody', 'Produção exige onboarding do fornecedor. Sem teste autenticado.'))
