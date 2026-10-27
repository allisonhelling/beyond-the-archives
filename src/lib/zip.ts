// ZIP's stored method needs no compression library and is supported by standard
// archive readers. CSV content and filenames are UTF-8; CRCs detect corruption.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
export const zipMaxBytes = 50 * 1024 * 1024
export const zipTextLimit = 2 * 1024 * 1024

function checksum(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function createZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder(), parts: BlobPart[] = [], directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0, directorySize = 0
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.content)
    const crc = checksum(data)
    const local = new Uint8Array(30 + name.length), header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x800, true)
    header.setUint16(12, 33, true) // January 1, 1980, the earliest ZIP date
    header.setUint32(14, crc, true)
    header.setUint32(18, data.length, true)
    header.setUint32(22, data.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length), entry = new DataView(central.buffer)
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x800, true)
    entry.setUint16(14, 33, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.set(name, 46)
    parts.push(local, data)
    directory.push(central)
    offset += local.length + data.length
    directorySize += central.length
  }
  if (files.length > 65535 || offset + directorySize > 0xffffffff) throw new Error('Export exceeds ZIP size limits.')
  const end = new Uint8Array(22), footer = new DataView(end.buffer)
  footer.setUint32(0, 0x06054b50, true)
  footer.setUint16(8, files.length, true)
  footer.setUint16(10, files.length, true)
  footer.setUint32(12, directorySize, true)
  footer.setUint32(16, offset, true)
  return new Blob([...parts, ...directory, end], { type: 'application/zip' })
}

/** Read selected EPUB resources only, with bounded decompression and CRC checks. */
export function openZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer)
  const invalid = () => new Error('Invalid or unsupported EPUB ZIP archive.')
  if (bytes.length < 22 || bytes.length > zipMaxBytes) throw invalid()
  let end = bytes.length - 22
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break
  }
  if (end < Math.max(0, bytes.length - 65557)) throw invalid()
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count > 10000 || start + size !== end) throw invalid()
  const entries = new Map<string, { offset: number; compressed: number; size: number; crc: number; method: number; flags: number }>()
  let position = start
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) throw invalid()
    const length = view.getUint16(position + 28, true), extra = view.getUint16(position + 30, true), comment = view.getUint16(position + 32, true)
    if (position + 46 + length + extra + comment > end || view.getUint16(position + 34, true)) throw invalid()
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + length))
    if (entries.has(name) || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw invalid()
    entries.set(name, { offset: view.getUint32(position + 42, true), compressed: view.getUint32(position + 20, true), size: view.getUint32(position + 24, true), crc: view.getUint32(position + 16, true), method: view.getUint16(position + 10, true), flags: view.getUint16(position + 8, true) })
    position += 46 + length + extra + comment
  }
  if (position !== end) throw invalid()
  let total = 0
  return {
    names: [...entries.keys()],
    size: (name: string) => entries.get(name)?.size,
    async readText(name: string) {
      const entry = entries.get(name)
      if (!entry) throw new Error(`Missing EPUB resource: ${name}`)
      if (entry.flags & 1) throw new Error('Encrypted EPUB metadata cannot be imported.')
      if (entry.size > zipTextLimit || total + entry.size > 4 * zipTextLimit) throw new Error('EPUB metadata exceeds the import size limit.')
      const offset = entry.offset
      if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50 || view.getUint16(offset + 8, true) !== entry.method || view.getUint16(offset + 6, true) !== entry.flags) throw invalid()
      const nameLength = view.getUint16(offset + 26, true), dataStart = offset + 30 + nameLength + view.getUint16(offset + 28, true)
      if (dataStart + entry.compressed > start || new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength)) !== name) throw invalid()
      const compressed = bytes.slice(dataStart, dataStart + entry.compressed)
      let data: Uint8Array = compressed
      if (entry.method === 8) {
        let stream: DecompressionStream
        try { stream = new DecompressionStream('deflate-raw') }
        catch { throw new Error('This browser cannot decompress EPUB files. Update your browser and try again.') }
        const reader = new ReadableStream<BufferSource>({ start(controller) { controller.enqueue(compressed); controller.close() } }).pipeThrough(stream).getReader()
        const chunks: Uint8Array[] = []
        let length = 0
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            length += chunk.value.length
            if (length > entry.size) { await reader.cancel(); throw invalid() }
            chunks.push(chunk.value)
          }
        } finally { reader.releaseLock() }
        data = new Uint8Array(length)
        let at = 0
        for (const chunk of chunks) { data.set(chunk, at); at += chunk.length }
      } else if (entry.method !== 0) throw invalid()
      if (data.length !== entry.size || checksum(data) !== entry.crc) throw new Error('The EPUB is damaged. Try another copy of the file.')
      total += data.length
      return new TextDecoder().decode(data)
    },
  }
}
