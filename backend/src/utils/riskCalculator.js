// utils/riskCalculator.js
// Centralized Resident Health Risk Scoring Module
// Composite score 0–100 across four risk factors.

// ============================================
// 1. AGE SCORE — Maximum 15 Points
// ============================================
export const calculateAgeScore = (age) => {
  if (age == null || age < 0) return 0;
  if (age <= 14) return 4;
  if (age <= 19) return 2;
  if (age <= 39) return 4;
  if (age <= 49) return 8;
  if (age <= 59) return 11;
  return 15;
};

export const getAgeGroup = (age) => {
  if (age == null || age < 0) return 'Unknown';
  if (age <= 14) return '0–14 years old';
  if (age <= 19) return '15–19 years old';
  if (age <= 39) return '20–39 years old';
  if (age <= 49) return '40–49 years old';
  if (age <= 59) return '50–59 years old';
  return '60 years old and above';
};

// ============================================
// 2. CHRONIC CONDITION SCORE — Maximum 100 Points
// (realistic full-value sum: each DISTINCT condition contributes its
// full severity value — Mild 15 / Moderate 30 / Severe 50 — capped at
// 100, so multimorbidity escalates realistically, e.g.
// Severe + Mild = 50 + 15 = 65)
// ============================================
// Chronic conditions only ever carry three severities (Mild / Moderate /
// Severe — the only options in the UI). Anything unrecognized falls back
// to a neutral score so it can never inflate or sink a resident's risk.
// Plain strings (no severity info) default to Mild, following what was inputted.
const SEVERITY_SCORES = {
  mild: 15,
  moderate: 30,
  severe: 50,
};

export const calculateChronicConditionScore = (conditions) => {
  if (!conditions || conditions.length === 0) return { score: 0, details: [] };

  const parsed = conditions.map((c) => {
    if (typeof c === 'string') {
      try {
        const obj = JSON.parse(c);
        return { name: obj.name || c, severity: obj.severity || 'Mild' };
      } catch {
        return { name: c, severity: 'Mild' };
      }
    }
    return { name: c.name || 'Unknown', severity: c.severity || 'Mild' };
  });

  // Dedupe overlapping entries: same condition recorded twice (e.g. duplicate
  // rows or "Hypertension" + "hypertension") counts once — keep highest severity.
  const scoreOf = sev => SEVERITY_SCORES[String(sev || '').toLowerCase()] ?? 10;
  const byName = new Map();
  for (const c of parsed) {
    const key = String(c.name || '').trim().toLowerCase();
    const cur = byName.get(key);
    if (!cur || scoreOf(c.severity) > scoreOf(cur.severity)) byName.set(key, c);
  }
  const unique = [...byName.values()];

  // Sort by severity descending (severe > moderate > mild)
  const severityOrder = { severe: 3, moderate: 2, mild: 1 };
  const orderOf = sev => severityOrder[String(sev || '').toLowerCase()] ?? 0;
  unique.sort((a, b) => orderOf(b.severity) - orderOf(a.severity));

  const highest = unique[0];

  // Realistic full-value sum: follow what was inputted — each DISTINCT
  // condition adds its full severity value (15/30/50, unknown fallback 10).
  // Many diseases therefore naturally reach the 100 cap.
  let totalScore = 0;
  for (const c of unique) {
    totalScore += SEVERITY_SCORES[String(c.severity || '').toLowerCase()] ?? 10;
  }

  // Chronic scales with disease burden up to 100: sum of full severity
  // values (15/30/50 per condition), capped at 100 (the composite total
  // is still capped at 100).
  totalScore = Math.min(totalScore, 100);

  const severeCount = unique.filter(
    c => String(c.severity || '').toLowerCase() === 'severe'
  ).length;

  return {
    score: totalScore,
    details: unique.map((c) => ({
      name: c.name,
      severity: c.severity,
    })),
    highestSeverity: highest.severity,
    conditionCount: unique.length,
    severeCount,
  };
};

// ============================================
// 3. VITAL SIGN SCORE — Maximum 30 Points
// ============================================

// Blood Pressure — Maximum 8 points
const scoreBloodPressure = (bp) => {
  if (!bp || typeof bp !== 'string') return { score: 0, label: null };
  const parts = bp.split('/');
  const sys = parseInt(parts[0], 10);
  const dia = parseInt(parts[1], 10);
  if (isNaN(sys) || isNaN(dia)) return { score: 0, label: null };

  if (sys >= 160 || dia >= 100) return { score: 8, label: 'Hypertensive (≥160/100)' };
  if (sys >= 140 || dia >= 90) return { score: 4, label: 'Elevated (140–159/90–99)' };
  return { score: 0, label: null };
};

// Fasting Blood Sugar — Maximum 8 points
const scoreFBS = (fbs) => {
  if (fbs == null) return { score: 0, label: null };
  const val = Number(fbs);
  if (isNaN(val)) return { score: 0, label: null };

  if (val >= 126) return { score: 8, label: 'Impaired fasting blood sugar (≥126 mg/dL)' };
  if (val >= 100) return { score: 4, label: 'Borderline fasting blood sugar (100–125 mg/dL)' };
  return { score: 0, label: null };
};

// BMI — Maximum 6 points
const scoreBMI = (bmi, weight, height) => {
  let val = Number(bmi);
  // Calculate BMI if not provided but weight/height are
  if (isNaN(val) && weight && height) {
    const w = Number(weight);
    const h = Number(height);
    if (w > 0 && h > 0) {
      val = w / ((h / 100) * (h / 100));
    }
  }
  if (isNaN(val)) return { score: 0, label: null };

  if (val >= 25.0) return { score: 6, label: 'Increased BMI (≥25.0)' };
  if (val >= 23.0) return { score: 3, label: 'Increased BMI (23.0–24.9)' };
  return { score: 0, label: null };
};

// Heart Rate — Maximum 4 points
const scoreHeartRate = (hr) => {
  if (hr == null) return { score: 0, label: null };
  const val = Number(hr);
  if (isNaN(val)) return { score: 0, label: null };

  if (val < 60 || val > 100) return { score: 4, label: 'Heart rate outside normal range' };
  return { score: 0, label: null };
};

// Temperature — Maximum 4 points
const scoreTemperature = (temp) => {
  if (temp == null) return { score: 0, label: null };
  const val = Number(temp);
  if (isNaN(val)) return { score: 0, label: null };

  if (val > 37.5 || val < 35.0) return { score: 4, label: 'Abnormal temperature' };
  return { score: 0, label: null };
};

export const calculateVitalSignScore = (vitals) => {
  if (!vitals) return { score: 0, labels: [], details: {} };

  const bp = scoreBloodPressure(vitals.blood_pressure || vitals.bloodPressure);
  const fbs = scoreFBS(vitals.blood_sugar || vitals.bloodSugar);
  const bmi = scoreBMI(
    vitals.bmi,
    vitals.weight,
    vitals.height
  );
  const hr = scoreHeartRate(vitals.heart_rate || vitals.heartRate);
  const temp = scoreTemperature(vitals.temperature);

  const totalScore = bp.score + fbs.score + bmi.score + hr.score + temp.score;
  const labels = [bp.label, fbs.label, bmi.label, hr.label, temp.label].filter(Boolean);

  return {
    score: Math.min(totalScore, 30),
    labels,
    details: {
      bloodPressure: { score: bp.score, max: 8, label: bp.label },
      bloodSugar: { score: fbs.score, max: 8, label: fbs.label },
      bmi: { score: bmi.score, max: 6, label: bmi.label },
      heartRate: { score: hr.score, max: 4, label: hr.label },
      temperature: { score: temp.score, max: 4, label: temp.label },
    },
  };
};

// ============================================
// 4. HEALTH SERVICE ADHERENCE — Maximum 10 Points
// ============================================
export const calculateAdherenceScore = (missedCheckups) => {
  const missed = missedCheckups || 0;
  if (missed === 0) return { score: 0, missedCheckups: 0 };
  if (missed === 1) return { score: 3, missedCheckups: missed };
  if (missed <= 3) return { score: 6, missedCheckups: missed };
  return { score: 10, missedCheckups: missed };
};

// ============================================
// 5. COMPOSITE RISK SCORE — Maximum 100 Points
// ============================================
export const calculateCompositeRiskScore = ({
  age,
  dateOfBirth,
  conditions,
  vitals,
  missedCheckups,
}) => {
  // Determine age from date_of_birth if available
  let computedAge = age;
  if (dateOfBirth) {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    computedAge = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      computedAge--;
    }
  }

  const ageResult = calculateAgeScore(computedAge);
  const conditionResult = calculateChronicConditionScore(conditions);
  const vitalResult = calculateVitalSignScore(vitals);
  const adherenceResult = calculateAdherenceScore(missedCheckups);

  let totalScore = Math.min(
    ageResult + conditionResult.score + vitalResult.score + adherenceResult.score,
    100
  );

  // Clinical escalation: two or more DISTINCT severe chronic conditions is
  // itself a critical-risk profile (severe multimorbidity), regardless of
  // what the additive points total. The resident is floored at 75 so they
  // are always prioritized for immediate follow-up.
  const severeMultimorbidity = (conditionResult.severeCount || 0) >= 2;
  if (severeMultimorbidity && totalScore < 75) totalScore = 75;

  const classification = getRiskClassification(totalScore);

  // Collect contributing factors
  const contributingFactors = [];
  if (ageResult > 0) contributingFactors.push(`Age group: ${getAgeGroup(computedAge)}`);
  if (conditionResult.highestSeverity) {
    if (severeMultimorbidity) {
      contributingFactors.push('Multiple severe chronic conditions — automatic critical priority');
    } else if (conditionResult.conditionCount >= 2) {
      contributingFactors.push('Multiple chronic conditions');
    }
    contributingFactors.push(`Chronic condition: ${conditionResult.highestSeverity}`);
  }
  vitalResult.labels.forEach((l) => contributingFactors.push(l));
  if (adherenceResult.missedCheckups > 0) {
    contributingFactors.push(
      `${adherenceResult.missedCheckups} missed checkup${adherenceResult.missedCheckups > 1 ? 's' : ''}`
    );
  }

  return {
    score: totalScore,
    classification,
    breakdown: {
      age: { score: ageResult, max: 15 },
      chronicConditions: { score: conditionResult.score, max: 100, ...conditionResult },
      vitalSigns: { score: vitalResult.score, max: 30, labels: vitalResult.labels, details: vitalResult.details },
      adherence: { score: adherenceResult.score, max: 10, missedCheckups: adherenceResult.missedCheckups },
      escalation: severeMultimorbidity
        ? { applied: true, reason: '2+ severe chronic conditions', minimumScore: 75 }
        : { applied: false },
    },
    contributingFactors,
  };
};

// ============================================
// 6. RISK CLASSIFICATION
// ============================================
export const getRiskClassification = (score) => {
  if (score >= 75) return 'Critical Risk';
  if (score >= 50) return 'High Risk';
  if (score >= 25) return 'Moderate Risk';
  return 'Low Risk';
};
