import { supabase } from '../config/supabase.js';
import { matchesFocusGroup } from '../utils/workerScope.js';
import { workerLinkedBySchedule } from './residentController.js';
import {
  sendValidationError,
  trimText,
  validateMedicinePayload,
} from '../utils/validators.js';

// Per-dose descriptions: [{ dose, description }]
// One free-text field per dose (optional — empty descriptions are
// dropped). Sanitized so bad input can never break the insert;
// returns null when nothing usable was given.
const normalizeDoseIntervals = (value) => {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const entry of value.slice(0, 20)) {
    const dose = Number.parseInt(entry?.dose, 10);
    if (!Number.isFinite(dose) || dose < 1) continue;
    const description = String(entry?.description ?? '').trim() || null;
    if (!description) continue;
    if (out.some((e) => e.dose === dose)) continue;
    out.push({ dose, description });
  }
  out.sort((a, b) => a.dose - b.dose);
  return out.length ? out : null;
};

// Same shape, but keeps an array (for reads).
const sanitizeIntervals = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((e) => e && Number.isFinite(Number(e?.dose)) && Number(e?.dose) >= 1)
    .map((e) => ({ dose: Number(e.dose), description: String(e?.description ?? '').trim() || null }))
    .filter((e) => {
      if (seen.has(e.dose)) return false;
      seen.add(e.dose);
      return true;
    })
    .sort((a, b) => a.dose - b.dose);
};

// True when a Supabase error means the interval migration hasn't run.
const isMissingColumnError = (error) => {
  if (!error) return false;
  const msg = String(error.message || '');
  const code = String(error.code || '');
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    /column .* does not exist/i.test(msg) ||
    /could not find .* column/i.test(msg)
  );
};

// BHW Workers may touch medicine records of residents in their handled
// purok or handled focus/vulnerable group (barangay-wide, e.g. all
// pregnant) — or of any resident linked to a schedule they are assigned
// to (as lead or via schedule_bhws). Returns the BHW name for
// attribution, or sends 403.
const assertWorkerOwnsResident = async (req, res, residentId) => {  if (req.user?.role !== 'BHW Worker') return { bhwName: null };
  if (!req.user?.bhwId) {
    res.status(403).json({ success: false, message: 'No BHW profile linked to this account' });
    return null;
  }
  const [{ data: me }, { data: resident }] = await Promise.all([
    supabase.from('bhws').select('assigned_purok_id, assigned_focus_group, name').eq('bhw_id', req.user.bhwId).maybeSingle(),
    supabase.from('residents').select('purok_id, focus_groups, age, date_of_birth').eq('resident_id', residentId).maybeSingle()
  ]);
  const assigned = me?.assigned_purok_id ?? req.user?.assignedPurokId ?? null;
  const focusGroup = me?.assigned_focus_group ?? req.user?.assignedFocusGroup ?? null;
  const inPurok = resident && assigned != null && String(resident.purok_id) === String(assigned);
  const inFocus = resident && matchesFocusGroup(resident, focusGroup);
  const inSchedule = resident && !inPurok && !inFocus
    ? await workerLinkedBySchedule(req.user.bhwId, residentId)
    : false;
  if (!resident || (!inPurok && !inFocus && !inSchedule)) {
    res.status(403).json({ success: false, message: 'You can only manage medicine records for residents in your handled purok or focus group' });
    return null;
  }
  return { bhwName: me?.name || null };
};

export const getAllMedicines = async (req, res) => {
  try { const { category } = req.query; let query = supabase.from('medicine_master').select('*').order('created_at', { ascending: false }); if (category) query = query.eq('category', category); const { data, error } = await query; if (error) throw error; res.json({ success: true, data }); }
  catch (error) { console.error('Error fetching medicines:', error); res.status(500).json({ success: false, message: 'Failed to fetch medicines' }); }
};

export const createMedicine = async (req, res) => {
  try {
    const errors = validateMedicinePayload(req.body || {});
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const { medicine_name, category, total_doses, target_group, description, requires_interval, dose_intervals } = req.body;
    const payload = { medicine_name: trimText(medicine_name), category: category || 'vaccine', total_doses: parseInt(total_doses, 10) || 1, target_group: target_group || 'all', description: trimText(description), requires_interval: !!requires_interval, dose_intervals: normalizeDoseIntervals(dose_intervals) };
    let { data, error } = await supabase.from('medicine_master').insert(payload).select().single();
    if (error && isMissingColumnError(error) && (payload.dose_intervals || payload.requires_interval)) { delete payload.dose_intervals; delete payload.requires_interval; ({ data, error } = await supabase.from('medicine_master').insert(payload).select().single()); }
    if (error) { if (error.code === '23505') return res.status(400).json({ success: false, message: 'A medicine with this name already exists', errors: { medicine_name: 'A medicine with this name already exists.' } }); throw error; }
    res.status(201).json({ success: true, data });
  }
  catch (error) { console.error('Error creating medicine:', error); res.status(500).json({ success: false, message: 'Failed to create medicine' }); }
};

export const updateMedicine = async (req, res) => {
  try {
    const errors = validateMedicinePayload(req.body || {}, { partial: true });
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const { id } = req.params; const { medicine_name, category, total_doses, target_group, description, is_active, requires_interval, dose_intervals } = req.body; const updateData = { updated_at: new Date() }; if (medicine_name !== undefined) updateData.medicine_name = trimText(medicine_name); if (category !== undefined) updateData.category = category; if (total_doses !== undefined) updateData.total_doses = parseInt(total_doses, 10); if (target_group !== undefined) updateData.target_group = target_group; if (description !== undefined) updateData.description = trimText(description); if (is_active !== undefined) updateData.is_active = is_active; if (requires_interval !== undefined) updateData.requires_interval = !!requires_interval; if (dose_intervals !== undefined) updateData.dose_intervals = normalizeDoseIntervals(dose_intervals); let { data, error } = await supabase.from('medicine_master').update(updateData).eq('id', id).select().maybeSingle(); if (error && isMissingColumnError(error) && (updateData.dose_intervals || updateData.requires_interval)) { delete updateData.dose_intervals; delete updateData.requires_interval; ({ data, error } = await supabase.from('medicine_master').update(updateData).eq('id', id).select().maybeSingle()); } if (error) throw error; if (!data) return res.status(404).json({ success: false, message: 'Medicine not found' }); res.json({ success: true, data });
  }
  catch (error) { console.error('Error updating medicine:', error); res.status(500).json({ success: false, message: 'Failed to update medicine' }); }
};

export const deleteMedicine = async (req, res) => {
  try { const { data: existing, error: existingError } = await supabase.from('medicine_master').select('id').eq('id', req.params.id).maybeSingle(); if (existingError) throw existingError; if (!existing) return res.status(404).json({ success: false, message: 'Medicine not found' }); const { error } = await supabase.from('medicine_master').delete().eq('id', req.params.id); if (error) throw error; res.json({ success: true, message: 'Medicine deleted successfully' }); }
  catch (error) { console.error('Error deleting medicine:', error); res.status(500).json({ success: false, message: 'Failed to delete medicine' }); }
};

export const getResidentMedicines = async (req, res) => {
  try {
    const { residentId } = req.params;
    const scope = await assertWorkerOwnsResident(req, res, residentId);
    if (!scope) return;
    const { data: resident, error: residentError } = await supabase.from('residents').select('focus_groups, age, gender').eq('resident_id', residentId).maybeSingle();
    if (residentError || !resident) return res.status(404).json({ success: false, message: 'Resident not found' });
    const focusGroups = resident.focus_groups || []; const age = resident.age || 0; const gender = resident.gender;
    let applicableGroups = ['all'];
    if (focusGroups.includes('pregnant') || gender === 'Female') applicableGroups.push('pregnant');
    if (focusGroups.includes('infant') || age <= 5) applicableGroups.push('infant');
    if (focusGroups.includes('senior') || age >= 60) applicableGroups.push('senior');
    if (focusGroups.includes('pwd')) applicableGroups.push('pwd');
    if (focusGroups.includes('withCondition')) applicableGroups.push('withCondition');
    const { data: schedules, error: schedulesError } = await supabase.from('medicine_master').select('*').in('target_group', applicableGroups).eq('is_active', true).order('category').order('medicine_name');
    if (schedulesError) throw schedulesError;
    const { data: records, error: recordsError } = await supabase.from('resident_medicine_records').select('*').eq('resident_id', residentId).order('created_at', { ascending: false });
    if (recordsError) throw recordsError;
    const medicineStatus = (schedules || []).map(schedule => {
      const takenDoses = (records || []).filter(r => r.medicine_master_id === schedule.id || r.medicine_name === schedule.medicine_name).sort((a, b) => a.dose_number - b.dose_number);
      const completedDoses = takenDoses.length; const dosesLeft = Math.max(0, schedule.total_doses - completedDoses);
      let status = 'not_started'; if (completedDoses >= schedule.total_doses) status = 'completed'; else if (completedDoses > 0) status = 'in_progress';
      const nextDoseNumber = completedDoses + 1;
      const schedIntervals = sanitizeIntervals(schedule.dose_intervals);
      return { id: schedule.id, medicine_name: schedule.medicine_name, category: schedule.category, total_doses: schedule.total_doses, target_group: schedule.target_group, description: schedule.description, dose_intervals: schedIntervals, completedDoses, dosesLeft, status, nextDoseNumber, takenDoses: takenDoses.map(d => ({ id: d.id, doseNumber: d.dose_number, dateAdministered: d.date_administered, createdAt: d.created_at, facility: d.facility, batchNumber: d.batch_number, administrationSite: d.administration_site, administeredBy: d.administered_by, remarks: d.remarks })) };
    });
    // Category match is case-insensitive so rows saved with a custom
    // capitalisation (e.g. "Deworming") still reach the right picker.
    const catOf = (m) => String(m?.category || '').trim().toLowerCase();
    res.json({ success: true, data: { vaccines: medicineStatus.filter(m => catOf(m) === 'vaccine'), deworming: medicineStatus.filter(m => catOf(m) === 'deworming'), vitamins: medicineStatus.filter(m => catOf(m) === 'vitamins') } });
  } catch (error) { console.error('Error fetching resident medicines:', error); res.status(500).json({ success: false, message: 'Failed to fetch medicines' }); }
};

export const recordResidentMedicine = async (req, res) => {
  try {
    const { residentId } = req.params; const { medicine_master_id, medicine_name, category, dose_number, total_doses, date_administered, facility, batch_number, administration_site, administered_by, remarks } = req.body;
    const scope = await assertWorkerOwnsResident(req, res, residentId);
    if (!scope) return;
    const effectiveAdministeredBy = administered_by || scope.bhwName || null;
    const errors = {};
    if (!medicine_master_id) errors.medicine_master_id = 'Select a medicine.'
    if (!date_administered) errors.date_administered = 'Administration date is required.'
    else {
      const parsed = new Date(date_administered)
      if (Number.isNaN(parsed.getTime())) errors.date_administered = 'Enter a valid administration date.'
      else if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) errors.date_administered = 'Administration date cannot be in the future.'
    }
    const doseNumber = Number(dose_number)
    if (dose_number !== undefined && (!Number.isInteger(doseNumber) || doseNumber < 1 || doseNumber > 50)) {
      errors.dose_number = 'Dose number must be a whole number between 1 and 50.'
    }
    if (remarks !== undefined && trimText(remarks).length > 1000) errors.remarks = 'Remarks must be 1000 characters or fewer.'
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const newDate = new Date(date_administered);
    let { data: masterMed } = await supabase.from('medicine_master').select('medicine_name, category, total_doses, dose_intervals').eq('id', medicine_master_id).single();
    if (!masterMed) return res.status(400).json({ success: false, message: 'Medicine not found', errors: { medicine_master_id: 'Select a valid medicine.' } });
    // Older DBs may not have the interval column yet — retry without it.
    if (masterMed && masterMed.dose_intervals === undefined) {
      const retry = await supabase.from('medicine_master').select('medicine_name, category, total_doses').eq('id', medicine_master_id).single();
      if (retry.data) masterMed = { ...retry.data, dose_intervals: [] };
    }
    // Medicines stay selectable and re-recordable after completion: a new
    // administration starts a new dose cycle, so no total-doses cap here.
    // (The frontend sends the cycle-aware dose_number.)
    const { data, error } = await supabase.from('resident_medicine_records').insert({ resident_id: residentId, medicine_master_id, medicine_name: masterMed?.medicine_name || medicine_name, category: masterMed?.category || category || 'vaccine', dose_number: parseInt(dose_number) || 1, total_doses: parseInt(total_doses || masterMed?.total_doses || 1), date_administered, facility: facility || null, batch_number: batch_number || null, administration_site: administration_site || null, administered_by: effectiveAdministeredBy, remarks: remarks || null }).select().single();
    if (error) {
      if (error.code === '23503') return res.status(400).json({ success: false, message: 'Medicine not found', errors: { medicine_master_id: 'Select a valid medicine.' } });
      if (error.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid resident ID', errors: { residentId: 'Select a valid resident.' } });
      throw error;
    }
    res.status(201).json({ success: true, data });
  } catch (error) { console.error('Error recording medicine:', error); res.status(500).json({ success: false, message: 'Failed to record medicine' }); }
};

export const deleteResidentMedicine = async (req, res) => {
  try {
    // Dose-record deletion stays admin-only; workers record doses and report
    // corrections to the health center.
    if (req.user?.role === 'BHW Worker') {
      return res.status(403).json({ success: false, message: 'Only the administrator can delete medicine records. Please report corrections to the health center.' });
    }
    const { data: existing, error: existingError } = await supabase.from('resident_medicine_records').select('id').eq('id', req.params.recordId).maybeSingle(); if (existingError) throw existingError; if (!existing) return res.status(404).json({ success: false, message: 'Medicine record not found' }); const { error } = await supabase.from('resident_medicine_records').delete().eq('id', req.params.recordId); if (error) throw error; res.json({ success: true, message: 'Medicine record deleted' }); }
  catch (error) { console.error('Error deleting medicine record:', error); res.status(500).json({ success: false, message: 'Failed to delete record' }); }
};