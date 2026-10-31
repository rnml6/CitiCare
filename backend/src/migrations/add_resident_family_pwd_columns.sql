-- ============================================================
-- ADD: infant parent names + PWD disability detail on residents so
-- the Add/Edit Resident form can store Mother's/Father's Name
-- (infants under 5) and the specified disability (PWD).
-- Run ONCE in Supabase SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- The API reads/writes these columns tolerantly: when the
-- migration hasn't been run yet, the fields simply read as null
-- and writes fall back to the legacy columns.
-- ============================================================

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS mother_name TEXT,
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS disability_type TEXT;
