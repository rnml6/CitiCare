import { supabase } from '../config/supabase.js';
import { calculateCompositeRiskScore } from '../utils/riskCalculator.js';
import { recalculateAndPersistRisk } from '../utils/recalculateRisk.js';
import {
  extractPrenatalFromBody,
  hasPrenatalContent,
  isMissingColumnError,
  mergePrenatal,
} from '../utils/prenatalFields.js';
import {
  extractPostpartumFromBody,
  hasPostpartumContent,
  mergePostpartum,
} from '../utils/postpartumFields.js';
import {
  sendValidationError,
  trimText,
  validateMedicalHistoryPayload,
  validateResidentPayload,
} from '../utils/validators.js';
import { fetchAllRows } from '../utils/paginate.js';

// --- Infant parent names + PWD disability columns (see
// add_resident_family_pwd_columns.sql). All access is tolerant: when the
// migration hasn't been run yet the API keeps working and these fields
// simply read as null.
let residentExtrasSupported = null;
let residentExtrasCheckedAt = 0;
// Negative results are re-probed after 60s so running the migration never
// requires a backend restart to take effect; positive results are kept.
const checkResidentExtras = async () => {
  const now = Date.now();
  if (residentExtrasSupported !== null && (residentExtrasSupported || now - residentExtrasCheckedAt < 60000)) {
    return residentExtrasSupported;
  }
  const { error } = await supabase.from('residents').select('mother_name').limit(1);
  residentExtrasSupported = !isMissingColumnError(error);
  residentExtrasCheckedAt = now;
  return residentExtrasSupported;
};

const fetchResidentExtras = async (residentId) => {
  const fallback = { mother_name: null, father_name: null, disability_type: null };
  try {
    if (!(await checkResidentExtras())) return fallback;
    const { data, error } = await supabase
      .from('residents')
      .select('mother_name, father_name, disability_type')
      .eq('resident_id', residentId)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      mother_name: data.mother_name ?? null,
      father_name: data.father_name ?? null,
      disability_type: data.disability_type ?? null,
    };
  } catch {
    return fallback;
  }
};

const cleanNullableText = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const getFullResidentData = async (residentId) => {
  // All of these reads are independent — fetch them in one wave instead of
  // eight sequential remote calls so create/update responses stay under the
  // 2-second save/retrieve budget.
  const [
    { data: resident, error: residentError },
    extras,
    { data: vitals },
    { data: conditions },
    { data: medications },
    { data: allergies },
    { data: medicalHistory },
  ] = await Promise.all([
    supabase
      .from('residents')
      .select(`resident_id, name, age, gender, date_of_birth, civil_status, contact_number, contact_person, contact_person_number, contact_person_address, last_checkup, focus_groups, is_pwd, vaccinations, created_at, purok_id, risk_score, risk_level, puroks:purok_id (purok_id, name)`)
      .eq('resident_id', residentId).single(),
    fetchResidentExtras(residentId),
    supabase.from('resident_vital_signs').select('*').eq('resident_id', residentId).maybeSingle(),
    supabase.from('resident_chronic_conditions').select('condition_name').eq('resident_id', residentId),
    supabase.from('resident_medications').select('*').eq('resident_id', residentId),
    supabase.from('resident_allergies').select('allergy_type, allergen').eq('resident_id', residentId),
    supabase
      .from('medical_histories')
      // Select * so structured prenatal columns are returned when the
      // add_prenatal_fields_to_medical_histories.sql migration has run,
      // while older databases simply return the legacy columns.
      .select(`*`)
      .eq('resident_id', residentId)
      .order('created_at', { ascending: false }),
  ]);
  if (residentError || !resident) return null;

  const historyIds = medicalHistory?.map(h => h.history_id) || [];

  // Second wave: history vitals plus the missed-checkup lookup (which only
  // needs the most recent Completed visit).
  const [{ data: historyVitals, error: vitalsError }, { data: lastCompleted }] = await Promise.all([
    historyIds.length > 0
      ? supabase
        .from('medical_history_vitals')
        .select('*')
        .in('history_id', historyIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('schedules')
      .select('date')
      .eq('resident_id', residentId)
      .eq('status', 'Completed')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const vitalsMap = {};
  if (vitalsError) {
    console.error('Error fetching medical_history_vitals:', vitalsError);
  }
  if (historyVitals) {
    historyVitals.forEach(v => { vitalsMap[v.history_id] = v; });
  }

  // Recalculate live for detail view (only 1 resident, acceptable cost)
  // Reset rule: only missed dated AFTER the last Completed visit count.
  let missedQuery = supabase
    .from('schedules')
    .select('*', { count: 'exact', head: true })
    .eq('resident_id', residentId)
    .eq('status', 'Missed');
  if (lastCompleted?.date) missedQuery = missedQuery.gt('date', lastCompleted.date);
  const { count: missedCheckups } = await missedQuery;

  const risk = calculateCompositeRiskScore({
    age: resident.age,
    dateOfBirth: resident.date_of_birth,
    conditions: conditions?.map(c => c.condition_name) || [],
    vitals,
    missedCheckups: missedCheckups || 0,
  });

  return {
    id: resident.resident_id, name: resident.name, age: resident.age, gender: resident.gender,
    dateOfBirth: resident.date_of_birth, civilStatus: resident.civil_status, purok: resident.puroks?.name || null,
    purokId: resident.purok_id, contactNumber: resident.contact_number, contactPerson: resident.contact_person,
    contactPersonNumber: resident.contact_person_number, contactPersonAddress: resident.contact_person_address,
    lastCheckup: resident.last_checkup, focusGroups: resident.focus_groups || [], isPwd: resident.is_pwd || false,
    motherName: extras.mother_name || null, fatherName: extras.father_name || null,
    disabilityType: extras.disability_type || null,
    vaccinations: resident.vaccinations || [], createdAt: resident.created_at,
    vitalSigns: vitals ? { bloodPressure: vitals.blood_pressure, heartRate: vitals.heart_rate, temperature: vitals.temperature, weight: vitals.weight, height: vitals.height, bloodSugar: vitals.blood_sugar, bmi: vitals.bmi } : null,
    chronicConditions: conditions?.map(c => c.condition_name) || [],
    currentMedications: medications || [],
    allergies: { drugs: allergies?.filter(a => a.allergy_type === 'drug').map(a => a.allergen) || [], food: allergies?.filter(a => a.allergy_type === 'food').map(a => a.allergen) || [], environmental: allergies?.filter(a => a.allergy_type === 'environmental').map(a => a.allergen) || [] },
    medicalHistory: medicalHistory?.map(h => {
      const v = vitalsMap[h.history_id];
      return {
        id: h.history_id, date: h.date, type: h.type, location: h.location, facility: h.facility,
        diagnosis: h.diagnosis, treatment: h.treatment, notes: h.notes, createdAt: h.created_at,
        administeredBy: h.administered_by,
        chronicConditions: h.chronic_conditions || [],
        currentMedications: h.current_medications || [],
        allergies: h.allergies || { drugs: [], food: [], environmental: [] },
        // Structured prenatal fields when present; falls back to parsing
        // the legacy notes lines for records saved before the migration.
        prenatal: mergePrenatal(h),
        // Structured postpartum outcome when present (same notes fallback).
        postpartum: mergePostpartum(h),
        vitalSigns: v ? { bloodPressure: v.blood_pressure, heartRate: v.heart_rate, temperature: v.temperature, weight: v.weight, height: v.height, bloodSugar: v.blood_sugar, bmi: v.bmi } : null
      };
    }) || [],
    riskScore: risk.score,
    riskLevel: risk.classification,
    riskBreakdown: risk.breakdown,
    contributingFactors: risk.contributingFactors,
  };
};

// Batch-fetch: reads cached risk_score/risk_level from residents table.
// Paged (PostgREST caps responses at 1000 rows) and batched by id so both
// the Residents list and the Add Schedule resident picker are complete.
export const getAllResidents = async (req, res) => {
  try {
    // One query instead of two: the infant/PWD extras columns are selected
    // together with the main row when the migration has been applied. The old
    // code fetched the list, then re-fetched every resident again in batches
    // of 500 ids just to read mother_name / father_name / disability_type —
    // eight extra sequential Supabase round trips for a barangay this size.
    const extrasSupported = await checkResidentExtras();
    const baseColumns = `resident_id, name, age, gender, date_of_birth, purok_id, focus_groups, is_pwd, puroks:purok_id (name), contact_number, contact_person, contact_person_number, last_checkup, risk_score, risk_level`;
    const columns = extrasSupported
      ? `${baseColumns}, mother_name, father_name, disability_type`
      : baseColumns;

    // Supabase caps one response at 1000 rows; without paging the Residents
    // list and the Add Schedule resident picker silently lose everyone
    // outside the first page.
    const buildQuery = () => {
      let query = supabase
        .from('residents')
        .select(columns)
        .order('created_at', { ascending: false })
        // Stable tiebreaker so page boundaries never repeat/skip a resident.
        .order('resident_id', { ascending: true });
      if (req.user?.role === 'BHW Worker') query = query.in('resident_id', req.user.residentIds?.length ? req.user.residentIds : [0]);
      return query;
    };
    const residents = await fetchAllRows(buildQuery);

    const residentsWithRisk = (residents || []).map(r => ({
      id: r.resident_id,
      name: r.name,
      age: r.age,
      gender: r.gender,
      dateOfBirth: r.date_of_birth,
      purok: r.puroks?.name || null,
      purokId: r.purok_id,
      contactNumber: r.contact_number,
      contactPerson: r.contact_person,
      contactPersonNumber: r.contact_person_number,
      lastCheckup: r.last_checkup,
      focusGroups: r.focus_groups || [],
      isPwd: r.is_pwd || false,
      motherName: r.mother_name || null,
      fatherName: r.father_name || null,
      disabilityType: r.disability_type || null,
      riskScore: r.risk_score ?? 0,
      riskLevel: r.risk_level || 'Low Risk',
    }));

    // NOTE: risk score/level are read straight from the residents table
    // (risk_score / risk_level columns) — no live recompute on the read
    // path. Recomputing here meant every Residents-tab and Dashboard load
    // paged through the whole barangay and re-fetched every condition/vital/
    // schedule row before responding. The authoritative recompute now runs
    // only after writes (see recalculateAndPersistRisk) or via the background
    // risk-heal flow, so cached values stay fresh without slowing reads.
    res.json({ success: true, data: residentsWithRisk });
  } catch (error) { 
    console.error('Error fetching residents:', error); 
    res.status(500).json({ success: false, message: 'Failed to fetch residents' }); 
  }
};

// Resolve the requester's authoritative assignment (not the token copy,
// which can go stale after an admin reassignment).
const getRequesterAssignment = async (req) => {
  if (!req.user?.bhwId) return { purokId: null, focusGroup: null, bhwName: null };
  const { data, error } = await supabase
    .from('bhws')
    .select('assigned_purok_id, assigned_focus_group, name')
    .eq('bhw_id', req.user.bhwId)
    .maybeSingle();
  if (error) throw error;
  return {
    purokId: data?.assigned_purok_id ?? null,
    focusGroup: data?.assigned_focus_group ?? null,
    bhwName: data?.name || null
  };
};

// Schedule-linked access: a BHW Worker assigned to a schedule (as lead or
// via schedule_bhws) may view/manage that schedule's resident even outside
// their handled purok/focus scope.
export const workerLinkedBySchedule = async (bhwId, residentId) => {
  if (!bhwId || residentId == null || residentId === '') return false;
  // .limit(1): a BHW may own several schedules for the same resident —
  // maybeSingle() would throw on multiple rows.
  const { data: lead } = await supabase
    .from('schedules')
    .select('schedule_id')
    .eq('resident_id', residentId)
    .eq('bhw_id', bhwId)
    .limit(1)
    .maybeSingle();
  if (lead) return true;
  const { data: links } = await supabase
    .from('schedule_bhws')
    .select('schedule_id')
    .eq('bhw_id', bhwId);
  const ids = (links || []).map(l => l.schedule_id).filter(v => v != null);
  if (ids.length === 0) return false;
  const { data: linked } = await supabase
    .from('schedules')
    .select('schedule_id')
    .eq('resident_id', residentId)
    .in('schedule_id', ids)
    .limit(1)
    .maybeSingle();
  return !!linked;
};

export const workerMayAccessResident = async (req, residentId) => {
  if ((req.user.residentIds || []).some(id => String(id) === String(residentId))) return true;
  return workerLinkedBySchedule(req.user?.bhwId, residentId);
};

const residentMatchesFocus = (r, focusGroup) => {
  if (!focusGroup) return false;
  const g = String(focusGroup).toLowerCase();
  const groups = (r.focus_groups || []).map(x => String(x).toLowerCase());
  if (groups.includes(g)) return true;
  if (g === 'senior') {
    if (groups.includes('seniorcitizen') || groups.includes('senior citizen')) return true;
    if (r.date_of_birth) {
      const b = new Date(r.date_of_birth);
      if (!isNaN(b.getTime())) {
        let years = new Date().getFullYear() - b.getFullYear();
        const m = new Date().getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && new Date().getDate() < b.getDate())) years--;
        if (years >= 60) return true;
      }
    }
    if (parseInt(r.age, 10) >= 60) return true;
  }
  if (g === 'infant') {
    if (groups.includes('children') || groups.includes('child')) return true;
    if (r.date_of_birth) {
      const b = new Date(r.date_of_birth);
      if (!isNaN(b.getTime())) {
        const months = (new Date().getFullYear() - b.getFullYear()) * 12 + (new Date().getMonth() - b.getMonth());
        if (months >= 0 && months < 60) return true;
      }
    }
    const y = parseInt(r.age, 10);
    if (Number.isFinite(y) && y >= 0 && y < 5) return true;
  }
  return false;
};

// Token-scoped lists for the BHW portal: all residents in the handled
// purok, plus the handled focus/vulnerable-group subset.
export const getMyResidents = async (req, res) => {
  try {
    const { purokId, focusGroup } = await getRequesterAssignment(req);
    if (!purokId && !focusGroup) {
      return res.json({
        success: true,
        data: {
          purok: null, focusGroup: focusGroup || null,
          purokResidents: [], focusResidents: [],
          counts: { purok: 0, focus: 0, critical: 0, high: 0 }
        }
      });
    }
    let purok = null;
    if (purokId != null) {
      const { data: purokRow } = await supabase
        .from('puroks')
        .select('purok_id, name')
        .eq('purok_id', purokId)
        .maybeSingle();
      purok = purokRow || null;
    }
    // A focus-group worker needs the whole barangay (their group is
    // barangay-wide) AND their own purok. Fetch the wide list once and derive
    // the purok subset from it instead of scanning the barangay twice.
    const extrasSupported = await checkResidentExtras();
    const baseColumns = `resident_id, name, age, gender, date_of_birth, purok_id, focus_groups, is_pwd, puroks:purok_id (name), contact_number, contact_person, contact_person_number, last_checkup, risk_score, risk_level`;
    const columns = extrasSupported
      ? `${baseColumns}, mother_name, father_name, disability_type`
      : baseColumns;

    const fetchResidentRows = (purokFilter) => fetchAllRows(() => {
      let query = supabase.from('residents').select(columns);
      if (purokFilter != null) query = query.eq('purok_id', purokFilter);
      return query
        .order('name', { ascending: true })
        .order('resident_id', { ascending: true });
    });

    const map = (r) => ({
      id: r.resident_id, name: r.name, age: r.age, gender: r.gender,
      dateOfBirth: r.date_of_birth, purok: r.puroks?.name || purok?.name || null,
      purokId: r.purok_id, contactNumber: r.contact_number, contactPerson: r.contact_person,
      contactPersonNumber: r.contact_person_number, lastCheckup: r.last_checkup,
      focusGroups: r.focus_groups || [], isPwd: r.is_pwd || false,
      motherName: r.mother_name || null,
      fatherName: r.father_name || null,
      disabilityType: r.disability_type || null,
      riskScore: r.risk_score ?? 0, riskLevel: r.risk_level || 'Low Risk'
    });

    let handledResidents;
    let focusResidents = [];
    if (focusGroup) {
      const allResidents = await fetchResidentRows(null);
      const purokRows = purokId == null
        ? []
        : allResidents.filter(r => String(r.purok_id) === String(purokId));
      focusResidents = allResidents.filter(r => residentMatchesFocus(r, focusGroup)).map(map);
      handledResidents = purokRows.map(map);
    } else {
      handledResidents = (await fetchResidentRows(purokId)).map(map);
    }

    // NOTE: risk score/level for BHW lists also come straight from the
    // residents table columns (risk_score / risk_level) — no live recompute
    // on the read path, same as the admin list above. Risk freshness after a
    // write is handled by recalculateAndPersistRisk; no per-read recompute
    // means the resident list loads are single-query reads again.

    const purokResidents = handledResidents.filter(r => purokId != null && String(r.purokId) === String(purokId));
    const isElevated = (r) => String(r.riskLevel || '').toLowerCase().includes('critical') || String(r.riskLevel || '').toLowerCase().includes('high');
    res.json({
      success: true,
      data: {
        purok: purok ? { id: purok.purok_id, name: purok.name } : { id: purokId, name: null },
        focusGroup: focusGroup || null,
        purokResidents, focusResidents, handledResidents,
        counts: {
          purok: purokResidents.length,
          focus: focusResidents.length,
          critical: purokResidents.filter(r => String(r.riskLevel).toLowerCase().includes('critical')).length,
          high: purokResidents.filter(r => String(r.riskLevel).toLowerCase().includes('high')).length,
          elevated: purokResidents.filter(isElevated).length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching my residents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch residents' });
  }
};

export const getResidentById = async (req, res) => {
  try {
    const resident = await getFullResidentData(req.params.id);
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found' });
    if (req.user?.role === 'BHW Worker') {
      const assignment = await getRequesterAssignment(req);
      if (!(await workerMayAccessResident(req, resident.id))) {
        return res.status(403).json({ success: false, message: 'You can only view residents in your handled purok or focus group' });
      }
    }
    res.json({ success: true, data: resident });
  }
  catch (error) { console.error('Error fetching resident:', error); res.status(500).json({ success: false, message: 'Failed to fetch resident' }); }
};

export const createResident = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateResidentPayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { name, age, gender, dateOfBirth, civilStatus, purokId, contactNumber, contactPerson, contactPersonNumber, contactPersonAddress, lastCheckup, focusGroups, isPwd, motherName, fatherName, disabilityType, vaccinations, vitalSigns, chronicConditions, currentMedications, allergies, medicalHistory } = body;
    const cleanName = trimText(name);
    // BHW Workers: every resident they register falls in their assigned purok.
    let effectivePurokId = purokId || null;
    if (req.user?.role === 'BHW Worker') {
      const assignment = await getRequesterAssignment(req);
      if (!assignment.purokId) {
        return res.status(403).json({ success: false, message: 'No purok assigned to your account. Please contact the administrator.' });
      }
      effectivePurokId = assignment.purokId;
    }
    // Age 0 is valid (infants) — fall back to computing it from date of birth.
    let ageValue = (age === 0 || age === '0') ? 0 : (parseInt(age) || 0);
    if (!ageValue && dateOfBirth) {
      const today = new Date();
      const birth = new Date(dateOfBirth);
      ageValue = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) ageValue--;
      if (ageValue < 0) ageValue = 0;
    }
    const extrasPayload = {
      mother_name: cleanNullableText(motherName),
      father_name: cleanNullableText(fatherName),
      disability_type: cleanNullableText(disabilityType),
    };
    // PWD flag stays consistent with the focus-group checkbox.
    const pwdValue = isPwd !== undefined ? !!isPwd : (focusGroups || []).includes('pwd');
    const basePayload = { name: cleanName, age: ageValue, gender, date_of_birth: dateOfBirth, civil_status: civilStatus || 'Single', purok_id: effectivePurokId || null, contact_number: cleanNullableText(contactNumber), contact_person: cleanNullableText(contactPerson), contact_person_number: cleanNullableText(contactPersonNumber), contact_person_address: cleanNullableText(contactPersonAddress), last_checkup: lastCheckup || null, focus_groups: focusGroups || [], is_pwd: pwdValue, vaccinations: vaccinations || [] };
    let resident = null;
    {
      const withExtras = (await checkResidentExtras()) ? { ...basePayload, ...extrasPayload } : basePayload;
      const { data, error } = await supabase.from('residents').insert(withExtras).select().single();
      if (error) {
        // Migration not run yet (or stale cache) — retry without new columns.
        if (isMissingColumnError(error)) {
          residentExtrasSupported = false; residentExtrasCheckedAt = Date.now();
          const retry = await supabase.from('residents').insert(basePayload).select().single();
          if (retry.error) throw retry.error;
          resident = retry.data;
        } else {
          throw error;
        }
      } else {
        resident = data;
      }
    }
    if (!resident) throw new Error('Failed to create resident');
    const residentId = resident.resident_id;
    // Independent child rows are written in parallel. Previously each table
    // (vitals, conditions, medicines, allergies, history) waited for the
    // previous one, stacking several remote round trips onto every save.
    const childWrites = [];
    if (vitalSigns && Object.values(vitalSigns).some(v => v)) childWrites.push(supabase.from('resident_vital_signs').insert({ resident_id: residentId, blood_pressure: vitalSigns.bloodPressure || null, heart_rate: vitalSigns.heartRate || null, temperature: vitalSigns.temperature || null, weight: vitalSigns.weight || null, height: vitalSigns.height || null, blood_sugar: vitalSigns.bloodSugar || null, bmi: vitalSigns.bmi || null }));
    if (chronicConditions?.length > 0) childWrites.push(supabase.from('resident_chronic_conditions').insert(chronicConditions.map(c => ({ resident_id: residentId, condition_name: typeof c === 'string' ? c : JSON.stringify(c) }))));
    if (currentMedications?.length > 0) childWrites.push(supabase.from('resident_medications').insert(currentMedications.map(m => ({ resident_id: residentId, name: m.name || m, dosage: m.dosage || null, frequency: m.frequency || null }))));
    if (allergies) { const inserts = []; if (allergies.drugs) allergies.drugs.forEach(a => inserts.push({ resident_id: residentId, allergy_type: 'drug', allergen: a })); if (allergies.food) allergies.food.forEach(a => inserts.push({ resident_id: residentId, allergy_type: 'food', allergen: a })); if (allergies.environmental) allergies.environmental.forEach(a => inserts.push({ resident_id: residentId, allergy_type: 'environmental', allergen: a })); if (inserts.length > 0) childWrites.push(supabase.from('resident_allergies').insert(inserts)); }
    if (medicalHistory?.length > 0) {
      childWrites.push(Promise.all(medicalHistory.map(async (r) => {
        const { data: h } = await supabase.from('medical_histories').insert({ resident_id: residentId, date: r.date || new Date().toISOString().split('T')[0], type: r.type || 'Checkup', location: r.location || 'Barangay', facility: r.facility || 'Barangay Health Center', diagnosis: r.diagnosis || '', treatment: r.treatment || '', notes: r.notes || '', administered_by: r.administeredBy || null, chronic_conditions: r.chronicConditions || [], current_medications: r.currentMedications || [], allergies: r.allergies || { drugs: [], food: [], environmental: [] } }).select().single();
        if (h && r.vitalSigns && Object.values(r.vitalSigns).some(v => v)) await supabase.from('medical_history_vitals').insert({ history_id: h.history_id, blood_pressure: r.vitalSigns.bloodPressure || null, heart_rate: r.vitalSigns.heartRate || null, temperature: r.vitalSigns.temperature || null, weight: r.vitalSigns.weight || null, height: r.vitalSigns.height || null, blood_sugar: r.vitalSigns.bloodSugar || null, bmi: r.vitalSigns.bmi || null });
      })));
    }
    await Promise.all(childWrites);
    // Persist risk score after creation
    await recalculateAndPersistRisk(residentId);
    const newResident = await getFullResidentData(residentId);
    res.status(201).json({ success: true, data: newResident });
  } catch (error) { console.error('Error creating resident:', error); res.status(500).json({ success: false, message: 'Failed to create resident' }); }
};

export const updateResident = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateResidentPayload(body, { partial: true });
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { id } = req.params;
    const { name, age, gender, dateOfBirth, civilStatus, purokId, contactNumber, contactPerson, contactPersonNumber, contactPersonAddress, lastCheckup, focusGroups, isPwd, motherName, fatherName, disabilityType, vaccinations, vitalSigns, chronicConditions, currentMedications, allergies } = body;
    // Include the risk-relevant columns so riskDirty can compare real values
    // instead of always treating undefined as a change (which forced a full
    // risk recalculation on every contact-only edit).
    const { data: existing, error: existingError } = await supabase.from('residents').select('resident_id, purok_id, age, date_of_birth, focus_groups, is_pwd, vaccinations').eq('resident_id', id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ success: false, message: 'Resident not found' });
    if (req.user?.role === 'BHW Worker') {
      const assignment = await getRequesterAssignment(req);
      if (!(req.user.residentIds || []).some(residentId => String(residentId) === String(id))) {
        return res.status(403).json({ success: false, message: 'You can only update residents in your handled purok or focus group' });
      }
    }
    const updateData = {};
    if (name !== undefined) updateData.name = trimText(name); if (age !== undefined) updateData.age = Number(age); if (gender !== undefined) updateData.gender = gender;
    if (dateOfBirth !== undefined) updateData.date_of_birth = dateOfBirth || null; if (civilStatus !== undefined) updateData.civil_status = civilStatus;
    if (purokId !== undefined) {
      // Workers cannot move residents out of their handled purok.
      if (req.user?.role === 'BHW Worker') {
        const assignment = await getRequesterAssignment(req);
        if (String(purokId || '') !== String(existing.purok_id || '')) {
          return res.status(403).json({ success: false, message: 'Residents must stay in your assigned purok' });
        }
        updateData.purok_id = existing.purok_id;
      } else {
        updateData.purok_id = purokId || null;
      }
    }
    if (contactNumber !== undefined) updateData.contact_number = cleanNullableText(contactNumber);
    if (contactPerson !== undefined) updateData.contact_person = cleanNullableText(contactPerson); if (contactPersonNumber !== undefined) updateData.contact_person_number = cleanNullableText(contactPersonNumber);
    if (contactPersonAddress !== undefined) updateData.contact_person_address = cleanNullableText(contactPersonAddress); if (lastCheckup !== undefined) updateData.last_checkup = lastCheckup || null;
    if (focusGroups !== undefined) updateData.focus_groups = focusGroups; if (isPwd !== undefined) updateData.is_pwd = isPwd;
    if (vaccinations !== undefined) updateData.vaccinations = vaccinations;
    // Infant parent names + PWD disability (only when the client sends them).
    const extrasUpdate = {};
    if (motherName !== undefined) extrasUpdate.mother_name = cleanNullableText(motherName);
    if (fatherName !== undefined) extrasUpdate.father_name = cleanNullableText(fatherName);
    if (disabilityType !== undefined) extrasUpdate.disability_type = cleanNullableText(disabilityType);
    if (Object.keys(extrasUpdate).length > 0 && await checkResidentExtras()) {
      Object.assign(updateData, extrasUpdate);
    }
    // Run every independent child-table write in parallel. Each branch keeps
    // its own delete-then-insert order; only the branches overlap.
    const writes = [];
    if (Object.keys(updateData).length > 0) {
      writes.push((async () => {
        const { error: updateError } = await supabase.from('residents').update(updateData).eq('resident_id', id);
        if (updateError) {
          // Migration not run yet (or stale cache) — retry without new columns.
          if (isMissingColumnError(updateError) && Object.keys(extrasUpdate).length > 0) {
            residentExtrasSupported = false; residentExtrasCheckedAt = Date.now();
            const baseUpdate = { ...updateData };
            for (const k of Object.keys(extrasUpdate)) delete baseUpdate[k];
            if (Object.keys(baseUpdate).length > 0) {
              const { error: retryError } = await supabase.from('residents').update(baseUpdate).eq('resident_id', id);
              if (retryError) throw retryError;
            }
          } else {
            throw updateError;
          }
        }
      })());
    }
    if (vitalSigns) writes.push((async () => { const vd = { blood_pressure: vitalSigns.bloodPressure || null, heart_rate: vitalSigns.heartRate || null, temperature: vitalSigns.temperature || null, weight: vitalSigns.weight || null, height: vitalSigns.height || null, blood_sugar: vitalSigns.bloodSugar || null, bmi: vitalSigns.bmi || null }; const { data: ev, error: evError } = await supabase.from('resident_vital_signs').select('resident_id').eq('resident_id', id).maybeSingle(); if (evError) throw evError; if (ev) { const { error: upError } = await supabase.from('resident_vital_signs').update(vd).eq('resident_id', id); if (upError) throw upError; } else if (Object.values(vd).some(v => v !== null)) { const { error: insError } = await supabase.from('resident_vital_signs').insert({ resident_id: id, ...vd }); if (insError) throw insError; } })());
    if (chronicConditions !== undefined) writes.push((async () => { const { error: delError } = await supabase.from('resident_chronic_conditions').delete().eq('resident_id', id); if (delError) throw delError; if (chronicConditions.length > 0) { const { error: insError } = await supabase.from('resident_chronic_conditions').insert(chronicConditions.map(c => ({ resident_id: id, condition_name: typeof c === 'string' ? c : JSON.stringify(c) }))); if (insError) throw insError; } })());
    if (currentMedications !== undefined) writes.push((async () => { const { error: delError } = await supabase.from('resident_medications').delete().eq('resident_id', id); if (delError) throw delError; if (currentMedications.length > 0) { const { error: insError } = await supabase.from('resident_medications').insert(currentMedications.map(m => ({ resident_id: id, name: m.name || m, dosage: m.dosage || null, frequency: m.frequency || null }))); if (insError) throw insError; } })());
    if (allergies) writes.push((async () => { const { error: delError } = await supabase.from('resident_allergies').delete().eq('resident_id', id); if (delError) throw delError; const inserts = []; if (allergies.drugs) allergies.drugs.forEach(a => inserts.push({ resident_id: id, allergy_type: 'drug', allergen: a })); if (allergies.food) allergies.food.forEach(a => inserts.push({ resident_id: id, allergy_type: 'food', allergen: a })); if (allergies.environmental) allergies.environmental.forEach(a => inserts.push({ resident_id: id, allergy_type: 'environmental', allergen: a })); if (inserts.length > 0) { const { error: insError } = await supabase.from('resident_allergies').insert(inserts); if (insError) throw insError; } })());
    await Promise.all(writes);
    // Persist risk score after update — but only when a risk-relevant value
    // actually changed. The score is derived from age, date of birth, chronic
    // conditions and vital signs, so personal/contact-only edits (name,
    // phone, purok, emergency contact) must not trigger the full risk pipeline
    // (risk recompute + persist + detail re-read), which made minimal saves
    // unnecessarily slow.
    const riskDirty =
      (age !== undefined && Number(existing?.age ?? -1) !== Number(age)) ||
      (dateOfBirth !== undefined && String(existing?.date_of_birth ?? '') !== String(dateOfBirth || '')) ||
      (focusGroups !== undefined && JSON.stringify(existing?.focus_groups || []) !== JSON.stringify(focusGroups || [])) ||
      (isPwd !== undefined && Boolean(existing?.is_pwd) !== Boolean(isPwd)) ||
      (vaccinations !== undefined && JSON.stringify(existing?.vaccinations || []) !== JSON.stringify(vaccinations || [])) ||
      (chronicConditions !== undefined && (chronicConditions?.length || 0) > 0) ||
      (vitalSigns !== undefined && Object.values(vitalSigns || {}).some((v) => v !== null && v !== ''));
    if (riskDirty) {
      await recalculateAndPersistRisk(id);
    }
    const updatedResident = await getFullResidentData(id);
    res.json({ success: true, data: updatedResident });
  } catch (error) { console.error('Error updating resident:', error); res.status(500).json({ success: false, message: 'Failed to update resident' }); }
};

export const deleteResident = async (req, res) => {
  try {
    // Deleting master resident records stays admin-only. Workers correct
    // data through updates and medical records instead.
    if (req.user?.role === 'BHW Worker') {
      return res.status(403).json({ success: false, message: 'Only the administrator can delete resident records. Please report corrections to the health center.' });
    }
    const { data: existing, error: existingError } = await supabase.from('residents').select('resident_id, purok_id').eq('resident_id', req.params.id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ success: false, message: 'Resident not found' });
    const { error } = await supabase.from('residents').delete().eq('resident_id', req.params.id);
    if (error) throw error;
    res.json({ success: true, message: 'Resident deleted successfully' });
  }
  catch (error) { console.error('Error deleting resident:', error); res.status(500).json({ success: false, message: 'Failed to delete resident' }); }
};

export const addMedicalHistory = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateMedicalHistoryPayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { id } = req.params;
    const { date, type, location, facility, diagnosis, treatment, notes, vitalSigns, administered_by, chronicConditions, currentMedications, allergies } = body;
    
    const { data: resident, error: residentError } = await supabase.from('residents').select('resident_id, purok_id, last_checkup').eq('resident_id', id).maybeSingle();
    if (residentError) throw residentError;
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found' });
    let workerName = null;
    if (req.user?.role === 'BHW Worker') {
      const assignment = await getRequesterAssignment(req);
      workerName = assignment.bhwName;
      if (!(await workerMayAccessResident(req, id))) {
        return res.status(403).json({ success: false, message: 'You can only add records for residents in your handled purok or focus group' });
      }
      if (!req.body.administered_by) req.body.administered_by = workerName;
    }
    // Structured prenatal payload (Prenatal Checkup form → prenatal report).
    // Always serialized into notes by the frontend too, so records stay
    // readable when the migration hasn't been run yet.
    const prenatal = extractPrenatalFromBody(req.body);
    // MUAC date is automatic (== this checkup's date): the form no longer
    // asks for it, so default it here for any client that omits it.
    const visitDateStr = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
    if (prenatal.muac_cm !== null && prenatal.muac_cm !== undefined && !prenatal.muac_date) {
      prenatal.muac_date = visitDateStr;
    }
    const hasPrenatalPayload = hasPrenatalContent(prenatal);
    const prenatalPayload = hasPrenatalPayload ? { ...prenatal } : {};
    if (!hasPrenatalPayload) delete prenatalPayload.is_private_visit;

    const postpartum = extractPostpartumFromBody(req.body);
    const hasPostpartumPayload = hasPostpartumContent(postpartum);
    const postpartumPayload = hasPostpartumPayload ? { ...postpartum } : {};

    const basePayload = {
      resident_id: id,
      date: date || new Date().toISOString().split('T')[0],
      type: type || 'Checkup',
      location: location || 'Barangay',
      facility: facility || 'Barangay Health Center',
      diagnosis: diagnosis || '',
      treatment: treatment || '',
      notes: notes || '',
      // req.body is re-read (not the stale destructured var) so the BHW
      // auto-fill above is honored when the form leaves it blank.
      administered_by: req.body.administered_by || administered_by || workerName || null,
      chronic_conditions: chronicConditions || [],
      current_medications: currentMedications || [],
      allergies: allergies || { drugs: [], food: [], environmental: [] },
    };

    let history = null;
    let prenatalStructured = false;
    {
      const { data, error } = await supabase.from('medical_histories').insert({
        ...basePayload,
        ...prenatalPayload,
        ...postpartumPayload,
      }).select().single();

      if (error) {
        // A prenatal/postpartum migration may not have been run yet — retry
        // dropping the newest column sets first so encoding never breaks.
        if ((hasPrenatalPayload || hasPostpartumPayload) && isMissingColumnError(error)) {
          console.warn('Maternal columns missing, retrying without structured payload:', error.message);
          const retry = async (extra) => supabase.from('medical_histories').insert({
            ...basePayload,
            ...extra,
          }).select().single();
          let res = await retry({ ...prenatalPayload });
          if (res.error && hasPostpartumPayload && isMissingColumnError(res.error)) {
            res = await retry({ ...postpartumPayload });
          }
          if (res.error && isMissingColumnError(res.error)) {
            res = await retry({});
          }
          if (res.error) throw res.error;
          history = res.data;
          prenatalStructured = false;
        } else {
          throw error;
        }
      } else {
        history = data;
        prenatalStructured = true;
      }
    }

    let savedVitals = null;
    let vitalsOk = true;
    let vitalsErrorMsg = null;
    if (vitalSigns && Object.values(vitalSigns).some(v => v)) {
      const numOrNull = v => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const vd = {
        history_id: history.history_id,
        blood_pressure: vitalSigns.bloodPressure || null,
        heart_rate: numOrNull(vitalSigns.heartRate),
        temperature: numOrNull(vitalSigns.temperature),
        weight: numOrNull(vitalSigns.weight),
        height: numOrNull(vitalSigns.height),
        blood_sugar: numOrNull(vitalSigns.bloodSugar),
        bmi: numOrNull(vitalSigns.bmi)
      };
      const { data: insertedVitals, error: vitalsInsertError } = await supabase.from('medical_history_vitals').insert(vd).select().single();
      if (vitalsInsertError) {
        console.error('Error inserting medical_history_vitals:', vitalsInsertError);
        vitalsOk = false;
        vitalsErrorMsg = vitalsInsertError.message || null;
      } else {
        savedVitals = insertedVitals ? {
          bloodPressure: insertedVitals.blood_pressure,
          heartRate: insertedVitals.heart_rate,
          temperature: insertedVitals.temperature,
          weight: insertedVitals.weight,
          height: insertedVitals.height,
          bloodSugar: insertedVitals.blood_sugar,
          bmi: insertedVitals.bmi
        } : null;
      }
    }
    
    // last_checkup is the newest visit date — never move it backwards when
    // an older record is encoded late, so Dashboard == Resident Detail.
    {
      const visitDate = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
      const current = resident?.last_checkup ? String(resident.last_checkup).slice(0, 10) : null;
      if (!current || visitDate > current) {
        await supabase.from('residents').update({ last_checkup: visitDate }).eq('resident_id', id);
      }
    }
    
    if (vitalSigns && Object.values(vitalSigns).some(v => v)) {
      const numOrNull = v => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const vd = { blood_pressure: vitalSigns.bloodPressure || null, heart_rate: numOrNull(vitalSigns.heartRate), temperature: numOrNull(vitalSigns.temperature), weight: numOrNull(vitalSigns.weight), height: numOrNull(vitalSigns.height), blood_sugar: numOrNull(vitalSigns.bloodSugar), bmi: numOrNull(vitalSigns.bmi) };
      const { data: ev, error: evError } = await supabase.from('resident_vital_signs').select('resident_id').eq('resident_id', id).maybeSingle();
      if (evError) {
        console.error('Error reading resident_vital_signs:', evError);
        vitalsOk = false;
        vitalsErrorMsg = evError.message || null;
      } else if (ev) {
        const { error: upError } = await supabase.from('resident_vital_signs').update(vd).eq('resident_id', id);
        if (upError) { console.error('Error updating resident_vital_signs:', upError); vitalsOk = false; vitalsErrorMsg = upError.message || null; }
      } else {
        const { error: insError } = await supabase.from('resident_vital_signs').insert({ resident_id: id, ...vd });
        if (insError) { console.error('Error inserting resident_vital_signs:', insError); vitalsOk = false; vitalsErrorMsg = insError.message || null; }
      }
    }

    // Persist risk score after medical history add
    await recalculateAndPersistRisk(id);
    
    res.status(201).json({
      success: true,
      vitalsOk,
      vitalsError: vitalsErrorMsg,
      prenatalStructured,
      data: {
        id: history.history_id, date: history.date, type: history.type, location: history.location,
        facility: history.facility, diagnosis: history.diagnosis, treatment: history.treatment,
        notes: history.notes, createdAt: history.created_at, administeredBy: history.administered_by,
        chronicConditions: history.chronic_conditions, currentMedications: history.current_medications,
        allergies: history.allergies,
        prenatal: mergePrenatal(history),
        postpartum: mergePostpartum(history),
        vitalSigns: savedVitals,
      }
    });
  } catch (error) { console.error('Error adding medical history:', error); res.status(500).json({ success: false, message: 'Failed to add medical history' }); }
};
