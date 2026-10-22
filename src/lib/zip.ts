// ZIP's stored method needs no compression library and is supported by standard
// archive readers. CSV content and filenames are UTF-8; CRCs detect corruption.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

export function createZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder(), parts: BlobPart[] = [], directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0, directorySize = 0
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.content)
    let crc = 0xffffffff
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
    crc = (crc ^ 0xffffffff) >>> 0
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
