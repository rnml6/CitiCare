-- Migration: Add cached risk score columns to residents table
-- This eliminates the need to recalculate risk on every page load

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'Low Risk';

-- Create index for filtering by risk level
CREATE INDEX IF NOT EXISTS idx_residents_risk_level ON residents(risk_level);
CREATE INDEX IF NOT EXISTS idx_residents_risk_score ON residents(risk_score DESC);
