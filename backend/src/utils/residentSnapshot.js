// utils/residentSnapshot.js
//
// The dashboard's stats, risk-distribution and per-purok risk endpoints all
// used to pull the entire residents table (paged 1000 rows at a time) on every
// call. They only need the same few columns, so they now share one cached
// snapshot. Concurrent misses are coalesced, meaning a dashboard load does one
// residents read instead of three.

import { supabase } from '../config/supabase.js';
import { fetchAllRows } from './paginate.js';
import { cacheRemember } from './cache.js';

const COLUMNS = 'resident_id, name, age, date_of_birth, focus_groups, purok_id, risk_score, risk_level, puroks:purok_id (name)';
const TTL_MS = 60 * 1000;

export const getResidentRiskSnapshot = ({ worker, residentIds, purokId, userKey }) => {
  // Admin scope is shared; worker scope is per user (their assignment can
  // change, and a write clears the cache anyway).
  const key = worker
    ? `resident-risk-snapshot:worker:${userKey ?? 'unknown'}`
    : 'resident-risk-snapshot:admin';

  return cacheRemember(key, TTL_MS, () => {
    const buildQuery = () => {
      let query = supabase.from('residents').select(COLUMNS);
      if (worker) {
        if (residentIds?.length) query = query.in('resident_id', residentIds);
        else if (purokId) query = query.eq('purok_id', purokId);
        else query = query.eq('resident_id', 0);
      }
      return query.order('resident_id');
    };
    return fetchAllRows(buildQuery);
  });
};

// Map a snapshot row to the shape dashboard cards use.
export const toRiskResident = (row) => ({
  id: row.resident_id,
  name: row.name,
  age: row.age,
  dateOfBirth: row.date_of_birth,
  purok: row.puroks?.name || 'Unknown',
  conditions: [],
  focusGroups: row.focus_groups || [],
  riskScore: row.risk_score ?? 0,
  riskLevel: row.risk_level || 'Low Risk',
});
