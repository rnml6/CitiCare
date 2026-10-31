-- ============================================================
-- ADD: structured postpartum fields on medical_histories so the
-- checkup form can store everything the BHW postpartum report
-- needs (Excel postpartum tab parity).
-- Run ONCE in Supabase SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE medical_histories
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birth_outcome TEXT,
  ADD COLUMN IF NOT EXISTS postnatal_24h DATE,
  ADD COLUMN IF NOT EXISTS postnatal_day3 DATE,
  ADD COLUMN IF NOT EXISTS postnatal_day7_14 DATE,
  ADD COLUMN IF NOT EXISTS postnatal_week6 DATE,
  ADD COLUMN IF NOT EXISTS maternal_death_date DATE,
  ADD COLUMN IF NOT EXISTS neonatal_death_date DATE,
  ADD COLUMN IF NOT EXISTS outcome_details TEXT,
  ADD COLUMN IF NOT EXISTS postpartum_remarks TEXT;

-- Keep birth outcome tags clean when explicitly set.
ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_birth_outcome_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_birth_outcome_check
  CHECK (
    birth_outcome IS NULL OR birth_outcome IN (
      'live', 'preterm', 'stillbirth', 'abortion'
    )
  );
