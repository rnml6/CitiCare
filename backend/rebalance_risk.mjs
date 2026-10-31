import dotenv from 'dotenv';
dotenv.config();
import { supabase } from './src/config/supabase.js';
import { calculateCompositeRiskScore } from './src/utils/riskCalculator.js';

const DRY = !process.argv.includes('--apply');
const CRITICAL_PUROKS = new Set([2, 5, 8, 11]);

const fetchAll = async (table, select) => {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
};

const parseCondition = (raw) => {
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return { name: o.name || raw, severity: o.severity || 'Mild' };
    } catch {
      return { name: raw, severity: 'Mild' };
    }
  }
  return { name: raw.name || 'Unknown', severity: raw.severity || 'Mild' };
};

const normalizeVitals = (v) => {
  const base = { ...v };
  base.blood_pressure = '118/76';
  base.blood_sugar = '92';
  base.heart_rate = '76';
  base.temperature = '36.6';
  const h = Number(base.height);
  if (Number.isFinite(h) && h > 0) {
    const w = Math.round(22.4 * ((h / 100) ** 2) * 10) / 10;
    base.weight = String(w);
    base.bmi = String(Math.round((w / ((h / 100) ** 2)) * 10) / 10);
  } else {
    base.bmi = '22.4';
  }
  return base;
};

const scoreOf = (conds, vitals, missed) => calculateCompositeRiskScore({
  age: null, dateOfBirth: null,
  conditions: conds, vitals, missedCheckups: missed,
}).score;

console.log('fetching...');
const residents = await fetchAll('residents', 'resident_id, name, age, gender, date_of_birth, risk_score, risk_level, purok_id, puroks:purok_id (name)');
const conditions = await fetchAll('resident_chronic_conditions', 'condition_id, resident_id, condition_name');
const vitals = await fetchAll('resident_vital_signs', 'resident_id, blood_pressure, blood_sugar, heart_rate, temperature, weight, height, bmi');
const schedules = await fetchAll('schedules', 'resident_id, date, status');

const condBy = new Map();
for (const c of conditions) {
  if (!condBy.has(c.resident_id)) condBy.set(c.resident_id, []);
  condBy.get(c.resident_id).push(c);
}
const vitalsBy = new Map(vitals.map(v => [v.resident_id, v]));

const lastCompleted = new Map();
for (const s of schedules) {
  if (s.status === 'Completed' && s.date && s.resident_id != null) {
    const k = s.resident_id;
    if (!lastCompleted.has(k) || String(s.date) > String(lastCompleted.get(k))) lastCompleted.set(k, String(s.date).slice(0, 10));
  }
}
const missedBy = new Map();
for (const s of schedules) {
  if (s.status !== 'Missed' || s.resident_id == null) continue;
  const lc = lastCompleted.get(s.resident_id);
  const d = String(s.date || '').slice(0, 10);
  if (lc && d <= lc) continue;
  missedBy.set(s.resident_id, (missedBy.get(s.resident_id) || 0) + 1);
}

const rows = residents.map(r => {
  const conds = (condBy.get(r.resident_id) || []).map(c => parseCondition(c.condition_name));
  const v = vitalsBy.get(r.resident_id) || null;
  const missed = missedBy.get(r.resident_id) || 0;
  const risk = calculateCompositeRiskScore({ age: r.age, dateOfBirth: r.date_of_birth, conditions: conds, vitals: v, missedCheckups: missed });
  return { ...r, conds, rawConds: condBy.get(r.resident_id) || [], vitals: v, missed, score: risk.score, level: risk.classification };
});

// ---------------- pick targets: one flagged resident per purok ----------------
const purokNames = [...new Set(residents.map(r => r.puroks?.name))];
const targetIds = new Set();
const targets = [];
for (let p = 1; p <= 12; p++) {
  const purokName = `Purok ${p}`;
  const wantCritical = CRITICAL_PUROKS.has(p);
  const pool = rows.filter(r => r.puroks?.name === purokName && !targetIds.has(r.resident_id));
  let candidates = pool.filter(r => wantCritical ? r.score >= 75 : (r.score >= 55 && r.score <= 71));
  if (candidates.length === 0) candidates = pool.filter(r => wantCritical ? r.score >= 75 : (r.score >= 50 && r.score <= 74));
  if (candidates.length === 0) candidates = pool.filter(r => r.score >= 50);
  candidates.sort((a, b) => {
    if (wantCritical) return (b.score - a.score) || (b.age - a.age);
    return (b.age - a.age) || (a.score - b.score);
  });
  const chosen = candidates[0];
  if (!chosen) { console.log(`Purok ${p}: NO CANDIDATE`); continue; }
  targetIds.add(chosen.resident_id);
  targets.push({ ...chosen, wantCritical });
}

// ---------------- downgrade everyone else >= 50 ----------------
const actions = { sev: 0, mod: 0, remove: 0, vitals: 0, residents: 0 };
const changes = [];
for (const r of rows) {
  if (targetIds.has(r.resident_id)) continue;
  let conds = r.conds.map(c => ({ ...c }));
  let v = r.vitals ? { ...r.vitals } : null;
  let didSev = 0, didMod = 0, didRemove = 0, didVitals = 0;
  let score = calculateCompositeRiskScore({ age: r.age, dateOfBirth: r.date_of_birth, conditions: conds, vitals: v, missedCheckups: r.missed }).score;
  const sevOrder = { Severe: 3, Moderate: 2, Mild: 1 };
  const reduce = (c) => (c.severity === 'Severe' ? 'Moderate' : c.severity === 'Moderate' ? 'Mild' : null);
  while (score >= 50) {
    // 1) reduce highest-severity condition
    const sorted = [...conds].sort((a, b) => (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0));
    const top = sorted[0];
    const next = top ? reduce(top) : null;
    if (top && next) {
      top.severity = next;
      if (next === 'Moderate') didSev++; else didMod++;
    } else if (conds.length > 1) {
      // drop the last condition (lowest severity)
      conds.pop();
      didRemove++;
    } else if (!didVitals) {
      if (v) v = normalizeVitals(v);
      didVitals++;
      // If no vitals row at all, there is nothing more to trim.
      if (!r.vitals) {
        conds = [];
      }
    } else {
      conds = [];
    }
    score = calculateCompositeRiskScore({ age: r.age, dateOfBirth: r.date_of_birth, conditions: conds, vitals: v, missedCheckups: r.missed }).score;
    if (didSev + didMod + didRemove > 20) { conds = []; score = 0; }
  }
  if (didSev || didMod || didRemove || didVitals) {
    actions.sev += didSev; actions.mod += didMod; actions.remove += didRemove; actions.vitals += didVitals; actions.residents++;
    changes.push({ resident: r, conds, vitals: v, score, didSev, didMod, didRemove, didVitals });
  } else if (r.score >= 50) {
    console.log('UNEXPECTED no action for', r.resident_id, r.score);
  }
}

console.log('\n=== TARGETS ===');
for (const t of targets) console.log(`${t.wantCritical ? 'CRITICAL' : 'HIGH    '} purok ${t.puroks?.name} #${t.resident_id} ${t.name} age ${t.age} score ${t.score} conds ${JSON.stringify(t.conds)}`);
console.log('\n=== ACTIONS ===', JSON.stringify(actions));
console.log('changes:', changes.length);
const sample = changes.filter(c => c.didVitals).slice(0, 8).map(c => ({ id: c.resident.resident_id, score: c.resident.score, conds: c.resident.conds, didVitals: c.didVitals, newScore: c.score }));
console.log('vitals-normalized sample:', JSON.stringify(sample, null, 1));
console.log('remove-condition residents:', changes.filter(c => c.didRemove).length);

if (DRY) {
  console.log('\nDRY RUN — nothing written. Pass --apply to persist.');
  process.exit(0);
}

// ---------------- apply ----------------
console.log('\nApplying changes...');
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
let done = 0;
for (const batch of chunk(changes, 10)) {
  await Promise.all(batch.map(async (ch) => {
    const id = ch.resident.resident_id;
    if (ch.didSev || ch.didMod || ch.didRemove) {
      await supabase.from('resident_chronic_conditions').delete().eq('resident_id', id);
      if (ch.conds.length) {
        await supabase.from('resident_chronic_conditions').insert(
          ch.conds.map(c => ({ resident_id: id, condition_name: JSON.stringify({ name: c.name, severity: c.severity }) }))
        );
      }
    }
    if (ch.didVitals && ch.vitals) {
      await supabase.from('resident_vital_signs').update({
        blood_pressure: ch.vitals.blood_pressure,
        blood_sugar: ch.vitals.blood_sugar,
        heart_rate: ch.vitals.heart_rate,
        temperature: ch.vitals.temperature,
        weight: ch.vitals.weight,
        height: ch.vitals.height,
        bmi: ch.vitals.bmi,
      }).eq('resident_id', id);
    }
    const final = calculateCompositeRiskScore({ age: ch.resident.age, dateOfBirth: ch.resident.date_of_birth, conditions: ch.conds, vitals: ch.vitals, missedCheckups: ch.resident.missed });
    await supabase.from('residents').update({ risk_score: final.score, risk_level: final.classification }).eq('resident_id', id);
    done++;
  }));
  if (done % 50 < 10) console.log(`  ${done}/${changes.length}`);
}
console.log(`Applied ${done} resident downgrades.`);

// targets keep their data; just make sure cache matches live
for (const t of targets) {
  const final = calculateCompositeRiskScore({ age: t.age, dateOfBirth: t.date_of_birth, conditions: t.conds, vitals: t.vitals, missedCheckups: t.missed });
  await supabase.from('residents').update({ risk_score: final.score, risk_level: final.classification }).eq('resident_id', t.resident_id);
}
console.log('Target caches aligned.');
