// utils/overdueSchedules.js
//
// Auto-marks past 'Scheduled' rows as 'Missed'. This used to run (SELECT +
// UPDATE) inside every dashboard/schedule GET, costing two Supabase round
// trips per request even though the answer almost never changes. It is now
// shared by both controllers and throttled so it runs at most once per
// MIN_INTERVAL, with concurrent callers sharing the in-flight work.

import { supabase } from '../config/supabase.js';
import { cacheClear } from './cache.js';

const MIN_INTERVAL_MS = 45 * 1000;

let lastRunAt = 0;
let pending = null;

const runFlip = async () => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('schedules')
      .select('schedule_id')
      .eq('status', 'Scheduled')
      .or(`date.lt.${today},and(date.eq.${today},time.lt.${currentTime})`)
      .limit(1000);
    if (error) {
      console.error('Error finding overdue schedules:', error);
      return;
    }
    if (!data || data.length === 0) return;

    const { error: upError } = await supabase
      .from('schedules')
      .update({ status: 'Missed' })
      .in('schedule_id', data.map(r => r.schedule_id));
    if (upError) {
      console.error('Error auto-marking overdue schedules as Missed:', upError);
      return;
    }

    // Schedules just changed, so any cached read is now stale.
    cacheClear();
  } catch (e) {
    console.error('Error auto-marking overdue schedules as Missed:', e);
  }
};

export const flipOverdueScheduled = async () => {
  // Tests exercise the real path every time.
  if (process.env.NODE_ENV === 'test') return runFlip();

  if (pending) return pending;
  if (Date.now() - lastRunAt < MIN_INTERVAL_MS) return;

  pending = runFlip().finally(() => {
    lastRunAt = Date.now();
    pending = null;
  });
  return pending;
};
