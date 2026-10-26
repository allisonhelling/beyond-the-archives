import { getLayout } from './use-layout'

/** Use the existing CORS-allowed client header to identify the requesting layout. */
export const fetchWithLayout: typeof fetch = (input, init) => {
 const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
 headers.set('x-client-info', `${headers.get('x-client-info') ?? ''} ao3-library/${getLayout()}`.trim())
 return fetch(input, { ...init, headers })
}
