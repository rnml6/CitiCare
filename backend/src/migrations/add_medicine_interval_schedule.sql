-- ============================================================
-- ADD: per-dose descriptions for medicines (one free-text field per
-- dose, optional). dose_intervals holds entries like
-- [{ "dose": 1, "description": "At 9 months old" },
--  { "dose": 2, "description": "6 months after dose 1" }].
-- requires_interval is kept for backwards compatibility but no longer
-- drives any date enforcement.
-- Run ONCE in Supabase SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE medicine_master
  ADD COLUMN IF NOT EXISTS requires_interval BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dose_intervals JSONB DEFAULT '[]';
