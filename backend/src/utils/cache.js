// utils/cache.js
//
// Small in-process TTL cache used to keep the read-heavy screens (Dashboard,
// Residents, Purok) from re-running the same multi-query work on every visit.
//
// The app talks to a remote Supabase instance where a single round trip costs
// ~150ms and a table scan of the barangay is paged 1000 rows at a time, so a
// repeated GET could easily cost 1-3 seconds even though nothing changed.
// Caching the *result* (not just the query) collapses that to microseconds and
// a successful write clears the cache so the next read is always fresh.
//
// Disabled under NODE_ENV=test so the suite always exercises the real code
// path and never sees data from a previous test.

const MAX_ENTRIES = 500;
const MAX_TOTAL_BYTES = 96 * 1024 * 1024; // 96 MB of cached JSON
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;  // don't cache anything bigger

const store = new Map(); // key -> { value, bytes, expiresAt }
const inflight = new Map(); // key -> Promise (request coalescing)

let totalBytes = 0;

export const cacheEnabled = () => process.env.NODE_ENV !== 'test';

export const cacheGet = (key) => {
  if (!cacheEnabled()) return undefined;
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    totalBytes -= entry.bytes;
    return undefined;
  }
  return entry.value;
};

export const cacheSet = (key, value, ttlMs) => {
  if (!cacheEnabled() || value === undefined) return;
  let bytes;
  try {
    bytes = JSON.stringify(value)?.length || 0;
  } catch {
    return;
  }
  if (bytes > MAX_ENTRY_BYTES) return;

  const existing = store.get(key);
  if (existing) {
    store.delete(key);
    totalBytes -= existing.bytes;
  }

  store.set(key, { value, bytes, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  totalBytes += bytes;

  // Evict oldest entries first (Map preserves insertion order).
  while ((store.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) && store.size > 0) {
    const oldestKey = store.keys().next().value;
    const oldest = store.get(oldestKey);
    store.delete(oldestKey);
    totalBytes -= oldest?.bytes || 0;
  }
};

// Coalesce concurrent misses: three dashboard endpoints asking for the same
// resident snapshot trigger one database read, not three.
export const cacheRemember = async (key, ttlMs, producer) => {
  if (!cacheEnabled()) return producer();
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await producer();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
};

export const cacheDelete = (key) => {
  const entry = store.get(key);
  if (entry) {
    store.delete(key);
    totalBytes -= entry.bytes;
  }
};

export const cacheDeletePrefix = (prefix) => {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) cacheDelete(key);
  }
};

export const cacheClear = () => {
  store.clear();
  inflight.clear();
  totalBytes = 0;
};

export const cacheStats = () => ({
  entries: store.size,
  bytes: totalBytes,
});
