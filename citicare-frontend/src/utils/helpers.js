export const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatTime = (time) => {
  if (!time) return 'N/A';
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
};

// Universal age — single source of truth for every age display.
// Single unit only: >= 1 year → years, >= 1 full month → months,
// otherwise weeks (minimum 1 week).
export const getAgeTiers = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const now = new Date();
  const b = new Date(dateOfBirth);
  if (isNaN(b.getTime()) || b > now) return null;
  const totalDays = Math.floor((now - b) / (1000 * 60 * 60 * 24));
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  // Borrow a month when the day hasn't been reached yet, so months are
  // full elapsed months (e.g. Aug 30 → Sep 8 is 0 months, not 1).
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  const weeks = Math.max(1, Math.floor(totalDays / 7));
  return { years, totalMonths, weeks, totalDays };
};

// Compact age label: "2y" / "5mo" / "1w". Falls back to the stored age.
export const formatAge = (age, dateOfBirth) => {
  const t = getAgeTiers(dateOfBirth);
  if (!t) return age != null ? `${age}y` : '';
  if (t.years >= 1) return `${t.years}y`;
  if (t.totalMonths >= 1) return `${t.totalMonths}mo`;
  return `${t.weeks}w`;
};

// Long age label: "2 years old" / "5 months old" / "1 week old".
export const formatAgeLong = (dateOfBirth) => {
  const t = getAgeTiers(dateOfBirth);
  if (!t) return '';
  if (t.years >= 1) return `${t.years} year${t.years > 1 ? 's' : ''} old`;
  if (t.totalMonths >= 1) return `${t.totalMonths} month${t.totalMonths > 1 ? 's' : ''} old`;
  return `${t.weeks} week${t.weeks > 1 ? 's' : ''} old`;
};

export const getRiskColor = (risk) => {
  switch (risk) {
    case 'Critical Risk': return 'badge-critical';
    case 'High Risk': return 'badge-high';
    case 'Moderate Risk': return 'badge-moderate';
    case 'Low Risk': return 'badge-low';
    case 'Critical Health Risk': return 'badge-critical';
    case 'High Health Risk': return 'badge-high';
    case 'Moderate Health Risk': return 'badge-moderate';
    case 'Low Health Risk': return 'badge-low';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
};

export const getRiskScoreColor = (score) => {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-orange-400';
  if (score >= 25) return 'text-yellow-400';
  return 'text-emerald-400';
};

export const getRiskScoreBg = (score) => {
  if (score >= 75) return 'bg-red-500/10 border-red-400/20';
  if (score >= 50) return 'bg-orange-500/10 border-orange-400/20';
  if (score >= 25) return 'bg-yellow-500/10 border-yellow-400/20';
  return 'bg-emerald-500/10 border-emerald-400/20';
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'Completed': return 'badge-completed';
    case 'Scheduled': return 'badge-scheduled';
    case 'Missed': return 'badge-missed';
    case 'Active': return 'badge-active';
    case 'Inactive': return 'badge-inactive';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
};

export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const FOCUS_GROUP_LABELS = {
  infant: 'Infant',
  children: 'Infant',
  senior: 'Senior Citizen',
  'senior citizen': 'Senior Citizen',
  pregnant: 'Pregnant',
  pwd: 'PWD',
  withcondition: 'With Condition',
  'with condition': 'With Condition',
  'w/condition': 'With Condition',
  'w condition': 'With Condition',
  diabetic: 'With Condition'
};

export const focusGroupLabel = (group) => {
  if (!group) return '';
  const key = String(group).trim().toLowerCase().replace(/\s+/g, '');
  if (FOCUS_GROUP_LABELS[key]) return FOCUS_GROUP_LABELS[key];
  return String(group);
};

export const focusGroupsMatch = (groups, filter) => {
  if (!groups || groups.length === 0) return false;
  if (!filter || filter === 'all') return true;
  const target = String(filter).trim().toLowerCase().replace(/\s+/g, '');
  return groups.some(g => {
    const key = String(g).trim().toLowerCase().replace(/\s+/g, '');
    return key === target || focusGroupLabel(g).toLowerCase() === focusGroupLabel(filter).toLowerCase()
      || focusGroupLabel(key).toLowerCase() === focusGroupLabel(target).toLowerCase();
  });
};