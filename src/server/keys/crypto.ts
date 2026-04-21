// AES-256-GCM + scrypt KDF per BOOTSTRAP Step 3 / PLAN §5.5.
// Derived key is bound to OS user + platform so an exfiltrated keys.enc
// cannot be decrypted on another machine without the same login.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import os from "node:os"

const SCRYPT_N = 2 ** 15                     // 32768 — CPU/memory hardness
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 64 * 1024 * 1024       // 64 MiB — above 128*N*r=32 MiB floor
const KEY_LEN = 32                           // 256-bit AES key
const IV_LEN = 12                            // GCM recommended (96-bit)
const AUTH_TAG_LEN = 16                      // default GCM tag length

// Fixed 16-byte salt — scheme constant, not branding. Raw ASCII of
// "ArtForgeSaltv1" + 2 null bytes. Do NOT change without a migration.
const SALT = Buffer.from([
  0x41, 0x72, 0x74, 0x46, 0x6F, 0x72, 0x67, 0x65,
  0x53, 0x61, 0x6C, 0x74, 0x76, 0x31, 0x00, 0x00,
])

const KDF_SCHEME = "artforge-v1"

function buildKdfInput(username: string, platform: string): Buffer {
  return Buffer.from(`${username}:${platform}:${KDF_SCHEME}`, "utf8")
}

function scryptDerive(input: Buffer): Buffer {
  return scryptSync(input, SALT, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  })
}

let cachedKey: Buffer | null = null

function getDerivedKey(): Buffer {
  if (cachedKey) return cachedKey
  cachedKey = scryptDerive(buildKdfInput(os.userInfo().username, process.platform))
  return cachedKey
}

// Test hook: derive a key for an explicit (user, platform). Production code
// should use encrypt/decrypt which use the real OS identity.
export function deriveKeyFor(username: string, platform: string): Buffer {
  return scryptDerive(buildKdfInput(username, platform))
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv("aes-256-gcm", getDerivedKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64")
}

export function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, "base64")
  if (buf.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Ciphertext too short: malformed keys.enc entry")
  }
  const iv = buf.subarray(0, IV_LEN)
  const authTag = buf.subarray(buf.length - AUTH_TAG_LEN)
  const ciphertext = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN)
  const decipher = createDecipheriv("aes-256-gcm", getDerivedKey(), iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}
