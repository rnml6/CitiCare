// seed_3651_demo_data.mjs
// ---------------------------------------------------------------------------
// DEMO / SAMPLE DATA ONLY — this file does not modify any application code.
//
// It talks to the REAL backend API using the same payload shapes the
// frontend forms send:
//   Purok.jsx            -> POST /api/puroks
//   BHWForm.jsx          -> POST /api/bhws
//   Medicines.jsx        -> POST /api/medicines
//   ResidentForm.jsx     -> POST /api/residents
//   ResidentDetail.jsx   -> POST /api/residents/:id/medical-history
//                           POST /api/medicines/resident/:residentId
//   ScheduleForm.jsx     -> POST /api/schedules
//
// Creates:
//   * 1 administrator (bootstrap) + 12 BHWs + 1 BHW Head (all with accounts)
//   * 1 midwife + 1 nurse (healthcare professionals, no accounts)
//   * 12 puroks named Purok 1 ... Purok 12
//   * exactly 3,651 residents spread across the 12 puroks
//   * 20 medicines (vaccines used by the reports, deworming, vitamins)
//   * realistic medical histories (growth, prenatal, postpartum, senior, adult)
//   * vaccine / deworming / vitamin administration records
//   * sample individual, per-purok and barangay-wide schedules
//
// Resumable: existing rows are detected and never duplicated.
//
// Usage (backend must be running on port 5000):
//   node seed_3651_demo_data.mjs
//   node seed_3651_demo_data.mjs --limit=24 --concurrency=6
//   node seed_3651_demo_data.mjs --phase=residents,histories
// ---------------------------------------------------------------------------

import dotenv from 'dotenv';
dotenv.config();
import { supabase } from './src/config/supabase.js';

// ---------------------------------------------------------------- config ---
const API = process.env.SEED_API_URL || 'http://localhost:5000/api';
const TARGET_RESIDENTS = 3651;
const PUROK_NAMES = Array.from({ length: 12 }, (_, i) => `Purok ${i + 1}`);
const DEMO_PASSWORD = 'DemoBhw2026!';
const ADMIN_EMAIL = 'admin@citicare.demo';
const ADMIN_PASSWORD = 'AdminDemo2026!';
const ADMIN_NAME = 'Barangay Administrator';

const argv = process.argv.slice(2);
const arg = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const LIMIT = Math.max(0, Math.min(TARGET_RESIDENTS, Number(arg('limit') || TARGET_RESIDENTS)));
const CONCURRENCY = Math.max(1, Number(arg('concurrency') || 8));
const PHASES = new Set(
  String(arg('phase') || 'admin,puroks,bhws,medicines,residents,histories,medicine-records,schedules,verify')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// --------------------------------------------------------------- helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const computeAge = (dob) => {
  let years = TODAY.getFullYear() - dob.getFullYear();
  const m = TODAY.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && TODAY.getDate() < dob.getDate())) years--;
  return Math.max(0, years);
};
const monthsOld = (dob) => {
  let months = (TODAY.getFullYear() - dob.getFullYear()) * 12 + (TODAY.getMonth() - dob.getMonth());
  if (TODAY.getDate() < dob.getDate()) months--;
  return Math.max(0, months);
};

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
  'Maria', 'Josefa', 'Lorna', 'Angelica', 'Rosa', 'Teresita', 'Katrina', 'Jennylyn',
  'Ana', 'Cristina', 'Michelle', 'Grace', 'Jasmine', 'Aileen', 'Rowena', 'Marilou',
  'Editha', 'Nelia', 'Corazon', 'Liza', 'Mylene', 'Rachel', 'Sarah', 'Joan', 'Karen',
  'Patricia', 'Divina', 'Evelyn', 'Maricel', 'Arlene', 'Bernadette', 'Catherine',
  'Diana', 'Elaine', 'Fiona', 'Glenda', 'Hazel', 'Irene', 'Jocelyn', 'Kristine',
  'Lorena', 'Melanie', 'Nora', 'Olivia', 'Perla', 'Queenie', 'Rosalie', 'Sonia'
];
const MALE_FIRST = [
  'Jose', 'Juan', 'Pedro', 'Ramon', 'Carlos', 'Antonio', 'Ricardo', 'Eduardo',
  'Fernando', 'Roberto', 'Alfredo', 'Benigno', 'Cesar', 'Danilo', 'Ernesto',
  'Federico', 'Gabriel', 'Hector', 'Ignacio', 'Joaquin', 'Kevin', 'Leonardo',
  'Mario', 'Nestor', 'Oscar', 'Paolo', 'Quirino', 'Rodrigo', 'Salvador', 'Teodoro',
  'Umberto', 'Victor', 'Wilfredo', 'Xavier', 'Yusuf', 'Zacarias', 'Andres',
  'Benedict', 'Claudio', 'Dominic', 'Emilio', 'Francis', 'Gregorio', 'Henry',
  'Ismael', 'Jerome', 'Lorenzo', 'Marco'
];
const OTHER_FIRST = ['Alexis', 'Ariel', 'Cielo', 'Dominique', 'Jade', 'Kim', 'Riley', 'Sam'];
const MIDDLE_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres',
  'Flores', 'Ramos', 'Gonzales', 'Villanueva', 'Aquino', 'Castillo', 'Navarro',
  'Salazar', 'Domingo', 'Rivera', 'Mercado', 'Pascual', 'Delos Santos', 'Buenaventura',
  'Magbanua', 'Panganiban'
];
const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza',
  'Torres', 'Flores', 'Ramos', 'Gonzales', 'Villanueva', 'Aquino', 'Castillo',
  'Navarro', 'Salazar', 'Domingo', 'Rivera', 'Mercado', 'Pascual', 'Rosales',
  'Magbanua', 'Panganiban', 'Ylagan', 'Bacani', 'Manalo', 'Vera', 'Ubaldo', 'Lim',
  'Padilla', 'Cortez', 'Alvarez', 'Bermudez', 'Cabrera', 'Diaz', 'Estrada', 'Fuentes',
  'Gutierrez', 'Hernandez', 'Ibarra', 'Jimenez', 'Lopez', 'Morales', 'Nunez', 'Ortega',
  'Perez', 'Quizon', 'Rodriguez', 'Sanchez', 'Tolentino', 'Valdez', 'Zamora', 'Abad',
  'Bello', 'Canlas', 'Dizon', 'Enriquez', 'Fajardo', 'Gomez'
];
const DISABILITIES = [
  'Visual impairment (low vision)', 'Hearing impairment', 'Physical disability (walking difficulty)',
  'Physical disability (upper limb)', 'Intellectual disability', 'Speech impairment',
  'Psychosocial disability', 'Chronic illness-related disability'
];

// ------------------------------------------------------- worker accounts ---
const DEMO_BHWS = [
  { name: 'Aurora Salazar', username: 'bhw.aurora', email: 'aurora.salazar@citicare.demo', focus: 'pregnant' },
  { name: 'Bernardo Lim', username: 'bhw.bernardo', email: 'bernardo.lim@citicare.demo', focus: 'senior' },
  { name: 'Cecilia Padilla', username: 'bhw.cecilia', email: 'cecilia.padilla@citicare.demo', focus: 'infant' },
  { name: 'Dominic Cortez', username: 'bhw.dominic', email: 'dominic.cortez@citicare.demo', focus: null },
  { name: 'Estrella Magbanua', username: 'bhw.estrella', email: 'estrella.magbanua@citicare.demo', focus: null },
  { name: 'Felipe Rosales', username: 'bhw.felipe', email: 'felipe.rosales@citicare.demo', focus: null },
  { name: 'Gloria Panganiban', username: 'bhw.gloria', email: 'gloria.panganiban@citicare.demo', focus: null },
  { name: 'Hector Ylagan', username: 'bhw.hector', email: 'hector.ylagan@citicare.demo', focus: null },
  { name: 'Imelda Bacani', username: 'bhw.imelda', email: 'imelda.bacani@citicare.demo', focus: null },
  { name: 'Joaquin Manalo', username: 'bhw.joaquin', email: 'joaquin.manalo@citicare.demo', focus: null },
  { name: 'Kristina Vera', username: 'bhw.kristina', email: 'kristina.vera@citicare.demo', focus: null },
  { name: 'Leonardo Ubaldo', username: 'bhw.leonardo', email: 'leonardo.ubaldo@citicare.demo', focus: null }
];
const HEAD_WORKER = {
  name: 'Lorna Dela Cruz', username: 'bhw.head', email: 'lorna.delacruz@citicare.demo'
};
const MIDWIFE = {
  name: 'Angelica Reyes, RM', email: 'angelica.reyes@rhu.naga.ph', contactNumber: '09174567890'
};
const NURSE = {
  name: 'Miguel Antonio Santos, RN', email: 'miguel.santos@rhu.naga.ph', contactNumber: '09175678901'
};
const MIDWIFE_NAME = MIDWIFE.name;

// ----------------------------------------------------------- age buckets ---
const BUCKET_DEFS = [
  { key: '0-4', count: 295, min: 0, max: 4, infant: true },
  { key: '5-14', count: 655, min: 5, max: 14 },
  { key: '15-19', count: 330, min: 15, max: 19 },
  { key: '20-39', count: 1020, min: 20, max: 39 },
  { key: '40-59', count: 800, min: 40, max: 59 },
  { key: '60+', count: 551, min: 60, max: 92 }
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
  '60+': ['Hypertension', 'Type 2 Diabetes', 'Arthritis', 'Heart Disease', 'COPD', 'Cataract', 'Chronic Kidney Disease', 'Asthma']
};
const CONDITION_PREVALENCE = {
  '0-4': 0.04, '5-14': 0.09, '15-19': 0.07, '20-39': 0.14, '40-59': 0.4, '60+': 0.7
};
const SEVERITY_WEIGHTS = {
  Hypertension: [0.25, 0.45, 0.3], 'Type 2 Diabetes': [0.25, 0.5, 0.25],
  Asthma: [0.55, 0.35, 0.1], Arthritis: [0.4, 0.45, 0.15],
  'Heart Disease': [0.2, 0.45, 0.35], COPD: [0.25, 0.45, 0.3],
  Cataract: [0.5, 0.4, 0.1], 'Chronic Kidney Disease': [0.3, 0.45, 0.25],
  Migraine: [0.6, 0.35, 0.05], Anemia: [0.7, 0.3, 0], 'Thyroid Disorder': [0.5, 0.4, 0.1]
};
const severityFor = (condition, rng) => {
  const [mild, moderate] = SEVERITY_WEIGHTS[condition] || [0.5, 0.35, 0.15];
  const roll = rng();
  if (roll < mild) return 'Mild';
  if (roll < mild + moderate) return 'Moderate';
  return 'Severe';
};

// --------------------------------------------------------- medicine list ---
// Names are chosen so the dashboard report aliases map correctly:
//   BCG / Hepatitis B / Pentavalent / OPV / IPV / PCV / MCV for infants,
//   Influenza + Pneumococcal for seniors.
const MEDICINES = [
  {
    medicine_name: 'BCG Vaccine', category: 'vaccine', total_doses: 1, target_group: 'infant',
    description: 'Live attenuated vaccine against tuberculosis, given intradermally at birth.',
    dose_intervals: [{ dose: 1, description: 'Single dose at birth (0.05 mL intradermal, right deltoid)' }]
  },
  {
    medicine_name: 'Hepatitis B Vaccine', category: 'vaccine', total_doses: 1, target_group: 'infant',
    description: 'Protects against hepatitis B infection; first dose within 24 hours of birth.',
    dose_intervals: [{ dose: 1, description: 'Single dose within 24 hours of birth (0.5 mL IM)' }]
  },
  {
    medicine_name: 'Pentavalent Vaccine (DPT-Hib)', category: 'vaccine', total_doses: 3, target_group: 'infant',
    description: 'Protects against diphtheria, pertussis, tetanus, hepatitis B and Haemophilus influenzae type b.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 6 weeks old (0.5 mL IM, left thigh)' },
      { dose: 2, description: 'Dose 2 at 10 weeks old (0.5 mL IM, left thigh)' },
      { dose: 3, description: 'Dose 3 at 14 weeks old (0.5 mL IM, left thigh)' }
    ]
  },
  {
    medicine_name: 'Oral Polio Vaccine (OPV)', category: 'vaccine', total_doses: 3, target_group: 'infant',
    description: 'Trivalent oral polio vaccine given at birth and during the routine infant schedule.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at birth (2 drops orally)' },
      { dose: 2, description: 'Dose 2 at 6 weeks old (2 drops orally)' },
      { dose: 3, description: 'Dose 3 at 10 weeks old (2 drops orally)' }
    ]
  },
  {
    medicine_name: 'Inactivated Polio Vaccine (IPV)', category: 'vaccine', total_doses: 2, target_group: 'infant',
    description: 'Injectable polio vaccine given alongside OPV for additional protection.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 14 weeks old (0.5 mL IM)' },
      { dose: 2, description: 'Dose 2 at 9 months old (0.5 mL IM)' }
    ]
  },
  {
    medicine_name: 'Pneumococcal Conjugate Vaccine (PCV13)', category: 'vaccine', total_doses: 3, target_group: 'infant',
    description: 'Protects infants against pneumococcal pneumonia, meningitis and sepsis.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 6 weeks old (0.5 mL IM)' },
      { dose: 2, description: 'Dose 2 at 10 weeks old (0.5 mL IM)' },
      { dose: 3, description: 'Dose 3 at 14 weeks old (0.5 mL IM)' }
    ]
  },
  {
    medicine_name: 'Measles-Containing Vaccine (MCV)', category: 'vaccine', total_doses: 2, target_group: 'infant',
    description: 'Measles-mumps-rubella vaccine given at 9 and 12 months of age.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 9 months old (0.5 mL subcutaneous)' },
      { dose: 2, description: 'Dose 2 at 12 months old (0.5 mL subcutaneous)' }
    ]
  },
  {
    medicine_name: 'Rotavirus Vaccine', category: 'vaccine', total_doses: 2, target_group: 'infant',
    description: 'Oral vaccine protecting infants against severe rotavirus gastroenteritis.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 at 6 weeks old (1.5 mL orally)' },
      { dose: 2, description: 'Dose 2 at 10 weeks old (1.5 mL orally)' }
    ]
  },
  {
    medicine_name: 'Influenza Vaccine (Quadrivalent)', category: 'vaccine', total_doses: 1, target_group: 'senior',
    description: 'Annual seasonal influenza immunization for senior citizens.',
    dose_intervals: [{ dose: 1, description: 'Single annual dose (0.5 mL IM, left deltoid)' }]
  },
  {
    medicine_name: 'Pneumococcal Polysaccharide Vaccine (PPSV23)', category: 'vaccine', total_doses: 1, target_group: 'senior',
    description: 'Protects older adults against invasive pneumococcal disease.',
    dose_intervals: [{ dose: 1, description: 'Single dose (0.5 mL IM)' }]
  },
  {
    medicine_name: 'Tetanus-Diphtheria (Td) Vaccine', category: 'vaccine', total_doses: 5, target_group: 'pregnant',
    description: 'Tetanus and diphtheria toxoid immunization for pregnant women and women of childbearing age.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 during pregnancy' },
      { dose: 2, description: 'Dose 2 at least 4 weeks after dose 1' },
      { dose: 3, description: 'Dose 3 at least 6 months after dose 2' },
      { dose: 4, description: 'Booster 1 year after dose 3' },
      { dose: 5, description: 'Booster every 10 years' }
    ]
  },
  {
    medicine_name: 'Human Papillomavirus (HPV) Vaccine', category: 'vaccine', total_doses: 2, target_group: 'all',
    description: 'Protects against HPV strains linked to cervical cancer; offered to adolescent girls.',
    dose_intervals: [
      { dose: 1, description: 'Dose 1 (0.5 mL IM)' },
      { dose: 2, description: 'Dose 2 six months after dose 1 (0.5 mL IM)' }
    ]
  },
  {
    medicine_name: 'Albendazole 400mg Chewable Tablet', category: 'deworming', total_doses: 1, target_group: 'all',
    description: 'Broad-spectrum deworming tablet used in the barangay mass drug administration.',
    dose_intervals: [{ dose: 1, description: 'Single 400mg chewable tablet after a meal' }]
  },
  {
    medicine_name: 'Mebendazole 500mg Chewable Tablet', category: 'deworming', total_doses: 1, target_group: 'all',
    description: 'Alternative deworming treatment for soil-transmitted helminths.',
    dose_intervals: [{ dose: 1, description: 'Single 500mg chewable tablet' }]
  },
  {
    medicine_name: 'Vitamin A Capsule (100,000 IU)', category: 'vitamins', total_doses: 1, target_group: 'infant',
    description: 'High-dose vitamin A supplementation for infants 6-59 months old.',
    dose_intervals: [{ dose: 1, description: '100,000 IU blue capsule for infants 6-11 months' }]
  },
  {
    medicine_name: 'Ferrous Sulfate + Folic Acid', category: 'vitamins', total_doses: 3, target_group: 'pregnant',
    description: 'Daily iron and folate supplement to prevent maternal anemia.',
    dose_intervals: [
      { dose: 1, description: '1st trimester: 1 tablet daily with meals' },
      { dose: 2, description: '2nd trimester: 1 tablet daily with meals' },
      { dose: 3, description: '3rd trimester: 1 tablet daily with meals' }
    ]
  },
  {
    medicine_name: 'Calcium Carbonate + Vitamin D', category: 'vitamins', total_doses: 1, target_group: 'pregnant',
    description: 'Calcium and vitamin D supplementation during pregnancy.',
    dose_intervals: [{ dose: 1, description: '1 tablet daily with meals' }]
  },
  {
    medicine_name: 'Multivitamins + Minerals', category: 'vitamins', total_doses: 1, target_group: 'senior',
    description: 'Daily multivitamin and mineral supplement for older adults.',
    dose_intervals: [{ dose: 1, description: '1 capsule daily after breakfast' }]
  },
  {
    medicine_name: 'Ascorbic Acid (Vitamin C) 500mg', category: 'vitamins', total_doses: 1, target_group: 'all',
    description: 'Vitamin C supplement for general health and immunity.',
    dose_intervals: [{ dose: 1, description: '1 tablet daily' }]
  },
  {
    medicine_name: 'Vitamin B Complex', category: 'vitamins', total_doses: 1, target_group: 'all',
    description: 'B-complex vitamin supplement supporting energy metabolism and nerve health.',
    dose_intervals: [{ dose: 1, description: '1 tablet daily' }]
  }
];

// ============================================================ plan builder ===
const usedNames = new Set();
const uniqueName = (first, rng) => {
  const middle = pick(rng, MIDDLE_NAMES);
  const last = pick(rng, LAST_NAMES);
  let name = `${first} ${middle} ${last}`;
  if (!usedNames.has(name)) { usedNames.add(name); return name; }
  const start = MIDDLE_NAMES.indexOf(middle);
  for (let k = 1; k < MIDDLE_NAMES.length; k++) {
    const candidate = `${first} ${MIDDLE_NAMES[(start + k) % MIDDLE_NAMES.length]} ${last}`;
    if (!usedNames.has(candidate)) { usedNames.add(candidate); return candidate; }
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
    const targetBmi = roll < 0.4 ? 19 + rng() * 3
      : roll < 0.72 ? 22 + rng() * 3
        : roll < 0.92 ? 25 + rng() * 4.5
          : 29.5 + rng() * 5;
    weight = targetBmi * ((height / 100) ** 2);
  }

  let bp = null;
  if (age >= 5) {
    let sys;
    let dia;
    if (htn) {
      if (htn.severity === 'Severe') { sys = rint(rng, 165, 190); dia = rint(rng, 100, 115); }
      else if (htn.severity === 'Moderate') { sys = rint(rng, 145, 165); dia = rint(rng, 92, 102); }
      else { sys = rint(rng, 135, 148); dia = rint(rng, 86, 94); }
    } else if (age >= 60) {
      sys = rint(rng, 118, 145); dia = rint(rng, 72, 90);
    } else {
      sys = rint(rng, 100, 130); dia = rint(rng, 65, 85);
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

  const temperature = chance(rng, 0.02) ? round1(37.6 + rng() * 0.8) : round1(36.2 + rng() * 1.0);

  let bloodSugar = null;
  if (age >= 15) {
    if (dm) {
      bloodSugar = dm.severity === 'Severe' ? rint(rng, 160, 240)
        : dm.severity === 'Moderate' ? rint(rng, 130, 175) : rint(rng, 110, 135);
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
    bmi: bmi == null ? null : bmi.toFixed(1)
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
    if (c.name === 'Hypertension' && chance(rng, 0.85)) meds.push({ name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily' });
    if (c.name === 'Type 2 Diabetes' && chance(rng, 0.85)) meds.push({ name: 'Metformin 500mg', dosage: '500mg', frequency: 'Twice daily' });
    if (c.name === 'Arthritis' && chance(rng, 0.5)) meds.push({ name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'As needed for pain' });
    if (c.name === 'Asthma' && chance(rng, 0.6)) meds.push({ name: 'Salbutamol Inhaler', dosage: '100 mcg', frequency: 'As needed' });
    if (c.name === 'Heart Disease' && chance(rng, 0.7)) meds.push({ name: 'Aspirin 80mg', dosage: '80mg', frequency: 'Once daily' });
    if (c.name === 'COPD' && chance(rng, 0.6)) meds.push({ name: 'Tiotropium Inhaler', dosage: '18 mcg', frequency: 'Once daily' });
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

// ------------------------------------------------------- history content ---
const diagnosisFor = (plan, type, gaWeeks) => {
  if (type === 'Prenatal Checkup') {
    return gaWeeks >= 28
      ? `Pregnancy at ${gaWeeks} weeks, cephalic presentation. Advised birth planning and danger-sign counselling.`
      : `Healthy pregnancy at ${gaWeeks} weeks. Continue prenatal vitamins and regular ANC visits.`;
  }
  if (type === 'Postpartum Checkup') {
    return 'Postpartum period, uncomplicated. Mother and newborn assessed and counselled.';
  }
  if (type === 'Growth Monitoring') {
    const c = plan.conditions[0];
    return c ? `${c.name}, ${c.severity.toLowerCase()}. Growth and development monitored.`
      : 'Normal growth and development for age. Continue breastfeeding and complementary feeding.';
  }
  const c = plan.conditions[0];
  if (c) {
    switch (c.name) {
      case 'Hypertension': return `Hypertension, ${c.severity.toLowerCase() === 'severe' ? 'uncontrolled' : 'stable'}. Continue maintenance medication and low-salt diet.`;
      case 'Type 2 Diabetes': return `Type 2 Diabetes Mellitus, ${c.severity.toLowerCase()}. Advised diet, exercise and medication adherence.`;
      case 'Asthma': return `Bronchial asthma, ${c.severity.toLowerCase()}. Inhaler technique reviewed.`;
      case 'Arthritis': return `Osteoarthritis, ${c.severity.toLowerCase()}. Advised joint protection and regular exercise.`;
      case 'Heart Disease': return 'Coronary artery disease, stable. Referred for cardiology follow-up.';
      case 'COPD': return 'COPD, stable. Advised smoking cessation and breathing exercises.';
      case 'Cataract': return 'Cataract suspect, right eye. Referred to the eye clinic.';
      case 'Chronic Kidney Disease': return 'Chronic kidney disease, stable. Advised low-salt, low-protein diet.';
      case 'Migraine': return 'Migraine, episodic. Advised trigger avoidance and adequate rest.';
      case 'Anemia': return 'Mild anemia. Advised iron-rich diet and iron supplementation.';
      case 'Thyroid Disorder': return 'Thyroid disorder, stable on medication.';
      default: return `${c.name}, ${c.severity.toLowerCase()}.`;
    }
  }
  return type === 'Senior Checkup'
    ? 'Fit for age. Continue daily walking and a low-salt diet.'
    : 'Generally healthy. Advised balanced diet and regular exercise.';
};

const symptomsFor = (plan, type, rng) => {
  if (type === 'Prenatal Checkup') return pick(rng, ['None', 'Mild back pain', 'Leg cramps at night', 'Morning nausea', 'Occasional headache']);
  if (type === 'Postpartum Checkup') return pick(rng, ['None', 'Mild afterpains', 'Slight fatigue', 'Breast engorgement']);
  if (type === 'Growth Monitoring') return pick(rng, ['None', 'Mild cough', 'Decreased appetite', 'Loose stools (1 day)']);
  if (plan.age < 5) return pick(rng, ['None', 'Fever (2 days)', 'Mild cough', 'Decreased appetite']);
  if (plan.age >= 60) return pick(rng, ['None', 'Knee pain', 'Blurry vision', 'Morning headache', 'Dizziness on standing', 'Chest heaviness on exertion']);
  return pick(rng, ['None', 'Mild headache', 'Cough and colds (3 days)', 'Body weakness', 'Occasional dizziness', 'Joint pains']);
};

const notesFor = (plan, type, symptoms, diagnosis, vitals, prenatal, postpartum, rng, date) => {
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
  } else if (type === 'Postpartum Checkup') {
    lines.push('Reason for checkup: Postpartum checkup');
    lines.push(`Birth date: ${postpartum.birthDate}`);
    lines.push(`Birth outcome: Live birth`);
    lines.push(`Delivery place: ${postpartum.deliveryPlace}`);
    lines.push(`Birth attendant: ${postpartum.birthAttendant}`);
    lines.push(`Mode of delivery: ${postpartum.deliveryMode}`);
    lines.push(`Baby's name: ${postpartum.babyName}`);
    lines.push(`Baby's gender: ${postpartum.babyGender}`);
    lines.push(`Check-up date: ${postpartum.checkupDate}`);
    lines.push(`Mother's BP: ${postpartum.motherBP}`);
    lines.push(`Mother's temperature: ${postpartum.motherTemp}`);
    lines.push(`Lochia: ${postpartum.lochia}`);
    lines.push(`Wound condition: ${postpartum.woundCondition}`);
    lines.push(`Breastfeeding status: ${postpartum.breastfeedingStatus}`);
    lines.push(`Baby's weight: ${postpartum.babyWeight} kg`);
    lines.push(`Baby's temperature: ${postpartum.babyTemp}`);
    lines.push(`Baby's feeding status: ${postpartum.babyFeedingStatus}`);
    lines.push(`Jaundice: ${postpartum.jaundice}`);
    lines.push(`Cord condition: ${postpartum.cordCondition}`);
    lines.push(`Newborn danger signs: ${postpartum.newbornDangerSigns}`);
  } else if (type === 'Growth Monitoring') {
    const months = Math.max(0, Math.floor((new Date(date) - plan.dob) / (30.44 * 86400000)));
    lines.push(`Weight: ${vitals.weight} kg`);
    lines.push(`Length / Height: ${vitals.height} cm`);
    lines.push(`Head circumference: ${rint(rng, 38, 50)} cm`);
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

const prenatalPayload = (lmp, date, weeks, gravida, para, rng) => {
  const edd = addDays(lmp, 280);
  const ancWindow = weeks <= 12 ? 'w1_12' : weeks <= 20 ? 'w13_20' : weeks <= 26 ? 'w21_26'
    : weeks <= 30 ? 'w27_30' : weeks <= 34 ? 'w31_34' : weeks <= 36 ? 'w35_36'
      : weeks <= 38 ? 'w37_38' : 'w39_40';
  return {
    lmp: iso(lmp),
    edd: iso(edd),
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
    ancWindow,
    isPrivateVisit: false
  };
};

const buildHistories = (plan, rng) => {
  const latest = plan.lastCheckupDate;
  const entries = [];

  if (plan.age < 5) {
    const birth = plan.dob;
    const earlier = addDays(latest, -rint(rng, 70, 120));
    const safeEarlier = earlier < addDays(birth, 7) ? null : earlier;
    if (safeEarlier) {
      entries.push({
        date: iso(safeEarlier), type: 'Growth Monitoring', facility: 'Barangay Health Center',
        diagnosis: diagnosisFor(plan, 'Growth Monitoring'),
        treatment: 'Continue age-appropriate feeding and growth monitoring.',
        notes: '', vitalSigns: jitterVitals(plan.vitals, rng)
      });
    }
    entries.push({
      date: iso(latest), type: 'Growth Monitoring', facility: 'Barangay Health Center',
      diagnosis: diagnosisFor(plan, 'Growth Monitoring'),
      treatment: 'Continue age-appropriate feeding and growth monitoring.',
      notes: '', vitalSigns: plan.vitals
    });
  } else if (plan.isPregnant) {
    const ga = rint(rng, 18, 36);
    const lmp = addDays(latest, -ga * 7);
    const gravida = rint(rng, 1, 4);
    const para = rint(rng, 0, Math.max(0, gravida - 1));
    const prevGa = Math.max(9, ga - rint(rng, 4, 8));
    const prevDate = addDays(latest, -(ga - prevGa) * 7);
    if (prevDate >= plan.dob) {
      const prenatal = prenatalPayload(lmp, prevDate, prevGa, gravida, para, rng);
      entries.push({
        date: iso(prevDate), type: 'Prenatal Checkup', facility: 'Barangay Health Center',
        diagnosis: diagnosisFor(plan, 'Prenatal Checkup', prevGa),
        treatment: 'Prenatal vitamins, iron and folic acid. Return in 4 weeks.',
        notes: notesFor(plan, 'Prenatal Checkup', symptomsFor(plan, 'Prenatal Checkup', rng), '', jitterVitals(plan.vitals, rng), prenatal, null, rng, prevDate),
        vitalSigns: jitterVitals(plan.vitals, rng), prenatal
      });
    }
    const prenatal = prenatalPayload(lmp, latest, ga, gravida, para, rng);
    entries.push({
      date: iso(latest), type: 'Prenatal Checkup', facility: 'Barangay Health Center',
      diagnosis: diagnosisFor(plan, 'Prenatal Checkup', ga),
      treatment: 'Prenatal vitamins, iron and folic acid. Advised facility-based delivery.',
      notes: notesFor(plan, 'Prenatal Checkup', symptomsFor(plan, 'Prenatal Checkup', rng), '', plan.vitals, prenatal, null, rng, latest),
      vitalSigns: plan.vitals, prenatal
    });
  } else if (plan.isPostpartum) {
    const birth = addDays(latest, -rint(rng, 18, 40));
    const babyGender = pick(rng, ['Male', 'Female']);
    const postpartum = {
      birthDate: iso(birth),
      birthOutcome: 'live',
      postnatal24h: iso(addDays(birth, 1)),
      postnatalDay3: iso(addDays(birth, 3)),
      postnatalDay714: iso(addDays(birth, 10)),
      postnatalWeek6: iso(addDays(birth, 30)),
      deliveryPlace: pick(rng, ['Barangay Health Center', 'Naga City Hospital', 'Bicol Medical Center']),
      birthAttendant: 'Midwife',
      birthAttendantName: MIDWIFE_NAME,
      deliveryMode: pick(rng, ['Vaginal/Normal', 'Vaginal/Normal', 'Cesarean Section']),
      babyName: `${pick(rng, babyGender === 'Male' ? MALE_FIRST : FEMALE_FIRST)} ${plan.name.split(' ').slice(-1)[0]}`,
      babyGender,
      checkupDate: iso(latest),
      motherBP: plan.vitals.bloodPressure,
      motherTemp: Number(plan.vitals.temperature),
      lochia: 'Normal',
      woundCondition: 'Normal',
      breastfeedingStatus: 'Good',
      babyWeight: (2.6 + rng() * 1.3).toFixed(1),
      babyTemp: (36.5 + rng() * 0.5).toFixed(1),
      babyFeedingStatus: 'Feeding Well',
      jaundice: 'Absent',
      cordCondition: 'Healed',
      newbornDangerSigns: 'None',
      spouseName: `${pick(rng, MALE_FIRST)} ${plan.name.split(' ').slice(-1)[0]}`
    };
    entries.push({
      date: iso(latest), type: 'Postpartum Checkup', facility: 'Barangay Health Center',
      diagnosis: diagnosisFor(plan, 'Postpartum Checkup'),
      treatment: 'Postpartum assessment, breastfeeding support and family planning counselling.',
      notes: notesFor(plan, 'Postpartum Checkup', symptomsFor(plan, 'Postpartum Checkup', rng), '', plan.vitals, null, postpartum, rng, latest),
      vitalSigns: plan.vitals, postpartum
    });
  } else if (plan.age >= 60) {
    const earlier = addDays(latest, -rint(rng, 150, 260));
    if (earlier >= plan.dob) {
      entries.push({
        date: iso(earlier), type: 'Senior Checkup', facility: 'Barangay Health Center',
        diagnosis: diagnosisFor(plan, 'Senior Checkup'),
        treatment: 'Maintenance medications reviewed. Advised senior wellness activities.',
        notes: notesFor(plan, 'Senior Checkup', symptomsFor(plan, 'Senior Checkup', rng), '', jitterVitals(plan.vitals, rng), null, null, rng, earlier),
        vitalSigns: jitterVitals(plan.vitals, rng)
      });
    }
    entries.push({
      date: iso(latest), type: 'Senior Checkup', facility: 'Barangay Health Center',
      diagnosis: diagnosisFor(plan, 'Senior Checkup'),
      treatment: 'Maintenance medications reviewed. Advised senior wellness activities.',
      notes: notesFor(plan, 'Senior Checkup', symptomsFor(plan, 'Senior Checkup', rng), diagnosisFor(plan, 'Senior Checkup'), plan.vitals, null, null, rng, latest),
      vitalSigns: plan.vitals
    });
  } else {
    entries.push({
      date: iso(latest), type: 'Checkup', facility: 'Barangay Health Center',
      diagnosis: diagnosisFor(plan, 'Checkup'),
      treatment: plan.conditions.length ? 'Continue maintenance medication. Return if symptoms worsen.' : 'Health teaching and routine follow-up.',
      notes: notesFor(plan, 'Checkup', symptomsFor(plan, 'Checkup', rng), diagnosisFor(plan, 'Checkup'), plan.vitals, null, null, rng, latest),
      vitalSigns: plan.vitals
    });
  }

  for (const entry of entries) {
    if (!entry.notes) {
      const vitals = entry.vitalSigns;
      entry.notes = notesFor(plan, entry.type, symptomsFor(plan, entry.type, rng), entry.diagnosis, vitals, entry.prenatal || {}, entry.postpartum || {}, rng, entry.date);
    }
    entry.administered_by = (entry.type === 'Prenatal Checkup' || entry.type === 'Postpartum Checkup' || entry.type === 'Growth Monitoring')
      ? MIDWIFE_NAME : plan.bhwName;
    entry.chronicConditions = plan.conditions;
    entry.currentMedications = plan.medications;
    entry.allergies = plan.allergies;
  }
  return entries;
};

// ------------------------------------------------------ medicine schedule ---
const addDaysSafe = (base, days) => addDays(base, days);
const vaccinePlanFor = (plan, rng) => {
  const out = [];
  const add = (name, dose, date) => {
    if (date < plan.dob || date > TODAY) return;
    out.push({ name, dose, date: iso(date) });
  };
  const birth = plan.dob;
  if (plan.age < 5) {
    add('BCG Vaccine', 1, birth);
    add('Hepatitis B Vaccine', 1, birth);
    add('Oral Polio Vaccine (OPV)', 1, birth);
    add('Pentavalent Vaccine (DPT-Hib)', 1, addDaysSafe(birth, 42));
    add('Oral Polio Vaccine (OPV)', 2, addDaysSafe(birth, 42));
    add('Pneumococcal Conjugate Vaccine (PCV13)', 1, addDaysSafe(birth, 42));
    add('Rotavirus Vaccine', 1, addDaysSafe(birth, 42));
    add('Pentavalent Vaccine (DPT-Hib)', 2, addDaysSafe(birth, 70));
    add('Oral Polio Vaccine (OPV)', 3, addDaysSafe(birth, 70));
    add('Pneumococcal Conjugate Vaccine (PCV13)', 2, addDaysSafe(birth, 70));
    add('Rotavirus Vaccine', 2, addDaysSafe(birth, 70));
    add('Pentavalent Vaccine (DPT-Hib)', 3, addDaysSafe(birth, 98));
    add('Inactivated Polio Vaccine (IPV)', 1, addDaysSafe(birth, 98));
    add('Pneumococcal Conjugate Vaccine (PCV13)', 3, addDaysSafe(birth, 98));
    add('Measles-Containing Vaccine (MCV)', 1, addDaysSafe(birth, 270));
    add('Inactivated Polio Vaccine (IPV)', 2, addDaysSafe(birth, 270));
    add('Measles-Containing Vaccine (MCV)', 2, addDaysSafe(birth, 365));
  }
  if (plan.age >= 60) {
    if (chance(rng, 0.68)) add('Influenza Vaccine (Quadrivalent)', 1, addDays(TODAY, -rint(rng, 20, 330)));
    if (chance(rng, 0.6)) add('Pneumococcal Polysaccharide Vaccine (PPSV23)', 1, addDays(TODAY, -rint(rng, 30, 700)));
  }
  if (plan.isPregnant) {
    if (chance(rng, 0.75)) add('Tetanus-Diphtheria (Td) Vaccine', 1, addDays(TODAY, -rint(rng, 20, 60)));
    if (chance(rng, 0.45)) add('Tetanus-Diphtheria (Td) Vaccine', 2, addDays(TODAY, -rint(rng, 5, 20)));
    if (chance(rng, 0.7)) add('Ferrous Sulfate + Folic Acid', rint(rng, 1, 3), addDays(TODAY, -rint(rng, 5, 80)));
    if (chance(rng, 0.5)) add('Calcium Carbonate + Vitamin D', 1, addDays(TODAY, -rint(rng, 5, 60)));
  }
  return out;
};

const otherMedicinePlanFor = (plan, rng) => {
  const out = [];
  const add = (name, dose, daysAgo) => {
    const date = addDays(TODAY, -daysAgo);
    if (date < plan.dob || date > TODAY) return;
    out.push({ name, dose, date: iso(date) });
  };
  if (plan.age >= 5 && plan.age <= 14 && chance(rng, 0.38)) add('Albendazole 400mg Chewable Tablet', 1, rint(rng, 20, 180));
  else if (plan.age >= 15 && plan.age < 60 && chance(rng, 0.12)) add('Mebendazole 500mg Chewable Tablet', 1, rint(rng, 30, 240));
  if (plan.age < 5 && monthsOld(plan.dob) >= 6 && chance(rng, 0.62)) add('Vitamin A Capsule (100,000 IU)', 1, rint(rng, 5, 150));
  if (plan.age >= 60 && chance(rng, 0.42)) add('Multivitamins + Minerals', 1, rint(rng, 10, 180));
  if (plan.age >= 15 && plan.age < 60 && chance(rng, 0.18)) add('Ascorbic Acid (Vitamin C) 500mg', 1, rint(rng, 15, 200));
  if (plan.age >= 15 && plan.age < 60 && chance(rng, 0.12)) add('Vitamin B Complex', 1, rint(rng, 15, 200));
  return out;
};

// ================================================================ plans ===
const makePlan = (i) => {
  const rng = mulberry32(0x51ed270b + i * 2654435761);
  const bucket = BUCKET_LIST[i];
  const g = rng();
  const gender = g < 0.505 ? 'Female' : g < 0.995 ? 'Male' : 'Other';
  const first = gender === 'Female' ? pick(rng, FEMALE_FIRST) : gender === 'Male' ? pick(rng, MALE_FIRST) : pick(rng, OTHER_FIRST);
  const name = uniqueName(first, rng);

  let dob;
  let age;
  if (bucket.infant) {
    const months = rint(rng, 0, 59);
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
  const isPregnant = gender === 'Female' && age >= 18 && age <= 45 && chance(rng, 0.1);
  const isPostpartum = !isPregnant && gender === 'Female' && age >= 18 && age <= 42 && chance(rng, 0.04);

  const focusGroups = [];
  if (age < 5) focusGroups.push('infant');
  if (age >= 60) focusGroups.push('senior');
  if (isPregnant) focusGroups.push('pregnant');
  if (isPwd) focusGroups.push('pwd');
  if (conditions.length > 0) focusGroups.push('withCondition');

  let latest = addDays(TODAY, -rint(rng, 3, isPregnant ? 45 : 180));
  const earliestVisit = addDays(dob, 1);
  if (latest < earliestVisit) latest = earliestVisit > TODAY ? TODAY : earliestVisit;
  if (latest > TODAY) latest = TODAY;

  const lastName = name.split(' ').slice(-1)[0];
  const motherName = age < 5 ? `${pick(rng, FEMALE_FIRST)} ${lastName}` : null;
  const fatherName = age < 5 ? `${pick(rng, MALE_FIRST)} ${lastName}` : null;
  const contactPerson = age < 5
    ? motherName
    : civilStatus === 'Married'
      ? `${pick(rng, gender === 'Female' ? MALE_FIRST : FEMALE_FIRST)} ${lastName}`
      : `${pick(rng, FEMALE_FIRST)} ${lastName}`;

  const plan = {
    index: i, name, gender, dob, age, civilStatus, purokIndex,
    contactNumber, contactPerson, contactPersonNumber,
    contactPersonAddress: `Purok ${purokIndex}, Barangay Gumamela, Naga City`,
    lastCheckupDate: latest, lastCheckup: iso(latest),
    focusGroups, isPwd, disabilityType, isPregnant, isPostpartum,
    motherName, fatherName, conditions, vitals, medications, allergies,
    bhwName: DEMO_BHWS[purokIndex - 1].name,
    residentId: null
  };

  plan.histories = buildHistories(plan, mulberry32(0x1a2b3c4d + i * 2246822519));
  plan.medicineRecords = [
    ...vaccinePlanFor(plan, mulberry32(0x2b3c4d5e + i * 2654435761)),
    ...otherMedicinePlanFor(plan, mulberry32(0x3c4d5e6f + i * 3266489917))
  ];
  return plan;
};

const buildPlans = (limit = TARGET_RESIDENTS) => {
  usedNames.clear();
  const plans = [];
  for (let i = 0; i < limit; i++) plans.push(makePlan(i));
  return plans;
};

// ============================================================ API client ===
let TOKEN = null;

const request = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
};

const api = async (method, path, body, attempt = 1) => {
  try {
    const { res, data } = await request(method, path, body);
    if (res.ok && data.success !== false) return data.data;
    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 5) {
      await sleep(600 * attempt + Math.random() * 400);
      return api(method, path, body, attempt + 1);
    }
    const details = data.errors ? ` | ${JSON.stringify(data.errors)}` : '';
    const error = new Error(`${method} ${path} -> ${res.status}: ${data.message || 'request failed'}${details}`);
    error.status = res.status;
    error.data = data;
    throw error;
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
      if (onProgress && (done % 25 === 0 || done === items.length)) onProgress(done, items.length, started);
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

const reportFailures = (label, failures) => {
  if (failures.length === 0) return;
  console.log(`  !! ${label}: ${failures.length} failed`);
  for (const f of failures.slice(0, 8)) console.log(`     - ${f.label}: ${f.error?.message || f.error}`);
  if (failures.length > 8) console.log(`     ... and ${failures.length - 8} more`);
};

const fetchAll = async (table, columns) => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
};

// Fills plan.residentId from the database by name so individual phases stay
// resumable even when an earlier phase is skipped.
const attachResidentIds = async (plans) => {
  if (plans.every((p) => p.residentId)) return;
  const existing = await fetchAll('residents', 'resident_id, name');
  const byName = new Map(existing.map((r) => [r.name, r.resident_id]));
  for (const plan of plans) {
    if (!plan.residentId) plan.residentId = byName.get(plan.name) || null;
  }
};

// ================================================================ phases ===
const phaseAdmin = async () => {
  console.log('Admin:');
  let login = await request('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (login.res.ok) {
    TOKEN = login.data.data.token;
    console.log(`  signed in as ${ADMIN_EMAIL}`);
    return;
  }
  const register = await request('POST', '/auth/register-admin', {
    name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD
  });
  if (!register.res.ok && register.res.status !== 403) {
    throw new Error(`register-admin failed: ${register.data.message || register.res.status}`);
  }
  login = await request('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!login.res.ok) throw new Error(`admin login failed: ${login.data.message || login.res.status}`);
  TOKEN = login.data.data.token;
  console.log(`  created and signed in as ${ADMIN_EMAIL}`);
};

const phasePuroks = async () => {
  console.log('Puroks:');
  const existing = await api('GET', '/puroks');
  const map = new Map((existing || []).map((p) => [p.name, p.id]));
  for (const name of PUROK_NAMES) {
    if (map.has(name)) { console.log(`  exists: ${name}`); continue; }
    const created = await api('POST', '/puroks', { name });
    map.set(name, created.id);
    console.log(`  created: ${name}`);
  }
  return map;
};

const phaseBhws = async (purokMap) => {
  console.log('Health workers:');
  const existing = await api('GET', '/bhws');
  const byName = new Map((existing || []).map((b) => [b.name, b]));
  const byPurokIndex = new Map();

  const createWorker = async (payload) => {
    try {
      return await api('POST', '/bhws', payload);
    } catch (error) {
      if (/username|already|taken/i.test(String(error.message))) {
        const refreshed = await api('GET', '/bhws');
        const found = (refreshed || []).find((b) => b.name === payload.name);
        if (found) return found;
      }
      throw error;
    }
  };

  for (let i = 0; i < DEMO_BHWS.length; i++) {
    const def = DEMO_BHWS[i];
    const contactNumber = `09${String(190000000 + i).padStart(9, '0')}`;
    let row = byName.get(def.name);
    if (!row) {
      row = await createWorker({
        name: def.name,
        position: 'Barangay Health Worker',
        contactNumber,
        email: def.email,
        status: 'Active',
        workerType: 'BHW',
        accountRole: 'BHW Worker',
        assignedPurokId: purokMap.get(PUROK_NAMES[i]),
        assignedFocusGroup: def.focus,
        username: def.username,
        password: DEMO_PASSWORD
      });
      byName.set(def.name, row);
      console.log(`  created BHW: ${def.name} (${PUROK_NAMES[i]}${def.focus ? `, ${def.focus}` : ''})`);
    } else {
      console.log(`  exists BHW: ${def.name}`);
    }
    byPurokIndex.set(i + 1, {
      id: row.id, name: row.name,
      contactNumber: row.contactNumber || contactNumber
    });
  }

  // BHW Head (BHW Admin account, no purok).
  let head = byName.get(HEAD_WORKER.name);
  if (!head) {
    head = await createWorker({
      name: HEAD_WORKER.name,
      position: 'Barangay Health Worker Head',
      contactNumber: '09179990001',
      email: HEAD_WORKER.email,
      status: 'Active',
      workerType: 'BHW',
      accountRole: 'BHW Admin',
      assignedPurokId: null,
      assignedFocusGroup: null,
      username: HEAD_WORKER.username,
      password: DEMO_PASSWORD
    });
    byName.set(HEAD_WORKER.name, head);
    console.log(`  created BHW Head: ${HEAD_WORKER.name}`);
  } else {
    console.log(`  exists BHW Head: ${HEAD_WORKER.name}`);
  }

  // Midwife and nurse (healthcare professionals, no accounts).
  let midwife = byName.get(MIDWIFE.name);
  if (!midwife) {
    midwife = await createWorker({
      name: MIDWIFE.name,
      position: 'Midwife',
      contactNumber: MIDWIFE.contactNumber,
      email: MIDWIFE.email,
      status: 'Active',
      workerType: 'Midwife',
      accountRole: 'BHW Worker',
      assignedPurokId: null,
      assignedFocusGroup: null,
      username: '',
      password: ''
    });
    byName.set(MIDWIFE.name, midwife);
    console.log(`  created Midwife: ${MIDWIFE.name}`);
  } else {
    console.log(`  exists Midwife: ${MIDWIFE.name}`);
  }

  let nurse = byName.get(NURSE.name);
  if (!nurse) {
    nurse = await createWorker({
      name: NURSE.name,
      position: 'Nurse',
      contactNumber: NURSE.contactNumber,
      email: NURSE.email,
      status: 'Active',
      workerType: 'Nurse',
      accountRole: 'BHW Worker',
      assignedPurokId: null,
      assignedFocusGroup: null,
      username: '',
      password: ''
    });
    byName.set(NURSE.name, nurse);
    console.log(`  created Nurse: ${NURSE.name}`);
  } else {
    console.log(`  exists Nurse: ${NURSE.name}`);
  }

  return { byPurokIndex, head, midwife, nurse };
};

const phaseMedicines = async () => {
  console.log('Medicines:');
  const existing = await api('GET', '/medicines');
  const map = new Map((existing || []).map((m) => [m.medicine_name, m]));
  for (const med of MEDICINES) {
    if (map.has(med.medicine_name)) { console.log(`  exists: ${med.medicine_name}`); continue; }
    const created = await api('POST', '/medicines', med);
    map.set(med.medicine_name, created);
    console.log(`  created: ${med.medicine_name} (${med.category})`);
  }
  return map;
};

const phaseResidents = async (plans, purokMap) => {
  console.log('Residents:');
  const existing = await fetchAll('residents', 'resident_id, name');
  const byName = new Map(existing.map((r) => [r.name, r.resident_id]));
  for (const plan of plans) plan.residentId = byName.get(plan.name) ?? null;
  const toCreate = plans.filter((p) => !p.residentId);
  console.log(`  ${existing.length} already in DB, ${toCreate.length} to create`);

  const results = await pool(toCreate, CONCURRENCY, async (plan) => {
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
      vitalSigns: plan.vitals
    });
    if (!row?.id) throw new Error('API returned no resident id');
    plan.residentId = row.id;
    return row.id;
  }, progressLogger('residents'));

  const failures = results.map((r, i) => ({ r, plan: toCreate[i] }))
    .filter((x) => !x.r.ok).map((x) => ({ label: x.plan.name, error: x.r.error }));
  reportFailures('resident creation', failures);
  return failures;
};

const phaseHistories = async (plans) => {
  console.log('Medical histories:');
  await attachResidentIds(plans);
  const existing = new Set(
    (await fetchAll('medical_histories', 'resident_id, date, type'))
      .map((h) => `${h.resident_id}|${String(h.date).slice(0, 10)}|${h.type}`)
  );

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    for (const entry of plan.histories) {
      const key = `${plan.residentId}|${entry.date}|${entry.type}`;
      if (!existing.has(key)) jobs.push({ plan, entry });
    }
  }
  console.log(`  ${jobs.length} to create`);

  const results = await pool(jobs, CONCURRENCY, async ({ plan, entry }) => {
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
      allergies: entry.allergies
    };
    if (entry.prenatal) payload.prenatal = entry.prenatal;
    if (entry.postpartum) payload.postpartum = entry.postpartum;
    return api('POST', `/residents/${plan.residentId}/medical-history`, payload);
  }, progressLogger('histories'));

  const failures = results.map((r, i) => ({ r, job: jobs[i] }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: `${x.job.plan.name} ${x.job.entry.date} ${x.job.entry.type}`, error: x.r.error }));
  reportFailures('medical history creation', failures);
  return failures;
};

const phaseMedicineRecords = async (plans, medicineMap) => {
  console.log('Medicine administration records:');
  await attachResidentIds(plans);
  const existing = new Set(
    (await fetchAll('resident_medicine_records', 'resident_id, medicine_name, dose_number'))
      .map((r) => `${r.resident_id}|${r.medicine_name}|${r.dose_number}`)
  );

  const jobs = [];
  for (const plan of plans) {
    if (!plan.residentId) continue;
    const seen = new Set();
    for (const record of plan.medicineRecords) {
      const key = `${plan.residentId}|${record.name}|${record.dose}`;
      if (seen.has(key) || existing.has(key)) continue;
      seen.add(key);
      const master = medicineMap.get(record.name);
      if (!master) continue;
      jobs.push({ plan, record, master });
    }
  }
  console.log(`  ${jobs.length} to create`);

  const results = await pool(jobs, CONCURRENCY, async ({ plan, record, master }) => {
    const isVaccine = master.category === 'vaccine';
    const administeredBy = (record.name.includes('Td') || isVaccine && plan.age < 5) ? MIDWIFE_NAME : plan.bhwName;
    return api('POST', `/medicines/resident/${plan.residentId}`, {
      medicine_master_id: master.id,
      dose_number: record.dose,
      date_administered: record.date,
      facility: pick(mulberry32(plan.index + record.dose), ['Barangay Health Center', 'Rural Health Unit - Naga City']),
      batch_number: `${String(master.category).slice(0, 3).toUpperCase()}-2026-${String((plan.index % 40) + 1).padStart(2, '0')}`,
      administration_site: master.category === 'deworming' || record.name.includes('OPV') || record.name.includes('Rotavirus')
        ? 'Oral' : record.name.includes('BCG') ? 'Intradermal - right deltoid' : 'Intramuscular - left deltoid',
      administered_by: administeredBy,
      remarks: 'Demo administration record for system walkthrough.'
    });
  }, progressLogger('medicine records'));

  const failures = results.map((r, i) => ({ r, job: jobs[i] }))
    .filter((x) => !x.r.ok)
    .map((x) => ({ label: `${x.job.plan.name} ${x.job.record.name} dose ${x.job.record.dose}`, error: x.r.error }));
  reportFailures('medicine record creation', failures);
  return failures;
};

const phaseSchedules = async (plans, workers) => {
  console.log('Schedules:');
  const existing = new Set(
    (await fetchAll('schedules', 'scope, date, time, program_name, resident_id, purok_id'))
      .map((s) => `${s.scope}|${String(s.date).slice(0, 10)}|${s.time}|${s.program_name || ''}|${s.resident_id || ''}|${s.purok_id || ''}`)
  );

  const byPurok = new Map();
  for (let p = 1; p <= 12; p++) byPurok.set(p, []);
  for (const plan of plans) {
    if (plan.residentId) byPurok.get(plan.purokIndex).push(plan);
  }

  const choose = (purokIndex) => {
    const list = byPurok.get(purokIndex) || [];
    return {
      pregnant: list.find((p) => p.isPregnant),
      infant: list.find((p) => p.age < 5),
      senior: list.find((p) => p.age >= 60),
      adult: list.find((p) => p.age >= 18 && p.age < 60)
    };
  };

  const individual = (plan, bhw, date, status, time) => {
    let type = 'Checkup';
    let purpose = 'Routine health checkup and health teaching.';
    let hcp = [];
    if (plan.isPregnant) {
      type = 'Prenatal Checkup';
      purpose = 'Prenatal checkup, maternal risk assessment and birth planning.';
      hcp = [{ hcpId: workers.midwife.id, id: workers.midwife.id, name: workers.midwife.name, contact: workers.midwife.contactNumber }];
    } else if (plan.isPostpartum) {
      type = 'Postpartum Checkup';
      purpose = 'Postpartum and newborn assessment, breastfeeding support.';
      hcp = [{ hcpId: workers.midwife.id, id: workers.midwife.id, name: workers.midwife.name, contact: workers.midwife.contactNumber }];
    } else if (plan.age < 5) {
      type = 'Growth Monitoring';
      purpose = 'Growth monitoring, nutrition assessment and immunization review.';
      hcp = [{ hcpId: workers.midwife.id, id: workers.midwife.id, name: workers.midwife.name, contact: workers.midwife.contactNumber }];
    } else if (plan.age >= 60) {
      type = 'Senior Checkup';
      purpose = 'Senior wellness checkup and maintenance medication review.';
    } else {
      type = pick(mulberry32(plan.index), ['Checkup', 'Vaccination', 'Deworming', 'Vitamin Supplementation']);
      purpose = type === 'Vaccination' ? 'Routine immunization visit.'
        : type === 'Deworming' ? 'Deworming and nutrition counselling.'
          : type === 'Vitamin Supplementation' ? 'Vitamin supplementation and health teaching.'
            : 'Routine health checkup and health teaching.';
    }
    return {
      scope: 'individual', date: iso(date), time,
      type, status, duration: 30, purpose,
      notes: 'Demo appointment for system walkthrough.',
      locationDetails: `${PUROK_NAMES[plan.purokIndex - 1]} - Barangay Health Center`,
      contactPerson: plan.contactPerson,
      contactNumber: plan.contactNumber,
      residentContactNumber: plan.contactNumber,
      residentId: plan.residentId,
      purokId: null,
      isBarangayWide: false,
      programName: '', programDescription: '', targetGroup: '', targetCount: null,
      venue: '', coordinatorName: '', coordinatorContact: '', partnerOrganization: '',
      maxParticipants: null,
      assignedBhws: [{ bhwId: bhw.id, id: bhw.id, name: bhw.name, contactNumber: bhw.contactNumber }],
      healthcareProfessionals: hcp
    };
  };

  const jobs = [];
  // A Completed individual checkup clears that resident's earlier Missed
  // schedules (a real system rule). Track who is completed so the demo also
  // keeps a healthy set of genuinely missed consultations.
  const completedIds = new Set();
  const pickFrom = (list, exclude, order) => {
    for (const predicate of order) {
      const found = list.find((r) => !exclude.has(String(r.residentId)) && predicate(r));
      if (found) return found;
    }
    return null;
  };
  const isPregnant = (r) => !!r.isPregnant;
  const isInfant = (r) => r.age < 5;
  const isSenior = (r) => r.age >= 60;
  const isAdult = (r) => r.age >= 18 && r.age < 60;

  // Today's appointments first so those residents are reserved.
  for (let p = 1; p <= 4; p++) {
    const bhw = workers.byPurokIndex.get(p);
    const resident = pickFrom(byPurok.get(p) || [], completedIds, [isAdult, isSenior, isInfant, isPregnant, () => true]);
    if (resident) {
      completedIds.add(String(resident.residentId));
      jobs.push(individual(resident, bhw, TODAY, 'Completed', `${13 + p}:00`));
    }
  }

  for (let p = 1; p <= 12; p++) {
    const bhw = workers.byPurokIndex.get(p);
    const list = byPurok.get(p) || [];
    const used = new Set();

    const completedResident = pickFrom(list, completedIds, [isPregnant, isInfant, isSenior, isAdult, () => true]);
    if (completedResident) {
      used.add(String(completedResident.residentId));
      completedIds.add(String(completedResident.residentId));
      jobs.push(individual(completedResident, bhw, addDays(TODAY, -(5 + p * 2)), 'Completed', '08:30'));
    }

    const futureResident = pickFrom(list, used, [isInfant, isSenior, isAdult, isPregnant, () => true]);
    if (futureResident) {
      used.add(String(futureResident.residentId));
      jobs.push(individual(futureResident, bhw, addDays(TODAY, 2 + p), 'Scheduled', '10:00'));
    }

    const missedResident = pickFrom(list, new Set([...used, ...completedIds]), [isSenior, isAdult, isInfant, isPregnant, () => true]);
    if (missedResident) {
      jobs.push(individual(missedResident, bhw, addDays(TODAY, -(12 + p)), p <= 6 ? 'Missed' : 'Cancelled', '10:00'));
    }
  }

  // Per-purok programs.
  for (let p = 1; p <= 12; p++) {
    const bhw = workers.byPurokIndex.get(p);
    jobs.push({
      scope: 'purok', date: iso(addDays(TODAY, 15 + p)), time: '08:00',
      type: 'Program', status: p === 12 ? 'Cancelled' : 'Scheduled', duration: 240,
      purpose: `Barangay health program for ${PUROK_NAMES[p - 1]} residents.`,
      notes: 'Demo purok-wide program for system walkthrough.',
      locationDetails: `${PUROK_NAMES[p - 1]} Multi-Purpose Hall`,
      contactPerson: bhw.name, contactNumber: bhw.contactNumber,
      residentContactNumber: null, residentId: null,
      purokId: workers.purokMap.get(PUROK_NAMES[p - 1]),
      isBarangayWide: false,
      programName: `${PUROK_NAMES[p - 1]} Health and Wellness Program`,
      programDescription: 'Free blood pressure check, blood sugar screening, nutrition counselling and immunization review.',
      targetGroup: 'all', targetCount: 150,
      venue: `${PUROK_NAMES[p - 1]} Multi-Purpose Hall`,
      coordinatorName: bhw.name, coordinatorContact: bhw.contactNumber,
      partnerOrganization: 'Barangay Gumamela Health Committee',
      maxParticipants: 300,
      assignedBhws: [{ bhwId: bhw.id, id: bhw.id, name: bhw.name, contactNumber: bhw.contactNumber }],
      healthcareProfessionals: [
        { hcpId: workers.midwife.id, id: workers.midwife.id, name: workers.midwife.name, contact: workers.midwife.contactNumber },
        { hcpId: workers.nurse.id, id: workers.nurse.id, name: workers.nurse.name, contact: workers.nurse.contactNumber }
      ]
    });
  }

  // Barangay-wide programs.
  const barangayAssignments = (purokIndexes) => purokIndexes.map((p) => {
    const bhw = workers.byPurokIndex.get(p);
    return { bhwId: bhw.id, id: bhw.id, name: bhw.name, contactNumber: bhw.contactNumber };
  });
  const hcps = [
    { hcpId: workers.midwife.id, id: workers.midwife.id, name: workers.midwife.name, contact: workers.midwife.contactNumber },
    { hcpId: workers.nurse.id, id: workers.nurse.id, name: workers.nurse.name, contact: workers.nurse.contactNumber }
  ];

  const barangayProgram = (daysAhead, programName, type, targetGroup, targetCount, status) => ({
    scope: 'barangay', date: iso(addDays(TODAY, daysAhead)), time: '07:30',
    type, status, duration: 300,
    purpose: `${programName} for all barangay residents.`,
    notes: 'Demo barangay-wide program for system walkthrough.',
    locationDetails: 'Barangay Gumamela Covered Court',
    contactPerson: workers.head.name, contactNumber: '09179990001',
    residentContactNumber: null, residentId: null, purokId: null,
    isBarangayWide: true,
    programName, programDescription: 'Coordinated barangay-wide health service with the Rural Health Unit.',
    targetGroup, targetCount,
    venue: 'Barangay Gumamela Covered Court',
    coordinatorName: workers.head.name, coordinatorContact: '09179990001',
    partnerOrganization: 'Naga City Rural Health Unit',
    maxParticipants: 1500,
    assignedBhws: barangayAssignments([1, 2, 3, 4]),
    healthcareProfessionals: hcps
  });

  jobs.push(barangayProgram(40, 'Barangay-Wide Deworming and Vitamin A Distribution', 'Deworming', 'all', 1200, 'Scheduled'));
  jobs.push(barangayProgram(47, 'Barangay-Wide Senior Citizens Health and Wellness Fair', 'Program', 'senior', 500, 'Scheduled'));
  jobs.push(barangayProgram(54, 'Barangay-Wide Prenatal and Postpartum Care Orientation', 'Program', 'pregnant', 120, 'Scheduled'));
  jobs.push(barangayProgram(-25, 'Barangay-Wide Immunization Day', 'Vaccination', 'infant', 300, 'Completed'));
  jobs.push(barangayProgram(-55, 'Barangay-Wide Deworming Program', 'Deworming', 'all', 1200, 'Completed'));

  const toCreate = jobs.filter((job) => {
    const key = `${job.scope}|${job.date}|${job.time}|${job.programName || ''}|${job.residentId || ''}|${job.purokId || ''}`;
    return !existing.has(key);
  });
  console.log(`  ${jobs.length - toCreate.length} already in DB, ${toCreate.length} to create`);

  const failures = [];
  for (let i = 0; i < toCreate.length; i++) {
    const job = toCreate[i];
    try {
      await api('POST', '/schedules', job);
    } catch (error) {
      failures.push({ label: `${job.scope} ${job.programName || job.type} ${job.date}`, error });
    }
    if ((i + 1) % 10 === 0 || i + 1 === toCreate.length) console.log(`  schedules: ${i + 1}/${toCreate.length}`);
  }
  reportFailures('schedule creation', failures);
  return failures;
};

const phaseVerify = async () => {
  console.log('\nVerification:');
  const tables = [
    'users', 'puroks', 'bhws', 'residents', 'resident_vital_signs',
    'resident_chronic_conditions', 'medical_histories', 'medicine_master',
    'resident_medicine_records', 'schedules', 'schedule_bhws'
  ];
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${error ? `ERR ${error.message}` : count}`);
  }

  const { data: roles } = await supabase.from('bhws').select('name, position, worker_type, username, has_account, assigned_purok_id, assigned_focus_group');
  const summary = { BHW: 0, 'BHW Head': 0, Midwife: 0, Nurse: 0, other: 0 };
  for (const r of roles || []) {
    if (r.position === 'Barangay Health Worker Head') summary['BHW Head']++;
    else if (r.worker_type === 'BHW') summary.BHW++;
    else if (r.worker_type === 'Midwife') summary.Midwife++;
    else if (r.worker_type === 'Nurse') summary.Nurse++;
    else summary.other++;
  }
  console.log('  worker summary:', JSON.stringify(summary));

  const { data: users } = await supabase.from('users').select('email, role_display');
  console.log('  accounts:');
  for (const u of users || []) console.log(`    ${u.email} (${u.role_display})`);

  const { data: puroks } = await supabase.from('puroks').select('name').order('name');
  const { data: residents } = await supabase.from('residents').select('purok_id');
  const { data: purokRows } = await supabase.from('puroks').select('purok_id, name');
  const nameById = new Map((purokRows || []).map((p) => [String(p.purok_id), p.name]));
  const perPurok = {};
  for (const r of residents || []) {
    const name = nameById.get(String(r.purok_id)) || 'Unassigned';
    perPurok[name] = (perPurok[name] || 0) + 1;
  }
  console.log('  puroks:', (puroks || []).map((p) => p.name).join(', '));
  console.log('  residents per purok:', JSON.stringify(perPurok));

  const { data: schedules } = await supabase.from('schedules').select('scope, status');
  const byScope = {};
  const byStatus = {};
  for (const s of schedules || []) {
    byScope[s.scope] = (byScope[s.scope] || 0) + 1;
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }
  console.log('  schedules by scope:', JSON.stringify(byScope));
  console.log('  schedules by status:', JSON.stringify(byStatus));

  for (const report of ['infants-vaccination-report', 'seniors-report', 'prenatal-report', 'postpartum-report']) {
    const { res, data } = await request('GET', `/dashboard/${report}`);
    if (!res.ok) {
      console.log(`  report ${report}: ${res.status} ${data.message || ''}`);
      continue;
    }
    const rows = data.data?.residents || data.data?.mothers || data.data?.rows || [];
    console.log(`  report ${report}: ${res.status}, rows=${rows.length}`);
  }
};

// ================================================================== main ===
const main = async () => {
  console.log(`CitiCare demo seed — target residents: ${TARGET_RESIDENTS}, limit: ${LIMIT}, concurrency: ${CONCURRENCY}`);
  console.log(`API: ${API}\n`);

  // Authentication is needed for every API phase (verify included).
  await phaseAdmin();

  const plans = buildPlans(LIMIT);
  console.log(`\nGenerated ${plans.length} resident plans.`);

  let purokMap = null;
  let workers = null;
  let medicineMap = null;

  if (PHASES.has('puroks')) purokMap = await phasePuroks();
  if (PHASES.has('bhws')) {
    if (!purokMap) {
      const existing = await api('GET', '/puroks');
      purokMap = new Map((existing || []).map((p) => [p.name, p.id]));
    }
    workers = await phaseBhws(purokMap);
    workers.purokMap = purokMap;
  }
  if (PHASES.has('medicines')) medicineMap = await phaseMedicines();

  if (PHASES.has('residents')) {
    if (!purokMap) {
      const existing = await api('GET', '/puroks');
      purokMap = new Map((existing || []).map((p) => [p.name, p.id]));
    }
    await phaseResidents(plans, purokMap);
  }

  if (PHASES.has('histories')) await phaseHistories(plans);

  if (PHASES.has('medicine-records')) {
    if (!medicineMap) {
      const existing = await api('GET', '/medicines');
      medicineMap = new Map((existing || []).map((m) => [m.medicine_name, m]));
    }
    await phaseMedicineRecords(plans, medicineMap);
  }

  if (PHASES.has('schedules')) {
    if (!workers) {
      const existing = await api('GET', '/bhws');
      const byPurokIndex = new Map();
      for (let i = 0; i < DEMO_BHWS.length; i++) {
        const row = (existing || []).find((b) => b.name === DEMO_BHWS[i].name);
        if (row) byPurokIndex.set(i + 1, { id: row.id, name: row.name, contactNumber: row.contactNumber });
      }
      const find = (name) => (existing || []).find((b) => b.name === name);
      workers = {
        byPurokIndex,
        head: find(HEAD_WORKER.name),
        midwife: find(MIDWIFE.name),
        nurse: find(NURSE.name)
      };
      const puroks = await api('GET', '/puroks');
      workers.purokMap = new Map((puroks || []).map((p) => [p.name, p.id]));
    }
    // Schedule phase needs resident IDs even when the residents phase was skipped.
    if (plans.some((p) => !p.residentId)) {
      const existing = await fetchAll('residents', 'resident_id, name');
      const byName = new Map(existing.map((r) => [r.name, r.resident_id]));
      for (const plan of plans) plan.residentId = plan.residentId || byName.get(plan.name) || null;
    }
    await phaseSchedules(plans, workers);
  }

  if (PHASES.has('verify')) await phaseVerify();

  console.log('\nDone.');
};

main().catch((error) => {
  console.error('\nSeed failed:', error);
  process.exit(1);
});
