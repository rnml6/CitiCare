// Keep schedule statuses current on reads. Concurrent requests share the update.
import { supabase } from '../config/supabase.js';

let pending = null;

const runFlip = async () => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const { error } = await supabase
      .from('schedules')
      .update({ status: 'Missed' })
      .eq('status', 'Scheduled')
      .or(`date.lt.${today},and(date.eq.${today},time.lt.${currentTime})`);
    if (error) console.error('Error auto-marking overdue schedules as Missed:', error);
  } catch (e) {
    console.error('Error auto-marking overdue schedules as Missed:', e);
  }
};

export const flipOverdueScheduled = () => {
  if (!pending) pending = runFlip().finally(() => { pending = null; });
  return pending;
};
