import { supabase } from '../config/supabase.js';
import { fetchAllRows, fetchRowsForIds } from './paginate.js';

const COLUMNS = 'resident_id, name, age, date_of_birth, focus_groups, purok_id, risk_score, risk_level, puroks:purok_id (name)';

export const getResidentRiskSnapshot = ({ worker, residentIds, purokId }) => {
  const buildQuery = () => supabase.from('residents').select(COLUMNS).order('resident_id');
  if (!worker) return fetchAllRows(buildQuery);
  if (residentIds?.length) {
    return fetchRowsForIds(residentIds, batch => buildQuery().in('resident_id', batch));
  }
  return purokId == null ? Promise.resolve([]) : fetchAllRows(() => buildQuery().eq('purok_id', purokId));
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
