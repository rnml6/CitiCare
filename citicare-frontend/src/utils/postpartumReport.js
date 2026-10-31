// utils/postpartumReport.js
// BHW postpartum report helpers — Excel postpartum-tab parity (16 cols A..P,
// matching PregnancyTracking_GUMAMELA_09-19-2026.xlsx postpartum tab).
import XLSX from 'xlsx-js-style'
import { defaultReportMeta, maternalStamp, styleTableRange, META_TOP_BOTTOM_BORDER } from './prenatalReport'

// Row 2 (0-indexed row 1) — group headers (16 cols A..P, no registration)
const headerRow2 = [
  'No',
  'Buong Pangalan\n(Full Name) ng nanay',
  '',
  'Kinahinatnan ng Pagbubuntis\n(Pregnancy Outcome)\n(Para sa lahat: ilagay ang petsa)',
  '',
  '',
  '',
  'Pagpapakonsulta ng Ina at Sanggol matapos Makapanganak\n(Maternal and Child Postnatal Check-ups)\n(Ilagay ang petsa ng konsulta)',
  '',
  '',
  '',
  'Rehistrasyong Sibil\n(Civil Registration)\n(Ilagay ang petsa at lugar ng pagkamatay)',
  '',
  '',
  'Mga Puna o Tala\n(Remarks)',
  'PREGNANCY OUTCOME (SAAN UMANAK, SINO NAGPAANAK, NORMAL OR CS) at Timbang Bata.',
]

// Row 3 (0-indexed row 2) — sub headers
const headerRow3 = [
  '',
  '',
  'Kaarawan at Edad',
  'Ipinanganak nang Buhay\n(Live birth)',
  'Ipinanganak nang Kulang sa Buwan\n(Preterm birth)',
  'Namatay sa loob ng Sinapupunan\n(Stillbirth)',
  'Naagas o Nalaglag\n(Abortion)',
  'Sa loob ng 24 oras matapos manganak',
  'Sa ika-3 araw matapos manganak',
  'Sa ika 7-14 na araw matapos manganak',
  'Sa ika-6 na linggo matapos manganak',
  'Pagkamatay ng Ina',
  'Namatay sa loob ng sinapupunan',
  'Maagang Pagkamatay ng Sanggol (0-7 araw)',
  '',
  '',
]

const rowToArray = (r, index) => [
  index + 1,
  r.name || '',
  r.birthdayAge || '',
  r.liveBirth || '',
  r.pretermBirth || '',
  r.stillbirth || '',
  r.abortion || '',
  r.postnatal24h || '',
  r.postnatalDay3 || '',
  r.postnatalDay714 || '',
  r.postnatalWeek6 || '',
  r.maternalDeathDate || '',
  r.stillbirthReg || '',
  r.neonatalDeathDate || '',
  r.remarks || '',
  r.outcomeDetails || '',
]

export const buildPostpartumSheetData = (residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  return [
    [],
    headerRow2,
    headerRow3,
    ...residents.map((r, i) => rowToArray(r, i)),
    [],
    // Sample layout: ['', 'Administered by: ', '<name>'] — label and name
    // in separate columns (B and C), always present.
    ['', 'Administered by: ', m.exportedBy || ''],
  ]
}

export const POSTPARTUM_MERGES = [
  { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // A2:A3 No
  { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // B2:B3 mother name
  { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } }, // D2:G2 outcome
  { s: { r: 1, c: 7 }, e: { r: 1, c: 10 } }, // H2:K2 postnatal
  { s: { r: 1, c: 11 }, e: { r: 1, c: 13 } }, // L2:N2 civil registry
  { s: { r: 1, c: 14 }, e: { r: 2, c: 14 } }, // O2:O3 remarks
  { s: { r: 1, c: 15 }, e: { r: 2, c: 15 } }, // P2:P3 narrative
]

// 0-indexed rows of the two-tier table header. Keep in sync with
// buildPostpartumSheetData.
export const POSTPARTUM_HEADER_FIRST_ROW = 1
export const POSTPARTUM_HEADER_LAST_ROW = 2

export const appendPostpartumSheet = (wb, residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const ws = XLSX.utils.aoa_to_sheet(buildPostpartumSheetData(residents, m))
  ws['!merges'] = POSTPARTUM_MERGES
  const headerFirstRow = POSTPARTUM_HEADER_FIRST_ROW
  const headerLastRow = POSTPARTUM_HEADER_LAST_ROW
  const lastDataRow = headerLastRow + residents.length
  styleTableRange(ws, {
    firstRow: headerFirstRow,
    lastRow: lastDataRow,
    firstCol: 0,
    lastCol: 15,
    headerRows: [headerFirstRow, headerLastRow],
  })
  // Admin row: Excel row after one blank row following the data
  // (0-indexed: headerLastRow + residents.length + 2), cols B:C with
  // top+bottom thin borders only — exactly like the sample file.
  const adminRow = headerLastRow + residents.length + 2
  for (let c = 1; c <= 2; c++) {
    const addr = XLSX.utils.encode_cell({ r: adminRow, c })
    const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
    cell.s = {
      border: META_TOP_BOTTOM_BORDER,
      font: { sz: 11 },
    }
  }
  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][headerFirstRow] = { hpt: 49.95 }
  ws['!rows'][headerLastRow] = { hpt: 49.95 }
  // Exact column widths from PregnancyTracking_GUMAMELA_09-19-2026.xlsx
  // (postpartum tab). Unset columns use Excel's default width.
  // Use `width` (not `wch`) so xlsx-js-style writes the exact value.
  ws['!cols'] = [
    { width: 5.77734375 }, // A No
    { width: 30.77734375 }, // B Mother name
    { width: 20.77734375 }, // C Birthday + age
    { width: 16.77734375 }, // D Live birth
    undefined, // E Preterm (default)
    undefined, // F Stillbirth (default)
    undefined, // G Abortion (default)
    undefined, // H 24h (default)
    undefined, // I Day 3 (default)
    undefined, // J 7-14d (default)
    undefined, // K Week 6 (default)
    undefined, // L Maternal death (default)
    undefined, // M Stillbirth reg (default)
    undefined, // N Neonatal death (default)
    { width: 26.77734375 }, // O Remarks
    { width: 60.77734375 }, // P Outcome narrative
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'postpartum')
  return ws
}

export const downloadPostpartumXlsx = (residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const wb = XLSX.utils.book_new()
  appendPostpartumSheet(wb, residents, m)
  // cellStyles: true is required for borders/fonts to persist in the file.
  XLSX.writeFile(wb, `Postpartum_${m.barangay}_${maternalStamp()}.xlsx`, { cellStyles: true })
}

export const postpartumToCSV = (residents = [], meta = {}) => {
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'No', 'Mother Name', 'Birthday and Age',
    'Live Birth', 'Preterm Birth', 'Stillbirth', 'Abortion',
    'Postnatal 24h', 'Postnatal Day 3', 'Postnatal 7-14 Days', 'Postnatal Week 6',
    'Maternal Death', 'Stillbirth (Civil Reg)', 'Neonatal Death (0-7d)',
    'Remarks', 'Outcome Details',
  ]
  const lines = [header.map(cell).join(',')]
  residents.forEach((r, i) => {
    lines.push(rowToArray(r, i).map(cell).join(','))
  })
  if (meta.exportedBy) lines.push('', `Administered by:,${cell(meta.exportedBy)}`)
  return '﻿' + lines.join('\r\n')
}
