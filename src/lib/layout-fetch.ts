import { getLayout } from './use-layout'
import { beginActivity } from './activity'

/** Use the existing CORS-allowed client header to identify the requesting layout. */
export const fetchWithLayout: typeof fetch = async (input, init) => {
 const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
 headers.set('x-client-info', `${headers.get('x-client-info') ?? ''} ao3-library/${getLayout()}`.trim())
 const finish = beginActivity()
 try { return await fetch(input, { ...init, headers }) }
 finally { finish() }
}
