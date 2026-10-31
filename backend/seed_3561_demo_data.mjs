// seed_3561_demo_data.mjs
// ---------------------------------------------------------------------------
// DEMO / SAMPLE DATA ONLY — no application code is modified by this script.
//
// Creates, through the REAL backend API (same payload shapes the frontend
// sends from its forms):
//   * 12 puroks named "Purok 1" ... "Purok 12"
//   * 12 demo BHWs (one per purok, no focus-group claim so existing
//     focus-group assignments are never disturbed)
//   * exactly 3,561 residents distributed across the 12 puroks
//   * medical histories for every resident, with vital signs, chronic
//     conditions, medications and allergies
//   * missed individual checkup schedules (status = "Missed")
//
// Payload sources mirrored from the frontend:
//   Purok.jsx            -> POST /api/puroks { name }
//   ResidentForm.jsx     -> POST /api/residents { name, dateOfBirth, age,
//                           gender, civilStatus, purokId, contactNumber,
//                           contactPerson, contactPersonNumber,
//                           contactPersonAddress, lastCheckup, focusGroups,
//                           motherName, fatherName, disabilityType,
//                           chronicConditions, vitalSigns {...}, isPwd }
//   BHWForm.jsx          -> POST /api/bhws { name, position, contactNumber,
//                           email, status, assignedPurokId,
//                           assignedFocusGroup, username, password,
//                           accountRole, workerType }
//   ResidentDetail.jsx   -> POST /api/residents/:id/medical-history
//                           { date, type, facility, diagnosis, treatment,
//                             notes, vitalSigns, prenatal, administered_by,
//                             chronicConditions, currentMedications,
//                             allergies }
//   ScheduleForm.jsx     -> POST /api/schedules { scope, date, time, type,
//                           status, duration, purpose, notes,
//                           locationDetails, contactPerson, contactNumber,
//                           residentId, purokId, isBarangayWide,
//                           assignedBhws, healthcareProfessionals, ... }
//
// The run is RESUMABLE: existing rows are detected and never duplicated.
//
// Usage (backend must be running):
//   node seed_3561_demo_data.mjs
//   node seed_3561_demo_data.mjs --limit=24 --concurrency=8   (smoke test)
//   node seed_3561_demo_data.mjs --phase=residents,histories
// ---------------------------------------------------------------------------

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { supabase } from './src/config/supabase.js';
import { calculateCompositeRiskScore } from './src/utils/riskCalculator.js';

dotenv.config();

// ---------------------------------------------------------------- config ---
const API = process.env.SEED_API_URL || 'http://localhost:5000/api';
const TARGET_RESIDENTS = 3561;
const PUROK_NAMES = Array.from({ length: 12 }, (_, i) => `Purok ${i + 1}`);
const DEMO_BHW_PASSWORD = 'DemoBhw2026!';

const argv = process.argv.slice(2);
const arg = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const LIMIT = Math.max(0, Math.min(TARGET_RESIDENTS, Number(arg('limit') || TARGET_RESIDENTS)));
const CONCURRENCY = Math.max(1, Number(arg('concurrency') || 10));
const MODE = String(arg('mode') || 'api').toLowerCase(); // api | bulk
const PHASES = new Set(
  String(arg('phase') || 'puroks,bhws,residents,histories,schedules,risk,verify')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// --------------------------------------------------------------- helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TODAY = (() => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
})();

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const computeAge = (dob) => {
  let years = TODAY.getUTCFullYear() - dob.getUTCFullYear();
  const m = TODAY.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && TODAY.getUTCDate() < dob.getUTCDate())) years--;
  return Math.max(0, years);
};

// Deterministic PRNG so every run regenerates the same people.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rint = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;
const round1 = (n) => Math.round(n * 10) / 10;

// ----------------------------------------------------------- name pools ---
const FEMALE_FIRST = [
  'Maria', 'Josefa', 'Lorna', 'Angelica', 'Rosa', 'Teresita', 'Katrina',
  'Jennylyn', 'Ana', 'Cristina', 'Michelle', 'Grace', 'Jasmine', 'Aileen',
  'Rowena', 'Marilou', 'Editha', 'Nelia', 'Corazon', 'Liza', 'Mylene',
  'Rachel', 'Sarah', 'Joan', 'Karen', 'Patricia', 'Divina', 'Evelyn',
  'Maricel', 'Arlene', 'Bernadette', 'Catherine', 'Diana', 'Elaine',
  'Florence', 'Gina', 'Hazel', 'Irene', 'Jocelyn', 'Kristine', 'Lorraine',
  'Marilyn', 'Nora', 'Olivia', 'Pauline', 'Queenie', 'Rebecca', 'Sheila',
  'Theresa', 'Vivian', 'Wendy', 'Yvonne', 'Zenaida', 'Abigail', 'Bianca',
  'Camille', 'Danica', 'Erika', 'Faith', 'Gabriela', 'Helena', 'Isabel',
  'Jessa', 'Kimberly', 'Liza Mae', 'Mikaela', 'Nadine', 'Precious',
];

const MALE_FIRST = [
  'Jose', 'Juan', 'Danilo', 'Paolo', 'Marco', 'Ramon', 'Carlos', 'Miguel',
  'Antonio', 'Roberto', 'Eduardo', 'Ricardo', 'Fernando', 'Alfredo',
  'Benigno', 'Cesar', 'Domingo', 'Ernesto', 'Francisco', 'Gregorio',
  'Hector', 'Ignacio', 'Joaquin', 'Leonardo', 'Manuel', 'Nestor', 'Oscar',
  'Pablo', 'Rafael', 'Salvador', 'Tomas', 'Victor', 'Wilfredo', 'Arnold',
  'Benjamin', 'Christian', 'Dennis', 'Emmanuel', 'Ferdinand', 'Gilbert',
  'Harold', 'Ismael', 'Jonathan', 'Kevin', 'Lorenzo', 'Mario', 'Noel',
  'Orlando', 'Patrick', 'Quirino', 'Rodrigo', 'Samuel', 'Teodoro',
  'Ulysses', 'Vincent', 'Walter', 'Xavier', 'Zachary', 'Adrian', 'Brian',
  'Carlo', 'Daniel', 'Eric', 'Felix', 'Gabriel', 'Henry', 'Ivan',
  'Jerome', 'Kurt', 'Luis', 'Mark', 'Nathaniel', 'Oliver', 'Peter',
];

const OTHER_FIRST = [
  'Alex', 'Jordan', 'Riley', 'Casey', 'Jamie', 'Taylor', 'Morgan',
  'Avery', 'Dakota', 'Skyler', 'Reese', 'Rowan',
];

const MIDDLE_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Villanueva', 'Mendoza',
  'Navarro', 'Ramos', 'Dela Cruz', 'Garcia', 'Aquino', 'Torres', 'Flores',
  'Gonzales', 'Roxas', 'Castillo', 'Soriano', 'Domingo', 'Salazar',
  'Mercado', 'Pascual', 'Rivera', 'Aguilar', 'Marquez', 'Fernandez',
  'Lopez', 'Perez', 'Ramirez', 'Tolentino', 'Valdez', 'Velasco', 'Yap',
  'Zamora', 'Abad', 'Alonzo', 'Ambrocio', 'Andrade', 'Angeles',
  'Arellano', 'Bacani', 'Bello', 'Bernardo', 'Buenaventura', 'Cabrera',
  'Calderon', 'Camacho', 'Capistrano', 'Cortez', 'Dizon', 'Enriquez',
  'Estrada', 'Fajardo', 'Galang', 'Gomez', 'Hernandez', 'Iglesias',
  'Javier', 'Lacson', 'Lagman', 'Lim', 'Macaraeg', 'Magbanua', 'Manalo',
  'Nolasco', 'Padilla', 'Panganiban', 'Quinto', 'Recto', 'Rosales',
  'Santiago', 'Tabios', 'Ubaldo', 'Vargas', 'Vera', 'Ylagan', 'Zarate',
];

const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Villanueva', 'Mendoza',
  'Navarro', 'Ramos', 'Dela Cruz', 'Garcia', 'Aquino', 'Torres', 'Flores',
  'Gonzales', 'Roxas', 'Castillo', 'Soriano', 'Domingo', 'Salazar',
  'Mercado', 'Pascual', 'Rivera', 'Aguilar', 'Marquez', 'Fernandez',
  'Lopez', 'Perez', 'Ramirez', 'Tolentino', 'Valdez', 'Velasco', 'Yap',
  'Zamora', 'Abad', 'Alonzo', 'Ambrocio', 'Andrade', 'Angeles',
  'Arellano', 'Bacani', 'Bello', 'Bernardo', 'Buenaventura', 'Cabrera',
  'Calderon', 'Camacho', 'Capistrano', 'Cortez', 'Dizon', 'Enriquez',
  'Estrada', 'Fajardo', 'Galang', 'Gomez', 'Hernandez', 'Iglesias',
  'Javier', 'Lacson', 'Lagman', 'Lim', 'Macaraeg', 'Magbanua', 'Manalo',
  'Nolasco', 'Padilla', 'Panganiban', 'Quinto', 'Recto', 'Rosales',
  'Santiago', 'Tabios', 'Ubaldo', 'Vargas', 'Vera', 'Ylagan', 'Zarate',
];

const DISABILITIES = [
  'Visual impairment - low vision (left eye)',
  'Visual impairment - low vision (right eye)',
  'Hearing impairment - bilateral',
  'Physical disability - polio (left leg)',
  'Physical disability - amputated right foot',
  'Physical disability - chronic low back pain',
  'Speech impairment',
  'Intellectual disability - mild',
  'Psychosocial disability - controlled',
];

const DEMO_BHWS = [
  { name: 'Aurora Salazar', username: 'bhw.aurora', email: 'aurora.salazar@citicare.demo' },
  { name: 'Bernardo Lim', username: 'bhw.bernardo', email: 'bernardo.lim@citicare.demo' },
  { name: 'Cecilia Padilla', username: 'bhw.cecilia', email: 'cecilia.padilla@citicare.demo' },
  { name: 'Dominic Cortez', username: 'bhw.dominic', email: 'dominic.cortez@citicare.demo' },
  { name: 'Estrella Magbanua', username: 'bhw.estrella', email: 'estrella.magbanua@citicare.demo' },
  { name: 'Felipe Rosales', username: 'bhw.felipe', email: 'felipe.rosales@citicare.demo' },
  { name: 'Gloria Panganiban', username: 'bhw.gloria', email: 'gloria.panganiban@citicare.demo' },
  { name: 'Hector Ylagan', username: 'bhw.hector', email: 'hector.ylagan@citicare.demo' },
  { name: 'Imelda Bacani', username: 'bhw.imelda', email: 'imelda.bacani@citicare.demo' },
  { name: 'Joaquin Manalo', username: 'bhw.joaquin', email: 'joaquin.manalo@citicare.demo' },
  { name: 'Kristina Vera', username: 'bhw.kristina', email: 'kristina.vera@citicare.demo' },
  { name: 'Leonardo Ubaldo', username: 'bhw.leonardo', email: 'leonardo.ubaldo@citicare.demo' },
];

// ------------------------------------------------------- age distribution ---
const BUCKET_DEFS = [
  { key: '0-4', count: 285, min: 0, max: 4, infant: true },
  { key: '5-14', count: 640, min: 5, max: 14 },
  { key: '15-19', count: 320, min: 15, max: 19 },
  { key: '20-39', count: 997, min: 20, max: 39 },
  { key: '40-59', count: 783, min: 40, max: 59 },
  { key: '60+', count: 536, min: 60, max: 92 },
];

const BUCKET_LIST = (() => {
  const list = [];
  for (const b of BUCKET_DEFS) for (let i = 0; i < b.count; i++) list.push(b);
  const rng = mulberry32(0xc0ffee);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
})();

const CONDITION_POOLS = {
  '0-4': ['Asthma', 'Anemia'],
  '5-14': ['Asthma', 'Anemia', 'Migraine'],
  '15-19': ['Asthma', 'Migraine', 'Anemia', 'Thyroid Disorder'],
  '20-39': ['Hypertension', 'Asthma', 'Migraine', 'Thyroid Disorder', 'Anemia'],
  '40-59': ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Arthritis', 'Heart Disease', 'Chronic Kidney Disease', 'Migraine'],
  '60+': ['Hypertension', 'Type 2 Diabetes', 'Arthritis', 'Heart Disease', 'COPD', 'Cataract', 'Chronic Kidney Disease', 'Asthma'],
};

const CONDITION_PREVALENCE = {
  '0-4': 0.04,
  '5-14': 0.09,
  '15-19': 0.07,
  '20-39': 0.14,
  '40-59': 0.4,
  '60+': 0.7,
};

const SEVERITY_WEIGHTS = {
  Hypertension: [0.25, 0.45, 0.3],
  'Type 2 Diabetes': [0.25, 0.5, 0.25],
  Asthma: [0.55, 0.35, 0.1],
  Arthritis: [0.4, 0.45, 0.15],
  'Heart Disease': [0.2, 0.45, 0.35],
  COPD: [0.25, 0.45, 0.3],
  Cataract: [0.5, 0.4, 0.1],
  'Chronic Kidney Disease': [0.3, 0.45, 0.25],
  Migraine: [0.6, 0.35, 0.05],
  Anemia: [0.7, 0.3, 0],
  'Thyroid Disorder': [0.5, 0.4, 0.1],
};

const severityFor = (condition, rng) => {
  const [mild, moderate] = SEVERITY_WEIGHTS[condition] || [0.5, 0.35, 0.15];
  const roll = rng();
  if (roll < mild) return 'Mild';
  if (roll < mild + moderate) return 'Moderate';
  return 'Severe';
};

// ============================================================ plan builder ===
const usedNames = new Set();

const uniqueName = (first, rng) => {
  const middle = pick(rng, MIDDLE_NAMES);
  const last = pick(rng, LAST_NAMES);
  let name = `${first} ${middle} ${last}`;
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const start = MIDDLE_NAMES.indexOf(middle);
  for (let k = 1; k < MIDDLE_NAMES.length; k++) {
    const candidate = `${first} ${MIDDLE_NAMES[(start + k) % MIDDLE_NAMES.length]} ${last}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  let n = 2;
  while (usedNames.has(`${first} ${middle} ${last} ${n}`)) n++;
  name = `${first} ${middle} ${last} ${n}`;
  usedNames.add(name);
  return name;
};

const generateConditions = (bucketKey, rng) => {
  if (!chance(rng, CONDITION_PREVALENCE[bucketKey])) return [];
  const pool = CONDITION_POOLS[bucketKey];
  const first = pick(rng, pool);
  const list = [{ name: first, severity: severityFor(first, rng) }];
  const extraChance = bucketKey === '60+' ? 0.38 : bucketKey === '40-59' ? 0.25 : 0.12;
  if (chance(rng, extraChance)) {
    const remaining = pool.filter((c) => c !== first);
    const second = pick(rng, remaining);
    if (second) list.push({ name: second, severity: severityFor(second, rng) });
  }
  if (bucketKey === '60+' && chance(rng, 0.12)) {
    const remaining = pool.filter((c) => !list.some((l) => l.name === c));
    const third = pick(rng, remaining);
    if (third) list.push({ name: third, severity: severityFor(third, rng) });
  }
  return list;
};

const generateVitals = (age, gender, conditions, rng) => {
  const names = conditions.map((c) => c.name);
  const htn = conditions.find((c) => c.name === 'Hypertension');
  const dm = conditions.find((c) => c.name === 'Type 2 Diabetes');
  const heart = names.includes('Heart Disease');
  const lung = names.includes('Asthma') || names.includes('COPD');

  let height;
  let weight;
  if (age < 1) {
    height = rint(rng, 50, 74);
    weight = 3.4 + (height - 50) * 0.22 + rng() * 1.5;
  } else if (age < 5) {
    height = rint(rng, 76, 108);
    weight = 9 + (height - 76) * 0.28 + rng() * 2;
  } else if (age < 10) {
    height = rint(rng, 108, 138);
    weight = 17 + (height - 108) * 0.42 + rng() * 3;
  } else if (age < 15) {
    height = rint(rng, 138, 165);
    weight = 35 + (height - 138) * 0.5 + rng() * 5;
  } else {
    height = gender === 'Female'
      ? (age < 20 ? rint(rng, 148, 170) : rint(rng, 145, 170))
      : gender === 'Male'
        ? (age < 20 ? rint(rng, 158, 180) : rint(rng, 158, 182))
        : rint(rng, 155, 178);
    const roll = rng();
    const targetBmi = roll < 0.4
      ? 19 + rng() * 3
      : roll < 0.72
        ? 22 + rng() * 3
        : roll < 0.92
          ? 25 + rng() * 4.5
          : 29.5 + rng() * 5;
    weight = targetBmi * ((height / 100) ** 2);
  }

  let bp = null;
  let sys;
  let dia;
  if (age >= 5) {
    if (htn) {
      if (htn.severity === 'Severe') {
        sys = rint(rng, 165, 190);
        dia = rint(rng, 100, 115);
      } else if (htn.severity === 'Moderate') {
        sys = rint(rng, 145, 165);
        dia = rint(rng, 92, 102);
      } else {
        sys = rint(rng, 135, 148);
        dia = rint(rng, 86, 94);
      }
    } else if (age >= 60) {
      sys = rint(rng, 118, 145);
      dia = rint(rng, 72, 90);
    } else {
      sys = rint(rng, 100, 130);
      dia = rint(rng, 65, 85);
    }
    if (dia >= sys) dia = sys - 30;
    bp = `${sys}/${dia}`;
  }

  let hr;
  if (age < 1) hr = rint(rng, 100, 140);
  else if (age < 5) hr = rint(rng, 90, 125);
  else if (heart) hr = chance(rng, 0.5) ? rint(rng, 52, 59) : rint(rng, 96, 112);
  else if (lung) hr = rint(rng, 88, 104);
  else hr = rint(rng, 62, 96);

  const temperature = chance(rng, 0.02)
    ? round1(37.6 + rng() * 0.8)
    : round1(36.2 + rng() * 1.0);

  let bloodSugar = null;
  if (age >= 15) {
    if (dm) {
      bloodSugar = dm.severity === 'Severe'
        ? rint(rng, 160, 240)
        : dm.severity === 'Moderate'
          ? rint(rng, 130, 175)
          : rint(rng, 110, 135);
    } else if (chance(rng, 0.12)) {
      bloodSugar = rint(rng, 100, 124);
    } else {
      bloodSugar = rint(rng, 78, 99);
    }
  }

  const bmi = age < 2 ? null : round1(weight / ((height / 100) ** 2));

  return {
    bloodPressure: bp,
    heartRate: String(hr),
    temperature: temperature.toFixed(1),
    weight: round1(weight).toFixed(1),
    height: String(height),
    bloodSugar: bloodSugar == null ? null : String(bloodSugar),
    bmi: bmi == null ? null : bmi.toFixed(1),
  };
};

const jitterVitals = (vitals, rng) => {
  const out = { ...vitals };
  if (vitals.bloodPressure) {
    const [s, d] = vitals.bloodPressure.split('/').map(Number);
    out.bloodPressure = `${Math.max(90, s + rint(rng, -6, 6))}/${Math.max(55, d + rint(rng, -4, 4))}`;
  }
  if (vitals.heartRate) out.heartRate = String(Math.max(45, Number(vitals.heartRate) + rint(rng, -8, 8)));
  if (vitals.temperature) out.temperature = Math.max(35.8, round1(Number(vitals.temperature) + (rng() - 0.5) * 0.6)).toFixed(1);
  if (vitals.weight) out.weight = Math.max(2, round1(Number(vitals.weight) + (rng() - 0.5) * 3)).toFixed(1);
  if (vitals.bloodSugar) out.bloodSugar = String(Math.max(60, Number(vitals.bloodSugar) + rint(rng, -8, 8)));
  if (vitals.height && Number(vitals.height) > 0 && out.weight) {
    out.bmi = round1(Number(out.weight) / ((Number(vitals.height) / 100) ** 2)).toFixed(1);
  }
  return out;
};

const generateMedications = (conditions, rng) => {
  const meds = [];
  for (const c of conditions) {
    if (c.name === 'Hypertension' && chance(rng, 0.85)) {
      meds.push({ name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily' });
    }
    if (c.name === 'Type 2 Diabetes' && chance(rng, 0.85)) {
      meds.push({ name: 'Metformin 500mg', dosage: '500mg', frequency: 'Twice daily' });
    }
    if (c.name === 'Arthritis' && chance(rng, 0.5)) {
      meds.push({ name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'As needed for pain' });
    }
    if (c.name === 'Asthma' && chance(rng, 0.6)) {
      meds.push({ name: 'Salbutamol Inhaler', dosage: '100 mcg', frequency: 'As needed' });
    }
    if (c.name === 'Heart Disease' && chance(rng, 0.7)) {
      meds.push({ name: 'Aspirin 80mg', dosage: '80mg', frequency: 'Once daily' });
    }
    if (c.name === 'COPD' && chance(rng, 0.6)) {
      meds.push({ name: 'Tiotropium Inhaler', dosage: '18 mcg', frequency: 'Once daily' });
    }
  }
  return [...new Map(meds.map((m) => [m.name, m])).values()];
};

const generateAllergies = (rng) => {
  const allergies = { drugs: [], food: [], environmental: [] };
  const roll = rng();
  if (roll < 0.03) allergies.drugs.push('Penicillin');
  else if (roll < 0.05) allergies.drugs.push('Sulfa drugs');
  if (chance(rng, 0.04)) allergies.food.push(pick(rng, ['Egg', 'Seafood', 'Peanuts', 'Milk']));
  if (chance(rng, 0.03)) allergies.environmental.push(pick(rng, ['Dust', 'Pollen', 'Animal dander']));
  return allergies;
};

// ------------------------------------------------------ history content ---
const diagnosisFor = (plan, type, gaWeeks) => {
  if (type === 'Prenatal Checkup') {
    return gaWeeks >= 28
      ? `Pregnancy at ${gaWeeks} weeks, cephalic presentation. Advised birth planning and danger-sign counselling.`
      : `Healthy pregnancy at ${gaWeeks} weeks. Continue prenatal vitamins and regular ANC visits.`;
  }
  if (type === 'Growth Monitoring') {
    const c = plan.conditions[0];
    return c
      ? `${c.name}, ${c.severity.toLowerCase()}. Growth and development monitored.`
      : 'Normal growth and development for age. Continue breastfeeding and complementary feeding.';
  }
  const c = plan.conditions[0];
  if (c) {
    switch (c.name) {
      case 'Hypertension':
        return `Hypertension, ${c.severity.toLowerCase() === 'severe' ? 'uncontrolled' : 'stable'}. Continue maintenance medication and low-salt diet.`;
      case 'Type 2 Diabetes':
        return `Type 2 Diabetes Mellitus, ${c.severity.toLowerCase()}. Advised diet, exercise and medication adherence.`;
      case 'Asthma':
        return `Bronchial asthma, ${c.severity.toLowerCase()}. Inhaler technique reviewed.`;
      case 'Arthritis':
        return `Osteoarthritis, ${c.severity.toLowerCase()}. Advised joint protection and regular exercise.`;
      case 'Heart Disease':
        return 'Coronary artery disease, stable. Referred for cardiology follow-up.';
      case 'COPD':
        return 'COPD, stable. Advised smoking cessation and breathing exercises.';
      case 'Cataract':
        return 'Cataract suspect, right eye. Referred to the eye clinic.';
      case 'Chronic Kidney Disease':
        return 'Chronic kidney disease, stable. Advised low-salt, low-protein diet.';
      case 'Migraine':
        return 'Migraine, episodic. Advised trigger avoidance and adequate rest.';
      case 'Anemia':
        return 'Mild anemia. Advised iron-rich diet and iron supplementation.';
      case 'Thyroid Disorder':
        return 'Thyroid disorder, stable on medication.';
      default:
        return `${c.name}, ${c.severity.toLowerCase()}.`;
    }
  }
  return type === 'Senior Checkup'
    ? 'Fit for age. Continue daily walking and a low-salt diet.'
    : 'Generally healthy. Advised balanced diet and regular exercise.';
};

const symptomsFor = (plan, type, rng) => {
  if (type === 'Prenatal Checkup') {
    return pick(rng, ['None', 'Mild back pain', 'Leg cramps at night', 'Morning nausea', 'Occasional headache']);
  }
  if (type === 'Growth Monitoring') {
    return pick(rng, ['None', 'Mild cough', 'Decreased appetite', 'Loose stools (1 day)']);
  }
  if (plan.age < 5) {
    return pick(rng, ['None', 'Fever (2 days)', 'Mild cough', 'Decreased appetite']);
  }
  if (plan.age >= 60) {
    return pick(rng, ['None', 'Knee pain', 'Blurry vision', 'Morning headache', 'Dizziness on standing', 'Chest heaviness on exertion']);
  }
  return pick(rng, ['None', 'Mild headache', 'Cough and colds (3 days)', 'Body weakness', 'Occasional dizziness', 'Joint pains']);
};

const notesFor = (plan, type, symptoms, diagnosis, vitals, prenatal, rng) => {
  const lines = [];
  if (type === 'Prenatal Checkup') {
    lines.push('Reason for checkup: Prenatal checkup');
    lines.push(`LMP: ${prenatal.lmp}`);
    lines.push(`EDD: ${prenatal.edd}`);
    lines.push(`Gravida: ${prenatal.gravida}`);
    lines.push(`Para: ${prenatal.para}`);
    lines.push('Pregnancy status: Active');
    lines.push(`Gestational age: ${prenatal.gestationalAge}`);
    if (prenatal.fundalHeight) lines.push(`Fundal height: ${prenatal.fundalHeight} cm`);
    lines.push(`Fetal heart rate: ${prenatal.fetalHeartRate} bpm`);
    lines.push(`Fetal movement: ${prenatal.fetalMovement}`);
    lines.push(`MUAC: ${prenatal.muac} cm`);
    lines.push(`MUAC date: ${prenatal.muacDate}`);
    lines.push(`TD status: ${prenatal.tdStatus}`);
    lines.push(`Pregnancy-related signs / symptoms: ${symptoms}`);
  } else if (type === 'Growth Monitoring') {
    const months = Math.max(0, Math.floor((new Date(plan.lastCheckup) - plan.dob) / (30.44 * 86400000)));
    lines.push(`Weight: ${vitals.weight} kg`);
    lines.push(`Length / Height: ${vitals.height} cm`);
    lines.push(`Head circumference: ${rint(rng, 40, 50)} cm`);
    lines.push(`Age in months: ${months}`);
    lines.push(`Feeding status: ${pick(rng, ['Exclusive breastfeeding', 'Mixed feeding', 'Complementary feeding plus breastmilk'])}`);
    lines.push('Growth status: Normal');
    lines.push(`Nutritional status: ${pick(rng, ['Normal', 'Normal', 'At risk'])}`);
    lines.push(`Developmental milestones: ${pick(rng, ['Sits without support', 'Walks with support', 'Says single words', 'Runs and climbs'])}`);
    lines.push('Developmental concerns: None');
    lines.push(`Respiratory rate: ${rint(rng, 24, 36)} breaths/min`);
    lines.push(`Nutrition / Growth concerns: ${symptoms}`);
    lines.push(`Assessment / Findings: ${diagnosis}`);
  } else if (type === 'Senior Checkup') {
    lines.push('Reason for checkup: Annual senior wellness exam');
    lines.push(`Symptoms: ${symptoms}`);
    if (vitals.bloodSugar) lines.push(`Fasting blood sugar: ${vitals.bloodSugar} mg/dL`);
    lines.push(`Mobility / Functional status: ${pick(rng, ['Independent in all activities of daily living', 'Ambulatory with cane for long distances', 'Needs assistance with heavy chores'])}`);
    lines.push(`Assessment / Findings: ${diagnosis}`);
  } else {
    lines.push(`Reason for checkup: ${plan.age < 5 ? 'Routine infant checkup' : 'Routine adult checkup'}`);
    lines.push(`Symptoms: ${symptoms}`);
    if (vitals.bloodSugar) lines.push(`Fasting blood sugar: ${vitals.bloodSugar} mg/dL`);
    lines.push(`Assessment / Findings: ${diagnosis}`);
  }
  lines.push('Remarks: Demo data for system walkthrough.');
  return lines.filter(Boolean).join('\n');
};

const prenatalPayload = (lmp, date, weeks, gravida, para, rng) => ({
  lmp: iso(lmp),
  edd: iso(addDays(lmp, 280)),
  gravida: String(gravida),
  para: String(para),
  pregnancyStatus: 'Active',
  gestationalAge: `${weeks}w ${rint(rng, 0, 6)}d`,
  fundalHeight: weeks >= 20 ? String(Math.max(16, weeks + rint(rng, -2, 2))) : '',
  fetalHeartRate: String(rint(rng, 120, 160)),
  fetalMovement: pick(rng, ['Present', 'Active', 'Present', 'Active', 'Decreased']),
  muac: round1(22 + rng() * 5).toFixed(1),
  muacDate: iso(date),
  tdStatus: pick(rng, ['Td1', 'Td2', 'Td3', 'Td4']),
  ancWindow: '',
  isPrivateVisit: false,
});

const buildHistories = (plan, rng) => {
  const latest = plan.lastCheckupDate;
  const entries = [];

  const push = (date, type, opts = {}) => {
    if (!date || date > TODAY || date <= plan.dob) return;
    const vitals = opts.vitals || plan.vitals;
    const symptoms = symptomsFor(plan, type, rng);
    const diagnosis = opts.diagnosis || diagnosisFor(plan, type, opts.ga);
    const reason = type === 'Prenatal Checkup'
      ? 'Prenatal visit'
      : type === 'Growth Monitoring'
        ? 'Growth monitoring'
        : type === 'Senior Checkup'
          ? 'Annual senior wellness exam'
          : 'Routine checkup';
    entries.push({
      date: iso(date),
      type,
      facility: type === 'Senior Checkup' && chance(rng, 0.25) ? 'Home' : 'Barangay Health Center',
      diagnosis,
      treatment: `${reason} | ${symptoms}`,
      notes: notesFor(plan, type, symptoms, diagnosis, vitals, opts.prenatal, rng),
      vitalSigns: vitals,
      administered_by: plan.bhwName,
      chronicConditions: plan.conditions,
      currentMedications: plan.medications,
      allergies: plan.allergies,
      ...(opts.prenatal ? { prenatal: opts.prenatal } : {}),
    });
  };

  if (plan.isPregnant) {
    const ga = rint(rng, 12, 36);
    const lmp = addDays(latest, -(ga * 7 + rint(rng, 0, 6)));
    const gravida = rint(rng, 1, 4);
    const para = rint(rng, 0, Math.max(0, gravida - 1));
    const earlierGa = Math.max(4, ga - rint(rng, 6, 12));
    const earlierDate = addDays(lmp, earlierGa * 7 + rint(rng, 0, 4));
    if (earlierDate < latest) {
      push(earlierDate, 'Prenatal Checkup', {
        vitals: jitterVitals(plan.vitals, rng),
        prenatal: prenatalPayload(lmp, earlierDate, earlierGa, gravida, para, rng),
      });
    }
    push(latest, 'Prenatal Checkup', {
      vitals: plan.vitals,
      prenatal: prenatalPayload(lmp, latest, ga, gravida, para, rng),
    });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  if (plan.age < 5) {
    const earlierDate = addDays(latest, -rint(rng, 60, 180));
    if (earlierDate > plan.dob) push(earlierDate, 'Growth Monitoring', { vitals: jitterVitals(plan.vitals, rng) });
    push(latest, 'Checkup', { vitals: plan.vitals });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  if (plan.age >= 60) {
    if (chance(rng, 0.7)) {
      const earlierDate = addDays(latest, -rint(rng, 90, 330));
      if (earlierDate > plan.dob) push(earlierDate, 'Checkup', { vitals: jitterVitals(plan.vitals, rng) });
    }
    push(latest, 'Senior Checkup', { vitals: plan.vitals });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  const wantSecond = (plan.conditions.length > 0 && chance(rng, 0.55)) || chance(rng, 0.25);
  if (wantSecond) {
    const earlierDate = addDays(latest, -rint(rng, 90, 330));
    if (earlierDate > plan.dob) push(earlierDate, 'Checkup', { vitals: jitterVitals(plan.vitals, rng) });
  }
  push(latest, 'Checkup', { vitals: plan.vitals });
  return entries.sort((a, b) => a.date.localeCompare(b.date));
};

const buildMissed = (plan, rng) => {
  if (!chance(rng, 0.2)) return [];
  const roll = rng();
  const count = roll < 0.7 ? 1 : roll < 0.92 ? 2 : 3;
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < count && guard < 40) {
    guard++;
    const daysAgo = rint(rng, 10, 300);
    const time = `${String(rint(rng, 8, 16)).padStart(2, '0')}:${pick(rng, ['00', '30'])}`;
    const key = `${daysAgo}|${time}`;
    if (used.has(key)) continue;
    used.add(key);
    const date = addDays(TODAY, -daysAgo);
    if (date <= plan.dob) continue;
    const type = plan.isPregnant
      ? 'Prenatal Checkup'
      : plan.age < 5
        ? 'Growth Monitoring'
        : plan.age >= 60
          ? 'Senior Checkup'
          : 'Checkup';
    out.push({
      date: iso(date),
      time,
      type,
      purpose: `${type} follow-up for ${plan.name}`,
      notes: 'Resident did not attend the scheduled visit. For follow-up by the assigned BHW.',
    });
  }
  return out;
};

// ================================================================ plans ===
const makePlan = (i) => {
  const rng = mulberry32(0x51ed270b + i * 2654435761);
  const bucket = BUCKET_LIST[i];
  const g = rng();
  const gender = g < 0.505 ? 'Female' : g < 0.995 ? 'Male' : 'Other';
  const first = gender === 'Female'
    ? pick(rng, FEMALE_FIRST)
    : gender === 'Male'
      ? pick(rng, MALE_FIRST)
      : pick(rng, OTHER_FIRST);
  const name = uniqueName(first, rng);

  let dob;
  let age;
  if (bucket.infant) {
    const months = rint(rng, 0, 54);
    const days = Math.round(months * 30.4375) + rint(rng, 0, 27);
    dob = addDays(TODAY, -days);
    age = computeAge(dob);
  } else {
    let guard = 0;
    do {
      const years = rint(rng, bucket.min, bucket.max);
      dob = addDays(TODAY, -(years * 365 + rint(rng, 0, 364)));
      age = computeAge(dob);
      guard++;
    } while ((age < bucket.min || age > bucket.max) && guard < 60);
  }

  let civilStatus;
  if (age < 18) civilStatus = 'Single';
  else if (age < 30) civilStatus = chance(rng, 0.7) ? 'Single' : chance(rng, 0.8) ? 'Married' : 'Separated';
  else if (age < 60) civilStatus = chance(rng, 0.7) ? 'Married' : chance(rng, 0.55) ? 'Single' : chance(rng, 0.6) ? 'Separated' : 'Widowed';
  else civilStatus = chance(rng, 0.45) ? 'Widowed' : chance(rng, 0.85) ? 'Married' : chance(rng, 0.6) ? 'Single' : 'Separated';

  const purokIndex = (i % 12) + 1;
  const contactNumber = `09${String(170000000 + i).padStart(9, '0')}`;
  const contactPersonNumber = `09${String(280000000 + i).padStart(9, '0')}`;

  const conditions = generateConditions(bucket.key, rng);
  const vitals = generateVitals(age, gender, conditions, rng);
  const medications = generateMedications(conditions, rng);
  const allergies = generateAllergies(rng);

  const isPwd = age >= 5 && chance(rng, 0.015);
  const disabilityType = isPwd ? pick(rng, DISABILITIES) : null;
  const isPregnant = gender === 'Female' && age >= 18 && age <= 45 && chance(rng, 0.07);

  const focusGroups = [];
  if (age < 5) focusGroups.push('infant');
  if (age >= 60) focusGroups.push('senior');
  if (isPregnant) focusGroups.push('pregnant');
  if (isPwd) focusGroups.push('pwd');
  if (conditions.length > 0) focusGroups.push('withCondition');

  let latest = addDays(TODAY, -rint(rng, 3, 240));
  const earliestVisit = addDays(dob, 20);
  if (latest < earliestVisit) latest = earliestVisit > TODAY ? TODAY : earliestVisit;

  const lastName = name.split(' ').slice(-1)[0];
  const motherName = age < 5 ? `${pick(rng, FEMALE_FIRST)} ${lastName}` : null;
  const fatherName = age < 5 ? `${pick(rng, MALE_FIRST)} ${lastName}` : null;
  const contactPerson = age < 5
    ? motherName
    : civilStatus === 'Married'
      ? `${pick(rng, gender === 'Female' ? MALE_FIRST : FEMALE_FIRST)} ${lastName}`
      : `${pick(rng, FEMALE_FIRST)} ${lastName}`;

  const plan = {
    index: i,
    name,
    gender,
    dob,
    age,
    civilStatus,
    purokIndex,
    contactNumber,
    contactPerson,
    contactPersonNumber,
    contactPersonAddress: `Purok ${purokIndex}, Barangay Gumamela, Naga City`,
    lastCheckupDate: latest,
    lastCheckup: iso(latest),
    focusGroups,
    isPwd,
    disabilityType,
    isPregnant,
    motherName,
    fatherName,
    conditions,
    vitals,
    medications,
    allergies,
    bhwName: DEMO_BHWS[purokIndex - 1].name,
    residentId: null,
  };

  // Separate streams so tweaking one dataset does not shift the other.
  plan.histories = buildHistories(plan, mulberry32(0x1a2b3c4d + i * 2246822519));
  plan.missed = buildMissed(plan, mulberry32(0x5e6f7a8b + i * 3266489917));
  return plan;
};

const buildPlans = (limit = TARGET_RESIDENTS) => {
  usedNames.clear();
  const plans = [];
  for (let i = 0; i < limit; i++) plans.push(makePlan(i));
  return plans;
};

// ============================================================ API client ===
const token = jwt.sign(
  { userId: 1, email: 'admin@citicare.demo', role: 'Administrator', bhwId: null },
  process.env.JWT_SECRET,
  { expiresIn: '12h' }
);

const api = async (method, path, body, attempt = 1) => {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success !== false) return data.data;

    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 5) {
      await sleep(600 * attempt + Math.random() * 400);
      return api(method, path, body, attempt + 1);
    }
    const details = data.errors ? ` | ${JSON.stringify(data.errors)}` : '';
    throw new Error(`${method} ${path} -> ${res.status}: ${data.message || 'request failed'}${details}`);
  } catch (error) {
    const transient = error.name === 'TypeError' || /fetch failed|ECONN|socket|network/i.test(String(error.message));
    if (transient && attempt < 5) {
      await sleep(800 * attempt + Math.random() * 400);
      return api(method, path, body, attempt + 1);
    }
    throw error;
  }
};

const pool = async (items, limit, worker, onProgress) => {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const started = Date.now();
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await worker(items[idx], idx) };
      } catch (error) {
        results[idx] = { ok: false, error };
      }
      done++;
      if (onProgress && (done % 25 === 0 || done === items.length)) {
        onProgress(done, items.length, started);
      }
    }
  });
  await Promise.all(runners);
  return results;
};

const progressLogger = (label) => (done, total, started) => {
  const secs = Math.max(1, (Date.now() - started) / 1000);
  const rate = done / secs;
  const eta = rate > 0 ? Math.round((total - done) / rate) : 0;
  console.log(`  ${label}: ${done}/${total} (${rate.toFixed(1)}/s, ETA ${Math.floor(eta / 60)}m ${eta % 60}s)`);
};

// ================================================================ phases ===
const ensurePuroks = async () => {
  const existing = await api('GET', '/puroks');
  const map = new Map((existing || []).map((p) => [p.name, p.id]));
  for (const name of PUROK_NAMES) {
    if (map.has(name)) {
      console.log(`  purok exists: ${name} (id ${map.get(name)})`);
      continue;
    }
    const created = await api('POST', '/puroks', { name });
    map.set(name, created.id);
    console.log(`  purok created: ${name} (id ${created.id})`);
  }
  return map;
};

const ensureBhws = async (purokMap) => {
  const existing = await api('GET', '/bhws');
  const byName = new Map((existing || []).map((b) => [b.name, b]));
  const byPurokIndex = new Map();

  for (let i = 0; i < DEMO_BHWS.length; i++) {
    const def = DEMO_BHWS[i];
    const contactNumber = `09${String(190000000 + i).padStart(9, '0')}`;
    let row = byName.get(def.name);

    if (!row) {
      const payload = {
        name: def.name,
        position: 'Barangay Health Worker',
        contactNumber,
        email: def.email,
        status: 'Active',
        workerType: 'BHW',
        accountRole: 'BHW Worker',
        assignedPurokId: purokMap.get(PUROK_NAMES[i]),
        assignedFocusGroup: null,
        username: def.username,
        password: DEMO_BHW_PASSWORD,
      };
      try {
        row = await api('POST', '/bhws', payload);
      } catch (error) {
        if (/username|already|taken/i.test(String(error.message))) {
          payload.username = `bhw.demo${i + 1}`;
          row = await api('POST', '/bhws', payload);
        } else {
          throw error;
        }
      }
      byName.set(def.name, row);
      console.log(`  BHW created: ${def.name} (id ${row.id}, ${PUROK_NAMES[i]})`);
    } else {
      console.log(`  BHW exists: ${def.name} (id ${row.id})`);
    }

    byPurokIndex.set(i + 1, {
      id: row.id,
      name: row.name,
      contactNumber: row.contactNumber || contactNumber,
    });
  }
  return byPurokIndex;
};

const loadResidentIds = async (plans) => {
  const byName = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('residents')
      .select('resident_id, name')
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) byName.set(row.name, row.resident_id);
    if (!data || data.length < 1000) break;
  }
  for (const plan of plans) plan.residentId = byName.get(plan.name) ?? null;
  return byName;
};

const reportFailures = (label, failures) => {
  if (failures.length === 0) return;
  console.log(`  !! ${label}: ${failures.length} failed`);
  for (const f of failures.slice(0, 8)) {
    console.log(`     - ${f.label}: ${f.error?.message || f.error}`);
  }
  if (failures.length > 8) console.log(`     ... and ${failures.length - 8} more`);
};

const phaseResidents = async (plans, purokMap) => {
  const existing = await loadResidentIds(plans);
  const toCreate = plans.filter((p) => !p.residentId);
  console.log(`  residents: ${existing.size} already in DB, ${toCreate.length} to create`);

  const results = await pool(
    toCreate,
    CONCURRENCY,
    async (plan) => {
      const purokId = purokMap.get(PUROK_NAMES[plan.purokIndex - 1]);
      const row = await api('POST', '/residents', {
        name: plan.name,
        dateOfBirth: iso(plan.dob),
        age: plan.age,
        gender: plan.gender,
        civilStatus: plan.civilStatus,
        purokId,
        contactNumber: plan.contactNumber,
        contactPerson: plan.contactPerson,
        contactPersonNumber: plan.contactPersonNumber,
        contactPersonAddress: plan.contactPersonAddress,
        lastCheckup: plan.lastCheckup,
        focusGroups: plan.focusGroups,
        isPwd: plan.isPwd,
        motherName: plan.motherName,
        fatherName: plan.fatherName,
        disabilityType: plan.disabilityType,
        chronicConditions: plan.conditions,
        currentMedications: plan.medications,
        allergies: plan.allergies,
        vitalSigns: plan.vitals,
      });
      if (!row?.id) throw new Error('API returned no resident id');
      plan.residentId = row.id;
      return row.id;
    },
    progressLogger('residents')
  );

  const failures = results
    .map((r, i) => ({ r, plan: toCreate[i] }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: x.plan.name, error: x.r.error }));
  reportFailures('resident creation', failures);
  return failures;
};

const phaseHistories = async (plans) => {
  const existing = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('medical_histories')
      .select('resident_id, date, type')
      .range(from, from + 999);
    if (error) throw error;
    for (const h of data || []) existing.add(`${h.resident_id}|${h.date}|${h.type}`);
    if (!data || data.length < 1000) break;
  }

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    for (const entry of plan.histories) {
      const key = `${plan.residentId}|${entry.date}|${entry.type}`;
      if (!existing.has(key)) jobs.push({ plan, entry });
    }
  }
  console.log(`  histories: ${jobs.length} to create`);

  const results = await pool(
    jobs,
    CONCURRENCY,
    async ({ plan, entry }) => {
      const payload = {
        date: entry.date,
        type: entry.type,
        facility: entry.facility,
        diagnosis: entry.diagnosis,
        treatment: entry.treatment,
        notes: entry.notes,
        vitalSigns: entry.vitalSigns,
        administered_by: entry.administered_by,
        chronicConditions: entry.chronicConditions,
        currentMedications: entry.currentMedications,
        allergies: entry.allergies,
      };
      if (entry.prenatal) payload.prenatal = entry.prenatal;
      return api('POST', `/residents/${plan.residentId}/medical-history`, payload);
    },
    progressLogger('histories')
  );

  const failures = results
    .map((r, i) => ({ r, plan: jobs[i].plan, entry: jobs[i].entry }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: `${x.plan.name} ${x.entry.date} ${x.entry.type}`, error: x.r.error }));
  reportFailures('medical history creation', failures);
  return failures;
};

const phaseSchedules = async (plans, bhwMap) => {
  const existing = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('schedules')
      .select('resident_id, date, time, status')
      .eq('status', 'Missed')
      .range(from, from + 999);
    if (error) throw error;
    for (const s of data || []) existing.add(`${s.resident_id}|${s.date}|${s.time}`);
    if (!data || data.length < 1000) break;
  }

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    for (const missed of plan.missed) {
      const key = `${plan.residentId}|${missed.date}|${missed.time}`;
      if (!existing.has(key)) jobs.push({ plan, missed });
    }
  }
  console.log(`  missed schedules: ${jobs.length} to create`);

  const results = await pool(
    jobs,
    CONCURRENCY,
    async ({ plan, missed }) => {
      const bhw = bhwMap.get(plan.purokIndex);
      return api('POST', '/schedules', {
        scope: 'individual',
        date: missed.date,
        time: missed.time,
        type: missed.type,
        status: 'Missed',
        duration: 30,
        purpose: missed.purpose,
        notes: missed.notes,
        locationDetails: `Barangay Health Center - ${PUROK_NAMES[plan.purokIndex - 1]}`,
        contactPerson: plan.contactPerson,
        contactNumber: plan.contactPersonNumber,
        residentId: plan.residentId,
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
        assignedBhws: [{ bhwId: bhw.id, id: bhw.id, name: bhw.name, contactNumber: bhw.contactNumber }],
        healthcareProfessionals: [],
      });
    },
    progressLogger('missed schedules')
  );

  const failures = results
    .map((r, i) => ({ r, plan: jobs[i].plan, missed: jobs[i].missed }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: `${x.plan.name} ${x.missed.date} ${x.missed.time}`, error: x.r.error }));
  reportFailures('schedule creation', failures);
  return failures;
};

const phaseRisk = async (plans) => {
  const ids = plans.filter((p) => p.residentId).map((p) => p.residentId);
  const affected = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase
      .from('schedules')
      .select('resident_id')
      .in('resident_id', chunk)
      .eq('status', 'Missed');
    if (error) throw error;
    for (const row of data || []) affected.add(row.resident_id);
  }
  const affectedIds = [...affected];
  console.log(`  risk cache: ${affectedIds.length} residents have missed checkups`);

  const residents = [];
  const conditionsBy = new Map();
  const vitalsBy = new Map();
  const missedBy = new Map();

  for (let i = 0; i < affectedIds.length; i += 500) {
    const chunk = affectedIds.slice(i, i + 500);
    const [residentRes, conditionRes, vitalRes, missedRes] = await Promise.all([
      supabase.from('residents').select('resident_id, age, date_of_birth, risk_score, risk_level').in('resident_id', chunk),
      supabase.from('resident_chronic_conditions').select('resident_id, condition_name').in('resident_id', chunk),
      supabase.from('resident_vital_signs').select('*').in('resident_id', chunk),
      supabase.from('schedules').select('resident_id').in('resident_id', chunk).eq('status', 'Missed'),
    ]);
    if (residentRes.error) throw residentRes.error;
    if (conditionRes.error) throw conditionRes.error;
    if (vitalRes.error) throw vitalRes.error;
    if (missedRes.error) throw missedRes.error;

    for (const row of residentRes.data || []) residents.push(row);
    for (const c of conditionRes.data || []) {
      const key = String(c.resident_id);
      if (!conditionsBy.has(key)) conditionsBy.set(key, []);
      conditionsBy.get(key).push(c.condition_name);
    }
    for (const v of vitalRes.data || []) vitalsBy.set(String(v.resident_id), v);
    for (const s of missedRes.data || []) {
      const key = String(s.resident_id);
      missedBy.set(key, (missedBy.get(key) || 0) + 1);
    }
  }

  const updates = [];
  for (const r of residents) {
    const key = String(r.resident_id);
    const risk = calculateCompositeRiskScore({
      age: r.age,
      dateOfBirth: r.date_of_birth,
      conditions: conditionsBy.get(key) || [],
      vitals: vitalsBy.get(key) || null,
      missedCheckups: missedBy.get(key) || 0,
    });
    if ((r.risk_score ?? 0) !== risk.score || (r.risk_level || 'Low Risk') !== risk.classification) {
      updates.push({ id: r.resident_id, score: risk.score, level: risk.classification });
    }
  }

  console.log(`  risk cache: updating ${updates.length} rows`);
  const results = await pool(
    updates,
    15,
    async (u) => {
      const { error } = await supabase
        .from('residents')
        .update({ risk_score: u.score, risk_level: u.level })
        .eq('resident_id', u.id);
      if (error) throw error;
    },
    progressLogger('risk updates')
  );
  const failures = results
    .map((r, i) => ({ r, u: updates[i] }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: `resident ${x.u.id}`, error: x.r.error }));
  reportFailures('risk cache update', failures);
  return failures;
};

// ------------------------------------------------------- bulk insert path ---
// Writes the SAME row shapes the API writes. Used only for speed on the full
// 3,561-resident run; puroks and BHWs still go through the real API above.
const bulkInsertRows = async (table, rows, select = '*') => {
  const inserted = [];
  const errors = [];
  const size = 250;
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    const { data, error } = await supabase.from(table).insert(part).select(select);
    if (!error) {
      inserted.push(...(data || []));
      if (rows.length > size) console.log(`  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
      continue;
    }
    // One bad row must not sink the whole batch — retry row by row so we can
    // see exactly which record was rejected.
    console.log(`  ${table}: chunk failed (${error.message}); retrying row-by-row`);
    for (const row of part) {
      const res = await supabase.from(table).insert(row).select(select).single();
      if (res.error) errors.push({ row, error: res.error });
      else if (res.data) inserted.push(res.data);
    }
  }
  return { inserted, errors };
};

const bulkResidentRow = (plan, purokId) => {
  const risk = calculateCompositeRiskScore({
    age: plan.age,
    dateOfBirth: iso(plan.dob),
    conditions: plan.conditions,
    vitals: plan.vitals,
    missedCheckups: 0,
  });
  return {
    name: plan.name,
    age: plan.age,
    gender: plan.gender,
    date_of_birth: iso(plan.dob),
    civil_status: plan.civilStatus,
    purok_id: purokId ?? null,
    contact_number: plan.contactNumber,
    contact_person: plan.contactPerson,
    contact_person_number: plan.contactPersonNumber,
    contact_person_address: plan.contactPersonAddress,
    last_checkup: plan.lastCheckup,
    focus_groups: plan.focusGroups,
    is_pwd: plan.isPwd,
    vaccinations: [],
    mother_name: plan.motherName,
    father_name: plan.fatherName,
    disability_type: plan.disabilityType,
    risk_score: risk.score,
    risk_level: risk.classification,
  };
};

const bulkVitalRow = (residentId, vitals) => ({
  resident_id: residentId,
  blood_pressure: vitals.bloodPressure || null,
  heart_rate: vitals.heartRate ? Number(vitals.heartRate) : null,
  temperature: vitals.temperature ? Number(vitals.temperature) : null,
  weight: vitals.weight ? Number(vitals.weight) : null,
  height: vitals.height ? Number(vitals.height) : null,
  blood_sugar: vitals.bloodSugar ? Number(vitals.bloodSugar) : null,
  bmi: vitals.bmi ? Number(vitals.bmi) : null,
});

const bulkHistoryRow = (residentId, entry) => {
  const row = {
    resident_id: residentId,
    date: entry.date,
    type: entry.type,
    location: 'Barangay',
    facility: entry.facility,
    diagnosis: entry.diagnosis,
    treatment: entry.treatment,
    notes: entry.notes,
    administered_by: entry.administered_by,
    chronic_conditions: entry.chronicConditions,
    current_medications: entry.currentMedications,
    allergies: entry.allergies,
  };
  if (entry.prenatal) {
    const p = entry.prenatal;
    row.lmp = p.lmp || null;
    row.edd = p.edd || null;
    row.gravida = p.gravida ? Number(p.gravida) : null;
    row.para = p.para ? Number(p.para) : null;
    row.pregnancy_status = p.pregnancyStatus || null;
    row.gestational_age = p.gestationalAge || null;
    row.fundal_height = p.fundalHeight ? Number(p.fundalHeight) : null;
    row.fetal_heart_rate = p.fetalHeartRate ? Number(p.fetalHeartRate) : null;
    row.fetal_movement = p.fetalMovement || null;
    row.muac_cm = p.muac ? Number(p.muac) : null;
    row.muac_date = p.muacDate || null;
    row.td_status = p.tdStatus || null;
    row.anc_window = p.ancWindow || null;
    row.is_private_visit = false;
  }
  return row;
};

const phaseResidentsBulk = async (plans, purokMap) => {
  const existing = await loadResidentIds(plans);
  const toCreate = plans.filter((p) => !p.residentId);
  console.log(`  residents: ${existing.size} already in DB, ${toCreate.length} to insert (bulk)`);
  if (toCreate.length === 0) return [];

  const rows = toCreate.map((plan) => bulkResidentRow(plan, purokMap.get(PUROK_NAMES[plan.purokIndex - 1])));
  const { inserted, errors } = await bulkInsertRows('residents', rows, 'resident_id, name');
  const byName = new Map(inserted.map((r) => [r.name, r.resident_id]));
  for (const plan of toCreate) plan.residentId = byName.get(plan.name) ?? null;
  reportFailures('resident bulk insert', errors.map((e) => ({ label: e.row.name, error: e.error })));

  const created = toCreate.filter((p) => p.residentId);
  const vitals = created.map((p) => bulkVitalRow(p.residentId, p.vitals));
  const conditions = [];
  const meds = [];
  const allergies = [];
  for (const p of created) {
    for (const c of p.conditions) {
      conditions.push({ resident_id: p.residentId, condition_name: JSON.stringify(c) });
    }
    for (const m of p.medications) {
      meds.push({ resident_id: p.residentId, name: m.name, dosage: m.dosage, frequency: m.frequency });
    }
    for (const a of p.allergies.drugs) allergies.push({ resident_id: p.residentId, allergy_type: 'drug', allergen: a });
    for (const a of p.allergies.food) allergies.push({ resident_id: p.residentId, allergy_type: 'food', allergen: a });
    for (const a of p.allergies.environmental) allergies.push({ resident_id: p.residentId, allergy_type: 'environmental', allergen: a });
  }

  const childResults = await Promise.all([
    bulkInsertRows('resident_vital_signs', vitals, 'resident_id'),
    bulkInsertRows('resident_chronic_conditions', conditions, '*'),
    bulkInsertRows('resident_medications', meds, '*'),
    bulkInsertRows('resident_allergies', allergies, '*'),
  ]);
  for (const [idx, res] of childResults.entries()) {
    if (res.errors.length) {
      reportFailures(`resident detail insert ${idx}`, res.errors.map((e) => ({ label: JSON.stringify(e.row), error: e.error })));
    }
  }
  return [];
};

const phaseHistoriesBulk = async (plans) => {
  const existing = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('medical_histories')
      .select('resident_id, date, type')
      .range(from, from + 999);
    if (error) throw error;
    for (const h of data || []) existing.add(`${h.resident_id}|${h.date}|${h.type}`);
    if (!data || data.length < 1000) break;
  }

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    for (const entry of plan.histories) {
      if (!existing.has(`${plan.residentId}|${entry.date}|${entry.type}`)) jobs.push({ plan, entry });
    }
  }
  console.log(`  histories: ${jobs.length} to insert (bulk)`);
  if (jobs.length === 0) return [];

  const rows = jobs.map(({ plan, entry }) => bulkHistoryRow(plan.residentId, entry));
  const { inserted, errors } = await bulkInsertRows(
    'medical_histories',
    rows,
    'history_id, resident_id, date, type'
  );
  reportFailures('history bulk insert', errors.map((e) => ({ label: `${e.row.resident_id} ${e.row.date}`, error: e.error })));

  const jobByKey = new Map(jobs.map((j) => [`${j.plan.residentId}|${j.entry.date}|${j.entry.type}`, j]));
  const vitalRows = [];
  for (const h of inserted) {
    const job = jobByKey.get(`${h.resident_id}|${h.date}|${h.type}`);
    if (!job) continue;
    vitalRows.push({
      history_id: h.history_id,
      blood_pressure: job.entry.vitalSigns.bloodPressure || null,
      heart_rate: job.entry.vitalSigns.heartRate ? Number(job.entry.vitalSigns.heartRate) : null,
      temperature: job.entry.vitalSigns.temperature ? Number(job.entry.vitalSigns.temperature) : null,
      weight: job.entry.vitalSigns.weight ? Number(job.entry.vitalSigns.weight) : null,
      height: job.entry.vitalSigns.height ? Number(job.entry.vitalSigns.height) : null,
      blood_sugar: job.entry.vitalSigns.bloodSugar ? Number(job.entry.vitalSigns.bloodSugar) : null,
      bmi: job.entry.vitalSigns.bmi ? Number(job.entry.vitalSigns.bmi) : null,
    });
  }
  const vitalRes = await bulkInsertRows('medical_history_vitals', vitalRows, 'history_id');
  reportFailures('history vital bulk insert', vitalRes.errors.map((e) => ({ label: String(e.row.history_id), error: e.error })));
  return [];
};

const phaseSchedulesBulk = async (plans, bhwMap) => {
  const existing = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('schedules')
      .select('resident_id, date, time, status')
      .eq('status', 'Missed')
      .range(from, from + 999);
    if (error) throw error;
    for (const s of data || []) existing.add(`${s.resident_id}|${s.date}|${s.time}`);
    if (!data || data.length < 1000) break;
  }

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    for (const missed of plan.missed) {
      if (!existing.has(`${plan.residentId}|${missed.date}|${missed.time}`)) jobs.push({ plan, missed });
    }
  }
  console.log(`  missed schedules: ${jobs.length} to insert (bulk)`);
  if (jobs.length === 0) return [];

  const rows = jobs.map(({ plan, missed }) => {
    const bhw = bhwMap.get(plan.purokIndex);
    return {
      scope: 'individual',
      resident_id: plan.residentId,
      purok_id: null,
      is_barangay_wide: false,
      bhw_id: bhw.id,
      date: missed.date,
      time: missed.time,
      type: missed.type,
      status: 'Missed',
      notes: missed.notes,
      service_category: '',
      duration: 30,
      purpose: missed.purpose,
      location_details: `Barangay Health Center - ${PUROK_NAMES[plan.purokIndex - 1]}`,
      contact_person: plan.contactPerson,
      contact_number: plan.contactPersonNumber,
      program_name: '',
      program_description: '',
      target_group: '',
      target_count: null,
      venue: '',
      coordinator_name: '',
      coordinator_contact: '',
      partner_organization: '',
      max_participants: null,
    };
  });

  const { inserted, errors } = await bulkInsertRows(
    'schedules',
    rows,
    'schedule_id, resident_id, date, time'
  );
  reportFailures('schedule bulk insert', errors.map((e) => ({ label: `${e.row.resident_id} ${e.row.date}`, error: e.error })));

  const jobByKey = new Map(jobs.map((j) => [`${j.plan.residentId}|${j.missed.date}|${j.missed.time}`, j]));
  const links = [];
  for (const s of inserted) {
    const job = jobByKey.get(`${s.resident_id}|${s.date}|${s.time}`);
    if (!job) continue;
    const bhw = bhwMap.get(job.plan.purokIndex);
    links.push({ schedule_id: s.schedule_id, bhw_id: bhw.id, role: 'Lead BHW' });
  }
  const linkRes = await bulkInsertRows('schedule_bhws', links, '*');
  reportFailures('schedule BHW link bulk insert', linkRes.errors.map((e) => ({ label: String(e.row.schedule_id), error: e.error })));
  return [];
};

const distinctPaged = async (table, column, orderBy) => {
  const values = new Map();
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(column).range(from, from + 999);
    if (orderBy) query = query.order(orderBy);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) {
      const key = row[column];
      values.set(key, (values.get(key) || 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  return values;
};

const phaseVerify = async (plans) => {
  const tables = [
    'residents',
    'puroks',
    'bhws',
    'users',
    'resident_vital_signs',
    'resident_chronic_conditions',
    'medical_histories',
    'medical_history_vitals',
    'schedules',
  ];
  console.log('\nVerification (database counts):');
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table.padEnd(30)} ${error ? `ERR ${error.message}` : count}`);
  }

  const purokCounts = await distinctPaged('residents', 'purok_id', 'resident_id');
  const { data: purokRows } = await supabase.from('puroks').select('purok_id, name');
  const sortedPuroks = (purokRows || []).sort(
    (a, b) => Number(String(a.name).replace(/\D/g, '')) - Number(String(b.name).replace(/\D/g, ''))
  );
  console.log('  residents per purok:');
  for (const p of sortedPuroks) {
    console.log(`    ${p.name.padEnd(10)}: ${purokCounts.get(p.purok_id) || 0}`);
  }
  const residentNullPurok = await supabase
    .from('residents')
    .select('*', { count: 'exact', head: true })
    .is('purok_id', null);
  console.log(`  residents without purok: ${residentNullPurok.count ?? 'ERR'}`);

  const statuses = await distinctPaged('schedules', 'status', 'schedule_id');
  console.log(`  schedule statuses: ${JSON.stringify(Object.fromEntries(statuses))}`);

  const risk = await distinctPaged('residents', 'risk_level', 'resident_id');
  console.log(`  risk levels: ${JSON.stringify(Object.fromEntries(risk))}`);

  const focusRows = await distinctPaged('residents', 'focus_groups', 'resident_id');
  const focusCombos = new Set([...focusRows.keys()].map((k) => JSON.stringify(k)));
  console.log(`  focus-group arrays: ${focusCombos.size} distinct combinations`);

  const historiesWithVitals = await supabase
    .from('medical_history_vitals')
    .select('*', { count: 'exact', head: true });
  console.log(`  history vital rows: ${historiesWithVitals.count ?? 'ERR'}`);

  try {
    const stats = await api('GET', '/dashboard/stats');
    console.log(`  dashboard stats: ${JSON.stringify(stats)}`);
  } catch (error) {
    console.log(`  dashboard stats: ERR ${error.message}`);
  }

  try {
    const missed = await api('GET', '/dashboard/missed-consultations');
    const n = Array.isArray(missed) ? missed.length : missed?.total ?? missed?.length;
    console.log(`  missed-consultations endpoint rows: ${n}`);
  } catch (error) {
    console.log(`  missed-consultations: ERR ${error.message}`);
  }

  const sample = plans.find((p) => p.residentId && p.conditions.length > 0 && p.missed.length > 0)
    || plans.find((p) => p.residentId);
  if (sample) {
    try {
      const detail = await api('GET', `/residents/${sample.residentId}`);
      console.log('\nSample resident detail (API):');
      console.log(`  ${detail.name} | ${detail.age}y ${detail.gender} | ${detail.purok} | risk ${detail.riskLevel} (${detail.riskScore})`);
      console.log(`  conditions: ${JSON.stringify(detail.chronicConditions)}`);
      console.log(`  vitals: ${JSON.stringify(detail.vitalSigns)}`);
      console.log(`  histories: ${detail.medicalHistory?.length || 0}`);
      console.log(`  focus groups: ${JSON.stringify(detail.focusGroups)}`);
    } catch (error) {
      console.log(`  sample detail: ERR ${error.message}`);
    }
  }
};

// ================================================================== main ===
const main = async () => {
  const started = Date.now();
  console.log('==============================================================');
  console.log(' CitiCare demo seed — 3,561 residents, 12 puroks, 12 BHWs');
  console.log('==============================================================');
  console.log(`API:          ${API}`);
  console.log(`Residents:    ${LIMIT} (target ${TARGET_RESIDENTS})`);
  console.log(`Concurrency:  ${CONCURRENCY}`);
  console.log(`Mode:         ${MODE}${MODE === 'bulk' ? ' (direct bulk insert — same rows the API writes)' : ' (real API calls)'}`);
  console.log(`Phases:       ${[...PHASES].join(', ')}`);

  const plans = buildPlans(LIMIT);
  console.log(`Plans built:  ${plans.length}`);

  let purokMap = new Map();
  let bhwMap = new Map();

  if (PHASES.has('puroks') || PHASES.has('bhws') || PHASES.has('residents') || PHASES.has('schedules')) {
    console.log('\n[1/6] Puroks');
    purokMap = await ensurePuroks();
  }

  if (PHASES.has('bhws') || PHASES.has('residents') || PHASES.has('schedules')) {
    console.log('\n[2/6] Health workers');
    bhwMap = await ensureBhws(purokMap);
  }

  if (PHASES.has('residents')) {
    console.log(`\n[3/6] Residents${MODE === 'bulk' ? ' (bulk)' : ''}`);
    await (MODE === 'bulk' ? phaseResidentsBulk(plans, purokMap) : phaseResidents(plans, purokMap));
  }

  // Later phases need resident ids even when run on their own.
  if (!PHASES.has('residents') && (PHASES.has('histories') || PHASES.has('schedules') || PHASES.has('risk') || PHASES.has('verify'))) {
    const byName = await loadResidentIds(plans);
    console.log(`\nLoaded ${byName.size} existing residents for later phases.`);
  }

  if (PHASES.has('histories')) {
    console.log(`\n[4/6] Medical histories (vitals, conditions, medications)${MODE === 'bulk' ? ' (bulk)' : ''}`);
    await (MODE === 'bulk' ? phaseHistoriesBulk(plans) : phaseHistories(plans));
  }

  if (PHASES.has('schedules')) {
    console.log(`\n[5/6] Missed checkups${MODE === 'bulk' ? ' (bulk)' : ''}`);
    await (MODE === 'bulk' ? phaseSchedulesBulk(plans, bhwMap) : phaseSchedules(plans, bhwMap));
  }

  if (PHASES.has('risk')) {
    console.log('\n[6/6] Risk cache refresh');
    await phaseRisk(plans);
  }

  if (PHASES.has('verify')) {
    await phaseVerify(plans);
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\nDone in ${Math.floor(secs / 60)}m ${secs % 60}s.`);
  console.log('Re-run the same command any time — existing rows are skipped, not duplicated.');
};

main().catch((error) => {
  console.error('\nSEED FAILED:', error.stack || error.message || error);
  process.exit(1);
});
