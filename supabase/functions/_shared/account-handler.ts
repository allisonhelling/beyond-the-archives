type VerifiedUser = { id: string }
type VerifyUser = (token: string) => Promise<VerifiedUser | null>

// No privileged database access. JWTs are verified with Auth before returning account data.
export function accountHandler(verifyUser: VerifyUser, allowedOrigin: string) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' })
    if (origin && origin !== allowedOrigin) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers })
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (!['GET', 'POST'].includes(request.method)) return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!bearer) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    try {
      const user = await verifyUser(bearer)
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
      return new Response(JSON.stringify({ user_id: user.id, schema_version: 1 }), { headers })
    } catch { return new Response(JSON.stringify({ error: 'Authentication unavailable' }), { status: 503, headers }) }
  }
}
