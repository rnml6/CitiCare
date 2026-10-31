// utils/vulnerableExport.js
// Shared helpers for Vulnerable Groups export (Pregnant / Senior / Infant).
// Used by Dashboard (server report) and Residents page (filtered-list export).
import { formatAgeLong, formatDate, focusGroupLabel } from './helpers'

export const VULNERABLE_GROUPS = ['pregnant', 'senior', 'infant']

export const VULNERABLE_GROUP_META = {
  all: { label: 'All Vulnerable Groups', short: 'All-Vulnerable' },
  pregnant: { label: 'Pregnant Women', short: 'Pregnant' },
  senior: { label: 'Senior Citizens (60+)', short: 'Senior' },
  infant: { label: 'Infants (0-59 months)', short: 'Infants' }
}

const norm = (g) => String(g || '').trim().toLowerCase()

const computeAge = (resident) => {
  const dob = resident.dateOfBirth || resident.date_of_birth
  if (dob) {
    const now = new Date()
    const b = new Date(dob)
    if (!isNaN(b.getTime()) && b <= now) {
      let years = now.getFullYear() - b.getFullYear()
      let months = now.getMonth() - b.getMonth()
      if (now.getDate() < b.getDate()) months--
      if (months < 0) { years--; months += 12 }
      return { years, totalMonths: years * 12 + months }
    }
  }
  const y = parseInt(resident.age, 10)
  if (Number.isFinite(y) && y >= 0) return { years: y, totalMonths: y * 12 }
  return { years: null, totalMonths: null }
}

// Client-side mirror of the backend classifier (fallback when API is unreachable).
export const classifyVulnerableResident = (resident = {}) => {
  const raw = resident.focusGroups || resident.focus_groups || []
  const groups = raw.map(norm)
  const has = (t) => groups.includes(t)
  const { years, totalMonths } = computeAge(resident)
  const tags = []
  if (has('pregnant')) tags.push('pregnant')
  if (has('senior') || has('seniorcitizen') || (years != null && years >= 60)) tags.push('senior')
  if (
    has('infant') || has('children') ||
    (years != null && years >= 0 && years < 5) ||
    (totalMonths != null && totalMonths >= 0 && totalMonths < 60)
  ) tags.push('infant')
  return [...new Set(tags)]
}

export const filterVulnerableResidents = (residents = [], group = 'all') => {
  const g = norm(group)
  if (!VULNERABLE_GROUPS.includes(g)) return residents
  return residents.filter((r) => {
    if (r.vulnerableGroups?.length) return r.vulnerableGroups.map(norm).includes(g)
    return classifyVulnerableResident(r).includes(g)
  })
}

export const ageDisplayFor = (resident) => {
  const dob = resident.dateOfBirth || resident.date_of_birth
  if (dob) {
    const long = formatAgeLong(dob)
    if (long) return long
  }
  return resident.age != null && resident.age !== '' ? `${resident.age} years old` : 'N/A'
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const residentsToCSV = (residents = []) => {
  const header = ['Name', 'Age', 'Gender', 'Vulnerable Group(s)', 'Purok', 'Contact Number', 'Last Checkup', 'Risk Level', 'Risk Score']
  const lines = [header.map(csvCell).join(',')]
  for (const r of residents) {
    const tags = (r.vulnerableGroups?.length ? r.vulnerableGroups : classifyVulnerableResident(r))
      .map((t) => VULNERABLE_GROUP_META[t]?.short || t)
      .join('; ')
    lines.push([
      r.name || '',
      ageDisplayFor(r),
      r.gender || 'N/A',
      tags,
      r.purok || 'No Purok',
      r.contactNumber || r.contact_number || 'N/A',
      r.lastCheckup || r.last_checkup ? formatDate(r.lastCheckup || r.last_checkup) : 'N/A',
      r.riskLevel || r.risk_level || 'N/A',
      r.riskScore ?? r.risk_score ?? ''
    ].map(csvCell).join(','))
  }
  return '﻿' + lines.join('\r\n')
}

const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const buildVulnerableReportHTML = ({ group = 'all', residents = [], summary = null, periodLabel = '' }) => {
  const meta = VULNERABLE_GROUP_META[norm(group)] || VULNERABLE_GROUP_META.all
  const generated = new Date().toLocaleString()
  const rows = residents.map((r, i) => {
    const tags = (r.vulnerableGroups?.length ? r.vulnerableGroups : classifyVulnerableResident(r))
      .map((t) => VULNERABLE_GROUP_META[t]?.short || t)
      .join(', ')
    return `<tr><td>${i + 1}</td><td>${escHtml(r.name)}</td><td>${escHtml(ageDisplayFor(r))}</td><td>${escHtml(r.gender || 'N/A')}</td><td>${escHtml(tags)}</td><td>${escHtml(r.purok || 'No Purok')}</td><td>${escHtml(r.contactNumber || r.contact_number || 'N/A')}</td><td>${escHtml(r.lastCheckup || r.last_checkup ? formatDate(r.lastCheckup || r.last_checkup) : 'N/A')}</td><td>${escHtml(r.riskLevel || r.risk_level || 'N/A')}</td></tr>`
  }).join('')

  const summaryBoxes = summary ? `<div class="stat-grid"><div class="stat-box"><div class="value">${summary.totalVulnerable ?? residents.length}</div><div class="label">Total Vulnerable</div></div><div class="stat-box"><div class="value">${summary.pregnant ?? 0}</div><div class="label">Pregnant</div></div><div class="stat-box"><div class="value">${summary.senior ?? 0}</div><div class="label">Senior (60+)</div></div><div class="stat-box"><div class="value">${summary.infant ?? 0}</div><div class="label">Infants</div></div></div>` : ''

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CitiCare Vulnerable Groups Report - ${escHtml(meta.label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>body{font-family:'Sora',sans-serif;margin:40px;color:#1a1a2e;line-height:1.6}.header{text-align:center;border-bottom:3px solid #3d639d;padding-bottom:20px;margin-bottom:30px}.header h1{color:#3d639d;font-size:26px;margin:0}.header p{color:#64748b;margin:5px 0}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:20px}.stat-box{background:#f1f5f9;border-radius:10px;padding:15px;text-align:center}.stat-box .value{font-size:24px;font-weight:bold;color:#3d639d}.stat-box .label{font-size:12px;color:#64748b}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#3d639d;color:white;padding:10px;text-align:left;font-size:12px}td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}tr:nth-child(even){background:#f8fafc}.footer{text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px}.note{background:#e7f0f9;border-left:4px solid #5f96d3;padding:10px 15px;margin:8px 0;border-radius:0 8px 8px 0;font-size:12px}</style></head><body>
<div class="header"><h1>CitiCare Vulnerable Groups Report</h1><p><strong>${escHtml(meta.label)}</strong>${periodLabel ? ` • ${escHtml(periodLabel)}` : ''}</p><p>Barangay Gumamela Healthcare Monitoring System</p><p>Generated: ${escHtml(generated)}</p></div>
${summaryBoxes}
<div class="note">Vulnerable groups: <strong>Pregnant</strong> = tagged pregnant focus group; <strong>Senior</strong> = 60 years old and above; <strong>Infants</strong> = 0–59 months old (below 5 years). A resident may appear in more than one group count when the "All" report is summarized, but is listed once per group table.</div>
<div class="section"><h2 style="color:#3d639d">Master List (${residents.length} resident${residents.length !== 1 ? 's' : ''})</h2>
${residents.length ? `<table><tr><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>Vulnerable Group(s)</th><th>Purok</th><th>Contact</th><th>Last Checkup</th><th>Risk</th></tr>${rows}</table>` : '<p>No residents found for this vulnerable group.</p>'}</div>
<div class="footer"><p>Generated by CitiCare Health Analytics System</p><p>Confidential - For authorized healthcare personnel only</p></div>
</body></html>`
}

export const buildVulnerableReportText = ({ group = 'all', residents = [], summary = null, periodLabel = '' }) => {
  const meta = VULNERABLE_GROUP_META[norm(group)] || VULNERABLE_GROUP_META.all
  const out = []
  out.push('CITICARE VULNERABLE GROUPS REPORT')
  out.push('='.repeat(50))
  out.push(`Group: ${meta.label}${periodLabel ? ` • ${periodLabel}` : ''}`)
  out.push(`Generated: ${new Date().toLocaleString()}`)
  out.push('Barangay Gumamela Healthcare Monitoring System')
  out.push('='.repeat(50))
  if (summary) out.push(`Total Vulnerable: ${summary.totalVulnerable ?? residents.length} | Pregnant: ${summary.pregnant ?? 0} | Senior: ${summary.senior ?? 0} | Infants: ${summary.infant ?? 0}\n`)
  out.push(`MASTER LIST (${residents.length} residents)`)
  out.push('-'.repeat(50))
  residents.forEach((r, i) => {
    const tags = (r.vulnerableGroups?.length ? r.vulnerableGroups : classifyVulnerableResident(r)).join(', ')
    out.push(`${i + 1}. ${r.name || 'Unknown'} — ${ageDisplayFor(r)} — ${r.gender || 'N/A'} — [${tags}] — ${r.purok || 'No Purok'} — ${r.riskLevel || 'N/A'}`)
  })
  if (!residents.length) out.push('No residents found for this vulnerable group.')
  out.push(`\n${'='.repeat(50)}\nGenerated by CitiCare | Confidential`)
  return out.join('\n')
}

export const groupFileSuffix = (group = 'all') => {
  const g = norm(group)
  if (g === 'pregnant') return 'Pregnant'
  if (g === 'senior') return 'Senior'
  if (g === 'infant') return 'Infants'
  return 'All-Vulnerable'
}

export const downloadBlob = (content, filename, mime) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export { focusGroupLabel }
