/** Bound streamed HTML/JSON even when Content-Length is absent or untrustworthy. */
export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<{ text: string } | { error: 'missing' | 'too_large' }> {
 const reader = body?.getReader()
 if (!reader) return { error: 'missing' }
 const decoder = new TextDecoder()
 let text = '', bytes = 0
 for (;;) {
  const part = await reader.read()
  if (part.done) break
  bytes += part.value.byteLength
  if (bytes > limit) { await reader.cancel(); return { error: 'too_large' } }
  text += decoder.decode(part.value, { stream: true })
 }
 return { text: text + decoder.decode() }
}
