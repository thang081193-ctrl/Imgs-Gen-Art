// Minimal PNG encoder. Emits 8-bit truecolor (colorType=2) RGB images.
// Generic utility — used by the Mock provider and reusable for test fixtures.
// Spec: https://www.w3.org/TR/png/

import { deflateSync } from "node:zlib"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

export function encodeSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  if (width <= 0 || height <= 0) throw new Error(`encodeSolidPng: invalid dimensions ${width}x${height}`)

  // IHDR: width(4) + height(4) + bitDepth=8 + colorType=2 (RGB) + compression=0 + filter=0 + interlace=0
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Raw image data: for each scanline, 1 filter byte (0 = None) + width * 3 bytes (RGB).
  const scanlineLen = 1 + width * 3
  const scanline = Buffer.alloc(scanlineLen)
  for (let x = 0; x < width; x++) {
    scanline[1 + x * 3] = r & 0xff
    scanline[1 + x * 3 + 1] = g & 0xff
    scanline[1 + x * 3 + 2] = b & 0xff
  }
  const raw = Buffer.alloc(scanlineLen * height)
  for (let y = 0; y < height; y++) scanline.copy(raw, y * scanlineLen)
  const idat = deflateSync(raw)

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ])
}
