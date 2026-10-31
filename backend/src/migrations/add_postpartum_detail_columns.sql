-- ============================================================
-- ADD: detailed postpartum columns on medical_histories so the
-- Postpartum Checkup form captures the full clinical encounter
-- (delivery details, mother + newborn exam, civil registry).
-- Run ONCE in Supabase SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE medical_histories
  ADD COLUMN IF NOT EXISTS delivery_place TEXT,
  ADD COLUMN IF NOT EXISTS birth_attendant TEXT,
  ADD COLUMN IF NOT EXISTS birth_attendant_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT,
  ADD COLUMN IF NOT EXISTS baby_name TEXT,
  ADD COLUMN IF NOT EXISTS baby_gender TEXT,
  ADD COLUMN IF NOT EXISTS checkup_date DATE,
  ADD COLUMN IF NOT EXISTS mother_bp TEXT,
  ADD COLUMN IF NOT EXISTS mother_temp NUMERIC,
  ADD COLUMN IF NOT EXISTS lochia TEXT,
  ADD COLUMN IF NOT EXISTS wound_condition TEXT,
  ADD COLUMN IF NOT EXISTS breastfeeding_status TEXT,
  ADD COLUMN IF NOT EXISTS baby_weight TEXT,
  ADD COLUMN IF NOT EXISTS baby_temp NUMERIC,
  ADD COLUMN IF NOT EXISTS baby_feeding_status TEXT,
  ADD COLUMN IF NOT EXISTS jaundice TEXT,
  ADD COLUMN IF NOT EXISTS cord_condition TEXT,
  ADD COLUMN IF NOT EXISTS newborn_danger_signs TEXT,
  ADD COLUMN IF NOT EXISTS stillbirth_reg_date DATE,
  ADD COLUMN IF NOT EXISTS spouse_name TEXT;

-- Keep coded values clean when explicitly set.
ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_birth_attendant_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_birth_attendant_check
  CHECK (birth_attendant IS NULL OR birth_attendant IN ('Doctor', 'Midwife', 'Nurse', 'Other'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_delivery_mode_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_delivery_mode_check
  CHECK (delivery_mode IS NULL OR delivery_mode IN ('Vaginal/Normal', 'Cesarean Section'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_baby_gender_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_baby_gender_check
  CHECK (baby_gender IS NULL OR baby_gender IN ('Male', 'Female'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_lochia_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_lochia_check
  CHECK (lochia IS NULL OR lochia IN ('Normal', 'Abnormal', 'Heavy'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_wound_condition_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_wound_condition_check
  CHECK (wound_condition IS NULL OR wound_condition IN ('Normal', 'Signs of Infection', 'Not Applicable'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_breastfeeding_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_breastfeeding_check
  CHECK (breastfeeding_status IS NULL OR breastfeeding_status IN ('Good', 'With Difficulty', 'Not Breastfeeding'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_baby_feeding_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_baby_feeding_check
  CHECK (baby_feeding_status IS NULL OR baby_feeding_status IN ('Feeding Well', 'Difficulty Feeding'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_jaundice_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_jaundice_check
  CHECK (jaundice IS NULL OR jaundice IN ('Present', 'Absent'));

ALTER TABLE medical_histories DROP CONSTRAINT IF EXISTS medical_histories_cord_check;
ALTER TABLE medical_histories
  ADD CONSTRAINT medical_histories_cord_check
  CHECK (cord_condition IS NULL OR cord_condition IN ('Normal', 'Signs of Infection', 'Healed'));
