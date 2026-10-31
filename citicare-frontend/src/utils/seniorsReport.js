// utils/seniorsReport.js
// Senior Citizen export — mirrors the sample file
// "CitiCare_Senior_Citizen_Health_Monitoring_Report_09-19-2026.xlsx" exactly:
// sheet 'Senior Citizen Report', title row, Basic Information (5) +
// Latest Health Measurements (10) + Vaccines (2) + Medical Information (4)
// groups, slate group headers, ice sub-headers, thin grid borders,
// 30 / default / 45 row heights. NOTE: per the sample, the Chronic
// Conditions column (col O) sits under Latest Health Measurements
// (F2:O2), while Vaccines (P2:Q2) holds Pneumococcal then Influenza.
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

const thinTopBottom = {
  top: { style: 'thin', color: { rgb: GRID } },
  bottom: { style: 'thin', color: { rgb: GRID } },
}

// 0-indexed column order (21 cols A..U)
const headerRow2 = [
  'Basic Information',
  '',
  '',
  '',
  '',
  'Latest Health Measurements',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'Vaccines',
  '',
  'Medical Information',
  '',
  '',
  '',
]

const headerRow3 = [
  'Senior Citizen Name',
  'Age',
  'Sex',
  'Contact Number',
  'Purok',
  'Latest Checkup Date',
  'No. of Missed Checkups',
  'Latest Weight (kg)',
  'Latest Height (cm)',
  'Latest BMI',
  'Latest Temperature (°C)',
  'Latest Blood Pressure (BP)',
  'Latest Heart Rate (bpm)',
  'Latest Fasting Blood Sugar (mg/dL)',
  'Chronic Conditions (Condition – Severity/Status)',
  'Pneumococcal Vaccine (PPSV23) (Date)',
  'Influenza (Flu) Vaccine (Date)',
  'Mobility / Functional Status',
  'Current Medications',
  'Allergies',
  'Remarks',
]

const rowToArray = (r) => [
  r.name || '',
  r.age ?? '',
  r.gender || '',
  r.contactNumber || '',
  r.purok || '',
  r.lastCheckup || '',
  r.missedCount ?? '',
  r.weight || '',
  r.height || '',
  r.bmi || '',
  r.temperature || '',
  r.bloodPressure || '',
  r.heartRate || '',
  r.bloodSugar || '',
  r.chronic || '',
  r.pneumoDate || '',
  r.fluDate || '',
  r.mobility || '',
  r.medications || '',
  r.allergies || '',
  r.remarks || '',
]

export const buildSeniorsSheetData = (residents = [], meta = {}) => {
  const m = { exportedBy: '', ...meta }
  return [
    ['CitiCare \u2013 Senior Citizen Health Monitoring Report'],
    headerRow2,
    headerRow3,
    ...residents.map((r) => rowToArray(r)),
    [],
    ...(m.exportedBy ? [['', 'Administered By:', m.exportedBy]] : []),
  ]
}

export const SENIORS_MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 20 } }, // A1:U1 title
  { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // A2:E2 Basic Information
  { s: { r: 1, c: 5 }, e: { r: 1, c: 14 } }, // F2:O2 Latest Health Measurements
  { s: { r: 1, c: 15 }, e: { r: 1, c: 16 } }, // P2:Q2 Vaccines
  { s: { r: 1, c: 17 }, e: { r: 1, c: 20 } }, // R2:U2 Medical Information
]

const styleCell = (ws, r, c, style) => {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
  cell.s = style
}

const groupHeader = (border) => ({
  font: { name: 'Calibri', bold: true, sz: 11, color: { rgb: WHITE } },
  fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
  border,
  alignment: { horizontal: 'center', vertical: 'center' },
})

export const downloadSeniorsXlsx = (residents = [], meta = {}) => {
  const m = { barangay: 'GUMAMELA', ...meta }
  const ws = XLSX.utils.aoa_to_sheet(buildSeniorsSheetData(residents, m))
  ws['!merges'] = SENIORS_MERGES

  styleCell(ws, 0, 0, {
    font: { name: 'Calibri', bold: true, sz: 16, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  for (let c = 0; c <= 4; c++) styleCell(ws, 1, c, groupHeader(thinGrid))
  for (let c = 5; c <= 14; c++) {
    styleCell(ws, 1, c, {
      ...groupHeader(thinGrid),
      border: { top: thinGrid.top, bottom: thinGrid.bottom },
    })
  }
  for (let c = 15; c <= 16; c++) styleCell(ws, 1, c, groupHeader(thinGrid))
  for (let c = 17; c <= 20; c++) {
    styleCell(ws, 1, c, {
      ...groupHeader(thinGrid),
      border: { top: thinGrid.top, bottom: thinGrid.bottom },
    })
  }
  for (let c = 0; c <= 20; c++) {
    styleCell(ws, 2, c, {
      font: { name: 'Calibri', bold: true, sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: ICE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    })
  }
  for (let r = 3; r < 3 + residents.length; r++) {
    for (let c = 0; c <= 20; c++) {
      styleCell(ws, r, c, {
        font: { name: 'Calibri', sz: 11 },
        border: thinGrid,
        alignment: { vertical: 'center', wrapText: true, horizontal: 'left' },
      })
    }
  }

  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][0] = { hpt: 30 }
  ws['!rows'][2] = { hpt: 45 }
  // Exact sample column widths (A..U). Writer adds ~0.83 padding, so
  // subtract it to land on the sample widths.
  const exactW = (n) => ({ wch: Math.round((n - 0.83203125) * 1000000) / 1000000 })
  ws['!cols'] = [
    exactW(22.77734375), // A Senior Citizen Name
    exactW(16.77734375), // B Age
    exactW(13), // C Sex
    exactW(13), // D Contact Number
    exactW(13), // E Purok
    exactW(13), // F Latest Checkup Date
    exactW(13), // G No. of Missed Checkups
    exactW(13), // H Latest Weight
    exactW(13), // I Latest Height
    exactW(13), // J Latest BMI
    exactW(13), // K Latest Temperature
    exactW(13), // L Latest Blood Pressure
    exactW(13), // M Latest Heart Rate
    exactW(40.77734375), // N Latest Fasting Blood Sugar
    exactW(22.77734375), // O Influenza Vaccine
    exactW(13), // P Pneumococcal Vaccine
    exactW(13), // Q Chronic Conditions
    exactW(25.77734375), // R Mobility / Functional Status
    exactW(13), // S Current Medications
    exactW(13), // T Allergies
    exactW(13), // U Remarks
  ]
  if (m.exportedBy) {
    const fr = 3 + residents.length + 1
    styleCell(ws, fr, 1, {
      font: { name: 'Calibri', bold: true, sz: 11, color: { rgb: WHITE } },
      fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    styleCell(ws, fr, 2, {
      font: { name: 'Calibri', sz: 11 },
      border: thinGrid,
      alignment: { horizontal: 'left', vertical: 'center' },
    })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Senior Citizen Report')
  XLSX.writeFile(wb, `CitiCare_Senior_Citizen_Health_Monitoring_Report_${maternalStamp()}.xlsx`, { cellStyles: true })
}
