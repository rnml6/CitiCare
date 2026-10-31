// utils/prenatalReport.js
// BHW prenatal report helpers — Excel prenatal-tab parity (19 cols A..S).
import XLSX from 'xlsx-js-style'

// Thin grid border, matching the sample PregnancyTracking file
// (PregnancyTracking_GUMAMELA_09-19-2026.xlsx, prenatal tab:
// Calibri 11, thin black grid, bold centered wrapped headers).
const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'FF000000' } },
  bottom: { style: 'thin', color: { rgb: 'FF000000' } },
  left: { style: 'thin', color: { rgb: 'FF000000' } },
  right: { style: 'thin', color: { rgb: 'FF000000' } },
}

// Sample metadata block (Excel rows 3-10): only top+bottom borders on B:C.
// Excel row 11 (Administered by): only bottom border on B:C.
export const META_TOP_BOTTOM_BORDER = {
  top: { style: 'thin', color: { rgb: 'FF000000' } },
  bottom: { style: 'thin', color: { rgb: 'FF000000' } },
}
export const META_BOTTOM_BORDER = {
  bottom: { style: 'thin', color: { rgb: 'FF000000' } },
}

export const styleMetaRange = (ws, { firstRow, lastRow, firstCol, lastCol }) => {
  for (let r = firstRow; r <= lastRow; r++) {
    const isLast = r === lastRow
    for (let c = firstCol; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
      cell.s = {
        border: isLast ? META_BOTTOM_BORDER : META_TOP_BOTTOM_BORDER,
        font: { sz: 11 },
      }
    }
  }
}

// Apply the sample's organized look to a table region: grid borders on
// every cell, bold centered headers, wrapped text.
export const styleTableRange = (ws, { firstRow, lastRow, firstCol, lastCol, headerRows = [] }) => {
  for (let r = firstRow; r <= lastRow; r++) {
    const isHeader = headerRows.includes(r)
    for (let c = firstCol; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr] || (ws[addr] = { t: 's', v: '' })
      cell.s = {
        border: THIN_BORDER,
        alignment: {
          wrapText: true,
          vertical: 'center',
          horizontal: isHeader || c === firstCol ? 'center' : 'left',
        },
        font: isHeader ? { bold: true, sz: 11 } : { sz: 11 },
      }
    }
  }
}

// ANC windows → report columns J..Q (same order as the Excel tab)
export const ANC_WINDOWS = [
  { key: 'w1_12', label: '1-12 weeks' },
  { key: 'w13_20', label: '13-20 weeks' },
  { key: 'w21_26', label: '21-26 weeks' },
  { key: 'w27_30', label: '27-30 weeks' },
  { key: 'w31_34', label: '31-34 weeks' },
  { key: 'w35_36', label: '35-36 weeks' },
  { key: 'w37_38', label: '37-38 weeks' },
  { key: 'w39_40', label: '39-40 weeks' },
]

export const defaultReportMeta = () => {
  const now = new Date()
  const month = now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(now.getDate()).padStart(2, '0')
  return {
    monthYear: `${month} ${day},${now.getFullYear()}`,
    region: 'IV-A',
    province: 'BATANGAS',
    municipality: 'BALAYAN',
    barangay: 'GUMAMELA',
    healthCenter: 'GUMAMELA HEALTH CENTER',
    rhu: 'Balayan RHU',
    exportedBy: '',
  }
}

// 19 export columns A..S (no income, no signature, no registration)
const headerRow10 = [
  'No',
  'Buong Pangalan\n(Full Name)',
  'Personal na Impormasyon ng Buntis\n(Personal Information)',
  '',
  '',
  'Impormasyon tungkol sa Pagbubuntis\n(Information about the Pregnancy)',
  '',
  '',
  'Pagpapakonsulta at Pangangalaga bago Manganak\n(Ilagay ang petsa ng konsulta)',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'MUAC',
  '',
  'TD STATUS',
]

const headerRow11 = [
  '',
  '',
  'Edad\n(Age)',
  'Tirahan\n(Address) KASAMA ANG PUROK',
  'Mga Detalye para sa Pakikipag-ugnayan\n(Contact Details)',
  'Bilang ng Pagbubuntis at ng Panganganak\n(Gravida Para)',
  'Petsa ng Unang Araw ng Huling Regla\n(Last Menstrual Period)',
  'Petsa ng Inaasahang Panganganak\n(Expected Date of Delivery)',
  ...ANC_WINDOWS.map((w) => w.label),
  'MUAC (cm)',
  'Petsa ng MUAC',
  '',
]

const rowToArray = (r, index) => [
  index + 1,
  r.name || '',
  r.age ?? '',
  r.address || '',
  r.contactNumber || '',
  r.gravidaPara || '',
  r.lmp || '',
  r.edd || '',
  ...ANC_WINDOWS.map((w) => r.anc?.[w.key] || ''),
  r.muac ? String(r.muac).replace(/cm$/i, '') + 'cm' : '',
  r.muacDate || '',
  r.tdStatus || '',
]

// 0-indexed rows of the two-tier table header (right after the metadata
// block + one blank row). Keep in sync with buildPrenatalSheetData.
export const PRENATAL_HEADER_FIRST_ROW = 12
export const PRENATAL_HEADER_LAST_ROW = 13

export const buildPrenatalSheetData = (residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const data = [
    [],
    [],
    ['', 'Buwan at Taon:', m.monthYear],
    ['', 'Rehiyon:', m.region],
    ['', 'Probinsya:', m.province],
    ['', 'Munisipyo:', m.municipality],
    ['', 'Barangay:', m.barangay],
    ['', 'Rekomendadong Pasilidad ng Pagsangguni:', ''],
    ['', 'Istasyon ng Pangkalusugang Manggagawa:', m.healthCenter],
    ['', 'Rural Health Unit:', m.rhu],
    ['', 'Administered by:', m.exportedBy || ''],
    [],
    headerRow10,
    headerRow11,
    ...residents.map((r, i) => rowToArray(r, i)),
  ]
  return data
}

export const PRENATAL_MERGES = [
  // header block — same merge pattern as the Excel tab
  // (minus income/signature/registration)
  { s: { r: 12, c: 0 }, e: { r: 13, c: 0 } }, // A13:A14 No
  { s: { r: 12, c: 1 }, e: { r: 13, c: 1 } }, // B13:B14 name
  { s: { r: 12, c: 2 }, e: { r: 12, c: 4 } }, // C13:E13 personal info
  { s: { r: 12, c: 5 }, e: { r: 12, c: 7 } }, // F13:H13 pregnancy info
  { s: { r: 12, c: 8 }, e: { r: 12, c: 15 } }, // I13:P13 ANC visits
  { s: { r: 12, c: 16 }, e: { r: 12, c: 17 } }, // Q13:R13 MUAC
  { s: { r: 12, c: 18 }, e: { r: 13, c: 18 } }, // S13:S14 TD STATUS
]

export const maternalStamp = () => {
  const now = new Date()
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`
}

export const appendPrenatalSheet = (wb, residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const data = buildPrenatalSheetData(residents, m)
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!merges'] = PRENATAL_MERGES
  // Metadata block B3:C10 (0-indexed rows 2-9) + Admin row B11:C11 (row 10),
  // exactly like the sample file.
  styleMetaRange(ws, { firstRow: 2, lastRow: 10, firstCol: 1, lastCol: 2 })
  const headerFirstRow = PRENATAL_HEADER_FIRST_ROW
  const headerLastRow = PRENATAL_HEADER_LAST_ROW
  const lastDataRow = headerLastRow + residents.length
  styleTableRange(ws, {
    firstRow: headerFirstRow,
    lastRow: lastDataRow,
    firstCol: 0,
    lastCol: 18,
    headerRows: [headerFirstRow, headerLastRow],
  })
  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][headerFirstRow] = { hpt: 45 }
  ws['!rows'][headerLastRow] = { hpt: 45 }
  // Exact column widths from PregnancyTracking_GUMAMELA_09-19-2026.xlsx
  // (prenatal tab). Unset columns use Excel's default width.
  // Use `width` (not `wch`) so xlsx-js-style writes the exact value.
  ws['!cols'] = [
    { width: 5.77734375 }, // A No
    { width: 38.5546875 }, // B Full Name
    { width: 26.77734375 }, // C Age
    undefined, // D Address (default)
    { width: 18.77734375 }, // E Contact
    { width: 12.77734375 }, // F GravidaPara
    { width: 16.77734375 }, // G LMP
    undefined, // H EDD (default)
    { width: 14.77734375 }, // I 1-12 weeks
    undefined, // J 13-20 weeks (default)
    undefined, // K 21-26 weeks (default)
    undefined, // L 27-30 weeks (default)
    undefined, // M 31-34 weeks (default)
    undefined, // N 35-36 weeks (default)
    undefined, // O 37-38 weeks (default)
    undefined, // P 39-40 weeks (default)
    { width: 12.77734375 }, // Q MUAC (cm)
    { width: 14.77734375 }, // R MUAC date
    { width: 20.77734375 }, // S TD STATUS
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'prenatal')
  return ws
}

export const downloadPrenatalXlsx = (residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const wb = XLSX.utils.book_new()
  appendPrenatalSheet(wb, residents, m)
  // cellStyles: true is required for borders/fonts to persist in the file.
  XLSX.writeFile(wb, `PregnancyTracking_${m.barangay}_${maternalStamp()}.xlsx`, { cellStyles: true })
}

export const prenatalToCSV = (residents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'No', 'Full Name', 'Age', 'Address', 'Contact',
    'GravidaPara', 'LMP', 'EDD',
    ...ANC_WINDOWS.map((w) => w.label),
    'MUAC', 'MUAC Date', 'TD Status',
  ]
  const lines = [
    `Buwan at Taon:,${cell(m.monthYear)}`,
    `Rehiyon:,${cell(m.region)}`,
    `Probinsya:,${cell(m.province)}`,
    `Munisipyo:,${cell(m.municipality)}`,
    `Barangay:,${cell(m.barangay)}`,
    `Rekomendadong Pasilidad ng Pagsangguni:,`,
    `Istasyon ng Pangkalusugang Manggagawa:,${cell(m.healthCenter)}`,
    `Rural Health Unit:,${cell(m.rhu)}`,
    `Administered by:,${cell(m.exportedBy)}`,
    '',
    header.map(cell).join(','),
  ]
  residents.forEach((r, i) => {
    lines.push(rowToArray(r, i).map(cell).join(','))
  })
  return '﻿' + lines.join('\r\n')
}
