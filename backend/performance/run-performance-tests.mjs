// performance/run-performance-tests.mjs
// ---------------------------------------------------------------------------
// Executable performance test suite for the CitiCare performance test cases
// (TC-PERF-01 ... TC-PERF-10).
//
// It drives the REAL backend over HTTP. Every measurement is intentionally
// cache-cold:
//   * a unique `_perf` query parameter bypasses the HTTP response cache, and
//   * a contact-only resident update clears the in-process snapshot cache
//     before each measured request (writes invalidate the cache by design).
//
// Usage (backend server must be running):
//   node performance/run-performance-tests.mjs
//   node performance/run-performance-tests.mjs --base-url=http://localhost:5000/api
//   node performance/run-performance-tests.mjs --samples=5
//
// Authentication: uses PERF_TOKEN when provided, otherwise signs a temporary
// admin token with JWT_SECRET from backend/.env (same secret the server uses).
//
// The only writes are clearly labelled "PERF TEST" residents created for
// TC-PERF-01/04; they are deleted in a finally block (and on the next run if a
// previous run crashed, via --cleanup-stale).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = (arg('base-url', process.env.PERF_API_URL || 'http://localhost:5000/api')).replace(/\/$/, '');
const SAMPLES = Math.max(1, Number(arg('samples', 3)));
const CLEAN_STALE = argv.includes('--cleanup-stale');
const TEST_TAG = 'PERF TEST';

const token = process.env.PERF_TOKEN || (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('PERF_TOKEN or JWT_SECRET must be set (run from the backend directory).');
  }
  return jwt.sign(
    { userId: 1, email: 'admin@citicare.demo', role: 'Administrator', bhwId: null },
    secret,
    { expiresIn: '3h' },
  );
})();

let requestCounter = 0;
const createdResidentIds = [];

const request = async (method, endpoint, { body, cacheBust = false, timeoutMs = 30000 } = {}) => {
  const url = new URL(`${BASE}${endpoint}`);
  if (cacheBust) url.searchParams.set('_perf', `${Date.now()}-${requestCounter++}`);
  const started = performance.now();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ms, cache: res.headers.get('x-cache'), size: text.length, json, text };
};

const stats = (samples) => {
  if (!samples.length) return { n: 0, min: 0, median: 0, p95: 0, max: 0, avg: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  return {
    n: sorted.length,
    min: sorted[0],
    median: pick(0.5),
    p95: pick(0.95),
    max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
};

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);
const fmtStats = (s) => `${fmt(s.median)} median (${fmt(s.min)}–${fmt(s.max)}, n=${s.n})`;

// A successful write clears the server's in-process caches. Updating just the
// contact number does not touch risk data (riskDirty stays false), so it is a
// cheap, non-destructive cache flush.
let anchorId = null;
const invalidateCache = async () => {
  if (!anchorId) return;
  await request('PUT', `/residents/${anchorId}`, { body: { contactNumber: '09170000000' } });
};

const measure = async (endpoint, { samples = SAMPLES, prepare } = {}) => {
  const times = [];
  const statuses = [];
  const caches = [];
  let last = null;
  for (let i = 0; i < samples; i++) {
    if (prepare) await prepare();
    else await invalidateCache();
    const r = await request('GET', endpoint, { cacheBust: true });
    times.push(r.ms);
    statuses.push(r.status);
    caches.push(r.cache);
    last = r;
  }
  return { stats: stats(times), statuses, caches, last };
};

const makeResidentPayload = (purokId, overrides = {}) => ({
  name: `${TEST_TAG} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`,
  dateOfBirth: '1981-06-15',
  age: 45,
  gender: 'Female',
  civilStatus: 'Married',
  purokId,
  contactNumber: '09170000001',
  contactPerson: 'Perf Contact',
  contactPersonNumber: '09170000002',
  contactPersonAddress: 'Perf Address',
  focusGroups: [],
  isPwd: false,
  vitalSigns: {
    bloodPressure: '118/76',
    heartRate: 72,
    temperature: 36.6,
    weight: 60,
    height: 158,
    bloodSugar: 92,
  },
  chronicConditions: [{ name: 'Mild Allergy', severity: 'Mild' }],
  currentMedications: [],
  allergies: { drugs: [], food: [], environmental: [] },
  ...overrides,
});

const criticalUpdate = {
  vitalSigns: {
    bloodPressure: '172/108',
    heartRate: 112,
    temperature: 38.6,
    weight: 57,
    height: 158,
    bloodSugar: 168,
  },
  chronicConditions: [
    { name: 'Hypertension', severity: 'Severe' },
    { name: 'Type 2 Diabetes', severity: 'Severe' },
  ],
};

const deleteResident = async (id) => {
  if (!id) return;
  try { await request('DELETE', `/residents/${id}`); } catch { /* best effort */ }
  const i = createdResidentIds.indexOf(id);
  if (i >= 0) createdResidentIds.splice(i, 1);
};

const results = [];
const record = (id, description, expected, actual, pass, details = {}) => {
  results.push({ id, description, expected, actual, status: pass ? 'PASS' : 'FAIL', details });
};

const main = async () => {
  console.log(`CitiCare performance suite`);
  console.log(`API: ${BASE}`);
  console.log(`Samples per measurement: ${SAMPLES}`);
  console.log('');

  // ---- environment / dataset -------------------------------------------------
  const health = await request('GET', '/../health').catch(() => null);
  const puroksRes = await request('GET', '/puroks', { cacheBust: true });
  const statsRes = await request('GET', '/dashboard/stats', { cacheBust: true });
  const purokId = puroksRes.json?.data?.[0]?.id;
  if (!purokId) throw new Error('No puroks found — seed the database before running performance tests.');
  const dataset = {
    totalResidents: statsRes.json?.data?.totalResidents ?? null,
    totalPuroks: puroksRes.json?.data?.length ?? null,
    health: health?.status ?? null,
  };
  console.log(`Dataset: ${dataset.totalResidents} residents across ${dataset.totalPuroks} puroks`);
  console.log('');

  // ---- setup: optional cleanup of rows left by a crashed previous run -------
  if (CLEAN_STALE) {
    const list = await request('GET', '/residents?search=PERF%20TEST', { cacheBust: true });
    for (const r of (list.json?.data || [])) {
      if (String(r.name || '').startsWith(TEST_TAG)) {
        try { await request('DELETE', `/residents/${r.id}`); } catch { /* ignore */ }
      }
    }
  }

  // ---- setup: anchor resident used for cache invalidation --------------------
  const anchorRes = await request('POST', '/residents', { body: makeResidentPayload(purokId) });
  if (anchorRes.status !== 201 || !anchorRes.json?.data?.id) {
    throw new Error(`Could not create the performance anchor resident (HTTP ${anchorRes.status}).`);
  }
  anchorId = anchorRes.json.data.id;
  createdResidentIds.push(anchorId);

  try {
    // ======================================================================
    // TC-PERF-01 — save, update, retrieve resident health information (<2 s)
    // ======================================================================
    const createTimes = [];
    const updateTimes = [];
    const getTimes = [];
    const riskPairs = [];
    let tc01Ok = true;
    let tc01Detail = '';

    for (let i = 0; i < SAMPLES; i++) {
      const created = await request('POST', '/residents', { body: makeResidentPayload(purokId) });
      if (created.status !== 201 || !created.json?.data?.id) {
        tc01Ok = false;
        tc01Detail = `create returned HTTP ${created.status}`;
        break;
      }
      const id = created.json.data.id;
      createdResidentIds.push(id);
      createTimes.push(created.ms);

      const updated = await request('PUT', `/residents/${id}`, { body: criticalUpdate });
      if (updated.status !== 200) {
        tc01Ok = false;
        tc01Detail = `update returned HTTP ${updated.status}`;
        break;
      }
      updateTimes.push(updated.ms);

      const fetched = await request('GET', `/residents/${id}`, { cacheBust: true });
      if (fetched.status !== 200) {
        tc01Ok = false;
        tc01Detail = `retrieve returned HTTP ${fetched.status}`;
        break;
      }
      getTimes.push(fetched.ms);
      riskPairs.push({
        before: created.json?.data?.riskScore ?? null,
        after: updated.json?.data?.riskScore ?? null,
      });
    }

    const createStats = stats(createTimes);
    const updateStats = stats(updateTimes);
    const getStats = stats(getTimes);
    const worst01 = Math.max(createStats.max, updateStats.max, getStats.max);
    const pass01 = tc01Ok && worst01 <= 2000;
    record(
      'TC-PERF-01',
      "Check how quickly the system saves, updates, and retrieves residents' health information.",
      'Resident health information is saved, updated, and retrieved within 2 seconds.',
      `Save ${fmtStats(createStats)}; update ${fmtStats(updateStats)}; retrieve ${fmtStats(getStats)}. Worst ${fmt(worst01)}.`
        + (tc01Detail ? ` (${tc01Detail})` : ''),
      pass01,
      { create: createStats, update: updateStats, retrieve: getStats, samples: { createTimes, updateTimes, getTimes } },
    );

    // ======================================================================
    // TC-PERF-04 — resident risk score calculated/updated (<3 s)
    // Uses the same save/update requests: both persist a recalculated score
    // before responding.
    // ======================================================================
    const scoreChanged = riskPairs.some(
      (p) => p.after != null && p.before != null && Number(p.after) > Number(p.before),
    );
    const worst04 = Math.max(createStats.max, updateStats.max);
    const pass04 = tc01Ok && scoreChanged && worst04 <= 3000;
    record(
      'TC-PERF-04',
      "Check how quickly the system calculates a resident's health risk score.",
      "The resident's health risk score is calculated and updated within 3 seconds after the required information is saved.",
      `Risk recalculated inside the save request: ${fmt(createStats.median)} save / ${fmt(updateStats.median)} update. `
        + `Score before ${riskPairs[0]?.before ?? 'n/a'} → after ${riskPairs[0]?.after ?? 'n/a'}. Worst ${fmt(worst04)}.`,
      pass04,
      { worst: worst04, scoreChanged, riskPairs },
    );

    // ======================================================================
    // TC-PERF-02 — vulnerable resident group reports (<5 s)
    // ======================================================================
    const vulnerableEndpoints = [
      '/dashboard/vulnerable-groups?group=all',
      '/dashboard/vulnerable-groups?group=pregnant',
      '/dashboard/vulnerable-groups?group=senior',
      '/dashboard/vulnerable-groups?group=infant',
      '/dashboard/prenatal-report',
      '/dashboard/postpartum-report',
      '/dashboard/infants-vaccination-report',
      '/dashboard/seniors-report',
    ];
    const vulnerable = [];
    for (const endpoint of vulnerableEndpoints) {
      const m = await measure(endpoint, { samples: Math.min(SAMPLES, 2) });
      vulnerable.push({ endpoint, ...m });
    }
    const worst02 = Math.max(...vulnerable.map((v) => v.stats.max));
    const pass02 = worst02 <= 5000 && vulnerable.every((v) => v.statuses.every((s) => s === 200));
    record(
      'TC-PERF-02',
      'Check how quickly the system generates reports for vulnerable resident groups.',
      'The health report is generated and displayed within 5 seconds.',
      `Slowest vulnerable-group report ${fmt(worst02)} (${vulnerable.reduce((a, v) => (v.stats.max > a.stats.max ? v : a)).endpoint}). `
        + `All ${vulnerable.length} reports returned HTTP 200.`,
      pass02,
      { endpoints: vulnerable.map((v) => ({ endpoint: v.endpoint, stats: v.stats, statuses: v.statuses })) },
    );

    // ======================================================================
    // TC-PERF-03 — barangay health report (<5 s)
    // ======================================================================
    const barangay = await measure('/dashboard/general-health-report');
    const pass03 = barangay.stats.max <= 5000 && barangay.statuses.every((s) => s === 200);
    record(
      'TC-PERF-03',
      'Check how quickly the system generates reports showing health report in the barangay.',
      'The barangay health report is generated and displayed within 5 seconds.',
      `${fmtStats(barangay.stats)}; ${(barangay.last.size / 1024).toFixed(0)} kB response, HTTP ${barangay.statuses.join('/')}.`,
      pass03,
      { stats: barangay.stats, statuses: barangay.statuses, bytes: barangay.last.size },
    );

    // ======================================================================
    // TC-PERF-05 — purok health risk score (<3 s)
    // ======================================================================
    const purokList = await measure('/puroks');
    const purokRisk = await measure('/dashboard/risk-distribution-by-purok');
    const worst05 = Math.max(purokList.stats.max, purokRisk.stats.max);
    const pass05 = worst05 <= 3000 && purokList.statuses.every((s) => s === 200) && purokRisk.statuses.every((s) => s === 200);
    record(
      'TC-PERF-05',
      "Check how quickly the system calculates a purok's health risk score.",
      'The purok health risk score is calculated and updated within 3 seconds.',
      `Purok list ${fmtStats(purokList.stats)}; per-purok risk ${fmtStats(purokRisk.stats)}. Worst ${fmt(worst05)}.`,
      pass05,
      { purokList: purokList.stats, purokRisk: purokRisk.stats },
    );

    // ======================================================================
    // TC-PERF-06 — residents needing immediate intervention (<3 s)
    // ======================================================================
    const interventions = await measure('/dashboard/stats');
    const d06 = interventions.last.json?.data || {};
    const hasInterventionLists = Array.isArray(d06.criticalResidents) && Array.isArray(d06.highRiskResidents);
    const pass06 = interventions.stats.max <= 3000 && interventions.statuses.every((s) => s === 200) && hasInterventionLists;
    record(
      'TC-PERF-06',
      'Check how quickly the system identifies residents who need immediate health intervention.',
      'Residents who need immediate health intervention are identified and displayed within 3 seconds.',
      `${fmtStats(interventions.stats)}; ${d06.criticalCount ?? 0} critical + ${d06.highCount ?? 0} high-risk residents returned.`,
      pass06,
      { stats: interventions.stats, criticalCount: d06.criticalCount ?? null, highCount: d06.highCount ?? null },
    );

    // ======================================================================
    // TC-PERF-07 — disease trends across puroks (<5 s)
    // ======================================================================
    const common = await measure('/dashboard/common-diseases');
    const trends = await measure('/dashboard/monthly-trends');
    const worst07 = Math.max(common.stats.max, trends.stats.max);
    const total07 = common.stats.median + trends.stats.median;
    const byPurok = common.last.json?.data?.byPurok;
    const pass07 = worst07 <= 5000 && common.statuses.every((s) => s === 200)
      && trends.statuses.every((s) => s === 200) && byPurok && Object.keys(byPurok).length > 0;
    record(
      'TC-PERF-07',
      'Check how quickly the system analyzes disease trends across puroks.',
      'The system displays disease trends and identifies prevalent or emerging diseases within 5 seconds.',
      `Common diseases ${fmtStats(common.stats)}; monthly trends ${fmtStats(trends.stats)}; combined median ${fmt(total07)}. `
        + `Trend data for ${byPurok ? Object.keys(byPurok).length : 0} puroks.`,
      pass07,
      { common: common.stats, trends: trends.stats, combinedMedian: total07 },
    );

    // ======================================================================
    // TC-PERF-08 — priority puroks (<5 s)
    // ======================================================================
    const priority = await measure('/dashboard/risk-distribution-by-purok');
    const purokRows = priority.last.json?.data || [];
    const hasRiskLevels = Array.isArray(purokRows) && purokRows.length > 0
      && purokRows.every((p) => typeof p.riskLevel === 'string' && p.riskLevel.length > 0);
    const pass08 = priority.stats.max <= 5000 && priority.statuses.every((s) => s === 200) && hasRiskLevels;
    record(
      'TC-PERF-08',
      'Check how quickly the system identifies priority puroks.',
      'Priority puroks are identified and displayed within 5 seconds.',
      `${fmtStats(priority.stats)}; ${purokRows.length} puroks returned with risk levels.`,
      pass08,
      { stats: priority.stats, purokCount: purokRows.length },
    );

    // ======================================================================
    // TC-PERF-09 — missed consultations (<3 s)
    // ======================================================================
    const missed = await measure('/dashboard/missed-consultations');
    const missedRows = missed.last.json?.data;
    const pass09 = missed.stats.max <= 3000 && missed.statuses.every((s) => s === 200) && Array.isArray(missedRows);
    record(
      'TC-PERF-09',
      'Check how quickly the system identifies residents who missed scheduled health consultations.',
      'Residents with missed health consultations are identified and displayed within 3 seconds.',
      `${fmtStats(missed.stats)}; ${Array.isArray(missedRows) ? missedRows.length : 0} residents with missed consultations returned.`,
      pass09,
      { stats: missed.stats, residents: Array.isArray(missedRows) ? missedRows.length : null },
    );

    // ======================================================================
    // TC-PERF-10 — AI recommendations (<5 s)
    // ======================================================================
    const ai = await measure('/dashboard/ai-recommendation?period=monthly', { samples: Math.min(SAMPLES, 2) });
    const aiData = ai.last.json?.data || {};
    const pass10 = ai.stats.max <= 5000 && ai.statuses.every((s) => s === 200) && Boolean(aiData.summary);
    record(
      'TC-PERF-10',
      'Check how quickly the system generates AI recommendations according to the selected schedule.',
      'AI recommendations are generated and displayed within 5 seconds when the scheduled process runs.',
      `${fmtStats(ai.stats)}; model=${aiData.modelUsed || 'n/a'}; ${(aiData.recommendations || []).length} recommendations, `
        + `${(aiData.priorityResidents?.recommendations || []).length} priority residents.`,
      pass10,
      {
        stats: ai.stats,
        modelUsed: aiData.modelUsed ?? null,
        recommendations: (aiData.recommendations || []).length,
        priorityResidents: (aiData.priorityResidents?.recommendations || []).length,
      },
    );
  } finally {
    for (const id of [...createdResidentIds]) await deleteResident(id);
  }

  // ---- output ---------------------------------------------------------------
  const orderedResults = [...results].sort((a, b) => a.id.localeCompare(b.id));
  const passed = orderedResults.filter((r) => r.status === 'PASS').length;
  const failed = orderedResults.length - passed;
  const generatedAt = new Date().toISOString();

  console.log('');
  console.log('='.repeat(110));
  console.log(`RESULTS: ${passed}/${orderedResults.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  console.log('='.repeat(110));
  for (const r of orderedResults) {
    console.log(`${r.status === 'PASS' ? 'PASS' : 'FAIL'}  ${r.id}  ${r.actual}`);
  }

  const payload = {
    generatedAt,
    environment: {
      baseUrl: BASE,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      dataset,
      samplesPerMeasurement: SAMPLES,
      cachePolicy: 'cache-cold: unique query parameter + in-process cache flush before every measured request',
    },
    summary: { total: orderedResults.length, passed, failed },
    results: orderedResults,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'performance-test-results.json'), JSON.stringify(payload, null, 2));

  const esc = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '# CitiCare Performance Test Results',
    '',
    `**Generated:** ${generatedAt}`,
    `**Environment:** Node ${process.version} on ${process.platform} ${process.arch}`,
    `**API:** ${BASE}`,
    `**Dataset:** ${dataset.totalResidents} residents across ${dataset.totalPuroks} puroks`,
    `**Method:** every measured request was cache-cold (unique query parameter plus an in-process cache flush). `
      + `${SAMPLES} sample(s) per measurement; the **worst** sample is compared with the threshold.`,
    '',
    `## Summary: ${passed}/${orderedResults.length} passed${failed ? ` — ${failed} failed` : ''}`,
    '',
    '| Test Case ID | Description | Expected Result | Actual Result | Status |',
    '|---|---|---|---|---|',
    ...orderedResults.map((r) => `| ${esc(r.id)} | ${esc(r.description)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.status === 'PASS' ? '☑ Pass' : '☐ Fail'} |`),
    '',
    '## Notes',
    '',
    '- Times are worst-case uncached backend latency on the seeded 3,651-resident dataset. '
      + 'Normal navigation inside the app is faster because successful reads are served from the in-process response cache (typically 2–15 ms).',
    '- TC-PERF-10: the endpoint enforces a 4.3-second model deadline and falls back to its built-in rule-based generator, '
      + 'so a slow or unavailable AI provider can never push the response past 5 seconds.',
    '',
    '## Detailed measurements',
    '',
  ];
  for (const r of orderedResults) {
    md.push(`### ${r.id} — ${r.status}`, '', r.actual, '');
    for (const [key, value] of Object.entries(r.details)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'median' in value) {
        md.push(`- ${key}: ${fmtStats(value)}`);
      }
    }
    md.push('');
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'performance-test-results.md'), md.join('\n'));

  const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    ['Test Case ID', 'Description', 'Expected Result', 'Actual Result', 'Status'].map(csvCell).join(','),
    ...orderedResults.map((r) => [
      r.id, r.description, r.expected, r.actual, r.status === 'PASS' ? 'Pass' : 'Fail',
    ].map(csvCell).join(',')),
  ].join('\r\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'performance-test-results.csv'), csv);

  console.log('');
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'performance-test-results.md')}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'performance-test-results.json')}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'performance-test-results.csv')}`);

  if (failed > 0) process.exitCode = 1;
};

main().catch(async (error) => {
  console.error('Performance suite failed:', error);
  for (const id of [...createdResidentIds]) await deleteResident(id);
  process.exitCode = 1;
});
