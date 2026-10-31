-- ============================================================
-- FIX: persist the name + contact the user actually typed for
-- health workers in Add Schedule / Edit Schedule, so Schedule
-- Details shows exactly what was entered.
-- Run ONCE in Supabase SQL Editor → Editor → paste → Run
-- ============================================================

ALTER TABLE schedule_bhws ADD COLUMN IF NOT EXISTS custom_name TEXT;
ALTER TABLE schedule_bhws ADD COLUMN IF NOT EXISTS custom_contact TEXT;
ALTER TABLE schedule_bhws ALTER COLUMN bhw_id DROP NOT NULL;
ALTER TABLE schedules ALTER COLUMN bhw_id DROP NOT NULL;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS resident_contact_number TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_purok TEXT;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_destination_type TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_facility_name TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_facility_address TEXT;

-- Reason for Referral was removed from the app; drop the leftover column.
ALTER TABLE schedules DROP COLUMN IF EXISTS referral_reason;