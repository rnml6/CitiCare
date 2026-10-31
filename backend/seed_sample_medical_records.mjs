// seed_sample_medical_records.mjs
// Adds 2 sample entries per medical record type by driving the REAL backend
// API with the EXACT payload shapes the "Add Medical Record" modal form
// sends (see ResidentDetail.jsx handleAddMedicalHistory):
//   POST /api/residents/:id/medical-history   (checkup-like types)
//   POST /api/medicines/resident/:residentId  (Vaccination/Deworming/Vitamins)
//
// One resident cannot hold every type (Growth needs age < 5, Senior needs
// 60+, Prenatal/Postpartum need Female), so samples are auto-distributed:
//   Demo Mother (Sample)  28F pregnant -> Checkup, Prenatal, Postpartum,
//                                    Vaccination, Deworming, Vitamins,
//                                    Referral (Pregnancy Concern:
//                                      Prenatal variant + Postpartum variant)
//   Demo Senior (Sample)  68F senior   -> Checkup, Senior, Vaccination,
//                                    Deworming, Vitamins,
//                                    Referral (General Concern)
//   Demo Infant (Sample)  1M infant    -> Checkup, Growth Monitoring,
//                                    Vaccination, Deworming, Vitamins,
//                                    Referral (Infant Concern)
// Every applicable type ends up with exactly 2 entries per demo resident
// (pregnancy referrals cover both checkup-type variants, 2 entries each).
// Reruns are safe: previous SAMPLE entries are removed first.
//
// Usage: node seed_sample_medical_records.mjs   (backend must be running)

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { supabase } from './src/config/supabase.js';

dotenv.config();

const API = process.env.SEED_API_URL || 'http://localhost:5000/api';
const MARKER = 'Sample record for UI design review';

// ---------------------------------------------------------------- auth ---
const token = jwt.sign(
  { userId: 1, email: 'admin@citicare.demo', role: 'Administrator', bhwId: null },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const api = async (method, path, body, attempt = 1) => {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return api(method, path, body, attempt + 1);
    }
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`${method} ${path} failed: ${data.message || res.status}`);
  }
  return data.data;
};

// ------------------------------------------------------------ helpers ---
// Mirrors the modal's `line(label, val)` serializer.
const L = (label, val) =>
  val !== '' && val !== null && val !== undefined && String(val).trim() !== ''
    ? `${label}: ${String(val).trim()}`
    : null;

const ga = (lmp, ref) => {
  const days = Math.floor((new Date(ref) - new Date(lmp)) / 86400000);
  return `${Math.floor(days / 7)}w ${days % 7}d`;
};

const bmi = (kg, cm) => (kg / ((cm / 100) * (cm / 100))).toFixed(1);

const postHistory = (residentId, payload) =>
  api('POST', `/residents/${residentId}/medical-history`, payload);

const postMed = (residentId, payload) =>
  api('POST', `/medicines/resident/${residentId}`, payload);

// -------------------------------------------------------------- setup ---
const DEMOS = [
  { name: 'Demo Mother (Sample)', gender: 'Female', dateOfBirth: '1998-05-14', age: 28, civilStatus: 'Married', contactNumber: '09171234567', focusGroups: ['pregnant'] },
  { name: 'Demo Senior (Sample)', gender: 'Female', dateOfBirth: '1958-02-20', age: 68, civilStatus: 'Widowed', contactNumber: '09172345678', focusGroups: ['senior'] },
  { name: 'Demo Infant (Sample)', gender: 'Male', dateOfBirth: '2025-06-01', age: 1, civilStatus: 'Single', contactNumber: '09173456789', focusGroups: ['infant'] },
];

const ensureResident = async (def) => {
  const all = await api('GET', '/residents');
  const found = all.find((r) => r.name === def.name);
  if (found) {
    console.log(`  resident exists: ${def.name} (id ${found.id})`);
    return found.id;
  }
  const created = await api('POST', '/residents', { ...def, purokId: 1 });
  console.log(`  resident created: ${def.name} (id ${created.id})`);
  return created.id;
};

// Master medicines the modal can actually offer (target_group 'all').
const ensureMasterMed = async (name, category, totalDoses) => {
  const { data } = await supabase
    .from('medicine_master')
    .select('id, medicine_name, category, total_doses, target_group, is_active')
    .eq('medicine_name', name)
    .maybeSingle();
  if (data) return data;
  const created = await api('POST', '/medicines', {
    medicine_name: name, category, total_doses: totalDoses, target_group: 'all',
    description: 'Sample medicine for UI design review',
  });
  return created;
};

const clearSamples = async (residentId) => {
  const { data: histories } = await supabase
    .from('medical_histories')
    .select('history_id')
    .eq('resident_id', residentId)
    .like('notes', `%${MARKER}%`);
  const ids = (histories || []).map((h) => h.history_id);
  if (ids.length) {
    await supabase.from('medical_history_vitals').delete().in('history_id', ids);
    await supabase.from('medical_histories').delete().in('history_id', ids);
  }
  await supabase
    .from('resident_medicine_records')
    .delete()
    .eq('resident_id', residentId)
    .like('remarks', `%${MARKER}%`);
  if (ids.length) console.log(`  cleared ${ids.length} old sample histories`);
};

// ================================================================= main ===
const main = async () => {
  console.log('Seeding sample medical records (2 per type)...');

  const flu = await ensureMasterMed('Sample Flu Vaccine', 'vaccine', 2);
  const bcg = await ensureMasterMed('Sample BCG Vaccine', 'vaccine', 1);
  const dew = await ensureMasterMed('KOntra BUlate', 'deworming', 2);
  const vit = await ensureMasterMed('Vitamin A', 'vitamins', 1);
  console.log(`  meds: flu=${flu.id} bcg=${bcg.id} deworm=${dew.id} vit=${vit.id}`);

  const ids = {};
  for (const def of DEMOS) {
    ids[def.name] = await ensureResident(def);
    await clearSamples(ids[def.name]);
  }
  const M = ids['Demo Mother (Sample)'];
  const S = ids['Demo Senior (Sample)'];
  const I = ids['Demo Infant (Sample)'];

  let n = 0;
  const done = (what) => { n++; console.log(`  [${n}] ${what}`); };

  // ------------------------------------------------------- DEMO MOTHER ---
  // Checkup x2
  await postHistory(M, {
    date: '2026-06-12', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Generally healthy. Advised balanced diet and daily exercise.',
    treatment: 'Routine adult checkup',
    notes: ['Reason for checkup: Routine adult checkup', 'Symptoms: None', 'Fasting blood sugar: 92 mg/dL', 'Assessment / Findings: Generally healthy. Advised balanced diet and daily exercise.', `Remarks: ${MARKER} (entry 1 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '110/70', heartRate: '78', temperature: '36.8', weight: '55', height: '158', bloodSugar: '92', bmi: bmi(55, 158) },
    administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
  }); done('Mother Checkup 1');
  await postHistory(M, {
    date: '2026-09-08', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Acute viral upper respiratory tract infection. Rest and fluids.',
    treatment: 'Cough and colds (3 days) | Dry cough, runny nose, no fever',
    notes: ['Reason for checkup: Cough and colds (3 days)', 'Symptoms: Dry cough, runny nose, no fever', 'Fasting blood sugar: 95 mg/dL', 'Assessment / Findings: Acute viral upper respiratory tract infection. Rest and fluids.', `Remarks: ${MARKER} (entry 2 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '112/74', heartRate: '84', temperature: '37.2', weight: '56', height: '158', bloodSugar: '95', bmi: bmi(56, 158) },
    administered_by: 'Maria Santos',
    chronicConditions: [{ name: 'Asthma', severity: 'Mild' }],
    currentMedications: [{ name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'Every 6 hours as needed' }],
    allergies: { drugs: [], food: [], environmental: [] },
  }); done('Mother Checkup 2');

  // Prenatal x2 (LMP 2026-01-05 -> EDD 2026-10-12)
  const prenatal = async (date, exam) => {
    await postHistory(M, {
      date, type: 'Prenatal Checkup', facility: 'Barangay Health Center',
      diagnosis: exam.assessment, treatment: exam.symptoms,
      notes: [
        'LMP: 2026-01-05', 'EDD: 2026-10-12', 'Gravida: 2', 'Para: 1', 'Pregnancy status: Active',
        `Gestational age: ${ga('2026-01-05', date)}`, `Mother's weight: ${exam.weight} kg`, `Mother's BP: ${exam.bp}`,
        `Mother's temperature: ${exam.temp} °C`, `Fundal height: ${exam.fh} cm`, `Fetal heart rate: ${exam.fhr} bpm`,
        `Fetal movement: ${exam.fm}`, `MUAC: ${exam.muac} cm`, `MUAC date: ${date}`, `TD status: ${exam.td}`,
        'Pregnancy-related signs / symptoms: ' + exam.symptoms, `Remarks / Findings: ${MARKER} (prenatal ${exam.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: exam.bp, heartRate: '', temperature: exam.temp, weight: exam.weight, height: '', bloodSugar: '', bmi: '' },
      prenatal: { lmp: '2026-01-05', edd: '2026-10-12', gravida: '2', para: '1', pregnancyStatus: 'Active', gestationalAge: ga('2026-01-05', date), fundalHeight: exam.fh, fetalHeartRate: exam.fhr, fetalMovement: exam.fm, muac: exam.muac, muacDate: date, tdStatus: exam.td, ancWindow: '', isPrivateVisit: false },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Mother Prenatal ${exam.tag}`);
  };
  await prenatal('2026-04-10', { tag: '1 of 2', weight: '56', bp: '110/70', temp: '36.7', fh: '14', fhr: '140', fm: 'Present', muac: '24.5', td: 'Td2', symptoms: 'Morning nausea, no bleeding', assessment: 'Healthy pregnancy, 1st trimester. Continue folic acid.' });
  await prenatal('2026-09-10', { tag: '2 of 2', weight: '63', bp: '114/76', temp: '36.8', fh: '33', fhr: '145', fm: 'Active', muac: '25.0', td: 'Td3', symptoms: 'Mild back pain, leg cramps at night', assessment: '3rd trimester, cephalic presentation. Advised birth planning.' });

  // Postpartum x2 (same delivery, two postnatal visits)
  const postpartum = async (date, exam) => {
    const outcomeDetails = `Barangay Lying-in Clinic | Midwife L. Ramos | Vaginal/Normal | Aya Reyes Female 2.9kg`;
    const line2 = L;
    await postHistory(M, {
      date, type: 'Postpartum Checkup', facility: 'Barangay Health Center',
      diagnosis: exam.assessment, treatment: exam.symptoms,
      notes: [
        'Pregnancy status: Delivered', 'Birth outcome: Live birth', 'Birth date: 2026-08-20',
        'Delivery place: Barangay Lying-in Clinic', 'Birth attendant: Midwife', 'Birth attendant name: L. Ramos',
        'Mode of delivery: Vaginal/Normal', "Baby's name: Aya Reyes", "Baby's gender: Female", "Baby's weight: 2.9kg",
        `Check-up date: ${date}`, `Mother's BP: ${exam.bp}`, `Mother's temperature: ${exam.temp}`, `Lochia: ${exam.lochia}`,
        `Wound condition: ${exam.wound}`, `Breastfeeding status: ${exam.bf}`, `Baby's temperature: ${exam.btemp}`,
        `Baby's feeding status: ${exam.bfeed}`, `Jaundice: ${exam.jaun}`, `Cord condition: ${exam.cord}`,
        `Newborn danger signs: ${exam.danger}`, "Spouse's name: Jose Reyes",
        `Outcome details: ${outcomeDetails}`,
        `Postpartum remarks: Spouse: Jose Reyes${exam.symptoms && exam.symptoms !== 'None' ? ` | Danger signs: ${exam.symptoms}` : ''}`,
        `Maternal danger signs: ${exam.symptoms}`, `Maternal / Newborn assessment: ${exam.assessment}`,
        `Remarks: ${MARKER} (postpartum ${exam.tag}).`,
      ].filter(Boolean).join('\n'),
      vitalSigns: { bloodPressure: exam.bp, heartRate: '80', temperature: exam.temp, weight: '60', height: '', bloodSugar: '', bmi: '' },
      postpartum: {
        birthOutcome: 'live', birthDate: '2026-08-20', deliveryPlace: 'Barangay Lying-in Clinic',
        birthAttendant: 'Midwife', birthAttendantName: 'L. Ramos', deliveryMode: 'Vaginal/Normal',
        babyName: 'Aya Reyes', babyGender: 'Female', babyWeight: '2.9kg', checkupDate: date,
        motherBP: exam.bp, motherTemp: exam.temp, lochia: exam.lochia, woundCondition: exam.wound,
        breastfeedingStatus: exam.bf, babyTemp: exam.btemp, babyFeedingStatus: exam.bfeed,
        jaundice: exam.jaun, cordCondition: exam.cord, newbornDangerSigns: exam.danger,
        maternalDeathDate: '', stillbirthRegDate: '', neonatalDeathDate: '', spouseName: 'Jose Reyes',
        outcomeDetails, postpartumRemarks: `Spouse: Jose Reyes${exam.symptoms && exam.symptoms !== 'None' ? ` | Danger signs: ${exam.symptoms}` : ''}`,
      },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Mother Postpartum ${exam.tag}`);
    void line2;
  };
  await postpartum('2026-08-21', { tag: '1 of 2', bp: '110/70', temp: '36.8', lochia: 'Normal', wound: 'Normal', bf: 'Good', btemp: '36.9', bfeed: 'Feeding Well', jaun: 'Absent', cord: 'Normal', danger: 'None', symptoms: 'Mild perineal pain', assessment: 'Mother and newborn stable within 24 hours post delivery.' });
  await postpartum('2026-08-28', { tag: '2 of 2', bp: '112/72', temp: '36.7', lochia: 'Normal', wound: 'Normal', bf: 'Good', btemp: '36.8', bfeed: 'Feeding Well', jaun: 'Absent', cord: 'Healed', danger: 'None', symptoms: 'None', assessment: 'One-week postnatal visit. Mother and baby both doing well.' });

  // Referral (Pregnancy Concern) x2
  const referralPreg = async (date, e) => {
    await postHistory(M, {
      date, type: 'Referral', facility: e.facilityName,
      diagnosis: e.assessment, treatment: e.symptoms,
      notes: [
        'Referral category: Pregnancy Concern', `Facility type: ${e.facilityType}`, `Facility name: ${e.facilityName}`, `Facility location: ${e.facilityLocation}`,
        'Referral checkup type: Prenatal Checkup',
        'LMP: 2026-01-05', 'EDD: 2026-10-12', 'Gravida: 2', 'Para: 1', 'Pregnancy status: Active',
        `Gestational age: ${ga('2026-01-05', date)}`, `Fundal height: ${e.fh} cm`, `Fetal heart rate: ${e.fhr} bpm`,
        `Fetal movement: ${e.fm}`, `MUAC: ${e.muac} cm`, `MUAC date: ${date}`, `TD status: ${e.td}`,
        `Pregnancy-related symptoms: ${e.symptoms}`, `Maternal assessment / Findings: ${e.assessment}`,
        `Remarks: ${MARKER} (referral ${e.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: e.bp, heartRate: '', temperature: '', weight: '', height: '', bloodSugar: '', bmi: '' },
      prenatal: { lmp: '2026-01-05', edd: '2026-10-12', gravida: '2', para: '1', pregnancyStatus: 'Active', gestationalAge: ga('2026-01-05', date), fundalHeight: e.fh, fetalHeartRate: e.fhr, fetalMovement: e.fm, muac: e.muac, muacDate: date, tdStatus: e.td, ancWindow: '', isPrivateVisit: false },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Mother Referral ${e.tag}`);
  };
  await referralPreg('2026-07-15', { tag: '1 of 2', facilityType: 'Hospital', facilityName: 'Bicol Medical Center', facilityLocation: 'Naga City', bp: '130/85', fh: '26', fhr: '142', fm: 'Present', muac: '24.8', td: 'Td2', symptoms: 'Elevated BP 130/85 on repeat check', assessment: 'Referred for OB evaluation of elevated blood pressure.' });
  await referralPreg('2026-09-12', { tag: '2 of 2', facilityType: 'Hospital', facilityName: 'Bicol Medical Center', facilityLocation: 'Naga City', bp: '118/78', fh: '34', fhr: '148', fm: 'Decreased', muac: '25.0', td: 'Td3', symptoms: 'Decreased fetal movement for 1 day', assessment: 'Urgent referral for biophysical profile and NST.' });

  // Referral (Pregnancy Concern, Postpartum variant) x2 — mirrors the
  // modal's Referral + Pregnancy Concern + Checkup Type = Postpartum
  // payload: same notes order (referral head, checkup-type choice,
  // postpartum fields, danger signs, assessment, remarks) plus the
  // structured postpartum object the backend stores.
  const referralPost = async (date, e) => {
    const outcomeDetails = `Barangay Lying-in Clinic | Midwife L. Ramos | Vaginal/Normal | Aya Reyes Female 2.9kg`;
    const ppRemarks = `Spouse: Jose Reyes${e.symptoms && e.symptoms !== 'None' ? ` | Danger signs: ${e.symptoms}` : ''}`;
    await postHistory(M, {
      date, type: 'Referral', facility: e.facilityName,
      diagnosis: e.assessment, treatment: e.symptoms,
      notes: [
        'Referral category: Pregnancy Concern', `Facility type: ${e.facilityType}`, `Facility name: ${e.facilityName}`, `Facility location: ${e.facilityLocation}`,
        'Referral checkup type: Postpartum Checkup',
        'Pregnancy status: Delivered', 'Birth outcome: Live birth', 'Birth date: 2026-08-20',
        'Delivery place: Barangay Lying-in Clinic', 'Birth attendant: Midwife', 'Birth attendant name: L. Ramos',
        'Mode of delivery: Vaginal/Normal', "Baby's name: Aya Reyes", "Baby's gender: Female", "Baby's weight: 2.9kg",
        `Check-up date: ${date}`, `Mother's BP: ${e.bp}`, `Mother's temperature: ${e.temp}`, `Lochia: ${e.lochia}`,
        `Wound condition: ${e.wound}`, `Breastfeeding status: ${e.bf}`, `Baby's temperature: ${e.btemp}`,
        `Baby's feeding status: ${e.bfeed}`, `Jaundice: ${e.jaun}`, `Cord condition: ${e.cord}`,
        `Newborn danger signs: ${e.danger}`, 'Maternal death applicable: No', 'Stillbirth registration applicable: No',
        'Neonatal death applicable: No', "Spouse's name: Jose Reyes",
        `Outcome details: ${outcomeDetails}`,
        `Postpartum remarks: ${ppRemarks}`,
        `Maternal danger signs: ${e.symptoms}`, `Maternal / Newborn assessment: ${e.assessment}`,
        `Remarks: ${MARKER} (referral postpartum ${e.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: e.bp, heartRate: '80', temperature: e.temp, weight: '60', height: '', bloodSugar: '', bmi: '' },
      postpartum: {
        birthOutcome: 'live', birthDate: '2026-08-20', deliveryPlace: 'Barangay Lying-in Clinic',
        birthAttendant: 'Midwife', birthAttendantName: 'L. Ramos', deliveryMode: 'Vaginal/Normal',
        babyName: 'Aya Reyes', babyGender: 'Female', babyWeight: '2.9kg', checkupDate: date,
        motherBP: e.bp, motherTemp: e.temp, lochia: e.lochia, woundCondition: e.wound,
        breastfeedingStatus: e.bf, babyTemp: e.btemp, babyFeedingStatus: e.bfeed,
        jaundice: e.jaun, cordCondition: e.cord, newbornDangerSigns: e.danger,
        maternalDeathDate: '', stillbirthRegDate: '', neonatalDeathDate: '', spouseName: 'Jose Reyes',
        outcomeDetails, postpartumRemarks: ppRemarks,
      },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Mother Referral postpartum ${e.tag}`);
  };
  await referralPost('2026-08-22', { tag: '1 of 2', facilityType: 'Hospital', facilityName: 'Bicol Medical Center', facilityLocation: 'Naga City', bp: '100/65', temp: '37.0', lochia: 'Heavy', wound: 'Normal', bf: 'Good', btemp: '36.9', bfeed: 'Feeding Well', jaun: 'Absent', cord: 'Normal', danger: 'None', symptoms: 'Heavy vaginal bleeding soaking 2 pads/hour', assessment: 'Urgent referral for suspected postpartum hemorrhage evaluation.' });
  await referralPost('2026-08-30', { tag: '2 of 2', facilityType: 'Hospital', facilityName: 'Bicol Medical Center', facilityLocation: 'Naga City', bp: '110/70', temp: '38.5', lochia: 'Abnormal', wound: 'Signs of Infection', bf: 'With Difficulty', btemp: '37.1', bfeed: 'Feeding Well', jaun: 'Absent', cord: 'Normal', danger: 'None', symptoms: 'Fever 38.5°C with foul-smelling vaginal discharge', assessment: 'Referred for puerperal sepsis workup and management.' });

  // Mother meds x6 (modal sends cycle-aware dose numbers)
  await postMed(M, { medicine_master_id: flu.id, medicine_name: flu.medicine_name, category: flu.category, dose_number: 1, total_doses: flu.total_doses, date_administered: '2026-06-12', facility: 'Barangay Health Center', batch_number: 'FLU26-A', administration_site: 'Left Arm', administered_by: 'Maria Santos', remarks: MARKER + ' (vaccination 1 of 2).' }); done('Mother Vaccination 1');
  await postMed(M, { medicine_master_id: flu.id, medicine_name: flu.medicine_name, category: flu.category, dose_number: 2, total_doses: flu.total_doses, date_administered: '2026-09-08', facility: 'Barangay Health Center', batch_number: 'FLU26-B', administration_site: 'Right Arm', administered_by: 'Maria Santos', remarks: MARKER + ' (vaccination 2 of 2).' }); done('Mother Vaccination 2');
  await postMed(M, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 1, total_doses: dew.total_doses, date_administered: '2026-06-12', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 1 of 2).` }); done('Mother Deworming 1');
  await postMed(M, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 2, total_doses: dew.total_doses, date_administered: '2026-09-08', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 2 of 2).` }); done('Mother Deworming 2');
  await postMed(M, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-06-12', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 200,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 1 of 2).` }); done('Mother Vitamins 1');
  await postMed(M, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-09-08', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 200,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 2 of 2).` }); done('Mother Vitamins 2');

  // ------------------------------------------------------- DEMO SENIOR ---
  await postHistory(S, {
    date: '2026-05-20', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Stable. Mild osteoarthritis of both knees. Continue walking.',
    treatment: 'Routine senior checkup | Occasional knee pain',
    notes: ['Reason for checkup: Routine senior checkup', 'Symptoms: Occasional knee pain', 'Fasting blood sugar: 105 mg/dL', 'Assessment / Findings: Stable. Mild osteoarthritis of both knees. Continue walking.', `Remarks: ${MARKER} (entry 1 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '130/85', heartRate: '80', temperature: '36.6', weight: '60', height: '155', bloodSugar: '105', bmi: bmi(60, 155) },
    administered_by: 'Juan Dela Cruz', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
  }); done('Senior Checkup 1');
  await postHistory(S, {
    date: '2026-09-05', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Hypertension, uncontrolled. Adjusted maintenance medication.',
    treatment: 'High blood pressure follow-up | Morning headache',
    notes: ['Reason for checkup: High blood pressure follow-up', 'Symptoms: Morning headache', 'Fasting blood sugar: 110 mg/dL', 'Assessment / Findings: Hypertension, uncontrolled. Adjusted maintenance medication.', `Remarks: ${MARKER} (entry 2 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '150/95', heartRate: '86', temperature: '36.7', weight: '61', height: '155', bloodSugar: '110', bmi: bmi(61, 155) },
    administered_by: 'Juan Dela Cruz',
    chronicConditions: [{ name: 'Hypertension', severity: 'Moderate' }],
    currentMedications: [{ name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily' }],
    allergies: { drugs: ['Penicillin'], food: [], environmental: [] },
  }); done('Senior Checkup 2');

  // Senior Checkup x2
  await postHistory(S, {
    date: '2026-06-18', type: 'Senior Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Fit for age. Continue daily walking and low-salt diet.',
    treatment: 'Annual senior wellness exam | None',
    notes: ['Reason for checkup: Annual senior wellness exam', 'Symptoms: None', 'Fasting blood sugar: 102 mg/dL', 'Mobility / Functional status: Independent in all activities of daily living', 'Assessment / Findings: Fit for age. Continue daily walking and low-salt diet.', `Remarks: ${MARKER} (entry 1 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '128/82', heartRate: '78', temperature: '36.6', weight: '60', height: '155', bloodSugar: '102', bmi: bmi(60, 155) },
    administered_by: 'Juan Dela Cruz', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
  }); done('Senior Senior-Checkup 1');
  await postHistory(S, {
    date: '2026-09-10', type: 'Senior Checkup', facility: 'Home',
    diagnosis: 'Cataract suspect, right eye. Referred to eye clinic.',
    treatment: 'Follow-up: arthritis and vision | Blurry vision right eye',
    notes: ['Reason for checkup: Follow-up: arthritis and vision', 'Symptoms: Blurry vision right eye', 'Fasting blood sugar: 108 mg/dL', 'Mobility / Functional status: Ambulatory with cane for long distances', 'Assessment / Findings: Cataract suspect, right eye. Referred to eye clinic.', `Remarks: ${MARKER} (entry 2 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '138/88', heartRate: '82', temperature: '36.6', weight: '60', height: '155', bloodSugar: '108', bmi: bmi(60, 155) },
    administered_by: 'Juan Dela Cruz',
    chronicConditions: [{ name: 'Arthritis', severity: 'Moderate' }],
    currentMedications: [], allergies: { drugs: ['Penicillin'], food: [], environmental: [] },
  }); done('Senior Senior-Checkup 2');

  // Referral (General Concern) x2
  const referralGen = async (date, e) => {
    await postHistory(S, {
      date, type: 'Referral', facility: e.facilityName,
      diagnosis: e.assessment, treatment: `${e.reason} | ${e.symptoms}`,
      notes: [
        'Referral category: General Concern', `Facility type: ${e.facilityType}`, `Facility name: ${e.facilityName}`, `Facility location: ${e.facilityLocation}`,
        `Reason for checkup: ${e.reason}`, `Symptoms: ${e.symptoms}`, 'Fasting blood sugar: 108 mg/dL',
        `Assessment / Findings: ${e.assessment}`, `Remarks: ${MARKER} (referral ${e.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: '138/88', heartRate: '82', temperature: '36.6', weight: '60', height: '155', bloodSugar: '108', bmi: bmi(60, 155) },
      administered_by: 'Juan Dela Cruz', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Senior Referral ${e.tag}`);
  };
  await referralGen('2026-07-02', { tag: '1 of 2', facilityType: 'Clinic', facilityName: 'City Eye Center', facilityLocation: 'Naga City', reason: 'Blurry vision right eye', symptoms: 'Gradual blurring of right eye for 6 months', assessment: 'Cataract suspect. Referred to ophthalmologist.' });
  await referralGen('2026-09-11', { tag: '2 of 2', facilityType: 'Hospital', facilityName: 'Bicol Medical Center', facilityLocation: 'Naga City', reason: 'Chest heaviness', symptoms: 'Heaviness on exertion, no palpitations', assessment: 'Referred for ECG and cardiology evaluation.' });

  // Senior meds x6
  await postMed(S, { medicine_master_id: flu.id, medicine_name: flu.medicine_name, category: flu.category, dose_number: 1, total_doses: flu.total_doses, date_administered: '2026-05-20', facility: 'Barangay Health Center', batch_number: 'FLU26-A', administration_site: 'Left Arm', administered_by: 'Juan Dela Cruz', remarks: MARKER + ' (vaccination 1 of 2).' }); done('Senior Vaccination 1');
  await postMed(S, { medicine_master_id: flu.id, medicine_name: flu.medicine_name, category: flu.category, dose_number: 2, total_doses: flu.total_doses, date_administered: '2026-09-05', facility: 'Barangay Health Center', batch_number: 'FLU26-B', administration_site: 'Right Arm', administered_by: 'Juan Dela Cruz', remarks: MARKER + ' (vaccination 2 of 2).' }); done('Senior Vaccination 2');
  await postMed(S, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 1, total_doses: dew.total_doses, date_administered: '2026-05-20', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Juan Dela Cruz', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 1 of 2).` }); done('Senior Deworming 1');
  await postMed(S, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 2, total_doses: dew.total_doses, date_administered: '2026-09-05', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Juan Dela Cruz', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 2 of 2).` }); done('Senior Deworming 2');
  await postMed(S, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-05-20', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Juan Dela Cruz', remarks: `Dose: 200,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 1 of 2).` }); done('Senior Vitamins 1');
  await postMed(S, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-09-05', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Juan Dela Cruz', remarks: `Dose: 200,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 2 of 2).` }); done('Senior Vitamins 2');

  // ------------------------------------------------------- DEMO INFANT ---
  await postHistory(I, {
    date: '2026-04-02', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Acute viral illness. Tepid sponge bathing and fluids advised.',
    treatment: 'Fever (2 days) | Fever 38.2°C, decreased appetite',
    notes: ['Reason for checkup: Fever (2 days)', 'Symptoms: Fever 38.2°C, decreased appetite', 'Assessment / Findings: Acute viral illness. Tepid sponge bathing and fluids advised.', `Remarks: ${MARKER} (entry 1 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '', heartRate: '120', temperature: '38.2', weight: '8.0', height: '', bloodSugar: '', bmi: '' },
    administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
  }); done('Infant Checkup 1');
  await postHistory(I, {
    date: '2026-09-03', type: 'Checkup', facility: 'Barangay Health Center',
    diagnosis: 'Healthy, thriving infant. Continue breastfeeding plus complementary feeding.',
    treatment: 'Routine infant checkup | None',
    notes: ['Reason for checkup: Routine infant checkup', 'Symptoms: None', 'Assessment / Findings: Healthy, thriving infant. Continue breastfeeding plus complementary feeding.', `Remarks: ${MARKER} (entry 2 of 2).`].join('\n'),
    vitalSigns: { bloodPressure: '', heartRate: '110', temperature: '36.9', weight: '9.8', height: '', bloodSugar: '', bmi: '' },
    administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: ['Egg'], environmental: [] },
  }); done('Infant Checkup 2');

  // Growth Monitoring x2
  const growth = async (date, e) => {
    await postHistory(I, {
      date, type: 'Growth Monitoring', facility: 'Barangay Health Center',
      diagnosis: e.assessment, treatment: e.concerns,
      notes: [
        'Place of Birth: Barangay Lying-in Clinic', "Mother's Name: Liza Infant", "Father's Name: Mark Infant",
        `Weight: ${e.weight} kg`, `Length / Height: ${e.length} cm`, `Head circumference: ${e.hc} cm`,
        `Feeding status: ${e.feeding}`, `Growth status: ${e.growth}`, `Nutritional status: ${e.nutri}`,
        `Developmental milestones: ${e.miles}`, `Developmental concerns: ${e.dconcerns}`,
        `Respiratory rate: ${e.rr} breaths/min`, 'Vaccines: Sample BCG Vaccine', 'Vaccine dose: Dose 1',
        `Vaccine date: ${date}`, `Vaccine batch: ${e.batch}`, 'Vaccinator: Maria Santos',
        `Nutrition / Growth concerns: ${e.concerns}`, `Assessment / Findings: ${e.assessment}`,
        `Remarks: ${MARKER} (growth ${e.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: '', heartRate: '', temperature: '', weight: e.weight, height: e.length, bloodSugar: '', bmi: '' },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Infant Growth ${e.tag}`);
  };
  await growth('2026-03-05', { tag: '1 of 2', weight: '8.4', length: '70.5', hc: '44.5', feeding: 'Exclusive breastfeeding', growth: 'Normal', nutri: 'Normal', miles: 'Sits without support', dconcerns: 'None', rr: '32', batch: 'BCG26-A', concerns: 'None', assessment: 'Normal growth and development at 9 months.' });
  await growth('2026-09-05', { tag: '2 of 2', weight: '9.8', length: '78.0', hc: '46.8', feeding: 'Complementary feeding plus breastmilk', growth: 'Normal', nutri: 'Normal', miles: 'Walks with support', dconcerns: 'None', rr: '30', batch: 'BCG26-B', concerns: 'None', assessment: 'Normal growth at 15 months. Fully immunized per card.' });

  // Referral (Infant Concern) x2
  const referralInf = async (date, e) => {
    await postHistory(I, {
      date, type: 'Referral', facility: e.facilityName,
      diagnosis: e.assessment, treatment: e.concerns,
      notes: [
        'Referral category: Infant Concern', `Facility type: ${e.facilityType}`, `Facility name: ${e.facilityName}`, `Facility location: ${e.facilityLocation}`,
        `Length / Height: ${e.length} cm`, `Head circumference: ${e.hc} cm`, `Feeding status: ${e.feeding}`,
        `Growth status: ${e.growth}`, `Nutritional status: ${e.nutri}`, `Nutrition / Growth concerns: ${e.concerns}`,
        `Assessment / Findings: ${e.assessment}`, `Remarks: ${MARKER} (referral ${e.tag}).`,
      ].join('\n'),
      vitalSigns: { bloodPressure: '', heartRate: '', temperature: '', weight: e.weight, height: e.length, bloodSugar: '', bmi: '' },
      administered_by: 'Maria Santos', chronicConditions: [], currentMedications: [], allergies: { drugs: [], food: [], environmental: [] },
    }); done(`Infant Referral ${e.tag}`);
  };
  await referralInf('2026-05-12', { tag: '1 of 2', facilityType: 'Clinic', facilityName: 'City Pediatric Clinic', facilityLocation: 'Naga City', weight: '8.6', length: '72.0', hc: '45.0', feeding: 'Mixed feeding', growth: 'Normal', nutri: 'At risk', concerns: 'Slow weight gain over 2 months', assessment: 'Referred for nutrition counseling.' });
  await referralInf('2026-08-20', { tag: '2 of 2', facilityType: 'Hospital', facilityName: 'BMC Pediatrics', facilityLocation: 'Naga City', weight: '9.2', length: '75.5', hc: '46.0', feeding: 'Complementary feeding plus breastmilk', growth: 'Normal', nutri: 'Normal', concerns: 'Persistent cough for 2 weeks', assessment: 'Referred for chest X-ray, rule out pneumonia.' });

  // Infant meds x6
  await postMed(I, { medicine_master_id: bcg.id, medicine_name: bcg.medicine_name, category: bcg.category, dose_number: 1, total_doses: bcg.total_doses, date_administered: '2026-03-05', facility: 'Barangay Health Center', batch_number: 'BCG26-A', administration_site: 'Left Thigh', administered_by: 'Maria Santos', remarks: MARKER + ' (vaccination 1 of 2).' }); done('Infant Vaccination 1');
  await postMed(I, { medicine_master_id: bcg.id, medicine_name: bcg.medicine_name, category: bcg.category, dose_number: 1, total_doses: bcg.total_doses, date_administered: '2026-09-03', facility: 'Barangay Health Center', batch_number: 'BCG26-B', administration_site: 'Right Thigh', administered_by: 'Maria Santos', remarks: MARKER + ' (vaccination 2 of 2).' }); done('Infant Vaccination 2');
  await postMed(I, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 1, total_doses: dew.total_doses, date_administered: '2026-04-02', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 1 of 2).` }); done('Infant Deworming 1');
  await postMed(I, { medicine_master_id: dew.id, medicine_name: dew.medicine_name, category: dew.category, dose_number: 2, total_doses: dew.total_doses, date_administered: '2026-09-03', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 400mg single dose | ${MARKER} (deworming 2 of 2).` }); done('Infant Deworming 2');
  await postMed(I, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-04-02', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 100,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 1 of 2).` }); done('Infant Vitamins 1');
  await postMed(I, { medicine_master_id: vit.id, medicine_name: vit.medicine_name, category: vit.category, dose_number: 1, total_doses: vit.total_doses, date_administered: '2026-09-03', facility: 'Barangay Health Center', batch_number: '', administration_site: '', administered_by: 'Maria Santos', remarks: `Dose: 100,000 IU | Qty: 1 capsule | ${MARKER} (vitamins 2 of 2).` }); done('Infant Vitamins 2');

  // ------------------------------------------------------------- verify ---
  console.log('\nVerification:');
  for (const def of DEMOS) {
    const full = await api('GET', `/residents/${ids[def.name]}`);
    const byType = {};
    for (const h of full.medicalHistory || []) {
      if (String(h.notes || '').includes(MARKER)) byType[h.type] = (byType[h.type] || 0) + 1;
    }
    const meds = await api('GET', `/medicines/resident/${ids[def.name]}`);
    const medCounts = {};
    for (const g of ['vaccines', 'deworming', 'vitamins']) {
      for (const m of meds[g] || []) {
        for (const d of m.takenDoses || []) {
          if (String(d.remarks || '').includes(MARKER)) medCounts[g] = (medCounts[g] || 0) + 1;
        }
      }
    }
    console.log(`  ${def.name} (id ${ids[def.name]}):`, JSON.stringify({ ...byType, ...medCounts }));
  }
  console.log(`\nDone. ${n} sample records added.`);
};

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
