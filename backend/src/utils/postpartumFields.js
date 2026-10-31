// utils/postpartumFields.js
// Structured postpartum helpers — mirrors prenatalFields.js.
// Postpartum outcome is encoded in the same checkup form (usually with
// Pregnancy Status = Delivered) and aggregated per mother for the BHW
// postpartum report (Excel postpartum-tab parity).

export const BIRTH_OUTCOMES = [
  { key: 'live', label: 'Live birth' },
  { key: 'preterm', label: 'Preterm birth' },
  { key: 'stillbirth', label: 'Stillbirth' },
  { key: 'abortion', label: 'Abortion' },
];

export const BIRTH_OUTCOME_KEYS = BIRTH_OUTCOMES.map((o) => o.key);

export const POSTPARTUM_COLUMNS = [
  'birth_date',
  'birth_outcome',
  'postnatal_24h',
  'postnatal_day3',
  'postnatal_day7_14',
  'postnatal_week6',
  'maternal_death_date',
  'neonatal_death_date',
  'outcome_details',
  'postpartum_remarks',
  'delivery_place',
  'birth_attendant',
  'birth_attendant_name',
  'delivery_mode',
  'baby_name',
  'baby_gender',
  'checkup_date',
  'mother_bp',
  'mother_temp',
  'lochia',
  'wound_condition',
  'breastfeeding_status',
  'baby_weight',
  'baby_temp',
  'baby_feeding_status',
  'jaundice',
  'cord_condition',
  'newborn_danger_signs',
  'stillbirth_reg_date',
  'spouse_name',
];

const cleanText = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const cleanDate = (v) => {
  const s = cleanText(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return s.slice(0, 10);
};

const cleanNum = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Strict coded sets (mirror the SQL CHECK constraints) — unknown values
// fall back to null so inserts never violate the constraints.
const inSet = (v, allowed) => {
  const s = cleanText(v);
  return s && allowed.includes(s) ? s : null;
};

const outcomeKey = (v) => {
  const s = cleanText(v);
  if (!s) return null;
  if (BIRTH_OUTCOME_KEYS.includes(s)) return s;
  const low = s.toLowerCase();
  if (low.includes('preterm') || low.includes('kulang')) return 'preterm';
  if (low.includes('still') || low.includes('sinapupunan')) return 'stillbirth';
  if (low.includes('abort') || low.includes('agas') || low.includes('laglag')) return 'abortion';
  if (low.includes('live') || low.includes('buhay')) return 'live';
  return null;
};

// Accepts a nested `postpartum` object (new frontend) or flat legacy keys.
export const extractPostpartumFromBody = (body = {}) => {
  const src = body?.postpartum && typeof body.postpartum === 'object' ? body.postpartum : body;
  return {
    birth_date: cleanDate(src.birthDate ?? src.birth_date),
    birth_outcome: outcomeKey(src.birthOutcome ?? src.birth_outcome),
    postnatal_24h: cleanDate(src.postnatal24h ?? src.postnatal_24h),
    postnatal_day3: cleanDate(src.postnatalDay3 ?? src.postnatal_day3),
    postnatal_day7_14: cleanDate(src.postnatalDay714 ?? src.postnatal_day7_14),
    postnatal_week6: cleanDate(src.postnatalWeek6 ?? src.postnatal_week6),
    maternal_death_date: cleanDate(src.maternalDeathDate ?? src.maternal_death_date),
    neonatal_death_date: cleanDate(src.neonatalDeathDate ?? src.neonatal_death_date),
    outcome_details: cleanText(src.outcomeDetails ?? src.outcome_details),
    postpartum_remarks: cleanText(src.postpartumRemarks ?? src.postpartum_remarks),
    delivery_place: cleanText(src.deliveryPlace ?? src.delivery_place),
    birth_attendant: inSet(src.birthAttendant ?? src.birth_attendant, ['Doctor', 'Midwife', 'Nurse', 'Other']),
    birth_attendant_name: cleanText(src.birthAttendantName ?? src.birth_attendant_name),
    delivery_mode: inSet(src.deliveryMode ?? src.delivery_mode, ['Vaginal/Normal', 'Cesarean Section']),
    baby_name: cleanText(src.babyName ?? src.baby_name),
    baby_gender: inSet(src.babyGender ?? src.baby_gender, ['Male', 'Female']),
    checkup_date: cleanDate(src.checkupDate ?? src.checkup_date),
    mother_bp: cleanText(src.motherBP ?? src.mother_bp),
    mother_temp: cleanNum(src.motherTemp ?? src.mother_temp),
    lochia: inSet(src.lochia, ['Normal', 'Abnormal', 'Heavy']),
    wound_condition: inSet(src.woundCondition ?? src.wound_condition, ['Normal', 'Signs of Infection', 'Not Applicable']),
    breastfeeding_status: inSet(src.breastfeedingStatus ?? src.breastfeeding_status, ['Good', 'With Difficulty', 'Not Breastfeeding']),
    baby_weight: cleanText(src.babyWeight ?? src.baby_weight),
    baby_temp: cleanNum(src.babyTemp ?? src.baby_temp),
    baby_feeding_status: inSet(src.babyFeedingStatus ?? src.baby_feeding_status, ['Feeding Well', 'Difficulty Feeding']),
    jaundice: inSet(src.jaundice, ['Present', 'Absent']),
    cord_condition: inSet(src.cordCondition ?? src.cord_condition, ['Normal', 'Signs of Infection', 'Healed']),
    newborn_danger_signs: cleanText(src.newbornDangerSigns ?? src.newborn_danger_signs),
    stillbirth_reg_date: cleanDate(src.stillbirthRegDate ?? src.stillbirth_reg_date),
    spouse_name: cleanText(src.spouseName ?? src.spouse_name),
  };
};

export const hasPostpartumContent = (p = {}) =>
  Object.values(p).some((v) => v !== null && v !== undefined && String(v).trim() !== '');

// Legacy fallback: postpartum data serialized into notes lines.
const pickLine = (notes, label) => {
  if (!notes) return null;
  const m = String(notes).match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  const v = m ? m[1].trim() : '';
  return v === '' ? null : v;
};

export const parsePostpartumNotes = (notes) => {
  if (!notes || !String(notes).trim()) return {};
  return {
    birth_date: pickLine(notes, 'Birth date'),
    birth_outcome: outcomeKey(pickLine(notes, 'Birth outcome')),
    postnatal_24h: pickLine(notes, 'Postnatal 24h'),
    postnatal_day3: pickLine(notes, 'Postnatal 3rd day'),
    postnatal_day7_14: pickLine(notes, 'Postnatal 7-14 days'),
    postnatal_week6: pickLine(notes, 'Postnatal 6th week'),
    maternal_death_date: pickLine(notes, 'Maternal death date'),
    neonatal_death_date: pickLine(notes, 'Neonatal death date'),
    outcome_details: pickLine(notes, 'Outcome details'),
    postpartum_remarks: pickLine(notes, 'Postpartum remarks'),
    delivery_place: pickLine(notes, 'Delivery place'),
    birth_attendant: pickLine(notes, 'Birth attendant'),
    birth_attendant_name: pickLine(notes, 'Birth attendant name'),
    delivery_mode: pickLine(notes, 'Mode of delivery'),
    baby_name: pickLine(notes, "Baby's name"),
    baby_gender: pickLine(notes, "Baby's gender"),
    checkup_date: pickLine(notes, 'Check-up date'),
    mother_bp: pickLine(notes, "Mother's BP"),
    mother_temp: pickLine(notes, "Mother's temperature"),
    lochia: pickLine(notes, 'Lochia'),
    wound_condition: pickLine(notes, 'Wound condition'),
    breastfeeding_status: pickLine(notes, 'Breastfeeding status'),
    baby_weight: pickLine(notes, "Baby's weight"),
    baby_temp: pickLine(notes, "Baby's temperature"),
    baby_feeding_status: pickLine(notes, "Baby's feeding status"),
    jaundice: pickLine(notes, 'Jaundice'),
    cord_condition: pickLine(notes, 'Cord condition'),
    newborn_danger_signs: pickLine(notes, 'Newborn danger signs'),
    stillbirth_reg_date: pickLine(notes, 'Stillbirth reg date'),
    spouse_name: pickLine(notes, "Spouse's name"),
  };
};

// Whole days between birth and a visit date (null when unknown or the
// visit predates the birth).
export const daysSinceBirth = (birthDate, date) => {
  if (!birthDate || !date) return null;
  const b = new Date(String(birthDate).slice(0, 10));
  const d = new Date(String(date).slice(0, 10));
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  const days = Math.floor((d - b) / (1000 * 60 * 60 * 24));
  return days < 0 ? null : days;
};

// Map days-since-birth → Excel postnatal schedule column. Sequential
// windows: 0-1d (within 24h), 2-4d (3rd day), 5-14d (7-14 days),
// 15-42d (6th week). Later visits stay unbucketed.
export const postnatalBucketForDays = (days) => {
  if (days === null || days === undefined) return null;
  if (days <= 1) return 'postnatal24h';
  if (days <= 4) return 'postnatalDay3';
  if (days <= 14) return 'postnatalDay714';
  if (days <= 42) return 'postnatalWeek6';
  return null;
};

// Structured columns win; notes-parsed values fill the gaps.
export const mergePostpartum = (row = {}) => {
  const legacy = parsePostpartumNotes(row.notes);
  const coalesce = (...vals) => {
    for (const v of vals) {
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    return null;
  };
  return {
    birthDate: coalesce(row.birth_date, legacy.birth_date),
    birthOutcome: coalesce(row.birth_outcome, legacy.birth_outcome),
    postnatal24h: coalesce(row.postnatal_24h, legacy.postnatal_24h),
    postnatalDay3: coalesce(row.postnatal_day3, legacy.postnatal_day3),
    postnatalDay714: coalesce(row.postnatal_day7_14, legacy.postnatal_day7_14),
    postnatalWeek6: coalesce(row.postnatal_week6, legacy.postnatal_week6),
    maternalDeathDate: coalesce(row.maternal_death_date, legacy.maternal_death_date),
    neonatalDeathDate: coalesce(row.neonatal_death_date, legacy.neonatal_death_date),
    outcomeDetails: coalesce(row.outcome_details, legacy.outcome_details),
    postpartumRemarks: coalesce(row.postpartum_remarks, legacy.postpartum_remarks),
    deliveryPlace: coalesce(row.delivery_place, legacy.delivery_place),
    birthAttendant: coalesce(row.birth_attendant, legacy.birth_attendant),
    birthAttendantName: coalesce(row.birth_attendant_name, legacy.birth_attendant_name),
    deliveryMode: coalesce(row.delivery_mode, legacy.delivery_mode),
    babyName: coalesce(row.baby_name, legacy.baby_name),
    babyGender: coalesce(row.baby_gender, legacy.baby_gender),
    checkupDate: coalesce(row.checkup_date, legacy.checkup_date),
    motherBP: coalesce(row.mother_bp, legacy.mother_bp),
    motherTemp: coalesce(row.mother_temp, legacy.mother_temp),
    lochia: coalesce(row.lochia, legacy.lochia),
    woundCondition: coalesce(row.wound_condition, legacy.wound_condition),
    breastfeedingStatus: coalesce(row.breastfeeding_status, legacy.breastfeeding_status),
    babyWeight: coalesce(row.baby_weight, legacy.baby_weight),
    babyTemp: coalesce(row.baby_temp, legacy.baby_temp),
    babyFeedingStatus: coalesce(row.baby_feeding_status, legacy.baby_feeding_status),
    jaundice: coalesce(row.jaundice, legacy.jaundice),
    cordCondition: coalesce(row.cord_condition, legacy.cord_condition),
    newbornDangerSigns: coalesce(row.newborn_danger_signs, legacy.newborn_danger_signs),
    stillbirthRegDate: coalesce(row.stillbirth_reg_date, legacy.stillbirth_reg_date),
    spouseName: coalesce(row.spouse_name, legacy.spouse_name),
  };
};
