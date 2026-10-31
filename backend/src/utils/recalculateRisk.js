// utils/recalculateRisk.js
// Utility to recalculate and persist a resident's risk score.
// Called after any data change that affects risk (conditions, vitals, schedules).

import { supabase } from '../config/supabase.js';
import { calculateCompositeRiskScore } from './riskCalculator.js';

/**
 * Recalculate risk score for a single resident and persist to residents table.
 * Returns the updated risk data.
 */
export const recalculateAndPersistRisk = async (residentId) => {
  // Fetch every independent input in one round-trip wave. These four reads
  // used to run one after another (four sequential remote calls) on every
  // save, which is most of the latency behind "save/update resident".
  const [
    { data: resident, error: rErr },
    { data: conditions },
    { data: vitals },
    { data: lastCompleted },
  ] = await Promise.all([
    supabase
      .from('residents')
      .select('resident_id, age, date_of_birth')
      .eq('resident_id', residentId)
      .single(),
    supabase
      .from('resident_chronic_conditions')
      .select('condition_name')
      .eq('resident_id', residentId),
    supabase
      .from('resident_vital_signs')
      .select('blood_pressure, blood_sugar, heart_rate, temperature, weight, height, bmi')
      .eq('resident_id', residentId)
      .maybeSingle(),
    // Most recent Completed visit — the reset rule below depends on it.
    supabase
      .from('schedules')
      .select('date')
      .eq('resident_id', residentId)
      .eq('status', 'Completed')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (rErr || !resident) return null;

  // Count missed checkups — reset rule: only missed dated AFTER the
  // resident's most recent Completed visit count (completed clears prior).
  let missedCheckups = 0;
  {
    let missedQuery = supabase
      .from('schedules')
      .select('*', { count: 'exact', head: true })
      .eq('resident_id', residentId)
      .eq('status', 'Missed');
    if (lastCompleted?.date) missedQuery = missedQuery.gt('date', lastCompleted.date);
    const { count } = await missedQuery;
    missedCheckups = count || 0;
  }

  const risk = calculateCompositeRiskScore({
    age: resident.age,
    dateOfBirth: resident.date_of_birth,
    conditions: conditions?.map(c => c.condition_name) || [],
    vitals,
    missedCheckups: missedCheckups || 0,
  });

  // Persist to residents table
  await supabase
    .from('residents')
    .update({
      risk_score: risk.score,
      risk_level: risk.classification,
    })
    .eq('resident_id', residentId);

  return {
    riskScore: risk.score,
    riskLevel: risk.classification,
  };
};

/**
 * Batch recalculate risk for all residents.
 * Used for initial migration and periodic refresh.
 */
export const recalculateAllRisks = async () => {
  const { data: residents, error } = await supabase
    .from('residents')
    .select('resident_id');
  if (error) throw error;

  let count = 0;
  for (const r of residents || []) {
    await recalculateAndPersistRisk(r.resident_id);
    count++;
  }
  return count;
};
