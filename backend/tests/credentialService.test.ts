import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptCredentials, decryptCredentials, maskCredentials } from '../src/services/credentialService'

const TEST_KEY = 'a]'.repeat(32) // 64 hex chars = 32 bytes — but we need valid hex
// Use: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
const TEST_KEY_HEX = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'

describe('CredentialService', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEYS = JSON.stringify({ '1': TEST_KEY_HEX })
    process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID = '1'
  })

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEYS
    delete process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID
  })

  it('encrypts and decrypts round-trip', () => {
    const creds = { apiKey: 'sk-test-12345', bearerToken: 'tok_abc' }
    const encrypted = encryptCredentials(creds)
    expect(encrypted).toMatch(/^v1:/)
    expect(encrypted).not.toContain('sk-test-12345')
    const decrypted = decryptCredentials(encrypted)
    expect(decrypted).toEqual(creds)
  })

  it('handles empty credentials', () => {
    const encrypted = encryptCredentials({})
    const decrypted = decryptCredentials(encrypted)
    expect(decrypted).toEqual({})
  })

  it('supports key rotation (decrypt with old key)', () => {
    const encrypted = encryptCredentials({ apiKey: 'test' })
    // Add a new key and change current
    const newKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    process.env.CREDENTIAL_ENCRYPTION_KEYS = JSON.stringify({ '1': TEST_KEY_HEX, '2': newKey })
    process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID = '2'
    // Old data still decryptable
    const decrypted = decryptCredentials(encrypted)
    expect(decrypted).toEqual({ apiKey: 'test' })
    // New encryptions use key 2
    const newEncrypted = encryptCredentials({ apiKey: 'new' })
    expect(newEncrypted).toMatch(/^v2:/)
  })

  it('throws on missing encryption key', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEYS
    expect(() => encryptCredentials({ apiKey: 'test' })).toThrow('CREDENTIAL_ENCRYPTION_KEYS is not configured')
  })

  it('throws on invalid key ID', () => {
    expect(() => encryptCredentials({ apiKey: 'test' }, 'nonexistent')).toThrow("Encryption key 'nonexistent' is missing or invalid")
  })

  describe('maskCredentials', () => {
    it('masks secret fields', () => {
      const creds = { apiKey: 'sk-test-12345', bearerToken: 'tok_abc', baseUrl: 'https://api.example.com' }
      const masked = maskCredentials(creds)
      expect(masked.apiKey).toBe('sk-t...2345')
      expect(masked.bearerToken).toBe('********') // 7 chars <= 8
      expect(masked.baseUrl).toBe('https://api.example.com')
    })

    it('coerces non-string values', () => {
      const masked = maskCredentials({ apiKey: 12345 })
      expect(masked.apiKey).toBe('********') // "12345" = 5 chars <= 8
    })

    it('preserves non-secret fields', () => {
      const masked = maskCredentials({ baseUrl: 'https://api.com', limit: 100 })
      expect(masked.baseUrl).toBe('https://api.com')
      expect(masked.limit).toBe(100)
    })
  })
})
