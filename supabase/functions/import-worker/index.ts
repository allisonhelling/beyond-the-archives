// Retired endpoint: stale schedules and callers must never originate AO3 requests.
Deno.serve(() => new Response('Hosted AO3 retrieval has retired. Use the desktop companion.', {
 status: 410, headers: { 'Cache-Control': 'no-store' },
}))
