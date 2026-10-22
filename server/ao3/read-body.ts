/** Bound streamed HTML/JSON even when Content-Length is absent or untrustworthy. */
export async function readBoundedBytes(body: ReadableStream<Uint8Array> | null, limit: number): Promise<{ bytes: Uint8Array<ArrayBuffer> } | { error: 'missing' | 'too_large' }> {
 const reader = body?.getReader()
 if (!reader) return { error: 'missing' }
 const chunks: Uint8Array[] = []
 let bytes = 0
 for (;;) {
  const part = await reader.read()
  if (part.done) break
  bytes += part.value.byteLength
  if (bytes > limit) { await reader.cancel(); return { error: 'too_large' } }
  chunks.push(part.value)
 }
 const result = new Uint8Array(bytes)
 let offset = 0
 for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
 return { bytes: result }
}

export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<{ text: string } | { error: 'missing' | 'too_large' }> {
 const result = await readBoundedBytes(body, limit)
 return 'error' in result ? result : { text: new TextDecoder().decode(result.bytes) }
}
