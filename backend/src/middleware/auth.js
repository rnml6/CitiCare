import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth.js';
import { buildWorkerResidentScope } from '../utils/workerScope.js';
import { cacheRemember } from '../utils/cache.js';

const getBearerToken = (req) => {
  const header = req.headers?.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

export const authenticate = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Used by the one-time admin bootstrap route: a valid token is attached when
// supplied, but its absence is allowed so the first administrator can be
// created. The controller decides whether an admin is required.
export const optionalAuthenticate = (req, _res, next) => {
  const token = getBearerToken(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, getJwtSecret());
  } catch {
    // An invalid supplied token must not silently become an anonymous
    // bootstrap attempt. Mark it so the controller can reject it.
    req.authInvalid = true;
  }
  return next();
};

export const authorizeAdmin = (req, res, next) => {
  // Check for 'Barangay Administrator', 'Administrator' (from registerAdmin),
  // 'admin' (lowercase), and 'BHW Admin'
  const allowed = ['Barangay Administrator', 'Administrator', 'admin', 'BHW Admin'];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  next();
};

export const authorizeBHW = (req, res, next) => {
  if (req.user?.role !== 'BHW Worker' && req.user?.role !== 'BHW Admin' && req.user?.role !== 'Administrator' && req.user?.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'BHW access required' 
    });
  }
  next();
};

export const isAdminLike = (role) => {
  return ['Barangay Administrator', 'Administrator', 'admin', 'BHW Admin'].includes(role);
};

// Barangay-wide endpoints (global stats, AI, planning). BHW Workers have
// their own scoped equivalents (/bhw-home, /bhw-interventions, /mine).
export const forbidBHWWorker = (req, res, next) => {
  if (req.user?.role === 'BHW Worker') {
    return res.status(403).json({
      success: false,
      message: 'Not available for BHW accounts. Use your My Home dashboard.'
    });
  }
  next();
};

export const isBHWWorker = (req) => req.user?.role === 'BHW Worker';

// Attach BHW scope to req.user for BHW Workers so shared dashboard
// endpoints only ever see the worker's own footprint:
//   - handled purok (req.user.purokId) + all residents in it
//     (req.user.purokResidentIds, also mirrored to req.user.residentIds)
//   - handled focus/vulnerable group, if assigned (req.user.focusGroup)
//     + the matching subset (req.user.focusResidentIds)
//   - own BHW identity for assignment-based schedule filtering (req.user.bhwId)
// Admins pass through unmodified. For workers the middleware resolves the
// current assignment from the database (never trusts a cached JWT).
const workerResidentMatchesFocus = (r, focusGroup) => {
  if (!focusGroup) return true;
  const g = String(focusGroup).trim().toLowerCase();
  const groups = (r.focus_groups || []).map(x => String(x).trim().toLowerCase());
  if (groups.includes(g)) return true;
  if (g === 'senior') {
    if (groups.includes('seniorcitizen') || groups.includes('senior citizen')) return true;
    if (r.date_of_birth) {
      const b = new Date(r.date_of_birth);
      if (!isNaN(b.getTime())) {
        let years = new Date().getFullYear() - b.getFullYear();
        const m = new Date().getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && new Date().getDate() < b.getDate())) years--;
        if (years >= 60) return true;
      }
    }
    if (parseInt(r.age, 10) >= 60) return true;
  }
  if (g === 'infant') {
    if (groups.includes('children') || groups.includes('child')) return true;
    if (r.date_of_birth) {
      const b = new Date(r.date_of_birth);
      if (!isNaN(b.getTime())) {
        const months = (new Date().getFullYear() - b.getFullYear()) * 12 + (new Date().getMonth() - b.getMonth());
        if (months >= 0 && months < 60) return true;
      }
    }
    const y = parseInt(r.age, 10);
    if (Number.isFinite(y) && y >= 0 && y < 5) return true;
  }
  return false;
};
export const scopeForWorker = async (req, res, next) => {
  if (req.user?.role !== 'BHW Worker') return next();
  try {
    // Resolving a worker's scope means reading their assignment AND paging
    // through every resident in the barangay (4 round trips for ~3.6k
    // residents). Doing that on every single API call added ~0.7s to each
    // request in the BHW portal. The resolved scope is identity-based, so it
    // is cached briefly and dropped whenever any write happens.
    const scope = await cacheRemember(
      `worker-scope:${req.user.userId}`,
      60 * 1000,
      async () => {
        // Lazy-import supabase to avoid circular deps at module load time.
        const { supabase } = await import('../config/supabase.js');
        const { data: me, error } = await supabase
          .from('bhws')
          .select('bhw_id, assigned_purok_id, assigned_focus_group')
          .eq('user_id', req.user.userId)
          .maybeSingle();
        if (error) throw error;
        if (!me) {
          return { bhwId: null, purokId: null, focusGroup: null, purokResidentIds: [], focusResidentIds: [], residentIds: [] };
        }
        const focusGroup = me.assigned_focus_group || null;
        const residents = [];
        if (me.assigned_purok_id || focusGroup) {
          for (let offset = 0; ; offset += 1000) {
            let query = supabase.from('residents')
              .select('resident_id, purok_id, focus_groups, age, date_of_birth')
              .order('resident_id').range(offset, offset + 999);
            // The handled focus/vulnerable group is barangay-wide (e.g. a
            // BHW handling pregnant covers all pregnant in the barangay), so
            // the purok filter applies only to purok-only assignments.
            // buildWorkerResidentScope still splits purok vs focus ids itself.
            if (me.assigned_purok_id && !focusGroup) query = query.eq('purok_id', me.assigned_purok_id);
            const { data, error: residentError } = await query;
            if (residentError) throw residentError;
            residents.push(...(data || []));
            if (!data || data.length < 1000) break;
          }
        }
        const resolved = buildWorkerResidentScope(residents, me.assigned_purok_id, focusGroup, workerResidentMatchesFocus);
        return {
          bhwId: me.bhw_id ?? null,
          purokId: me.assigned_purok_id,
          focusGroup,
          ...resolved,
        };
      }
    );

    req.user.bhwId = scope.bhwId ?? req.user?.bhwId ?? null;
    req.user.purokId = scope.purokId;
    req.user.focusGroup = scope.focusGroup;
    req.user.purokResidentIds = scope.purokResidentIds || [];
    req.user.focusResidentIds = scope.focusResidentIds || [];
    req.user.residentIds = scope.residentIds || [];
    next();
  } catch (err) {
    console.error('scopeForWorker failed:', err.message);
    // Fail open with empty scope rather than blocking the request.
    req.user.purokId = null;
    req.user.focusGroup = req.user?.assignedFocusGroup ?? null;
    req.user.purokResidentIds = [];
    req.user.focusResidentIds = [];
    req.user.residentIds = [];
    return res.status(500).json({ success: false, message: 'Failed to resolve your BHW assignment' });
  }
};

// BHW Workers may only touch their own bhwId; admins (incl. BHW Admin) pass.
// Looks at :id, :bhwId, or body.bhwId.
export const requireSelfBhwOrAdmin = (req, res, next) => {
  if (isAdminLike(req.user?.role)) return next();
  const target = req.params?.bhwId ?? req.params?.id ?? req.body?.bhwId ?? null;
  if (target != null && String(target) !== String(req.user?.bhwId)) {
    return res.status(403).json({
      success: false,
      message: 'You can only access your own assigned records'
    });
  }
  if (target == null && !req.user?.bhwId) {
    return res.status(403).json({
      success: false,
      message: 'No BHW profile linked to this account'
    });
  }
  next();
};
