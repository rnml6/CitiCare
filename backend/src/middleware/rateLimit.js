// Small dependency-free rate limiter. The app has a single backend process;
// if it is ever scaled horizontally this should move to a shared store.
//
// Successful responses are removed from the bucket so only failed attempts
// count toward the limit (e.g. a valid login never locks the user out).
export const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = 'Too many attempts. Please wait a few minutes and try again.',
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  now = () => Date.now(),
} = {}) => {
  const buckets = new Map()

  const cleanup = (timestamp) => {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= timestamp) buckets.delete(key)
    }
  }

  const middleware = (req, res, next) => {
    const timestamp = now()
    cleanup(timestamp)
    const key = String(keyGenerator(req))
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= timestamp) {
      buckets.set(key, { count: 1, resetAt: timestamp + windowMs })
    } else if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))
      res.set?.('Retry-After', String(retryAfter))
      return res.status(429).json({
        success: false,
        message,
        errors: { rateLimit: `Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.` },
      })
    } else {
      bucket.count += 1
    }

    res.on?.('finish', () => {
      if (res.statusCode < 400) buckets.delete(key)
    })
    return next()
  }

  middleware.reset = () => buckets.clear()
  middleware.buckets = buckets
  return middleware
}

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
})
