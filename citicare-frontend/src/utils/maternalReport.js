// utils/maternalReport.js
// Combined maternal export — one workbook, two tabs (prenatal + postpartum),
// mirroring the sample tracking file. Used by the Dashboard Export Health
// Report modal for the pregnant group (Admin + pregnant-assigned BHW).
import XLSX from 'xlsx-js-style'
import {
  appendPrenatalSheet,
  defaultReportMeta,
  maternalStamp,
  prenatalToCSV,
} from './prenatalReport'
import { appendPostpartumSheet, postpartumToCSV } from './postpartumReport'
import { downloadBlob } from './vulnerableExport'

export const downloadMaternalXlsx = (prenatalResidents = [], postpartumResidents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const wb = XLSX.utils.book_new()
  appendPrenatalSheet(wb, prenatalResidents, m)
  appendPostpartumSheet(wb, postpartumResidents, m)
  // cellStyles: true is required for borders/fonts to persist in the file.
  XLSX.writeFile(wb, `PregnancyTracking_${m.barangay}_${maternalStamp()}.xlsx`, { cellStyles: true })
}

export const downloadMaternalCsvs = (prenatalResidents = [], postpartumResidents = [], meta = {}) => {
  const m = { ...defaultReportMeta(), ...meta }
  const stamp = maternalStamp()
  if (prenatalResidents.length) {
    downloadBlob(
      prenatalToCSV(prenatalResidents, m),
      `Prenatal_Report_${m.barangay}_${stamp}.csv`,
      'text/csv;charset=utf-8'
    )
  }
  if (postpartumResidents.length) {
    downloadBlob(
      postpartumToCSV(postpartumResidents, m),
      `Postpartum_Report_${m.barangay}_${stamp}.csv`,
      'text/csv;charset=utf-8'
    )
  }
}
