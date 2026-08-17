import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY
  if (!secret) {
    throw new Error(
      'APP_ENCRYPTION_KEY is not set. It is required to encrypt saved connection URIs.',
    )
  }
  // Derive a stable 32-byte key from the provided secret of any length.
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** Encrypts a plaintext secret into a self-describing `v1.iv.tag.ciphertext` string. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
    '.',
  )
}

/** Decrypts a string produced by `encryptSecret`. */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Stored secret is malformed or was encrypted with a different key version.')
  }
  const [, ivB64, tagB64, dataB64] = parts
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * Produces a display-safe version of a Mongo URI with the password removed.
 * `mongodb+srv://user:pass@host/db` -> `mongodb+srv://user:****@host/db`
 */
export function redactUri(uri: string): string {
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/)([^:/@]+):([^@]*)@/i, (_m, scheme, user) => {
    return `${scheme}${user}:${'•'.repeat(8)}@`
  })
}

/** Extracts a friendly host label from a Mongo URI without exposing credentials. */
export function uriHost(uri: string): string {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?([^/?]+)/i)
  return match?.[1] ?? 'unknown host'
}
