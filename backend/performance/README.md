# CitiCare Performance Test Suite

Automates the ten performance test cases (TC-PERF-01 … TC-PERF-10) against the
real backend over HTTP.

## What it measures

| Test | Workflow |
|---|---|
| TC-PERF-01 | Create, update, and retrieve a resident with vitals and chronic conditions |
| TC-PERF-02 | Vulnerable-group reports (all / pregnant / senior / infant), prenatal, postpartum, infants, seniors |
| TC-PERF-03 | Barangay general health report |
| TC-PERF-04 | Resident risk score recalculated inside the create/update response |
| TC-PERF-05 | Purok list and per-purok risk scores |
| TC-PERF-06 | Dashboard stats with critical/high-risk residents |
| TC-PERF-07 | Common diseases by purok and monthly trends |
| TC-PERF-08 | Per-purok risk levels (priority puroks) |
| TC-PERF-09 | Residents with missed consultations |
| TC-PERF-10 | AI recommendations for the selected period |

## Method

- Every measured GET is **cache-cold**: a unique `_perf` query parameter
  bypasses the HTTP response cache, and a contact-only resident update clears
  the in-process snapshot cache before the request.
- The **worst** sample is compared with the threshold, not the average.
- The suite creates clearly-labelled `PERF TEST` residents and deletes them in
  a `finally` block. No existing resident is modified or deleted.

## Run it

Start the backend first, then:

```powershell
cd backend
npm run perf
```

Options:

```powershell
node performance/run-performance-tests.mjs --base-url=http://localhost:5000/api --samples=5
node performance/run-performance-tests.mjs --cleanup-stale
```

Authentication uses `PERF_TOKEN` when set, otherwise a temporary admin token is
signed with `JWT_SECRET` from `backend/.env`.

## Output

- `output/performance-test-results.md` — fill-in-ready table for Chapter 4
- `output/performance-test-results.csv` — same table as CSV
- `output/performance-test-results.json` — raw samples and environment details

The script exits with code `1` if any test fails, so it can be used in CI.
