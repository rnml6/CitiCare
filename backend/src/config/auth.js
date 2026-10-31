import dotenv from 'dotenv'

dotenv.config()

const DEVELOPMENT_FALLBACK_SECRET = 'your-secret-key'

// Single source of truth for JWT signing and verification. Production must
// provide JWT_SECRET; development keeps a deterministic fallback so a fresh
// checkout can still run locally. The fallback is never accepted in
// production because index.js calls assertAuthConfig() on startup.
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET
  if (secret && secret.trim()) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.')
  }
  return DEVELOPMENT_FALLBACK_SECRET
}

export const assertAuthConfig = () => {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production.')
  }
}

export const JWT_EXPIRES_IN = '24h'
