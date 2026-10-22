import { readBoundedBytes } from '../ao3/read-body.ts'
import { backupFileLimit, backupRetentionCount, type SavedBackup } from '../../src/types/backups.ts'

export type BackupFile = SavedBackup
export type BackupClaim = { token: string } | { error: 'busy' | 'rate_limited'; retry_after: number }
export type BackupDependencies = {
 authenticate(token: string): Promise<string | null>
 claim(user: string, create: boolean): Promise<BackupClaim>
 release(user: string, token: string): Promise<void>
 files(user: string): Promise<BackupFile[]>
 upload(path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>
 remove(paths: string[]): Promise<void>
}

/** Account-wide lease serializes upload/pruning across browsers and workers. */
export async function retainLatestBackups(deps: Pick<BackupDependencies,'files' | 'remove'>, user: string) {
  const files = await deps.files(user)
  const obsolete = files.slice(backupRetentionCount)
  for (let offset = 0; offset < obsolete.length; offset += 1000) {
   await deps.remove(obsolete.slice(offset, offset + 1000).map(file => file.path))
  }
  return files.slice(0,backupRetentionCount)
}

export function backupHandler(deps: BackupDependencies) {
 return async (request: Request): Promise<Response> => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'Retry-After', 'Cache-Control': 'no-store' }
  const reply = (body: object, status = 200, extra = {}) => Response.json(body, { status, headers: { ...headers, ...extra } })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET','POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405)
  let user: string | null = null, lease: string | null = null, uploaded = false
  try {
   const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
   user = bearer ? await deps.authenticate(bearer) : null
   if (!user) return reply({ error: 'unauthorized' }, 401)
   const create = request.method === 'POST'
   const contentType = request.headers.get('content-type')?.split(';')[0]
   if (create && !['application/json','application/gzip'].includes(contentType ?? '')) return reply({ error: 'unsupported_type' }, 415)
   if (create && Number(request.headers.get('content-length')) > backupFileLimit) return reply({ error: 'too_large' }, 413)
   const claim = await deps.claim(user, create)
   if ('error' in claim) return reply(claim, claim.error === 'rate_limited' ? 429 : 409, { 'Retry-After': String(claim.retry_after) })
   lease = claim.token
   if (create) {
    const body = await readBoundedBytes(request.body, backupFileLimit)
    if ('error' in body || !body.bytes.length) return reply({ error: 'error' in body && body.error === 'too_large' ? 'too_large' : 'empty_backup' }, 'error' in body && body.error === 'too_large' ? 413 : 400)
    // Recover any previous interrupted cleanup before permitting another file.
    // With an in-policy account this only reads the existing three copies.
    await retainLatestBackups(deps,user)
    const name = `between-chapters-backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.json${contentType === 'application/gzip' ? '.gz' : ''}`
    await deps.upload(`${user}/${name}`, body.bytes, contentType!)
    uploaded = true
   }
   // POST reaches pruning only after upload succeeds. GET reconciles pre-policy
   // copies and retries interrupted cleanup without consuming the save cooldown.
   return reply({ backups: await retainLatestBackups(deps,user) })
  } catch { return reply({ error: uploaded ? 'cleanup_pending' : 'backup_unavailable' }, 503) }
  finally {
   if (user && lease) {
    // A failed release leaves the bounded lease in place rather than allowing
    // concurrent writers. The next request recovers after expiry.
    try { await deps.release(user, lease) } catch { /* Lease expires automatically. */ }
   }
  }
 }
}
