// seed_sample_frontend_inputs.mjs
// Sample data that mirrors EXACTLY what the frontend input fields send.
// Each object below uses the same field names / payload shapes as:
//   Purok.jsx            -> POST /api/puroks { name }
//   ResidentForm.jsx     -> POST /api/residents { name, dateOfBirth, age, gender,
//                           civilStatus, purokId, contactNumber, contactPerson,
//                           contactPersonNumber, contactPersonAddress, lastCheckup,
//                           focusGroups, motherName, fatherName, disabilityType,
//                           vitalSigns { bloodPressure, heartRate, temperature,
//                           weight, height, bloodSugar, bmi } }
//   BHWForm.jsx          -> POST /api/bhws { name, position, contactNumber, email,
//                           status, assignedPurokId, assignedFocusGroup,
//                           username, password, accountRole, workerType }
//   Medicines.jsx        -> POST /api/medicines { medicine_name, category,
//                           total_doses, target_group, description, dose_intervals
//                           [{ dose, description }] }
//   ScheduleForm.jsx     -> POST /api/schedules { scope, date, time, type,
//                           checkupCategory / referral* , status, duration,
//                           purpose, notes, locationDetails, contactPerson,
//                           contactNumber, residentId, purokId, isBarangayWide,
//                           programName, programDescription, targetGroup,
//                           targetCount, venue, coordinatorName, coordinatorContact,
//                           partnerOrganization, maxParticipants, assignedBhws,
//                           healthcareProfessionals }
//
// Realistic Barangay Gumamela data. Reruns are safe: existing rows matched
// by unique name are skipped, never duplicated.
//
// Usage: node seed_sample_frontend_inputs.mjs   (backend must be running)

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const API = process.env.SEED_API_URL || 'http://localhost:5000/api';

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
    // Treat "already exists / already taken / already assigned" as skip, not fatal.
    const msg = String(data.message || res.status);
    if (/already|exists|taken|assigned/i.test(msg)) return { __skipped: true, message: msg };
    throw new Error(`${method} ${path} failed: ${msg}`);
  }
  return data.data;
};

const bmi = (kg, cm) => (kg / ((cm / 100) * (cm / 100))).toFixed(1);

// ------------------------------------------------------------ 1. PUROKS ---
// Frontend field: Purok.jsx "Purok Name" (newPurokName / editPurokName)
const SAMPLE_PUROKS = [
  { name: 'Gumamela Proper' },
  { name: 'San Roque' },
  { name: 'San Isidro' },
  { name: 'Sta. Cruz' },
  { name: 'Mabini' },
];

// ---------------------------------------------------------- 2. MEDICINES ---
// Frontend fields: Medicines.jsx Add Medicine modal:
// medicine_name, category (vaccine|deworming|vitamins), total_doses,
// target_group (all|infant|pregnant|pwd|senior|withCondition),
// dose_intervals [{ dose, description }], description
const SAMPLE_MEDICINES = [
  {
    medicine_name: 'BCG Vaccine',
    category: 'vaccine',
    total_doses: 1,
    target_group: 'infant',
    description: 'Live vaccine against tuberculosis, given intradermally at birth.',
    dose_intervals: [{ dose: 1, description: 'Single dose at birth (0.05 mL intradermal, right deltoid)' }],
  },
  {
    medicine_name: 'Pentavalent Vaccine (DPT-HepB-Hib)',
    category: 'vaccine',
    total_doses: 3,
    target_group: 'infant',
    description: 'Protects against diphtheria, pertussis, tetanus, hepatitis B and Hib.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 6 weeks old (0.5 mL IM, left thigh)' },
      { dose: 2, description: 'Dose 2 at 10 weeks old (0.5 mL IM, left thigh)' },
      { dose: 3, description: 'Dose 3 at 14 weeks old (0.5 mL IM, left thigh)' },
    ],
  },
  {
    medicine_name: 'Seasonal Flu Vaccine',
    category: 'vaccine',
    total_doses: 2,
    target_group: 'senior',
    description: 'Annual influenza immunization for senior citizens.',
    dose_intervals: [
      { dose: 1, description: 'Primary dose (0.5 mL IM, left deltoid)' },
      { dose: 2, description: 'Booster after 1 month (0.5 mL IM, right deltoid)' },
    ],
  },
  {
    medicine_name: 'Albendazole 400mg',
    category: 'deworming',
    total_doses: 2,
    target_group: 'all',
    description: 'Broad-spectrum deworming tablet, biannual mass drug administration.',
    dose_intervals: [
      { dose: 1, description: '400mg single chewable tablet' },
      { dose: 2, description: '400mg single chewable tablet after 6 months' },
    ],
  },
  {
    medicine_name: 'Vitamin A Capsule',
    category: 'vitamins',
    total_doses: 2,
    target_group: 'infant',
    description: 'High-dose vitamin A supplementation for infants 6-59 months.',
    dose_intervals: [
      { dose: 1, description: '100,000 IU (blue capsule) for 6-11 months' },
      { dose: 2, description: '200,000 IU (red capsule) for 12-59 months' },
    ],
  },
  {
    medicine_name: 'Ferrous Sulfate + Folic Acid',
    category: 'vitamins',
    total_doses: 3,
    target_group: 'pregnant',
    description: 'Daily iron + folate supplement during pregnancy.',
    dose_intervals: [
      { dose: 1, description: '1st trimester: 1 tablet daily with meals' },
      { dose: 2, description: '2nd trimester: 1 tablet daily with meals' },
      { dose: 3, description: '3rd trimester: 1 tablet daily with meals' },
    ],
  },
];

// ---------------------------------------------------- 3. HEALTH WORKERS ---
// Frontend fields: BHWForm.jsx — name, position, contactNumber, email,
// status, assignedPurokId (BHW Worker only), assignedFocusGroup
// (infant|pregnant|senior), username, password, accountRole, workerType
// NOTE: focus groups + puroks are one-to-one, so each sample holds a
// different group / purok resolved at runtime.
const SAMPLE_BHWS = [
  {
    name: 'Maria Santos',
    position: 'Barangay Health Worker',
    contactNumber: '09171234567',
    email: 'maria.santos@barangaygumamela.ph',
    status: 'Active',
    purokName: 'Gumamela Proper',
    assignedFocusGroup: 'pregnant',
    username: 'bhw.maria',
    password: 'BhwMaria2026!',
    accountRole: 'BHW Worker',
    workerType: 'BHW',
  },
  {
    name: 'Josefa Ramos',
    position: 'Barangay Health Worker',
    contactNumber: '09172345678',
    email: 'josefa.ramos@barangaygumamela.ph',
    status: 'Active',
    purokName: 'San Roque',
    assignedFocusGroup: 'senior',
    username: 'bhw.josefa',
    password: 'BhwJosefa2026!',
    accountRole: 'BHW Worker',
    workerType: 'BHW',
  },
  {
    name: 'Lorna Dela Cruz',
    position: 'Barangay Health Worker Head',
    contactNumber: '09173456789',
    email: 'lorna.delacruz@barangaygumamela.ph',
    status: 'Active',
    purokName: null, // Head has no assigned purok in the form
    assignedFocusGroup: 'infant',
    username: 'bhw.lorna',
    password: 'BhwLorna2026!',
    accountRole: 'BHW Admin',
    workerType: 'BHW',
  },
  {
    name: 'Angelica Reyes, RM',
    position: 'Midwife',
    contactNumber: '09174567890',
    email: 'angelica.reyes@rhu.naga.ph',
    status: 'Active',
    purokName: null,
    assignedFocusGroup: null,
    username: '',
    password: '',
    accountRole: 'BHW Worker',
    workerType: 'Midwife',
  },
  {
    name: 'Dr. Paolo Aquino',
    position: 'Doctor',
    contactNumber: '09175678901',
    email: 'paolo.aquino@rhu.naga.ph',
    status: 'Active',
    purokName: null,
    assignedFocusGroup: null,
    username: '',
    password: '',
    accountRole: 'BHW Worker',
    workerType: 'Doctor',
  },
];

// ----------------------------------------------------------- 4. RESIDENTS ---
// Frontend fields: ResidentForm.jsx — name, dateOfBirth, age, gender,
// civilStatus, purokId, contactNumber, lastCheckup, motherName/fatherName
// (infant only), focusGroups (pregnant|pwd auto infant/senior/withCondition),
// disabilityType (pwd only), vitalSigns, contactPerson/Number/Address.
const SAMPLE_RESIDENTS = [
  {
    // Pregnant adult female
    name: 'Rosa Villanueva',
    dateOfBirth: '1997-03-22',
    age: 29,
    gender: 'Female',
    civilStatus: 'Married',
    purokName: 'Gumamela Proper',
    contactNumber: '09181234567',
    lastCheckup: '2026-09-10',
    focusGroups: ['pregnant'],
    motherName: null,
    fatherName: null,
    disabilityType: null,
    vitalSigns: { bloodPressure: '114/76', heartRate: '82', temperature: '36.8', weight: '63', height: '158', bloodSugar: '95', bmi: bmi(63, 158) },
    contactPerson: 'Marco Villanueva',
    contactPersonNumber: '09182345678',
    contactPersonAddress: 'Purok Gumamela Proper, Barangay Gumamela, Naga City',
  },
  {
    // Senior female with maintenance meds
    name: 'Teresita Navarro',
    dateOfBirth: '1956-11-08',
    age: 69,
    gender: 'Female',
    civilStatus: 'Widowed',
    purokName: 'San Roque',
    contactNumber: '09183456789',
    lastCheckup: '2026-09-05',
    focusGroups: [],
    motherName: null,
    fatherName: null,
    disabilityType: null,
    vitalSigns: { bloodPressure: '138/88', heartRate: '80', temperature: '36.6', weight: '60', height: '155', bloodSugar: '108', bmi: bmi(60, 155) },
    contactPerson: 'Liza Navarro',
    contactPersonNumber: '09184567890',
    contactPersonAddress: 'Purok San Roque, Barangay Gumamela, Naga City',
  },
  {
    // Adult male, hypertensive (drives withCondition tag)
    name: 'Danilo Mendoza',
    dateOfBirth: '1981-07-15',
    age: 45,
    gender: 'Male',
    civilStatus: 'Married',
    purokName: 'San Isidro',
    contactNumber: '09185678901',
    lastCheckup: '2026-08-28',
    focusGroups: [],
    motherName: null,
    fatherName: null,
    disabilityType: null,
    vitalSigns: { bloodPressure: '142/92', heartRate: '88', temperature: '36.7', weight: '78', height: '170', bloodSugar: '112', bmi: bmi(78, 170) },
    contactPerson: 'Corazon Mendoza',
    contactPersonNumber: '09186789012',
    contactPersonAddress: 'Purok San Isidro, Barangay Gumamela, Naga City',
  },
  {
    // Infant (auto infant tag) with parent names
    name: 'Jian Carl Villanueva',
    dateOfBirth: '2025-04-18',
    age: 1,
    gender: 'Male',
    civilStatus: 'Single',
    purokName: 'Gumamela Proper',
    contactNumber: '09187890123',
    lastCheckup: '2026-09-03',
    focusGroups: [],
    motherName: 'Rosa Villanueva',
    fatherName: 'Marco Villanueva',
    disabilityType: null,
    vitalSigns: { bloodPressure: null, heartRate: '112', temperature: '36.9', weight: '9.8', height: '78', bloodSugar: null, bmi: null },
    contactPerson: 'Rosa Villanueva',
    contactPersonNumber: '09181234567',
    contactPersonAddress: 'Purok Gumamela Proper, Barangay Gumamela, Naga City',
  },
  {
    // PWD adult female
    name: 'Katrina Ocampo',
    dateOfBirth: '1995-01-30',
    age: 31,
    gender: 'Female',
    civilStatus: 'Single',
    purokName: 'Sta. Cruz',
    contactNumber: '09188901234',
    lastCheckup: '2026-07-20',
    focusGroups: ['pwd'],
    motherName: null,
    fatherName: null,
    disabilityType: 'Visual impairment - low vision (left eye)',
    vitalSigns: { bloodPressure: '110/70', heartRate: '76', temperature: '36.6', weight: '52', height: '160', bloodSugar: '90', bmi: bmi(52, 160) },
    contactPerson: 'Ramon Ocampo',
    contactPersonNumber: '09189012345',
    contactPersonAddress: 'Purok Sta. Cruz, Barangay Gumamela, Naga City',
  },
  {
    // Young adult female, routine
    name: 'Jennylyn Cruz',
    dateOfBirth: '2001-09-12',
    age: 25,
    gender: 'Female',
    civilStatus: 'Single',
    purokName: 'Mabini',
    contactNumber: '09190123456',
    lastCheckup: '2026-06-15',
    focusGroups: [],
    motherName: null,
    fatherName: null,
    disabilityType: null,
    vitalSigns: { bloodPressure: '112/74', heartRate: '78', temperature: '36.7', weight: '55', height: '162', bloodSugar: '92', bmi: bmi(55, 162) },
    contactPerson: 'Nelia Cruz',
    contactPersonNumber: '09191234567',
    contactPersonAddress: 'Purok Mabini, Barangay Gumamela, Naga City',
  },
];

// ----------------------------------------------------------- 5. SCHEDULES ---
// Built at runtime after residents / puroks / BHWs resolve, using the
// EXACT ScheduleForm.jsx field set (see header). Dates are kept in the
// near future so they stay "Scheduled" and do not flip to Missed.
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
};

// ================================================================= main ===
const main = async () => {
  console.log('Seeding sample frontend input data...');
  let n = 0;
  const done = (what) => { n++; console.log(`  [${n}] ${what}`); };

  // ---- Puroks ----
  const purokIdByName = {};
  const existingPuroks = await api('GET', '/puroks');
  for (const p of SAMPLE_PUROKS) {
    const found = (existingPuroks || []).find((x) => x.name === p.name);
    if (found) { purokIdByName[p.name] = found.id; done(`Purok exists: ${p.name}`); continue; }
    const created = await api('POST', '/puroks', { name: p.name });
    if (created?.__skipped) { done(`Purok skipped: ${p.name} (${created.message})`); continue; }
    purokIdByName[p.name] = created.id;
    done(`Purok created: ${p.name}`);
  }
  // Refresh map so pre-existing puroks used below also resolve.
  const allPuroks = await api('GET', '/puroks');
  for (const p of allPuroks || []) purokIdByName[p.name] = p.id;

  // ---- Medicines ----
  const existingMeds = await api('GET', '/medicines');
  for (const m of SAMPLE_MEDICINES) {
    const found = (existingMeds || []).find((x) => x.medicine_name === m.medicine_name);
    if (found) { done(`Medicine exists: ${m.medicine_name}`); continue; }
    const created = await api('POST', '/medicines', m);
    if (created?.__skipped) { done(`Medicine skipped: ${m.medicine_name}`); continue; }
    done(`Medicine created: ${m.medicine_name} (${m.category}, ${m.total_doses} dose(s), ${m.target_group})`);
  }

  // ---- Health workers (BHWForm.jsx payload) ----
  const existingBhws = await api('GET', '/bhws');
  const bhwIdByName = {};
  for (const b of existingBhws || []) bhwIdByName[b.name] = b.id;
  for (const b of SAMPLE_BHWS) {
    if (bhwIdByName[b.name]) { done(`Health worker exists: ${b.name}`); continue; }
    const payload = {
      name: b.name,
      position: b.position,
      contactNumber: b.contactNumber,
      email: b.email,
      status: b.status,
      workerType: b.workerType,
      accountRole: b.accountRole,
      assignedPurokId: b.purokName ? (purokIdByName[b.purokName] || null) : null,
      assignedFocusGroup: b.assignedFocusGroup || null,
    };
    if (b.username && b.password) { payload.username = b.username; payload.password = b.password; }
    const created = await api('POST', '/bhws', payload);
    if (created?.__skipped) { done(`Health worker skipped: ${b.name} (${created.message})`); continue; }
    bhwIdByName[b.name] = created.id;
    done(`Health worker created: ${b.name} (${b.position}${payload.assignedFocusGroup ? `, ${payload.assignedFocusGroup}` : ''})`);
  }
  const allBhws = await api('GET', '/bhws');
  for (const b of allBhws || []) bhwIdByName[b.name] = b.id;

  // ---- Residents (ResidentForm.jsx payload) ----
  const existingResidents = await api('GET', '/residents');
  const residentIdByName = {};
  for (const r of existingResidents || []) residentIdByName[r.name] = r.id;
  for (const r of SAMPLE_RESIDENTS) {
    if (residentIdByName[r.name]) { done(`Resident exists: ${r.name}`); continue; }
    const payload = {
      name: r.name,
      dateOfBirth: r.dateOfBirth,
      age: r.age,
      gender: r.gender,
      civilStatus: r.civilStatus,
      purokId: purokIdByName[r.purokName] || null,
      contactNumber: r.contactNumber,
      contactPerson: r.contactPerson,
      contactPersonNumber: r.contactPersonNumber,
      contactPersonAddress: r.contactPersonAddress,
      lastCheckup: r.lastCheckup,
      focusGroups: r.focusGroups,
      motherName: r.motherName,
      fatherName: r.fatherName,
      disabilityType: r.disabilityType,
      vitalSigns: r.vitalSigns,
    };
    const created = await api('POST', '/residents', payload);
    if (created?.__skipped) { done(`Resident skipped: ${r.name}`); continue; }
    residentIdByName[r.name] = created.id;
    done(`Resident created: ${r.name} (${r.gender}, ${r.dateOfBirth}, ${r.purokName})`);
  }

  // ---- Schedules (ScheduleForm.jsx payloads) ----
  const leadBhw = (allBhws || []).find((b) => b.name === 'Maria Santos') || (allBhws || [])[0];
  const hcpMidwife = (allBhws || []).find((b) => String(b.position || '').toLowerCase().includes('midwife'));
  const SAMPLE_SCHEDULES = [
    {
      // Individual Checkup at Health Center
      scope: 'individual',
      date: futureDate(3),
      time: '09:00',
      type: 'Checkup',
      checkupCategory: 'Health Center',
      status: 'Scheduled',
      duration: 30,
      purpose: 'Routine adult checkup for Rosa Villanueva',
      notes: '',
      locationDetails: 'Barangay Gumamela Health Center',
      contactPerson: 'Marco Villanueva',
      contactNumber: '09182345678',
      residentId: residentIdByName['Rosa Villanueva'] || null,
      purokId: null,
      isBarangayWide: false,
      programName: '',
      programDescription: '',
      targetGroup: '',
      targetCount: null,
      venue: '',
      coordinatorName: '',
      coordinatorContact: '',
      partnerOrganization: '',
      maxParticipants: null,
      assignedBhws: leadBhw ? [{ bhwId: leadBhw.id, id: leadBhw.id, name: leadBhw.name, contactNumber: leadBhw.contactNumber }] : [],
      healthcareProfessionals: hcpMidwife ? [{ hcpId: hcpMidwife.id, id: hcpMidwife.id, name: hcpMidwife.name, contact: hcpMidwife.contactNumber }] : [],
    },
    {
      // Individual Senior home visit
      scope: 'individual',
      date: futureDate(5),
      time: '10:30',
      type: 'Senior Checkup',
      checkupCategory: 'Home Visit',
      status: 'Scheduled',
      duration: 30,
      purpose: 'Blood pressure follow-up and maintenance refill',
      notes: 'Bring BP apparatus and maintenance list.',
      locationDetails: 'Residence, Purok San Roque',
      contactPerson: 'Liza Navarro',
      contactNumber: '09184567890',
      residentId: residentIdByName['Teresita Navarro'] || null,
      purokId: null,
      isBarangayWide: false,
      programName: '',
      programDescription: '',
      targetGroup: '',
      targetCount: null,
      venue: '',
      coordinatorName: '',
      coordinatorContact: '',
      partnerOrganization: '',
      maxParticipants: null,
      assignedBhws: leadBhw ? [{ bhwId: leadBhw.id, id: leadBhw.id, name: leadBhw.name, contactNumber: leadBhw.contactNumber }] : [],
      healthcareProfessionals: [],
    },
    {
      // Per-purok program (Buntis Congress style)
      scope: 'purok',
      date: futureDate(10),
      time: '08:00',
      type: 'Program',
      status: 'Scheduled',
      duration: 240,
      purpose: 'Buntis Congress: prenatal lectures, free vitamins and BP screening',
      notes: 'Bring prenatal records and PhilHealth IDs.',
      locationDetails: '',
      contactPerson: '',
      contactNumber: '',
      residentId: null,
      purokId: purokIdByName['Gumamela Proper'] || null,
      isBarangayWide: false,
      programName: 'Buntis Congress sa Gumamela Proper',
      programDescription: 'Maternal health assembly for expectant mothers: prenatal lectures, free vitamins and BP screening.',
      targetGroup: 'Pregnant Women',
      targetCount: 40,
      venue: 'Gumamela Proper Covered Court',
      coordinatorName: 'Maria Santos',
      coordinatorContact: '09171234567',
      partnerOrganization: 'City Health Office',
      maxParticipants: 60,
      assignedBhws: leadBhw ? [{ bhwId: leadBhw.id, id: leadBhw.id, name: leadBhw.name, contactNumber: leadBhw.contactNumber }] : [],
      healthcareProfessionals: hcpMidwife ? [{ hcpId: hcpMidwife.id, id: hcpMidwife.id, name: hcpMidwife.name, contact: hcpMidwife.contactNumber }] : [],
    },
    {
      // Barangay-wide immunization drive
      scope: 'barangay',
      date: futureDate(17),
      time: '08:00',
      type: 'Program',
      status: 'Scheduled',
      duration: 480,
      purpose: 'Barangay-wide catch-up immunization and deworming drive',
      notes: 'Bring immunization cards. First come, first served.',
      locationDetails: '',
      contactPerson: '',
      contactNumber: '',
      residentId: null,
      purokId: null,
      isBarangayWide: true,
      programName: 'Bakuna at Purga Drive 2026',
      programDescription: 'Catch-up immunization for infants and biannual deworming for all ages.',
      targetGroup: 'All Residents',
      targetCount: 300,
      venue: 'Barangay Gumamela Plaza',
      coordinatorName: 'Lorna Dela Cruz',
      coordinatorContact: '09173456789',
      partnerOrganization: 'DOH - Rural Health Unit',
      maxParticipants: 350,
      assignedBhws: leadBhw ? [{ bhwId: leadBhw.id, id: leadBhw.id, name: leadBhw.name, contactNumber: leadBhw.contactNumber }] : [],
      healthcareProfessionals: [],
    },
  ];

  for (const s of SAMPLE_SCHEDULES) {
    const label = s.scope === 'individual' ? `${s.type} (${s.date})` : `${s.programName} (${s.date})`;
    const created = await api('POST', '/schedules', s);
    if (created?.__skipped) { done(`Schedule skipped: ${label}`); continue; }
    done(`Schedule created: ${label}`);
  }

  console.log(`\nDone. ${n} sample rows processed (created or already present).`);
};

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
