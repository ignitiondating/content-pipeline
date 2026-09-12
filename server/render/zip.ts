import { closeSync, openSync, readSync, statSync, writeSync } from 'node:fs'

const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})

/** ZIP STORE: streams media without loading entire videos or recompressing them. */
export function writeMediaZip(target: string, entries: { name: string; file: string }[]) {
  let projected = 22
  for (const entry of entries) {
    if (!/^[\w./-]+$/.test(entry.name) || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error('Invalid archive filename')
    projected += statSync(entry.file).size + Buffer.byteLength(entry.name) * 2 + 92
  }
  if (projected >= 0xffffffff || entries.length >= 65535) throw new Error('This media bundle exceeds the 4 GB ZIP limit. Use smaller source clips.')
  const output = openSync(target, 'w')
  let offset = 0
  const central: Buffer[] = []
  const write = (buffer: Buffer) => {
    let written = 0
    while (written < buffer.length) written += writeSync(output, buffer, written, buffer.length - written)
    offset += buffer.length
  }
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name)
      const start = offset
      const header = Buffer.alloc(30)
      header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4)
      header.writeUInt16LE(8, 6); header.writeUInt16LE(33, 12)
      header.writeUInt16LE(name.length, 26)
      write(header); write(name)
      const input = openSync(entry.file, 'r')
      let crc = 0xffffffff
      let size = 0
      try {
        const chunk = Buffer.alloc(256 * 1024)
        let length: number
        while ((length = readSync(input, chunk, 0, chunk.length, null)) > 0) {
          for (let i = 0; i < length; i++) crc = table[(crc ^ chunk[i]) & 255] ^ (crc >>> 8)
          size += length
          if (offset + length >= 0xffffffff) throw new Error('Source grew beyond ZIP size limit')
          write(chunk.subarray(0, length))
        }
      } finally { closeSync(input) }
      crc = (crc ^ 0xffffffff) >>> 0
      const descriptor = Buffer.alloc(16)
      descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4)
      descriptor.writeUInt32LE(size, 8); descriptor.writeUInt32LE(size, 12); write(descriptor)
      const record = Buffer.alloc(46)
      record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6)
      record.writeUInt16LE(8, 8); record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16)
      record.writeUInt32LE(size, 20); record.writeUInt32LE(size, 24); record.writeUInt16LE(name.length, 28)
      record.writeUInt32LE(start, 42); central.push(record, name)
    }
    const centralStart = offset
    central.forEach(write)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(offset - centralStart, 12); end.writeUInt32LE(centralStart, 16); write(end)
  } finally { closeSync(output) }
}
