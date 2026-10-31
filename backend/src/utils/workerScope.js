export const buildWorkerResidentScope = (residents, purokId, focusGroup, matchesFocus) => {
  const purokResidentIds = residents
    .filter(r => purokId != null && String(r.purok_id) === String(purokId))
    .map(r => r.resident_id);
  const focusResidentIds = focusGroup
    ? residents.filter(r => matchesFocus(r, focusGroup)).map(r => r.resident_id)
    : [];
  return {
    purokResidentIds,
    focusResidentIds,
    residentIds: [...new Set([...purokResidentIds, ...focusResidentIds])]
  };
};

// Tolerant focus-group match shared by worker-scoped write paths that do
// not run through scopeForWorker (e.g. medicine records): literal tag,
// senior/infant derived from age or date of birth, plus known aliases.
// Rows must carry focus_groups and, for derived matches, age/date_of_birth.
export const matchesFocusGroup = (r, focusGroup) => {
  if (!focusGroup) return false;
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
