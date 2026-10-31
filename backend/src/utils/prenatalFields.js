// utils/prenatalFields.js
// Structured prenatal helpers shared by resident + dashboard controllers.
// The Prenatal Checkup form is the single encoder for the BHW prenatal
// report (Excel prenatal-tab parity, minus income/signature).

// ANC checkup windows → Excel columns J..Q
export const ANC_WINDOWS = [
  { key: 'w1_12', label: '1-12 weeks' },
  { key: 'w13_20', label: '13-20 weeks' },
  { key: 'w21_26', label: '21-26 weeks' },
  { key: 'w27_30', label: '27-30 weeks' },
  { key: 'w31_34', label: '31-34 weeks' },
  { key: 'w35_36', label: '35-36 weeks' },
  { key: 'w37_38', label: '37-38 weeks' },
  { key: 'w39_40', label: '39-40 weeks' },
];

export const ANC_WINDOW_KEYS = ANC_WINDOWS.map((w) => w.key);

// Nullable columns added by add_prenatal_fields_to_medical_histories.sql
export const PRENATAL_COLUMNS = [
  'registration_datetime',
  'lmp',
  'edd',
  'gravida',
  'para',
  'pregnancy_status',
  'gestational_age',
  'fundal_height',
  'fetal_heart_rate',
  'fetal_movement',
  'muac_cm',
  'muac_date',
  'td_status',
  'anc_window',
  'is_private_visit',
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

const cleanInt = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const cleanNum = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Pull structured prenatal fields out of a POST body. Accepts either a
// nested `prenatal` object (new frontend) or flat legacy keys.
export const extractPrenatalFromBody = (body = {}) => {
  const src = body?.prenatal && typeof body.prenatal === 'object' ? body.prenatal : body;
  const ancWindow = cleanText(src.ancWindow ?? src.anc_window);
  return {
    registration_datetime: cleanText(src.registrationDatetime ?? src.registration_datetime) || null,
    lmp: cleanDate(src.lmp),
    edd: cleanDate(src.edd),
    gravida: cleanInt(src.gravida),
    para: cleanInt(src.para),
    pregnancy_status: cleanText(src.pregnancyStatus ?? src.pregnancy_status),
    gestational_age: cleanText(src.gestationalAge ?? src.gestational_age),
    fundal_height: cleanNum(src.fundalHeight ?? src.fundal_height),
    fetal_heart_rate: cleanInt(src.fetalHeartRate ?? src.fetal_heart_rate),
    fetal_movement: cleanText(src.fetalMovement ?? src.fetal_movement),
    muac_cm: cleanNum(src.muac ?? src.muac_cm),
    muac_date: cleanDate(src.muacDate ?? src.muac_date),
    td_status: cleanText(src.tdStatus ?? src.td_status),
    anc_window: ANC_WINDOW_KEYS.includes(ancWindow) ? ancWindow : null,
    is_private_visit: Boolean(src.isPrivateVisit ?? src.is_private_visit ?? false),
  };
};

export const hasPrenatalContent = (p = {}) =>
  Object.entries(p).some(([k, v]) => {
    if (k === 'is_private_visit') return v === true;
    return v !== null && v !== undefined && String(v).trim() !== '';
  });

// --- Legacy fallback: old checkups serialized prenatal data into notes
// lines ("LMP: ...", "EDD: ..."). Parse them so the report works for
// records saved before the migration ran.
const pickLine = (notes, label) => {
  if (!notes) return null;
  const m = String(notes).match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  const v = m ? m[1].trim() : '';
  return v === '' ? null : v;
};

export const parsePrenatalNotes = (notes) => {
  if (!notes || !String(notes).trim()) return {};
  const muacRaw = pickLine(notes, 'MUAC');
  let muac = null;
  if (muacRaw) {
    const n = Number(String(muacRaw).replace(/cm/i, '').trim());
    if (Number.isFinite(n)) muac = n;
  }
  return {
    lmp: pickLine(notes, 'LMP'),
    edd: pickLine(notes, 'EDD'),
    gravida: pickLine(notes, 'Gravida'),
    para: pickLine(notes, 'Para'),
    pregnancy_status: pickLine(notes, 'Pregnancy status'),
    gestational_age: pickLine(notes, 'Gestational age'),
    fundal_height: (() => {
      const raw = pickLine(notes, 'Fundal height');
      if (!raw) return null;
      const n = Number(String(raw).replace(/cm/i, '').trim());
      return Number.isFinite(n) ? n : null;
    })(),
    fetal_heart_rate: (() => {
      const raw = pickLine(notes, 'Fetal heart rate');
      if (!raw) return null;
      const n = Number.parseInt(String(raw).replace(/bpm/i, '').trim(), 10);
      return Number.isFinite(n) ? n : null;
    })(),
    fetal_movement: pickLine(notes, 'Fetal movement'),
    muac_cm: muac,
    muac_date: pickLine(notes, 'MUAC date'),
    td_status: pickLine(notes, 'TD status'),
    registration_datetime: pickLine(notes, 'Registration date'),
  };
};

// Structured columns win; notes-parsed values fill the gaps.
export const mergePrenatal = (row = {}) => {
  const legacy = parsePrenatalNotes(row.notes);
  const coalesce = (...vals) => {
    for (const v of vals) {
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    return null;
  };
  return {
    registrationDatetime: coalesce(row.registration_datetime, legacy.registration_datetime, row.created_at),
    lmp: coalesce(row.lmp, legacy.lmp),
    edd: coalesce(row.edd, legacy.edd),
    gravida: coalesce(row.gravida, legacy.gravida),
    para: coalesce(row.para, legacy.para),
    pregnancyStatus: coalesce(row.pregnancy_status, legacy.pregnancy_status),
    gestationalAge: coalesce(row.gestational_age, legacy.gestational_age),
    fundalHeight: coalesce(row.fundal_height, legacy.fundal_height),
    fetalHeartRate: coalesce(row.fetal_heart_rate, legacy.fetal_heart_rate),
    fetalMovement: coalesce(row.fetal_movement, legacy.fetal_movement),
    muac: coalesce(row.muac_cm, legacy.muac_cm),
    muacDate: coalesce(row.muac_date, legacy.muac_date),
    tdStatus: coalesce(row.td_status, legacy.td_status),
    ancWindow: ANC_WINDOW_KEYS.includes(row.anc_window) ? row.anc_window : null,
    isPrivateVisit: Boolean(row.is_private_visit),
  };
};

// Whole weeks between LMP and a visit date (null when unknown).
export const gaWeeks = (lmp, date) => {
  if (!lmp || !date) return null;
  const l = new Date(lmp);
  const d = new Date(date);
  if (Number.isNaN(l.getTime()) || Number.isNaN(d.getTime()) || d < l) return null;
  return Math.floor((d - l) / (1000 * 60 * 60 * 24 * 7));
};

// Map gestational weeks → Excel ANC column J..Q.
export const ancBucketForWeeks = (w) => {
  if (w === null || w === undefined || w < 0) return null;
  if (w <= 12) return 'w1_12';
  if (w <= 20) return 'w13_20';
  if (w <= 26) return 'w21_26';
  if (w <= 30) return 'w27_30';
  if (w <= 34) return 'w31_34';
  if (w <= 36) return 'w35_36';
  if (w <= 38) return 'w37_38';
  return 'w39_40';
};

// True when a Supabase error means the migration hasn't been run yet.
export const isMissingColumnError = (error) => {
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
