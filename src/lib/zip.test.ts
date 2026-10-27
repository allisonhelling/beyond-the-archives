// @vitest-environment node
import { deflateRawSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { createZip, openZip, zipTextLimit } from './zip'

async function deflatedZip(text: string) {
 const stored = new Uint8Array(await createZip([{ name: 'metadata.xml', content: text }]).arrayBuffer())
 const old = new DataView(stored.buffer), nameLength = old.getUint16(26, true), localSize = 30 + nameLength
 const oldDirectory = old.getUint32(stored.length - 6, true), compressed = deflateRawSync(Buffer.from(text))
 const bytes = new Uint8Array(localSize + compressed.length + stored.length - oldDirectory)
 bytes.set(stored.subarray(0, localSize)); bytes.set(compressed, localSize); bytes.set(stored.subarray(oldDirectory), localSize + compressed.length)
 const view = new DataView(bytes.buffer), central = localSize + compressed.length
 view.setUint16(8, 8, true); view.setUint32(18, compressed.length, true)
 view.setUint16(central + 10, 8, true); view.setUint32(central + 20, compressed.length, true)
 view.setUint32(bytes.length - 6, central, true)
 return bytes.buffer
}
it('reads stored and deflated UTF-8 metadata with CRC validation', async () => {
 const text = '<title>Recovered café & 日本語</title>'
 const stored = await createZip([{ name: 'metadata.xml', content: text }]).arrayBuffer()
 expect(await openZip(stored).readText('metadata.xml')).toBe(text)
 expect(await openZip(await deflatedZip(text)).readText('metadata.xml')).toBe(text)
 const corrupt = new Uint8Array(stored)
 corrupt[30 + 'metadata.xml'.length] ^= 1
 await expect(openZip(stored).readText('metadata.xml')).rejects.toThrow('damaged')
})
it('bounds decompression even when declared sizes lie', async () => {
 const buffer = await deflatedZip('x'.repeat(100000)), view = new DataView(buffer)
 const central = view.getUint32(buffer.byteLength - 6, true)
 view.setUint32(central + 24, 1, true)
 await expect(openZip(buffer).readText('metadata.xml')).rejects.toThrow('Invalid')
 const oversized = await deflatedZip('x'.repeat(zipTextLimit + 1))
 await expect(openZip(oversized).readText('metadata.xml')).rejects.toThrow('size limit')
})
it('rejects truncated archives, duplicate or unsafe resource paths, and encrypted metadata', async () => {
 expect(() => openZip(new ArrayBuffer(20))).toThrow('Invalid')
 for (const files of [[{ name: '../metadata.xml', content: '' }], [{ name: 'same', content: '' }, { name: 'same', content: '' }]]) {
  const buffer = await createZip(files).arrayBuffer()
  expect(() => openZip(buffer)).toThrow('Invalid')
 }
 const buffer = await deflatedZip('metadata'), view = new DataView(buffer)
 const central = view.getUint32(buffer.byteLength - 6, true)
 view.setUint16(central + 8, 1, true)
 await expect(openZip(buffer).readText('metadata.xml')).rejects.toThrow('Encrypted')
})
