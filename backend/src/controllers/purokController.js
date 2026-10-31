import { supabase } from '../config/supabase.js';
import { getResidentRiskSnapshot } from '../utils/residentSnapshot.js';
import { getRiskClassification } from '../utils/riskCalculator.js';
import {
  sendValidationError,
  trimText,
  validatePurokLocationPayload,
  validatePurokPayload,
} from '../utils/validators.js';

// Purok-level label uses the same central thresholds as individual residents
// (75/50/25), with "Health Risk" suffix for purok context.
const classifyPurokAvgScore = (avg) =>
  getRiskClassification(avg).replace(' Risk', ' Health Risk');

export const getAllPuroks = async (req, res) => {
  try {
    // BHW Workers must never enumerate other puroks.
    let assignedOnly = null;
    if (req.user?.role === 'BHW Worker') {
      const { data: me } = await supabase
        .from('bhws')
        .select('assigned_purok_id')
        .eq('bhw_id', req.user.bhwId)
        .maybeSingle();
      assignedOnly = me?.assigned_purok_id ?? req.user?.assignedPurokId ?? null;
      if (!assignedOnly) return res.json({ success: true, data: [] });
    }
    let query = supabase
      .from('puroks')
      .select('*')
      .order('purok_id', { ascending: false });
    if (assignedOnly) query = query.eq('purok_id', assignedOnly);
    const { data, error } = await query;

    if (error) throw error;

    // One shared snapshot of the residents table (also used by the dashboard)
    // plus the two small lookup tables, all in parallel. Previously the Purok
    // tab separately re-downloaded the full resident list, BHW list and
    // schedule list on the client just to show two badges per card.
    const worker = req.user?.role === 'BHW Worker';
    const [allResidents, bhwRes, scheduleRes] = await Promise.all([
      getResidentRiskSnapshot({
        worker,
        residentIds: req.user?.residentIds || [],
        purokId: assignedOnly,
        userKey: req.user?.bhwId || req.user?.userId,
      }),
      supabase
        .from('bhws')
        .select('bhw_id, name, assigned_purok_id, status, position, worker_type'),
      supabase
        .from('schedules')
        .select('schedule_id, scope, purok_id, resident_id'),
    ]);

    const byPurok = {};
    for (const r of (allResidents || [])) {
      const pid = r.purok_id;
      if (!byPurok[pid]) byPurok[pid] = { critical: 0, high: 0, moderate: 0, low: 0, total: 0, scoreSum: 0 };
      byPurok[pid].total++;
      byPurok[pid].scoreSum += r.risk_score ?? 0;
      switch (r.risk_level) {
        case 'Critical Risk': case 'Critical Health Risk': byPurok[pid].critical++; break;
        case 'High Risk': case 'High Health Risk': byPurok[pid].high++; break;
        case 'Moderate Risk': case 'Moderate Health Risk': byPurok[pid].moderate++; break;
        default: byPurok[pid].low++; break;
      }
    }

    // Active BHW Workers assigned to each purok (same predicate the UI used).
    const assignedByPurok = {};
    for (const b of (bhwRes.data || [])) {
      if (b.status && b.status !== 'Active') continue;
      const isBhw = b.position === 'Barangay Health Worker' || b.worker_type === 'BHW';
      if (!isBhw || b.assigned_purok_id == null) continue;
      const key = String(b.assigned_purok_id);
      (assignedByPurok[key] = assignedByPurok[key] || []).push({ id: b.bhw_id, name: b.name });
    }

    // Schedules per purok, mirroring the old client-side predicate:
    // purok-scoped (by id or the resident's purok), barangay-wide (every purok)
    // and individual schedules attributed to the resident's purok.
    const residentPurok = {};
    for (const r of (allResidents || [])) {
      if (r.resident_id != null) residentPurok[String(r.resident_id)] = String(r.purok_id);
    }
    const scheduleCounts = {};
    for (const s of (scheduleRes.data || [])) {
      const linked = new Set();
      if (s.scope === 'barangay') {
        for (const p of (data || [])) linked.add(String(p.purok_id));
      } else if (s.scope === 'purok') {
        const pid = s.purok_id != null
          ? String(s.purok_id)
          : (s.resident_id != null ? residentPurok[String(s.resident_id)] : null);
        if (pid) linked.add(pid);
      } else if (s.scope === 'individual' && s.resident_id != null) {
        const pid = residentPurok[String(s.resident_id)];
        if (pid) linked.add(pid);
      }
      for (const pid of linked) {
        scheduleCounts[pid] = (scheduleCounts[pid] || 0) + 1;
      }
    }

    // Classify each purok by the aggregated (average) health risk score
    // of its residents, using the same thresholds as individual residents.
    const classifyAvgScore = classifyPurokAvgScore;

    const puroksWithStats = (data || []).map(purok => {
      const d = byPurok[purok.purok_id] || { critical: 0, high: 0, moderate: 0, low: 0, total: 0, scoreSum: 0 };
      const averageRiskScore = d.total > 0 ? Math.round(d.scoreSum / d.total) : 0;
      return {
        id: purok.purok_id,
        name: purok.name,
        latitude: purok.latitude,
        longitude: purok.longitude,
        pinLabel: purok.pin_label || null,
        totalResidents: d.total,
        critical: d.critical,
        high: d.high,
        moderate: d.moderate,
        low: d.low,
        averageRiskScore,
        riskLevel: classifyAvgScore(averageRiskScore),
        assignedBhws: assignedByPurok[String(purok.purok_id)] || [],
        totalSchedules: scheduleCounts[String(purok.purok_id)] || 0,
      };
    });

    res.json({ success: true, data: puroksWithStats });
  } catch (error) {
    console.error('Error fetching puroks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch puroks' });
  }
};

// Token-scoped variant for the BHW portal: full detail of the handled
// purok only (residents, risk breakdown, assigned BHW = self).
export const getMyPurok = async (req, res) => {
  try {
    if (!req.user?.bhwId) {
      return res.status(404).json({ success: false, message: 'No BHW profile linked to this account' });
    }
    const { data, error } = await supabase
      .from('bhws')
      .select('assigned_purok_id')
      .eq('bhw_id', req.user.bhwId)
      .maybeSingle();
    if (error) throw error;
    const purokId = data?.assigned_purok_id ?? req.user?.assignedPurokId ?? null;
    if (!purokId) {
      return res.json({ success: true, data: null, message: 'No purok assigned to your account' });
    }
    req.params.id = String(purokId);
    return getPurokById(req, res);
  } catch (error) {
    console.error('Error fetching my purok:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch purok' });
  }
};

export const getPurokById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'BHW Worker') {
      const { data: me } = await supabase
        .from('bhws')
        .select('assigned_purok_id')
        .eq('bhw_id', req.user.bhwId)
        .maybeSingle();
      const assigned = me?.assigned_purok_id ?? req.user?.assignedPurokId ?? null;
      if (!assigned || String(assigned) !== String(id)) {
        return res.status(403).json({ success: false, message: 'You can only view your assigned purok' });
      }
    }

    const { data: purok, error: purokError } = await supabase
      .from('puroks')
      .select('*')
      .eq('purok_id', id)
      .single();

    if (purokError || !purok) {
      return res.status(404).json({ success: false, message: 'Purok not found' });
    }

    // Get residents with cached risk levels/scores
    const { data: residents, error: residentError } = await supabase
      .from('residents')
      .select(`
        resident_id,
        name,
        age,
        gender,
        date_of_birth,
        contact_number,
        last_checkup,
        focus_groups,
        is_pwd,
        risk_score,
        risk_level
      `)
      .eq('purok_id', id)
      .order('resident_id', { ascending: false });

    if (residentError) throw residentError;

    // Get BHW assigned to this purok
    const { data: bhw, error: bhwError } = await supabase
      .from('bhws')
      .select('bhw_id, name, contact_number, email')
      .eq('assigned_purok_id', id)
      .eq('status', 'Active')
      .maybeSingle();

    // Residents carry their cached risk score/level
    const residentsWithRisk = residents.map(resident => {
      const hasMissedCheckup = !resident.last_checkup ||
        new Date(resident.last_checkup) < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      return {
        id: resident.resident_id,
        name: resident.name,
        age: resident.age,
        gender: resident.gender,
        dateOfBirth: resident.date_of_birth,
        contactNumber: resident.contact_number,
        lastCheckup: resident.last_checkup,
        focusGroups: resident.focus_groups || [],
        isPwd: resident.is_pwd || false,
        purok: purok.name,
        purokId: id,
        riskScore: resident.risk_score ?? 0,
        riskLevel: resident.risk_level || 'Low Health Risk',
        missedCheckup: hasMissedCheckup
      };
    });

    const critical = residentsWithRisk.filter(r => r.riskLevel === 'Critical Health Risk' || r.riskLevel === 'Critical Risk').length;
    const high = residentsWithRisk.filter(r => r.riskLevel === 'High Health Risk' || r.riskLevel === 'High Risk').length;
    const moderate = residentsWithRisk.filter(r => r.riskLevel === 'Moderate Health Risk' || r.riskLevel === 'Moderate Risk').length;
    const low = residentsWithRisk.filter(r => r.riskLevel === 'Low Health Risk' || r.riskLevel === 'Low Risk').length;

    // Classify the purok by the aggregated (average) health risk score
    // of its residents, using the same thresholds as individual residents.
    const scoreSum = residentsWithRisk.reduce((sum, r) => sum + (r.riskScore || 0), 0);
    const averageRiskScore = residentsWithRisk.length > 0 ? Math.round(scoreSum / residentsWithRisk.length) : 0;
    const purokRiskLevel = classifyPurokAvgScore(averageRiskScore);

    res.json({
      success: true,
      data: {
        id: purok.purok_id,
        name: purok.name,
        totalResidents: residents.length,
        riskLevel: purokRiskLevel,
        averageRiskScore,
        critical,
        high,
        moderate,
        low,
        assignedBHW: bhw ? {
          id: bhw.bhw_id,
          name: bhw.name,
          contactNumber: bhw.contact_number,
          email: bhw.email
        } : null,
        residents: residentsWithRisk
      }
    });
  } catch (error) {
    console.error('Error fetching purok:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch purok' });
  }
};

export const createPurok = async (req, res) => {
  try {
    const errors = validatePurokPayload(req.body || {});
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const name = trimText(req.body.name);

    const { data, error } = await supabase
      .from('puroks')
      .insert({ name })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'Purok name already exists', errors: { name: 'A purok with this name already exists.' } });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      data: {
        id: data.purok_id,
        name: data.name
      }
    });
  } catch (error) {
    console.error('Error creating purok:', error);
    res.status(500).json({ success: false, message: 'Failed to create purok' });
  }
};

export const updatePurok = async (req, res) => {
  try {
    const errors = validatePurokPayload(req.body || {});
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const { id } = req.params;
    const name = trimText(req.body.name);

    const { data: existing, error: existingError } = await supabase
      .from('puroks')
      .select('purok_id')
      .eq('purok_id', id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ success: false, message: 'Purok not found' });
    }

    const { data, error } = await supabase
      .from('puroks')
      .update({ name: name.trim() })
      .eq('purok_id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'Purok name already exists', errors: { name: 'A purok with this name already exists.' } });
      }
      throw error;
    }

    res.json({
      success: true,
      data: { id: data.purok_id, name: data.name },
      message: 'Purok updated successfully'
    });
  } catch (error) {
    console.error('Error updating purok:', error);
    res.status(500).json({ success: false, message: 'Failed to update purok' });
  }
};

export const updatePurokLocation = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validatePurokLocationPayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const { id } = req.params;
    const { latitude, longitude, pinLabel } = body;

    const hasCoords = latitude !== undefined && latitude !== null && latitude !== '' && longitude !== undefined && longitude !== null && longitude !== '';
    const hasLabel = pinLabel !== undefined && pinLabel !== null;

    const update = {};
    if (hasCoords) {
      update.latitude = Number(latitude);
      update.longitude = Number(longitude);
    }
    if (hasLabel) {
      const label = String(pinLabel).trim().slice(0, 3);
      update.pin_label = label === '' ? null : label;
    }

    const { data: existing, error: existingError } = await supabase
      .from('puroks')
      .select('purok_id')
      .eq('purok_id', id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ success: false, message: 'Purok not found' });
    }

    const { error } = await supabase
      .from('puroks')
      .update(update)
      .eq('purok_id', id);

    if (error) {
      if (String(error.message).toLowerCase().includes('column')) {
        const needsPinLabel = String(error.message).toLowerCase().includes('pin_label');
        return res.status(500).json({
          success: false,
          message: needsPinLabel
            ? 'Pin label storage is not available yet. Please contact the administrator.'
            : 'Purok location storage is not available yet. Please contact the administrator.',
        });
      }
      throw error;
    }

    res.json({
      success: true,
      message: 'Purok location updated successfully',
      data: { id, ...update }
    });
  } catch (error) {
    console.error('Error updating purok location:', error);
    res.status(500).json({ success: false, message: 'Failed to update purok location' });
  }
};

export const deletePurok = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if purok exists first
    const { data: existing, error: existingError } = await supabase
      .from('puroks')
      .select('purok_id')
      .eq('purok_id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Purok not found' });
    }

    // Check if purok has associated records
    const { data: residents } = await supabase
      .from('residents')
      .select('resident_id')
      .eq('purok_id', id)
      .limit(1);

    if (residents && residents.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete purok with associated residents'
      });
    }

    const { data: bhws } = await supabase
      .from('bhws')
      .select('bhw_id')
      .eq('assigned_purok_id', id)
      .limit(1);

    if (bhws && bhws.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete purok with associated BHWs'
      });
    }

    const { error } = await supabase
      .from('puroks')
      .delete()
      .eq('purok_id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Purok deleted successfully' });
  } catch (error) {
    console.error('Error deleting purok:', error);
    res.status(500).json({ success: false, message: 'Failed to delete purok' });
  }
};