const active = status => ['Scheduled', 'Active'].includes(status);
const normalizeName = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const workerId = worker => worker.bhw_id || worker.bhwId || worker.hcpId || worker.id;
const workerName = worker => normalizeName(worker.custom_name || worker.customName || worker.name || worker.bhws?.name);

export const schedulesOverlap = (a, b) => {
  const start = s => Date.parse(`${String(s.date).slice(0, 10)}T${s.time}`);
  const duration = s => Number(s.duration) > 0 ? Number(s.duration) : 30;
  const aStart = start(a), bStart = start(b);
  return aStart < bStart + duration(b) * 60000 && bStart < aStart + duration(a) * 60000;
};

export const findWorkerConflict = (candidate, workers, schedules, excludeId) => {
  if (!active(candidate.status)) return null;
  return schedules.find(schedule => {
    if (excludeId != null && String(schedule.schedule_id) === String(excludeId)) return false;
    if (!active(schedule.status) || !schedulesOverlap(candidate, schedule)) return false;
    const assigned = [{ bhw_id: schedule.bhw_id, name: schedule.bhws?.name }, ...(schedule.schedule_bhws || [])];
    return workers.some(worker => assigned.some(other => {
      const id = workerId(worker), otherId = workerId(other);
      if (id && otherId) return String(id) === String(otherId);
      const name = workerName(worker);
      return !!name && name === workerName(other);
    }));
  }) || null;
};

// Validate against all workers' bookings, including assignments hidden from
// the caller's schedule list. Paginate to avoid Supabase's row limit.
export const checkScheduleConflict = async (db, changes, assignedBhws, healthcareProfessionals, excludeId) => {
  let existing = {};
  if (excludeId != null) {
    const { data, error } = await db.from('schedules')
      .select('*, schedule_bhws (*)').eq('schedule_id', excludeId).maybeSingle();
    if (error) throw error;
    existing = data || {};
  }
  const candidate = { ...existing, ...changes };
  if (!active(candidate.status)) return null;
  const replacesLinks = assignedBhws !== undefined || healthcareProfessionals !== undefined;
  const workers = [
    { bhw_id: candidate.bhw_id },
    ...(replacesLinks ? [...(assignedBhws || []), ...(healthcareProfessionals || [])] : (existing.schedule_bhws || []))
  ];
  const ids = [...new Set(workers.map(workerId).filter(Boolean))];
  if (ids.length) {
    const { data, error } = await db.from('bhws').select('bhw_id, name').in('bhw_id', ids);
    if (error) throw error;
    for (const worker of workers) {
      const registered = (data || []).find(row => String(row.bhw_id) === String(workerId(worker)));
      if (registered) worker.name = registered.name;
    }
  }
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('schedules')
      .select('schedule_id, date, time, duration, status, bhw_id, bhws:bhw_id (name), schedule_bhws (*, bhws:bhw_id (name))')
      .in('status', ['Scheduled', 'Active']).order('schedule_id').range(offset, offset + 999);
    if (error) throw error;
    const conflict = findWorkerConflict(candidate, workers, data || [], excludeId);
    if (conflict) return 'An assigned health worker already has an overlapping appointment. Please choose another time or assign a different worker.';
    if (!data || data.length < 1000) return null;
  }
};
