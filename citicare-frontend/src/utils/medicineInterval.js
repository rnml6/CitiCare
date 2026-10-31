// utils/medicineInterval.js
// Per-dose descriptions for medicines: [{ dose, description }]
// One free-text field per dose (1..N, driven by Total Doses Required).
// Description is optional (may be empty / null) and informational only.

export const normalizeIntervals = (value) => {
  // Supabase jsonb arrives as an array, but tolerate a JSON string
  // (or anything else) so callers never crash on shape differences.
  let rows = value
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      return []
    }
  }
  if (!Array.isArray(rows)) return []
  const seen = new Set()
  return rows
    .filter((e) => e && Number.isFinite(Number(e?.dose)) && Number(e?.dose) >= 1)
    .map((e) => ({
      dose: Number(e.dose),
      description: String(e.description ?? '').trim() || null,
    }))
    .filter((e) => {
      if (seen.has(e.dose)) return false
      seen.add(e.dose)
      return true
    })
    .sort((a, b) => a.dose - b.dose)
}

// Description text for one dose number, or ''.
export const getDoseDescription = (schedule, doseNumber) => {
  const n = Number(doseNumber)
  if (!Number.isFinite(n) || n < 1) return ''
  const rows = normalizeIntervals(schedule)
  return rows.find((e) => e.dose === n)?.description || ''
}

// "Dose 1: ...; Dose 2: ..." — for cards and summaries. Skips empty.
export const intervalSummary = (schedule) =>
  normalizeIntervals(schedule)
    .filter((e) => e.description)
    .map((e) => `Dose ${e.dose}: ${e.description}`)
    .join('; ')
