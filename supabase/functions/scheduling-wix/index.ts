import { preflight } from '../_shared/supabase.ts'
import { notReady } from '../_shared/not-ready.ts'

Deno.serve((req) => preflight(req) ?? notReady('wix', 'Criação e confirmação podem ser etapas separadas. Sem teste autenticado.'))
