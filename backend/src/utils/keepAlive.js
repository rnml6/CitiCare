// utils/keepAlive.js
//
// Supabase is a remote host: when the backend has been idle for a few seconds
// Node's HTTP pool closes the socket, so the next request pays a fresh DNS +
// TLS handshake. On this network that handshake measured ~3 seconds, which is
// why the *first* click on a tab felt slow even after the queries themselves
// got faster.
//
// While the app is actively being used we send a tiny HEAD/count request every
// few seconds to keep the pooled connection open. The pinging stops by itself
// after a couple of idle minutes, so it costs nothing when nobody is using the
// system.

import { supabase } from '../config/supabase.js';

const PING_INTERVAL_MS = 3000;   // undici's idle timeout is ~4s
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

let timer = null;
let activeUntil = 0;
let pinging = false;

const ping = async () => {
  if (pinging) return;
  pinging = true;
  try {
    // Cheapest possible round trip that still reuses the same connection.
    await supabase.from('puroks').select('purok_id', { count: 'exact', head: true });
  } catch {
    // Best effort only.
  } finally {
    pinging = false;
  }
};

const tick = () => {
  if (Date.now() > activeUntil) {
    clearInterval(timer);
    timer = null;
    return;
  }
  ping();
};

// Call on every request. Keeps the pool warm for a couple of minutes after the
// last interaction.
export const keepSupabaseWarm = () => {
  if (process.env.NODE_ENV === 'test') return;
  activeUntil = Date.now() + ACTIVE_WINDOW_MS;
  if (timer) return;
  timer = setInterval(tick, PING_INTERVAL_MS);
  timer.unref?.();
};
