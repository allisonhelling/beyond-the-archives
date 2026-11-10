import { randomUUID } from 'node:crypto'
import { writeFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// Only installed in the development sample server; never exposed by a build.
type SampleDataOptions = { path?: string; validate?: (data: unknown) => boolean }
const librarySnapshot = (data: unknown) => {
  const value = data as Record<string, unknown> | null
  return Boolean(value && value.completeSnapshot === true && Array.isArray(value.stories) && Array.isArray(value.collections) && Array.isArray(value.series) && Number.isInteger(value.sampleVersion))
}
export function sampleData(enabled: boolean, { path = 'src/features/library/sample/default-state.json', validate = librarySnapshot }: SampleDataOptions = {}): Plugin {
  return {
    name: 'sample-data',
    apply: 'serve',
    // Keep the current preview open after saving. Reset reloads the updated fixture.
    handleHotUpdate(context) {
      if (enabled && context.file === resolve(context.server.config.root, path)) return []
    },
    configureServer(server) {
      if (!enabled) return
      const target = resolve(server.config.root, path)
      server.middlewares.use('/__sample-data', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        const send = (status: number, error?: string) => { response.statusCode = status; response.end(JSON.stringify(error ? { error } : { saved: true })) }
        if (request.method !== 'POST') return send(405, 'Use POST to update sample data.')
        // JSON plus same-origin checks prevent another website from writing local fixtures.
        if (request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) return send(403, 'Sample updates must come from this application.')
        if (request.headers['content-type'] !== 'application/json') return send(415, 'Expected JSON sample data.')
        let temporary: string | undefined
        try {
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 20 * 1024 * 1024) return send(413, 'Sample data exceeds the 20 MB limit.')
            chunks.push(Buffer.from(chunk))
          }
          let data
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(400, 'Invalid sample data.') }
          if (!validate(data)) return send(400, 'Invalid sample library snapshot.')
          temporary = `${target}.${randomUUID()}.tmp`
          await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
          await rename(temporary, target)
          send(200)
        } catch { send(500, 'Could not save sample data into the project. Check that the project folder is writable.') }
        finally { if (temporary) await rm(temporary, { force: true }) }
      })
    },
  }
}
