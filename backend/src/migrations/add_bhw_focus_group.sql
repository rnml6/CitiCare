-- ============================================================
-- ADD: assign each Barangay Health Worker to at most one
-- focus group / vulnerable group (pregnant, senior, infant),
-- and each focus group to at most one BHW.
-- Run ONCE in Supabase SQL Editor → paste → Run
-- ============================================================

ALTER TABLE bhws
  ADD COLUMN IF NOT EXISTS assigned_focus_group TEXT;

-- Keep values clean: only the 3 vulnerable groups (or NULL = unassigned).
-- Drop first if re-running so the values stay consistent.
ALTER TABLE bhws DROP CONSTRAINT IF EXISTS bhws_assigned_focus_group_check;
ALTER TABLE bhws
  ADD CONSTRAINT bhws_assigned_focus_group_check
  CHECK (assigned_focus_group IS NULL OR assigned_focus_group IN ('pregnant', 'senior', 'infant'));

-- One BHW per focus group: a group already held by one BHW
-- cannot be taken by another (e.g. Pregnant held by Elinita).
DROP INDEX IF EXISTS uniq_bhws_assigned_focus_group;
CREATE UNIQUE INDEX uniq_bhws_assigned_focus_group
  ON bhws (assigned_focus_group)
  WHERE assigned_focus_group IS NOT NULL;
