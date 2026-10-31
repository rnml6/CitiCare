// utils/infantsReport.js
// Infants (0-59 months) export — mirrors the sample file
// "CitiCare_Multiple_Infants_Vaccination_Report.xlsx" exactly:
// sheet 'Infant Vaccination Report', title row, two-tier headers
// (5 identity cols + 15 vaccine dose cols + 6 latest-vitals cols),
// slate + ice-blue header palette, thin grid borders, 28.05/28.05/30 heights.
import XLSX from 'xlsx-js-style'
import { maternalStamp } from './prenatalReport'

const SLATE = 'FF566B80'
const ICE = 'FFDCE4EA'
const GRID = 'FFB7C0C8'
const WHITE = 'FFFFFFFF'

const thinGrid = {
  top: { style: 'thin', color: { rgb: GRID } },
  bottom: { style: 'thin', color: { rgb: GRID } },
  left: { style: 'thin', color: { rgb: GRID } },
  right: { style: 'thin', color: { rgb: GRID } },
}

// 0-indexed column order (26 cols A..Z)
const headerRow2 = [
  'Name',
  'Age',
  'Purok',
  'Gender',
  'Contact Number',
  'BCG',
  'Hepatitis B',
  'Pentavalent',
  '',
  '',
  'OPV',
  '',
  '',
  'IPV',
  '',
  'PCV',
  '',
  '',
  'MCV / MMR',
  '',
  'Latest Weight (kg)',
  'Latest Length (cm)',
  'Latest Head Circumference (cm)',
  'Temperature (°C)',
  'Heart Rate (bpm)',
  'Respiratory Rate (breaths/min)',
]

const headerRow3 = [
  '', '', '', '', '',
  'Pagkapanganak',
  'Pagkapanganak',
  '1 & 1/2 month', '2 & 1/2 month', '3 & 1/2 month',
  '1 & 1/2 month', '2 & 1/2 month', '3 & 1/2 month',
  '3 & 1/2 month', '9 months',
  '1 & 1/2 month', '2 & 1/2 month', '3 & 1/2 month',
  '9 months', '1 year',
  '', '', '', '', '', '',
]

// Columns that use the dark slate vaccine-group header style WITHOUT wrap
// (short single-dose headers: BCG, Hepatitis B). Every other row-2 header
// is also dark slate, with wrap.
const VACCINE_NOWRAP_COLS = new Set([5, 6])

const rowToArray = (r) => [
  r.name || '',
  r.ageDisplay || '',
  r.purok || '',
  r.gender || '',
  r.contactNumber || '',
  r.vaccines?.bcg?.[0] || '',
  r.vaccines?.hepb?.[0] || '',
  r.vaccines?.penta?.[0] || '',
  r.vaccines?.penta?.[1] || '',
  r.vaccines?.penta?.[2] || '',
  r.vaccines?.opv?.[0] || '',
  r.vaccines?.opv?.[1] || '',
  r.vaccines?.opv?.[2] || '',
  r.vaccines?.ipv?.[0] || '',
  r.vaccines?.ipv?.[1] || '',
  r.vaccines?.pcv?.[0] || '',
  r.vaccines?.pcv?.[1] || '',
  r.vaccines?.pcv?.[2] || '',
  r.vaccines?.mcv?.[0] || '',
  r.vaccines?.mcv?.[1] || '',
  r.latestWeight || '',
  r.latestLength || '',
  r.latestHead || '',
  r.temperature || '',
  r.heartRate || '',
  r.respRate || '',
]

export const buildInfantsSheetData = (residents = [], meta = {}) => {
  const m = { exportedBy: '', ...meta }
  return [
    ['CitiCare \u2013 Infant Growth Report'],
    headerRow2,
    headerRow3,
    ...residents.map((r) => rowToArray(r)),
    [],
    [],
    ...(m.exportedBy ? [['', 'Administered By:', m.exportedBy]] : []),
  ]
}

export const INFANTS_MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 25 } }, // A1:Z1 title
  ...[0, 1, 2, 3, 4].map((c) => ({ s: { r: 1, c }, e: { r: 2, c } })),
  ...[20, 21, 22, 23, 24, 25].map((c) => ({ s: { r: 1, c }, e: { r: 2, c } })),
  { s: { r: 1, c: 7 }, e: { r: 1, c: 9 } }, // H2:J2 Pentavalent
  { s: { r: 1, c: 10 }, e: { r: 1, c: 12 } }, // K2:M2 OPV
  { s: { r: 1, c: 13 }, e: { r: 1, c: 14 } }, // N2:O2 IPV
  { s: { r: 1, c: 15 }, e: { r: 1, c: 17 } }, // P2:R2 PCV
  { s: { r: 1, c: 18 }, e: { r: 1, c: 19 } }, // S2:T2 MCV / MMR
]

const styleCell = (ws, r, c, style) => {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
  cell.s = style
}

export const downloadInfantsXlsx = (residents = [], meta = {}) => {
  const m = { barangay: 'GUMAMELA', ...meta }
  const ws = XLSX.utils.aoa_to_sheet(buildInfantsSheetData(residents, m))
  ws['!merges'] = INFANTS_MERGES

  styleCell(ws, 0, 0, {
    font: { name: 'Calibri', bold: true, sz: 16, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  for (let c = 0; c <= 25; c++) {
    const noWrap = VACCINE_NOWRAP_COLS.has(c)
    styleCell(ws, 1, c, {
      font: { name: 'Calibri', bold: true, sz: 11, color: { rgb: WHITE } },
      fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: !noWrap },
    })
  }
  for (let c = 5; c <= 19; c++) {
    styleCell(ws, 2, c, {
      font: { name: 'Calibri', bold: true, sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: ICE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  }
  for (let r = 3; r < 3 + residents.length; r++) {
    for (let c = 0; c <= 25; c++) {
      styleCell(ws, r, c, {
        font: { name: 'Calibri', sz: 11 },
        border: thinGrid,
        alignment: { vertical: 'center', wrapText: true, horizontal: c === 0 ? 'center' : 'left' },
      })
    }
  }

  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][0] = { hpt: 28.05 }
  ws['!rows'][1] = { hpt: 28.05 }
  ws['!rows'][2] = { hpt: 30 }
  // Exact sample column widths (A..Z). Writer adds ~0.83 padding, so
  // subtract it to land on the sample widths.
  const exactW = (n) => ({ wch: Math.round((n - 0.83203125) * 1000000) / 1000000 })
  ws['!cols'] = [
    exactW(22.77734375), // A Name
    exactW(18.77734375), // B Age
    exactW(13), // C Purok
    exactW(13), // D Gender
    exactW(13), // E Contact Number
    exactW(14.77734375), // F BCG
    ...Array.from({ length: 14 }, () => exactW(13)), // G..T vaccines
    exactW(18.77734375), // U Latest Weight
    ...Array.from({ length: 5 }, () => exactW(13)), // V..Z
  ]
  if (m.exportedBy) {
    const fr = 3 + residents.length + 2
    styleCell(ws, fr, 1, {
      font: { name: 'Calibri', bold: true, sz: 11, color: { rgb: WHITE } },
      fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    styleCell(ws, fr, 2, {
      font: { name: 'Calibri', sz: 11 },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Infant Vaccination Report')
  XLSX.writeFile(wb, `CitiCare_Multiple_Infants_Vaccination_Report_${maternalStamp()}.xlsx`, { cellStyles: true })
}
