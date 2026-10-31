// middleware/responseCache.js
//
// Caches successful JSON GET responses in-process and drops the whole cache
// whenever a write succeeds. Cache is keyed by the request URL plus a hash of
// the caller's bearer token, so two users (or an admin and a BHW worker) never
// see each other's scoped data.
//
// This is what makes switching back to Dashboard / Residents / Purok feel
// instant: the first load still hits Supabase, every subsequent visit inside
// the TTL is served from memory instead of re-running a dozen round trips.

import crypto from 'node:crypto';
import { cacheEnabled, cacheGet, cacheSet, cacheClear } from '../utils/cache.js';

// Per-area TTLs. Writes clear everything immediately, so these only bound how
// long data changed *outside* the app can look stale.
const TTL_RULES = [
  // AI reports are expensive and change slowly — the scheduled process can
  // warm this and every dashboard visit is then served from memory.
  [/^\/api\/dashboard\/ai-recommendation/, 10 * 60 * 1000],
  // Live widgets poll every 30s — keep them close to real time.
  [/^\/api\/dashboard\/(today-activities|upcoming-activities|missed-consultations|notifications)/, 10 * 1000],
  [/^\/api\/dashboard/, 60 * 1000],
  [/^\/api\/medicines/, 60 * 1000],
  [/^\/api\/puroks/, 30 * 1000],
  [/^\/api\/residents/, 30 * 1000],
  [/^\/api\/bhws/, 30 * 1000],
  [/^\/api\/schedules/, 20 * 1000],
];
const DEFAULT_TTL = 15 * 1000;

const ttlFor = (pathname) => {
  for (const [pattern, ttl] of TTL_RULES) {
    if (pattern.test(pathname)) return ttl;
  }
  return DEFAULT_TTL;
};

const tokenHash = (authorization) =>
  crypto
    .createHash('sha1')
    .update(String(authorization || 'anonymous'))
    .digest('base64url');

export const responseCache = (req, res, next) => {
  if (!cacheEnabled()) return next();

  // Any successful write invalidates every cached read: cheaper and safer than
  // tracking which endpoints depend on which table.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) cacheClear();
    });
    return next();
  }

  // Authentication responses are per-request and cheap; never cache them.
  if (req.path.startsWith('/api/auth')) return next();

  const key = `${req.originalUrl}|${tokenHash(req.headers.authorization)}`;
  const ttl = ttlFor(req.path);

  const hit = cacheGet(key);
  if (hit !== undefined) {
    res.set('X-Cache', 'HIT');
    res.locals.__cacheHit = true;
    return res.json(hit);
  }

  res.set('X-Cache', 'MISS');

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (
      !res.locals.__cacheHit &&
      res.statusCode === 200 &&
      body &&
      typeof body === 'object'
    ) {
      cacheSet(key, body, ttl);
    }
    return originalJson(body);
  };

  return next();
};
