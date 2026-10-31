-- ============================================================
-- FIX: medical_history_vitals.history_id is GENERATED ALWAYS
-- which prevents inserting a specific history_id value.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Step 1: Drop the GENERATED ALWAYS identity constraint
ALTER TABLE medical_history_vitals
  ALTER COLUMN history_id DROP IDENTITY IF EXISTS;

-- Step 2: Add foreign key to medical_histories if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medical_history_vitals_history_id_fkey'
      AND conrelid = 'medical_history_vitals'::regclass
  ) THEN
    ALTER TABLE medical_history_vitals
      ADD CONSTRAINT medical_history_vitals_history_id_fkey
      FOREIGN KEY (history_id) REFERENCES medical_histories(history_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 3: Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_medical_history_vitals_history_id
  ON medical_history_vitals(history_id);
