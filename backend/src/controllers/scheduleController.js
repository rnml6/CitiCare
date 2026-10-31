// controllers/scheduleController.js
import { supabase } from '../config/supabase.js';
import { recalculateAndPersistRisk } from '../utils/recalculateRisk.js';
import { checkScheduleConflict } from '../utils/scheduleConflicts.js';
import { fetchAllRows } from '../utils/paginate.js';
import { flipOverdueScheduled } from '../utils/overdueSchedules.js';
import {
  sanitizeSearchTerm,
  sendValidationError,
  trimText,
  validateParticipantPayload,
  validateSchedulePayload,
} from '../utils/validators.js';

// When a resident completes a checkup, all of their prior Missed
// individual schedules are cleared so the missed count resets to 0
// (e.g. Rolan has 3 missed -> completes a new checkup -> 0 missed).
// This keeps the admin + BHW "Missed Health Consultations" widget,
// resident risk (adherence), and schedule lists in sync.
const resetPriorMissedCheckups = async (residentId, excludeScheduleId) => {
  if (!residentId) return 0;
  try {
    let q = supabase
      .from('schedules')
      .select('schedule_id')
      .eq('resident_id', residentId)
      .eq('status', 'Missed');
    if (excludeScheduleId) q = q.neq('schedule_id', excludeScheduleId);
    const { data: missed, error: fetchError } = await q;
    if (fetchError) {
      console.error('Error fetching prior missed schedules for reset:', fetchError);
      return 0;
    }
    if (!missed || missed.length === 0) return 0;
    const ids = missed.map(r => r.schedule_id);
    // Clean up linked rows first (same order as deleteSchedule).
    await supabase.from('schedule_bhws').delete().in('schedule_id', ids);
    await supabase.from('schedule_participants').delete().in('schedule_id', ids);
    const { error: delError } = await supabase.from('schedules').delete().in('schedule_id', ids);
    if (delError) {
      console.error('Error clearing prior missed schedules:', delError);
      return 0;
    }
    // Refresh cached risk so the adherence penalty drops immediately.
    try {
      await recalculateAndPersistRisk(residentId);
    } catch (e) {
      console.error('Error recalculating risk after missed reset:', e);
    }
    return ids.length;
  } catch (e) {
    console.error('Error resetting prior missed checkups:', e);
    return 0;
  }
};

// Single source of truth for residents.last_checkup: completing an
// individual schedule stamps the resident's last checkup to the visit
// date (never moves it backwards), so the Dashboard, Residents list,
// and Resident Detail always agree.
const syncLastCheckupOnCompletion = async (residentId, scheduleDate) => {
  if (!residentId) return;
  try {
    const visitDate = String(scheduleDate || '').slice(0, 10) || new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('residents')
      .select('last_checkup')
      .eq('resident_id', residentId)
      .maybeSingle();
    const current = existing?.last_checkup ? String(existing.last_checkup).slice(0, 10) : null;
    if (!current || visitDate > current) {
      await supabase.from('residents').update({ last_checkup: visitDate }).eq('resident_id', residentId);
    }
  } catch (e) {
    console.error('Error syncing last_checkup on completion:', e);
  }
};

// Supabase column probe: errors when a column is missing, so we can
// detect whether the worker/schedule migrations have been applied.
const probeColumns = async (table, cols) => {
  const { error } = await supabase.from(table).select(cols).limit(0);
  return !error;
};

const MISSING_MIGRATION_SQL =
  'ALTER TABLE schedule_bhws ADD COLUMN IF NOT EXISTS custom_name TEXT; ' +
  'ALTER TABLE schedule_bhws ADD COLUMN IF NOT EXISTS custom_contact TEXT; ' +
  'ALTER TABLE schedule_bhws ALTER COLUMN bhw_id DROP NOT NULL; ' +
  'ALTER TABLE schedules ALTER COLUMN bhw_id DROP NOT NULL; ' +
  'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS resident_contact_number TEXT; ' +
  'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_purok TEXT; ' +
  'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_destination_type TEXT; ' +
  'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_facility_name TEXT; ' +
  'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS referral_facility_address TEXT;';

// Detect what the database can accept right now.
const getWriteSupport = async () => {
  const full = await probeColumns('schedule_bhws', 'custom_name,custom_contact');
  const schedulesCols = await probeColumns('schedules', 'resident_contact_number,location_purok');
  const referralCols = await probeColumns('schedules', 'referral_destination_type,referral_facility_name,referral_facility_address');
  let nameOnly = false;
  if (!full) nameOnly = await probeColumns('schedule_bhws', 'custom_name');
  return { full, nameOnly, schedulesCols, referralCols };
};

const linkRow = (scheduleId, x, role, mode) => {
  const bid = x.bhwId || x.id || x.hcpId || null;
  const row = { schedule_id: scheduleId, bhw_id: bid, role };
  if (mode.full) {
    const nm = String(x.customName || x.name || '').trim().slice(0, 100);
    const ct = String(x.contactNumber || x.contact || '').trim().slice(0, 50);
    if (nm) row.custom_name = nm;
    if (ct) row.custom_contact = ct;
  } else if (mode.nameOnly && !bid) {
    const nm = x.customName ? String(x.customName).trim().slice(0, 100) : null;
    if (nm) row.custom_name = nm;
  }
  return row;
};

// Display a resident's age from date_of_birth — single unit matching
// the frontend: "2y" / "5mo" / "1w".
const formatAgeFromDOB = (dob) => {
  if (!dob) return null;
  const now = new Date();
  const b = new Date(dob);
  if (isNaN(b.getTime()) || b > now) return null;
  const totalDays = Math.floor((now - b) / (1000 * 60 * 60 * 24));
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  // Full elapsed months only (Aug 30 → Sep 8 is 0 months, not 1).
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  if (years >= 1) return `${years}y`;
  if (totalMonths >= 1) return `${totalMonths}mo`;
  return `${Math.max(1, Math.floor(totalDays / 7))}w`;
};

const workerOwnsSchedule = async (scheduleId, bhwId) => {
  if (!bhwId) return false;
  const { data: own } = await supabase
    .from('schedules')
    .select('schedule_id, bhw_id')
    .eq('schedule_id', scheduleId)
    .maybeSingle();
  if (own && String(own.bhw_id) === String(bhwId)) return true;
  const { data: link } = await supabase
    .from('schedule_bhws')
    .select('schedule_id')
    .eq('schedule_id', scheduleId)
    .eq('bhw_id', bhwId)
    .maybeSingle();
  return !!link;
};

export const getAllSchedules = async (req, res) => {
  try {
    // Workers must never enumerate barangay-wide schedules.
    if (req.user?.role === 'BHW Worker') {
      req.params.bhwId = String(req.user.bhwId);
      return getSchedulesByBHW(req, res);
    }
    await flipOverdueScheduled();
    const { date, status, scope, type, search } = req.query;
    const safeSearch = search ? sanitizeSearchTerm(search) : '';

    // Supabase returns at most 1000 rows per request, so page through the
    // whole result set. Without this the newest schedules (past row 1000
    // when ordered by date) never reach the admin list, which makes a
    // freshly created schedule look like it was never saved.
    const buildQuery = () => {
      let query = supabase.from('schedules').select(`
        *,
        residents:resident_id (name, age, gender, contact_number, date_of_birth, puroks:purok_id (name)),
        bhws:bhw_id (name, contact_number, position),
        puroks:purok_id (name),
        schedule_bhws (*, bhws:bhw_id (name, position, contact_number)),
        schedule_participants (count)
      `)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        // Stable tiebreaker: required so paging can't repeat/skip rows.
        .order('schedule_id', { ascending: true });

      if (date) query = query.eq('date', date);
      if (status) query = query.eq('status', status);
      if (scope) query = query.eq('scope', scope);
      if (type) query = query.eq('type', type);
      if (safeSearch) {
        query = query.or(`program_name.ilike.%${safeSearch}%,purpose.ilike.%${safeSearch}%,location_details.ilike.%${safeSearch}%`);
      }
      return query;
    };

    const data = await fetchAllRows(buildQuery);

    const schedules = data.map(schedule => {
      const assignedBhws = [];
      const healthcareProfessionals = [];
      const sbRows = schedule.schedule_bhws || [];
      const leadRow = sbRows.find(r => r.role === 'Lead BHW');
      const leadName = leadRow?.custom_name || schedule.bhws?.name;
      const leadContact = leadRow?.custom_contact || schedule.bhws?.contact_number;

      if (schedule.bhws || leadRow) {
        assignedBhws.push({
          id: schedule.bhw_id, bhwId: schedule.bhw_id,
          name: leadName || '', position: schedule.bhws?.position,
          contactNumber: leadContact || '', isLead: true, role: 'Lead BHW'
        });
      }

      (sbRows || []).forEach(sb => {
        if (sb.role === 'HCP' || sb.role === 'Healthcare Professional') {
          healthcareProfessionals.push({
            id: sb.bhw_id, hcpId: sb.bhw_id,
            name: sb.custom_name || sb.bhws?.name || '',
            position: sb.bhws?.position || '',
            contact: sb.custom_contact || sb.bhws?.contact_number || '',
            role: sb.role
          });
        // Dedupe against the lead only when both ids exist — custom typed
        // rows (null bhw_id) must never be dropped when the schedule
        // itself has no lead id, or extra typed BHWs silently vanish.
        } else if (sb.role !== 'Lead BHW' && !(sb.bhw_id != null && sb.bhw_id === schedule.bhw_id)) {
          assignedBhws.push({
            id: sb.bhw_id, bhwId: sb.bhw_id,
            name: sb.custom_name || sb.bhws?.name || '',
            position: sb.bhws?.position || '',
            contactNumber: sb.custom_contact || sb.bhws?.contact_number || '',
            role: sb.role || 'BHW'
          });
        }
      });

      return {
        id: schedule.schedule_id, scope: schedule.scope, date: schedule.date, time: schedule.time,
        type: schedule.type, status: schedule.status, notes: schedule.notes,
        serviceCategory: schedule.service_category, duration: schedule.duration, purpose: schedule.purpose,
        requirements: schedule.requirements,
        locationDetails: schedule.location_details,
        contactPerson: schedule.contact_person, contactNumber: schedule.contact_number,
        residentContactNumber: schedule.resident_contact_number || null,
        locationPurok: schedule.location_purok || null,
        referralDestinationType: schedule.referral_destination_type || null,
        referralFacilityName: schedule.referral_facility_name || null,
        referralFacilityAddress: schedule.referral_facility_address || null,
        barangayId: schedule.barangay_id, familyNumber: schedule.family_number,
        completionNotes: schedule.completion_notes, completedAt: schedule.completed_at, residentId: schedule.resident_id,
        residentName: schedule.residents?.name || null, residentAge: schedule.residents?.age,
        residentAgeDisplay: formatAgeFromDOB(schedule.residents?.date_of_birth),
        residentGender: schedule.residents?.gender, residentContact: schedule.residents?.contact_number,
        purokId: schedule.purok_id, purokName: schedule.puroks?.name || schedule.residents?.puroks?.name || null,
        isBarangayWide: schedule.is_barangay_wide, programName: schedule.program_name,
        programDescription: schedule.program_description, targetGroup: schedule.target_group,
        targetCount: schedule.target_count, venue: schedule.venue,
        coordinatorName: schedule.coordinator_name,
        coordinatorContact: schedule.coordinator_contact, partnerOrganization: schedule.partner_organization,
        budget: schedule.budget,
        maxParticipants: schedule.max_participants, leadBhwId: schedule.bhw_id,
        leadBhwName: leadName || 'Unassigned', leadBhwPosition: schedule.bhws?.position,
        leadBhwContact: leadContact, assignedBhws, healthcareProfessionals,
        participantCount: schedule.schedule_participants?.[0]?.count || 0
      };
    });

    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schedules' });
  }
};

export const getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'BHW Worker') {
      const { data: own } = await supabase
        .from('schedules')
        .select('schedule_id, bhw_id')
        .eq('schedule_id', id)
        .maybeSingle();
      let isMine = own && String(own.bhw_id) === String(req.user.bhwId);
      if (!isMine) {
        const { data: link } = await supabase
          .from('schedule_bhws')
          .select('schedule_id')
          .eq('schedule_id', id)
          .eq('bhw_id', req.user.bhwId)
          .maybeSingle();
        isMine = !!link;
      }
      if (!isMine) {
        return res.status(403).json({ success: false, message: 'You can only view your own assigned schedules' });
      }
    }
    const { data, error } = await supabase.from('schedules').select(`
      *,
      residents:resident_id (name, age, gender, contact_number, date_of_birth, civil_status, puroks:purok_id (name)),
      bhws:bhw_id (name, contact_number, position),
      puroks:purok_id (name),
      schedule_bhws (*, bhws:bhw_id (name, position, contact_number)),
      schedule_participants (id, resident_id, status, attendance_status, notes, registered_at, residents:resident_id (name, age, gender, contact_number, puroks:purok_id (name)))
    `).eq('schedule_id', id).maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const sbRows = data.schedule_bhws || [];
    const leadRow = sbRows.find(r => r.role === 'Lead BHW');
    const leadName = leadRow?.custom_name || data.bhws?.name;
    const leadContact = leadRow?.custom_contact || data.bhws?.contact_number;

    const assignedBhws = [];
    const healthcareProfessionals = [];

    if (data.bhws || leadRow) {
      assignedBhws.push({
        id: data.bhw_id, bhwId: data.bhw_id,
        name: leadName || '', position: data.bhws?.position,
        contactNumber: leadContact || '', isLead: true, role: 'Lead BHW'
      });
    }

    (sbRows || []).forEach(sb => {
      if (sb.role === 'HCP' || sb.role === 'Healthcare Professional') {
        healthcareProfessionals.push({
          id: sb.bhw_id, hcpId: sb.bhw_id,
          name: sb.custom_name || sb.bhws?.name || '', position: sb.bhws?.position || '',
          contact: sb.custom_contact || sb.bhws?.contact_number || '', role: sb.role
        });
      // Same dedupe rule as the list mapping: null-id (custom typed)
      // rows are always kept.
      } else if (sb.role !== 'Lead BHW' && !(sb.bhw_id != null && sb.bhw_id === data.bhw_id)) {
        assignedBhws.push({
          id: sb.bhw_id, bhwId: sb.bhw_id,
          name: sb.custom_name || sb.bhws?.name || '', position: sb.bhws?.position || '',
          contactNumber: sb.custom_contact || sb.bhws?.contact_number || '', role: sb.role || 'BHW'
        });
      }
    });

    if (assignedBhws.length === 0 && data.bhw_id) {
      assignedBhws.push({ id: data.bhw_id, bhwId: data.bhw_id, name: data.bhws?.name || '', contactNumber: data.bhws?.contact_number || '', isLead: true });
    }

    const schedule = {
      id: data.schedule_id, scope: data.scope, date: data.date, time: data.time,
      type: data.type, status: data.status, notes: data.notes,
      serviceCategory: data.service_category,
      duration: data.duration, purpose: data.purpose,
      locationDetails: data.location_details, contactPerson: data.contact_person,
      contactNumber: data.contact_number,
      residentContactNumber: data.resident_contact_number || null,
      locationPurok: data.location_purok || null,
      referralDestinationType: data.referral_destination_type || null,
      referralFacilityName: data.referral_facility_name || null,
      referralFacilityAddress: data.referral_facility_address || null,
      residentId: data.resident_id,
      residentName: data.residents?.name || null,
      resident: data.residents ? { id: data.resident_id, name: data.residents.name, age: data.residents.age, gender: data.residents.gender, contactNumber: data.residents.contact_number, purok: data.residents.puroks?.name, ageDisplay: formatAgeFromDOB(data.residents.date_of_birth) } : null,
      purokId: data.purok_id, purokName: data.puroks?.name || data.residents?.puroks?.name || null,
      isBarangayWide: data.is_barangay_wide, programName: data.program_name,
      programDescription: data.program_description, targetGroup: data.target_group,
      targetCount: data.target_count, venue: data.venue,
      coordinatorName: data.coordinator_name, coordinatorContact: data.coordinator_contact,
      partnerOrganization: data.partner_organization,
      maxParticipants: data.max_participants,
      leadBhw: (data.bhws || leadRow) ? { id: data.bhw_id, name: leadName || '', position: data.bhws?.position, contactNumber: leadContact || '' } : null,
      leadBhwId: data.bhw_id, leadBhwName: leadName || null,
      assignedBhws, healthcareProfessionals,
      participants: data.schedule_participants?.map(sp => ({ id: sp.resident_id, name: sp.residents?.name, status: sp.status, attendanceStatus: sp.attendance_status })) || [],
      participantCount: data.schedule_participants?.length || 0
    };

    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schedule' });
  }
};

export const createSchedule = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateSchedulePayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { scope, date, time, type, serviceCategory, checkupCategory, status, duration, purpose, notes, locationDetails, contactPerson, contactNumber, residentContactNumber, residentId, purokId, isBarangayWide, programName, programDescription, targetGroup, targetCount, venue, coordinatorName, coordinatorContact, partnerOrganization, maxParticipants, assignedBhws, healthcareProfessionals, locationPurok, referralDestinationType, referralFacilityName, referralFacilityAddress } = body;

    // BHW Workers: individual scope only, always under their own name.
    const isWorker = req.user?.role === 'BHW Worker';
    let workerPurokId = null;
    let workerPurokName = null;
    if (isWorker) {
      if (!req.user?.bhwId) {
        return res.status(403).json({ success: false, message: 'No BHW profile linked to this account' });
      }
      if (scope !== 'individual') {
        return res.status(403).json({ success: false, message: 'BHWs can only create individual schedules' });
      }
      const { data: me } = await supabase
        .from('bhws')
        .select('assigned_purok_id, puroks:assigned_purok_id (name)')
        .eq('bhw_id', req.user.bhwId)
        .maybeSingle();
      workerPurokId = me?.assigned_purok_id ?? null;
      workerPurokName = me?.puroks?.name || null;
      if (residentId) {
        const { data: resident } = await supabase
          .from('residents')
          .select('purok_id')
          .eq('resident_id', residentId)
          .maybeSingle();
        if (!resident) {
          return res.status(404).json({ success: false, message: 'Resident not found' });
        }
        if (!(req.user.residentIds || []).some(id => String(id) === String(residentId))) {
          return res.status(403).json({ success: false, message: 'You can only schedule residents in your handled purok or focus group' });
        }
      }
    }

    let bhwId = assignedBhws?.[0]?.bhwId || assignedBhws?.[0]?.id || null;
    if (isWorker) bhwId = req.user.bhwId;
    if (!bhwId && !(assignedBhws?.[0] && String(assignedBhws[0].customName || assignedBhws[0].name || '').trim() !== '')) {
      return res.status(400).json({ success: false, message: 'At least one BHW must be assigned', errors: { assignedBhws: 'At least one BHW must be assigned.' } });
    }

    const support = await getWriteSupport();
    const workers = [...(assignedBhws || []), ...(healthcareProfessionals || [])];
    const hasCustomWorker = workers.some(x => x && !(x.bhwId || x.id || x.hcpId) && String(x.customName || x.name || '').trim() !== '');
    if (!support.full && !support.nameOnly && hasCustomWorker) {
      return res.status(400).json({ success: false, message: `Custom worker names need a database update. Run in Supabase SQL Editor: ${MISSING_MIGRATION_SQL}` });
    }

    const scheduleData = {
      scope, resident_id: scope === 'individual' ? residentId : null,
      purok_id: scope === 'purok' ? purokId : null, is_barangay_wide: scope === 'barangay',
      bhw_id: bhwId, date, time, type, status: status || 'Scheduled', notes,
      service_category: serviceCategory || checkupCategory || '',
      duration: duration || 30, purpose,
      location_details: locationDetails,
      contact_person: contactPerson, contact_number: contactNumber,
      program_name: programName, program_description: programDescription,
      target_group: targetGroup, target_count: targetCount, venue,
      coordinator_name: coordinatorName, coordinator_contact: coordinatorContact,
      partner_organization: partnerOrganization,
      max_participants: maxParticipants,
    };
    if (support.schedulesCols) {
      scheduleData.resident_contact_number = residentContactNumber || null;
      // BHW schedules are always pinned to the worker's handled purok —
      // the client field is read-only and never trusted here.
      scheduleData.location_purok = (isWorker && workerPurokName) ? workerPurokName : (locationPurok || null);
    }
    if (support.referralCols && (type === 'LGU Referral' || type === 'Referral')) {
      scheduleData.referral_destination_type = referralDestinationType || null;
      scheduleData.referral_facility_name = referralFacilityName || null;
      scheduleData.referral_facility_address = referralFacilityAddress || null;
    }

    const conflict = await checkScheduleConflict(supabase, scheduleData, assignedBhws, healthcareProfessionals);
    if (conflict) return res.status(409).json({ success: false, message: conflict });
    const { data, error } = await supabase.from('schedules').insert(scheduleData).select().single();
    if (error) throw error;

    const leadBhw = assignedBhws?.[0];
    if (leadBhw && (support.full || (support.nameOnly && !bhwId))) {
      const { error: leadErr } = await supabase.from('schedule_bhws').insert(linkRow(data.schedule_id, leadBhw, 'Lead BHW', support));
      if (leadErr) throw leadErr;
    }

    if (assignedBhws && assignedBhws.length > 1) {
      const additionalBhws = assignedBhws.slice(1).filter(b => ((b.bhwId || b.id) || (b.customName && String(b.customName).trim() !== '')) && (b.bhwId || b.id) !== bhwId);
      if (additionalBhws.length > 0) {
        const { error: linkError } = await supabase.from('schedule_bhws').insert(
          additionalBhws.map(bhw => linkRow(data.schedule_id, bhw, 'BHW', support))
        );
        if (linkError) throw linkError;
      }
    }

    if (healthcareProfessionals && healthcareProfessionals.length > 0) {
      const validHcps = healthcareProfessionals.filter(h => (h.hcpId || h.id) || (h.customName && String(h.customName).trim() !== ''));
      if (validHcps.length > 0) {
        const { error: linkError } = await supabase.from('schedule_bhws').insert(
          validHcps.map(hcp => linkRow(data.schedule_id, hcp, 'HCP', support))
        );
        if (linkError) throw linkError;
      }
    }

    // Directly creating a Completed checkup also resets prior missed.
    let clearedMissed = 0;
    if ((status === 'Completed') && data.resident_id) {
      await syncLastCheckupOnCompletion(data.resident_id, data.date);
      clearedMissed = await resetPriorMissedCheckups(data.resident_id, data.schedule_id);
    }

    const warnings = support.full ? [] : [`Worker names/contacts weren't fully saved — run this in the Supabase SQL Editor once: ${MISSING_MIGRATION_SQL}`];
    const message = clearedMissed > 0
      ? `Schedule created successfully. ${clearedMissed} prior missed checkup${clearedMissed > 1 ? 's' : ''} cleared.`
      : 'Schedule created successfully';
    res.status(201).json({ success: true, data, warnings, message, clearedMissed });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create schedule' });
  }
};

export const updateSchedule = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateSchedulePayload(body, { partial: true });
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { id } = req.params;
    const { scope, date, time, type, serviceCategory, checkupCategory, status, duration, purpose, notes, locationDetails, contactPerson, contactNumber, residentContactNumber, residentId, purokId, isBarangayWide, programName, programDescription, targetGroup, targetCount, venue, coordinatorName, coordinatorContact, partnerOrganization, maxParticipants, assignedBhws, healthcareProfessionals, locationPurok, referralDestinationType, referralFacilityName, referralFacilityAddress, completionNotes } = body;

    // BHW Workers: full edit of their own individual schedules (the worker
    // MySchedules Edit/Reschedule forms send date/time/type/location/
    // contacts/referral/workers). Scope, resident, and purok reassignment
    // stay admin-only, so those fields are ignored here.
    if (req.user?.role === 'BHW Worker') {
      const { data: own } = await supabase
        .from('schedules')
        .select('schedule_id, bhw_id')
        .eq('schedule_id', id)
        .maybeSingle();
      let isMine = own && String(own.bhw_id) === String(req.user.bhwId);
      if (!isMine) {
        const { data: link } = await supabase
          .from('schedule_bhws')
          .select('schedule_id')
          .eq('schedule_id', id)
          .eq('bhw_id', req.user.bhwId)
          .maybeSingle();
        isMine = !!link;
      }
      if (!isMine) {
        return res.status(403).json({ success: false, message: 'You can only update your own assigned schedules' });
      }
      const support = await getWriteSupport();
      const workerUpdate = {};
      if (status !== undefined) workerUpdate.status = status;
      if (notes !== undefined) workerUpdate.notes = notes;
      if (completionNotes !== undefined) workerUpdate.completion_notes = completionNotes;
      if (purpose !== undefined) workerUpdate.purpose = purpose;
      if (date !== undefined) workerUpdate.date = date || null;
      if (time !== undefined) workerUpdate.time = time || null;
      if (type !== undefined) workerUpdate.type = type;
      if (serviceCategory !== undefined || checkupCategory !== undefined) workerUpdate.service_category = serviceCategory || checkupCategory || '';
      if (duration !== undefined) workerUpdate.duration = duration;
      if (locationDetails !== undefined) workerUpdate.location_details = locationDetails;
      if (contactPerson !== undefined) workerUpdate.contact_person = contactPerson;
      if (contactNumber !== undefined) workerUpdate.contact_number = contactNumber;
      if (support.schedulesCols) {
        if (residentContactNumber !== undefined) workerUpdate.resident_contact_number = residentContactNumber || null;
        // Pinned to the worker's handled purok — ignore any client value.
        const { data: workerBhw } = await supabase
          .from('bhws')
          .select('assigned_purok_id, puroks:assigned_purok_id (name)')
          .eq('bhw_id', req.user.bhwId)
          .maybeSingle();
        if (workerBhw?.puroks?.name) workerUpdate.location_purok = workerBhw.puroks.name;
        else if (locationPurok !== undefined) workerUpdate.location_purok = locationPurok || null;
      }
      if (support.referralCols) {
        if (referralDestinationType !== undefined) workerUpdate.referral_destination_type = referralDestinationType || null;
        if (referralFacilityName !== undefined) workerUpdate.referral_facility_name = referralFacilityName || null;
        if (referralFacilityAddress !== undefined) workerUpdate.referral_facility_address = referralFacilityAddress || null;
      }
      const nextStatus = status !== undefined ? status : undefined;
      if (['Scheduled', 'Active'].includes(nextStatus) || ((date !== undefined || time !== undefined) && nextStatus !== 'Cancelled' && nextStatus !== 'Completed' && nextStatus !== 'Missed')) {
        const conflict = await checkScheduleConflict(supabase, workerUpdate, assignedBhws, healthcareProfessionals, id);
        if (conflict) return res.status(409).json({ success: false, message: conflict });
      }
      const { data, error } = await supabase.from('schedules').update(workerUpdate).eq('schedule_id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, message: 'Schedule not found' });
      // Persist worker assignment edits when the edit form sends them,
      // keeping the requesting BHW on the schedule so they never lock
      // themselves out.
      if (assignedBhws !== undefined || healthcareProfessionals !== undefined) {
        let nextBhws = Array.isArray(assignedBhws) ? [...assignedBhws] : null;
        let nextHcps = Array.isArray(healthcareProfessionals) ? [...healthcareProfessionals] : null;
        if (nextBhws) {
          const stillAssigned = nextBhws.some(b => String(b.bhwId || b.id || '') === String(req.user.bhwId));
          if (!stillAssigned) {
            const { data: me } = await supabase.from('bhws').select('name, contact_number').eq('bhw_id', req.user.bhwId).maybeSingle();
            nextBhws.unshift({ bhwId: req.user.bhwId, name: me?.name || '', contactNumber: me?.contact_number || '' });
          }
        }
        await supabase.from('schedule_bhws').delete().eq('schedule_id', id);
        const leadBhw = nextBhws?.[0];
        if (leadBhw && (support.full || (support.nameOnly && !(leadBhw.bhwId || leadBhw.id)))) {
          const { error: leadErr } = await supabase.from('schedule_bhws').insert(linkRow(id, leadBhw, 'Lead BHW', support));
          if (leadErr) throw leadErr;
        }
        if (nextBhws && nextBhws.length > 1) {
          const leadId = leadBhw?.bhwId || leadBhw?.id || null;
          const additionalBhws = nextBhws.slice(1).filter(b => ((b.bhwId || b.id) || (b.customName && String(b.customName).trim() !== '')) && (b.bhwId || b.id) !== leadId);
          if (additionalBhws.length > 0) {
            const { error: linkError } = await supabase.from('schedule_bhws').insert(
              additionalBhws.map(bhw => linkRow(id, bhw, 'BHW', support))
            );
            if (linkError) throw linkError;
          }
        }
        if (nextHcps && nextHcps.length > 0) {
          const validHcps = nextHcps.filter(h => (h.hcpId || h.id) || (h.customName && String(h.customName).trim() !== ''));
          if (validHcps.length > 0) {
            const { error: linkError } = await supabase.from('schedule_bhws').insert(
              validHcps.map(hcp => linkRow(id, hcp, 'HCP', support))
            );
            if (linkError) throw linkError;
          }
        }
      }
      // Completing a checkup resets that resident's prior missed checkups
      // and stamps last_checkup so Dashboard == Resident Detail.
      if (status === 'Completed' && data.resident_id) {
        await syncLastCheckupOnCompletion(data.resident_id, data.date);
        const cleared = await resetPriorMissedCheckups(data.resident_id, id);
        if (cleared > 0) {
          return res.json({ success: true, data, message: `Schedule updated successfully. ${cleared} prior missed checkup${cleared > 1 ? 's' : ''} cleared.` });
        }
      }
      return res.json({ success: true, data, message: 'Schedule updated successfully' });
    }

    const support = await getWriteSupport();
    const workers = [...(assignedBhws || []), ...(healthcareProfessionals || [])];
    const hasCustomWorker = workers.some(x => x && !(x.bhwId || x.id || x.hcpId) && String(x.customName || x.name || '').trim() !== '');
    if (!support.full && !support.nameOnly && hasCustomWorker) {
      return res.status(400).json({ success: false, message: `Custom worker names need a database update. Run in Supabase SQL Editor: ${MISSING_MIGRATION_SQL}` });
    }

    let bhwId = assignedBhws?.[0]?.bhwId || assignedBhws?.[0]?.id || null;
    if (!bhwId && assignedBhws === undefined) {
      const { data: existing } = await supabase.from('schedules').select('bhw_id').eq('schedule_id', id).single();
      bhwId = existing?.bhw_id;
    }

    const updateData = { bhw_id: bhwId };
    if (scope !== undefined) updateData.scope = scope;
    if (date !== undefined) updateData.date = date || null;
    if (time !== undefined) updateData.time = time || null;
    if (type !== undefined) updateData.type = type;
    if (serviceCategory !== undefined || checkupCategory !== undefined) updateData.service_category = serviceCategory || checkupCategory || '';
    if (status !== undefined) updateData.status = status;
    if (duration !== undefined) updateData.duration = duration;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (notes !== undefined) updateData.notes = notes;
    if (completionNotes !== undefined) updateData.completion_notes = completionNotes;
    if (locationDetails !== undefined) updateData.location_details = locationDetails;
    if (contactPerson !== undefined) updateData.contact_person = contactPerson;
    if (contactNumber !== undefined) updateData.contact_number = contactNumber;
    if (residentId !== undefined) updateData.resident_id = residentId || null;
    if (purokId !== undefined) updateData.purok_id = purokId || null;
    if (isBarangayWide !== undefined) updateData.is_barangay_wide = isBarangayWide;
    if (programName !== undefined) updateData.program_name = programName;
    if (programDescription !== undefined) updateData.program_description = programDescription;
    if (targetGroup !== undefined) updateData.target_group = targetGroup;
    if (targetCount !== undefined) updateData.target_count = targetCount ? parseInt(targetCount) : null;
    if (venue !== undefined) updateData.venue = venue;
    if (coordinatorName !== undefined) updateData.coordinator_name = coordinatorName;
    if (coordinatorContact !== undefined) updateData.coordinator_contact = coordinatorContact;
    if (partnerOrganization !== undefined) updateData.partner_organization = partnerOrganization;
    if (maxParticipants !== undefined) updateData.max_participants = maxParticipants ? parseInt(maxParticipants) : null;
    if (support.schedulesCols) {
      if (residentContactNumber !== undefined) updateData.resident_contact_number = residentContactNumber || null;
      if (locationPurok !== undefined) updateData.location_purok = locationPurok || null;
    }
    const isReferralType = type === 'LGU Referral' || type === 'Referral';
    // Referral fields also save on status-only updates (e.g. completing a
    // referral schedule from a medical record) where type is not re-sent.
    if (support.referralCols && (isReferralType || type === undefined)) {
      if (referralDestinationType !== undefined) updateData.referral_destination_type = referralDestinationType || null;
      if (referralFacilityName !== undefined) updateData.referral_facility_name = referralFacilityName || null;
      if (referralFacilityAddress !== undefined) updateData.referral_facility_address = referralFacilityAddress || null;
    } else if (support.referralCols && type !== undefined && !isReferralType) {
      updateData.referral_destination_type = null;
      updateData.referral_facility_name = null;
      updateData.referral_facility_address = null;
    }

    const conflict = await checkScheduleConflict(supabase, updateData, assignedBhws, healthcareProfessionals, id);
    if (conflict) return res.status(409).json({ success: false, message: conflict });
    const { data, error } = await supabase.from('schedules').update(updateData).eq('schedule_id', id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // Only reset worker links when the caller actually sends worker arrays
    // (e.g. full edit form). Status-only updates (Complete/Cancel) must
    // leave assigned BHWs and Healthcare Professionals untouched.
    if (assignedBhws !== undefined || healthcareProfessionals !== undefined) {
      await supabase.from('schedule_bhws').delete().eq('schedule_id', id);

      const leadBhw = assignedBhws?.[0];
      if (leadBhw && (support.full || (support.nameOnly && !bhwId))) {
        const { error: leadErr } = await supabase.from('schedule_bhws').insert(linkRow(id, leadBhw, 'Lead BHW', support));
        if (leadErr) throw leadErr;
      }

      if (assignedBhws && assignedBhws.length > 1) {
        const additionalBhws = assignedBhws.slice(1).filter(b => ((b.bhwId || b.id) || (b.customName && String(b.customName).trim() !== '')) && (b.bhwId || b.id) !== bhwId);
        if (additionalBhws.length > 0) {
          const { error: linkError } = await supabase.from('schedule_bhws').insert(
            additionalBhws.map(bhw => linkRow(id, bhw, 'BHW', support))
          );
          if (linkError) throw linkError;
        }
      }

      if (healthcareProfessionals && healthcareProfessionals.length > 0) {
        const validHcps = healthcareProfessionals.filter(h => (h.hcpId || h.id) || (h.customName && String(h.customName).trim() !== ''));
        if (validHcps.length > 0) {
          const { error: linkError } = await supabase.from('schedule_bhws').insert(
            validHcps.map(hcp => linkRow(id, hcp, 'HCP', support))
          );
          if (linkError) throw linkError;
        }
      }
    }

    // Completing a checkup resets that resident's prior missed checkups
    // and stamps last_checkup so Dashboard == Resident Detail.
    let clearedMissed = 0;
    if (status === 'Completed' && data.resident_id) {
      await syncLastCheckupOnCompletion(data.resident_id, data.date);
      clearedMissed = await resetPriorMissedCheckups(data.resident_id, id);
    }

    const warnings = support.full ? [] : [`Worker names/contacts weren't fully saved — run this in the Supabase SQL Editor once: ${MISSING_MIGRATION_SQL}`];
    const message = clearedMissed > 0
      ? `Schedule updated successfully. ${clearedMissed} prior missed checkup${clearedMissed > 1 ? 's' : ''} cleared.`
      : 'Schedule updated successfully';
    res.json({ success: true, data, warnings, message, clearedMissed });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update schedule' });
  }
};

export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'BHW Worker') {
      const ok = await workerOwnsSchedule(id, req.user.bhwId);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'You can only delete your own assigned schedules' });
      }
    }
    const { data: existing, error: existingError } = await supabase
      .from('schedules')
      .select('schedule_id')
      .eq('schedule_id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ success: false, message: 'Schedule not found' });

    await supabase.from('schedule_bhws').delete().eq('schedule_id', id);
    await supabase.from('schedule_participants').delete().eq('schedule_id', id);
    const { error } = await supabase.from('schedules').delete().eq('schedule_id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete schedule' });
  }
};

// Token-scoped variant: BHW Workers always resolve to their own bhwId.
export const getMySchedules = async (req, res) => {
  try {
    const bhwId = req.user?.bhwId;
    if (!bhwId) {
      return res.status(404).json({ success: false, message: 'No BHW profile linked to this account' });
    }
    req.params.bhwId = String(bhwId);
    return getSchedulesByBHW(req, res);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schedules' });
  }
};

// Columns returned for the worker schedule list (embedded twice: as the
// lead query and inside schedule_bhws links). Kept in one place so both
// shapes stay identical — previously the explicit selects dropped fields
// the mapper reads (resident contact, location purok, referral data and the
// custom worker name/contact overrides).
const BHW_SCHEDULE_COLUMNS = `schedule_id, scope, date, time, type, status, duration, purpose, notes, service_category, location_details, contact_person, contact_number, resident_contact_number, location_purok, referral_destination_type, referral_facility_name, referral_facility_address, program_name, program_description, venue, resident_id, residents:resident_id (name, age, gender, contact_number, date_of_birth, puroks:purok_id (name)), purok_id, puroks:purok_id (name), is_barangay_wide, bhw_id, bhws:bhw_id (name, position, contact_number), schedule_bhws (bhw_id, role, custom_name, custom_contact, bhws:bhw_id (name, position, contact_number)), schedule_participants (count)`;

export const getSchedulesByBHW = async (req, res) => {
  try {
    await flipOverdueScheduled();
    const { bhwId } = req.params;
    if (req.user?.role === 'BHW Worker' && String(bhwId) !== String(req.user.bhwId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own assigned schedules' });
    }

    // Page through both sources — a busy BHW can exceed the 1000-row cap.
    const leadSchedules = await fetchAllRows(() => supabase
      .from('schedules')
      .select(BHW_SCHEDULE_COLUMNS)
      .eq('bhw_id', bhwId)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .order('schedule_id', { ascending: true }));

    const assignedSchedules = await fetchAllRows(() => supabase
      .from('schedule_bhws')
      .select(`schedule_id, schedules:schedule_id (${BHW_SCHEDULE_COLUMNS})`)
      .eq('bhw_id', bhwId)
      .order('schedule_id', { ascending: true })
      .order('id', { ascending: true }));

    const allScheduleIds = new Set();
    const allSchedules = [];

    (leadSchedules || []).forEach(s => { if (!allScheduleIds.has(s.schedule_id)) { allScheduleIds.add(s.schedule_id); allSchedules.push(s); } });
    (assignedSchedules || []).forEach(item => { if (item.schedules && !allScheduleIds.has(item.schedules.schedule_id)) { allScheduleIds.add(item.schedules.schedule_id); allSchedules.push(item.schedules); } });

    const schedules = allSchedules.map(schedule => {
      // Rebuild worker assignments from the link rows so BHW list rows
      // carry the same shape as the admin list (used by the worker edit
      // form and conflict checks). Custom typed rows (null bhw_id) are
      // always kept — see getAllSchedules dedupe rule.
      const sbRows = schedule.schedule_bhws || [];
      const leadName = schedule.bhws?.name || null;
      const assignedBhws = [];
      const healthcareProfessionals = [];
      if (schedule.bhws) {
        assignedBhws.push({
          id: schedule.bhw_id, bhwId: schedule.bhw_id,
          name: leadName || '', position: schedule.bhws?.position,
          contactNumber: schedule.bhws?.contact_number || '', isLead: true, role: 'Lead BHW'
        });
      }
      sbRows.forEach(sb => {
        if (sb.role === 'HCP' || sb.role === 'Healthcare Professional') {
          healthcareProfessionals.push({
            id: sb.bhw_id, hcpId: sb.bhw_id,
            name: sb.custom_name || sb.bhws?.name || '',
            position: sb.bhws?.position || '',
            contact: sb.custom_contact || sb.bhws?.contact_number || '',
            role: sb.role
          });
        } else if (sb.role !== 'Lead BHW' && !(sb.bhw_id != null && sb.bhw_id === schedule.bhw_id)) {
          assignedBhws.push({
            id: sb.bhw_id, bhwId: sb.bhw_id,
            name: sb.custom_name || sb.bhws?.name || '',
            position: sb.bhws?.position || '',
            contactNumber: sb.custom_contact || sb.bhws?.contact_number || '',
            role: sb.role || 'BHW'
          });
        }
      });
      return {
      id: schedule.schedule_id, scope: schedule.scope, date: schedule.date, time: schedule.time,
      type: schedule.type, status: schedule.status, duration: schedule.duration,
      purpose: schedule.purpose, notes: schedule.notes,
      serviceCategory: schedule.service_category,
      checkupCategory: schedule.service_category,
      locationDetails: schedule.location_details,
      locationDescription: schedule.location_details,
      contactPerson: schedule.contact_person, contactNumber: schedule.contact_number,
      residentContactNumber: schedule.resident_contact_number || schedule.residents?.contact_number || null,
      residentContact: schedule.residents?.contact_number || null,
      locationPurok: schedule.location_purok || schedule.puroks?.name || schedule.residents?.puroks?.name || null,
      referralDestinationType: schedule.referral_destination_type || null,
      referralFacilityName: schedule.referral_facility_name || null,
      referralFacilityAddress: schedule.referral_facility_address || null,
      programName: schedule.program_name, programDescription: schedule.program_description, venue: schedule.venue,
      residentId: schedule.resident_id,
      residentName: schedule.residents?.name || (schedule.scope !== 'individual' ? 'Multiple Residents' : 'Unknown'),
      residentAge: schedule.residents?.age,
      residentAgeDisplay: formatAgeFromDOB(schedule.residents?.date_of_birth),
      residentGender: schedule.residents?.gender,
      purokId: schedule.purok_id, purokName: schedule.puroks?.name || schedule.residents?.puroks?.name || null,
      isBarangayWide: schedule.is_barangay_wide,
      leadBhwId: schedule.bhw_id, leadBhwName: leadName || 'Unassigned',
      leadBhwContact: schedule.bhws?.contact_number || null,
      assignedBhws, healthcareProfessionals,
      participantCount: schedule.schedule_participants?.[0]?.count || 0,
    };
    });

    schedules.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schedules' });
  }
};

export const addParticipant = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateParticipantPayload(body, { requireResident: true });
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { scheduleId } = req.params;
    const { residentId, notes } = body;
    if (req.user?.role === 'BHW Worker') {
      const ok = await workerOwnsSchedule(scheduleId, req.user.bhwId);
      if (!ok) return res.status(403).json({ success: false, message: 'You can only manage your own assigned schedules' });
    }
    const { data, error } = await supabase.from('schedule_participants').insert({
      schedule_id: scheduleId, resident_id: residentId, status: 'Registered', attendance_status: 'Pending', notes: notes || null
    }).select('*, residents:resident_id (name, age, gender, puroks:purok_id (name))').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ success: false, message: 'Resident already registered', errors: { residentId: 'This resident is already registered for the schedule.' } });
      throw error;
    }
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to add participant' });
  }
};

export const removeParticipant = async (req, res) => {
  try {
    const { scheduleId, residentId } = req.params;
    if (req.user?.role === 'BHW Worker') {
      const ok = await workerOwnsSchedule(scheduleId, req.user.bhwId);
      if (!ok) return res.status(403).json({ success: false, message: 'You can only manage your own assigned schedules' });
    }
    const { data: existing, error: existingError } = await supabase
      .from('schedule_participants')
      .select('schedule_id')
      .eq('schedule_id', scheduleId)
      .eq('resident_id', residentId)
      .maybeSingle();
    if (existingError) {
      if (existingError.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid schedule or resident ID' });
      throw existingError;
    }
    if (!existing) return res.status(404).json({ success: false, message: 'Participant not found' });
    const { error } = await supabase.from('schedule_participants').delete().eq('schedule_id', scheduleId).eq('resident_id', residentId);
    if (error) throw error;
    res.json({ success: true, message: 'Participant removed' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove participant' });
  }
};

export const updateParticipant = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateParticipantPayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { scheduleId, residentId } = req.params;
    const { status, attendanceStatus, notes } = body;
    if (req.user?.role === 'BHW Worker') {
      const ok = await workerOwnsSchedule(scheduleId, req.user.bhwId);
      if (!ok) return res.status(403).json({ success: false, message: 'You can only manage your own assigned schedules' });
    }
    const { data: existing, error: existingError } = await supabase
      .from('schedule_participants')
      .select('schedule_id')
      .eq('schedule_id', scheduleId)
      .eq('resident_id', residentId)
      .maybeSingle();
    if (existingError) {
      if (existingError.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid schedule or resident ID' });
      throw existingError;
    }
    if (!existing) return res.status(404).json({ success: false, message: 'Participant not found' });
    const updateData = {};
    if (status) updateData.status = status;
    if (attendanceStatus) updateData.attendance_status = attendanceStatus;
    if (notes !== undefined) updateData.notes = notes;
    const { error } = await supabase.from('schedule_participants').update(updateData).eq('schedule_id', scheduleId).eq('resident_id', residentId);
    if (error) {
      if (error.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid schedule or resident ID' });
      throw error;
    }
    res.json({ success: true, message: 'Participant updated' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update participant' });
  }
};

export const getParticipants = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    if (req.user?.role === 'BHW Worker') {
      const ok = await workerOwnsSchedule(scheduleId, req.user.bhwId);
      if (!ok) return res.status(403).json({ success: false, message: 'You can only view your own assigned schedules' });
    }
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('schedule_id')
      .eq('schedule_id', scheduleId)
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    const { data, error } = await supabase.from('schedule_participants').select('*, residents:resident_id (name, age, gender, contact_number, puroks:purok_id (name))').eq('schedule_id', scheduleId);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch participants' });
  }
};

export const getProgramStats = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { data: participants, error } = await supabase.from('schedule_participants').select('status, attendance_status').eq('schedule_id', scheduleId);
    if (error) throw error;
    const stats = {
      totalRegistered: participants?.length || 0,
      attended: participants?.filter(p => p.attendance_status === 'Present').length || 0,
      absent: participants?.filter(p => p.attendance_status === 'Absent').length || 0,
      pending: participants?.filter(p => p.attendance_status === 'Pending').length || 0,
      completed: participants?.filter(p => p.status === 'Completed').length || 0,
      attendanceRate: participants?.length > 0 ? Math.round((participants.filter(p => p.attendance_status === 'Present').length / participants.length) * 100) : 0
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};
