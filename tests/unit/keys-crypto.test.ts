// Unit tests for src/server/keys/crypto.ts per BOOTSTRAP Step 3:
//   round-trip, random-IV variance, GCM tamper detection, same-user determinism.

import { describe, expect, it } from "vitest"
import { decrypt, deriveKeyFor, encrypt } from "@/server/keys/crypto"

describe("keys crypto — AES-256-GCM + scrypt", () => {
  it("encrypts + decrypts round-trip (Gemini-style key)", () => {
    const plain = "AIza1234567890abcdefghijklmnopqrstuv12345"
    const ct = encrypt(plain)
    expect(decrypt(ct)).toBe(plain)
  })

  it("encrypts UTF-8 safely (non-ASCII content)", () => {
    const plain = "cà-phê-sữa-đá-🔑"
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it("same plaintext yields different ciphertext (random IV)", () => {
    const plain = "repeat-me"
    const a = encrypt(plain)
    const b = encrypt(plain)
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe(plain)
    expect(decrypt(b)).toBe(plain)
  })

  it("detects GCM auth-tag tamper", () => {
    const ct = encrypt("tamper-tag")
    const buf = Buffer.from(ct, "base64")
    buf[buf.length - 1] ^= 0x01 // flip last byte of auth tag
    expect(() => decrypt(buf.toString("base64"))).toThrow()
  })

  it("detects ciphertext body tamper", () => {
    const plain = "a".repeat(64)
    const ct = encrypt(plain)
    const buf = Buffer.from(ct, "base64")
    buf[20] ^= 0x01 // flip byte inside ciphertext region
    expect(() => decrypt(buf.toString("base64"))).toThrow()
  })

  it("short ciphertext fails loudly", () => {
    expect(() => decrypt("abc")).toThrow()
  })

  it("same user + same platform → same derived key (deterministic)", () => {
    const a = deriveKeyFor("alice", "win32")
    const b = deriveKeyFor("alice", "win32")
    expect(a.equals(b)).toBe(true)
    expect(a.length).toBe(32) // 256-bit
  })

  it("different user → different derived key", () => {
    const alice = deriveKeyFor("alice", "win32")
    const bob = deriveKeyFor("bob", "win32")
    expect(alice.equals(bob)).toBe(false)
  })

  it("different platform → different derived key", () => {
    const win = deriveKeyFor("alice", "win32")
    const linux = deriveKeyFor("alice", "linux")
    expect(win.equals(linux)).toBe(false)
  })
})
