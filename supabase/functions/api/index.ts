import { route } from './router.ts'

Deno.serve((req) => route(req))
