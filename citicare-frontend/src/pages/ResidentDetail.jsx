import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Edit,
  Trash2,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Calendar,
  Eye
} from 'lucide-react'
import { residentApi } from '../api/residentApi'
import { medicineApi } from '../api/medicineApi'
import { bhwApi } from '../api/bhwApi'
import { purokApi } from '../api/purokApi'
import { scheduleApi } from '../api/scheduleApi'
import GlassButton from '../components/GlassButton'
import Modal from '../components/Modal'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import { SkeletonResidentDetail, SkeletonVaccinationModal } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import ConfirmModal from '../components/ConfirmModal'
import { formatDate, getRiskColor, getRiskScoreBg, formatAgeLong } from '../utils/helpers'
import { getDoseDescription } from '../utils/medicineInterval'
import { useSmartBack, navigateWithReturn } from '../utils/navigation'
import { useAuth } from '../context/AuthContext'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmMutation, confirmUpdate } from '../utils/crudConfirm'
import {
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizeBloodPressureInput,
  sanitizePhoneInput,
  blockBloodPressureKeys,
  blockIntegerKeys,
  blockPhoneKeys,
  validateResidentFields,
  hasErrors
} from '../utils/validation'
import { focusFirstError } from '../utils/focusInvalidField'

// Calculate detailed age from date of birth
const calculateDetailedAge = dateOfBirth => {
  if (!dateOfBirth)
    return { years: 0, months: 0, weeks: 0, days: 0, display: '' }

  const today = new Date()
  const birthDate = new Date(dateOfBirth)

  // Calculate years
  let years = today.getFullYear() - birthDate.getFullYear()
  let months = today.getMonth() - birthDate.getMonth()

  // Full elapsed months only (Aug 30 → Sep 8 is 0 months, not 1)
  if (today.getDate() < birthDate.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }

  // Single-unit display comes from the shared universal helper;
  // stored age stays full years.
  const ageValue = years >= 1 ? years : 0

  return { years: ageValue, display: formatAgeLong(dateOfBirth) }
}

const ResidentDetail = ({ residentId, onClose, embedded = false, onDeleted, completeSchedule = null, onScheduleCompleted = null } = {}) => {
  const { id: paramId } = useParams()
  const id = residentId || paramId
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useSmartBack('/residents')
  // BHW page only: the Purok field stays hidden in every Edit Resident
  // Profile form (admin keeps the editable select).
  const { isBHWWorker } = useAuth()
  const [resident, setResident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showMedicalModal, setShowMedicalModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bhws, setBhws] = useState([])

  const [medicineSchedules, setMedicineSchedules] = useState([])
  // Master-list dose_intervals by id and by lowercased name — fallback so
  // vaccine dropdown labels always find the per-dose description.
  const [masterDoseMap, setMasterDoseMap] = useState({})

  const todayStr = () => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  }

  const getInitialMedicalForm = () => ({
    type: 'Checkup',
    // common encounter fields
    encounterDate: todayStr(),
    serviceLocation: 'Health Center',
    serviceLocationOther: '',
    facility: 'Barangay Health Center',
    notes: '',
    vitalSigns: {
      bloodPressure: '',
      heartRate: '',
      temperature: '',
      weight: '',
      height: '',
      bloodSugar: '',
      bmi: ''
    },
    medicine_master_id: '',
    dose_number: 1,
    total_doses: 1,
    batch_number: '',
    administration_site: '',
    administered_by: '',
    newConditions: [],
    newMedications: [],
    newVaccines: [],
    newAllergies: { drugs: [], food: [], environmental: [] },
    // checkup / senior
    reason: '',
    symptoms: '',
    assessment: '',
    // senior
    mobilityStatus: '',
    // prenatal — pregnancy background (recorded once per pregnancy)
    lmp: '',
    edd: '',
    gravida: '',
    para: '',
    riskFactors: '',
    pregnancyStatus: '',
    // prenatal — this visit (feeds the BHW prenatal report)
    // muacDate is automatic (== checkup date), ancWindow is automatic (by LMP)
    // NOTE: motherBP/motherTemp are shared with the postpartum section and
    // declared once below — do not redeclare them here.
    gestationalAge: '',
    motherWeight: '',
    fundalHeight: '',
    fetalHeartRate: '',
    fetalMovement: '',
    muac: '',
    tdStatus: '',
    ancWindow: '',
    isPrivateVisit: false,
    // postpartum — pregnancy outcome (feeds the BHW postpartum report,
    // usually encoded with Pregnancy Status = Delivered)
    birthOutcome: '',
    birthDate: '',
    deliveryPlace: '',
    birthAttendant: '',
    birthAttendantName: '',
    deliveryMode: '',
    babyName: '',
    babyGender: '',
    babyWeight: '',
    motherBP: '',
    motherTemp: '',
    lochia: '',
    woundCondition: '',
    breastfeedingStatus: '',
    babyTemp: '',
    babyFeedingStatus: '',
    jaundice: '',
    cordCondition: '',
    newbornDangerSigns: '',
    maternalDeathApplicable: false,
    maternalDeathDate: '',
    stillbirthApplicable: false,
    stillbirthRegDate: '',
    neonatalDeathApplicable: false,
    neonatalDeathDate: '',
    spouseName: '',
    // growth monitoring — basic information (recorded once per child)
    placeOfBirth: '',
    motherName: '',
    fatherName: '',
    // growth monitoring — this visit
    lengthHeight: '',
    respiratoryRate: '',
    developmentalConcerns: '',
    growthVaccinator: '',
    headCircumference: '',
    feedingStatus: '',
    growthStatus: '',
    nutritionalStatus: '',
    developmentalObs: '',
    nutritionConcerns: '',
    // deworming / vitamins free-text dose info
    doseText: '',
    quantityProvided: '',
    // referral
    referralCategory: 'General Concern',
    referralPregnancyType: 'Prenatal',
    facilityType: '',
    facilityName: '',
    facilityLocation: ''
  })

  const [medicalForm, setMedicalForm] = useState(getInitialMedicalForm)
  const [medicalErrors, setMedicalErrors] = useState({})

  const [tempCondition, setTempCondition] = useState({
    name: '',
    severity: 'Mild'
  })
  const [tempMedication, setTempMedication] = useState({
    name: '',
    dosage: '',
    frequency: ''
  })
  const [tempAllergy, setTempAllergy] = useState({
    type: 'drugs',
    allergen: ''
  })
  // Growth-visit vaccines: added to a list like chronic conditions
  // (name only, no severity) — each one is recorded as dose 1.
  const [tempVaccine, setTempVaccine] = useState({
    name: ''
  })

  const [editingConditions, setEditingConditions] = useState(false)
  const [editingMedications, setEditingMedications] = useState(false)
  const [editingAllergies, setEditingAllergies] = useState(false)
  const [allergyForm, setAllergyForm] = useState({
    type: 'drugs',
    allergen: ''
  })
  const [savingConditions, setSavingConditions] = useState(false)
  const [savingMedications, setSavingMedications] = useState(false)
  const [savingAllergies, setSavingAllergies] = useState(false)
  const [newCondition, setNewCondition] = useState('')
  const [newConditionSeverity, setNewConditionSeverity] = useState('Mild')
  const [newMedication, setNewMedication] = useState({
    name: '',
    dosage: '',
    frequency: ''
  })
  const [medicineStatus, setMedicineStatus] = useState({
    vaccines: [],
    deworming: [],
    vitamins: []
  })

  const [historyFilter, setHistoryFilter] = useState('all')
  const [historyMonth, setHistoryMonth] = useState('all')
  const [historyYear, setHistoryYear] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const rowsPerPage = 6

  const [showEditModal, setShowEditModal] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [puroks, setPuroks] = useState([])
  const [editForm, setEditForm] = useState({
    name: '', dateOfBirth: '', age: '', gender: '', civilStatus: 'Single',
    purokId: '', contactNumber: '', contactPerson: '', contactPersonNumber: '',
    contactPersonAddress: '', lastCheckup: '', focusGroups: [],
    motherName: '', fatherName: '', disabilityType: ''
  })
  const [editVitalSigns, setEditVitalSigns] = useState({
    bloodPressure: '', heartRate: '', temperature: '',
    weight: '', height: '', bloodSugar: '', bmi: ''
  })
  const [editErrors, setEditErrors] = useState({})
  const [editAgeDisplay, setEditAgeDisplay] = useState('')

  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const openConfirm = (message, action) => {
    setConfirmMessage(message)
    setConfirmAction(() => action)
    setShowConfirmModal(true)
  }

  const handleConfirm = async () => {
    if (confirmAction) {
      setConfirmLoading(true)
      await confirmAction()
      setConfirmLoading(false)
      setShowConfirmModal(false)
      setConfirmAction(null)
    }
  }

  const [showVaccinationModal, setShowVaccinationModal] = useState(false)
  const [showRiskModal, setShowRiskModal] = useState(false)
  const [showRiskRanges, setShowRiskRanges] = useState(false)
  const riskRangeRef = useRef(null)

  useEffect(() => {
    if (!showRiskRanges) return
    const handleClickOutside = (e) => {
      if (riskRangeRef.current && !riskRangeRef.current.contains(e.target)) {
        setShowRiskRanges(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showRiskRanges])
  const [vaccinationData, setVaccinationData] = useState([])
  const [vaccinationLoading, setVaccinationLoading] = useState(false)
  const [vaccinationPage, setVaccinationPage] = useState(1)
  const vaccinationPerPage = 3
  const [condPage, setCondPage] = useState(1)
  const [medPage, setMedPage] = useState(1)
  const [allergyPage, setAllergyPage] = useState(1)
  const condPerPage = 8
  const medPerPage = 8
  const allergyPerPage = 6
  const [showAdministeredByDropdown, setShowAdministeredByDropdown] =
    useState(false)
  const [administeredByFilter, setAdministeredByFilter] = useState('')

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      // Settled (not all-or-nothing): a failing auxiliary call (e.g.
      // medicines for a resident outside the BHW's purok) must never blank
      // the whole detail page.
      const [residentResult, medicineResult, bhwResult] =
        await Promise.allSettled([
          residentApi.getById(id),
          medicineApi.getResidentMedicines(id),
          bhwApi.getAll()
        ])
      const residentResponse = residentResult.status === 'fulfilled' ? residentResult.value : null
      const medicineResponse = medicineResult.status === 'fulfilled' ? medicineResult.value : null
      const bhwResponse = bhwResult.status === 'fulfilled' ? bhwResult.value : null
      if (residentResult.status === 'rejected') {
        console.error('Error fetching resident:', residentResult.reason)
        // Surface the real server reason (e.g. scope 403 vs missing 404)
        // instead of a generic "not found".
        setLoadError(residentResult.reason?.response?.data?.message || null)
      }
      if (medicineResult.status === 'rejected') console.error('Error fetching medicines:', medicineResult.reason)
      if (bhwResult.status === 'rejected') console.error('Error fetching BHWs:', bhwResult.reason)

      if (residentResponse?.data?.success) {
        setResident(residentResponse.data.data)
      }

      if (medicineResponse?.data?.success) {
        setMedicineStatus({
          vaccines: medicineResponse.data.data.vaccines || [],
          deworming: medicineResponse.data.data.deworming || [],
          vitamins: medicineResponse.data.data.vitamins || []
        })
        setMedicineSchedules([
          ...(medicineResponse.data.data.vaccines || []),
          ...(medicineResponse.data.data.deworming || []),
          ...(medicineResponse.data.data.vitamins || [])
        ])
      }

      if (bhwResponse?.data?.success) setBhws(bhwResponse.data.data)
    } catch (e) {
      console.error('Error fetching data:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  const refreshResident = useCallback(async () => {
    try {
      const res = await residentApi.getById(id)
      if (res.data.success) setResident(res.data.data)
    } catch (e) {
      console.error('Error refreshing resident:', e)
    }
  }, [id])

  const fetchMedicinesOnly = useCallback(async () => {
    try {
      const [medicineResponse, masterResponse] = await Promise.allSettled([
        medicineApi.getResidentMedicines(id),
        medicineApi.getAll(),
      ])
      if (medicineResponse.status === 'fulfilled' && medicineResponse.value?.data?.success) {
        setMedicineStatus({
          vaccines: medicineResponse.value.data.data.vaccines || [],
          deworming: medicineResponse.value.data.data.deworming || [],
          vitamins: medicineResponse.value.data.data.vitamins || []
        })
        setMedicineSchedules([
          ...(medicineResponse.value.data.data.vaccines || []),
          ...(medicineResponse.value.data.data.deworming || []),
          ...(medicineResponse.value.data.data.vitamins || [])
        ])
      } else if (medicineResponse.status === 'rejected') {
        console.error('Error fetching medicines:', medicineResponse.reason)
      }
      // Master-list fallback for per-dose descriptions: the resident
      // endpoint should already carry dose_intervals, but if it ever
      // arrives empty/stale the dropdown labels still resolve via this map.
      if (masterResponse.status === 'fulfilled' && masterResponse.value?.data?.success) {
        const map = {}
        for (const m of masterResponse.value.data.data || []) {
          if (m?.id != null) map[String(m.id)] = m.dose_intervals
          const key = String(m?.medicine_name || '').trim().toLowerCase()
          if (key) map[key] = m.dose_intervals
        }
        setMasterDoseMap(map)
      }
    } catch (e) {
      console.error('Error fetching medicines:', e)
    }
  }, [id])

  // Refresh schedules (and dose descriptions) every time Add Medical
  // Record opens, so edits made in Medicine Management show immediately.
  useEffect(() => {
    if (showMedicalModal) fetchMedicinesOnly()
  }, [showMedicalModal, fetchMedicinesOnly])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  const getAvailableYears = () => {
    const y = new Set()
    resident?.medicalHistory?.forEach(r => {
      if (r.date) y.add(new Date(r.date).getFullYear())
    })
    medicineStatus.vaccines?.forEach(v => {
      v.takenDoses?.forEach(d => {
        if (d.dateAdministered)
          y.add(new Date(d.dateAdministered).getFullYear())
      })
    })
    medicineStatus.deworming?.forEach(d => {
      d.takenDoses?.forEach(dose => {
        if (dose.dateAdministered)
          y.add(new Date(dose.dateAdministered).getFullYear())
      })
    })
    medicineStatus.vitamins?.forEach(v => {
      v.takenDoses?.forEach(dose => {
        if (dose.dateAdministered)
          y.add(new Date(dose.dateAdministered).getFullYear())
      })
    })
    const a = [...y].sort((a, b) => b - a)
    if (a.length === 0) a.push(new Date().getFullYear())
    return a
  }

  const handleDelete = () => {
    openConfirm('Are you sure you want to delete this resident? This action cannot be undone.', async () => {
      try {
        await residentApi.delete(id)
        dialog.toast('Resident deleted.', 'success')
        if (embedded) {
          onDeleted?.(id)
          onClose?.()
        } else {
          goBack()
        }
      } catch (e) {
        dialog.error(e.response?.data?.message || 'Failed to delete resident', 'Unable to delete resident')
      }
    })
  }

  const calculateEditAge = (dob) => {
    if (!dob) return { years: 0, display: '' }
    const today = new Date()
    const birth = new Date(dob)
    let years = today.getFullYear() - birth.getFullYear()
    let months = today.getMonth() - birth.getMonth()
    if (today.getDate() < birth.getDate()) months--
    if (months < 0) { years--; months += 12 }
    // Single-unit display from the shared universal helper.
    const display = formatAgeLong(dob)
    return { years, display }
  }

  const openEditModal = async () => {
    try {
      const [residentRes, purokRes] = await Promise.all([
        residentApi.getById(id),
        // No purok list needed for BHW (field is hidden there).
        isBHWWorker ? Promise.resolve(null) : purokApi.getAll()
      ])
      if (purokRes?.data?.success) setPuroks(purokRes.data.data)
      if (residentRes.data.success) {
        const r = residentRes.data.data
        setEditForm({
          name: r.name || '', dateOfBirth: r.dateOfBirth || '', age: r.age || '',
          gender: r.gender || '', civilStatus: r.civilStatus || 'Single',
          purokId: r.purokId || '', contactNumber: r.contactNumber || '',
          contactPerson: r.contactPerson || '', contactPersonNumber: r.contactPersonNumber || '',
          contactPersonAddress: r.contactPersonAddress || '', lastCheckup: r.lastCheckup || '',
          focusGroups: r.focusGroups || [],
          motherName: r.motherName || '', fatherName: r.fatherName || '',
          disabilityType: r.disabilityType || ''
        })
        setEditVitalSigns({
          bloodPressure: r.vitalSigns?.bloodPressure || '', heartRate: r.vitalSigns?.heartRate || '',
          temperature: r.vitalSigns?.temperature || '', weight: r.vitalSigns?.weight || '',
          height: r.vitalSigns?.height || '', bloodSugar: r.vitalSigns?.bloodSugar || '',
          bmi: r.vitalSigns?.bmi || ''
        })
        if (r.dateOfBirth) {
          const ageData = calculateEditAge(r.dateOfBirth)
          setEditAgeDisplay(ageData.display)
        }
      }
    } catch (e) {
      console.error('Error fetching resident for edit:', e)
    }
    setEditErrors({})
    setShowEditModal(true)
  }

  const clearEditError = name =>
    setEditErrors(previous =>
      previous[name] ? { ...previous, [name]: '' } : previous
    )

  const handleEditSave = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const nextErrors = validateResidentFields(editForm)
    // Skipped for BHW (field hidden; the resident's purok is sent unchanged).
    if (!isBHWWorker && editForm.purokId && !puroks.some(p => String(p.id) === String(editForm.purokId))) {
      nextErrors.purokId = 'Please select a valid purok from the list.'
    }
    if (hasErrors(nextErrors)) {
      setEditErrors(nextErrors)
      focusFirstError(nextErrors, form)
      return
    }
    setEditErrors({})
    const confirmed = await confirmUpdate('resident', `Please confirm that you want to save the changes to ${editForm.name}.`)
    if (!confirmed) return
    setEditSaving(true)
    try {
      const ageData = calculateEditAge(editForm.dateOfBirth)
      const age = ageData.years
      let focusGroups = [...(editForm.focusGroups || [])]
      const isInfantAge = age >= 0 && age < 5
      const isPwdChecked = focusGroups.includes('pwd')
      if (isInfantAge) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
      else { focusGroups = focusGroups.filter(g => g !== 'infant') }
      if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
      else { focusGroups = focusGroups.filter(g => g !== 'senior') }
      if (editForm.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')

      const dataToSend = {
        ...editForm, age, focusGroups,
        isPwd: isPwdChecked,
        motherName: isInfantAge ? (editForm.motherName?.trim() || null) : null,
        fatherName: isInfantAge ? (editForm.fatherName?.trim() || null) : null,
        disabilityType: isPwdChecked ? (editForm.disabilityType?.trim() || null) : null,
        vitalSigns: {
          bloodPressure: editVitalSigns.bloodPressure || null,
          heartRate: editVitalSigns.heartRate || null,
          temperature: editVitalSigns.temperature || null,
          weight: editVitalSigns.weight || null,
          height: editVitalSigns.height || null,
          bloodSugar: editVitalSigns.bloodSugar || null,
          bmi: editVitalSigns.bmi || null
        }
      }
      await residentApi.update(id, dataToSend)
      setShowEditModal(false)
      refreshResident()
      dialog.toast('Resident updated successfully.', 'success')
    } catch (error) {
      const backendErrors = error.response?.data?.errors
      if (backendErrors && typeof backendErrors === 'object' && Object.keys(backendErrors).length > 0) {
        const next = Object.fromEntries(
          Object.entries(backendErrors)
            .filter(([, message]) => Boolean(message))
            .map(([field, message]) => [field, String(message)])
        )
        setEditErrors(next)
        focusFirstError(next, form)
      } else {
        dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save resident')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const handleMedicalFormChange = e => {
    const { name } = e.target
    let value = e.target.value
    if (name === 'motherBP') value = sanitizeBloodPressureInput(value)
    else if ([
      'motherWeight', 'motherTemp', 'babyTemp',
      'fundalHeight', 'lengthHeight', 'headCircumference', 'muac'
    ].includes(name)) {
      value = sanitizeDecimalInput(value, { maxDecimals: 1 })
    } else if ([
      'fetalHeartRate', 'respiratoryRate', 'gravida', 'para'
    ].includes(name)) {
      value = sanitizeIntegerInput(value)
    }
    setMedicalForm(p => {
      const next = { ...p, [name]: value }
      // Auto-compute EDD (Naegele: LMP + 280 days) when LMP changes
      if (name === 'lmp' && value) {
        const lmpDate = new Date(value)
        if (!isNaN(lmpDate)) {
          const eddDate = new Date(lmpDate)
          eddDate.setDate(eddDate.getDate() + 280)
          next.edd = eddDate.toISOString().split('T')[0]
        }
        // Auto-fill gestational age from LMP + visit date
        const refDate = next.encounterDate || todayStr()
        const ga = computeGestationalAge(value, refDate)
        if (ga) next.gestationalAge = ga
      }
      if (name === 'encounterDate' && next.lmp) {
        const ga = computeGestationalAge(next.lmp, value)
        if (ga) next.gestationalAge = ga
      }
      return next
    })
  }

  const formatLongDate = dt =>
    dt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

  // Weeks + days between LMP and a reference date, e.g. "24w 3d"
  const computeGestationalAge = (lmp, ref) => {    if (!lmp || !ref) return ''
    const l = new Date(lmp)
    const r = new Date(ref)
    if (isNaN(l) || isNaN(r) || r < l) return ''
    const days = Math.floor((r - l) / (1000 * 60 * 60 * 24))
    const w = Math.floor(days / 7)
    const d = days % 7
    return `${w}w ${d}d`
  }

  // BMI helper shared by General / Senior checkups
  const computeBmi = (weight, height) => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    if (w > 0 && h > 0) {
      const bmi = w / ((h / 100) * (h / 100))
      return Number.isFinite(bmi) && bmi < 1000 ? bmi.toFixed(1) : ''
    }
    return ''
  }

  // Complete-flow guard: an empty form must not complete the schedule —
  // require at least one meaningful clinical input (medicine selection is
  // already required for med types, so this covers checkup-like types).
  const hasCompleteFlowContent = (f) => {
    const filled = v => v !== '' && v !== null && v !== undefined && String(v).trim() !== ''
    if (filled(f.reason) || filled(f.symptoms) || filled(f.assessment) || filled(f.notes)) return true
    if (f.vitalSigns && Object.values(f.vitalSigns).some(filled)) return true
    if ((f.newConditions || []).length > 0 || (f.newMedications || []).length > 0) return true
    const al = f.newAllergies || {}
    if ((al.drugs || []).length > 0 || (al.food || []).length > 0 || (al.environmental || []).length > 0) return true
    if (filled(f.mobilityStatus)) return true
    if (filled(f.lmp) || filled(f.edd) || filled(f.gravida) || filled(f.para) || filled(f.riskFactors) || filled(f.pregnancyStatus) || filled(f.gestationalAge) || filled(f.motherWeight) || filled(f.motherBP) || filled(f.motherTemp) || filled(f.fundalHeight) || filled(f.fetalHeartRate) || filled(f.fetalMovement) || filled(f.muac) || filled(f.tdStatus) || f.isPrivateVisit) return true
    if (filled(f.birthOutcome) || filled(f.birthDate) || filled(f.deliveryPlace) || filled(f.birthAttendant) || filled(f.birthAttendantName) || filled(f.deliveryMode) || filled(f.babyName) || filled(f.babyGender) || filled(f.babyWeight) || filled(f.motherBP) || filled(f.motherTemp) || filled(f.lochia) || filled(f.woundCondition) || filled(f.breastfeedingStatus) || filled(f.babyTemp) || filled(f.babyFeedingStatus) || filled(f.jaundice) || filled(f.cordCondition) || filled(f.newbornDangerSigns) || filled(f.maternalDeathDate) || filled(f.stillbirthRegDate) || filled(f.neonatalDeathDate) || filled(f.spouseName)) return true
    if (filled(f.lengthHeight) || filled(f.headCircumference) || filled(f.feedingStatus) || filled(f.growthStatus) || filled(f.nutritionalStatus) || filled(f.developmentalObs) || filled(f.developmentalConcerns) || filled(f.nutritionConcerns) || filled(f.placeOfBirth) || filled(f.motherName) || filled(f.fatherName) || filled(f.respiratoryRate) || (f.newVaccines || []).length > 0 || filled(f.growthVaccinator)) return true
    if (filled(f.doseText) || filled(f.quantityProvided) || filled(f.batch_number) || filled(f.administration_site)) return true
    if (filled(f.facilityType) || filled(f.facilityName) || filled(f.facilityLocation)) return true
    return false
  }

  const isMedType = t =>
    t === 'Vaccination' || t === 'Deworming' || t === 'Vitamin Supplementation' || t === 'Vitamins'
  const isCheckupType = t =>
    t === 'Checkup' ||
    t === 'Prenatal Checkup' ||
    t === 'Postpartum Checkup' ||
    t === 'Growth Monitoring' ||
    t === 'Senior Checkup' ||
    t === 'Referral' ||
    t === 'Checkup'
  const isGeneralConcern = t => t === 'General Concern'
  const isInfantConcern = t => t === 'Infant Concern'
  const isPregnancyConcern = t => t === 'Pregnancy Concern'
  // Referral category is automatic (field hidden): infant residents get
  // Infant Concern fields, pregnant residents get Pregnancy Concern
  // fields, everyone else falls into General Concern.
  const getAutoReferralCategory = () => {
    const groups = resident?.focusGroups || []
    const age = Number(resident?.age) || 0
    if (groups.includes('pregnant')) return 'Pregnancy Concern'
    if (groups.includes('infant') || age < 5) return 'Infant Concern'
    return 'General Concern'
  }

  const recordTypeLabels = {
    'Checkup': 'Checkup',
    'Prenatal Checkup': 'Prenatal Checkup',
    'Postpartum Checkup': 'Postpartum Checkup',
    'Growth Monitoring': 'Infant / Child Growth Monitoring',
    'Senior Checkup': 'Senior Citizen Checkup',
    'Vaccination': 'Vaccination',
    'Deworming': 'Deworming',
    'Vitamin Supplementation': 'Vitamin Supplementation',
    'Referral': 'Referral',
  }

  // Only record types applicable to this resident can be selected:
  // prenatal/postpartum for females, growth monitoring for infants (under 5),
  // senior checkups for ages 60+.
  const getAllowedRecordTypes = () => {
    const all = Object.keys(recordTypeLabels)
    if (!resident) return all
    const age = Number(resident.age) || 0
    return all.filter(t => {
      if (t === 'Prenatal Checkup') return resident.gender === 'Female'
      if (t === 'Postpartum Checkup') return resident.gender === 'Female'
      if (t === 'Growth Monitoring') return age < 5
      if (t === 'Senior Checkup') return age >= 60
      return true
    })
  }

  const getHiddenTypeReasons = () => {
    const allowed = getAllowedRecordTypes()
    const reasons = []
    if (!allowed.includes('Prenatal Checkup')) {
      reasons.push('Prenatal Checkup (female residents only)')
    }
    if (!allowed.includes('Postpartum Checkup')) {
      reasons.push('Postpartum Checkup (female residents only)')
    }
    if (!allowed.includes('Growth Monitoring')) {
      reasons.push('Growth Monitoring (infants under 5 only)')
    }
    if (!allowed.includes('Senior Checkup')) {
      reasons.push('Senior Checkup (ages 60+ only)')
    }
    return reasons
  }

  const handleMedicalTypeChange = e => {
    const t = e.target.value
    setMedicalForm(p => ({
      ...p,
      type: t,
      medicine_master_id: '',
      dose_number: 1,
      total_doses: 1,
      batch_number: '',
      administration_site: '',
      administered_by: '',
      // Referral category is automatic per resident (field hidden).
      // Pregnant referrals default to the Prenatal fields (selector can
      // switch to Postpartum below).
      ...(t === 'Referral' ? { referralCategory: getAutoReferralCategory(), referralPregnancyType: 'Prenatal' } : {})
    }))
    setMedicalErrors({})
    if (isMedType(t) || t === 'Growth Monitoring' || t === 'Referral') fetchMedicinesOnly()
  }

  const handleVitalChange = e => {
    const { name } = e.target
    let value = e.target.value
    if (name === 'bloodPressure') value = sanitizeBloodPressureInput(value)
    else if (name === 'heartRate' || name === 'bloodSugar') value = sanitizeIntegerInput(value)
    else if (name === 'weight' || name === 'height' || name === 'temperature') {
      value = sanitizeDecimalInput(value, { maxDecimals: 1 })
    }
    if (medicalErrors[name]) {
      setMedicalErrors(prev => {
        if (!prev[name]) return prev
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    setMedicalForm(p => {
      const updated = { ...p.vitalSigns, [name]: value }
      const w = parseFloat(updated.weight)
      const h = parseFloat(updated.height)
      if (w > 0 && h > 0) {
        const bmi = w / ((h / 100) * (h / 100))
        // Guard: vitals columns are NUMERIC(4,1) - never send >= 1000
        updated.bmi = Number.isFinite(bmi) && bmi < 1000 ? bmi.toFixed(1) : ''
      } else {
        updated.bmi = ''
      }
      return { ...p, vitalSigns: updated }
    })
  }

  const handleMedicineMasterChange = e => {
    const mid = e.target.value
    const s = medicineSchedules.find(m => String(m.id) === String(mid))
    // Always store what was entered so the display never mismatches the
    // saved value; unmatched text is rejected at save with a message.
    // Next dose is completed + 1 — or, for recurring deworming/vitamins,
    // the next dose of the current cycle (resets after a full cycle).
    setMedicalForm(p => ({
      ...p,
      medicine_master_id: mid,
      dose_number: s ? nextDoseNumber(s) : p.dose_number,
      total_doses: s ? s.total_doses : p.total_doses
    }))
    if (medicalErrors.medicine_master_id) {
      setMedicalErrors(previous => ({ ...previous, medicine_master_id: '' }))
    }
  }

  // Medicine pickers accept typed input: resolve a typed medicine name to
  // its record id (exact name match, completed schedules excluded) so
  // typing a name works the same as picking it from the dropdown.
  // Unmatched text passes through and is rejected at save with a message.
  // Cycle position: after completing the required doses the counter
  // resets, e.g. 2/2 taken of 2 → displays (0/2) and the next
  // administration starts a new cycle at dose 1.
  const displayDoses = (m) => {
    if (!m) return 0;
    const t = m.total_doses || 1;
    return (m.completedDoses || 0) % t;
  };
  const nextDoseNumber = (m) => {
    if (!m) return 1;
    return displayDoses(m) + 1;
  };

  const resolveMedicineId = (v, category) => {
    if (medicineSchedules.some(m => String(m.id) === String(v))) return v
    const q = String(v || '').trim().toLowerCase()
    if (!q) return v
    const want = String(category || '').trim().toLowerCase()
    const match = medicineSchedules.find(m => {
      if (normCat(m) !== want) return false
      if (String(m.medicine_name || '').trim().toLowerCase() !== q) return false
      return true
    })
    return match ? String(match.id) : v
  }

  const addConditionToForm = () => {
    if (tempCondition.name?.trim()) {
      setMedicalForm(p => ({
        ...p,
        newConditions: [
          ...p.newConditions,
          {
            name: tempCondition.name.trim(),
            severity: tempCondition.severity || 'Mild'
          }
        ]
      }))
      setTempCondition({ name: '', severity: 'Mild' })
    }
  }

  const removeConditionFromForm = i =>
    setMedicalForm(p => ({
      ...p,
      newConditions: p.newConditions.filter((_, idx) => idx !== i)
    }))

  // Growth-visit vaccines: added to a list like chronic conditions
  // (name only, no severity) — each one is recorded as dose 1.
  // Stored values may be schedule ids (picked) or typed text; display
  // always resolves to the vaccine name.
  const growthVaxDisplay = (v) => {
    const raw = String(typeof v === 'string' ? v : v?.name || '').trim();
    const s = medicineSchedules.find(m => String(m.id) === String(raw));
    return s?.medicine_name || raw;
  };

  // Upcoming-dose description for a medicine schedule, e.g. dose 1 of
  // "Tobo (0/3)" -> "1 1/2 month". Returns '' when none is set. The cycle
  // position is used, so a completed cycle resolves the dose-1 description
  // of the new cycle.
  const upcomingDoseDesc = (m) => {
    if (!m) return '';
    const upcoming = nextDoseNumber(m);
    const direct = getDoseDescription(m?.dose_intervals, upcoming);
    if (direct) return direct;
    const fb = masterDoseMap[String(m.id)]
      ?? masterDoseMap[String(m.medicine_name || '').trim().toLowerCase()];
    return getDoseDescription(fb, upcoming);
  };

  // Dropdown labels include the current cycle count and upcoming dose description.
  // Counts use the cycle position, so a completed cycle resets, e.g.
  // "Kontra Bulate (0/2)".
  // Deworming & vitamins only use the cycle counter: after a full cycle the
  // display resets, e.g. "Kontra Bulate (0/2)".

  // Deworming & vitamins only: append the upcoming dose description.
  // Single-dose medicines omit the "(x/y)" counter and always show the
  // dose-1 description (even when already taken), e.g.
  // "Mebendazole - <description>".
  const doseOneDesc = (m) => {
    if (!m) return '';
    const direct = getDoseDescription(m?.dose_intervals, 1);
    if (direct) return direct;
    const fb = masterDoseMap[String(m.id)]
      ?? masterDoseMap[String(m.medicine_name || '').trim().toLowerCase()];
    return getDoseDescription(fb, 1);
  };
  const medOptionLabel = (m) => {
    if ((m.total_doses || 1) <= 1) {
      const d1 = doseOneDesc(m);
      return d1 ? `${m.medicine_name} - ${d1}` : `${m.medicine_name}`;
    }
    const base = `${m.medicine_name} (${displayDoses(m)}/${m.total_doses})`;
    const desc = upcomingDoseDesc(m);
    return desc ? `${base} - ${desc}` : base;
  };
  const vaccineOptionLabel = (m) => {
    const totalDoses = m.total_doses || 1;
    const base = totalDoses <= 1
      ? `${m.medicine_name} (single dose)`
      : `${m.medicine_name} (${displayDoses(m)}/${totalDoses})`;
    const desc = upcomingDoseDesc(m);
    return desc ? `${base} - ${desc}` : base;
  };
  const vaccineOptionDisabled = (m) =>
    (m.completedDoses || 0) >= (m.total_doses || 1);

  // Category match is case-insensitive so a master row saved as
  // "Deworming"/"VACCINE" still shows under the right picker.
  const normCat = (m) => String(m?.category || '').trim().toLowerCase();
  const catSchedules = (cat) => medicineSchedules.filter(m => normCat(m) === cat);
  // Keep taken/completed medicines visible; completed vaccines are marked
  // disabled separately so they remain visible but cannot be selected.
  const availableSchedules = (cat) => catSchedules(cat);
  const emptyScheduleHint = (cat, label) => {
    return `No ${label} available for this resident. Check Medicine Management — the medicine must be Active and its Target Group must cover this resident.`;
  };

  const addVaccineToForm = () => {
    const name = tempVaccine.name?.trim()
    if (!name) return
    const disp = growthVaxDisplay({ name }).toLowerCase()
    setMedicalForm(p => {
      if ((p.newVaccines || []).some(v => growthVaxDisplay(v).toLowerCase() === disp)) return p
      return { ...p, newVaccines: [...(p.newVaccines || []), { name }] }
    })
    setTempVaccine({ name: '' })
  }

  const removeVaccineFromForm = i =>
    setMedicalForm(p => ({
      ...p,
      newVaccines: (p.newVaccines || []).filter((_, idx) => idx !== i)
    }))

  const addMedicationToForm = () => {
    if (tempMedication.name.trim()) {
      setMedicalForm(p => ({
        ...p,
        newMedications: [
          ...p.newMedications,
          {
            name: tempMedication.name,
            dosage: tempMedication.dosage,
            frequency: tempMedication.frequency
          }
        ]
      }))
      setTempMedication({ name: '', dosage: '', frequency: '' })
    }
  }

  const removeMedicationFromForm = i =>
    setMedicalForm(p => ({
      ...p,
      newMedications: p.newMedications.filter((_, idx) => idx !== i)
    }))

  const addAllergyToForm = () => {
    if (tempAllergy.allergen.trim()) {
      setMedicalForm(p => ({
        ...p,
        newAllergies: {
          ...p.newAllergies,
          [tempAllergy.type]: [
            ...(p.newAllergies?.[tempAllergy.type] || []),
            tempAllergy.allergen.trim()
          ]
        }
      }))
      setTempAllergy({ type: 'drugs', allergen: '' })
    }
  }

  const removeAllergyFromForm = (t, i) =>
    setMedicalForm(p => ({
      ...p,
      newAllergies: {
        ...p.newAllergies,
        [t]: p.newAllergies[t].filter((_, idx) => idx !== i)
      }
    }))

  // Shared Vital Signs section shown in every checkup type.
  // Growth monitoring captures length/height in its own measurements grid,
  // so Height/BMI are hidden there to avoid duplicate inputs.
  const renderVitalSignsSection = (includeHeightBmi = true) => (
    <div className='border-t border-white/10 pt-4'>
      <h3 className='text-sm font-medium text-blue-300 mb-3'>
        Vital Signs
      </h3>
      {includeHeightBmi ? (
        <div className='medical-vitals-primary-grid grid grid-cols-1 md:grid-cols-3 gap-3'>
          <GlassInput
            label='Weight (kg)'
            name='weight'
              error={medicalErrors.weight}
            type='number'
            min='0.1'
            max='500'
            value={medicalForm.vitalSigns.weight}
            onChange={handleVitalChange}
            placeholder='kg'
            step='0.1'
          />
          <GlassInput
            label='Height (cm)'
            name='height'
              error={medicalErrors.height}
            type='number'
            min='10'
            max='300'
            value={medicalForm.vitalSigns.height}
            onChange={handleVitalChange}
            placeholder='cm'
            step='0.1'
          />
          <GlassInput
            label={
              <>
                <span className='sm:hidden'>BMI</span>
                <span className='hidden sm:inline'>BMI (auto-computed)</span>
              </>
            }
            name='bmi'
            value={medicalForm.vitalSigns.bmi}
            readOnly
            placeholder='—'
            className='text-white/75 cursor-not-allowed'
          />
        </div>
      ) : (
        <div className='medical-vitals-primary-grid grid grid-cols-1 md:grid-cols-3 gap-3'>
          <GlassInput
            label='Weight (kg)'
            name='weight'
              error={medicalErrors.weight}
            type='number'
            min='0.1'
            max='500'
            value={medicalForm.vitalSigns.weight}
            onChange={handleVitalChange}
            placeholder='kg'
            step='0.1'
          />
          <GlassInput
            label='Temperature (°C)'
            name='temperature'
              error={medicalErrors.temperature}
            type='number'
            min='25'
            max='50'
            value={medicalForm.vitalSigns.temperature}
            onChange={handleVitalChange}
            placeholder='°C'
            step='0.1'
          />
          <GlassInput
            label='Blood Pressure (BP)'
            name='bloodPressure'
              error={medicalErrors.bloodPressure}
              pattern='[0-9]{2,3}/[0-9]{2,3}'
              title='Blood pressure must look like 120/80.'
            type='text'
            inputMode='numeric'
            maxLength={7}
            onKeyDown={blockBloodPressureKeys}
            value={medicalForm.vitalSigns.bloodPressure}
            onChange={handleVitalChange}
            placeholder='120/80'
          />
        </div>
      )}
      <div className='medical-vitals-secondary-grid grid grid-cols-1 md:grid-cols-2 gap-3 mt-3'>
        {includeHeightBmi ? (
          <>
            <GlassInput
              label='Temperature (°C)'
              name='temperature'
              error={medicalErrors.temperature}
              type='number'
              min='25'
              max='50'
              value={medicalForm.vitalSigns.temperature}
              onChange={handleVitalChange}
              placeholder='°C'
              step='0.1'
            />
            <GlassInput
              label='Blood Pressure (BP)'
              name='bloodPressure'
              error={medicalErrors.bloodPressure}
              pattern='[0-9]{2,3}/[0-9]{2,3}'
              title='Blood pressure must look like 120/80.'
              type='text'
              inputMode='numeric'
              maxLength={7}
              onKeyDown={blockBloodPressureKeys}
              value={medicalForm.vitalSigns.bloodPressure}
              onChange={handleVitalChange}
              placeholder='120/80'
            />
          </>
        ) : null}
        <GlassInput
          label='Heart Rate (HR)'
          name='heartRate'
              error={medicalErrors.heartRate}
          type='number'
          inputMode='numeric'
          min='20'
          max='300'
          step='1'
          onKeyDown={blockIntegerKeys}
          value={medicalForm.vitalSigns.heartRate}
          onChange={handleVitalChange}
          placeholder='bpm'
        />
        <GlassInput
          label={
            <>
              <span className='sm:hidden'>Fasting Blood Sugar</span>
              <span className='hidden sm:inline'>Fasting Blood Sugar (mg/dL)</span>
            </>
          }
          name='bloodSugar'
              error={medicalErrors.bloodSugar}
          type='number'
          inputMode='numeric'
          min='0'
          max='1000'
          step='1'
          onKeyDown={blockIntegerKeys}
          value={medicalForm.vitalSigns.bloodSugar}
          onChange={handleVitalChange}
          placeholder='mg/dL'
        />
      </div>
    </div>
  )

  // Shared Postpartum / Pregnancy Outcome section — fields mirror the
  // postpartum report columns plus the postnatal exam. Shown in the
  // Prenatal Checkup branch and as the core of the Postpartum Checkup type.
  // includeDangerSigns puts Maternal Danger Signs inside the Mother's panel
  // (Postpartum type only — the prenatal branch has its own symptoms input).
  // Custom applicability toggle used by the Civil Registry rows: blue
  // checkbox box only, no Yes/No text.
  const renderCivilCheckbox = (checked, onToggle) => (
    <label className='flex items-center gap-2.5 cursor-pointer select-none py-2 shrink-0'>
      <input
        type='checkbox'
        checked={!!checked}
        onChange={e => onToggle(e.target.checked)}
        className='sr-only'
      />
      <span className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-150 ${checked ? 'bg-blue-500 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.45)]' : 'bg-white/5 border-white/25'}`}>
        {checked && <Check className='w-5 h-5 text-white' strokeWidth={3} />}
      </span>
    </label>
  )
  const renderPostpartumSection = ({ includeDangerSigns = false } = {}) => (
    <>
      <div className='border-t border-white/10 pt-4 mt-4'>
        <h3 className='text-sm font-medium text-blue-300 mb-3'>
          Delivery Details
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <GlassInput
            label='Date of Delivery'
            name='birthDate'
            type='date'
            value={medicalForm.birthDate}
            onChange={handleMedicalFormChange}
          />
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Pregnancy Outcome
            </label>
            <GlassSelect
              value={medicalForm.birthOutcome}
              allowCustom={false}
              allowClear
              placeholder='Select outcome'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'birthOutcome', value: v || '' },
                })
              }
              options={[
                { value: 'live', label: 'Live Birth' },
                { value: 'preterm', label: 'Preterm Birth' },
                { value: 'stillbirth', label: 'Stillbirth' },
                { value: 'abortion', label: 'Miscarriage / Abortion' },
              ]}
            />
          </div>
          <div className='md:col-span-2'>
            <GlassInput
              label='Place of Delivery / Facility'
              name='deliveryPlace'
              value={medicalForm.deliveryPlace}
              onChange={handleMedicalFormChange}
              placeholder='e.g. BMIMC, Lying-in clinic'
            />
          </div>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Birth Attendant
            </label>
            <GlassSelect
              value={medicalForm.birthAttendant}
              allowCustom={false}
              allowClear
              placeholder='Select attendant'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'birthAttendant', value: v || '' },
                })
              }
              options={[
                { value: 'Doctor', label: 'Doctor' },
                { value: 'Midwife', label: 'Midwife' },
                { value: 'Nurse', label: 'Nurse' },
                { value: 'Other', label: 'Other' },
              ]}
            />
          </div>
          <GlassInput
            label='Birth Attendant Name'
            name='birthAttendantName'
            value={medicalForm.birthAttendantName}
            onChange={handleMedicalFormChange}
            placeholder='Name of attendant'
          />
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Mode of Delivery
            </label>
            <GlassSelect
              value={medicalForm.deliveryMode}
              allowCustom={false}
              allowClear
              placeholder='Select mode'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'deliveryMode', value: v || '' },
                })
              }
              options={[
                { value: 'Vaginal/Normal', label: 'Vaginal / Normal' },
                { value: 'Cesarean Section', label: 'Cesarean Section' },
              ]}
            />
          </div>
          <GlassInput
            label="Baby's Name"
            name='babyName'
            value={medicalForm.babyName}
            onChange={handleMedicalFormChange}
            placeholder="Newborn's name"
          />
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Baby&apos;s Gender
            </label>
            <GlassSelect
              value={medicalForm.babyGender}
              allowCustom={false}
              allowClear
              placeholder='Select gender'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'babyGender', value: v || '' },
                })
              }
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
              ]}
            />
          </div>
          <GlassInput
            label="Baby's Weight"
            name='babyWeight'
            value={medicalForm.babyWeight}
            onChange={handleMedicalFormChange}
            placeholder='e.g. 2.8kg'
          />
        </div>
      </div>

      <div className='border-t border-white/10 pt-4 mt-4'>
        <h3 className='text-sm font-medium text-blue-300 mb-3'>
          Mother&apos;s Postnatal Examination
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <GlassInput
            label="Mother's Blood Pressure"
            name='motherBP'
            type='text'
            inputMode='numeric'
            maxLength={7}
            onKeyDown={blockBloodPressureKeys}
            value={medicalForm.motherBP}
            onChange={handleMedicalFormChange}
            placeholder='e.g. 120/80'
          />
          <GlassInput
            label="Mother's Temperature (°C)"
            name='motherTemp'
              error={medicalErrors.motherTemp}
            type='number'
            min='25'
            max='50'
            value={medicalForm.motherTemp}
            onChange={handleMedicalFormChange}
            placeholder='°C'
            step='0.1'
          />
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Vaginal Bleeding / Lochia
            </label>
            <GlassSelect
              value={medicalForm.lochia}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'lochia', value: v || '' },
                })
              }
              options={[
                { value: 'Normal', label: 'Normal' },
                { value: 'Abnormal', label: 'Abnormal' },
                { value: 'Heavy', label: 'Heavy' },
              ]}
            />
          </div>
          <div className='md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3'>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Wound Condition
            </label>
            <GlassSelect
              value={medicalForm.woundCondition}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'woundCondition', value: v || '' },
                })
              }
              options={[
                { value: 'Normal', label: 'Normal' },
                { value: 'Signs of Infection', label: 'Signs of Infection' },
                { value: 'Not Applicable', label: 'Not Applicable' },
              ]}
            />
          </div>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Breastfeeding Status
            </label>
            <GlassSelect
              value={medicalForm.breastfeedingStatus}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'breastfeedingStatus', value: v || '' },
                })
              }
              options={[
                { value: 'Good', label: 'Good' },
                { value: 'With Difficulty', label: 'With Difficulty' },
                { value: 'Not Breastfeeding', label: 'Not Breastfeeding' },
              ]}
            />
          </div>
          </div>
          {includeDangerSigns && (
          <div className='md:col-span-3'>
            <GlassInput
              label='Maternal Danger Signs / Symptoms'
              name='symptoms'
              type='textarea'
              value={medicalForm.symptoms}
              onChange={handleMedicalFormChange}
              placeholder='Describe any maternal danger signs...'
            />
          </div>
          )}
        </div>
      </div>

      <div className='border-t border-white/10 pt-4 mt-4'>
        <h3 className='text-sm font-medium text-blue-300 mb-3'>
          Newborn Examination
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <GlassInput
            label="Baby's Temperature (°C)"
            name='babyTemp'
              error={medicalErrors.babyTemp}
            type='number'
            min='25'
            max='50'
            value={medicalForm.babyTemp}
            onChange={handleMedicalFormChange}
            placeholder='°C'
            step='0.1'
          />
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Baby&apos;s Feeding Status
            </label>
            <GlassSelect
              value={medicalForm.babyFeedingStatus}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'babyFeedingStatus', value: v || '' },
                })
              }
              options={[
                { value: 'Feeding Well', label: 'Feeding Well' },
                { value: 'Difficulty Feeding', label: 'Difficulty Feeding' },
              ]}
            />
          </div>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Jaundice
            </label>
            <GlassSelect
              value={medicalForm.jaundice}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'jaundice', value: v || '' },
                })
              }
              options={[
                { value: 'Present', label: 'Present' },
                { value: 'Absent', label: 'Absent' },
              ]}
            />
          </div>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Umbilical Cord Condition
            </label>
            <GlassSelect
              value={medicalForm.cordCondition}
              allowCustom={false}
              allowClear
              placeholder='Select'
              onChange={v =>
                handleMedicalFormChange({
                  target: { name: 'cordCondition', value: v || '' },
                })
              }
              options={[
                { value: 'Normal', label: 'Normal' },
                { value: 'Signs of Infection', label: 'Signs of Infection' },
                { value: 'Healed', label: 'Healed' },
              ]}
            />
          </div>
          <div className='md:col-span-2'>
            <GlassInput
              label='Newborn Danger Signs / Symptoms'
              name='newbornDangerSigns'
              type='textarea'
              value={medicalForm.newbornDangerSigns}
              onChange={handleMedicalFormChange}
              placeholder='Describe any newborn danger signs...'
            />
          </div>
        </div>
      </div>

      <div className='border-t border-white/10 pt-4 mt-4'>
        <h3 className='text-sm font-medium text-blue-300 mb-3'>
          Civil Registry (if applicable)
        </h3>
        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>
              Maternal Death (if applicable)
            </label>
            <div className='flex flex-row items-center gap-3'>
              {renderCivilCheckbox(!!medicalForm.maternalDeathApplicable, (checked) => {
                handleMedicalFormChange({
                  target: { name: 'maternalDeathApplicable', value: checked },
                })
                if (!checked) handleMedicalFormChange({ target: { name: 'maternalDeathDate', value: '' } })
              })}
              <div className='flex-1'>
              <GlassInput
                name='maternalDeathDate'
                type='date'
                value={medicalForm.maternalDeathDate}
                onChange={handleMedicalFormChange}
                disabled={!medicalForm.maternalDeathApplicable}
                className={!medicalForm.maternalDeathApplicable ? 'opacity-50' : ''}
              />
              </div>
            </div>
          </div>
          <div>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>
              Stillbirth (if applicable)
            </label>
            <div className='flex flex-row items-center gap-3'>
              {renderCivilCheckbox(!!medicalForm.stillbirthApplicable, (checked) => {
                handleMedicalFormChange({
                  target: { name: 'stillbirthApplicable', value: checked },
                })
                if (!checked) handleMedicalFormChange({ target: { name: 'stillbirthRegDate', value: '' } })
              })}
              <div className='flex-1'>
              <GlassInput
                name='stillbirthRegDate'
                type='date'
                value={medicalForm.stillbirthRegDate}
                onChange={handleMedicalFormChange}
                disabled={!medicalForm.stillbirthApplicable}
                className={!medicalForm.stillbirthApplicable ? 'opacity-50' : ''}
              />
              </div>
            </div>
          </div>
          <div>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>
              Early Neonatal Death (0–7 days) (if applicable)
            </label>
            <div className='flex flex-row items-center gap-3'>
              {renderCivilCheckbox(!!medicalForm.neonatalDeathApplicable, (checked) => {
                handleMedicalFormChange({
                  target: { name: 'neonatalDeathApplicable', value: checked },
                })
                if (!checked) handleMedicalFormChange({ target: { name: 'neonatalDeathDate', value: '' } })
              })}
              <div className='flex-1'>
              <GlassInput
                name='neonatalDeathDate'
                type='date'
                value={medicalForm.neonatalDeathDate}
                onChange={handleMedicalFormChange}
                disabled={!medicalForm.neonatalDeathApplicable}
                className={!medicalForm.neonatalDeathApplicable ? 'opacity-50' : ''}
              />
              </div>
            </div>
          </div>
          <div>
            <GlassInput
              label="Spouse's Name"
              name='spouseName'
              value={medicalForm.spouseName}
              onChange={handleMedicalFormChange}
              placeholder="e.g. Husband: Juan Dela Cruz"
            />
          </div>
        </div>
      </div>
    </>
  )

  // Shared Chronic Condition Identified section shown in every checkup type.
  const renderChronicSection = () => (
    <div className='border-t border-white/10 pt-4'>
      <h3 className='text-sm font-medium text-blue-300 mb-3'>
        Chronic Condition Identified
      </h3>
      {medicalForm.newConditions.length > 0 ? (
        <div className='flex flex-wrap gap-2 mb-3'>
          {medicalForm.newConditions.map((c, i) => (
            <span
              key={i}
              className={`px-3 py-1.5 border rounded-full text-sm font-medium flex items-center gap-1 ${
                c.severity === 'Critical'
                  ? 'bg-red-500/30 text-red-200 border-red-400/40'
                  : c.severity === 'Severe'
                  ? 'bg-orange-500/30 text-orange-200 border-orange-400/40'
                  : c.severity === 'Moderate'
                  ? 'bg-yellow-500/30 text-yellow-200 border-yellow-400/40'
                  : 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
              }`}
            >
              {c.name}
              <span className='text-[10px] opacity-70'>
                ({c.severity || 'Mild'})
              </span>
              <button
                type='button'
                onClick={() => removeConditionFromForm(i)}
                className='hover:text-red-400 ml-1'
              >
                <X className='w-3 h-3' />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className='text-white/65 text-xs mb-3'>No conditions</p>
      )}
      <div className='flex gap-2 items-end'>
        <div className='flex-1'>
          <GlassInput
            placeholder='Condition name'
            value={tempCondition.name || ''}
            onChange={e =>
              setTempCondition(p => ({ ...p, name: e.target.value }))
            }
          />
        </div>
        <div className='w-36'>
          <GlassSelect
            value={tempCondition.severity || 'Mild'}
            onChange={v =>
              setTempCondition(p => ({
                ...p,
                severity: v
              }))
            }
            options={[
              { value: 'Mild', label: 'Mild' },
              { value: 'Moderate', label: 'Moderate' },
              { value: 'Severe', label: 'Severe' }
            ]}
          />
        </div>
        <button
          type='button'
          onClick={addConditionToForm}
          disabled={!tempCondition.name || !tempCondition.name.trim()}
          className='p-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-50 flex-shrink-0'
        >
          <Plus className='w-5 h-5' />
        </button>
      </div>
    </div>
  )

  // Shared Current Medications section shown in every checkup type.
  const renderMedicationsSection = () => (
    <div className='border-t border-white/10 pt-4'>
      <h3 className='text-sm font-medium text-blue-300 mb-3'>
        Current Medications
      </h3>
      {medicalForm.newMedications.length > 0 ? (
        <div className='flex flex-wrap gap-3 mb-3'>
          {medicalForm.newMedications.map((m, i) => (
            <div
              key={i}
              className='px-3 py-1.5 bg-blue-500/30 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
            >
              <span className='text-white'>{m.name}</span>
              {(m.dosage || m.frequency) && (
                <>
                  <span className='text-white/50'>|</span>
                  <span className='text-white/75 text-sm'>
                    {[m.dosage, m.frequency]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </>
              )}
              <button
                type='button'
                onClick={() => removeMedicationFromForm(i)}
                className='hover:text-red-400 ml-1'
              >
                <X className='w-3 h-3' />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className='text-white/65 text-xs mb-3'>No medications</p>
      )}
      <div className='flex gap-2 items-end'>
        <div className='flex-1'>
          <GlassInput
            placeholder='Medication name'
            value={tempMedication.name}
            onChange={e =>
              setTempMedication(p => ({ ...p, name: e.target.value }))
            }
          />
        </div>
        <div className='flex-1'>
          <GlassInput
            placeholder='Dosage'
            value={tempMedication.dosage}
            onChange={e =>
              setTempMedication(p => ({
                ...p,
                dosage: e.target.value
              }))
            }
          />
        </div>
        <div className='flex-1'>
          <GlassInput
            placeholder='Frequency'
            value={tempMedication.frequency}
            onChange={e =>
              setTempMedication(p => ({
                ...p,
                frequency: e.target.value
              }))
            }
          />
        </div>
        <button
          type='button'
          onClick={addMedicationToForm}
          disabled={!tempMedication.name.trim()}
          className='p-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-50 flex-shrink-0'
        >
          <Plus className='w-5 h-5' />
        </button>
      </div>
    </div>
  )

  // Shared Allergies section shown in every checkup type.
  const renderAllergiesSection = () => (
    <div className='border-t border-white/10 pt-4'>
      <h3 className='text-sm font-medium text-blue-300 mb-3'>
        Allergies
      </h3>
      {medicalForm.newAllergies?.drugs?.length > 0 ||
      medicalForm.newAllergies?.food?.length > 0 ||
      medicalForm.newAllergies?.environmental?.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-3'>
          {['drugs', 'food', 'environmental'].map(
            t =>
              medicalForm.newAllergies[t]?.length > 0 && (
                <div key={t}>
                  <h4 className='text-xs font-medium text-blue-200 mb-2 capitalize'>
                    {t}
                  </h4>
                  <div className='flex flex-wrap gap-1'>
                    {medicalForm.newAllergies[t].map((a, i) => (
                      <span
                        key={i}
                        className='px-3 py-1.5 bg-blue-500/30 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                      >
                        {a}
                        <button
                          type='button'
                          onClick={() => removeAllergyFromForm(t, i)}
                          className='hover:text-red-400'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      ) : (
        <p className='text-white/65 text-xs mb-3'>No allergies</p>
      )}
      <div className='flex gap-2'>
        <GlassSelect
          value={tempAllergy.type}
          allowCustom
          onChange={v =>
            setTempAllergy(p => ({ ...p, type: v || 'drugs' }))
          }
          className='w-36'
          options={[
            { value: 'drugs', label: 'Drug' },
            { value: 'environmental', label: 'Environmental' },
            { value: 'food', label: 'Food' }
          ]}
        />
        <div className='flex-1'>
          <GlassInput
            placeholder='Enter allergen'
            value={tempAllergy.allergen}
            onChange={e =>
              setTempAllergy(p => ({
                ...p,
                allergen: e.target.value
              }))
            }
            onKeyDown={e =>
              e.key === 'Enter' &&
              (e.preventDefault(), addAllergyToForm())
            }
          />
        </div>
        <button
          type='button'
          onClick={addAllergyToForm}
          disabled={!tempAllergy.allergen.trim()}
          className='p-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-50 flex-shrink-0'
        >
          <Plus className='w-5 h-5' />
        </button>
      </div>
    </div>
  )

  // Shared Health Worker field (also placed inside the Referral 2-col grid).
  const renderHealthWorkerField = () => (
    <div className='space-y-1.5'>
      <label className='block text-sm font-medium text-blue-200'>
        {medicalForm.type === 'Prenatal Checkup'
          ? 'Health Worker'
          : medicalForm.type === 'Vaccination'
          ? 'Administering Health Worker'
          : 'Health Worker'}
      </label>
      <div className='relative'>
        <input
          type='text'
          name='administered_by'
          value={medicalForm.administered_by}
          onChange={e => {
            const value = e.target.value
            setMedicalForm(p => ({ ...p, administered_by: value }))
            setAdministeredByFilter(value)
            setShowAdministeredByDropdown(true)
          }}
          onFocus={() => {
            setAdministeredByFilter(medicalForm.administered_by)
            setShowAdministeredByDropdown(true)
          }}
          onBlur={() =>
            setTimeout(() => setShowAdministeredByDropdown(false), 200)
          }
          placeholder='Type name or select from dropdown'
          className='glass-input w-full pr-10'
        />
        <button
          type='button'
          onClick={() =>
            setShowAdministeredByDropdown(!showAdministeredByDropdown)
          }
          className='absolute right-2 top-1/2 -translate-y-1/2 text-white/75 hover:text-white/85'
        >
          <ChevronDown className='w-4 h-4' />
        </button>
        {showAdministeredByDropdown && (
          <div className='absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto'>
            {[...bhws]
              .sort((a, b) => a.name?.localeCompare(b.name))
              .filter(b => {
                const isActive = b.status === 'Active'
                // Only rank-and-file Barangay Health Workers — no heads,
                // nurses, midwives, doctors, or other staff.
                const isBHW =
                  b.position === 'Barangay Health Worker' ||
                  b.position === 'BHW'
                const matchesSearch = b.name
                  .toLowerCase()
                  .includes(administeredByFilter.toLowerCase())
                return isActive && isBHW && matchesSearch
              })
              .map(b => (
                <button
                  key={b.id}
                  type='button'
                  className='w-full text-left px-3 py-2 text-sm text-white/75 hover:bg-white/10 transition-colors'
                  onClick={() => {
                    setMedicalForm(p => ({
                      ...p,
                      administered_by: b.name
                    }))
                    setAdministeredByFilter(b.name)
                    setShowAdministeredByDropdown(false)
                  }}
                >
                  {b.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )

  const handleAddMedicalHistory = async e => {
    e.preventDefault()
    const form = e.currentTarget
    setSaving(true)
    try {
      const f = medicalForm
      let partialSave = false
      // Growth vaccines: auto-commit a vaccine still sitting in the picker
      // (chosen from the dropdown but the small Add button wasn't pressed)
      // so it isn't silently dropped on save.
      const pendingGrowthVax = String(tempVaccine?.name || '').trim()
      const effectiveGrowthVaccines = [...(f.newVaccines || [])]
      if ((f.type === 'Growth Monitoring' || (f.type === 'Referral' && isInfantConcern(f.referralCategory))) && pendingGrowthVax) {
        const keyOf = v => String(typeof v === 'string' ? v : v?.name || '').trim().toLowerCase()
        const dispNew = growthVaxDisplay({ name: pendingGrowthVax }).toLowerCase()
        if (
          !effectiveGrowthVaccines.some(v => keyOf(v) === pendingGrowthVax.toLowerCase()) &&
          !effectiveGrowthVaccines.some(v => growthVaxDisplay(v).toLowerCase() === dispNew)
        ) {
          effectiveGrowthVaccines.push({ name: pendingGrowthVax })
        }
      }
      if (!getAllowedRecordTypes().includes(f.type)) {
        dialog.error(`${recordTypeLabels[f.type] || f.type} is not applicable to this resident.`, 'Validation error')
        setSaving(false)
        return
      }
      // Complete-flow: block empty submissions so the linked schedule can
      // only complete after a real medical record is added.
      if (completeSchedule?.scheduleId && !isMedType(f.type) && !hasCompleteFlowContent(f)) {
        dialog.error('Please fill in the visit findings (reason, symptoms, assessment, notes, vital signs, or measurements) before completing the schedule.', 'Incomplete visit')
        setSaving(false)
        return
      }
      const recordDate = f.encounterDate || todayStr()
      // Referrals happen at the referral facility, not a service location.
      const facility =
        f.type === 'Referral'
          ? (f.facilityName.trim() || 'Referred Facility')
          : f.serviceLocation === 'Other' && f.serviceLocationOther.trim()
          ? f.serviceLocationOther.trim()
          : f.serviceLocation || f.facility || 'Barangay Health Center'
      // Vitals columns are NUMERIC(4,1) - reject absurd values before save
      // instead of hitting a numeric overflow in the database.
      const nextMedicalErrors = {}
      const addRangeError = (field, label, raw, min, max) => {
        if (raw === '' || raw === null || raw === undefined) return
        const n = Number(raw)
        if (!Number.isFinite(n) || n < min || n >= max) {
          nextMedicalErrors[field] = `${label} must be between ${min} and ${max}.`
        }
      }
      const isGrowthOrInfantReferral =
        f.type === 'Growth Monitoring' ||
        (f.type === 'Referral' && isInfantConcern(f.referralCategory))
      addRangeError('temperature', 'Temperature', f.vitalSigns.temperature, 25, 46)
      addRangeError('heartRate', 'Heart Rate (HR)', f.vitalSigns.heartRate, 20, 300)
      addRangeError('bloodSugar', 'Fasting Blood Sugar', f.vitalSigns.bloodSugar, 10, 1000)
      addRangeError('weight', 'Weight', f.vitalSigns.weight, 1, 1000)
      addRangeError(
        isGrowthOrInfantReferral ? 'lengthHeight' : 'height',
        'Height',
        isGrowthOrInfantReferral ? f.lengthHeight : f.vitalSigns.height,
        10,
        300
      )
      addRangeError('fundalHeight', 'Fundal Height', f.fundalHeight, 5, 60)
      addRangeError('fetalHeartRate', 'Fetal Heart Rate', f.fetalHeartRate, 50, 240)
      addRangeError('muac', 'MUAC', f.muac, 10, 60)
      addRangeError('motherWeight', "Mother's Weight", f.motherWeight, 1, 1000)
      addRangeError('motherTemp', "Mother's Temperature", f.motherTemp, 25, 46)
      addRangeError('babyTemp', "Baby's Temperature", f.babyTemp, 25, 46)
      addRangeError('headCircumference', 'Head Circumference', f.headCircumference, 20, 70)
      addRangeError('respiratoryRate', 'Respiratory Rate', f.respiratoryRate, 5, 200)
      const bloodPressure = String(f.vitalSigns.bloodPressure || '').trim()
      if (bloodPressure && !/^\d{2,3}\/\d{2,3}$/.test(bloodPressure)) {
        nextMedicalErrors.bloodPressure = 'Blood pressure must look like 120/80.'
      }
      if (Object.keys(nextMedicalErrors).length > 0) {
        setMedicalErrors(nextMedicalErrors)
        focusFirstError(nextMedicalErrors, form)
        setSaving(false)
        return
      }
      setMedicalErrors({})
      if (isMedType(f.type)) {
        const medType = f.type === 'Vitamins' ? 'Vitamin Supplementation' : f.type
        if (!f.medicine_master_id) {
          const nextErrors = { medicine_master_id: 'Select a medicine.' }
          setMedicalErrors(nextErrors)
          focusFirstError(nextErrors, form)
          setSaving(false)
          return
        }
        if (!medicineSchedules.some(m => String(m.id) === String(f.medicine_master_id))) {
          const nextErrors = { medicine_master_id: 'Please select a valid medicine from the list.' }
          setMedicalErrors(nextErrors)
          focusFirstError(nextErrors, form)
          setSaving(false)
          return
        }
        const s = medicineSchedules.find(
          m => String(m.id) === String(f.medicine_master_id)
        )
        // Extra free-text fields (dose, quantity, next date) have no dedicated
        // columns in resident_medicine_records, so they travel inside remarks.
        const remarkParts = []
        if (medType === 'Deworming' && f.doseText.trim()) remarkParts.push(`Dose: ${f.doseText.trim()}`)
        if (medType === 'Vitamin Supplementation') {
          if (f.doseText.trim()) remarkParts.push(`Dose: ${f.doseText.trim()}`)
          if (String(f.quantityProvided).trim()) remarkParts.push(`Qty: ${String(f.quantityProvided).trim()}`)
        }
        if (f.notes.trim()) remarkParts.push(f.notes.trim())
        const confirmed = await confirmCreate(
          'medical record',
          `Please confirm that you want to record ${medType} for ${resident?.name || 'this resident'}.`
        )
        if (!confirmed) return
        await medicineApi.recordMedicine(id, {
          medicine_master_id: f.medicine_master_id,
          medicine_name: s?.medicine_name || '',
          category:
            s?.category ||
            (medType === 'Vaccination' ? 'vaccine' : medType === 'Vitamin Supplementation' ? 'vitamins' : 'deworming'),
          dose_number: nextDoseNumber(s),
          total_doses: s?.total_doses || 1,
          date_administered: recordDate,
          facility,
          batch_number: f.batch_number,
          administration_site: f.administration_site,
          administered_by: f.administered_by,
          remarks: remarkParts.join(' | ')
        })
      } else {
        // Checkup-like encounters share one backend shape: diagnosis holds the
        // assessment/findings, treatment holds symptoms, and every extra
        // structured field is serialized into notes so nothing is lost.
        const line = (label, val) =>
          val !== '' && val !== null && val !== undefined && String(val).trim() !== ''
            ? `${label}: ${String(val).trim()}`
            : null
        // Status inputs are hidden: Prenatal Checkups are always Active,
        // Postpartum Checkups are always Delivered.
        const effectivePregnancyStatus =
          f.type === 'Postpartum Checkup'
            ? 'Delivered'
            : f.type === 'Prenatal Checkup'
              ? 'Active'
              : (f.pregnancyStatus || '')
        const birthOutcomeLabel = { live: 'Live birth', preterm: 'Preterm birth', stillbirth: 'Stillbirth', abortion: 'Miscarriage / Abortion' }[f.birthOutcome] || f.birthOutcome
        // Postpartum helpers shared by the Prenatal and Postpartum branches.
        // The Q (outcome narrative) and P (remarks) report columns are
        // auto-composed from the structured fields — they have no inputs.
        const postpartumHasOutcome = [
          f.birthOutcome, f.birthDate, f.maternalDeathDate,
          f.stillbirthRegDate, f.neonatalDeathDate, f.spouseName,
          f.deliveryPlace, f.birthAttendantName, f.babyName,
        ].some(v => v !== '' && v !== null && v !== undefined && String(v).trim() !== '')
        const composedOutcomeDetails = postpartumHasOutcome
          ? [
              f.deliveryPlace.trim(),
              [f.birthAttendant, f.birthAttendantName.trim()].filter(Boolean).join(' '),
              f.deliveryMode,
              [f.babyName.trim(), f.babyGender, f.babyWeight.trim()].filter(Boolean).join(' '),
            ].filter(v => v && String(v).trim() !== '').join(' | ')
          : ''
        const composedPostpartumRemarks = postpartumHasOutcome
          ? [
              f.spouseName.trim() ? `Spouse: ${f.spouseName.trim()}` : '',
              f.symptoms.trim() ? `Danger signs: ${f.symptoms.trim()}` : '',
            ].filter(Boolean).join(' | ')
          : ''
        const postpartumNoteLines = () => [
          line('Birth outcome', birthOutcomeLabel),
          line('Birth date', f.birthDate),
          line('Delivery place', f.deliveryPlace),
          line('Birth attendant', f.birthAttendant),
          line('Birth attendant name', f.birthAttendantName),
          line('Mode of delivery', f.deliveryMode),
          line("Baby's name", f.babyName),
          line("Baby's gender", f.babyGender),
          line("Baby's weight", f.babyWeight),
          line('Check-up date', recordDate),
          line("Mother's BP", f.motherBP),
          line("Mother's temperature", f.motherTemp),
          line('Lochia', f.lochia),
          line('Wound condition', f.woundCondition),
          line('Breastfeeding status', f.breastfeedingStatus),
          line("Baby's temperature", f.babyTemp),
          line("Baby's feeding status", f.babyFeedingStatus),
          line('Jaundice', f.jaundice),
          line('Cord condition', f.cordCondition),
          line('Newborn danger signs', f.newbornDangerSigns),
          line('Maternal death applicable', f.maternalDeathApplicable ? 'Yes' : 'No'),
          line('Stillbirth registration applicable', f.stillbirthApplicable ? 'Yes' : 'No'),
          line('Neonatal death applicable', f.neonatalDeathApplicable ? 'Yes' : 'No'),
          line('Maternal death date', f.maternalDeathApplicable ? f.maternalDeathDate : ''),
          line('Stillbirth reg date', f.stillbirthApplicable ? f.stillbirthRegDate : ''),
          line('Neonatal death date', f.neonatalDeathApplicable ? f.neonatalDeathDate : ''),
          line("Spouse's name", f.spouseName),
          line('Outcome details', composedOutcomeDetails),
          line('Postpartum remarks', composedPostpartumRemarks),
        ]
        const postpartumPayloadOf = () => ({
          birthOutcome: f.birthOutcome || '',
          birthDate: f.birthDate || '',
          deliveryPlace: f.deliveryPlace || '',
          birthAttendant: f.birthAttendant || '',
          birthAttendantName: f.birthAttendantName || '',
          deliveryMode: f.deliveryMode || '',
          babyName: f.babyName || '',
          babyGender: f.babyGender || '',
          babyWeight: f.babyWeight || '',
          checkupDate: recordDate,
          motherBP: f.motherBP || '',
          motherTemp: f.motherTemp || '',
          lochia: f.lochia || '',
          woundCondition: f.woundCondition || '',
          breastfeedingStatus: f.breastfeedingStatus || '',
          babyTemp: f.babyTemp || '',
          babyFeedingStatus: f.babyFeedingStatus || '',
          jaundice: f.jaundice || '',
          cordCondition: f.cordCondition || '',
          newbornDangerSigns: f.newbornDangerSigns || '',
          maternalDeathDate: f.maternalDeathApplicable ? (f.maternalDeathDate || '') : '',
          stillbirthRegDate: f.stillbirthApplicable ? (f.stillbirthRegDate || '') : '',
          neonatalDeathDate: f.neonatalDeathApplicable ? (f.neonatalDeathDate || '') : '',
          spouseName: f.spouseName || '',
          outcomeDetails: composedOutcomeDetails,
          postpartumRemarks: composedPostpartumRemarks,
        })
        let diagnosis = ''
        let treatment = ''
        let notesExtra = []
        let vitalsToSend = null
        let conditionsToSend = f.newConditions
        if (f.type === 'Checkup') {
          diagnosis = f.assessment.trim()
          treatment = [f.reason.trim(), f.symptoms.trim()].filter(Boolean).join(' | ')
          notesExtra = [
            line('Reason for checkup', f.reason),
            line('Symptoms', f.symptoms),
            line('Fasting blood sugar', f.vitalSigns.bloodSugar ? `${f.vitalSigns.bloodSugar} mg/dL` : ''),
            line('Assessment / Findings', f.assessment),
            line('Remarks', f.notes),
          ].filter(Boolean)
          vitalsToSend = { ...f.vitalSigns }
        } else if (f.type === 'Senior Checkup') {
          diagnosis = f.assessment.trim()
          treatment = [f.reason.trim(), f.symptoms.trim()].filter(Boolean).join(' | ')
          notesExtra = [
            line('Reason for checkup', f.reason),
            line('Symptoms', f.symptoms),
            line('Fasting blood sugar', f.vitalSigns.bloodSugar ? `${f.vitalSigns.bloodSugar} mg/dL` : ''),
            line('Mobility / Functional status', f.mobilityStatus),
            line('Assessment / Findings', f.assessment),
            line('Remarks', f.notes),
          ].filter(Boolean)
          vitalsToSend = { ...f.vitalSigns }
        } else if (f.type === 'Prenatal Checkup') {
          diagnosis = f.assessment.trim()
          treatment = f.symptoms.trim()
          // MUAC date is automatic (== this checkup's date). ANC window is
          // automatic by LMP — the backend buckets the visit date.
          const autoMuacDate = f.muac ? recordDate : ''
          notesExtra = [
            line('LMP', f.lmp),
            line('EDD', f.edd),
            line('Gravida', f.gravida),
            line('Para', f.para),
            line('Pregnancy status', effectivePregnancyStatus),
            line('Gestational age', f.gestationalAge),
            line("Mother's weight", f.motherWeight ? `${f.motherWeight} kg` : ''),
            line("Mother's BP", f.motherBP),
            line("Mother's temperature", f.motherTemp ? `${f.motherTemp} °C` : ''),
            line('Fundal height', f.fundalHeight ? `${f.fundalHeight} cm` : ''),
            line('Fetal heart rate', f.fetalHeartRate ? `${f.fetalHeartRate} bpm` : ''),
            line('Fetal movement', f.fetalMovement),
            line('MUAC', f.muac ? `${f.muac} cm` : ''),
            line('MUAC date', autoMuacDate),
            line('TD status', f.tdStatus),
            line('Private visit', f.isPrivateVisit ? 'Yes' : 'No'),
            ...postpartumNoteLines(),
            line('Pregnancy-related signs / symptoms', f.symptoms),
            line('Assessment / Findings', f.assessment),
            line('Remarks', f.notes),
          ].filter(Boolean)
          // Dedicated prenatal vitals flow into structured vitals storage
          // (the generic vitals section is hidden for this type).
          vitalsToSend = {
            ...f.vitalSigns,
            weight: f.motherWeight || f.vitalSigns.weight || '',
            bloodPressure: f.motherBP || f.vitalSigns.bloodPressure || '',
            temperature: f.motherTemp || f.vitalSigns.temperature || '',
          }
        } else if (f.type === 'Postpartum Checkup') {
          // Postpartum visits mirror the postpartum report columns.
          // Pregnancy status is always Delivered for this type (no input).
          diagnosis = f.assessment.trim()
          treatment = f.symptoms.trim()
          notesExtra = [
            line('Pregnancy status', 'Delivered'),
            ...postpartumNoteLines(),
            line('Maternal danger signs', f.symptoms),
            line('Assessment / Findings', f.assessment),
            line('Remarks', f.notes),
          ].filter(Boolean)
          vitalsToSend = { ...f.vitalSigns }
        } else if (f.type === 'Growth Monitoring') {
          diagnosis = f.assessment.trim()
          treatment = f.nutritionConcerns.trim()
          const growthVaxNames = effectiveGrowthVaccines.map(v => growthVaxDisplay(typeof v === 'string' ? { name: v } : v)).map(s => String(s).trim()).filter(Boolean)
          const growthVaxSchedules = growthVaxNames.map(nm => medicineSchedules.find(m =>
            String(m.id) === String(resolveMedicineId(nm, 'vaccine'))
          ))
          notesExtra = [
            line('Place of Birth', f.placeOfBirth),
            line("Mother's Name", f.motherName),
            line("Father's Name", f.fatherName),
            line('Weight', f.vitalSigns.weight ? `${f.vitalSigns.weight} kg` : ''),
            line('Length / Height', f.lengthHeight ? `${f.lengthHeight} cm` : ''),
            line('Head circumference', f.headCircumference ? `${f.headCircumference} cm` : ''),
            line('Feeding status', f.feedingStatus),
            line('Growth status', f.growthStatus),
            line('Nutritional status', f.nutritionalStatus),
            line('Developmental milestones', f.developmentalObs),
            line('Developmental concerns', f.developmentalConcerns),
            line('Respiratory rate', f.respiratoryRate ? `${f.respiratoryRate} breaths/min` : ''),
            line('Vaccines', growthVaxNames.join('; ')),
            line('Vaccine dose', growthVaxNames.length ? 'Dose 1' : ''),
            line('Vaccine date', growthVaxNames.length ? recordDate : ''),
            line('Vaccine batch', growthVaxNames.length ? f.batch_number : ''),
            line('Vaccinator', growthVaxNames.length ? (f.growthVaccinator || f.administered_by) : ''),
            line('Nutrition / Growth concerns', f.nutritionConcerns),
            line('Assessment / Findings', f.assessment),
            line('Remarks', f.notes),
          ].filter(Boolean)
          vitalsToSend = {
            ...f.vitalSigns,
            height: f.lengthHeight || ''
          }
        } else if (f.type === 'Referral') {
          // Referral encounters reuse the concern-category field shapes:
          // General Concern mirrors Checkup (+ Mobility for seniors),
          // Infant Concern mirrors Growth Monitoring, Pregnancy Concern
          // mirrors Prenatal or Postpartum Checkup per the Checkup Type
          // selector.
          const referralHead = [
            line('Referral category', f.referralCategory),
            line('Facility type', f.facilityType),
            line('Facility name', f.facilityName),
            line('Facility location', f.facilityLocation),
          ].filter(Boolean)
          if (isPregnancyConcern(f.referralCategory)) {
            if ((f.referralPregnancyType || 'Prenatal') === 'Postpartum') {
              diagnosis = f.assessment.trim()
              treatment = f.symptoms.trim()
              notesExtra = [
                ...referralHead,
                line('Referral checkup type', 'Postpartum Checkup'),
                line('Pregnancy status', 'Delivered'),
                ...postpartumNoteLines(),
                line('Maternal danger signs', f.symptoms),
                line('Maternal / Newborn assessment', f.assessment),
                line('Remarks', f.notes),
              ].filter(Boolean)
              vitalsToSend = { ...f.vitalSigns }
            } else {
            diagnosis = f.assessment.trim()
            treatment = f.symptoms.trim()
            notesExtra = [
              ...referralHead,
              line('Referral checkup type', 'Prenatal Checkup'),
              line('LMP', f.lmp),
              line('EDD', f.edd),
              line('Gravida', f.gravida),
              line('Para', f.para),
              line('Pregnancy status', f.pregnancyStatus),
              line('Gestational age', f.gestationalAge),
              line('Fundal height', f.fundalHeight ? `${f.fundalHeight} cm` : ''),
              line('Fetal heart rate', f.fetalHeartRate ? `${f.fetalHeartRate} bpm` : ''),
              line('Fetal movement', f.fetalMovement),
            line('MUAC', f.muac ? `${f.muac} cm` : ''),
            line('MUAC date', f.muac ? recordDate : ''),
            line('TD status', f.tdStatus),
            line('Private visit', f.isPrivateVisit ? 'Yes' : 'No'),
            ...postpartumNoteLines(),
            line('Pregnancy-related symptoms', f.symptoms),
              line('Maternal assessment / Findings', f.assessment),
              line('Remarks', f.notes),
            ].filter(Boolean)
            vitalsToSend = { ...f.vitalSigns }
            }
          } else if (isInfantConcern(f.referralCategory)) {
            diagnosis = ''
            treatment = f.nutritionConcerns.trim()
            const infantRefVaxNames = effectiveGrowthVaccines.map(v => growthVaxDisplay(typeof v === 'string' ? { name: v } : v)).map(s => String(s).trim()).filter(Boolean)
            notesExtra = [
              ...referralHead,
              line('Place of Birth', f.placeOfBirth),
              line("Mother's Name", f.motherName),
              line("Father's Name", f.fatherName),
              line('Weight', f.vitalSigns.weight ? `${f.vitalSigns.weight} kg` : ''),
              line('Length / Height', f.lengthHeight ? `${f.lengthHeight} cm` : ''),
              line('Head circumference', f.headCircumference ? `${f.headCircumference} cm` : ''),
              line('Feeding status', f.feedingStatus),
              line('Growth status', f.growthStatus),
              line('Nutritional status', f.nutritionalStatus),
              line('Developmental milestones', f.developmentalObs),
              line('Developmental concerns', f.developmentalConcerns),
              line('Respiratory rate', f.respiratoryRate ? `${f.respiratoryRate} breaths/min` : ''),
              line('Vaccines', infantRefVaxNames.join('; ')),
              line('Vaccine dose', infantRefVaxNames.length ? 'Dose 1' : ''),
              line('Vaccine date', infantRefVaxNames.length ? recordDate : ''),
              line('Vaccine batch', infantRefVaxNames.length ? f.batch_number : ''),
              line('Vaccinator', infantRefVaxNames.length ? (f.growthVaccinator || f.administered_by) : ''),
              line('Nutrition / Growth concerns', f.nutritionConcerns),
              line('Remarks', f.notes),
            ].filter(Boolean)
            vitalsToSend = {
              ...f.vitalSigns,
              height: f.lengthHeight || ''
            }
          } else {
            diagnosis = f.assessment.trim()
            treatment = [f.reason.trim(), f.symptoms.trim()].filter(Boolean).join(' | ')
            notesExtra = [
              ...referralHead,
              line('Reason for checkup', f.reason),
              line('Symptoms', f.symptoms),
              line('Fasting blood sugar', f.vitalSigns.bloodSugar ? `${f.vitalSigns.bloodSugar} mg/dL` : ''),
              line('Mobility / Functional status', f.mobilityStatus),
              line('Assessment / Findings', f.assessment),
              line('Remarks', f.notes),
            ].filter(Boolean)
            vitalsToSend = { ...f.vitalSigns }
          }
        } else {
          // Legacy 'Checkup' records
          diagnosis = f.assessment.trim()
          treatment = f.symptoms.trim()
          notesExtra = f.notes.trim() ? [f.notes.trim()] : []
          vitalsToSend = { ...f.vitalSigns }
        }
        const isReferralPregnancyPostpartum =
          f.type === 'Referral' && isPregnancyConcern(f.referralCategory) && (f.referralPregnancyType || 'Prenatal') === 'Postpartum'
        const isPrenatalEncounter =
          f.type === 'Prenatal Checkup' ||
          (f.type === 'Referral' && isPregnancyConcern(f.referralCategory) && !isReferralPregnancyPostpartum)
        const isPostpartumEncounter =
          f.type === 'Postpartum Checkup' || isPrenatalEncounter || isReferralPregnancyPostpartum
        // Growth-visit vaccines must all resolve to real vaccine schedules
        // before anything is saved.
        if ((f.type === 'Growth Monitoring' || (f.type === 'Referral' && isInfantConcern(f.referralCategory))) && effectiveGrowthVaccines.length > 0) {
          const bad = effectiveGrowthVaccines
            .map(v => String(typeof v === 'string' ? v : v.name || '').trim())
            .filter(Boolean)
            .find(nm => {
              const s = medicineSchedules.find(m => String(m.id) === String(resolveMedicineId(nm, 'vaccine')));
              return !s || normCat(s) !== 'vaccine';
            });
          if (bad) {
            dialog.error(`Please select a valid vaccine from the list ("${bad}" is not recognized).`, 'Validation error');
            setSaving(false);
            return;
          }
        }
        const confirmed = await confirmCreate(
          'medical record',
          `Please confirm that you want to add a ${f.type || 'Checkup'} record for ${resident?.name || 'this resident'}.`
        )
        if (!confirmed) return
        const res = await residentApi.addMedicalHistory(id, {
          date: recordDate,
          type: f.type || 'Checkup',
          facility,
          diagnosis,
          treatment,
          notes: notesExtra.join('\n'),
          vitalSigns: vitalsToSend && Object.values(vitalsToSend).some(v => v !== '')
            ? vitalsToSend
            : undefined,
          // Structured prenatal payload → prenatal report columns.
          // muacDate is automatic (== this checkup's date), ancWindow is
          // automatic by LMP (backend buckets the visit date).
          // The backend also keeps the notes lines above as fallback.
          prenatal: isPrenatalEncounter
            ? {
                lmp: f.lmp || '',
                edd: f.edd || '',
                gravida: f.gravida || '',
                para: f.para || '',
                pregnancyStatus: effectivePregnancyStatus,
                gestationalAge: f.gestationalAge || '',
                fundalHeight: f.fundalHeight || '',
                fetalHeartRate: f.fetalHeartRate || '',
                fetalMovement: f.fetalMovement || '',
                muac: f.muac || '',
                muacDate: f.muac ? recordDate : '',
                tdStatus: f.tdStatus || '',
                ancWindow: '',
                isPrivateVisit: !!f.isPrivateVisit,
              }
            : undefined,
          // Structured postpartum payload → postpartum report columns.
          // The Q/P narrative columns are auto-composed from the fields.
          postpartum: isPostpartumEncounter
            ? postpartumPayloadOf()
            : undefined,
          administered_by: f.administered_by,
          chronicConditions: conditionsToSend,
          currentMedications: f.newMedications,
          allergies: f.newAllergies
        })
        if (res.data?.success && res.data?.vitalsOk === false) {
          partialSave = true
          dialog.error('Medical record saved, but vital signs failed to save.' + (res.data?.vitalsError ? `\nReason: ${res.data.vitalsError}` : '\nPlease try editing the record.'), 'Partial save')
        }
        // Growth-visit vaccinations: each added vaccine is recorded
        // alongside the checkup as the resident's NEXT dose
        // (completed + 1), so total doses + after-previous-dose
        // intervals keep working from growth visits too.
        if ((f.type === 'Growth Monitoring' || (f.type === 'Referral' && isInfantConcern(f.referralCategory))) && effectiveGrowthVaccines.length > 0) {
          const names = effectiveGrowthVaccines
            .map(v => String(typeof v === 'string' ? v : v.name || '').trim())
            .filter(Boolean);
          for (const nm of names) {
            const s = medicineSchedules.find(m => String(m.id) === String(resolveMedicineId(nm, 'vaccine')));
            if (!s || normCat(s) !== 'vaccine') {
              partialSave = true
              dialog.error(`Medical record saved, but vaccine "${nm}" is not valid — it was not recorded.`, 'Vaccine not recorded');
              continue;
            }
            try {
              await medicineApi.recordMedicine(id, {
                medicine_master_id: s.id,
                medicine_name: s?.medicine_name || nm,
                category: 'vaccine',
                dose_number: nextDoseNumber(s),
                total_doses: s?.total_doses || 1,
                date_administered: recordDate,
                facility,
                batch_number: f.batch_number,
                administration_site: f.administration_site,
                administered_by: f.growthVaccinator || f.administered_by,
                remarks: '',
              })
            } catch (medErr) {
              console.error('Failed to record growth-visit vaccination:', medErr)
              partialSave = true
              dialog.error(`Medical record saved, but the "${nm}" vaccination failed to save.` + (medErr.response?.data?.message ? `\nReason: ${medErr.response.data.message}` : '\nPlease record it from the Vaccination tab.'), 'Vaccine not recorded')
            }
          }
          // Refresh schedules so the new doses (and cycle counters) show
          // immediately in the Vaccination Record modal and pickers.
          await fetchMedicinesOnly()
        }
        // Growth parent names are single-source-of-truth on the resident
        // profile: a newly entered Mother's/Father's Name updates Personal
        // Information so it stays in sync with the latest growth record.
        if (f.type === 'Growth Monitoring' || (f.type === 'Referral' && isInfantConcern(f.referralCategory))) {
          const newMother = String(f.motherName || '').trim()
          const newFather = String(f.fatherName || '').trim()
          const curMother = String(resident?.motherName || '').trim()
          const curFather = String(resident?.fatherName || '').trim()
          const profilePatch = {}
          if (newMother && newMother !== curMother) profilePatch.motherName = newMother
          if (newFather && newFather !== curFather) profilePatch.fatherName = newFather
          if (Object.keys(profilePatch).length > 0) {
            try {
              await residentApi.update(id, profilePatch)
            } catch (e) {
              console.error('Failed to sync parent names to resident profile:', e)
            }
          }
        }
        // Pregnancy status drives the pregnant focus group: Active or
        // High-Risk tags the resident, Delivered or Closed removes it.
        // Postpartum Checkups are always Delivered (status hidden).
        if (f.type === 'Prenatal Checkup' || f.type === 'Postpartum Checkup') {
          const groups = resident?.focusGroups || []
          const effectiveStatus = effectivePregnancyStatus
          if (effectiveStatus === 'Active' || effectiveStatus === 'High-Risk') {
            if (!groups.includes('pregnant')) {
              try {
                await residentApi.update(id, { focusGroups: [...groups, 'pregnant'] })
              } catch (e) {
                console.error('Failed to auto-assign pregnant focus group:', e)
              }
            }
          } else if (effectiveStatus === 'Delivered' || effectiveStatus === 'Closed') {
            if (groups.includes('pregnant')) {
              try {
                await residentApi.update(id, { focusGroups: groups.filter(g => g !== 'pregnant') })
              } catch (e) {
                console.error('Failed to remove pregnant focus group:', e)
              }
            }
          }
        }
      }
      setShowMedicalModal(false)
      await refreshResident()
      // Complete-flow: mark the linked individual schedule as Completed,
      // but only after the medical record was saved successfully. The
      // record's location is written back too, so Schedule Details and the
      // medical record stay in sync (facility fields for referrals,
      // Service Location otherwise).
      if (completeSchedule?.scheduleId) {
        try {
          const updatePayload = { status: 'Completed' }
          if (f.type === 'Referral') {
            updatePayload.referralDestinationType = f.facilityType || ''
            updatePayload.referralFacilityName = f.facilityName || ''
            updatePayload.referralFacilityAddress = f.facilityLocation || ''
          } else {
            const finalLoc = f.serviceLocation === 'Other' && f.serviceLocationOther.trim()
              ? f.serviceLocationOther.trim()
              : f.serviceLocation
            const backMap = { 'Home': 'Home Visit' }
            updatePayload.checkupCategory = backMap[finalLoc] || finalLoc || ''
          }
          await scheduleApi.update(completeSchedule.scheduleId, updatePayload)
          onScheduleCompleted?.(completeSchedule.scheduleId)
        } catch (err) {
          console.error('Failed to complete schedule:', err)
          partialSave = true
          dialog.error('Medical record saved, but the schedule could not be marked as completed. Please complete it from the Schedules tab.', 'Schedule not updated')
          // The medical-record bridge is finished once the record is saved;
          // close it even if the schedule status update needs a manual retry.
          onClose?.()
        }
      }
      if (!partialSave) {
        dialog.toast(
          isMedType(f.type) ? 'Medicine record saved successfully.' : 'Medical record saved successfully.',
          'success'
        )
      }
    } catch (e) {
      const backendErrors = e.response?.data?.errors
      if (backendErrors && typeof backendErrors === 'object' && Object.keys(backendErrors).length > 0) {
        const nextErrors = Object.fromEntries(
          Object.entries(backendErrors)
            .filter(([, message]) => Boolean(message))
            .map(([field, message]) => [field, String(message)])
        )
        setMedicalErrors(nextErrors)
        focusFirstError(nextErrors, form)
      } else {
        dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
      }
    } finally {
      setSaving(false)
    }
  }

  const openMedicalModal = (overrides = {}) => {
    // Stable pregnancy details carry over from the latest prenatal record
    // so the BHW only encodes what's new each visit. Per-visit measurements
    // (MUAC, fundal height, FHR, symptoms…) always start blank.
    // A Delivered/Closed latest status means a new pregnancy — background
    // fields reset instead of carrying over (the outcome itself still does,
    // so corrections edit the latest values).
    const prenatalPrefill = (() => {
      const histories = (resident?.medicalHistory || []).filter(
        h => (h.type === 'Prenatal Checkup' || h.type === 'Postpartum Checkup') && (h.prenatal || h.postpartum)
      )
      if (!histories.length) return {}
      const nonEmpty = v => v !== null && v !== undefined && String(v).trim() !== ''
      const latestStatus = histories.map(h => h.prenatal?.pregnancyStatus).find(nonEmpty)
      const closed = ['delivered', 'closed'].includes(String(latestStatus || '').trim().toLowerCase())
      const pickLatest = fn => {
        for (const h of histories) {
          const v = fn(h)
          if (nonEmpty(v)) return v
        }
        return ''
      }
      const toDate = v => (v ? String(v).slice(0, 10) : '')
      const background = closed ? {} : {
        lmp: toDate(pickLatest(h => h.prenatal?.lmp)),
        edd: toDate(pickLatest(h => h.prenatal?.edd)),
        gravida: pickLatest(h => h.prenatal?.gravida),
        para: pickLatest(h => h.prenatal?.para),
        pregnancyStatus: pickLatest(h => h.prenatal?.pregnancyStatus),
        tdStatus: pickLatest(h => h.prenatal?.tdStatus),
      }
      // Postpartum outcome events carry over for corrections; per-visit
      // exam findings (vitals, lochia, feeding, danger signs…) start blank.
      const pp = (fn) => pickLatest(h => h.postpartum?.[fn])
      const ppDate = (fn) => toDate(pp(fn))
      const maternalDeathDate = ppDate('maternalDeathDate')
      const stillbirthRegDate = ppDate('stillbirthRegDate')
      const neonatalDeathDate = ppDate('neonatalDeathDate')
      return {
        ...background,
        birthOutcome: pp('birthOutcome'),
        birthDate: ppDate('birthDate'),
        deliveryPlace: pp('deliveryPlace'),
        birthAttendant: pp('birthAttendant'),
        birthAttendantName: pp('birthAttendantName'),
        deliveryMode: pp('deliveryMode'),
        babyName: pp('babyName'),
        babyGender: pp('babyGender'),
        babyWeight: pp('babyWeight'),
        maternalDeathApplicable: maternalDeathDate !== '',
        maternalDeathDate,
        stillbirthApplicable: stillbirthRegDate !== '',
        stillbirthRegDate,
        neonatalDeathApplicable: neonatalDeathDate !== '',
        neonatalDeathDate,
        spouseName: pp('spouseName'),
      }
    })()
    // Growth basic information is recorded once — single source of truth
    // is the resident profile (Personal Information from Add New Resident),
    // falling back to the latest Growth Monitoring record (parsed from its
    // notes lines) for residents registered before the profile fields existed.
    const growthPrefill = (() => {
      const profileMother = resident?.motherName || ''
      const profileFather = resident?.fatherName || ''
      const histories = (resident?.medicalHistory || []).filter(
        h => h.type === 'Growth Monitoring'
      )
      const pickNote = (label) => {
        for (const h of histories) {
          const m = String(h.notes || '').match(new RegExp('^' + label + ':\\s*(.+)$', 'im'))
          if (m && m[1].trim()) return m[1].trim()
        }
        return ''
      }
      return {
        placeOfBirth: pickNote('Place of Birth'),
        motherName: profileMother || pickNote("Mother's Name"),
        fatherName: profileFather || pickNote("Father's Name"),
      }
    })()
    const pc = (resident?.chronicConditions || []).map(c =>
      typeof c === 'string'
        ? (() => {
            try {
              const p = JSON.parse(c)
              return { name: p.name || c, severity: p.severity || 'Mild' }
            } catch {
              return { name: c, severity: 'Mild' }
            }
          })()
        : { name: c.name || 'Unknown', severity: c.severity || 'Mild' }
    )
    const pm = (resident?.currentMedications || []).map(m =>
      typeof m === 'string'
        ? (() => {
            try {
              const p = JSON.parse(m)
              return {
                name: p.name || m,
                dosage: p.dosage || '',
                frequency: p.frequency || ''
              }
            } catch {
              return { name: m, dosage: '', frequency: '' }
            }
          })()
        : {
            name: m.name || m,
            dosage: m.dosage || '',
            frequency: m.frequency || ''
          }
    )
    setMedicalForm({
      ...getInitialMedicalForm(),
      ...prenatalPrefill,
      ...growthPrefill,
      administered_by: '',
      newConditions: pc,
      newMedications: pm,
      newAllergies: {
        drugs: [...(resident?.allergies?.drugs || [])],
        food: [...(resident?.allergies?.food || [])],
        environmental: [...(resident?.allergies?.environmental || [])]
      },
      ...overrides
    })
    setTempCondition({ name: '', severity: 'Mild' })
    setTempMedication({ name: '', dosage: '', frequency: '' })
    setTempAllergy({ type: 'drugs', allergen: '' })
    setTempVaccine({ name: '' })
    setMedicalErrors({})
    setShowMedicalModal(true)
  }

  // Complete-flow (from an individual Schedule): prefill overrides mapping
  // Schedule Details info (incl. Service Location) into Add Medical Record.
  const buildCompletePrefillOverrides = () => {
    if (!completeSchedule) return {}
    const legacyTypeMap = { 'Vitamins': 'Vitamin Supplementation', 'LGU Referral': 'Checkup', 'General Checkup': 'Checkup' }
    const rawType = legacyTypeMap[completeSchedule.type] || completeSchedule.type || 'Checkup'
    const type = getAllowedRecordTypes().includes(rawType) ? rawType : 'Checkup'
    const locMap = { 'Home Visit': 'Home' }
    // Pass the schedule's Service Location through exactly as-is (custom
    // typed values included) so it stays in sync with Schedule Details.
    const loc = locMap[completeSchedule.serviceLocation] || completeSchedule.serviceLocation || 'Health Center'
    return {
      type,
      encounterDate: completeSchedule.encounterDate || todayStr(),
      serviceLocation: loc,
      reason: completeSchedule.reason || '',
      notes: completeSchedule.notes || '',
      administered_by: completeSchedule.administeredBy || '',
      // Referral category is automatic per resident (field hidden).
      referralCategory: type === 'Referral' ? getAutoReferralCategory() : (completeSchedule.referralCategory || 'General Concern'),
      facilityType: completeSchedule.facilityType || '',
      facilityName: completeSchedule.facilityName || '',
      facilityLocation: completeSchedule.facilityLocation || ''
    }
  }

  // Auto-open Add Medical Record once the resident profile is loaded,
  // prefilled with the information available in Schedule Details. Manual
  // "Add Record" clicks below reuse the same prefill while in this flow.
  const completeConsumedRef = useRef(false)
  useEffect(() => {
    if (!completeSchedule || completeConsumedRef.current) return
    if (loading || !resident) return
    if (String(completeSchedule.residentId) !== String(id)) return
    completeConsumedRef.current = true
    const prefill = buildCompletePrefillOverrides()
    openMedicalModal(prefill)
    if (isMedType(prefill.type) || prefill.type === 'Growth Monitoring' || prefill.type === 'Referral') fetchMedicinesOnly()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeSchedule, resident, loading, id])

  const addCondition = async () => {
    if (!newCondition.trim()) return
    const confirmed = await confirmCreate(
      'condition',
      `Please confirm that you want to add ${newCondition.trim()} to ${resident?.name || 'this resident'}'s chronic conditions.`
    )
    if (!confirmed) return
    setSavingConditions(true)
    try {
      await residentApi.update(id, {
        chronicConditions: [
          ...(resident.chronicConditions || []),
          { name: newCondition.trim(), severity: newConditionSeverity }
        ]
      })
      setNewCondition('')
      setNewConditionSeverity('Mild')
      await refreshResident()
    } catch (e) {
      dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
    } finally {
      setSavingConditions(false)
    }
  }
  const removeCondition = async i => {
    openConfirm('Remove this condition?', async () => {
      try {
          await residentApi.update(id, {
            chronicConditions: resident.chronicConditions.filter(
              (_, idx) => idx !== i
            )
          })
          await refreshResident()
      } catch (e) {
        dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
      }
    })
  }
  const addMedication = async () => {
    if (!newMedication.name.trim()) return
    const confirmed = await confirmCreate(
      'medication',
      `Please confirm that you want to add ${newMedication.name.trim()} to ${resident?.name || 'this resident'}'s current medications.`
    )
    if (!confirmed) return
    setSavingMedications(true)
    try {
      await residentApi.update(id, {
        currentMedications: [
          ...(resident.currentMedications || []),
          {
            name: newMedication.name,
            dosage: newMedication.dosage,
            frequency: newMedication.frequency
          }
        ]
      })
      setNewMedication({ name: '', dosage: '', frequency: '' })
      await refreshResident()
    } catch (e) {
      dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
    } finally {
      setSavingMedications(false)
    }
  }
  const removeMedication = async i => {
    openConfirm('Remove this medication?', async () => {
      try {
          await residentApi.update(id, {
            currentMedications: resident.currentMedications.filter(
              (_, idx) => idx !== i
            )
          })
          await refreshResident()
      } catch (e) {
        dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
      }
    })
  }
  const addAllergy = async () => {
    if (!allergyForm.allergen.trim()) return
    const confirmed = await confirmCreate(
      'allergy',
      `Please confirm that you want to add ${allergyForm.allergen.trim()} to ${resident?.name || 'this resident'}'s allergies.`
    )
    if (!confirmed) return
    setSavingAllergies(true)
    try {
      const ua = {
        drugs: [...(resident.allergies?.drugs || [])],
        food: [...(resident.allergies?.food || [])],
        environmental: [...(resident.allergies?.environmental || [])]
      }
      ua[allergyForm.type] = [
        ...ua[allergyForm.type],
        allergyForm.allergen.trim()
      ]
      await residentApi.update(id, { allergies: ua })
      setAllergyForm({ type: 'drugs', allergen: '' })
      await refreshResident()
    } catch (e) {
      dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
    } finally {
      setSavingAllergies(false)
    }
  }
  const removeAllergy = async (t, i) => {
    openConfirm('Remove this allergy?', async () => {
      try {
        const ua = {
          drugs: [...(resident.allergies?.drugs || [])],
          food: [...(resident.allergies?.food || [])],
          environmental: [...(resident.allergies?.environmental || [])]
        }
        ua[t] = ua[t].filter((_, idx) => idx !== i)
        await residentApi.update(id, { allergies: ua })
        await refreshResident()
      } catch (e) {
        dialog.error(e.response?.data?.message || 'Failed to save your changes.', 'Unable to save')
      }
    })
  }

  const openRecordDetail = record => {
    setSelectedRecord(record)
    setShowRecordModal(true)
  }

  // The Add Record modal serializes each encounter's structured fields as
  // "Label: value" lines inside notes. Split them back into tidy rows plus
  // trailing remarks so the detail modal reads cleanly. Free-text notes
  // (legacy records) fall through to remarks untouched.
  const parseRecordNotes = notes => {
    const fields = []
    const freeLines = []
    let remarks = ''
    let inRemarks = false
    const flushFree = () => {
      if (freeLines.length > 0) {
        const text = freeLines.join('\n').trim()
        if (text) remarks = remarks ? `${remarks}\n${text}` : text
        freeLines.length = 0
      }
    }
    String(notes || '')
      .split('\n')
      .forEach(raw => {
        if (inRemarks) {
          remarks += `\n${raw}`
          return
        }
        const line = raw.trim()
        if (!line) return
        const m = line.match(/^([^:]{1,60}):\s*(.+)$/)
        if (m) {
          const label = m[1].trim()
          const value = m[2].trim()
          if (/^remarks?$/i.test(label)) {
            flushFree()
            remarks = remarks ? `${remarks}\n${value}` : value
            inRemarks = true
          } else {
            fields.push({ label, value })
          }
        } else {
          if (fields.length) fields[fields.length - 1].value += `\n${raw}`
          else freeLines.push(line)
        }
      })
    flushFree()
    return { fields, remarks }
  }

  // Adaptive grid: columns follow the amount of content so a single item
  // spans full width while larger sets fill 2-3 columns (no blank cells).
  const detailGridClass = count => {
    return count <= 1 ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]'
  }

  const recordTheme = type => ({
    'Checkup': 'bg-blue-500/15 text-blue-200 border-blue-400/40',
    'Prenatal Checkup': 'bg-pink-500/15 text-pink-200 border-pink-400/40',
    'Postpartum Checkup': 'bg-rose-500/15 text-rose-200 border-rose-400/40',
    'Growth Monitoring': 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40',
    'Senior Checkup': 'bg-violet-500/15 text-violet-200 border-violet-400/40',
    'Referral': 'bg-indigo-500/15 text-indigo-200 border-indigo-400/40',
    'Vaccination': 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
    'Deworming': 'bg-yellow-500/15 text-yellow-200 border-yellow-400/40',
    'Vitamin Supplementation': 'bg-orange-500/15 text-orange-200 border-orange-400/40',
  }[type] || 'bg-blue-500/15 text-blue-200 border-blue-400/40')

  // Border-only accent for the history list cards (card background stays
  // neutral; the type badge carries the full type color).
  const recordBorder = type => ({
    'Checkup': 'border-blue-400/40',
    'Prenatal Checkup': 'border-pink-400/40',
    'Postpartum Checkup': 'border-rose-400/40',
    'Growth Monitoring': 'border-cyan-400/40',
    'Senior Checkup': 'border-violet-400/40',
    'Referral': 'border-indigo-400/40',
    'Vaccination': 'border-emerald-400/40',
    'Deworming': 'border-yellow-400/40',
    'Vitamin Supplementation': 'border-orange-400/40',
  }[type] || 'border-blue-400/40')

  // Split medicine remarks ("Dose: x | Qty: y | free text") into structured
  // Dose / Qty plus leftover free-text remarks — shared by the history list
  // preview and the Record Details modal so both show the same information.
  const parseMedRemarks = notes => {
    const doseParts = []
    const remarkBits = []
    String(notes || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(part => {
        const m = part.match(/^([^:]{1,40}):\s*(.+)$/)
        if (!m) {
          remarkBits.push(part)
          return
        }
        const k = m[1].trim().toLowerCase()
        const v = m[2].trim()
        if (k === 'dose' || k === 'qty' || k === 'quantity' || k === 'quantity provided') {
          doseParts.push({ label: /^q/i.test(m[1].trim()) ? 'Quantity Provided' : 'Dose', value: v })
        } else {
          doseParts.push({ label: m[1].trim(), value: v })
        }
      })
    return { doseParts, remarks: remarkBits.join(' | ') }
  }

  // Lightweight field lookup on a checkup record's serialized notes — used
  // by the history list cards to preview the most relevant values per type.
  const previewFieldOf = (record, ...names) => {
    if (!record?.notes) return ''
    const { fields } = parseRecordNotes(record.notes)
    return (
      fields.find(f =>
        names.some(n => n.toLowerCase() === f.label.trim().toLowerCase())
      )?.value || ''
    )
  }

  const totalVaccinationPages = Math.max(1, Math.ceil(vaccinationData.length / vaccinationPerPage))
  const safeVaccinationPage = Math.min(Math.max(1, vaccinationPage), totalVaccinationPages)
  const paginatedVaccinationData = vaccinationData.slice(
    (safeVaccinationPage - 1) * vaccinationPerPage,
    safeVaccinationPage * vaccinationPerPage
  )

  const fetchVaccinationData = async () => {
    setVaccinationLoading(true)
    setVaccinationPage(1)
    setShowVaccinationModal(true)
    try {
      const recordsResponse = await medicineApi.getResidentMedicines(id)
      const records = recordsResponse.data?.success
        ? recordsResponse.data.data
        : {}
      const takenVaccines = records.vaccines || []

      const vaxData = takenVaccines.map(vaccine => {
        const taken = vaccine.takenDoses || []
        const usedIds = new Set()
        const rows = Array.from({ length: vaccine.total_doses }, (_, i) => {
          const rec = taken.find(d => d.doseNumber === i + 1)
          if (rec) usedIds.add(rec.id)
          return {
            doseNumber: i + 1,
            dateAdministered: rec?.dateAdministered || null,
            batchNumber: rec?.batchNumber || '',
            administrationSite: rec?.administrationSite || '',
            administeredBy: rec?.administeredBy || '',
            remarks: rec?.remarks || '',
            status: rec ? 'Taken' : 'Pending'
          }
        })
        // Repeat administrations from new cycles reuse dose numbers — append
        // them as extra rows so every recorded administration (including
        // growth-visit vaccinations) is visible in the record.
        for (const d of taken) {
          if (usedIds.has(d.id)) continue
          usedIds.add(d.id)
          rows.push({
            doseNumber: d.doseNumber,
            dateAdministered: d.dateAdministered || null,
            batchNumber: d.batchNumber || '',
            administrationSite: d.administrationSite || '',
            administeredBy: d.administeredBy || '',
            remarks: d.remarks || '',
            status: 'Taken'
          })
        }
        return {
          id: vaccine.id,
          name: vaccine.medicine_name,
          requiredDoses: vaccine.total_doses,
          completedDoses: vaccine.completedDoses || 0,
          doses: rows,
          status: vaccine.status || 'not_started',
          targetGroup: vaccine.target_group,
          description: vaccine.description,
          doseIntervals: vaccine.dose_intervals || []
        }
      })

      setVaccinationData(vaxData)
    } catch (error) {
      console.error('Error fetching vaccination data:', error)
    } finally {
      setVaccinationLoading(false)
    }
  }

  if (loading) return <SkeletonResidentDetail />
  if (!resident)
    return (
      <div className='text-center py-12'>
        <p className='text-white/65'>Resident not found</p>
        {loadError && <p className='text-xs text-white/50 mt-2'>{loadError}</p>}
      </div>
    )

  // Calculate age display
  const ageData = calculateDetailedAge(resident.dateOfBirth)
  const ageDisplay = ageData.display || `${resident.age || 0} years old`

  // Pagination for profile chip lists (pager auto-hides on a single page)
  const condItems = [...(resident.chronicConditions || [])].reverse()
  const totalCondPages = Math.max(1, Math.ceil(condItems.length / condPerPage))
  const safeCondPage = Math.min(Math.max(1, condPage), totalCondPages)
  const condPageStart = (safeCondPage - 1) * condPerPage
  const pagedConds = condItems.slice(condPageStart, condPageStart + condPerPage)
  const medItems = [...(resident.currentMedications || [])].reverse()
  const totalMedPages = Math.max(1, Math.ceil(medItems.length / medPerPage))
  const safeMedPage = Math.min(Math.max(1, medPage), totalMedPages)
  const medPageStart = (safeMedPage - 1) * medPerPage
  const pagedMeds = medItems.slice(medPageStart, medPageStart + medPerPage)
  const pagedAllergy = (t) => {
    const arr = [...(resident.allergies?.[t] || [])].reverse()
    const total = Math.max(1, Math.ceil(arr.length / allergyPerPage))
    const safe = Math.min(Math.max(1, allergyPage), total)
    const start = (safe - 1) * allergyPerPage
    return {
      items: arr.slice(start, start + allergyPerPage),
      totalPages: total,
      safePage: safe,
      start,
      total: arr.length
    }
  }

  // ---- Current Medical Profile: group-specific latest snapshots ----
  // Pulls the newest values from the resident's own saved history so the
  // profile varies by group: growth data for infants, pregnancy data for
  // pregnant residents, mobility status for seniors.
  const residentAgeNum = Number(resident?.age) || 0
  const profileGroups = resident?.focusGroups || []
  const showGrowthPanel = residentAgeNum < 5 || profileGroups.includes('infant')
  const showPregnancyPanel = profileGroups.includes('pregnant')
  const showSeniorPanel = residentAgeNum >= 60 || profileGroups.includes('senior')
  // Latest by encounter date (not creation order), so backdated entries
  // never outrank a newer visit.
  const latestRecordOf = type => {
    const timeOf = d => {
      const x = new Date(d)
      return isNaN(x) ? 0 : x.getTime()
    }
    return (
      [...(resident?.medicalHistory || [])]
        .filter(r => r.type === type)
        .sort((a, b) => timeOf(b.date) - timeOf(a.date))[0] || null
    )
  }
  const latestGrowth = showGrowthPanel ? latestRecordOf('Growth Monitoring') : null
  const latestPrenatal = showPregnancyPanel ? latestRecordOf('Prenatal Checkup') : null
  const latestSenior = showSeniorPanel ? latestRecordOf('Senior Checkup') : null
  const pickHistoryField = (record, ...names) => {
    if (!record) return ''
    const { fields } = parseRecordNotes(record.notes)
    return (
      fields.find(f =>
        names.some(n => n.toLowerCase() === f.label.trim().toLowerCase())
      )?.value || ''
    )
  }
  const fmtHistoryDate = v => {
    if (!v) return ''
    const d = new Date(v)
    return isNaN(d) ? v : formatDate(v)
  }
  const growthVitalSigns = latestGrowth?.vitalSigns || {}
  const growthRows = latestGrowth
    ? [
        { label: 'Place of Birth', value: pickHistoryField(latestGrowth, 'Place of Birth') },
        {
          label: 'Length / Height',
          value:
            pickHistoryField(latestGrowth, 'Length / Height') ||
            (growthVitalSigns.height ? `${growthVitalSigns.height} cm` : '')
        },
        { label: 'Head Circumference', value: pickHistoryField(latestGrowth, 'Head circumference') },
        { label: 'Feeding Status', value: pickHistoryField(latestGrowth, 'Feeding status') },
        { label: 'Growth Status', value: pickHistoryField(latestGrowth, 'Growth status') },
        { label: 'Nutritional Status', value: pickHistoryField(latestGrowth, 'Nutritional status') },
      ].filter(r => r.value)
    : []
  const pregRecordRows = latestPrenatal
    ? [
        { label: 'Last Menstrual Period', value: fmtHistoryDate(pickHistoryField(latestPrenatal, 'LMP')) },
        { label: 'Expected Date of Delivery', value: fmtHistoryDate(pickHistoryField(latestPrenatal, 'EDD')) },
        { label: 'Gravida', value: pickHistoryField(latestPrenatal, 'Gravida') },
        { label: 'Para', value: pickHistoryField(latestPrenatal, 'Para') },
        { label: 'Pregnancy Status', value: pickHistoryField(latestPrenatal, 'Pregnancy status') },
      ].filter(r => r.value)
    : []
  const pregVisitRows = latestPrenatal
    ? [
        { label: 'Gestational Age', value: pickHistoryField(latestPrenatal, 'Gestational age') },
        { label: 'Fundal Height', value: pickHistoryField(latestPrenatal, 'Fundal height') },
        { label: 'Fetal Heart Rate', value: pickHistoryField(latestPrenatal, 'Fetal heart rate') },
        { label: 'Fetal Movement', value: pickHistoryField(latestPrenatal, 'Fetal movement') },
      ].filter(r => r.value)
    : []
  const seniorMobility = latestSenior
    ? pickHistoryField(latestSenior, 'Mobility / Functional status')
    : ''

  return (
    <div className='space-y-4 animate-fade-in'>
      {/* Header block - tight spacing */}
      <div className='space-y-1.5'>
      {/* Header - name row with actions */}
      <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
        <h3 className='text-2xl sm:text-3xl font-bold text-white break-words leading-tight min-w-0'>
          {resident.name}
        </h3>
        <div className='resident-detail-actions hidden gap-2 shrink-0 self-end sm:flex sm:self-auto'>
          <GlassButton variant='solid-success' icon={Calendar} title='Schedule resident' onClick={() => {
              if (embedded) onClose?.()
              navigateWithReturn(navigate, location, isBHWWorker ? '/my-schedules' : '/schedules', {
                addScheduleForResident: {
                  id,
                  name: resident.name,
                  age: resident.age,
                  gender: resident.gender,
                  purok: resident.purok,
                  contactPerson: resident.contactPerson,
                  contactNumber: resident.contactNumber,
                  contactPersonNumber: resident.contactPersonNumber
                },
                // Restore this resident detail when closing/saving there.
                returnState: { viewResidentId: id }
              })
            }}
          />
          <GlassButton variant='solid-primary' icon={Edit} title='Edit resident' onClick={openEditModal} />
          <GlassButton variant='solid-danger' icon={Trash2} title='Delete resident' onClick={handleDelete} />
        </div>
      </div>

      {/* Last checkup under name */}
      {resident.lastCheckup && (
        <p className='text-sm sm:text-xs text-white/65 mb-2 pl-1 sm:pl-0'>
          Last Checkup: {formatDate(resident.lastCheckup)}
        </p>
      )}

      {(resident.riskLevel && resident.riskScore != null) || resident.focusGroups?.length > 0 ? (
        <div className='flex flex-col gap-0.5 sm:gap-1.5'>
          <div className='flex items-center justify-between gap-1.5'>
          <div className='resident-risk-summary flex flex-wrap items-center gap-1.5 min-w-0'>
          {resident.riskLevel && resident.riskScore != null && (
            <>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getRiskColor(resident.riskLevel)}`}>
                {resident.riskLevel?.replace(' Risk', '').replace(' Health Risk', '') || 'N/A'}
              </span>
              <button
                onClick={() => setShowRiskModal(true)}
                className='text-xs text-blue-300 hover:text-blue-200 transition-colors flex items-center gap-1'
              >
                <Eye className='w-3 h-3' />
                View
              </button>
            </>
          )}
          </div>
          <div className='resident-detail-actions flex gap-2 shrink-0 sm:hidden'>
            <GlassButton variant='solid-success' icon={Calendar} title='Schedule resident' aria-label='Schedule resident' onClick={() => {
              if (embedded) onClose?.()
              navigateWithReturn(navigate, location, isBHWWorker ? '/my-schedules' : '/schedules', {
                addScheduleForResident: {
                  id,
                  name: resident.name,
                  age: resident.age,
                  gender: resident.gender,
                  purok: resident.purok,
                  contactPerson: resident.contactPerson,
                  contactNumber: resident.contactNumber,
                  contactPersonNumber: resident.contactPersonNumber
                },
                returnState: { viewResidentId: id }
              })
            }} />
            <GlassButton variant='solid-primary' icon={Edit} title='Edit resident' aria-label='Edit resident' onClick={openEditModal} />
            <GlassButton variant='solid-danger' icon={Trash2} title='Delete resident' aria-label='Delete resident' onClick={handleDelete} />
          </div>
          </div>
          {resident.focusGroups?.length > 0 && (
            <div className='resident-focus-summary mt-2 sm:mt-0 flex flex-wrap items-center gap-1.5'>
              {resident.focusGroups.map(g => (
                <span
                  key={g}
                  className='px-2 py-0.5 bg-white/[0.07] text-blue-200 border border-white/15 rounded-full text-xs font-medium'
                >
                  {g === 'pregnant'
                    ? 'Pregnant'
                    : g === 'infant'
                    ? 'Infant (0-59 months)'
                    : g === 'senior'
                    ? 'Senior (60+)'
                    : g === 'withCondition'
                    ? 'With Condition'
                    : g === 'pwd'
                    ? 'PWD'
                    : g}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
      </div>

      <hr className='border-white/10' />

      {/* Personal Information - consistent label/value grid */}
      <div>
        <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200 mb-1'>Personal Information</label>
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
            {[
              { label: 'Age', value: ageDisplay },
              { label: 'Gender', value: resident.gender },
              { label: 'Status', value: resident.civilStatus },
              { label: 'Contact', value: resident.contactNumber },
              { label: 'Purok', value: resident.purok },
              { label: 'Birthday', value: resident.dateOfBirth ? formatDate(resident.dateOfBirth) : null },
              { label: "Mother's Name", value: resident.motherName || pickHistoryField(latestGrowth, "Mother's Name") || null },
              { label: "Father's Name", value: resident.fatherName || pickHistoryField(latestGrowth, "Father's Name") || null },
              { label: 'Disability', value: resident.disabilityType }
            ].filter(f => f.value).map(f => (
              <div key={f.label}>
                <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>{f.label}</label>
                <p className='text-sm text-white/85'>{f.value}</p>
              </div>
            ))}
          </div>

        {(resident.contactPerson || resident.contactPersonNumber || resident.contactPersonAddress) && (
          <div className='mt-4'>
            <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200 mb-1'>Emergency Contact</label>
            <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
            {resident.contactPerson && (
              <div>
                <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Contact Person</label>
                <p className='text-sm text-white/85'>{resident.contactPerson}</p>
              </div>
            )}
            {resident.contactPersonNumber && (
              <div>
                <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Contact Person Number</label>
                <p className='text-sm text-white/85'>{resident.contactPersonNumber}</p>
              </div>
            )}
            {resident.contactPersonAddress && (
              <div className='col-span-2 sm:col-span-1'>
                <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Contact Person Address</label>
                <p className='text-sm text-white/85 break-words'>{resident.contactPersonAddress}</p>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      <hr className='border-white/10' />
      <hr className='border-white/10' />

      {/* Medical Profile - shown together, no tabs */}
      <div>
        <div className='flex flex-wrap items-center justify-between gap-2 mb-1'>
          <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Current Medical Profile</label>
          <button
            onClick={() => openMedicalModal(completeSchedule ? buildCompletePrefillOverrides() : undefined)}
            className='px-3 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-lg transition-colors flex items-center gap-1.5 font-medium'
          >
            <Plus className='w-3.5 h-3.5' />
            <span className='sm:hidden'>Record</span>
            <span className='hidden sm:inline'>Add Record</span>
          </button>
        </div>

        <div className='pt-1 pb-4'>
          <h3 className='text-sm font-semibold text-blue-300 mb-3 uppercase tracking-wider'>
            Latest Vital Signs
          </h3>
          {resident.vitalSigns &&
          Object.values(resident.vitalSigns).some(v => v) ? (
            (() => {
              const vs = resident.vitalSigns
              const items = [
                vs.bloodPressure && { label: 'Blood Pressure', value: vs.bloodPressure },
                vs.heartRate && { label: 'Heart Rate', value: `${vs.heartRate} bpm` },
                vs.bloodSugar && { label: 'Blood Sugar', value: `${vs.bloodSugar} mg/dL` },
                vs.bmi && { label: 'BMI', value: vs.bmi },
                vs.temperature && { label: 'Temperature', value: `${vs.temperature}°C` },
                vs.weight && { label: 'Weight', value: `${vs.weight} kg` },
                vs.height && { label: 'Height', value: `${vs.height} cm` },
              ].filter(Boolean)
              const hasAnthropometric = ['Height', 'Weight', 'BMI'].every(label =>
                items.some(item => item.label === label)
              )
              // Columns follow the item count (capped at 7) so no blank
              // columns appear when fewer vitals are recorded.
              const n = Math.min(items.length, 7)
              const colCls =
                hasAnthropometric && n === 5
                  ? 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-5'
                  : hasAnthropometric && n === 6
                  ? 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-6'
                  : hasAnthropometric && n >= 7
                  ? 'grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7'
                  : n <= 2
                  ? 'grid-cols-2'
                  : n === 3
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : n === 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : n === 5
                  ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                  : n === 6
                  ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7'
              return (
                <div className={`grid ${colCls} gap-4`}>
                  {items.map(item => (
                    <div
                      key={item.label}
                      className={hasAnthropometric
                        ? `${item.label === 'Height' ? 'order-1' : item.label === 'Weight' ? 'order-2' : item.label === 'BMI' ? 'order-3' : 'order-4'} sm:order-none`
                        : ''}
                    >
                      <p className='text-[11px] uppercase tracking-wide text-white/50 mb-1'>{item.label}</p>
                      <p className='text-sm text-white'>{item.value}</p>
                    </div>
                  ))}
                </div>
              )
            })()
          ) : (
            <p className='text-white/65 text-sm'>No vital signs recorded yet</p>
          )}
        </div>

        {showGrowthPanel && (
          <div className='border-t border-white/10 pt-4 pb-4'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
                Growth Measurements
              </h3>
            </div>
            {growthRows.length > 0 ? (
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
                {growthRows.map(row => (
                  <div key={row.label}>
                    <p className='text-[11px] uppercase tracking-wide text-white/50 mb-1'>{row.label}</p>
                    <p className='text-sm text-white'>{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-white/65 text-sm'>No growth measurements recorded yet</p>
            )}
          </div>
        )}

        {showPregnancyPanel && (
          <div className='border-t border-white/10 pt-4 pb-4'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
                Pregnancy Record
              </h3>
              {latestPrenatal?.date && (
                <span className='text-xs text-white/50'>
                  Latest visit: {formatDate(latestPrenatal.date)}
                </span>
              )}
            </div>
            {(pregRecordRows.length > 0 || pregVisitRows.length > 0) ? (
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
                {[...pregRecordRows, ...pregVisitRows].map(row => (
                  <div key={row.label}>
                    <p className='text-[11px] uppercase tracking-wide text-white/50 mb-1'>{row.label}</p>
                    <p className='text-sm text-white'>{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-white/65 text-sm'>No pregnancy record yet</p>
            )}
          </div>
        )}

        {showSeniorPanel && (
          <div className='border-t border-white/10 pt-4 pb-4'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
                Mobility / Functional Status
              </h3>
              {latestSenior?.date && (
                <span className='text-xs text-white/50'>
                  Latest: {formatDate(latestSenior.date)}
                </span>
              )}
            </div>
            {seniorMobility ? (
              <p className='text-sm text-white'>{seniorMobility}</p>
            ) : (
              <p className='text-white/65 text-sm'>No functional assessment recorded yet</p>
            )}
          </div>
        )}

        <div className='border-t border-white/10 pt-4 pb-4'>
          <div className='flex items-center justify-between mb-3'>
            <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
              Chronic Conditions
            </h3>
            <button
              onClick={() => setEditingConditions(!editingConditions)}
              className='text-xs text-blue-400 hover:text-blue-300'
            >
              {editingConditions ? 'Done' : 'Edit'}
            </button>
          </div>
          {resident.chronicConditions?.length > 0 ? (
            <>
              <div className='flex flex-wrap gap-2 mb-3'>
                {pagedConds.map((c, i) => {
                  let n, s
                  if (typeof c === 'string') {
                    try {
                      const p = JSON.parse(c)
                      n = p.name || c
                      s = p.severity || 'Mild'
                    } catch {
                      n = c
                      s = 'Mild'
                    }
                  } else {
                    n = c.name || 'Unknown'
                    s = c.severity || 'Mild'
                  }
                  const cols = {
                    Critical: 'bg-red-500/20 text-red-200 border-red-400/40',
                    Severe:
                      'bg-orange-500/20 text-orange-200 border-orange-400/40',
                    Moderate:
                      'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                    Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                  }
                  return (
                    <span
                      key={i}
                      className={`px-3 py-1.5 border rounded-full text-xs font-medium flex items-center gap-1 ${
                        cols[s] || cols['Mild']
                      }`}
                    >
                      {n}
                      <span className='text-[10px] opacity-70'>({s})</span>
                      {editingConditions && (
                        <button
                          onClick={() =>
                            removeCondition(
                              condItems.length - 1 - (condPageStart + i)
                            )
                          }
                          className='hover:text-red-400 ml-1'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
              <Pagination
                page={safeCondPage}
                totalPages={totalCondPages}
                onPageChange={setCondPage}
                total={condItems.length}
                perPage={condPerPage}
              />
              <p className='text-xs text-white/65'>
                {resident.chronicConditions.length} condition
                {resident.chronicConditions.length > 1 ? 's' : ''} recorded
                {resident.lastCheckup &&
                  ` · Last updated: ${formatDate(resident.lastCheckup)}`}
              </p>
            </>
          ) : (
            <p className='text-white/65 text-sm'>
              No chronic conditions recorded
            </p>
          )}
          {editingConditions && (
            <div className='flex gap-2 mt-3'>
              <div className='flex-1 h-[42px]'>
                <GlassInput
                  className='h-[42px]'
                  placeholder='Add new condition...'
                  value={newCondition}
                  onChange={e => setNewCondition(e.target.value)}
                  onKeyDown={e =>
                    e.key === 'Enter' && (e.preventDefault(), addCondition())
                  }
                />
              </div>
              <div className='w-28 h-[42px]'>
                <GlassSelect
                  inputClassName='!h-[42px]'
                  value={newConditionSeverity}
                  onChange={v => setNewConditionSeverity(v)}
                  options={[
                    { value: 'Mild', label: 'Mild' },
                    { value: 'Moderate', label: 'Moderate' },
                    { value: 'Severe', label: 'Severe' }
                  ]}
                />
              </div>
              <GlassButton
                type='button'
                variant='secondary'
                className='h-[42px]'
                onClick={addCondition}
                loading={savingConditions}
                disabled={!newCondition.trim()}
              >
                Add
              </GlassButton>
            </div>
          )}
        </div>

        <div className='border-t border-white/10 pt-4 pb-4'>
          <div className='flex items-center justify-between mb-3'>
            <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
              Current Medications
            </h3>
            <button
              onClick={() => setEditingMedications(!editingMedications)}
              className='text-xs text-blue-400 hover:text-blue-300'
            >
              {editingMedications ? 'Done' : 'Edit'}
            </button>
          </div>
          {resident.currentMedications?.length > 0 ? (
            <>
              <div className='flex flex-wrap gap-2 mb-3'>
                {pagedMeds.map((med, i) => {
                  const n = typeof med === 'string' ? med : med.name
                  const d = typeof med === 'string' ? '' : med.dosage || ''
                  const f = typeof med === 'string' ? '' : med.frequency || ''
                  return (
                    <div
                      key={i}
                      className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-xs font-medium flex items-center gap-1'
                    >
                      <span className='text-white'>{n}</span>
                      {(d || f) && (
                        <>
                          <span className='text-white/50'>|</span>
                          <span className='text-white/75 text-xs'>
                            {[d, f].filter(Boolean).join(' · ')}
                          </span>
                        </>
                      )}
                      {editingMedications && (
                        <button
                          onClick={() =>
                            removeMedication(
                              medItems.length - 1 - (medPageStart + i)
                            )
                          }
                          className='text-white/75 hover:text-red-400 ml-2'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <Pagination
                page={safeMedPage}
                totalPages={totalMedPages}
                onPageChange={setMedPage}
                total={medItems.length}
                perPage={medPerPage}
              />
              <p className='text-xs text-white/65'>
                {resident.currentMedications.length} medication
                {resident.currentMedications.length > 1 ? 's' : ''} recorded
                {resident.lastCheckup &&
                  ` · Last updated: ${formatDate(resident.lastCheckup)}`}
              </p>
            </>
          ) : (
            <p className='text-white/65 text-sm'>No medications recorded</p>
          )}
          {editingMedications && (
            <div className='mt-3'>
              <div className='flex gap-2 items-center'>
                <div className='flex-1 h-[42px]'>
                  <GlassInput
                    className='h-[42px]'
                    placeholder='Medication name'
                    value={newMedication.name}
                    onChange={e =>
                      setNewMedication(p => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className='flex-1 h-[42px]'>
                  <GlassInput
                    className='h-[42px]'
                    placeholder='Dosage (e.g., 500mg)'
                    value={newMedication.dosage}
                    onChange={e =>
                      setNewMedication(p => ({ ...p, dosage: e.target.value }))
                    }
                  />
                </div>
                <div className='flex-1 h-[42px]'>
                  <GlassInput
                    className='h-[42px]'
                    placeholder='Frequency (e.g., Twice daily)'
                    value={newMedication.frequency}
                    onChange={e =>
                      setNewMedication(p => ({
                        ...p,
                        frequency: e.target.value
                      }))
                    }
                  />
                </div>
                <button
                  type='button'
                  onClick={addMedication}
                  disabled={!newMedication.name.trim()}
                  className='glass-btn-secondary h-[42px] w-[42px] p-0 disabled:opacity-50 flex items-center justify-center flex-shrink-0'
                >
                  <Plus className='w-4 h-4' />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className='border-t border-white/10 pt-4'>
          <div className='flex items-center justify-between mb-3'>
            <h3 className='text-sm font-semibold text-blue-300 uppercase tracking-wider'>
              Allergies
            </h3>
            <button
              onClick={() => setEditingAllergies(!editingAllergies)}
              className='text-xs text-blue-400 hover:text-blue-300'
            >
              {editingAllergies ? 'Done' : 'Edit'}
            </button>
          </div>
          {resident.allergies?.drugs?.length > 0 ||
          resident.allergies?.food?.length > 0 ||
          resident.allergies?.environmental?.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {['drugs', 'food', 'environmental'].map(t => {
                if (!resident.allergies[t]?.length) return null
                const pg = pagedAllergy(t)
                return (
                  <div key={t}>
                    <h4 className='text-xs text-white/65 mb-2 capitalize'>
                      {t}
                    </h4>
                    <div className='flex flex-wrap gap-1'>
                      {pg.items.map((a, i) => (
                        <span
                          key={pg.start + i}
                          className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-xs font-medium flex items-center gap-1'
                        >
                          <span>{typeof a === 'string' ? a : a}</span>
                          {editingAllergies && (
                            <button
                              onClick={() =>
                                removeAllergy(
                                  t,
                                  pg.total - 1 - (pg.start + i)
                                )
                              }
                              className='hover:text-red-400'
                            >
                              <X className='w-3 h-3' />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    <Pagination
                      page={pg.safePage}
                      totalPages={pg.totalPages}
                      onPageChange={setAllergyPage}
                      total={pg.total}
                      perPage={allergyPerPage}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className='text-white/65 text-sm'>No allergies recorded</p>
          )}
          {editingAllergies && (
            <div className='flex gap-2 mt-3 items-center'>
              <GlassSelect
                value={allergyForm.type}
                allowCustom
                onChange={v =>
                  setAllergyForm(p => ({ ...p, type: v || 'drugs' }))
                }
                options={[
                  { value: 'drugs', label: 'Drug' },
                  { value: 'environmental', label: 'Environmental' },
                  { value: 'food', label: 'Food' },
                ]}
                className='w-32'
                inputClassName='!h-[42px]'
              />
              <div className='flex-1 h-[42px]'>
                <GlassInput
                  className='h-[42px]'
                  placeholder='Enter allergen (e.g., Penicillin)'
                  value={allergyForm.allergen}
                  onChange={e =>
                    setAllergyForm(p => ({ ...p, allergen: e.target.value }))
                  }
                  onKeyDown={e =>
                    e.key === 'Enter' && (e.preventDefault(), addAllergy())
                  }
                />
              </div>
              <GlassButton
                type='button'
                variant='secondary'
                className='h-[42px]'
                onClick={addAllergy}
                loading={savingAllergies}
                disabled={!allergyForm.allergen.trim()}
              >
                Add
              </GlassButton>
            </div>
          )}
        </div>
      </div>

      <hr className='border-white/10' />
      <hr className='border-white/10' />

      {/* Medical History - shown together, no tabs */}
      <div>
        <div className='mb-3'>
          <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Medical History</label>
        </div>
        <div className='medical-history-filters flex w-full flex-wrap items-center gap-1.5 mb-4'>
          <div className='[&_input]:!py-1.5 sm:[&_input]:!py-1.5 [&_input]:!text-xs sm:[&_input]:!text-xs [&_input]:!whitespace-nowrap'>
            <GlassSelect
              value={historyFilter}
              allowCustom
              paginate={false}
              onChange={v => {
                setHistoryFilter(v === '' ? 'all' : v)
                setHistoryPage(1)
              }}
              size='sm'
              autoWidth
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'Checkup', label: 'Checkup' },
                { value: 'Prenatal Checkup', label: 'Prenatal Checkup' },
                { value: 'Postpartum Checkup', label: 'Postpartum Checkup' },
                { value: 'Growth Monitoring', label: 'Growth Monitoring' },
                { value: 'Senior Checkup', label: 'Senior Checkup' },
                { value: 'Vaccination', label: 'Vaccination' },
                { value: 'Deworming', label: 'Deworming' },
                { value: 'Vitamin Supplementation', label: 'Vitamins' },
                { value: 'Referral', label: 'Referral' },
              ]}
            />
          </div>
          <div className='[&_input]:!py-1.5 sm:[&_input]:!py-1.5 [&_input]:!text-xs sm:[&_input]:!text-xs [&_input]:!whitespace-nowrap'>
            <GlassSelect
              value={historyMonth}
              allowCustom
              paginate={false}
              onChange={v => {
                setHistoryMonth(v === '' ? 'all' : v)
                setHistoryPage(1)
              }}
              size='sm'
              autoWidth
              options={[
                { value: 'all', label: 'All Months' },
                ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({ value: String(i), label: m })),
              ]}
            />
          </div>
          <div className='[&_input]:!py-1.5 sm:[&_input]:!py-1.5 [&_input]:!text-xs sm:[&_input]:!text-xs [&_input]:!whitespace-nowrap'>
            <GlassSelect
              value={historyYear}
              allowCustom
              paginate={false}
              onChange={v => {
                setHistoryYear(v === '' ? 'all' : v)
                setHistoryPage(1)
              }}
              size='sm'
              autoWidth
              options={[
                { value: 'all', label: 'All Years' },
                ...getAvailableYears().map(y => ({ value: String(y), label: String(y) })),
              ]}
            />
          </div>
        </div>
        {(() => {
          let all = []
          ;(resident.medicalHistory || []).forEach(r => {
            const rawType = r.type || 'Checkup'
            // Legacy records stored as 'General Checkup' read as Checkup
            const normType = rawType === 'General Checkup' || rawType === 'Checkup' ? 'Checkup' : rawType
            if (r.date)
              all.push({
                id: `ch-${r.id}`,
                prenatal: r.prenatal,
                postpartum: r.postpartum,
                type: normType,
                category: 'Checkup',
                date: r.date,
                createdAt: r.createdAt || r.date,
                facility: r.facility || r.location || '',
                vitalSigns: r.vitalSigns || null,
                diagnosis: r.diagnosis || '',
                treatment: r.treatment || '',
                conditions: r.chronicConditions || [],
                medications: r.currentMedications || [],
                allergies: r.allergies || {
                  drugs: [],
                  food: [],
                  environmental: []
                },
                notes: r.notes || '',
                administeredBy: r.administeredBy || ''
              })
          })
          ;(medicineStatus.vaccines || []).forEach(v => {
            ;(v.takenDoses || []).forEach(d => {
              all.push({
                id: `vax-${d.id}`,
                type: 'Vaccination',
                category: 'Vaccination',
                date: d.dateAdministered || '',
                createdAt: d.createdAt || d.dateAdministered || '',
                vaccineName: v.medicine_name || '',
                doseNumber: d.doseNumber || 1,
                totalDoses: v.total_doses || 1,
                completedDoses: v.completedDoses || 0,
                dosesLeft: v.dosesLeft || 0,
                batchNumber: d.batchNumber || '',
                administrationSite: d.administrationSite || '',
                notes: d.remarks || '',
                administeredBy: d.administeredBy || '',
                facility: d.facility || v.facility || ''
              })
            })
          })
          ;(medicineStatus.deworming || []).forEach(d => {
            ;(d.takenDoses || []).forEach(dose => {
              all.push({
                id: `dw-${dose.id}`,
                type: 'Deworming',
                category: 'Deworming',
                date: dose.dateAdministered || '',
                createdAt: dose.createdAt || dose.dateAdministered || '',
                medicineName: d.medicine_name || '',
                doseNumber: dose.doseNumber || 1,
                notes: dose.remarks || '',
                administeredBy: dose.administeredBy || '',
                facility: dose.facility || d.facility || '',
                batchNumber: dose.batchNumber || '',
                administrationSite: dose.administrationSite || ''
              })
            })
          })
          ;(medicineStatus.vitamins || []).forEach(v => {
            ;(v.takenDoses || []).forEach(dose => {
              all.push({
                id: `vit-${dose.id}`,
                type: 'Vitamin Supplementation',
                category: 'Vitamins',
                date: dose.dateAdministered || '',
                createdAt: dose.createdAt || dose.dateAdministered || '',
                medicineName: v.medicine_name || '',
                doseNumber: dose.doseNumber || 1,
                notes: dose.remarks || '',
                administeredBy: dose.administeredBy || '',
                facility: dose.facility || v.facility || '',
                batchNumber: dose.batchNumber || '',
                administrationSite: dose.administrationSite || ''
              })
            })
          })
          // Newest encounter date first, with creation time breaking ties.
          all.sort((a, b) => {
            const dateA = new Date(a.date).getTime()
            const dateB = new Date(b.date).getTime()
            const createdA = new Date(a.createdAt || a.date).getTime()
            const createdB = new Date(b.createdAt || b.date).getTime()
            const tA = isNaN(dateA) ? createdA : dateA
            const tB = isNaN(dateB) ? createdB : dateB
            if (isNaN(tA) && isNaN(tB)) return 0
            if (isNaN(tA)) return 1
            if (isNaN(tB)) return -1
            return tB - tA || (isNaN(createdA) ? 0 : isNaN(createdB) ? -1 : createdB - createdA)
          })
          if (historyFilter !== 'all')
            all = all.filter(r => {
              if (r.category === 'Checkup') return r.type === historyFilter
              if (historyFilter === 'Vitamin Supplementation') return r.category === 'Vitamins'
              return r.category === historyFilter || r.type === historyFilter
            })
          if (historyMonth !== 'all')
            all = all.filter(r => {
              const d = new Date(r.date)
              return !isNaN(d) && d.getMonth() === parseInt(historyMonth)
            })
          if (historyYear !== 'all')
            all = all.filter(r => {
              const d = new Date(r.date)
              return !isNaN(d) && d.getFullYear() === parseInt(historyYear)
            })
          const total = all.length
          const pages = Math.ceil(total / rowsPerPage)
          const start = (historyPage - 1) * rowsPerPage
          const paged = all.slice(start, start + rowsPerPage)

          if (total === 0)
            return (
              <div className='text-center py-8'>
                <p className='text-white/65 text-sm'>
                  {historyFilter !== 'all'
                    ? `No ${historyFilter.toLowerCase()} records found.`
                    : 'No medical records found.'}
                </p>
              </div>
            )

          return (
            <>
              <div className='flex items-center justify-between gap-2 mb-3'>
                <div className='pl-1 text-sm text-white/65'>
                  {total} record{total !== 1 ? 's' : ''} found
                  <span className='hidden sm:inline'> · Click to view details</span>
                </div>
                {historyFilter === 'Vaccination' && (
                  <button
                    onClick={fetchVaccinationData}
                    className='text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0'
                  >
                    View Vaccination Record →
                  </button>
                )}
              </div>
              <div className='space-y-3'>
                {paged.map(r => {
                  // Every record type gets its own designed preview: vital
                  // chips + the most relevant key values for that type.
                  const medInfo = (r.category === 'Deworming' || r.category === 'Vitamins' || r.category === 'Vaccination')
                    ? parseMedRemarks(r.notes)
                    : { doseParts: [], remarks: '' }
                  const medDose = medInfo.doseParts.find(p => p.label === 'Dose')?.value || ''
                  const medQty = medInfo.doseParts.find(p => p.label === 'Quantity Provided')?.value || ''
                  const vitalChips = []
                  if (r.category === 'Checkup' && r.vitalSigns) {
                    if (r.vitalSigns.bloodPressure) vitalChips.push(`BP: ${r.vitalSigns.bloodPressure}`)
                    if (r.vitalSigns.heartRate) vitalChips.push(`HR: ${r.vitalSigns.heartRate}`)
                    if (r.vitalSigns.temperature) vitalChips.push(`Temp: ${r.vitalSigns.temperature}°`)
                    if (r.vitalSigns.weight) vitalChips.push(`Weight: ${r.vitalSigns.weight}kg`)
                    if (r.vitalSigns.height) vitalChips.push(`Height: ${r.vitalSigns.height}cm`)
                    if (r.vitalSigns.bloodSugar) vitalChips.push(`FBS: ${r.vitalSigns.bloodSugar}mg/dL`)
                    if (r.vitalSigns.bmi) vitalChips.push(`BMI: ${r.vitalSigns.bmi}`)
                  }
                  // Key-value highlights per checkup type (parsed from notes).
                  const highlightRows = []
                  if (r.category === 'Checkup') {
                    if (r.type === 'Checkup' || r.type === 'Senior Checkup') {
                      const reason = previewFieldOf(r, 'Reason for checkup') || (r.treatment || '').split('|')[0]?.trim()
                      const mobility = previewFieldOf(r, 'Mobility / Functional status')
                      if (reason) highlightRows.push({ label: 'Reason', value: reason })
                      if (mobility) highlightRows.push({ label: 'Mobility', value: mobility })
                      if (r.diagnosis) highlightRows.push({ label: 'Assessment', value: r.diagnosis })
                    } else if (r.type === 'Prenatal Checkup') {
                      const ga = previewFieldOf(r, 'Gestational age')
                      const fhr = previewFieldOf(r, 'Fetal heart rate')
                      const fh = previewFieldOf(r, 'Fundal height')
                      const edd = previewFieldOf(r, 'EDD')
                      if (ga) highlightRows.push({ label: 'Gestational Age', value: ga })
                      if (fh) highlightRows.push({ label: 'Fundal Height', value: fh })
                      if (fhr) highlightRows.push({ label: 'Fetal Heart Rate', value: fhr })
                      if (edd) highlightRows.push({ label: 'EDD', value: edd })
                    } else if (r.type === 'Postpartum Checkup') {
                      const outcome = previewFieldOf(r, 'Birth outcome')
                      const birthDate = previewFieldOf(r, 'Birth date')
                      const baby = previewFieldOf(r, "Baby's name")
                      const feeding = previewFieldOf(r, "Baby's feeding status", 'Breastfeeding status')
                      if (outcome) highlightRows.push({ label: 'Birth Outcome', value: outcome })
                      if (birthDate) highlightRows.push({ label: 'Birth Date', value: birthDate })
                      if (baby) highlightRows.push({ label: "Baby's Name", value: baby })
                      if (feeding) highlightRows.push({ label: 'Feeding', value: feeding })
                    } else if (r.type === 'Growth Monitoring') {
                      const wt = r.vitalSigns?.weight ? `${r.vitalSigns.weight} kg` : previewFieldOf(r, 'Weight')
                      const ln = previewFieldOf(r, 'Length / Height')
                      const growth = previewFieldOf(r, 'Growth status')
                      const nutri = previewFieldOf(r, 'Nutritional status')
                      if (wt) highlightRows.push({ label: 'Weight', value: wt })
                      if (ln) highlightRows.push({ label: 'Length / Height', value: ln })
                      if (growth) highlightRows.push({ label: 'Growth', value: growth })
                      if (nutri) highlightRows.push({ label: 'Nutrition', value: nutri })
                    } else if (r.type === 'Referral') {
                      const cat = previewFieldOf(r, 'Referral category')
                      const checkupType = previewFieldOf(r, 'Referral checkup type')
                      const fac = previewFieldOf(r, 'Facility name')
                      const ftype = previewFieldOf(r, 'Facility type')
                      const reason = previewFieldOf(r, 'Reason for checkup')
                      const mobility = previewFieldOf(r, 'Mobility / Functional status')
                      if (cat) highlightRows.push({ label: 'Category', value: checkupType ? `${cat} · ${checkupType}` : cat })
                      else if (checkupType) highlightRows.push({ label: 'Category', value: checkupType })
                      if (fac) highlightRows.push({ label: 'Facility', value: `${fac}${ftype ? ` (${ftype})` : ''}` })
                      else if (ftype) highlightRows.push({ label: 'Facility Type', value: ftype })
                      if (reason) highlightRows.push({ label: 'Reason', value: reason })
                      if (mobility) highlightRows.push({ label: 'Mobility', value: mobility })
                    }
                  }
                  let displayContent = []

                  if (r.category === 'Deworming' || r.category === 'Vitamins') {
                    displayContent.push(
                      <div key='med' className='text-sm space-y-2'>
                        <div className='hidden sm:flex flex-wrap items-center gap-1.5'>
                          <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/85 font-medium'>Administration #{r.doseNumber}</span>
                          {medDose && (
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>Dose: {medDose}</span>
                          )}
                          {medQty && (
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>Qty: {medQty}</span>
                          )}
                          {r.administrationSite && (
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>Site: {r.administrationSite}</span>
                          )}
                        </div>
                        <div className='flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/65'>
                          {r.facility && <span>Facility: <span className='text-white/85'>{r.facility}</span></span>}
                          {r.administeredBy && <span>Administered by: <span className='text-white/85'>{r.administeredBy}</span></span>}
                        </div>
                        {medInfo.remarks && (
                          <p className='hidden sm:block text-xs text-white/60 truncate'>Remarks: {medInfo.remarks}</p>
                        )}
                      </div>
                    )
                  } else if (r.category === 'Vaccination') {
                    displayContent.push(
                      <div key='vaccination' className='text-sm space-y-2'>
                        <div className='hidden sm:flex flex-wrap items-center gap-1.5'>
                          <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/85 font-medium'>Dose {r.doseNumber} of {r.totalDoses}</span>
                          {r.dosesLeft > 0 ? (
                            <span className='px-2 py-0.5 bg-yellow-500/15 border border-yellow-400/30 rounded-full text-xs text-yellow-300'>
                              {r.dosesLeft} dose{r.dosesLeft > 1 ? 's' : ''} remaining
                            </span>
                          ) : (
                            <span className='px-2 py-0.5 bg-emerald-500/15 border border-emerald-400/30 rounded-full text-xs text-emerald-300'>✓ Complete</span>
                          )}
                          {r.administrationSite && (
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>Site: {r.administrationSite}</span>
                          )}
                          {r.batchNumber && (
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>Batch: {r.batchNumber}</span>
                          )}
                        </div>
                        <div className='flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/65'>
                          {r.facility && <span>Facility: <span className='text-white/85'>{r.facility}</span></span>}
                          {r.administeredBy && <span>Administered by: <span className='text-white/85'>{r.administeredBy}</span></span>}
                        </div>
                      </div>
                    )
                  } else if (r.category === 'Checkup') {
                    displayContent.push(
                      <div key='checkup' className='text-sm space-y-2'>
                        {highlightRows.length > 0 && (
                          <div className={`hidden sm:grid grid-cols-1 gap-x-4 gap-y-1 ${highlightRows.length >= 3 ? 'sm:grid-cols-2' : ''}`}>
                            {highlightRows.slice(0, 4).map(h => (
                              <p key={h.label} className='text-xs text-white/65 truncate'>
                                {h.label}: <span className='text-white/85'>{h.value}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {highlightRows.length === 0 && (r.diagnosis || r.treatment || r.notes) && (
                          <p className='hidden sm:block text-xs text-white/80 line-clamp-2 whitespace-pre-line'>
                            {r.diagnosis || r.treatment || r.notes}
                          </p>
                        )}
                        {vitalChips.length > 0 && (
                          <div className='hidden sm:flex flex-wrap gap-1.5'>
                            {vitalChips.slice(0, 6).map(c => (
                              <span key={c} className='px-2 py-0.5 bg-white/10 rounded-full text-xs text-white/80'>{c}</span>
                            ))}
                          </div>
                        )}
                        <div className='flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/65'>
                          {r.facility && <span>Facility: <span className='text-white/85'>{r.facility}</span></span>}
                          {r.administeredBy && <span>Health worker: <span className='text-white/85'>{r.administeredBy}</span></span>}
                          {(r.conditions?.length > 0 || r.medications?.length > 0) && (
                            <span className='hidden sm:inline'>
                              {r.conditions?.length > 0 && <span>{r.conditions.length} condition{r.conditions.length > 1 ? 's' : ''}</span>}
                              {r.conditions?.length > 0 && r.medications?.length > 0 && <span> · </span>}
                              {r.medications?.length > 0 && <span>{r.medications.length} medication{r.medications.length > 1 ? 's' : ''}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl p-4 border ${recordBorder(r.type)} bg-white/[0.03] transition-all duration-200 cursor-pointer hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300`}
                      role='button'
                      tabIndex={0}
                      aria-label={`View ${r.type} record details`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecordDetail(r) } }}
                      onClick={() => openRecordDetail(r)}
                    >
                      <div className='flex flex-row items-center justify-between gap-1'>
                        <div className='flex flex-wrap items-center gap-2 min-w-0'>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 border ${recordTheme(r.type)}`}
                          >
                            {r.type}
                          </span>
                          {r.vaccineName && (
                            <span className='hidden sm:inline text-white text-sm font-medium truncate'>
                              {r.vaccineName}
                            </span>
                          )}
                          {r.medicineName && (
                            <span className='hidden sm:inline text-white text-sm font-medium truncate'>
                              {r.medicineName}
                            </span>
                          )}
                        </div>
                        <div className='flex items-center gap-2 shrink-0'>
                          <span className='text-sm text-white/75'>
                            {r.date
                              ? new Date(r.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'No date'}
                          </span>
                        </div>
                      </div>
                      <div className='mt-0 pt-0 sm:mt-2 sm:pt-2 border-t-0 sm:border-t border-white/5'>{displayContent}</div>
                    </div>
                  )
                })}
              </div>
              <Pagination
                page={historyPage}
                totalPages={pages}
                onPageChange={setHistoryPage}
                total={all.length}
                perPage={rowsPerPage}
                className='mt-4'
                pageLabel
                hidePageIndicator
                hidePageIndicatorOnMobile
              />
            </>
          )
        })()}
      </div>

      {/* Record Detail Modal */}
      <Modal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        title={
          selectedRecord
            ? `${selectedRecord.type === 'Vitamin Supplementation' ? 'Vitamins' : selectedRecord.type} Record Details`
            : 'Record Details'
        }
        size='lg'
      >
        {selectedRecord && (() => {
          const rec = selectedRecord
          const displayType = rec.type === 'Vitamin Supplementation' ? 'Vitamins' : rec.type
          const isCheckup = rec.category === 'Checkup'
          // Plain Checkup records mirror the Add form 1:1 in their own
          // structured sections below; every other type keeps its layout.
          const isPlainCheckup = rec.type === 'Checkup'
          // Same treatment for plain Prenatal Checkup records.
          const isPrenatalCheckup = rec.type === 'Prenatal Checkup'
          // Same treatment for plain Postpartum Checkup records.
          const isPostpartumCheckup = rec.type === 'Postpartum Checkup'
          // Same treatment for Growth Monitoring records.
          const isGrowthMonitoring = rec.type === 'Growth Monitoring'
          // Same treatment for Senior Checkup records.
          const isSeniorCheckup = rec.type === 'Senior Checkup'
          // Vaccination records hide the header vaccine name (it is shown
          // in Vaccination Details) and the Visit Information date (it is
          // shown in the header row).
          const isVaccinationRecord = rec.category === 'Vaccination'
          // Deworming records hide the header medicine name (it is shown
          // in Deworming Details) and the Visit Information date.
          const isDewormingRecord = rec.category === 'Deworming'
          // Vitamins records hide the header vitamin name (it is shown
          // in Vitamin Details) and the Visit Information date.
          const isVitaminsRecord = rec.category === 'Vitamins'
          const parsed = isCheckup
            ? parseRecordNotes(rec.notes)
            : { fields: [], remarks: rec.notes || '' }
          const pick = (...names) =>
            parsed.fields.find(f =>
              names.some(n => n.toLowerCase() === f.label.trim().toLowerCase())
            )?.value || ''
          // Preserve every saved field, including note-only values when a
          // dedicated vital/diagnosis column is missing in older records.
          const detailFields = [...parsed.fields]
          const aliases = {
            lmp: 'LMP', edd: 'EDD', pregnancyStatus: 'Pregnancy status',
            motherBP: "Mother's BP", motherTemp: "Mother's temperature",
            babyName: "Baby's name", babyGender: "Baby's gender", babyWeight: "Baby's weight",
            babyTemp: "Baby's temperature", babyFeedingStatus: "Baby's feeding status",
            deliveryMode: 'Mode of delivery', checkupDate: 'Check-up date',
            spouseName: "Spouse's name", muac: 'MUAC', tdStatus: 'TD status',
            isPrivateVisit: 'Private visit', stillbirthRegDate: 'Stillbirth reg date',
          }
          const maternal = rec.type === 'Prenatal Checkup' || rec.type === 'Postpartum Checkup' ||
            pick('Referral category') === 'Pregnancy Concern'
          if (maternal) {
            for (const [key, value] of Object.entries({ ...rec.prenatal, ...rec.postpartum })) {
              if (value === null || value === undefined || value === '') continue
              const label = aliases[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2')
              if (!detailFields.some(f => f.label.toLowerCase() === label.toLowerCase())) {
                detailFields.push({ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value) })
              }
            }
          }
          const assessmentText =
            rec.diagnosis || pick('Assessment / Findings', 'Maternal assessment / Findings', 'Maternal / Newborn assessment')
          const symptomsText =
            rec.treatment || pick('Symptoms', 'Pregnancy-related symptoms', 'Pregnancy-related signs / symptoms', 'Maternal danger signs', 'Nutrition / Growth concerns')
          // Plain-Checkup structured values (mirror the Add form fields).
          // Reason/Symptoms come from their dedicated notes lines; the
          // joined treatment string is only a fallback for legacy records.
          let checkupReasonText = pick('Reason for checkup')
          let checkupSymptomsText = pick('Symptoms')
          if (!checkupReasonText && !checkupSymptomsText && rec.treatment) {
            const parts = String(rec.treatment).split('|').map(s => s.trim()).filter(Boolean)
            if (parts.length >= 2) {
              checkupReasonText = parts[0]
              checkupSymptomsText = parts.slice(1).join(' | ')
            } else if (parts.length === 1) {
              checkupSymptomsText = parts[0]
            }
          }
          const checkupAssessmentText = rec.diagnosis || pick('Assessment / Findings', 'Maternal assessment / Findings', 'Maternal / Newborn assessment') || ''
          const checkupVitalSigns = selectedRecord.vitalSigns || {}
          const checkupVitals = [
            { label: 'Weight', value: checkupVitalSigns.weight ? `${checkupVitalSigns.weight} kg` : '' },
            { label: 'Height', value: checkupVitalSigns.height ? `${checkupVitalSigns.height} cm` : '' },
            { label: 'BMI', value: checkupVitalSigns.bmi || '' },
            { label: 'Temperature', value: checkupVitalSigns.temperature ? `${checkupVitalSigns.temperature}°C` : '' },
            { label: 'Blood Pressure', value: checkupVitalSigns.bloodPressure || '' },
            { label: 'Heart Rate', value: checkupVitalSigns.heartRate ? `${checkupVitalSigns.heartRate} bpm` : '' },
            { label: 'Fasting Blood Sugar', value: checkupVitalSigns.bloodSugar ? `${checkupVitalSigns.bloodSugar} mg/dL` : (pick('Fasting blood sugar') || '') },
          ]
          // Labels already shown in the dedicated Checkup rows — anything
          // else parsed from notes (legacy/custom labels) must still appear
          // below so no saved information is ever missed.
          const checkupConsumedLabels = ['reason for checkup', 'symptoms', 'fasting blood sugar', 'assessment / findings']
          const checkupLeftoverFields = detailFields.filter(
            f => !checkupConsumedLabels.includes(f.label.trim().toLowerCase())
          )
          // Plain-Prenatal structured values (mirror the Add form fields).
          // Symptoms fall back to the saved treatment text; remarks fall
          // back to free-text remarks so legacy records lose nothing.
          const fmtNoteDate = v => {
            if (!v) return ''
            const d = new Date(v)
            return isNaN(d) ? v : formatDate(v)
          }
          const prenatalInfo = [
            { label: 'Last Menstrual Period (LMP)', value: fmtNoteDate(pick('LMP')) },
            { label: 'Expected Date of Delivery (EDD)', value: fmtNoteDate(pick('EDD')) },
            { label: 'Gravida', value: pick('Gravida') || '' },
            { label: 'Para', value: pick('Para') || '' },
            { label: 'Pregnancy Status', value: pick('Pregnancy status') || '' },
          ]
          // Saved note values already carry their units (e.g. "55 kg"),
          // so they display as-is like the form inputs.
          const prenatalMeasurements = [
            { label: 'Gestational Age', value: pick('Gestational age') || '' },
            { label: "Mother's Weight (kg)", value: pick("Mother's weight") || '' },
            { label: "Mother's Blood Pressure", value: pick("Mother's BP") || '' },
            { label: "Mother's Temperature (°C)", value: pick("Mother's temperature") || '' },
            { label: 'Fundal Height (cm)', value: pick('Fundal height') || '' },
            { label: 'Fetal Heart Rate (bpm)', value: pick('Fetal heart rate') || '' },
            { label: 'Fetal Movement', value: pick('Fetal movement') || '' },
            { label: 'MUAC (cm)', value: pick('MUAC') || '' },
            { label: 'TD Status', value: pick('TD status') || '' },
          ]
          const prenatalSymptomsText = pick('Pregnancy-related signs / symptoms') || rec.treatment || ''
          // Plain Prenatal Checkups now save a dedicated Assessment input
          // (diagnosis column + 'Assessment / Findings' notes line).
          // Legacy records only have 'Remarks / Findings'.
          const prenatalAssessmentText = rec.diagnosis || pick('Assessment / Findings', 'Maternal assessment / Findings') || ''
          // Referral prenatal details show Assessment as its own section
          // (the Add referral form has a dedicated Assessment input).
          const referralPrenatalAssessmentText = rec.type === 'Referral'
            ? (rec.diagnosis || pick('Maternal assessment / Findings') || '')
            : ''
          // New records save 'Remarks: ...' (parsed into free-text remarks);
          // legacy records saved 'Remarks / Findings: ...' as a note field.
          const prenatalRemarksText = pick('Remarks', 'Remarks / Findings') || parsed.remarks || ''
          // Auto-saved lines with no form input (both dates == the visit
          // date shown above) are consumed silently; registration_datetime
          // is system metadata (record creation timestamp), not a form
          // field, so it is hidden too. Any other leftover notes field
          // (e.g. carried-over outcome data) must still appear.
          const prenatalConsumedLabels = ['lmp', 'edd', 'gravida', 'para', 'pregnancy status', 'gestational age', "mother's weight", "mother's bp", "mother's temperature", 'fundal height', 'fetal heart rate', 'fetal movement', 'muac', 'muac date', 'td status', 'private visit', 'check-up date', 'pregnancy-related signs / symptoms', 'assessment / findings', 'remarks', 'remarks / findings', 'registration datetime', 'registration_datetime', 'registration date', 'referral category', 'referral checkup type', 'facility type', 'facility name', 'facility location']
          // Referral prenatal details only: hide the duplicate symptom /
          // assessment note lines so the Other Details section below stays
          // empty (symptoms already show in their dedicated section above).
          // Plain Prenatal Checkup records never carry these labels.
          const referralPrenatalHidden = rec.type === 'Referral'
            ? ['pregnancy-related symptoms', 'maternal assessment / findings']
            : []
          const prenatalLeftoverFields = detailFields.filter(
            f => !prenatalConsumedLabels.includes(f.label.trim().toLowerCase()) && !referralPrenatalHidden.includes(f.label.trim().toLowerCase())
          )
          // Plain-Postpartum structured values (mirror the Add form fields).
          // The form's "Assessment / Findings" textarea saves to diagnosis;
          // danger signs save to treatment — both are fallbacks below.
          const ppDelivery = [
            { label: 'Date of Delivery', value: fmtNoteDate(pick('Birth date')) },
            { label: 'Pregnancy Outcome', value: pick('Birth outcome') || '' },
            { label: 'Place of Delivery / Facility', value: pick('Delivery place') || '' },
            { label: 'Birth Attendant', value: pick('Birth attendant') || '' },
            { label: 'Birth Attendant Name', value: pick('Birth attendant name') || '' },
            { label: 'Mode of Delivery', value: pick('Mode of delivery') || '' },
            { label: "Baby's Name", value: pick("Baby's name") || '' },
            { label: "Baby's Gender", value: pick("Baby's gender") || '' },
            { label: "Baby's Weight", value: pick("Baby's weight") || '' },
          ]
          const ppMotherExam = [
            { label: "Mother's Blood Pressure", value: pick("Mother's BP") || '' },
            { label: "Mother's Temperature (°C)", value: pick("Mother's temperature") || '' },
            { label: 'Vaginal Bleeding / Lochia', value: pick('Lochia') || '' },
            { label: 'Wound Condition', value: pick('Wound condition') || '' },
            { label: 'Breastfeeding Status', value: pick('Breastfeeding status') || '' },
          ]
          const ppMaternalDangerText = pick('Maternal danger signs') || rec.treatment || ''
          const ppNewbornExam = [
            { label: "Baby's Temperature (°C)", value: pick("Baby's temperature") || '' },
            { label: "Baby's Feeding Status", value: pick("Baby's feeding status") || '' },
            { label: 'Jaundice', value: pick('Jaundice') || '' },
            { label: 'Umbilical Cord Condition', value: pick('Cord condition') || '' },
          ]
          const ppNewbornDangerText = pick('Newborn danger signs') || ''
          const ppCivil = [
            { label: 'Maternal Death (if applicable)', value: fmtNoteDate(pick('Maternal death date')) },
            { label: 'Stillbirth (if applicable)', value: fmtNoteDate(pick('Stillbirth reg date')) },
            { label: 'Early Neonatal Death (0–7 days) (if applicable)', value: fmtNoteDate(pick('Neonatal death date')) },
            { label: "Spouse's Name", value: pick("Spouse's name") || '' },
          ]
          const ppMainRemarks = rec.diagnosis || pick('Assessment / Findings', 'Maternal / Newborn assessment') || ''
          const ppExtraRemarks = parsed.remarks && parsed.remarks !== ppMainRemarks ? parsed.remarks : ''
          const ppRemarksText = [ppMainRemarks, ppExtraRemarks].filter(Boolean).join('\n\n')
          // Remarks-only (new split): new records save 'Remarks: ...'
          // (free-text remarks); legacy 'Remarks / Findings:' falls back.
          const ppAssessmentText = ppMainRemarks
          const ppRemarksOnlyText = pick('Remarks', 'Remarks / Findings') || parsed.remarks || ''
          // Auto-saved lines with no form input (status/date/narratives are
          // derived from the fields above) are consumed silently, as is the
          // system registration timestamp and private-visit flag. Any other
          // leftover notes field must still appear.
          const ppConsumedLabels = ['pregnancy status', 'birth outcome', 'birth date', 'delivery place', 'birth attendant', 'birth attendant name', 'mode of delivery', "baby's name", "baby's gender", "baby's weight", 'check-up date', "mother's bp", "mother's temperature", 'lochia', 'wound condition', 'breastfeeding status', 'maternal danger signs', "baby's temperature", "baby's feeding status", 'jaundice', 'cord condition', 'newborn danger signs', 'maternal death applicable', 'stillbirth registration applicable', 'neonatal death applicable', 'maternal death date', 'stillbirth reg date', 'neonatal death date', "spouse's name", 'outcome details', 'postpartum remarks', 'maternal / newborn assessment', 'assessment / findings', 'remarks', 'remarks / findings', 'private visit', 'registration datetime', 'registration_datetime', 'registration date', 'referral category', 'referral checkup type', 'facility type', 'facility name', 'facility location']
          const ppLeftoverFields = detailFields.filter(
            f => !ppConsumedLabels.includes(f.label.trim().toLowerCase())
          )
          // Growth Monitoring structured values (mirror the Add form fields).
          // Length is stored in the vitals height column; the generic vitals
          // section is replaced below so stored weight/length/temp/HR all
          // still appear exactly once.
          const growthVitals = selectedRecord.vitalSigns || {}
          const growthBasic = [
            { label: "Mother's Name", value: pick("Mother's Name") || '' },
            { label: "Father's Name", value: pick("Father's Name") || '' },
            { label: 'Place of Birth', value: pick('Place of Birth') || '', full: true },
          ]
          const growthMeasure = [
            { label: 'Weight (kg)', value: growthVitals.weight ? `${growthVitals.weight} kg` : (pick('Weight') || '') },
            { label: 'Length (cm)', value: growthVitals.height ? `${growthVitals.height} cm` : (pick('Length / Height') || '') },
            { label: 'Head Circumference (cm)', value: pick('Head circumference') || '' },
          ]
          const growthStatusRows = [
            { label: 'Growth Status', value: pick('Growth status') || '' },
            { label: 'Nutritional Status', value: pick('Nutritional status') || '' },
          ]
          const growthFeedingTop = [
            { label: 'Feeding Status', value: pick('Feeding status') || '' },
            { label: 'Developmental Concerns', value: pick('Developmental concerns') || '' },
          ]
          const growthMilestones = pick('Developmental milestones') || ''
          const growthNutritionText = pick('Nutrition / Growth concerns') || rec.treatment || ''
          const growthVisitVitals = [
            { label: 'Temperature (°C)', value: growthVitals.temperature ? `${growthVitals.temperature}°C` : '' },
            { label: 'Heart Rate (bpm)', value: growthVitals.heartRate ? `${growthVitals.heartRate} bpm` : '' },
            { label: 'Respiratory Rate (breaths/min)', value: pick('Respiratory rate') || '' },
          ]
          const growthVaxNames = (pick('Vaccines') || '').split(';').map(s => s.trim()).filter(Boolean)
          const growthVaxBatch = pick('Vaccine batch') || ''
          const growthVaccinator = pick('Vaccinator') || ''
          // Auto-saved lines with no form input (dose/date repeat the visit)
          // are consumed silently; any other leftover notes field must
          // still appear.
          const growthConsumedLabels = ['place of birth', "mother's name", "father's name", 'weight', 'length / height', 'head circumference', 'feeding status', 'growth status', 'nutritional status', 'developmental milestones', 'developmental concerns', 'respiratory rate', 'vaccines', 'vaccine dose', 'vaccine date', 'vaccine batch', 'vaccinator', 'nutrition / growth concerns', 'assessment / findings', 'referral category', 'referral checkup type', 'facility type', 'facility name', 'facility location']
          const growthLeftoverFields = detailFields.filter(
            f => !growthConsumedLabels.includes(f.label.trim().toLowerCase())
          )
          // Senior Checkup saves exactly like a plain Checkup plus the
          // Mobility line, so the shared checkup reason/symptoms/assessment/
          // vitals values above are reused as-is here.
          const seniorMobilityText = pick('Mobility / Functional status') || ''
          const seniorConsumedLabels = ['reason for checkup', 'symptoms', 'fasting blood sugar', 'mobility / functional status', 'assessment / findings', 'referral category', 'referral checkup type', 'facility type', 'facility name', 'facility location']
          const seniorLeftoverFields = detailFields.filter(
            f => !seniorConsumedLabels.includes(f.label.trim().toLowerCase())
          )
          // Medicine remarks share one parser with the history list so Dose,
          // Qty and free-text remarks show identically in both places.
          const medInfo = !isCheckup ? parseMedRemarks(rec.notes) : { doseParts: [], remarks: '' }
          const medRemarksText = !isCheckup ? (medInfo.remarks || '') : ''
          // Group checkup notes fields per record type so each Record Details
          // modal gets its own designed sections — every parsed field stays
          // visible (groups partition detailFields, nothing is dropped).
          const fieldByNames = (...names) =>
            detailFields.filter(f =>
              names.some(n => n.toLowerCase() === f.label.trim().toLowerCase())
            )
          const fieldExcluding = (...names) =>
            detailFields.filter(
              f => !names.some(n => n.toLowerCase() === f.label.trim().toLowerCase())
            )
          // Referral Record Details mirror the matching checkup layout:
          // Pregnancy referrals show prenatal or postpartum sections per the
          // saved checkup choice (older referrals without a saved choice
          // default to prenatal), infant referrals show growth sections,
          // senior referrals (General Concern, resident aged 60+) show senior
          // sections. General-adult referrals keep the generic layout below.
          const referralCatText = rec.type === 'Referral' ? pick('Referral category') : ''
          const referralCheckupChoice = rec.type === 'Referral' ? pick('Referral checkup type') : ''
          const isRefPrenatal = rec.type === 'Referral' && referralCatText === 'Pregnancy Concern' && !/postpartum/i.test(referralCheckupChoice || '')
          const isRefPostpartum = rec.type === 'Referral' && referralCatText === 'Pregnancy Concern' && /postpartum/i.test(referralCheckupChoice || '')
          const isRefInfant = rec.type === 'Referral' && referralCatText === 'Infant Concern'
          const isRefSenior = rec.type === 'Referral' && referralCatText === 'General Concern' && Number(resident?.age) >= 60
          // General-adult ("Checkup") referral: a Referral matching none of
          // the four typed variants. It reuses the Senior Citizen Checkup
          // detail layout below.
          const isRefGeneralCheckup = rec.type === 'Referral' && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior
          // Referral Information always shows these four rows (with an
          // empty-state value when a record lacks the line) so the
          // destination + checkup type are never hidden. Referral
          // Record Details only — other types are untouched.
          const referralInfoRows = [
            { label: 'Facility type', value: pick('Facility type') || '' },
            { label: 'Facility name', value: pick('Facility name') || '' },
            { label: 'Facility location', value: pick('Facility location') || '' },
            {
              label: 'Referral checkup type',
              // Referral details only: every variant always resolves to its
              // display name when the record lacks the saved line.
              value:
                pick('Referral checkup type') ||
                (isRefPostpartum ? 'Postpartum Checkup'
                  : isRefPrenatal ? 'Prenatal Checkup'
                  : isRefSenior ? 'Senior Citizen Checkup'
                  : isRefInfant ? 'Infant / Child Growth Monitoring'
                  : isRefGeneralCheckup ? 'Checkup' : ''),
            },
            // Health Worker lives here for referrals (Visit Information
            // is hidden for Referral records).
            { label: 'Health Worker', value: rec.administeredBy || '' },
          ]
          const checkupSections = (() => {
            if (!isCheckup) return []
            const has = (...names) => fieldByNames(...names).length > 0
            if (rec.type === 'Prenatal Checkup') {
              const groups = []
              const bg = fieldByNames('LMP', 'EDD', 'Gravida', 'Para', 'Pregnancy status')
              if (bg.length) groups.push({ title: 'Pregnancy Background', fields: bg })
              const visit = fieldByNames(
                'Gestational age', "Mother's weight", "Mother's BP", "Mother's temperature",
                'Fundal height', 'Fetal heart rate', 'Fetal movement',
                'MUAC', 'MUAC date', 'TD status', 'Private visit', 'Check-up date',
                'Pregnancy-related signs / symptoms'
              )
              if (visit.length) groups.push({ title: 'This Visit', fields: visit })
              const outcome = fieldExcluding(
                'LMP', 'EDD', 'Gravida', 'Para', 'Pregnancy status',
                'Gestational age', "Mother's weight", "Mother's BP", "Mother's temperature",
                'Fundal height', 'Fetal heart rate', 'Fetal movement',
                'MUAC', 'MUAC date', 'TD status', 'Private visit', 'Check-up date',
                'Pregnancy-related signs / symptoms', 'Assessment / Findings', 'Remarks', 'Remarks / Findings'
              )
              if (outcome.length) groups.push({ title: 'Pregnancy Outcome / Postpartum', fields: outcome })
              const extraFindings = fieldByNames('Assessment / Findings', 'Remarks', 'Remarks / Findings')
              if (extraFindings.length) groups.push({ title: 'Findings', fields: extraFindings })
              if (!groups.length && detailFields.length) groups.push({ title: 'Pregnancy & Visit Details', fields: detailFields })
              return groups
            }
            if (rec.type === 'Postpartum Checkup') {
              const groups = []
              const del = fieldByNames(
                'Pregnancy status', 'Birth outcome', 'Birth date', 'Delivery place',
                'Birth attendant', 'Birth attendant name', 'Mode of delivery',
                "Baby's name", "Baby's gender", "Baby's weight", 'Check-up date'
              )
              if (del.length) groups.push({ title: 'Delivery Details', fields: del })
              const mom = fieldByNames(
                "Mother's BP", "Mother's temperature", 'Lochia',
                'Wound condition', 'Breastfeeding status', 'Maternal danger signs'
              )
              if (mom.length) groups.push({ title: "Mother's Postnatal Examination", fields: mom })
              const baby = fieldByNames(
                "Baby's temperature", "Baby's feeding status", 'Jaundice',
                'Cord condition', 'Newborn danger signs'
              )
              if (baby.length) groups.push({ title: 'Newborn Examination', fields: baby })
              const civil = fieldByNames(
                'Maternal death date', 'Stillbirth reg date', 'Neonatal death date',
                "Spouse's name", 'Outcome details', 'Postpartum remarks',
                'Maternal / Newborn assessment', 'Assessment / Findings'
              )
              if (civil.length) groups.push({ title: 'Civil Registry & Outcome Notes', fields: civil })
              const rest = detailFields.filter(f => !groups.some(g => g.fields.includes(f)))
              if (rest.length) groups.push({ title: 'Postpartum Details', fields: rest })
              if (!groups.length && detailFields.length) groups.push({ title: 'Postpartum Details', fields: detailFields })
              return groups
            }
            if (rec.type === 'Growth Monitoring') {
              const groups = []
              const basic = fieldByNames('Place of Birth', "Mother's Name", "Father's Name")
              if (basic.length) groups.push({ title: 'Basic Information', fields: basic })
              const meas = fieldByNames('Weight', 'Length / Height', 'Head circumference', 'Respiratory rate')
              if (meas.length) groups.push({ title: 'Measurements', fields: meas })
              const nutri = fieldByNames(
                'Feeding status', 'Growth status', 'Nutritional status',
                'Developmental milestones', 'Developmental concerns',
                'Nutrition / Growth concerns'
              )
              if (nutri.length) groups.push({ title: 'Nutrition & Development', fields: nutri })
              const vax = fieldByNames('Vaccines', 'Vaccine dose', 'Vaccine date', 'Vaccine batch', 'Vaccinator')
              if (vax.length) groups.push({ title: 'Vaccines Given This Visit', fields: vax })
              const rest = detailFields.filter(f => !groups.some(g => g.fields.includes(f)))
              if (rest.length) groups.push({ title: 'Other Details', fields: rest })
              if (!groups.length && detailFields.length) groups.push({ title: 'Growth & Nutrition Details', fields: detailFields })
              return groups
            }
            if (rec.type === 'Referral') {
              // Typed referrals (pregnant / infant / senior) render the
              // matching checkup sections below with their own Referral
              // Information header; only general-adult referrals use the
              // generic groups here. 'Referral category' is automatic and
              // has no Add-form input, so it is never displayed.
              if (isRefPrenatal || isRefPostpartum || isRefInfant || isRefSenior || isRefGeneralCheckup) return []
              const groups = []
              // General-adult ("Checkup") referrals never save a checkup-type
              // line, so label the interface explicitly like the other four
              // variants. Fixed order: checkup type first, then facility.
              const head = [
                ...fieldByNames('Referral checkup type'),
                ...fieldByNames('Facility type'),
                ...fieldByNames('Facility name'),
                ...fieldByNames('Facility location'),
                ...fieldByNames('Reason for checkup'),
              ]
              if (!head.some(f => f.label.trim().toLowerCase() === 'referral checkup type')) {
                head.unshift({ label: 'Referral checkup type', value: 'Checkup' })
              }
              if (head.length) groups.push({ title: 'Referral Information', fields: head })
              const rest = detailFields.filter(f => !head.some(h => h === f) && f.label.trim().toLowerCase() !== 'referral category')
              if (rest.length) groups.push({ title: 'Clinical Details', fields: rest })
              if (!groups.length && detailFields.length) groups.push({ title: 'Referral Details', fields: detailFields })
              return groups
            }
            // Keep the original reason separate from legacy treatment text.
            const gridFields = detailFields
            if (gridFields.length) {
              const hasMobility = has('Mobility / Functional status')
              return [{ title: hasMobility ? 'Senior Assessment Details' : 'Checkup Details', fields: gridFields }]
            }
            return []
          })()
          const symptomsTitle =
            rec.type === 'Prenatal Checkup'
              ? 'Pregnancy-related Symptoms'
              : rec.type === 'Postpartum Checkup'
              ? 'Maternal Danger Signs / Symptoms'
              : rec.type === 'Growth Monitoring'
              ? 'Nutrition / Growth Concerns'
              : rec.type === 'Referral'
              ? 'Symptoms / Concerns'
              : 'Reason / Symptoms'
          const assessmentTitle =
            rec.type === 'Prenatal Checkup' || rec.type === 'Postpartum Checkup'
              ? 'Maternal Assessment / Findings'
              : 'Assessment / Findings'
          return (
          <div className='space-y-4 min-w-0 [overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap'>
            <div className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border ${recordBorder(rec.type)}`}>
              <div className='flex flex-wrap items-center gap-3 min-w-0'>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${recordTheme(rec.type)}`}
                >
                  {displayType}
                </span>
                {!isVaccinationRecord && selectedRecord.vaccineName && (
                  <span className='text-white text-base sm:text-lg font-semibold'>
                    {selectedRecord.vaccineName}
                  </span>
                )}
                {!isDewormingRecord && !isVitaminsRecord && selectedRecord.medicineName && (
                  <span className='text-white text-base sm:text-lg font-semibold'>
                    {selectedRecord.medicineName}
                  </span>
                )}
              </div>
              <span className='text-sm text-white/75'>
                {selectedRecord.date
                  ? new Date(selectedRecord.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'No date'}
              </span>
            </div>
            {/* Visit Information is hidden for referrals — the facility
                and worker live in Referral Information below. */}
            {rec.type !== 'Referral' && (
            <div className='bg-white/[0.03] rounded-lg p-4'>
              <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                Visit Information
              </h3>
              <div className={`grid grid-cols-1 ${(isPlainCheckup || isPrenatalCheckup || isPostpartumCheckup || isGrowthMonitoring || isSeniorCheckup || isRefPrenatal || isRefPostpartum || isRefInfant || isRefSenior || isRefGeneralCheckup || isVaccinationRecord || isDewormingRecord || isVitaminsRecord) ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4`}>
                {/* Date lives in the header row above — hide it here for
                    the mirrored checkup-type records, Vaccination,
                    Deworming and Vitamins records to avoid the duplicate. */}
                {!isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && !isVaccinationRecord && !isDewormingRecord && !isVitaminsRecord && (
                <div>
                  <p className='text-xs text-white/50 mb-1'>Date</p>
                  <p className='text-sm text-white font-medium'>
                    {rec.date
                      ? new Date(rec.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'No date'}
                  </p>
                </div>
                )}
                <div>
                  <p className='text-xs text-white/50 mb-1'>Service Location</p>
                  <p className='text-sm text-white font-medium'>
                    {rec.facility || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-xs text-white/50 mb-1'>Health Worker</p>
                  <p className='text-sm text-white font-medium'>
                    {rec.administeredBy || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            )}
            {/* Plain Checkup details mirror the Add form 1:1 — every field
                always visible with an empty-state value when blank. Other
                record types use the generic sections further below. */}
            {isPlainCheckup && (
              <>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Reason for Checkup
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupReasonText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Symptoms
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupSymptomsText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Vital Signs
                  </h3>
                  <div className='flex flex-wrap gap-3'>
                    {checkupVitals.map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3 flex-1 min-w-[130px]'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Chronic Condition Identified
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                      selectedRecord.conditions.map((c, i) => {
                        let n,
                          s = 'Mild'
                        if (typeof c === 'string') {
                          try {
                            const p = JSON.parse(c)
                            n = p.name || c
                            s = p.severity || 'Mild'
                          } catch {
                            n = c
                          }
                        } else {
                          n = c.name || ''
                          s = c.severity || 'Mild'
                        }
                        const cols = {
                          Critical:
                            'bg-red-500/20 text-red-200 border-red-400/40',
                          Severe:
                            'bg-orange-500/20 text-orange-200 border-orange-400/40',
                          Moderate:
                            'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                          Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        }
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                              cols[s] || cols['Mild']
                            }`}
                          >
                            {n} <span className='text-xs opacity-70'>({s})</span>
                          </span>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No conditions</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Assessment / Findings
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupAssessmentText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Current Medications
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                      selectedRecord.medications.map((m, i) => {
                        let medication = m
                        if (typeof m === 'string') {
                          try { medication = JSON.parse(m) } catch { medication = { name: m } }
                        }
                        const n = medication?.name || String(m)
                        const d = medication?.dosage || ''
                        const f = medication?.frequency || ''
                        return (
                          <div
                            key={i}
                            className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                          >
                            <span className='text-white'>{n}</span>
                            {(d || f) && (
                              <>
                                <span className='text-white/50'>|</span>
                                <span className='text-white/85 text-sm'>
                                  {[d, f].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No medications</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Allergies
                  </h3>
                  {(() => {
                    const present = ['drugs', 'food', 'environmental'].filter(
                      t => selectedRecord.allergies?.[t]?.length > 0
                    )
                    if (present.length === 0) {
                      return <span className='text-sm text-white/50'>No allergies</span>
                    }
                    return (
                      <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                        {present.map(t => (
                          <div key={t}>
                            <h4 className='text-sm text-white/75 mb-2 capitalize'>
                              {t}
                            </h4>
                            <div className='flex flex-wrap gap-1'>
                              {selectedRecord.allergies[t].map((a, i) => (
                                <span
                                  key={i}
                                  className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                                >
                                  {typeof a === 'string' ? a : a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {checkupLeftoverFields.length > 0 && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                      Other Details
                    </h3>
                    <div className={`grid ${detailGridClass(checkupLeftoverFields.length)} gap-x-6 gap-y-3`}>
                      {checkupLeftoverFields.map((f, i) => (
                        <div key={i} className='min-w-0 rounded-lg bg-white/[0.03] p-3'>
                          <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                          <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Remarks
                  </h3>
                  <p className='text-sm text-white/75 whitespace-pre-line'>{parsed.remarks || '—'}</p>
                </div>
              </>
            )}
            {/* Plain Prenatal Checkup details mirror the Add form 1:1 — every
                field always visible with an empty-state value when blank. */}
            {/* Typed referrals show their referral header above the matching
                checkup sections below. */}
            {rec.type === 'Referral' && (isRefPrenatal || isRefPostpartum || isRefInfant || isRefSenior || isRefGeneralCheckup) && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  Referral Information
                </h3>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  {referralInfoRows.map((f, i) => (
                    <div key={i} className='min-w-0'>
                      <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                      <p className='text-sm text-white font-medium break-words'>{f.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(isPrenatalCheckup || isRefPrenatal) && (
              <>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Pregnancy Information
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
                    {prenatalInfo.slice(0, 2).map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
                    {prenatalInfo.slice(2).map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Prenatal Check-up
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                    {prenatalMeasurements.map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Pregnancy-related Signs / Symptoms
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{prenatalSymptomsText || '—'}</p>
                </div>
                {isRefPrenatal && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                      Assessment / Findings
                    </h3>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{referralPrenatalAssessmentText || '—'}</p>
                  </div>
                )}
                {isPrenatalCheckup && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                      Assessment / Findings
                    </h3>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{prenatalAssessmentText || '—'}</p>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Chronic Condition Identified
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                      selectedRecord.conditions.map((c, i) => {
                        let n,
                          s = 'Mild'
                        if (typeof c === 'string') {
                          try {
                            const p = JSON.parse(c)
                            n = p.name || c
                            s = p.severity || 'Mild'
                          } catch {
                            n = c
                          }
                        } else {
                          n = c.name || ''
                          s = c.severity || 'Mild'
                        }
                        const cols = {
                          Critical:
                            'bg-red-500/20 text-red-200 border-red-400/40',
                          Severe:
                            'bg-orange-500/20 text-orange-200 border-orange-400/40',
                          Moderate:
                            'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                          Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        }
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                              cols[s] || cols['Mild']
                            }`}
                          >
                            {n} <span className='text-xs opacity-70'>({s})</span>
                          </span>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No conditions</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Current Medications
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                      selectedRecord.medications.map((m, i) => {
                        let medication = m
                        if (typeof m === 'string') {
                          try { medication = JSON.parse(m) } catch { medication = { name: m } }
                        }
                        const n = medication?.name || String(m)
                        const d = medication?.dosage || ''
                        const f = medication?.frequency || ''
                        return (
                          <div
                            key={i}
                            className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                          >
                            <span className='text-white'>{n}</span>
                            {(d || f) && (
                              <>
                                <span className='text-white/50'>|</span>
                                <span className='text-white/85 text-sm'>
                                  {[d, f].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No medications</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Allergies
                  </h3>
                  {(() => {
                    const present = ['drugs', 'food', 'environmental'].filter(
                      t => selectedRecord.allergies?.[t]?.length > 0
                    )
                    if (present.length === 0) {
                      return <span className='text-sm text-white/50'>No allergies</span>
                    }
                    return (
                      <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                        {present.map(t => (
                          <div key={t}>
                            <h4 className='text-sm text-white/75 mb-2 capitalize'>
                              {t}
                            </h4>
                            <div className='flex flex-wrap gap-1'>
                              {selectedRecord.allergies[t].map((a, i) => (
                                <span
                                  key={i}
                                  className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                                >
                                  {typeof a === 'string' ? a : a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {prenatalLeftoverFields.length > 0 && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                      Other Details
                    </h3>
                    <div className={`grid ${detailGridClass(prenatalLeftoverFields.length)} gap-x-6 gap-y-3`}>
                      {prenatalLeftoverFields.map((f, i) => (
                        <div key={i} className='min-w-0 rounded-lg bg-white/[0.03] p-3'>
                          <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                          <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Remarks
                  </h3>
                  <p className='text-sm text-white/75 whitespace-pre-line'>{prenatalRemarksText || '—'}</p>
                </div>
              </>
            )}
            {/* Plain Postpartum Checkup details mirror the Add form 1:1 —
                every field always visible with an empty-state value. */}
            {(isPostpartumCheckup || isRefPostpartum) && (
              <>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Delivery Details
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
                    {ppDelivery.slice(0, 3).map(item => (
                      <div key={item.label} className={item.label === 'Place of Delivery / Facility' ? 'sm:col-span-2' : ''}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                    {ppDelivery.slice(3).map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Mother&apos;s Postnatal Examination
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3'>
                    {ppMotherExam.slice(0, 2).map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3'>
                    {ppMotherExam.slice(2).map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='rounded-lg bg-white/[0.03] p-3'>
                    <p className='text-xs text-white/50 mb-1'>Maternal Danger Signs / Symptoms</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{ppMaternalDangerText || '—'}</p>
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Newborn Examination
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3'>
                    {ppNewbornExam.map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='rounded-lg bg-white/[0.03] p-3'>
                    <p className='text-xs text-white/50 mb-1'>Newborn Danger Signs / Symptoms</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{ppNewbornDangerText || '—'}</p>
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Civil Registry (if applicable)
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    {ppCivil.map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {isRefPostpartum && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                      Assessment / Findings
                    </h3>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{ppMainRemarks || '—'}</p>
                  </div>
                )}
                {isPostpartumCheckup && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                      Assessment / Findings
                    </h3>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{ppAssessmentText || '—'}</p>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Chronic Condition Identified
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                      selectedRecord.conditions.map((c, i) => {
                        let n,
                          s = 'Mild'
                        if (typeof c === 'string') {
                          try {
                            const p = JSON.parse(c)
                            n = p.name || c
                            s = p.severity || 'Mild'
                          } catch {
                            n = c
                          }
                        } else {
                          n = c.name || ''
                          s = c.severity || 'Mild'
                        }
                        const cols = {
                          Critical:
                            'bg-red-500/20 text-red-200 border-red-400/40',
                          Severe:
                            'bg-orange-500/20 text-orange-200 border-orange-400/40',
                          Moderate:
                            'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                          Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        }
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                              cols[s] || cols['Mild']
                            }`}
                          >
                            {n} <span className='text-xs opacity-70'>({s})</span>
                          </span>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No conditions</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Current Medications
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                      selectedRecord.medications.map((m, i) => {
                        let medication = m
                        if (typeof m === 'string') {
                          try { medication = JSON.parse(m) } catch { medication = { name: m } }
                        }
                        const n = medication?.name || String(m)
                        const d = medication?.dosage || ''
                        const f = medication?.frequency || ''
                        return (
                          <div
                            key={i}
                            className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                          >
                            <span className='text-white'>{n}</span>
                            {(d || f) && (
                              <>
                                <span className='text-white/50'>|</span>
                                <span className='text-white/85 text-sm'>
                                  {[d, f].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No medications</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Allergies
                  </h3>
                  {(() => {
                    const present = ['drugs', 'food', 'environmental'].filter(
                      t => selectedRecord.allergies?.[t]?.length > 0
                    )
                    if (present.length === 0) {
                      return <span className='text-sm text-white/50'>No allergies</span>
                    }
                    return (
                      <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                        {present.map(t => (
                          <div key={t}>
                            <h4 className='text-sm text-white/75 mb-2 capitalize'>
                              {t}
                            </h4>
                            <div className='flex flex-wrap gap-1'>
                              {selectedRecord.allergies[t].map((a, i) => (
                                <span
                                  key={i}
                                  className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                                >
                                  {typeof a === 'string' ? a : a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {ppLeftoverFields.length > 0 && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                      Other Details
                    </h3>
                    <div className={`grid ${detailGridClass(ppLeftoverFields.length)} gap-x-6 gap-y-3`}>
                      {ppLeftoverFields.map((f, i) => (
                        <div key={i} className='min-w-0 rounded-lg bg-white/[0.03] p-3'>
                          <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                          <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Remarks
                  </h3>
                  <p className='text-sm text-white/75 whitespace-pre-line'>{(isRefPostpartum ? ppExtraRemarks : isPostpartumCheckup ? ppRemarksOnlyText : ppRemarksText) || '—'}</p>
                </div>
              </>
            )}
            {/* Growth Monitoring details mirror the Add form 1:1 — every
                field always visible with an empty-state value when blank. */}
            {(isGrowthMonitoring || isRefInfant) && (
              <>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Basic Information
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    {growthBasic.map(item => (
                      <div key={item.label} className={item.full ? 'sm:col-span-2' : ''}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Growth Measurements
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                    {growthMeasure.map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Growth / Nutritional Status
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    {growthStatusRows.map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Feeding & Development
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
                    {growthFeedingTop.map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className='mb-3'>
                    <p className='text-xs text-white/50 mb-1'>Developmental Milestones / Observations</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{growthMilestones || '—'}</p>
                  </div>
                  <div>
                    <p className='text-xs text-white/50 mb-1'>Nutrition / Growth Concerns</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{growthNutritionText || '—'}</p>
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Vital Signs
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                    {growthVisitVitals.map(item => (
                      <div key={item.label}>
                        <p className='text-xs text-white/50 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <div className='mb-3'>
                    <p className='text-xs text-white/50 mb-1'>Vaccines given this visit</p>
                    {growthVaxNames.length > 0 ? (
                      <div className='flex flex-wrap gap-1 mt-1'>
                        {growthVaxNames.map((v, i) => (
                          <span
                            key={i}
                            className='px-3 py-1.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 rounded-full text-sm font-medium'
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-white font-medium'>—</p>
                    )}
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div>
                      <p className='text-xs text-white/50 mb-1'>Lot / Batch Number</p>
                      <p className='text-sm text-white font-medium'>{growthVaxBatch || '—'}</p>
                    </div>
                    <div>
                      <p className='text-xs text-white/50 mb-1'>Vaccinator</p>
                      <p className='text-sm text-white font-medium'>{growthVaccinator || '—'}</p>
                    </div>
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Chronic Condition Identified
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                      selectedRecord.conditions.map((c, i) => {
                        let n,
                          s = 'Mild'
                        if (typeof c === 'string') {
                          try {
                            const p = JSON.parse(c)
                            n = p.name || c
                            s = p.severity || 'Mild'
                          } catch {
                            n = c
                          }
                        } else {
                          n = c.name || ''
                          s = c.severity || 'Mild'
                        }
                        const cols = {
                          Critical:
                            'bg-red-500/20 text-red-200 border-red-400/40',
                          Severe:
                            'bg-orange-500/20 text-orange-200 border-orange-400/40',
                          Moderate:
                            'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                          Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        }
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                              cols[s] || cols['Mild']
                            }`}
                          >
                            {n} <span className='text-xs opacity-70'>({s})</span>
                          </span>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No conditions</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Current Medications
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                      selectedRecord.medications.map((m, i) => {
                        let medication = m
                        if (typeof m === 'string') {
                          try { medication = JSON.parse(m) } catch { medication = { name: m } }
                        }
                        const n = medication?.name || String(m)
                        const d = medication?.dosage || ''
                        const f = medication?.frequency || ''
                        return (
                          <div
                            key={i}
                            className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                          >
                            <span className='text-white'>{n}</span>
                            {(d || f) && (
                              <>
                                <span className='text-white/50'>|</span>
                                <span className='text-white/85 text-sm'>
                                  {[d, f].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No medications</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Allergies
                  </h3>
                  {(() => {
                    const present = ['drugs', 'food', 'environmental'].filter(
                      t => selectedRecord.allergies?.[t]?.length > 0
                    )
                    if (present.length === 0) {
                      return <span className='text-sm text-white/50'>No allergies</span>
                    }
                    return (
                      <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                        {present.map(t => (
                          <div key={t}>
                            <h4 className='text-sm text-white/75 mb-2 capitalize'>
                              {t}
                            </h4>
                            <div className='flex flex-wrap gap-1'>
                              {selectedRecord.allergies[t].map((a, i) => (
                                <span
                                  key={i}
                                  className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                                >
                                  {typeof a === 'string' ? a : a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {growthLeftoverFields.length > 0 && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                      Other Details
                    </h3>
                    <div className={`grid ${detailGridClass(growthLeftoverFields.length)} gap-x-6 gap-y-3`}>
                      {growthLeftoverFields.map((f, i) => (
                        <div key={i} className='min-w-0 rounded-lg bg-white/[0.03] p-3'>
                          <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                          <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Remarks
                  </h3>
                  <p className='text-sm text-white/75 whitespace-pre-line'>{parsed.remarks || '—'}</p>
                </div>
              </>
            )}
            {/* Senior Checkup details mirror the Add form 1:1 — every field
                always visible with an empty-state value when blank. */}
            {(isSeniorCheckup || isRefSenior || isRefGeneralCheckup) && (
              <>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Reason for Checkup
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupReasonText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Symptoms
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupSymptomsText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Vital Signs
                  </h3>
                  <div className='flex flex-wrap gap-3'>
                    {checkupVitals.map(item => (
                      <div key={item.label} className='bg-white/[0.05] rounded p-3 flex-1 min-w-[130px]'>
                        <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                        <p className='text-sm text-white font-medium'>{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Chronic Condition Identified
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                      selectedRecord.conditions.map((c, i) => {
                        let n,
                          s = 'Mild'
                        if (typeof c === 'string') {
                          try {
                            const p = JSON.parse(c)
                            n = p.name || c
                            s = p.severity || 'Mild'
                          } catch {
                            n = c
                          }
                        } else {
                          n = c.name || ''
                          s = c.severity || 'Mild'
                        }
                        const cols = {
                          Critical:
                            'bg-red-500/20 text-red-200 border-red-400/40',
                          Severe:
                            'bg-orange-500/20 text-orange-200 border-orange-400/40',
                          Moderate:
                            'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                          Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        }
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                              cols[s] || cols['Mild']
                            }`}
                          >
                            {n} <span className='text-xs opacity-70'>({s})</span>
                          </span>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No conditions</span>
                    )}
                  </div>
                </div>
                {/* Mobility shows for Senior records only — hidden in
                    general ("Checkup") referral details. */}
                {(isSeniorCheckup || isRefSenior) && (
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Mobility / Functional Status
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{seniorMobilityText || '—'}</p>
                </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Assessment / Findings
                  </h3>
                  <p className='text-sm text-white/85 whitespace-pre-line'>{checkupAssessmentText || '—'}</p>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Current Medications
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                      selectedRecord.medications.map((m, i) => {
                        let medication = m
                        if (typeof m === 'string') {
                          try { medication = JSON.parse(m) } catch { medication = { name: m } }
                        }
                        const n = medication?.name || String(m)
                        const d = medication?.dosage || ''
                        const f = medication?.frequency || ''
                        return (
                          <div
                            key={i}
                            className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                          >
                            <span className='text-white'>{n}</span>
                            {(d || f) && (
                              <>
                                <span className='text-white/50'>|</span>
                                <span className='text-white/85 text-sm'>
                                  {[d, f].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <span className='text-sm text-white/50'>No medications</span>
                    )}
                  </div>
                </div>
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                    Allergies
                  </h3>
                  {(() => {
                    const present = ['drugs', 'food', 'environmental'].filter(
                      t => selectedRecord.allergies?.[t]?.length > 0
                    )
                    if (present.length === 0) {
                      return <span className='text-sm text-white/50'>No allergies</span>
                    }
                    return (
                      <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                        {present.map(t => (
                          <div key={t}>
                            <h4 className='text-sm text-white/75 mb-2 capitalize'>
                              {t}
                            </h4>
                            <div className='flex flex-wrap gap-1'>
                              {selectedRecord.allergies[t].map((a, i) => (
                                <span
                                  key={i}
                                  className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                                >
                                  {typeof a === 'string' ? a : a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {seniorLeftoverFields.length > 0 && (
                  <div className='bg-white/[0.03] rounded-lg p-4'>
                    <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                      Other Details
                    </h3>
                    <div className={`grid ${detailGridClass(seniorLeftoverFields.length)} gap-x-6 gap-y-3`}>
                      {seniorLeftoverFields.map((f, i) => (
                        <div key={i} className='min-w-0 rounded-lg bg-white/[0.03] p-3'>
                          <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                          <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='bg-white/[0.03] rounded-lg p-4'>
                  <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                    Remarks
                  </h3>
                  <p className='text-sm text-white/75 whitespace-pre-line'>{parsed.remarks || '—'}</p>
                </div>
              </>
            )}
            {selectedRecord.category === 'Vaccination' && (
              <div className='space-y-3 bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300'>
                  Vaccination Details
                </h3>
                {(() => {
                  const items = [
                    { label: 'Vaccine', value: selectedRecord.vaccineName || 'N/A' },
                    { label: 'Progress', value: `Dose ${selectedRecord.doseNumber} of ${selectedRecord.totalDoses}` },
                    { label: 'Batch Number', value: selectedRecord.batchNumber || 'N/A' },
                    { label: 'Site', value: selectedRecord.administrationSite || 'N/A' },
                  ]
                  return (
                    <div className={`grid ${detailGridClass(items.length)} gap-4`}>
                      {items.map(it => (
                        <div key={it.label}>
                          <p className='text-xs text-white/50 mb-1'>{it.label}</p>
                          <p className='text-sm text-white font-medium'>{it.value}</p>
                        </div>
                      ))}
                      <div>
                        <p className='text-xs text-white/50 mb-1'>Status</p>
                        {selectedRecord.dosesLeft > 0 ? (
                          <p className='text-sm text-yellow-400 font-medium'>
                            {selectedRecord.dosesLeft} dose
                            {selectedRecord.dosesLeft > 1 ? 's' : ''} remaining
                          </p>
                        ) : (
                          <p className='text-sm text-emerald-400 font-medium'>✓ Complete</p>
                        )}
                      </div>
                    </div>
                  )
                })()}
                {(medRemarksText || parsed.remarks) && (
                  <div className='pt-3 border-t border-white/10'>
                    <p className='text-xs text-white/50 mb-1'>Remarks</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{rec.notes}</p>
                  </div>
                )}
              </div>
            )}
            {(selectedRecord.category === 'Deworming' || selectedRecord.category === 'Vitamins') && (
              <div className='space-y-3 bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300'>
                  {selectedRecord.category === 'Deworming' ? 'Deworming Details' : 'Vitamin Details'}
                </h3>
                {(() => {
                  const items = [
                    { label: selectedRecord.category === 'Deworming' ? 'Medicine' : 'Vitamin', value: selectedRecord.medicineName || 'N/A' },
                    { label: 'Administration', value: `#${selectedRecord.doseNumber}` },
                    ...medInfo.doseParts.map((p, i) => ({ label: p.label, value: p.value, key: `med-${i}` })),
                    { label: 'Batch Number', value: selectedRecord.batchNumber },
                    { label: 'Site', value: selectedRecord.administrationSite },
                  ].filter(it => it.value !== '' && it.value !== null && it.value !== undefined)
                  return (
                    <div className={`grid ${detailGridClass(items.length)} gap-4`}>
                      {items.map((it, i) => (
                        <div key={it.key || it.label + i}>
                          <p className='text-xs text-white/50 mb-1'>{it.label}</p>
                          <p className='text-sm text-white font-medium'>{it.value}</p>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {medRemarksText && (
                  <div className='pt-3 border-t border-white/10'>
                    <p className='text-xs text-white/50 mb-1'>Remarks</p>
                    <p className='text-sm text-white/85 whitespace-pre-line'>{medRemarksText}</p>
                  </div>
                )}
              </div>
            )}
            {isCheckup && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && checkupSections.length > 0 && checkupSections.map(sec => (
              <div key={sec.title} className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  {sec.title}
                </h3>
                <div className={`grid ${detailGridClass(sec.fields.length)} gap-x-6 gap-y-3`}>
                  {sec.fields.map((f, i) => (
                    <div key={i} className={`min-w-0 rounded-lg bg-white/[0.03] p-3 ${String(f.value).length > 90 || /remarks|symptoms|concerns|findings|assessment|danger|milestones/i.test(f.label) ? 'col-span-full' : ''}`}>
                      <p className='text-xs text-white/50 mb-1'>{f.label}</p>
                      <p className='text-sm text-white font-medium break-words'>{f.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {isCheckup && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && symptomsText && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                  {symptomsTitle}
                </h3>
                <p className='text-sm text-white/85 whitespace-pre-line'>{symptomsText}</p>
              </div>
            )}
            {isCheckup && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && assessmentText && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                  {assessmentTitle}
                </h3>
                <p className='text-sm text-white/85 whitespace-pre-line'>{assessmentText}</p>
              </div>
            )}
            {selectedRecord.category === 'Checkup' && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  Vital Signs
                </h3>
                {(() => {
                  const v = selectedRecord.vitalSigns || {}
                  const top = [
                    v.bloodPressure ? { label: 'Blood Pressure', value: v.bloodPressure } : null,
                    v.heartRate ? { label: 'Heart Rate', value: `${v.heartRate} bpm` } : null,
                    v.temperature ? { label: 'Temperature', value: `${v.temperature}°C` } : null,
                    v.bloodSugar ? { label: 'Blood Sugar', value: `${v.bloodSugar} mg/dL` } : null,
                  ].filter(Boolean)
                  const bottom = [
                    v.weight ? { label: 'Weight', value: `${v.weight} kg` } : null,
                    v.height ? { label: 'Height', value: `${v.height} cm` } : null,
                    v.bmi ? { label: 'BMI', value: v.bmi } : null,
                  ].filter(Boolean)
                  if (top.length === 0 && bottom.length === 0) {
                    return <p className='text-sm text-white/50'>No vital signs recorded for this checkup.</p>
                  }
                  return (
                    <>
                      {top.length > 0 && (
                        <div className='flex flex-wrap gap-3 mb-3'>
                          {top.map(item => (
                            <div key={item.label} className='bg-white/[0.05] rounded p-3 flex-1 min-w-[130px]'>
                              <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                              <p className='text-sm text-white font-medium'>{item.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {bottom.length > 0 && (
                        <div className='flex flex-wrap gap-3'>
                          {bottom.map(item => (
                            <div key={item.label} className='bg-white/[0.05] rounded p-3 flex-1 min-w-[130px]'>
                              <p className='text-xs text-white/75 mb-1'>{item.label}</p>
                              <p className='text-sm text-white font-medium'>{item.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
            {selectedRecord.category === 'Checkup' && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  Chronic Conditions
                </h3>
                <div className='flex flex-wrap gap-2'>
                  {selectedRecord.conditions && selectedRecord.conditions.length > 0 ? (
                    selectedRecord.conditions.map((c, i) => {
                      let n,
                        s = 'Mild'
                      if (typeof c === 'string') {
                        try {
                          const p = JSON.parse(c)
                          n = p.name || c
                          s = p.severity || 'Mild'
                        } catch {
                          n = c
                        }
                      } else {
                        n = c.name || ''
                        s = c.severity || 'Mild'
                      }
                      const cols = {
                        Critical:
                          'bg-red-500/20 text-red-200 border-red-400/40',
                        Severe:
                          'bg-orange-500/20 text-orange-200 border-orange-400/40',
                        Moderate:
                          'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
                        Mild: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                      }
                      return (
                        <span
                          key={i}
                          className={`px-3 py-1.5 border rounded-full text-sm font-medium ${
                            cols[s] || cols['Mild']
                          }`}
                        >
                          {n} <span className='text-xs opacity-70'>({s})</span>
                        </span>
                      )
                    })
                  ) : (
                    <span className='text-sm text-white/50'>N/A</span>
                  )}
                </div>
              </div>
            )}
            {selectedRecord.category === 'Checkup' && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  Current Medications
                </h3>
                <div className='flex flex-wrap gap-2'>
                  {selectedRecord.medications && selectedRecord.medications.length > 0 ? (
                    selectedRecord.medications.map((m, i) => {
                      let medication = m
                      if (typeof m === 'string') {
                        try { medication = JSON.parse(m) } catch { medication = { name: m } }
                      }
                      const n = medication?.name || String(m)
                      const d = medication?.dosage || ''
                      const f = medication?.frequency || ''
                      return (
                        <div
                          key={i}
                          className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium flex items-center gap-1'
                        >
                          <span className='text-white'>{n}</span>
                          {(d || f) && (
                            <>
                              <span className='text-white/50'>|</span>
                              <span className='text-white/85 text-sm'>
                                {[d, f].filter(Boolean).join(' · ')}
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <span className='text-sm text-white/50'>N/A</span>
                  )}
                </div>
              </div>
            )}
            {selectedRecord.category === 'Checkup' && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-3'>
                  Allergies
                </h3>
                {(() => {
                  const present = ['drugs', 'food', 'environmental'].filter(
                    t => selectedRecord.allergies?.[t]?.length > 0
                  )
                  if (present.length === 0) {
                    return <span className='text-sm text-white/50'>N/A</span>
                  }
                  return (
                    <div className={`grid ${detailGridClass(present.length)} gap-4`}>
                      {present.map(t => (
                        <div key={t}>
                          <h4 className='text-sm text-white/75 mb-2 capitalize'>
                            {t}
                          </h4>
                          <div className='flex flex-wrap gap-1'>
                            {selectedRecord.allergies[t].map((a, i) => (
                              <span
                                key={i}
                                className='px-3 py-1.5 bg-blue-500/20 text-blue-200 border border-blue-400/40 rounded-full text-sm font-medium'
                              >
                                {typeof a === 'string' ? a : a}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
            {isCheckup && !isPlainCheckup && !isPrenatalCheckup && !isPostpartumCheckup && !isGrowthMonitoring && !isSeniorCheckup && !isRefPrenatal && !isRefPostpartum && !isRefInfant && !isRefSenior && !isRefGeneralCheckup && parsed.remarks && (
              <div className='bg-white/[0.03] rounded-lg p-4'>
                <h3 className='text-sm font-semibold text-blue-300 mb-2'>
                  Remarks
                </h3>
                <p className='text-sm text-white/75 whitespace-pre-line'>{parsed.remarks}</p>
              </div>
            )}
          </div>
          )
        })()}
      </Modal>

      {/* Add Medical Record Modal */}
      <Modal
        isOpen={showMedicalModal}
        onClose={() => {
          setShowMedicalModal(false)
          if (completeSchedule) onClose?.()
        }}
        title='Add Medical Record'
        size='lg'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        <form onSubmit={handleAddMedicalHistory} className='space-y-4'>
          <div className='space-y-1.5'>
            <label className='block text-sm font-medium text-blue-200'>
              Type
            </label>
            <GlassSelect
              name='type'
              value={medicalForm.type}
              allowCustom
              onChange={v =>
                handleMedicalTypeChange({ target: { value: v } })
              }
              options={getAllowedRecordTypes().map(t => ({
                value: t,
                label: recordTypeLabels[t] || t,
              }))}
              required
            />
            {getHiddenTypeReasons().length > 0 && (
              <p className='text-xs text-white/50'>
                Not applicable to this resident:{' '}
                {getHiddenTypeReasons().join(' · ')}
              </p>
            )}
          </div>
          {medicalForm.type === 'Referral' ? (
            <div className='medical-record-referral-date-grid grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
              <GlassInput
                label='Referral Date'
                name='encounterDate'
                type='date'
                value={medicalForm.encounterDate}
                onChange={handleMedicalFormChange}
                required
              />
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>
                  Facility Type
                </label>
                <GlassSelect
                  value={medicalForm.facilityType}
                  onChange={v =>
                    handleMedicalFormChange({
                      target: { name: 'facilityType', value: v },
                    })
                  }
                  options={[
                    { value: 'Hospital', label: 'Hospital' },
                    { value: 'Laboratory', label: 'Laboratory' },
                    { value: 'Clinic', label: 'Clinic' },
                    { value: 'Specialist', label: 'Specialist' },
                  ]}
                  placeholder='e.g., Hospital, Laboratory'
                />
              </div>
            </div>
          ) : (
            <div className='medical-record-date-location-grid grid grid-cols-2 gap-3 [&>*]:w-full [&>*]:min-w-0 [&_input]:min-w-0 [&_input]:w-full'>
              <GlassInput
                className='w-full min-w-0'
                label={
                  medicalForm.type === 'Prenatal Checkup'
                    ? 'Visit Date'
                    : medicalForm.type === 'Postpartum Checkup'
                    ? 'Visit Date'
                    : medicalForm.type === 'Growth Monitoring'
                    ? 'Monitoring Date'
                    : medicalForm.type === 'Vaccination'
                    ? 'Vaccination Date'
                    : medicalForm.type === 'Deworming' || medicalForm.type === 'Vitamin Supplementation'
                    ? 'Administration Date'
                    : 'Checkup Date'
                  }
                  name='encounterDate'
                type='date'
                value={medicalForm.encounterDate}
                onChange={handleMedicalFormChange}
                required
              />
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>
                  Service Location
                </label>
                <GlassSelect
                  value={medicalForm.serviceLocation}
                  onChange={v =>
                    handleMedicalFormChange({
                      target: { name: 'serviceLocation', value: v },
                    })
                  }
                  options={
                    isMedType(medicalForm.type)
                      ? [
                          { value: 'Health Center', label: 'Health Center' },
                          { value: 'Home', label: 'Home' },
                          { value: 'Outreach Site', label: 'Outreach Site' },
                          { value: 'Other', label: 'Other' },
                        ]
                      : [
                          { value: 'Health Center', label: 'Health Center' },
                          { value: 'Home', label: 'Home' },
                          { value: 'Other', label: 'Other' },
                        ]
                  }
                  className='w-full'
                  required
                />
              </div>
            </div>
          )}
          {medicalForm.type === 'Referral' && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <GlassInput
                label='Facility Name'
                name='facilityName'
                value={medicalForm.facilityName}
                onChange={handleMedicalFormChange}
                placeholder='Facility name'
              />
              <GlassInput
                label='Facility Location'
                name='facilityLocation'
                value={medicalForm.facilityLocation}
                onChange={handleMedicalFormChange}
                placeholder='Facility address'
              />
            </div>
          )}
          {medicalForm.serviceLocation === 'Other' && (
            <GlassInput
              label='Specify Location'
              name='serviceLocationOther'
              value={medicalForm.serviceLocationOther}
              onChange={handleMedicalFormChange}
              placeholder='Enter service location'
              required
            />
          )}
          {renderHealthWorkerField()}
          {isMedType(medicalForm.type) && (
            <div className='border-t border-white/10 pt-4'>
              <h3 className='text-sm font-medium text-blue-300 mb-3'>
                {medicalForm.type === 'Vaccination'
                  ? 'Vaccination Details'
                  : medicalForm.type === 'Vitamin Supplementation'
                  ? 'Vitamin Details'
                  : 'Deworming Details'}
              </h3>
              <div className='space-y-4'>
                <div className='space-y-1.5'>
                  <label className='block text-sm font-medium text-blue-200'>
                    Select{' '}
                    {medicalForm.type === 'Vaccination'
                      ? 'Vaccine'
                      : medicalForm.type === 'Vitamin Supplementation'
                      ? 'Vitamin'
                      : 'Deworming Medicine'}
                  </label>
                  {medicalForm.type === 'Vaccination' ? (
                    <GlassSelect
                      name='medicine_master_id'
                      value={medicalForm.medicine_master_id}
                      error={medicalErrors.medicine_master_id}
                      allowCustom
                      placeholder='Choose a vaccine...'
                      onChange={v =>
                        handleMedicineMasterChange({ target: { value: resolveMedicineId(v, 'vaccine') } })
                      }
                      options={[
                        ...[...availableSchedules('vaccine')]
                          .sort((a, b) => a.medicine_name?.localeCompare(b.medicine_name))
                          .map(m => ({
                             value: String(m.id),
                             label: vaccineOptionLabel(m),
                             disabled: vaccineOptionDisabled(m),
                          })),
                      ]}
                      required
                    />
                  ) : medicalForm.type === 'Vitamin Supplementation' ? (
                    <GlassSelect
                      name='medicine_master_id'
                      value={medicalForm.medicine_master_id}
                      error={medicalErrors.medicine_master_id}
                      allowCustom
                      placeholder='Choose a vitamin...'
                      onChange={v =>
                        handleMedicineMasterChange({ target: { value: resolveMedicineId(v, 'vitamins') } })
                      }
                      options={[
                        ...[...availableSchedules('vitamins')]
                          .sort((a, b) => a.medicine_name?.localeCompare(b.medicine_name))
                          .map(m => ({
                            value: String(m.id),
                            label: medOptionLabel(m),
                          })),
                      ]}
                      required
                    />
                  ) : (
                    <GlassSelect
                      name='medicine_master_id'
                      value={medicalForm.medicine_master_id}
                      error={medicalErrors.medicine_master_id}
                      allowCustom
                      placeholder='Choose a deworming medicine...'
                      onChange={v =>
                        handleMedicineMasterChange({ target: { value: resolveMedicineId(v, 'deworming') } })
                      }
                      options={[
                        ...[...availableSchedules('deworming')]
                          .sort((a, b) => a.medicine_name?.localeCompare(b.medicine_name))
                          .map(m => ({
                            value: String(m.id),
                             label: medOptionLabel(m),
                          })),
                      ]}
                      required
                    />
                  )}
                  {availableSchedules(
                    medicalForm.type === 'Vaccination' ? 'vaccine'
                      : medicalForm.type === 'Vitamin Supplementation' ? 'vitamins'
                      : 'deworming'
                  ).length === 0 && (
                    <p className='text-xs text-white/50 mt-1'>
                      {emptyScheduleHint(
                        medicalForm.type === 'Vaccination' ? 'vaccine'
                          : medicalForm.type === 'Vitamin Supplementation' ? 'vitamins'
                          : 'deworming',
                        medicalForm.type === 'Vaccination' ? 'vaccines'
                          : medicalForm.type === 'Vitamin Supplementation' ? 'vitamins'
                          : 'deworming medicines'
                      )}
                    </p>
                  )}
                </div>
                {medicalForm.type === 'Deworming' && (
                  <GlassInput
                    label='Dose'
                    name='doseText'
                    value={medicalForm.doseText}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. 400mg single dose'
                  />
                )}
                {medicalForm.type === 'Vitamin Supplementation' && (
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <GlassInput
                      label='Dose'
                      name='doseText'
                      value={medicalForm.doseText}
                      onChange={handleMedicalFormChange}
                      placeholder='e.g. 200,000 IU'
                    />
                    <GlassInput
                      label='Quantity Provided'
                      name='quantityProvided'
                      value={medicalForm.quantityProvided}
                      onChange={handleMedicalFormChange}
                      placeholder='e.g. 2 capsules'
                    />
                  </div>
                )}
                {medicalForm.type === 'Vaccination' && (
                  <div className='grid grid-cols-2 gap-3'>
                    <GlassInput
                      label='Batch/Lot Number'
                      name='batch_number'
                      value={medicalForm.batch_number}
                      onChange={handleMedicalFormChange}
                      placeholder='Optional'
                    />
                    <div className='space-y-1.5'>
                      <label className='block text-sm font-medium text-blue-200'>
                        Site
                      </label>
                      <GlassSelect
                        name='administration_site'
                        value={medicalForm.administration_site}
                        placeholder='Select site'
                        onChange={v =>
                          handleMedicalFormChange({
                            target: { name: 'administration_site', value: v },
                          })
                        }
                        options={[
                          { value: 'Left Arm', label: 'Left Arm' },
                          { value: 'Left Thigh', label: 'Left Thigh' },
                          { value: 'Oral', label: 'Oral' },
                          { value: 'Right Arm', label: 'Right Arm' },
                          { value: 'Right Thigh', label: 'Right Thigh' },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {(medicalForm.type === 'Checkup' ||
            medicalForm.type === 'Senior Checkup' ||
            (medicalForm.type === 'Referral' && isGeneralConcern(medicalForm.referralCategory))) && (
            <>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Checkup Details
                </h3>
                <div className='space-y-4'>
                  <GlassInput
                    label='Reason for Checkup'
                    name='reason'
                    value={medicalForm.reason}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. Routine checkup, follow-up, fever'
                  />
                  <GlassInput
                    label='Symptoms'
                    name='symptoms'
                    type='textarea'
                    value={medicalForm.symptoms}
                    onChange={handleMedicalFormChange}
                    placeholder='Describe symptoms, if any...'
                  />
                </div>
              </div>
              {renderVitalSignsSection(true)}
              {/* Keep the standard Checkup fields together in their fixed order. */}
              {medicalForm.type === 'Checkup' && (
                <>
                  {renderChronicSection()}
                  <GlassInput
                    label='Assessment / Findings'
                    name='assessment'
                    type='textarea'
                    value={medicalForm.assessment}
                    onChange={handleMedicalFormChange}
                    placeholder='Assessment / findings...'
                  />
                  {renderMedicationsSection()}
                  {renderAllergiesSection()}
                  <div className='border-t border-white/10 pt-4'>
                    <GlassInput
                      label='Remarks'
                      name='notes'
                      type='textarea'
                      value={medicalForm.notes}
                      onChange={handleMedicalFormChange}
                      placeholder='Additional remarks...'
                    />
                  </div>
                </>
              )}
            </>
          )}
          {(medicalForm.type === 'Referral' && isPregnancyConcern(medicalForm.referralCategory)) && (
            <div className='border-t border-white/10 pt-4'>
              <h3 className='text-sm font-medium text-blue-300 mb-3'>
                Checkup Type
              </h3>
              <div className='space-y-1.5'>
                <GlassSelect
                  value={medicalForm.referralPregnancyType || 'Prenatal'}
                  allowCustom={false}
                  onChange={v =>
                    handleMedicalFormChange({
                      target: { name: 'referralPregnancyType', value: v || 'Prenatal' },
                    })
                  }
                  options={[
                    { value: 'Prenatal', label: 'Prenatal Checkup' },
                    { value: 'Postpartum', label: 'Postpartum Checkup' },
                  ]}
                />
              </div>
            </div>
          )}
          {(medicalForm.type === 'Prenatal Checkup' ||
            (medicalForm.type === 'Referral' && isPregnancyConcern(medicalForm.referralCategory) && (medicalForm.referralPregnancyType || 'Prenatal') !== 'Postpartum')) && (
            <>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Pregnancy Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <GlassInput
                    label='Last Menstrual Period (LMP)'
                    name='lmp'
                    type='date'
                    value={medicalForm.lmp}
                    onChange={handleMedicalFormChange}
                  />
                  <GlassInput
                    label='Expected Date of Delivery (EDD)'
                    name='edd'
                    type='date'
                    value={medicalForm.edd}
                    onChange={handleMedicalFormChange}
                  />
                  <GlassInput
                    label='Gravida'
                    name='gravida'
                    type='number'
                    inputMode='numeric'
                    min='0'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    value={medicalForm.gravida}
                    onChange={handleMedicalFormChange}
                    placeholder='Total number of pregnancies'
                  />
                  <GlassInput
                    label='Para'
                    name='para'
                    type='number'
                    inputMode='numeric'
                    min='0'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    value={medicalForm.para}
                    onChange={handleMedicalFormChange}
                    placeholder='Pregnancies reaching viable age'
                  />
                </div>
              </div>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Prenatal Check-up
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                  <GlassInput
                    label='Gestational Age'
                    name='gestationalAge'
                    value={medicalForm.gestationalAge}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. 24 weeks'
                  />
                  <GlassInput
                    label="Mother's Weight (kg)"
                    name='motherWeight'
              error={medicalErrors.motherWeight}
                    type='number'
                    min='0.1'
                    max='500'
                    value={medicalForm.motherWeight}
                    onChange={handleMedicalFormChange}
                    placeholder='kg'
                    step='0.1'
                  />
                  <GlassInput
                    label="Mother's Blood Pressure"
                    name='motherBP'
                    type='text'
                    inputMode='numeric'
                    maxLength={7}
                    onKeyDown={blockBloodPressureKeys}
                    value={medicalForm.motherBP}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. 120/80'
                  />
                  <GlassInput
                    label="Mother's Temperature (°C)"
                    name='motherTemp'
              error={medicalErrors.motherTemp}
                    type='number'
                    min='25'
                    max='50'
                    value={medicalForm.motherTemp}
                    onChange={handleMedicalFormChange}
                    placeholder='°C (if measured/indicated)'
                    step='0.1'
                  />
                  <GlassInput
                    label='Fundal Height (cm)'
                    name='fundalHeight'
              error={medicalErrors.fundalHeight}
                    type='number'
                    min='0'
                    value={medicalForm.fundalHeight}
                    onChange={handleMedicalFormChange}
                    placeholder='cm'
                    step='0.1'
                  />
                  <GlassInput
                    label='Fetal Heart Rate (bpm)'
                    name='fetalHeartRate'
              error={medicalErrors.fetalHeartRate}
                    type='number'
                    inputMode='numeric'
                    min='0'
                    max='300'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    value={medicalForm.fetalHeartRate}
                    onChange={handleMedicalFormChange}
                    placeholder='bpm'
                  />
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Fetal Movement
                    </label>
                    <GlassSelect
                      value={medicalForm.fetalMovement}
                      allowCustom={false}
                      allowClear
                      placeholder='Select'
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'fetalMovement', value: v || '' },
                        })
                      }
                      options={[
                        { value: 'Present', label: 'Present' },
                        { value: 'Absent', label: 'Absent' },
                        { value: 'Not Yet Applicable', label: 'Not Yet Applicable' },
                      ]}
                    />
                  </div>
                  <GlassInput
                    label='MUAC (cm)'
                    name='muac'
              error={medicalErrors.muac}
                    type='number'
                    min='0'
                    max='100'
                    value={medicalForm.muac}
                    onChange={handleMedicalFormChange}
                    placeholder='cm — dated automatically to this visit'
                    step='0.1'
                  />
                  <GlassInput
                    label='TD Status'
                    name='tdStatus'
                    value={medicalForm.tdStatus}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. TD3 - 05/14/26'
                  />
                </div>
                <div className='space-y-4 mt-4'>
                  <GlassInput
                    label='Pregnancy-related Signs / Symptoms'
                    name='symptoms'
                    type='textarea'
                    value={medicalForm.symptoms}
                    onChange={handleMedicalFormChange}
                    placeholder='Describe signs/symptoms...'
                  />
                  <GlassInput
                    label='Assessment / Findings'
                    name='assessment'
                    type='textarea'
                    value={medicalForm.assessment}
                    onChange={handleMedicalFormChange}
                    placeholder='Assessment / findings...'
                  />
                </div>
              </div>
              {renderChronicSection()}
            </>
          )}
          {(medicalForm.type === 'Referral' && isPregnancyConcern(medicalForm.referralCategory) && (medicalForm.referralPregnancyType || 'Prenatal') === 'Postpartum') && (
            <>
              {renderPostpartumSection({ includeDangerSigns: true })}
              <div className='space-y-4 mt-4'>
                <GlassInput
                  label='Assessment / Findings'
                  name='assessment'
                  type='textarea'
                  value={medicalForm.assessment}
                  onChange={handleMedicalFormChange}
                  placeholder='Assessment / findings...'
                />
              </div>
              {renderChronicSection()}
            </>
          )}
          {medicalForm.type === 'Postpartum Checkup' && (
            <>
              {renderPostpartumSection({ includeDangerSigns: true })}
              {/* Assessment sits right after Spouse's Name (end of the
                  Civil Registry block above) — Postpartum Checkup only. */}
              <div className='space-y-4 mt-4'>
                <GlassInput
                  label='Assessment / Findings'
                  name='assessment'
                  type='textarea'
                  value={medicalForm.assessment}
                  onChange={handleMedicalFormChange}
                  placeholder='Assessment / findings...'
                />
              </div>
              {renderChronicSection()}
              {renderMedicationsSection()}
              {renderAllergiesSection()}
            </>
          )}
          {(medicalForm.type === 'Growth Monitoring' ||
            (medicalForm.type === 'Referral' && isInfantConcern(medicalForm.referralCategory))) && (
            <>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Basic Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <div className='md:col-span-full'>
                  <GlassInput
                    label='Place of Birth'
                    name='placeOfBirth'
                    value={medicalForm.placeOfBirth}
                    onChange={handleMedicalFormChange}
                    placeholder='e.g. BMIMC, Home'
                  />
                  </div>
                  <GlassInput
                    label='Mothers Name'
                    name='motherName'
                    value={medicalForm.motherName}
                    onChange={handleMedicalFormChange}
                    placeholder="Mother's full name"
                  />
                  <GlassInput
                    label='Fathers Name'
                    name='fatherName'
                    value={medicalForm.fatherName}
                    onChange={handleMedicalFormChange}
                    placeholder="Father's full name"
                  />
                </div>
              </div>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Growth Measurements
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <GlassInput
                    label='Weight (kg)'
                    name='weight'
              error={medicalErrors.weight}
                    type='number'
                    min='0.1'
                    max='500'
                    value={medicalForm.vitalSigns.weight}
                    onChange={handleVitalChange}
                    placeholder='kg'
                    step='0.1'
                  />
                  <GlassInput
                    label='Length (cm)'
                    name='lengthHeight'
              error={medicalErrors.lengthHeight}
                    type='number'
                    min='10'
                    max='300'
                    value={medicalForm.lengthHeight}
                    onChange={handleMedicalFormChange}
                    placeholder='cm'
                    step='0.1'
                  />
                  <div className='md:col-span-full'>
                  <GlassInput
                    label='Head Circumference (cm)'
                    name='headCircumference'
              error={medicalErrors.headCircumference}
                    type='number'
                    min='10'
                    max='100'
                    value={medicalForm.headCircumference}
                    onChange={handleMedicalFormChange}
                    placeholder='cm (when age-appropriate)'
                    step='0.1'
                  />
                  </div>
                </div>
              </div>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Growth / Nutritional Status
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Growth Status
                    </label>
                    <GlassSelect
                      value={medicalForm.growthStatus}
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'growthStatus', value: v },
                        })
                      }
                      placeholder='Select growth status'
                      options={[
                        { value: 'Normal', label: 'Normal' },
                        { value: 'At Risk', label: 'At Risk' },
                        { value: 'Underweight', label: 'Underweight' },
                        { value: 'Overweight', label: 'Overweight' },
                      ]}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Nutritional Status
                    </label>
                    <GlassSelect
                      value={medicalForm.nutritionalStatus}
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'nutritionalStatus', value: v },
                        })
                      }
                      placeholder='Select nutritional status'
                      options={[
                        { value: 'Normal', label: 'Normal' },
                        { value: 'Wasted', label: 'Wasted' },
                        { value: 'Stunted', label: 'Stunted' },
                        { value: 'Underweight', label: 'Underweight' },
                        { value: 'Overweight', label: 'Overweight' },
                        { value: 'Obese', label: 'Obese' },
                      ]}
                    />
                  </div>
                </div>
              </div>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Feeding & Development
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Feeding Status
                    </label>
                    <GlassSelect
                      value={medicalForm.feedingStatus}
                      allowCustom={false}
                      allowClear
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'feedingStatus', value: v || '' },
                        })
                      }
                      placeholder='Select feeding status'
                      options={[
                        { value: 'Exclusive Breastfeeding', label: 'Exclusive Breastfeeding' },
                        { value: 'Breastfeeding with Complementary Food', label: 'Breastfeeding with Complementary Food' },
                        { value: 'Formula', label: 'Formula' },
                        { value: 'Mixed', label: 'Mixed' },
                      ]}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Developmental Concerns
                    </label>
                    <GlassSelect
                      value={medicalForm.developmentalConcerns}
                      allowCustom={false}
                      allowClear
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'developmentalConcerns', value: v || '' },
                        })
                      }
                      placeholder='Select'
                      options={[
                        { value: 'None', label: 'None' },
                        { value: 'Present', label: 'Present' },
                      ]}
                    />
                  </div>
                  <div className='md:col-span-2'>
                    <GlassInput
                      label='Developmental Milestones / Observations'
                      name='developmentalObs'
                      type='textarea'
                      value={medicalForm.developmentalObs}
                      onChange={handleMedicalFormChange}
                      placeholder='Milestones reached, observations...'
                    />
                  </div>
                </div>
                <div className='space-y-4 mt-4'>
                  <GlassInput
                    label='Nutrition / Growth Concerns'
                    name='nutritionConcerns'
                    type='textarea'
                    value={medicalForm.nutritionConcerns}
                    onChange={handleMedicalFormChange}
                    placeholder='Concerns, counseling given...'
                  />
                </div>
              </div>
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Vital Signs
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <GlassInput
                    label='Temperature (°C)'
                    name='temperature'
              error={medicalErrors.temperature}
                    type='number'
                    value={medicalForm.vitalSigns.temperature}
                    onChange={handleVitalChange}
                    placeholder='°C'
                    step='0.1'
                  />
                  <GlassInput
                    label='Heart Rate (bpm)'
                    name='heartRate'
              error={medicalErrors.heartRate}
                    type='number'
                    value={medicalForm.vitalSigns.heartRate}
                    onChange={handleVitalChange}
                    placeholder='bpm'
                  />
                  <div className='md:col-span-full'>
                  <GlassInput
                    label='Respiratory Rate (breaths/min)'
                    name='respiratoryRate'
              error={medicalErrors.respiratoryRate}
                    type='number'
                    inputMode='numeric'
                    min='0'
                    max='200'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    value={medicalForm.respiratoryRate}
                    onChange={handleMedicalFormChange}
                    placeholder='breaths/min'
                  />
                  </div>
                </div>
              </div>
              {(medicalForm.type === 'Growth Monitoring' ||
                (medicalForm.type === 'Referral' && isInfantConcern(medicalForm.referralCategory))) && (
              <div className='border-t border-white/10 pt-4'>
                <h3 className='text-sm font-medium text-blue-300 mb-3'>
                  Vaccination
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  <div className='space-y-1.5 md:col-span-2'>
                    <label className='block text-sm font-medium text-blue-200'>
                      Vaccines given this visit
                    </label>                    {(medicalForm.newVaccines?.length > 0) && (
                      <div className='flex flex-wrap gap-2 mb-1'>
                        {medicalForm.newVaccines.map((v, i) => (
                          <span
                            key={i}
                            className='px-3 py-1.5 border rounded-full text-sm font-medium flex items-center gap-1 bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                          >
                            {growthVaxDisplay(v)}
                            <span className='text-[10px] opacity-70'>
                              {(() => {
                                const s = medicineSchedules.find(m => String(m.id) === String(typeof v === 'string' ? v : v?.name))
                                  || medicineSchedules.find(m => String(m.medicine_name || '').trim().toLowerCase() === String(growthVaxDisplay(v) || '').trim().toLowerCase())
                                return `(Dose ${nextDoseNumber(s)}${s ? ` of ${s.total_doses}` : ''})`
                              })()}
                            </span>
                            <button
                              type='button'
                              onClick={() => removeVaccineFromForm(i)}
                              className='hover:text-red-400 ml-1'
                            >
                              <X className='w-3 h-3' />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className='flex gap-2 items-end'>
                      <div className='flex-1'>
                        <GlassSelect
                          value={tempVaccine.name || ''}
                          allowCustom
                          allowClear
                          placeholder='Choose a vaccine...'
                          onChange={v => setTempVaccine({ name: v || '' })}
                          options={[
                            ...[...availableSchedules('vaccine')]
                              .sort((a, b) => a.medicine_name?.localeCompare(b.medicine_name))
                              .map(m => ({
                                value: String(m.id),
                                 label: vaccineOptionLabel(m),
                                 disabled: vaccineOptionDisabled(m),
                              })),
                          ]}
                        />
                        {availableSchedules('vaccine').length === 0 && (
                          <p className='text-xs text-white/50 mt-1'>
                            {emptyScheduleHint('vaccine', 'vaccines')}
                          </p>
                        )}
                      </div>
                      <GlassButton
                        type='button'
                        variant='secondary'
                        onClick={addVaccineToForm}
                        disabled={!(tempVaccine.name || '').trim()}
                      >
                        Add
                      </GlassButton>
                    </div>
                  </div>
                  <GlassInput
                    label='Lot / Batch Number'
                    name='batch_number'
                    value={medicalForm.batch_number}
                    onChange={handleMedicalFormChange}
                    placeholder='If recorded'
                  />
                  <div>
                    <GlassInput
                      label='Vaccinator'
                      name='growthVaccinator'
                      value={medicalForm.growthVaccinator}
                      onChange={handleMedicalFormChange}
                      placeholder='Name of vaccinator'
                    />
                  </div>
                </div>
              </div>
              )}
              {renderChronicSection()}
            </>
          )}
          {(medicalForm.type === 'Senior Checkup' ||
            (medicalForm.type === 'Referral' && isGeneralConcern(medicalForm.referralCategory))) && (
            <>
              {renderChronicSection()}
              {(medicalForm.type === 'Senior Checkup' ||
                (medicalForm.type === 'Referral' && isGeneralConcern(medicalForm.referralCategory) && Number(resident?.age) >= 60)) && (
                <div className='space-y-1.5 mt-4'>
                  <label className='block text-sm font-medium text-blue-200'>
                    Mobility / Functional Status
                  </label>
                    <GlassSelect
                      value={medicalForm.mobilityStatus}
                      placeholder='Select status'
                      onChange={v =>
                        handleMedicalFormChange({
                          target: { name: 'mobilityStatus', value: v },
                        })
                      }
                      options={[
                        { value: 'Independent', label: 'Independent' },
                      { value: 'Needs Assistance', label: 'Needs Assistance' },
                      { value: 'Dependent', label: 'Dependent' },
                      { value: 'Bedridden', label: 'Bedridden' },
                    ]}
                  />
                </div>
              )}
              <div className='space-y-4 mt-4'>
                <GlassInput
                  label='Assessment / Findings'
                  name='assessment'
                  type='textarea'
                  value={medicalForm.assessment}
                  onChange={handleMedicalFormChange}
                  placeholder='Assessment / findings...'
                />
              </div>
            </>
          )}
          {isCheckupType(medicalForm.type) && medicalForm.type !== 'Checkup' && medicalForm.type !== 'Postpartum Checkup' && (
            <>
              {renderMedicationsSection()}
              {renderAllergiesSection()}
            </>
          )}
          {(medicalForm.type === 'Prenatal Checkup' || medicalForm.type === 'Postpartum Checkup') && (
          <div className='space-y-4 mt-4'>
            <GlassInput
              label='Remarks'
              name='notes'
              type='textarea'
              value={medicalForm.notes}
              onChange={handleMedicalFormChange}
              placeholder='Additional remarks...'
            />
          </div>
          )}
          {medicalForm.type !== 'Checkup' && medicalForm.type !== 'Postpartum Checkup' && medicalForm.type !== 'Prenatal Checkup' && (
          <div className='border-t border-white/10 pt-4'>
            <GlassInput
              label='Remarks'
              name='notes'
              type='textarea'
              value={medicalForm.notes}
              onChange={handleMedicalFormChange}
              placeholder='Additional remarks...'
            />
          </div>
          )}
          <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 pt-4 border-t border-white/10 sm:flex sm:justify-end sm:space-x-3 sm:gap-0'>
            <GlassButton
              className='!w-full min-w-0 sm:!w-auto'
              variant='secondary'
              type='button'
              onClick={() => {
                setShowMedicalModal(false)
                if (completeSchedule) onClose?.()
              }}
            >
              Cancel
            </GlassButton>
            <GlassButton
              className='!w-full min-w-0 sm:!w-auto'
              type='submit'
              icon={Plus}
              loading={saving}
            >
              <span className='sm:hidden'>Add Record</span>
              <span className='hidden sm:inline'>Add Medical Record</span>
            </GlassButton>
          </div>
        </form>
      </Modal>

      {/* Vaccination View Modal */}
      <Modal
        isOpen={showVaccinationModal}
        onClose={() => setShowVaccinationModal(false)}
        title={`Vaccination Record - ${resident?.name}`}
        size='xl'
      >
        <div className='space-y-4'>
          {vaccinationLoading ? (
            <SkeletonVaccinationModal count={3} />
          ) : vaccinationData.length === 0 ? (
            <p className='text-sm text-white/65 text-center py-8'>
              No vaccination data available
            </p>
          ) : (
            paginatedVaccinationData.map(vaccine => (
              <div
                key={vaccine.id}
                className='bg-white/[0.03] rounded-lg p-4 border border-white/5'
              >
                <div className='flex items-center justify-between mb-3'>
                  <div>
                    <h4 className='text-white font-medium'>{vaccine.name}</h4>
                    <div className='flex items-center gap-2 mt-1'>
                      <span className='text-xs text-white/75'>
                        {vaccine.requiredDoses} dose
                        {vaccine.requiredDoses > 1 ? 's' : ''} required
                      </span>
                      <span className='text-xs text-white/65'>·</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          vaccine.status === 'Completed'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : vaccine.status === 'In Progress'
                            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                            : 'bg-gray-500/20 text-gray-300 border border-gray-400/30'
                        }`}
                      >
                        {vaccine.completedDoses}/{vaccine.requiredDoses} ·{' '}
                        {vaccine.status}
                      </span>
                    </div>
                  </div>
                  <div className='w-32'>
                    <div className='w-full bg-white/10 rounded-full h-2'>
                      <div
                        className={`h-2 rounded-full transition-all ${
                          vaccine.status === 'Completed'
                            ? 'bg-emerald-500'
                            : vaccine.status === 'In Progress'
                            ? 'bg-yellow-500'
                            : 'bg-gray-500'
                        }`}
                        style={{
                          width: `${
                            (vaccine.completedDoses / vaccine.requiredDoses) *
                            100
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>
                {(vaccine.targetGroup || vaccine.description) && (
                  <div className='mb-3 text-xs text-white/65'>
                    {vaccine.targetGroup && vaccine.targetGroup !== 'all' && (
                      <span>Target: {vaccine.targetGroup} · </span>
                    )}
                    {vaccine.description && <span>{vaccine.description}</span>}
                  </div>
                )}
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b border-white/10'>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Dose
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Description
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Date Administered
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Batch No.
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Site
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Administered By
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Status
                        </th>
                        <th className='text-left py-2 px-2 text-xs text-white/65 font-medium'>
                          Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaccine.doses.map((dose, i) => (
                        <tr
                          key={i}
                          className='border-b border-white/5 hover:bg-white/[0.02]'
                        >
                          <td className='py-2 px-2 text-white'>
                            Dose {dose.doseNumber}
                          </td>
                          <td className='py-2 px-2 text-white/85'>
                            {getDoseDescription(vaccine.doseIntervals, dose.doseNumber) || (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                          <td className='py-2 px-2 text-white/85'>
                            {dose.dateAdministered ? (
                              formatDate(dose.dateAdministered)
                            ) : (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                          <td className='py-2 px-2 text-white/85'>
                            {dose.batchNumber || (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                          <td className='py-2 px-2 text-white/85'>
                            {dose.administrationSite || (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                          <td className='py-2 px-2 text-white/85'>
                            {dose.administeredBy || (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                          <td className='py-2 px-2'>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                dose.status === 'Taken'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-gray-500/20 text-gray-300'
                              }`}
                            >
                              {dose.status}
                            </span>
                          </td>
                          <td className='py-2 px-2 text-white/75 text-xs'>
                            {dose.remarks || (
                              <span className='text-white/65'>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
          {!vaccinationLoading && vaccinationData.length > 0 && (
            <Pagination
              page={safeVaccinationPage}
              totalPages={totalVaccinationPages}
              onPageChange={setVaccinationPage}
              total={vaccinationData.length}
              perPage={vaccinationPerPage}
            />
          )}
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Resident Profile"
        panelClassName='resident-add-modal'
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <GlassInput label='Full Name *' name='name' error={editErrors.name} value={editForm.name} onChange={e => { setEditForm(p => ({ ...p, name: e.target.value })); clearEditError('name') }} required placeholder='Enter full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Date of Birth *' name='dateOfBirth' error={editErrors.dateOfBirth} type='date' value={editForm.dateOfBirth} onChange={e => {
              const dob = e.target.value
              setEditForm(p => ({ ...p, dateOfBirth: dob }))
              clearEditError('dateOfBirth')
              if (dob) { const a = calculateEditAge(dob); setEditAgeDisplay(a.display) }
            }} required />
            <div className='space-y-1.5'><label className='block text-sm text-blue-200'>Age</label><input type='text' value={editAgeDisplay} readOnly className='glass-input text-white/75 cursor-not-allowed' /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <GlassSelect label='Gender *' name='gender' error={editErrors.gender} value={editForm.gender} onChange={v => { setEditForm(p => ({ ...p, gender: v })); clearEditError('gender') }} required allowCustom placeholder='Select gender' options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }, { value: 'Other', label: 'Other' }]} />
            <GlassSelect label='Civil Status' value={editForm.civilStatus} onChange={v => setEditForm(p => ({ ...p, civilStatus: v }))} options={[{ value: 'Married', label: 'Married' }, { value: 'Separated', label: 'Separated' }, { value: 'Single', label: 'Single' }, { value: 'Widowed', label: 'Widowed' }]} />
          </div>
          <GlassInput label='Contact Number' name='contactNumber' error={editErrors.contactNumber} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={editForm.contactNumber} onChange={e => { setEditForm(p => ({ ...p, contactNumber: sanitizePhoneInput(e.target.value) })); clearEditError('contactNumber') }} placeholder='Enter contact number' />
          {!isBHWWorker && (
            <GlassSelect label='Purok' name='purokId' error={editErrors.purokId} value={editForm.purokId} onChange={v => { setEditForm(p => ({ ...p, purokId: v })); clearEditError('purokId') }} allowCustom allowClear placeholder='Select purok' options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: p.name }))]} />
          )}
          <GlassInput label='Last Checkup' name='lastCheckup' error={editErrors.lastCheckup} type='date' value={editForm.lastCheckup} onChange={e => { setEditForm(p => ({ ...p, lastCheckup: e.target.value })); clearEditError('lastCheckup') }} />
          {(() => { const y = editForm.dateOfBirth ? calculateEditAge(editForm.dateOfBirth).years : null; return y !== null && y >= 0 && y < 5 })() && (
            <div className="grid grid-cols-2 gap-3">
              <GlassInput label="Mother's Name" value={editForm.motherName} onChange={e => setEditForm(p => ({ ...p, motherName: e.target.value }))} placeholder="Enter mother's name" />
              <GlassInput label="Father's Name" value={editForm.fatherName} onChange={e => setEditForm(p => ({ ...p, fatherName: e.target.value }))} placeholder="Enter father's name" />
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-xs text-blue-200 font-medium">Focus Groups</label>
            <div className="grid grid-cols-2 gap-2">
              {editForm.gender !== 'Male' && (
                <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${editForm.focusGroups.includes('pregnant') ? 'bg-pink-500/20 border-pink-400/60 text-pink-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                  <input type="checkbox" checked={editForm.focusGroups.includes('pregnant')} onChange={() => {
                    const fg = editForm.focusGroups.includes('pregnant') ? editForm.focusGroups.filter(g => g !== 'pregnant') : [...editForm.focusGroups, 'pregnant']
                    setEditForm(p => ({ ...p, focusGroups: fg }))
                  }} className="w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50" />
                  <span>Pregnant</span>
                </label>
              )}
              <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${editForm.focusGroups.includes('pwd') ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                <input type="checkbox" checked={editForm.focusGroups.includes('pwd')} onChange={() => {
                  const removing = editForm.focusGroups.includes('pwd')
                  const fg = removing ? editForm.focusGroups.filter(g => g !== 'pwd') : [...editForm.focusGroups, 'pwd']
                  setEditForm(p => ({ ...p, focusGroups: fg, ...(removing ? { disabilityType: '' } : {}) }))
                }} className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50" />
                <span>PWD</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {editForm.focusGroups.includes('pregnant') && <span className="px-3 py-1.5 bg-pink-500/20 text-pink-300 border border-pink-400/40 rounded-full text-xs font-medium">Pregnant</span>}
              {editForm.focusGroups.includes('pwd') && <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded-full text-xs font-medium">PWD</span>}
              {editForm.focusGroups.includes('infant') && <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full text-xs font-medium">Infant (0-59 months)</span>}
              {editForm.focusGroups.includes('senior') && <span className="px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded-full text-xs font-medium">Senior (60+)</span>}
              {editForm.focusGroups.includes('withCondition') && <span className="px-3 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full text-xs font-medium">With Condition</span>}
              {editForm.focusGroups.length === 0 && <span className="text-xs text-white/50">Select groups above</span>}
            </div>
            {editForm.focusGroups.includes('pwd') && (
              <GlassInput label='Specify Disability *' name='disabilityType' error={editErrors.disabilityType} value={editForm.disabilityType} onChange={e => { setEditForm(p => ({ ...p, disabilityType: e.target.value })); clearEditError('disabilityType') }} required placeholder='Enter resident disability' />
            )}
          </div>
          <label className="block text-xs text-blue-200 font-medium mb-2">Emergency Contact</label>
          <div className="grid grid-cols-2 gap-3">
            <GlassInput label='Contact Person' value={editForm.contactPerson} onChange={e => setEditForm(p => ({ ...p, contactPerson: e.target.value }))} placeholder='Name' />
            <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={editForm.contactPersonNumber} onChange={e => setEditForm(p => ({ ...p, contactPersonNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
          </div>
          <GlassInput label='Contact Person Address' value={editForm.contactPersonAddress} onChange={e => setEditForm(p => ({ ...p, contactPersonAddress: e.target.value }))} placeholder='Address' />
          <div className='flex justify-end gap-3'><GlassButton variant='secondary' type='button' onClick={() => setShowEditModal(false)}>Cancel</GlassButton><GlassButton type='submit' loading={editSaving}>Update Profile</GlassButton></div>
        </form>
      </Modal>

      {/* Resident Health Risk Modal */}
      {resident.riskScore != null && (
        <Modal isOpen={showRiskModal} onClose={() => { setShowRiskModal(false); setShowRiskRanges(false) }} title='Resident Health Risk' size='md'>
          <div className='space-y-5'>

            {/* Single grid: risk level, scoring breakdown, contributing factors */}
            <div className='grid grid-cols-1 gap-4'>
              {/* Risk Level */}
              <div ref={riskRangeRef} className={`relative rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${getRiskScoreBg(resident.riskScore)}`}>
                <p className='text-xs text-white/60 uppercase tracking-wider'>Risk Level</p>
                <div className='flex items-center gap-2'>
                  <span className={`badge pl-5 pr-3 py-2 rounded-full text-sm font-semibold border inline-flex items-center gap-2 ${getRiskColor(resident.riskLevel)}`}>
                    {resident.riskLevel}
                    <button
                      type='button'
                      onClick={() => setShowRiskRanges(true)}
                      aria-expanded={showRiskRanges}
                      aria-label='View risk score ranges'
                      title='View risk score ranges'
                      className='shrink-0 flex items-center justify-center text-white/70 hover:text-white transition-colors'
                    >
                      <Eye className='w-4 h-4' />
                    </button>
                  </span>
                </div>

                {/* Risk Score Ranges (absolute popover) */}
                {showRiskRanges && (
                  <div className='glass absolute right-0 top-full mt-2 z-30 w-64 rounded-xl px-3 pt-3 pb-2.5 shadow-2xl bg-slate-900/90 backdrop-blur-[120px]'>
                    <div className='flex items-center justify-between gap-2 mb-1.5'>
                      <p className='text-[11px] text-white/50 uppercase tracking-wider'>Risk Score Ranges</p>
                      <button
                        type='button'
                        onClick={() => setShowRiskRanges(false)}
                        aria-label='Close risk score ranges'
                        title='Close'
                        className='-mr-1 p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors'
                      >
                        <X className='w-3.5 h-3.5' />
                      </button>
                    </div>
                    <div className='space-y-1'>
                      {[
                        { label: 'Low Risk', range: '0 – 24', dot: 'bg-emerald-400' },
                        { label: 'Moderate Risk', range: '25 – 49', dot: 'bg-yellow-400' },
                        { label: 'High Risk', range: '50 – 74', dot: 'bg-orange-400' },
                        { label: 'Critical Risk', range: '75 – 100', dot: 'bg-red-400' }
                      ].map((r) => (
                        <div
                          key={r.label}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${
                            resident.riskLevel === r.label ? 'bg-white/10' : ''
                          }`}
                        >
                          <span className='flex items-center gap-2 text-xs text-white/80'>
                            <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                            {r.label}
                          </span>
                          <span className='text-xs font-semibold text-white/80 tabular-nums'>{r.range}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scoring Breakdown */}
              {resident.riskBreakdown && (
                <div>
                  <div className='space-y-2.5'>
                    {[
                      { label: 'Age', score: resident.riskBreakdown.age?.score ?? 0, max: resident.riskBreakdown.age?.max ?? 15 },
                      { label: 'Chronic Conditions', score: resident.riskBreakdown.chronicConditions?.score ?? 0, max: resident.riskBreakdown.chronicConditions?.max ?? 100 },
                      { label: 'Vital Signs', score: resident.riskBreakdown.vitalSigns?.score ?? 0, max: resident.riskBreakdown.vitalSigns?.max ?? 30 },
                      { label: 'Checkup Adherence', score: resident.riskBreakdown.adherence?.score ?? 0, max: resident.riskBreakdown.adherence?.max ?? 10 }
                    ].map((item) => {
                      const pct = item.max > 0 ? (item.score / item.max) * 100 : 0
                      return (
                        <div key={item.label} className='flex items-center gap-3'>
                          <div className='flex-1 bg-white/5 rounded-lg px-3 py-2.5 border border-white/10 flex items-center gap-3'>
                            <span className='text-xs text-white/70 font-medium w-36 shrink-0'>{item.label}</span>
                            <div className='flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden'>
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct >= 70 ? 'bg-red-400' : pct >= 40 ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className='w-20 shrink-0 bg-white/5 rounded-lg px-3 py-2.5 border border-white/10 flex items-center justify-center'>
                            <span className='text-xs font-semibold text-white/80 tabular-nums text-right'>
                              {item.score}<span className='text-white/40 font-normal'>/{item.max}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {/* Total Risk Score */}
                    <div className='flex items-center justify-end gap-3 pt-2 pb-3.5 border-b border-white/10'>
                      <span className='text-[13px] text-white/70 font-medium whitespace-nowrap'>Total Risk Score:</span>
                      <div className='w-20 shrink-0 flex items-center justify-center'>
                        <span className='text-2xl font-bold text-white tabular-nums leading-none'>{resident.riskScore}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Below: contributing factors full width */}
            {resident.contributingFactors?.length > 0 && (
              <div>
                <h3 className='text-xs font-semibold text-blue-300 mb-2 uppercase tracking-wider'>
                  Contributing Factors
                </h3>
                <div className='flex flex-wrap gap-2'>
                  {resident.contributingFactors.map((factor, i) => (
                    <span
                      key={i}
                      className='px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-white/80'
                    >
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </Modal>
      )}

      <ConfirmModal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} onConfirm={handleConfirm} title="Confirm" message={confirmMessage} confirmText="Confirm" loading={confirmLoading} />
    </div>
  )
}

export default ResidentDetail
