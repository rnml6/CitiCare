-- ============================================================
-- ADD: structured prenatal fields on medical_histories so the
-- Prenatal Checkup form can store everything the BHW prenatal
-- report needs (Excel prenatal tab parity, minus income/signature).
-- Run ONCE in Supabase SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE medical_histories
  ADD COLUMN IF NOT EXISTS registration_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lmp DATE,
  ADD COLUMN IF NOT EXISTS edd DATE,
  ADD COLUMN IF NOT EXISTS gravida INT,
  ADD COLUMN IF NOT EXISTS para INT,
  ADD COLUMN IF NOT EXISTS pregnancy_status TEXT,
  ADD COLUMN IF NOT EXISTS gestational_age TEXT,
  ADD COLUMN IF NOT EXISTS fundal_height NUMERIC,
  ADD COLUMN IF NOT EXISTS fetal_heart_rate INT,
  ADD COLUMN IF NOT EXISTS fetal_movement TEXT,
  ADD COLUMN IF NOT EXISTS muac_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS muac_date DATE,
  ADD COLUMN IF NOT EXISTS td_status TEXT,
  ADD COLUMN IF NOT EXISTS anc_window TEXT,
  ADD COLUMN IF NOT EXISTS is_private_visit BOOLEAN DEFAULT FALSE;

-- Keep ANC window tags clean when explicitly set.
ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_anc_window_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_anc_window_check
  CHECK (
    anc_window IS NULL OR anc_window IN (
      'w1_12', 'w13_20', 'w21_26', 'w27_30',
      'w31_34', 'w35_36', 'w37_38', 'w39_40'
    )
  );

CREATE INDEX IF NOT EXISTS idx_medical_histories_resident_type_date
  ON medical_histories (resident_id, type, date);
