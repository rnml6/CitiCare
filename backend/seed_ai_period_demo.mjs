const prefix = 'AI PERIOD DEMO 2026-11-22';
const samples = [
  { label: 'Recent', dates: ['2026-11-10', '2026-10-08', '2026-09-29', '2026-10-29'] },
  { label: 'Quarter', dates: ['2026-09-15', '2026-08-29'] },
  { label: 'Annual', dates: ['2026-03-15', '2025-05-15', '2026-01-18'] },
];

const windows = [
  ['Monthly', '2026-10-22', '2026-09-22'],
  ['Quarterly', '2026-08-22', '2026-05-22'],
  ['Annual', '2025-11-22', '2024-11-22'],
];
const showCounts = dates => console.table(windows.map(([period, start, prior]) => ({
  period,
  current: dates.filter(date => date >= start && date <= '2026-11-22').length,
  preceding: dates.filter(date => date >= prior && date < start).length,
})));
if (!process.argv.includes('--apply')) {
  console.log('Preview only. No database connection or writes.');
  showCounts(samples.flatMap(sample => sample.dates));
  process.exit(0);
}

const { supabase } = await import('./src/config/supabase.js');
const unwrap = async query => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

const [purok] = await unwrap(supabase.from('puroks').select('purok_id').order('purok_id').limit(1));
if (!purok) throw new Error('A purok is required for the demo residents.');
const verifiedDates = [];
for (const sample of samples) {
  const name = `${prefix} ${sample.label}`;
  const notes = `Fictional encounter for ${name}. Sample data for reporting verification.`;
  const resident = await unwrap(supabase.from('residents').select('resident_id').eq('name', name).maybeSingle())
    ?? await unwrap(supabase.from('residents').insert({
      name,
      gender: 'Female',
      date_of_birth: '1990-01-01',
      age: 36,
      civil_status: 'Single',
      purok_id: purok.purok_id,
      last_checkup: sample.dates[0],
      focus_groups: [],
      is_pwd: false,
      vaccinations: [],
    }).select('resident_id').single());

  const history = () => supabase.from('medical_histories').select('date')
    .eq('resident_id', resident.resident_id).eq('notes', notes);
  const existing = new Set((await unwrap(history())).map(row => row.date));
  const rows = sample.dates.filter(date => !existing.has(date)).map(date => ({
    resident_id: resident.resident_id,
    date,
    type: 'Checkup',
    location: 'Barangay',
    facility: 'Barangay Health Center',
    diagnosis: '',
    treatment: '',
    notes,
    chronic_conditions: [],
    current_medications: [],
    allergies: { drugs: [], food: [], environmental: [] },
  }));
  if (rows.length) await unwrap(supabase.from('medical_histories').insert(rows));
  const verified = new Set((await unwrap(history())).map(row => row.date));
  for (const date of sample.dates) {
    if (!verified.has(date)) throw new Error(`Failed to verify the ${sample.label} encounter on ${date}.`);
    verifiedDates.push(date);
  }
}

showCounts(verifiedDates);
