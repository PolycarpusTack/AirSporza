// backend/src/services/credentialService.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const SECRET_FIELD_PATTERNS = ['key', 'token', 'secret', 'password', 'auth']

function getKeyring(): Record<string, string> {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEYS
  if (!raw) throw new Error('CREDENTIAL_ENCRYPTION_KEYS is not configured')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('CREDENTIAL_ENCRYPTION_KEYS is not valid JSON')
  }
}

function getCurrentKeyId(): string {
  const id = process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID
  if (!id) throw new Error('CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID is not configured')
  return id
}

function getEncryptionKey(keyId?: string): { id: string; key: Buffer } {
  const keyring = getKeyring()
  const id = keyId ?? getCurrentKeyId()
  const hex = keyring[id]
  if (!hex || hex.length !== 64) {
    throw new Error(`Encryption key '${id}' is missing or invalid (expected 64 hex chars)`)
  }
  return { id, key: Buffer.from(hex, 'hex') }
}

export function encryptCredentials(
  credentials: Record<string, unknown>,
  keyId?: string
): string {
  const { id, key } = getEncryptionKey(keyId)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = JSON.stringify(credentials)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return `v${id}:${payload}`
}

export function decryptCredentials(encryptedStr: string): Record<string, unknown> {
  const colonIdx = encryptedStr.indexOf(':')
  if (colonIdx === -1 || !encryptedStr.startsWith('v')) {
    throw new Error('Invalid encrypted credential format')
  }
  const keyId = encryptedStr.slice(1, colonIdx)
  const payload = encryptedStr.slice(colonIdx + 1)
  const { key } = getEncryptionKey(keyId)
  const data = Buffer.from(payload, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const ciphertext = data.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = decipher.update(ciphertext) + decipher.final('utf8')
  return JSON.parse(decrypted)
}

export function maskCredentials(
  credentials: Record<string, unknown>
): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(credentials)) {
    const isSecret = SECRET_FIELD_PATTERNS.some(p => k.toLowerCase().includes(p))
    if (!isSecret) { masked[k] = v; continue }
    const str = String(v)
    masked[k] = str.length <= 8 ? '********' : str.slice(0, 4) + '...' + str.slice(-4)
  }
  return masked
}
