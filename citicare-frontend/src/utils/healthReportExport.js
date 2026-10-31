// utils/healthReportExport.js
// Excel-only exporters for the Dashboard Export Health Report modal:
// General Health Report + Vulnerable Groups Report. Same organized look
// (thin grid borders, bold headers) as the maternal exports.
import XLSX from 'xlsx-js-style'
import { styleTableRange, maternalStamp } from './prenatalReport'

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

const styleCell = (ws, r, c, style) => {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
  cell.s = style
}
import {
  VULNERABLE_GROUP_META,
  classifyVulnerableResident,
  ageDisplayFor,
} from './vulnerableExport'
import { formatDate } from './helpers'

const boldRow = (ws, r, lastCol, size = 11) => {
  for (let c = 0; c <= lastCol; c++) {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
    cell.s = {
      ...(cell.s || {}),
      font: { bold: true, sz: size },
      alignment: { ...(cell.s?.alignment || {}), vertical: 'center', wrapText: true },
    }
  }
};

// ---------------- General Health Report ----------------
// Roster of residents with chronic conditions — mirrors the sample file
// "CitiCare_Barangay_General_Health_Report_09-19-2026.xlsx": title row,
// Resident Information (A2:F2) + Latest Health Measurements (G2:P2),
// checkup date as a real Excel date, Administered By footer (label in B,
// name in C).
const GENERAL_TITLE = 'CitiCare \u2013 Barangay General Health Report (Residents with Chronic Conditions)'

// Width helper: emit the exact sample widths (writer adds ~0.83 padding).
const exactW = (n) => ({ wch: Math.round((n - 0.83203125) * 1000000) / 1000000 })

const generalHeaderRow2 = [
  'Resident Information',
  '',
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
]

const generalHeaderRow3 = [
  'Resident Name',
  'Age',
  'Focus Group',
  'Sex',
  'Contact Number',
  'Purok',
  'Chronic Conditions (Condition – Severity/Status)',
  'Checkup Date',
  'Blood Pressure (BP)',
  'Fasting Blood Sugar (mg/dL)',
  'Weight (kg)',
  'Height (cm)',
  'BMI',
  'Heart Rate (bpm)',
  'Temperature (°C)',
  'No. of Missed Checkup',
]

const generalRowToArray = (r) => [
  r.name || '',
  r.age ?? '',
  r.focusGroup || '',
  r.gender || '',
  r.contactNumber || '',
  r.purok || '',
  r.chronic || '',
  r.lastCheckup ? new Date(r.lastCheckup + 'T00:00:00') : '',
  r.bloodPressure || '',
  r.bloodSugar || '',
  r.weight || '',
  r.height || '',
  r.bmi || '',
  r.heartRate || '',
  r.temperature || '',
  r.missedCount ?? '',
]

export const GENERAL_MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }, // A1:P1 title
  { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // A2:F2 Resident Information
  { s: { r: 1, c: 6 }, e: { r: 1, c: 15 } }, // G2:P2 Latest Health Measurements
]

export const downloadGeneralXlsx = ({ residents = [], exportedBy = '' } = {}) => {
  const data = [
    [GENERAL_TITLE],
    generalHeaderRow2,
    generalHeaderRow3,
    ...residents.map((r) => generalRowToArray(r)),
    [],
    [],
    ...(exportedBy ? [['', 'Administered By:', exportedBy]] : []),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!merges'] = GENERAL_MERGES

  styleCell(ws, 0, 0, {
    font: { name: 'Calibri', bold: true, sz: 16, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  const groupDark = {
    font: { name: 'Calibri', bold: true, sz: 11, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
    border: thinGrid,
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  // Sample file groups: A2:F2 Resident Information + G2:P2 Latest Health
  // Measurements — both dark slate with white bold text.
  styleCell(ws, 1, 0, groupDark)
  styleCell(ws, 1, 6, groupDark)
  for (let c = 0; c <= 15; c++) {
    styleCell(ws, 2, c, {
      font: { name: 'Calibri', bold: true, sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: ICE } },
      border: thinGrid,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    })
  }
  for (let r = 3; r < 3 + residents.length; r++) {
    for (let c = 0; c <= 15; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
      // Column H holds real Excel dates — tag the display format
      // via cell.z so Excel renders a date (sample uses mmm d, yyyy).
      if (c === 7 && (cell.v instanceof Date || typeof cell.v === 'number')) {
        cell.t = cell.v instanceof Date ? 'd' : 'n'
        cell.z = 'mmm d, yyyy'
        cell.s = {
          border: thinGrid,
          alignment: { vertical: 'top', wrapText: true },
        }
      } else {
        cell.s = {
          font: { name: 'Calibri', sz: 11 },
          border: thinGrid,
          alignment: { vertical: 'top', wrapText: true },
        }
      }
    }
  }

  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][0] = { hpt: 21 }
  ws['!rows'][2] = { hpt: 46.05 }
  residents.forEach((_, i) => { ws['!rows'][3 + i] = { hpt: 42 } })
  if (exportedBy) {
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
  // Exact sample column widths (A..P).
  ws['!cols'] = [
    exactW(25.77734375), // A Resident Name
    exactW(21.109375), // B Age
    exactW(22), // C Focus Group
    exactW(16.77734375), // D Sex
    exactW(13), // E Contact Number
    exactW(42.77734375), // F Purok
    exactW(16.77734375), // G Chronic Conditions
    exactW(13), // H Checkup Date
    exactW(22.77734375), // I BP
    exactW(16.77734375), // J Fasting Blood Sugar
    exactW(13), // K Weight
    exactW(13), // L Height
    exactW(13), // M BMI
    exactW(13), // N Heart Rate
    exactW(13), // O Temperature
    exactW(22.77734375), // P Missed Checkup
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'General Health Report')
  XLSX.writeFile(wb, `CitiCare_Barangay_General_Health_Report_${maternalStamp()}.xlsx`, { cellStyles: true })
};

// ---------------- Vulnerable Groups Report ----------------
export const downloadVulnerableXlsx = ({ group = 'all', residents = [], summary = null, periodLabel = '', exportedBy = '' } = {}) => {
  const g = String(group || 'all').trim().toLowerCase()
  const meta = VULNERABLE_GROUP_META[g] || VULNERABLE_GROUP_META.all
  const rows = []
  rows.push([`CITICARE VULNERABLE GROUPS REPORT - ${meta.label}`])
  const titleRow = 0
  rows.push(['Period', periodLabel])
  rows.push(['Generated', new Date().toLocaleString()])
  if (exportedBy) rows.push(['Administered by', exportedBy])
  rows.push(['Barangay Gumamela Healthcare Monitoring System'])
  rows.push([])
  rows.push(['SUMMARY'])
  const summaryRow = rows.length - 1
  const total = summary?.totalVulnerable ?? residents.length
  rows.push(['Total Vulnerable', 'Pregnant', 'Senior (60+)', 'Infants'])
  const summaryHeader = rows.length - 1
  rows.push([total, summary?.pregnant ?? 0, summary?.senior ?? 0, summary?.infant ?? 0])
  rows.push([])
  rows.push(['MASTER LIST'])
  const listTitle = rows.length - 1

  const header = ['#', 'Name', 'Age', 'Gender', 'Vulnerable Group(s)', 'Purok', 'Contact Number', 'Last Checkup', 'Risk Level']
  const body = residents.map((r, i) => {
    const tags = (r.vulnerableGroups?.length ? r.vulnerableGroups : classifyVulnerableResident(r))
      .map((t) => VULNERABLE_GROUP_META[t]?.short || t)
      .join('; ')
    return [
      i + 1,
      r.name || '',
      ageDisplayFor(r),
      r.gender || 'N/A',
      tags,
      r.purok || 'No Purok',
      r.contactNumber || r.contact_number || 'N/A',
      r.lastCheckup || r.last_checkup ? formatDate(r.lastCheckup || r.last_checkup) : 'N/A',
      r.riskLevel || r.risk_level || 'N/A',
    ]
  })
  const tableFirst = rows.length
  rows.push(header)
  body.forEach((r) => rows.push(r))
  if (!body.length) rows.push(['No residents found for this vulnerable group.'])
  const tableLast = rows.length - 1

  const ws = XLSX.utils.aoa_to_sheet(rows)
  styleTableRange(ws, {
    firstRow: summaryHeader,
    lastRow: summaryHeader + 1,
    firstCol: 0,
    lastCol: 3,
    headerRows: [summaryHeader],
  })
  styleTableRange(ws, {
    firstRow: tableFirst,
    lastRow: tableLast,
    firstCol: 0,
    lastCol: header.length - 1,
    headerRows: [tableFirst],
  })
  boldRow(ws, titleRow, header.length - 1, 14)
  boldRow(ws, summaryRow, 3, 12)
  boldRow(ws, listTitle, header.length - 1, 12)
  ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'vulnerable-groups')
  const suffix = meta.short || 'All-Vulnerable'
  XLSX.writeFile(wb, `CitiCare_Vulnerable-${suffix}_${periodLabel.replace(/ /g, '_')}.xlsx`, { cellStyles: true })
}
