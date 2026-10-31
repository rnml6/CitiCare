// pages/Schedules.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Calendar, Clock, MapPin, User, Plus, Pencil, Trash2, Users,
  Star, Building2, Search, ChevronRight, List, CalendarDays, Check,
  Phone, FileText, Stethoscope, Heart, ChevronDown, Eye, EyeOff,
  X, ArrowLeft, Save, Loader2
} from 'lucide-react'
import { scheduleApi } from '../api/scheduleApi'
import { residentApi } from '../api/residentApi'
import { bhwApi } from '../api/bhwApi'
import { purokApi } from '../api/purokApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import WorkerNamePicker from '../components/WorkerNamePicker'
import CalendarView from '../components/CalendarView'
import { SkeletonSchedulesPage, SkeletonScheduleDetailModal, SkeletonDayModalList } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import ConfirmModal from '../components/ConfirmModal'
import ResidentDetail from './ResidentDetail'
import { formatTime, getStatusColor, formatAge } from '../utils/helpers'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmMutation, confirmUpdate } from '../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys, blockIntegerKeys } from '../utils/validation'

// Individual schedule types mirror the "Type" options in Add Medical Record
// (ResidentDetail recordTypeLabels) so both flows stay in sync.
const presetTypes = [
  { value: 'Checkup', label: 'Checkup' },
  { value: 'Prenatal Checkup', label: 'Prenatal Checkup' },
  { value: 'Postpartum Checkup', label: 'Postpartum Checkup' },
  { value: 'Growth Monitoring', label: 'Infant / Child Growth Monitoring' },
  { value: 'Senior Checkup', label: 'Senior Citizen Checkup' },
  { value: 'Vaccination', label: 'Vaccination' },
  { value: 'Deworming', label: 'Deworming' },
  { value: 'Vitamin Supplementation', label: 'Vitamin Supplementation' },
  { value: 'Referral', label: 'Referral' },
]
// Service Location shown for every individual schedule (not hidden by Type).
const serviceLocations = ['Health Center', 'Home Visit']

// Type eligibility for individual schedules — mirrors Add Medical Record
// rules, tightened per requirement: Prenatal Checkup for pregnant
// residents only, Postpartum Checkup for female residents (mothers) only,
// Growth Monitoring for infants (under 5) only,
// Senior Checkup for seniors (60+) only.
const getAllowedIndividualTypes = (resident) => {
  const all = presetTypes.map(t => t.value)
  if (!resident) return all
  const age = Number(resident.age) || 0
  const groups = resident.focusGroups || []
  const isPregnant = groups.includes('pregnant')
  const isInfant = groups.includes('infant') || age < 5
  const isSenior = groups.includes('senior') || age >= 60
  // Note: 'Referral' (and checkup/medicine types) fall through to
  // `return true` — available for every resident.
  return all.filter(t => {
    if (t === 'Prenatal Checkup') return isPregnant
    if (t === 'Postpartum Checkup') return resident.gender === 'Female'
    if (t === 'Growth Monitoring') return isInfant
    if (t === 'Senior Checkup') return isSenior
    return true
  })
}
const getHiddenIndividualTypeReasons = (resident) => {
  if (!resident) return []
  const allowed = getAllowedIndividualTypes(resident)
  const reasons = []
  if (!allowed.includes('Prenatal Checkup')) reasons.push('Prenatal Checkup (pregnant residents only)')
  if (!allowed.includes('Postpartum Checkup')) reasons.push('Postpartum Checkup (female residents only)')
  if (!allowed.includes('Growth Monitoring')) reasons.push('Growth Monitoring (infants under 5 only)')
  if (!allowed.includes('Senior Checkup')) reasons.push('Senior Checkup (seniors 60+ only)')
  return reasons
}

// Resident age label — shared formatAge ("2y" / "5mo" / "1w").
// < 1 year → "Xmo", otherwise "Xy".
const formatResidentAge = r => formatAge(r?.age, r?.dateOfBirth)
const targetGroups = ['All Residents', 'Adolescents (13-19 years)', 'Adults (20-59 years)', 'Children (6-12 years)', 'Infants (0-5 years)', 'Lactating Mothers', 'Malnourished Children', 'Pregnant Women', 'PWD', 'Senior Citizens (60+)', 'With Diabetes', 'With Hypertension', 'With TB']

const Schedules = () => {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [scopeFilter, setScopeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showDayModal, setShowDayModal] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [page, setPage] = useState(1)
  const perPage = 8
  const [dayModalPage, setDayModalPage] = useState(1)
  const dayModalPerPage = 5
  const navigate = useNavigate()
  const location = useLocation()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const [residents, setResidents] = useState([])
  const [bhws, setBhws] = useState([])
  const [puroks, setPuroks] = useState([])
  const [returnTo, setReturnTo] = useState(null)
  // Extra router state to restore when going back (e.g. reopen the
  // previous page's detail/date modal). Passed via `returnState`.
  const [returnState, setReturnState] = useState(null)
  // Set when the Add modal was opened from another page (Schedule-resident
  // flow) — closing/saving returns there instead of staying on the list.
  const [formReturn, setFormReturn] = useState(null)
  // Schedule id whose Detail modal sits under the Edit modal (stacked) —
  // closing/saving the edit reveals the detail again, refreshed.
  const [editFromDetailId, setEditFromDetailId] = useState(null)

  const navigateBack = (dest, state) => {
    setReturnTo(null)
    setReturnState(null)
    navigate(dest, { state: state || {} })
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedSchedule(null)
    setDetailLoading(false)
    // Close returns to the previous page/modal when opened from elsewhere.
    if (returnTo) {
      navigateBack(returnTo, returnState)
    }
  }

  const openDetailModal = async (schedule) => {
    setSelectedSchedule(schedule)
    setShowDetailModal(true)
    setDetailLoading(true)
    try {
      const res = await scheduleApi.getById(schedule.id)
      if (res.data?.success && res.data?.data) {
        setSelectedSchedule(res.data.data)
      }
    } catch (e) {
      // Keep the basic schedule data if fetch fails
    } finally {
      setDetailLoading(false)
    }
  }

  const [scope, setScope] = useState('individual')
  const [scheduleForm, setScheduleForm] = useState({
    date: '', time: '', type: '', checkupCategory: 'Health Center', status: 'Scheduled',
    duration: 4, purpose: '', additionalInfo: '', locationDescription: '', locationPurok: '',
    contactPerson: '', contactNumber: '', residentContactNumber: '', residentId: '', residentName: '', purokId: '',
    programName: '', programDescription: '', targetGroup: '', targetCount: '', venue: '',
    coordinatorName: '', coordinatorContact: '', partnerOrganization: '', budget: '',
    maxParticipants: '', referralDestinationType: '', referralFacilityName: '', referralFacilityAddress: ''
  })
  const [assignedBhws, setAssignedBhws] = useState([{ bhwId: '', name: '', contactNumber: '' }])
  const [healthcareProfessionals, setHealthcareProfessionals] = useState([{ hcpId: '', name: '', contact: '' }])

  const fetchSchedules = useCallback(async () => {
    try { setLoading(true); const response = await scheduleApi.getAll(); if (response.data.success) { setSchedules(response.data.data); return response.data.data } } catch (error) { console.error('Error:', error) } finally { setLoading(false) }
    return null
  }, [])
  const fetchResidents = useCallback(async () => { try { const r = await residentApi.getAll(); if (r.data.success) setResidents(r.data.data) } catch (e) {} }
  , [])
  const fetchBhws = useCallback(async () => { try { const r = await bhwApi.getAll(); if (r.data.success) setBhws(r.data.data || []) } catch (e) {} }
  , [])
  const fetchPuroks = useCallback(async () => { try { const r = await purokApi.getAll(); if (r.data.success) setPuroks(r.data.data) } catch (e) {} }
  , [])

  useEffect(() => { fetchSchedules(); fetchResidents(); fetchBhws(); fetchPuroks() }, [fetchSchedules, fetchResidents, fetchBhws, fetchPuroks])

  useEffect(() => {
    if (location.state?.viewScheduleId && schedules.length > 0) {
      const schedule = schedules.find(s => String(s.id) === String(location.state.viewScheduleId))
      if (schedule) {
        openDetailModal(schedule)
        if (location.state?.from && location.state.from !== '/schedules') {
          setReturnTo(location.state.from)
          setReturnState(location.state?.returnState || null)
        }
        window.history.replaceState({}, document.title)
      }
    }
    if (location.state?.addScheduleForResident) {
      const r = location.state.addScheduleForResident
      setScope('individual')
      setScheduleForm({
        date: '', time: '', type: '', checkupCategory: 'Health Center', status: 'Scheduled', duration: 4,
        purpose: '', additionalInfo: '', locationDescription: '', locationPurok: r.purok || '',
        contactPerson: r.contactPerson || '', contactNumber: r.contactPersonNumber || '',
        residentContactNumber: r.contactNumber || '', residentId: String(r.id), residentName: r.name || '', purokId: '',
        programName: '', programDescription: '', targetGroup: '', targetCount: '',
        venue: '', coordinatorName: '', coordinatorContact: '', partnerOrganization: '',
        budget: '', maxParticipants: ''
      })
      setAssignedBhws([{ bhwId: '', name: '', contactNumber: '' }])
      setHealthcareProfessionals([{ hcpId: '', name: '', contact: '' }])
      setEditingSchedule(null)
      setEditFromDetailId(null)
      // Remember where the add flow came from so closing/saving returns there.
      if (location.state?.from && location.state.from !== '/schedules') {
        setFormReturn({ to: location.state.from, state: location.state?.returnState || {} })
      } else {
        setFormReturn(null)
      }
      setShowAddModal(true)
      window.history.replaceState({}, document.title)
    }
  }, [location.state, schedules])

  const activeBhws = bhws.filter(b => b.status === 'Active')
  // Tolerant position matching: roster labels may vary ('BHW', case
  // differences). Heads are never assignable here.
  const isHeadPosition = b => String(b.position || '').toLowerCase().includes('head')
  const isBhwPosition = b => {
    const p = String(b.position || '').toLowerCase()
    return !isHeadPosition(b) && (p.includes('health worker') || p === 'bhw')
  }
  const bhwWorkers = activeBhws.filter(isBhwPosition)
  const healthcareProfessionalsList = activeBhws.filter(b => !isBhwPosition(b) && !isHeadPosition(b))

  const filteredSchedules = useMemo(() => {
    let filtered = schedules
    if (scopeFilter !== 'all') filtered = filtered.filter(s => s.scope === scopeFilter)
    if (statusFilter !== 'all') filtered = filtered.filter(s => s.status === statusFilter)
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(s => s.residentName?.toLowerCase().includes(search) || s.type?.toLowerCase().includes(search) || s.programName?.toLowerCase().includes(search) || s.purokName?.toLowerCase().includes(search) || s.purpose?.toLowerCase().includes(search) || s.leadBhwName?.toLowerCase().includes(search))
    }
    return filtered.sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [schedules, scopeFilter, statusFilter, searchTerm])

  // Resident currently picked in the New/Edit individual form and the
  // schedule types they are eligible for (prenatal → pregnant only,
  // growth monitoring → infants only, senior checkup → seniors only).
  const formResident = residents.find(res => String(res.id) === String(scheduleForm.residentId)) || null
  const allowedFormTypes = getAllowedIndividualTypes(formResident)
  const hiddenFormTypeReasons = getHiddenIndividualTypeReasons(formResident)
  const formTypeOptions = presetTypes.filter(t => allowedFormTypes.includes(t.value))
  if (scheduleForm.type && !formTypeOptions.some(t => t.value === scheduleForm.type)) {
    formTypeOptions.push({ value: scheduleForm.type, label: scheduleForm.type })
  }

  // Universal age tiers for the resident on a schedule card: prefer the
  // backend display, else compute from the resident's date of birth.
  const getScheduleResidentAge = (schedule) => {
    if (schedule.residentAgeDisplay) return schedule.residentAgeDisplay
    const r = residents.find(res => String(res.id) === String(schedule.residentId))
    if (r?.dateOfBirth) return formatAge(r.age, r.dateOfBirth)
    if (schedule.residentAge != null) return `${schedule.residentAge}y`
    return null
  }

  const goToPreviousMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)) }
  const goToNextMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)) }
  const goToToday = () => { setCurrentMonth(new Date()) }

  const handleSelectDay = (dateStr, daySchedules) => {
    const list = daySchedules || []
    if (list.length === 0) return
    // Always open the day modal listing all schedules for the date.
    // Clicking a schedule inside the modal goes to Schedule Details.
    setSelectedDate({ dateStr, schedules: list }); setDayModalPage(1); setShowDayModal(true)
  }

  // Derived live from the schedule list (not a snapshot) so actions taken
  // in Schedule Details (complete/cancel/delete) reflect immediately.
  const dayModalSchedules = selectedDate?.dateStr
    ? filteredSchedules.filter(s => s.date && s.date.startsWith(selectedDate.dateStr))
    : []
  const totalDayModalPages = Math.max(1, Math.ceil(dayModalSchedules.length / dayModalPerPage))
  const safeDayModalPage = Math.min(Math.max(1, dayModalPage), totalDayModalPages)
  const paginatedDayModalSchedules = dayModalSchedules.slice(
    (safeDayModalPage - 1) * dayModalPerPage,
    safeDayModalPage * dayModalPerPage
  )
  const dayModalTitle = selectedDate?.dateStr
    ? `Schedules for ${new Date(`${selectedDate.dateStr}T00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : ''

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    setDeleteTargetId(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try {
      await scheduleApi.delete(deleteTargetId)
      setSchedules(prev => prev.filter(s => s.id !== deleteTargetId))
      setShowDetailModal(false)
      setSelectedSchedule(null)
      dialog.toast('Schedule deleted.', 'success')
      if (returnTo) {
        navigateBack(returnTo, returnState)
      }
    } catch (error) {
      console.error('Error:', error)
      dialog.error(error.response?.data?.message || 'Failed to delete schedule', 'Unable to delete schedule')
    } finally {
      setShowDeleteConfirm(false)
      setDeleteTargetId(null)
    }
  }

  const handleMarkComplete = async () => {
    const confirmed = await confirmMutation({
      title: 'Complete schedule?',
      message: 'Please confirm that you want to mark this schedule as completed.',
      confirmText: 'Mark completed',
    })
    if (!confirmed) return
    try {
      await scheduleApi.update(selectedSchedule.id, { status: 'Completed' })
      setSchedules(prev => prev.map(s => s.id === selectedSchedule.id ? { ...s, status: 'Completed' } : s))
      setSelectedSchedule(prev => ({ ...prev, status: 'Completed' }))
      dialog.toast('Schedule marked as completed.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to update schedule', 'Unable to update schedule')
    }
  }

  // Complete-flow for individual schedules: open the resident's Add Medical
  // Record prefilled with Schedule Details info. The schedule is marked
  // Completed only after the medical record saves successfully.
  const [showCompleteFlow, setShowCompleteFlow] = useState(false)

  const buildCompletePrefill = (s) => {
    if (!s) return null
    const dateStr = String(s.date || '').slice(0, 10)
    return {
      scheduleId: s.id,
      residentId: s.residentId,
      type: s.type === 'General Checkup' ? 'Checkup' : (s.type || 'Checkup'),
      encounterDate: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date().toISOString().split('T')[0],
      serviceLocation: s.checkupCategory || s.serviceCategory || 'Health Center',
      reason: s.purpose || '',
      notes: s.additionalInfo || s.notes || '',
      // One BHW (the lead assigned worker) goes to the record's Health
      // Worker field; falls back to a healthcare professional if no BHW.
      administeredBy: s.assignedBhws?.find(b => b.name)?.name || s.healthcareProfessionals?.find(h => h.name)?.name || '',
      referralCategory: 'General Concern',
      facilityType: s.referralDestinationType || '',
      facilityName: s.referralFacilityName || '',
      facilityLocation: s.referralFacilityAddress || ''
    }
  }

  const handleCompleteClick = () => {
    if (!selectedSchedule) return
    if (selectedSchedule.scope === 'individual') {
      // Individual schedules can only complete via a successful Add Medical
      // Record — never directly, even if the resident link is missing.
      if (!selectedSchedule.residentId) {
        dialog.error('This individual schedule has no linked resident. Please edit the schedule to link a resident first.', 'Resident required')
        return
      }
      setShowCompleteFlow(true)
    } else {
      handleMarkComplete()
    }
  }

  const handleScheduleCompleted = async (scheduleId) => {
    setShowCompleteFlow(false)
    const fresh = await fetchSchedules()
    if (fresh) {
      const updated = fresh.find(s => String(s.id) === String(scheduleId))
      if (updated) setSelectedSchedule(updated)
    } else {
      setSchedules(prev => prev.map(s => String(s.id) === String(scheduleId) ? { ...s, status: 'Completed' } : s))
      setSelectedSchedule(prev => (prev && String(prev.id) === String(scheduleId) ? { ...prev, status: 'Completed' } : prev))
    }
  }

  const handleCancelSchedule = async () => {
    const confirmed = await confirmMutation({
      title: 'Cancel schedule?',
      message: 'Please confirm that you want to cancel this schedule.',
      confirmText: 'Cancel schedule',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await scheduleApi.update(selectedSchedule.id, { status: 'Cancelled' })
      setSchedules(prev => prev.map(s => s.id === selectedSchedule.id ? { ...s, status: 'Cancelled' } : s))
      setSelectedSchedule(prev => ({ ...prev, status: 'Cancelled' }))
      dialog.toast('Schedule cancelled.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to update schedule', 'Unable to update schedule')
    }
  }

  const openAddModal = () => {
    setScope('individual')
    setScheduleForm({ date: '', time: '', type: '', checkupCategory: 'Health Center', status: 'Scheduled', duration: 4, purpose: '', additionalInfo: '', locationDescription: '', locationPurok: '', contactPerson: '', contactNumber: '', residentContactNumber: '', residentId: '', residentName: '', purokId: '', programName: '', programDescription: '', targetGroup: '', targetCount: '', venue: '', coordinatorName: '', coordinatorContact: '', partnerOrganization: '', budget: '', maxParticipants: '', referralDestinationType: '', referralFacilityName: '', referralFacilityAddress: '' })
    setAssignedBhws([{ bhwId: '', name: '', contactNumber: '' }])
    setHealthcareProfessionals([{ hcpId: '', name: '', contact: '' }])
    setEditingSchedule(null)
    setShowAddModal(true)
  }

  const openEditModal = (s, opts = {}) => {
    setScope(s.scope || 'individual')
    setScheduleForm({
      date: s.date || '', time: s.time || '', type: s.type || '', checkupCategory: s.checkupCategory || s.serviceCategory || 'Health Center', status: s.status || 'Scheduled',
      duration: (s.scope || 'individual') === 'individual' ? 30 : (s.duration ? Math.round(s.duration / 60) : 4), purpose: s.purpose || s.programDescription || '', additionalInfo: s.additionalInfo || s.notes || '',
      locationDescription: s.locationDescription || s.locationDetails || '', locationPurok: s.locationPurok || s.purokName || s.puroks?.name || '',
      contactPerson: s.contactPerson || '', contactNumber: s.contactNumber || '', residentContactNumber: s.residentContactNumber || s.residentContact || s.resident?.contactNumber || '', residentId: s.residentId || '', residentName: s.residentName || '', purokId: s.purokId || '',
      programName: s.programName || '', programDescription: s.programDescription || s.purpose || '', targetGroup: s.targetGroup || '', targetCount: s.targetCount || '',
      venue: s.venue || '', coordinatorName: s.coordinatorName || '', coordinatorContact: s.coordinatorContact || '', partnerOrganization: s.partnerOrganization || '',
       budget: s.budget || '', maxParticipants: s.maxParticipants || '', referralDestinationType: s.referralDestinationType || '', referralFacilityName: s.referralFacilityName || '', referralFacilityAddress: s.referralFacilityAddress || ''
    })
    // Always show at least one editable row per section, even when the
    // saved lists are empty (empty arrays are truthy and would render nothing).
    setAssignedBhws(s.assignedBhws?.length ? s.assignedBhws : [{ bhwId: '', name: '', contactNumber: '' }])
    setHealthcareProfessionals(s.healthcareProfessionals?.length ? s.healthcareProfessionals : [{ hcpId: '', name: '', contact: '' }])
    setEditingSchedule(s)
    // Stacked over the Detail modal when opened from there — closing the
    // edit reveals the (refreshed) detail again.
    setEditFromDetailId(opts.fromDetail ? s.id : null)
    setShowEditModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false); setShowEditModal(false); setEditingSchedule(null); setEditFromDetailId(null)
    // Close returns to the previous page/modal when the Add flow came from elsewhere.
    if (formReturn) {
      const dest = formReturn
      setFormReturn(null)
      navigate(dest.to, { state: dest.state })
    }
  }

  // Reschedule a Missed/Cancelled schedule: edit flow, status reset to Scheduled
  const openRescheduleModal = (s) => {
    setShowDetailModal(false)
    openEditModal(s)
    setScheduleForm(prev => ({ ...prev, status: 'Scheduled' }))
  }

  // Schedule Again from a Completed schedule: new schedule prefilled from the old one
  const openScheduleAgainModal = (s) => {
    setShowDetailModal(false)
    openEditModal(s)
    setEditingSchedule(null)
    setScheduleForm(prev => ({ ...prev, date: '', time: '', status: 'Scheduled' }))
    setShowEditModal(false)
    setShowAddModal(true)
  }

  // Open edit modal when navigated here with editScheduleId (Purok flows) - modal only, no form page
  // Locked statuses can only go through Reschedule / Schedule Again.
  useEffect(() => {
    if (location.state?.editScheduleId && schedules.length > 0) {
      const schedule = schedules.find(s => String(s.id) === String(location.state.editScheduleId))
      if (schedule && schedule.status === 'Scheduled') {
        openEditModal(schedule)
        if (location.state?.from && location.state.from !== '/schedules') {
          setReturnTo(location.state.from)
          setReturnState(location.state?.returnState || null)
          setFormReturn({ to: location.state.from, state: location.state?.returnState || {} })
        }
        window.history.replaceState({}, document.title)
      } else if (schedule) {
        window.history.replaceState({}, document.title)
      }
    }
  }, [location.state, schedules])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!scheduleForm.date || !scheduleForm.time) { dialog.error('Please fill in date and time.', 'Validation error'); return }
    if (scope === 'individual' && !scheduleForm.residentId) { dialog.error('Please select a resident.', 'Validation error'); return }
    // Typed input is accepted everywhere, but record pickers still need a
    // real resident/purok at save time.
    if (scope === 'individual' && !residents.some(res => String(res.id) === String(scheduleForm.residentId))) { dialog.error('Please select a valid resident from the list.', 'Validation error'); return }
    if (scope === 'purok' && scheduleForm.purokId && !puroks.some(p => String(p.id) === String(scheduleForm.purokId))) { dialog.error('Please select a valid purok from the list.', 'Validation error'); return }
    if (scope === 'individual' && scheduleForm.type) {
      const r = residents.find(res => String(res.id) === String(scheduleForm.residentId))
      const unchangedLegacy = editingSchedule && editingSchedule.type === scheduleForm.type
      if (!getAllowedIndividualTypes(r).includes(scheduleForm.type) && !unchangedLegacy) {
        dialog.error(`${scheduleForm.type} is not applicable to this resident.`, 'Validation error')
        return
      }
    }
    if ((scope === 'purok' || scope === 'barangay') && !scheduleForm.programName) { dialog.error('Please enter a program name.', 'Validation error'); return }
    // Locked statuses cannot be edited directly (use Reschedule / Schedule Again).
    // Reschedule always flips the form status back to Scheduled, so it passes.
    if (editingSchedule && ['Completed', 'Missed', 'Cancelled'].includes(editingSchedule.status) && scheduleForm.status !== 'Scheduled') {
      dialog.error('Completed, missed, or cancelled schedules cannot be edited. Use Reschedule or Schedule Again instead.', 'Schedule is locked')
      setSaving(false)
      return
    }
    const validBhws = assignedBhws.filter(b => b.name && b.name.trim() !== '')
    if (validBhws.length === 0) { dialog.error('Please assign at least one BHW.', 'Validation error'); return }
    // Block conflicted workers: anyone with an overlapping schedule on the
    // chosen date/time (within duration) cannot be assigned.
    const conflictedBhws = validBhws.filter(b => b.bhwId && getConflictSchedule(b.bhwId))
    const conflictedHcps = healthcareProfessionals.filter(h => h.name && h.name.trim() !== '' && h.hcpId && getConflictSchedule(h.hcpId))
    if (conflictedBhws.length > 0 || conflictedHcps.length > 0) {
      const bhwMsg = conflictedBhws.map(b => `${b.name} — ${workerConflictNote(b.bhwId)}`).join('\n')
      const hcpMsg = conflictedHcps.map(h => `${h.name} — ${workerConflictNote(h.hcpId)}`).join('\n')
      dialog.error(`These health workers already have a schedule at ${scheduleForm.date} ${scheduleForm.time} (within duration):\n\n${[bhwMsg, hcpMsg].filter(Boolean).join('\n')}\n\nPlease remove them or pick a different date/time.`, 'Schedule conflict')
      return
    }
    const confirmed = editingSchedule
      ? await confirmUpdate('schedule', 'Please confirm that you want to save the changes to this schedule.')
      : await confirmCreate('schedule', 'Please confirm that you want to create this schedule.')
    if (!confirmed) return
    setSaving(true)
    try {
      const validHcps = healthcareProfessionals.filter(h => h.name && h.name.trim() !== '')
      const dataToSend = {
        scope, date: scheduleForm.date, time: scheduleForm.time,
        type: scheduleForm.type || (scope === 'individual' ? 'Checkup' : 'Program'),
        checkupCategory: scheduleForm.type === 'Referral' ? '' : (scheduleForm.checkupCategory || ''),
        status: scheduleForm.status,
        // Individual visits are fixed 30-minute slots; only programs use the hours input.
        duration: scope === 'individual' ? 30 : (parseInt(scheduleForm.duration) * 60 || 240),
        purpose: scheduleForm.purpose || scheduleForm.programDescription || '',
        notes: scheduleForm.additionalInfo || '',
        locationDetails: scheduleForm.locationDescription || '',
        contactPerson: scheduleForm.contactPerson || '',
        contactNumber: scheduleForm.contactNumber || '',
        residentContactNumber: scheduleForm.residentContactNumber || '',
        residentId: scope === 'individual' ? scheduleForm.residentId || null : null,
        purokId: scope === 'purok' ? scheduleForm.purokId || null : null,
        isBarangayWide: scope === 'barangay',
        programName: scheduleForm.programName || '',
        programDescription: scheduleForm.programDescription || '',
        targetGroup: scheduleForm.targetGroup || '',
        targetCount: scheduleForm.targetCount || null,
        venue: scheduleForm.venue || '',
        coordinatorName: scheduleForm.coordinatorName || '',
        coordinatorContact: scheduleForm.coordinatorContact || '',
        partnerOrganization: scheduleForm.partnerOrganization || '',
        maxParticipants: scheduleForm.maxParticipants || null,
        locationPurok: scheduleForm.locationPurok || '',
        referralDestinationType: scheduleForm.referralDestinationType || '',
        referralFacilityName: scheduleForm.referralFacilityName || '',
        referralFacilityAddress: scheduleForm.referralFacilityAddress || '',
        assignedBhws: validBhws.map(b => ({ bhwId: b.bhwId, id: b.bhwId, name: b.name, contactNumber: b.contactNumber, customName: (b.name || '').trim() })),
        healthcareProfessionals: validHcps.map(h => ({ hcpId: h.hcpId, id: h.hcpId, name: h.name, contact: h.contact, customName: h.hcpId ? undefined : (h.name || '').trim() }))
      }
      const response = editingSchedule
        ? await scheduleApi.update(editingSchedule.id, dataToSend)
        : await scheduleApi.create(dataToSend);
      if (response.data?.warnings?.length) dialog.info(response.data.warnings.join('\n'), 'Schedule saved with notes');
      // Id of the saved schedule (edited or newly created).
      const savedId = editingSchedule
        ? editingSchedule.id
        : response.data?.data?.schedule_id || response.data?.data?.id;
      const detailId = editFromDetailId;
      closeModal();
      dialog.toast(editingSchedule ? 'Schedule updated successfully.' : 'Schedule created successfully.', 'success');
      const fresh = await fetchSchedules();
      // Bring the saved schedule into view. Records are listed
      // chronologically, so a newly created schedule sits on the last pages;
      // jumping to its page means "created successfully" is actually visible
      // instead of silently staying on page 1.
      if (fresh && savedId != null && !hasActiveFilters) {
        const sorted = [...fresh].sort((a, b) => new Date(a.date) - new Date(b.date));
        const index = sorted.findIndex(s => String(s.id) === String(savedId));
        if (index >= 0) setPage(Math.floor(index / perPage) + 1);
      }
      // Refresh the Detail modal (when open) showing the saved schedule
      // with freshly fetched data, so worker changes appear immediately.
      // Never force-opens it: creates/edits from the list stay on the list.
      if (fresh && showDetailModal && selectedSchedule) {
        const targetId = detailId || savedId || selectedSchedule.id;
        const updated = targetId ? fresh.find(s => String(s.id) === String(targetId)) : null;
        if (updated) setSelectedSchedule(updated);
      }
    } catch (error) { dialog.error(error.response?.data?.message || 'Failed to save schedule', 'Unable to save schedule') }
    finally { setSaving(false) }
  }

  const handleAddBHW = () => { setAssignedBhws([...assignedBhws, { bhwId: '', name: '', contactNumber: '' }]) }
  const handleRemoveBHW = (index) => { setAssignedBhws(assignedBhws.filter((_, i) => i !== index)) }
  const handleAddHCP = () => { setHealthcareProfessionals([...healthcareProfessionals, { hcpId: '', name: '', contact: '' }]) }
  const handleRemoveHCP = (index) => { setHealthcareProfessionals(healthcareProfessionals.filter((_, i) => i !== index)) }

  // Picker commit: `item` is the matched roster entry (or null), `text` the raw
  // typed value. Exact roster name links the id + autofills contact; anything
  // else is kept as a custom typed name.
  const handleHCPPick = (idx, item, text) => {
    const updated = [...healthcareProfessionals]
    updated[idx] = item
      ? { hcpId: String(item.id), name: item.name, contact: updated[idx].contact || item.contactNumber || '' }
      : { hcpId: '', name: text, contact: updated[idx].contact }
    setHealthcareProfessionals(updated)
  }
  const handleBHWPick = (idx, item, text) => {
    const updated = [...assignedBhws]
    updated[idx] = item
      ? { bhwId: String(item.id), name: item.name, contactNumber: updated[idx].contactNumber || item.contactNumber || '' }
      : { bhwId: '', name: text, contactNumber: updated[idx].contactNumber }
    setAssignedBhws(updated)
  }
  // Conflict check: a worker's existing schedule on the chosen date that
  // overlaps the new schedule's time window (either direction). Used both
  // for the dropdown reminder and to block saving with conflicted workers.
  const timeToMinutes = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
  const getConflictSchedule = (workerId) => {
    if (!workerId || !scheduleForm.date || !scheduleForm.time) return null
    const newStart = timeToMinutes(scheduleForm.time)
    if (newStart == null) return null
    const newDur = (scope === 'purok' || scope === 'barangay') ? (parseInt(scheduleForm.duration) || 4) * 60 : 30
    return schedules.find(s => {
      if (s.status !== 'Scheduled' || String(s.date || '').slice(0, 10) !== scheduleForm.date) return false
      if (editingSchedule && String(s.id) === String(editingSchedule.id)) return false
      const ids = new Set()
      if (s.leadBhwId) ids.add(String(s.leadBhwId))
      ;(s.assignedBhws || []).forEach(b => { if (b.bhwId) ids.add(String(b.bhwId)) })
      ;(s.healthcareProfessionals || []).forEach(h => { if (h.hcpId) ids.add(String(h.hcpId)) })
      if (!ids.has(String(workerId))) return false
      const start = timeToMinutes(s.time)
      if (start == null) return false
      const dur = s.duration || 30
      return !(newStart >= start + dur || start >= newStart + newDur)
    }) || null
  }
  const workerConflictNote = (workerId) => {
    const c = getConflictSchedule(workerId)
    if (!c) return null
    const durText = (c.scope === 'purok' || c.scope === 'barangay') && c.duration ? ` (${formatDuration(c.duration)})` : ''
    return `Has schedule ${formatTime(c.time)}${durText}`
  }
  const hcpSuggestions = (idx) => healthcareProfessionalsList.filter(h => !healthcareProfessionals.some((ah, ai) => ai !== idx && String(ah.hcpId) === String(h.id))).map(h => ({ ...h, note: workerConflictNote(h.id) }))
  const bhwSuggestions = (idx) => bhwWorkers.filter(b => !assignedBhws.some((ab, ai) => ai !== idx && String(ab.bhwId) === String(b.id))).map(b => ({ ...b, note: workerConflictNote(b.id) }))

  const hasActiveFilters = scopeFilter !== 'all' || statusFilter !== 'all' || searchTerm !== ''
  const clearFilters = () => { setScopeFilter('all'); setStatusFilter('all'); setSearchTerm('') }

  useEffect(() => { setPage(1) }, [searchTerm, scopeFilter, statusFilter, viewMode])

  const totalPages = Math.ceil(filteredSchedules.length / perPage)
  const paginatedSchedules = hasActiveFilters ? filteredSchedules : filteredSchedules.slice((page - 1) * perPage, page * perPage)

  const getScopeIcon = scope => { switch (scope) { case 'individual': return <User className='w-4 h-4' />; case 'purok': return <MapPin className='w-4 h-4' />; case 'barangay': return <Building2 className='w-4 h-4' />; default: return <User className='w-4 h-4' /> } }
  const getScopeColor = scope => { switch (scope) { case 'individual': return 'bg-blue-500/20 text-blue-300 border-blue-400/30'; case 'purok': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'; case 'barangay': return 'bg-purple-500/20 text-purple-300 border-purple-400/30'; default: return 'bg-blue-500/20 text-blue-300 border-blue-400/30' } }
  const getScopeLabel = scope => { switch (scope) { case 'individual': return 'Individual'; case 'purok': return 'Purok'; case 'barangay': return 'Barangay'; default: return 'Individual' } }
  const formatDuration = minutes => { if (!minutes) return ''; if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const remainingMinutes = minutes % 60; if (remainingMinutes === 0) return `${hours} hr${hours > 1 ? 's' : ''}`; return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMinutes} min` }

  if (loading) return <SkeletonSchedulesPage count={5} view={viewMode} />

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>Schedules</h1>
          <p className='text-sm text-white/75'>{filteredSchedules.length} schedule{filteredSchedules.length !== 1 ? 's' : ''}{hasActiveFilters && ' (filtered)'}</p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} title='New Schedule' onClick={openAddModal}>
          <span className='hidden sm:inline'>New Schedule</span>
        </GlassButton>
      </div>

      <div className='space-y-3'>
        <div className='flex items-end gap-2 sm:block'>
          <div className='min-w-0 flex-1 sm:w-full'>
            <GlassInput className='h-[42px] sm:h-auto' icon={Search} placeholder='Search by resident, program, type, purok, or BHW...' value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className='flex h-[42px] self-stretch shrink-0 bg-white/10 rounded-lg p-0.5 border border-white/20 sm:hidden'>
            <button aria-label='List view' title='List view' onClick={() => setViewMode('list')} className={`px-2.5 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><List className='w-5 h-5' /></button>
            <button aria-label='Calendar view' title='Calendar view' onClick={() => setViewMode('calendar')} className={`px-2.5 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center ${viewMode === 'calendar' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><CalendarDays className='w-5 h-5' /></button>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
          <div className='flex w-full gap-2 sm:hidden'>
            <GlassSelect aria-label='Filter by scope' value={scopeFilter} onChange={setScopeFilter} allowCustom={false} size='sm' className='flex-1 min-w-0' options={[{ value: 'all', label: 'All Scopes' }, { value: 'barangay', label: 'Barangay' }, { value: 'individual', label: 'Individual' }, { value: 'purok', label: 'Purok' }]} />
            <GlassSelect aria-label='Filter by status' value={statusFilter} onChange={setStatusFilter} allowCustom={false} size='sm' className='flex-1 min-w-0' options={[{ value: 'all', label: 'All Statuses' }, { value: 'Cancelled', label: 'Cancelled' }, { value: 'Completed', label: 'Completed' }, { value: 'Missed', label: 'Missed' }, { value: 'Scheduled', label: 'Scheduled' }]} />
          </div>
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/85 py-1.5 sm:py-2 mr-0.5 sm:mr-1 font-semibold'>Scope:</span>
          {['all', 'barangay', 'individual', 'purok'].map(f => (
            <button key={f} onClick={() => setScopeFilter(f)} className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all items-center gap-1 sm:gap-1.5 ${scopeFilter === f ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40' : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'}`}>{f !== 'all' && getScopeIcon(f)}{f === 'all' ? 'All Scopes' : getScopeLabel(f)}</button>
          ))}
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/85 py-1.5 sm:py-2 mr-0.5 sm:mr-1 ml-2 sm:ml-3 font-semibold'>Status:</span>
          {['all', 'Cancelled', 'Completed', 'Missed', 'Scheduled'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} className={`hidden sm:block px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${statusFilter === f ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40' : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'}`}>{f === 'all' ? 'All' : f}</button>
          ))}
          <div className='hidden sm:flex bg-white/10 rounded-lg p-0.5 border border-white/20'>
            <button onClick={() => setViewMode('list')} className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><List className='w-4 h-4' />List</button>
            <button onClick={() => setViewMode('calendar')} className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'calendar' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><CalendarDays className='w-4 h-4' />Calendar</button>
          </div>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <GlassCard hover={false}>
          <CalendarView month={currentMonth.getMonth()} year={currentMonth.getFullYear()} onPrevMonth={goToPreviousMonth} onNextMonth={goToNextMonth} onToday={goToToday} getSchedulesForDate={dateStr => filteredSchedules.filter(s => s.date && s.date.startsWith(dateStr))} onSelectDay={handleSelectDay} onSelectSchedule={schedule => openDetailModal(schedule)} showToday={false} />
        </GlassCard>
      )}

      {viewMode === 'list' && (
        <>
          {filteredSchedules.length > 0 ? (
            <div className='space-y-4'>
              {paginatedSchedules.map(schedule => (
                <GlassCard key={schedule.id} className='!px-2 sm:!px-6' onClick={() => openDetailModal(schedule)}>
                  <div className='flex flex-row items-start lg:flex-row lg:items-center justify-between gap-2 lg:gap-4'>
                    <div className='flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1'>
                      <div className='hidden lg:block text-center min-w-[65px]'>
                        <p className='text-2xl font-bold text-white'>{new Date(schedule.date).getDate()}</p>
                        <p className='text-sm text-blue-300'>{new Date(schedule.date).toLocaleString('default', { month: 'short' })}</p>
                        <p className='text-xs text-white/65'>{new Date(schedule.date).getFullYear()}</p>
                      </div>
                      <div className='h-16 w-px bg-white/10 hidden lg:block' />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2 flex-wrap mb-2'>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${getScopeColor(schedule.scope)}`}>{getScopeIcon(schedule.scope)}{getScopeLabel(schedule.scope)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(schedule.status)}`}>{schedule.status}</span>
                        </div>
                        <h3 className='text-white font-medium text-base sm:text-lg mb-1.5 min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] lg:truncate'>{schedule.scope === 'individual' ? schedule.residentName || 'Unknown Resident' : schedule.programName || `${schedule.type} Program`}</h3>
                        <div className='flex min-w-0 max-w-full flex-wrap items-center gap-3 text-sm text-white/75 [&>*]:whitespace-normal [&>*]:break-words [&>*]:[overflow-wrap:anywhere] lg:[&>*]:whitespace-nowrap'>
                          <span className='flex items-center gap-1.5 text-xs text-white/65 lg:hidden'><Calendar className='h-3.5 w-3.5 text-blue-300' /><span>{new Date(schedule.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                          <span className='flex items-center space-x-1'><Clock className='w-4 h-4' /><span>{formatTime(schedule.time)}</span>{schedule.scope !== 'individual' && <span className='text-white/65'>({formatDuration(schedule.duration)})</span>}</span>
                          <span className='px-2 py-0.5 rounded bg-white/5 text-xs'>{schedule.type}</span>
                          {schedule.scope === 'individual' && getScheduleResidentAge(schedule) && <span>{getScheduleResidentAge(schedule)}, {schedule.residentGender}</span>}
                          {schedule.scope === 'purok' && schedule.purokName && <span className='flex items-center space-x-1'><MapPin className='w-3.5 h-3.5' /><span>{schedule.purokName}</span></span>}
                          {schedule.scope === 'barangay' && <span className='flex items-center space-x-1'><Building2 className='w-3.5 h-3.5' /><span>Whole Barangay</span></span>}
                          {(schedule.scope === 'purok' || schedule.scope === 'barangay') && schedule.participantCount > 0 && <span className='flex items-center space-x-1'><Users className='w-3.5 h-3.5' /><span>{schedule.participantCount} participants</span></span>}
                        </div>
                      </div>
                    </div>
                    <div className='flex shrink-0 items-center space-x-2'>
                         <div className='flex space-x-1' onClick={e => e.stopPropagation()}>
                          {schedule.status === 'Scheduled' && (
                            <button onClick={() => { setShowDetailModal(false); openEditModal(schedule) }} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400 transition-colors' title='Edit Schedule'><Pencil className='w-4 h-4' /></button>
                          )}
                        <button onClick={e => handleDelete(schedule.id, e)} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400 transition-colors' title='Delete Schedule'><Trash2 className='w-4 h-4' /></button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard hover={false} className='text-center py-12'>
              <Calendar className='w-16 h-16 text-white/50 mx-auto mb-4' />
              <p className='text-white/65 text-sm mb-2'>No schedules found</p>
            </GlassCard>
          )}
          {!hasActiveFilters && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={filteredSchedules.length} perPage={perPage} hidePageIndicatorOnMobile />}
        </>
      )}

      {/* Add Schedule Modal */}
      <Modal isOpen={showAddModal} onClose={closeModal} title="New Schedule" size="xl">
        <form onSubmit={handleSave} className="max-h-[70vh] overflow-y-auto">
          <div className='flex bg-white/10 rounded-xl p-1 border backdrop-blur-lg border-white/20 mb-4'>
            {[{ value: 'individual', label: 'Individual' }, { value: 'purok', label: 'Per Purok' }, { value: 'barangay', label: 'Barangay-wide' }].map(s => (
              <button key={s.value} type='button' onClick={() => setScope(s.value)} className={`flex-1 py-2.5 px-1 sm:px-3 rounded-[10px] text-xs sm:text-sm font-medium transition-all ${scope === s.value ? 'bg-blue-500/40 text-white' : 'text-white/85 hover:text-white'}`}>{s.label}</button>
            ))}
          </div>

          {scope === 'individual' && (
            <div className='space-y-4'>
              <GlassSelect label='Resident *' value={scheduleForm.residentId} allowCustom placeholder='Select resident...' onChange={v => { const r = residents.find(res => String(res.id) === v); setScheduleForm(prev => ({ ...prev, residentId: v, residentName: r?.name || '', locationPurok: r?.purok || '', contactPerson: r?.contactPerson || '', contactNumber: r?.contactPersonNumber || r?.contactNumber || '', residentContactNumber: r?.contactNumber || '', type: getAllowedIndividualTypes(r).includes(prev.type) ? prev.type : '' })) }} options={[...[...residents].sort((a, b) => a.name?.localeCompare(b.name)).map(r => ({ value: String(r.id), label: `${r.name} (${formatResidentAge(r)}, ${r.gender})` }))]} required />
              <div className='grid grid-flow-col grid-cols-2 gap-3 items-stretch sm:hidden'>
                <GlassInput label='Date *' type='date' className='min-w-0' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                <GlassInput label='Time *' type='time' className='min-w-0' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
              </div>
              <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
                <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                <GlassSelect label='Type *' value={scheduleForm.type} allowCustom onChange={v => setScheduleForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required />
              </div>
              <div className='sm:hidden'><GlassSelect label='Type *' value={scheduleForm.type} allowCustom onChange={v => setScheduleForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required /></div>

                {formResident && hiddenFormTypeReasons.length > 0 && (
                  <p className='text-xs text-white/50 -mt-2'>Not applicable to this resident: {hiddenFormTypeReasons.join(' · ')}</p>
                )}

                {scheduleForm.type === 'Referral' ? (
                  <div className='space-y-3'>
                    <div className='grid grid-cols-2 gap-3'>
                      <GlassSelect label='Facility Type' value={scheduleForm.referralDestinationType} onChange={v => setScheduleForm(prev => ({ ...prev, referralDestinationType: v }))} options={[{ value: 'Hospital', label: 'Hospital' }, { value: 'Laboratory', label: 'Laboratory' }, { value: 'Clinic', label: 'Clinic' }, { value: 'Specialist', label: 'Specialist' }]} placeholder='e.g., Hospital, Laboratory, Specialist' />
                      <GlassInput label='Facility Name' value={scheduleForm.referralFacilityName} onChange={e => setScheduleForm(prev => ({ ...prev, referralFacilityName: e.target.value }))} placeholder='Facility name' />
                    </div>
                    <GlassInput label='Facility Location' value={scheduleForm.referralFacilityAddress} onChange={e => setScheduleForm(prev => ({ ...prev, referralFacilityAddress: e.target.value }))} placeholder='Facility address' />
                  </div>
                ) : (
                  <>
                    <div className='sm:hidden'><GlassSelect label='Service Location' value={scheduleForm.checkupCategory} onChange={v => setScheduleForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>
                    <div className='hidden sm:block'><GlassSelect label='Service Location' value={scheduleForm.checkupCategory} onChange={v => setScheduleForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>
                  </>
                )}

                <hr className='border-white/10' />

                <div>
                  <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose</label>
                  <textarea value={scheduleForm.purpose} onChange={e => setScheduleForm(prev => ({ ...prev, purpose: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Reason for visit...' />
                </div>

                <hr className='border-white/10' />

                <div>
                  <label className="block text-xs text-blue-200 font-medium mb-1.5">Location & Contact</label>
                  <div className='grid grid-cols-[2fr_1fr] gap-3 sm:hidden'>
                    <div className='min-w-0'><GlassInput label='Location Description' value={scheduleForm.locationDescription} onChange={e => setScheduleForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' /></div>
                    <GlassInput label='Purok' value={scheduleForm.locationPurok} onChange={e => setScheduleForm(prev => ({ ...prev, locationPurok: e.target.value }))} placeholder='Purok' />
                    <div className='col-span-2 grid grid-cols-1 gap-3'>
                      <GlassInput label='Contact Person' value={scheduleForm.contactPerson} onChange={e => setScheduleForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                      <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.contactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                      <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.residentContactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                    </div>
                  </div>
                  <div className='hidden sm:block space-y-3'>
                    <GlassInput label='Location Description' value={scheduleForm.locationDescription} onChange={e => setScheduleForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' />
                    <div className='grid grid-cols-3 gap-3'>
                      <GlassInput label='Purok' value={scheduleForm.locationPurok} onChange={e => setScheduleForm(prev => ({ ...prev, locationPurok: e.target.value }))} placeholder='Purok' />
                      <GlassInput label='Contact Person' value={scheduleForm.contactPerson} onChange={e => setScheduleForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                      <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.contactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                    </div>
                    <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.residentContactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                  </div>
                </div>

                <hr className='border-white/10' />

                <div>
                  <div className='flex items-center justify-between mb-1.5'>
                    <label className="text-xs text-blue-200 font-medium">Healthcare Professionals</label>
                    <button type='button' onClick={handleAddHCP} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                  </div>
                  <div className='space-y-2'>
                    {healthcareProfessionals.map((hp, idx) => (
                      <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                        <WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' />
                        <button type='button' onClick={() => handleRemoveHCP(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <hr className='border-white/10' />

                <div>
                  <div className='flex items-center justify-between mb-1.5'>
                    <label className="text-xs text-blue-200 font-medium">Assigned BHWs</label>
                    <button type='button' onClick={handleAddBHW} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                  </div>
                  <div className='space-y-2'>
                    {assignedBhws.map((b, idx) => (
                      <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                        <WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' />
                        <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(scope === 'purok' || scope === 'barangay') && (
              <div className='space-y-4'>
              <GlassInput label='Program Name *' value={scheduleForm.programName} onChange={e => setScheduleForm(prev => ({ ...prev, programName: e.target.value }))} placeholder='e.g., Purok Kalusugan' required />
              {scope === 'purok' && (
                <div className='hidden sm:block'>
                  <GlassSelect label='Purok *' value={scheduleForm.purokId} allowCustom placeholder='Select purok...' onChange={v => { setScheduleForm(prev => ({ ...prev, purokId: v })); const p = puroks.find(x => String(x.id) === parseInt(v)); if (p) setScheduleForm(prev => ({ ...prev, venue: `${p.name} Covered Court / Plaza` })); }} options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: `${p.name} · ${p.totalResidents || 0} residents` }))]} required />
                </div>
              )}
              {scope === 'purok' ? (
                <div className='grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 items-stretch sm:hidden'>
                  <GlassSelect label='Purok *' value={scheduleForm.purokId} allowCustom placeholder='Select purok...' onChange={v => { setScheduleForm(prev => ({ ...prev, purokId: v })); const p = puroks.find(x => String(x.id) === parseInt(v)); if (p) setScheduleForm(prev => ({ ...prev, venue: `${p.name} Covered Court / Plaza` })); }} options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: `${p.name} · ${p.totalResidents || 0} residents` }))]} required />
                  <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                  <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                  <GlassInput label='Duration (hour/s)' type='number' inputMode='decimal' value={scheduleForm.duration} onChange={e => setScheduleForm(prev => ({ ...prev, duration: e.target.value }))} min='1' step='0.5' placeholder='e.g., 4' />
                </div>
              ) : (
                <div className='grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 items-stretch sm:hidden'>
                  <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                  <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                  <div className='col-span-2'>
                    <GlassInput label='Duration (hour/s)' type='number' inputMode='decimal' value={scheduleForm.duration} onChange={e => setScheduleForm(prev => ({ ...prev, duration: e.target.value }))} min='1' step='0.5' placeholder='e.g., 4' />
                  </div>
                </div>
              )}
              <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
                <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                <GlassInput label='Duration (hour/s)' type='number' inputMode='decimal' value={scheduleForm.duration} onChange={e => setScheduleForm(prev => ({ ...prev, duration: e.target.value }))} min='1' step='0.5' placeholder='e.g., 4' />
              </div>

              <hr className='border-white/10' />

              <div>
                <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose & Description</label>
                <textarea value={scheduleForm.programDescription} onChange={e => setScheduleForm(prev => ({ ...prev, programDescription: e.target.value }))} className='glass-textarea min-h-[100px] text-sm w-full' rows='4' placeholder='Describe the program purpose...' />
              </div>

              <div className='sm:hidden space-y-3'>
                <GlassInput label='Venue' value={scheduleForm.venue} onChange={e => setScheduleForm(prev => ({ ...prev, venue: e.target.value }))} placeholder='Location' />
                <div className='grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 items-stretch'>
                  <GlassSelect label='Target Group' value={scheduleForm.targetGroup} onChange={v => setScheduleForm(prev => ({ ...prev, targetGroup: v }))} options={targetGroups.map(g => ({ value: g, label: g }))} />
                  <GlassInput label='Target Count' type='number' inputMode='numeric' min='1' step='1' onKeyDown={blockIntegerKeys} value={scheduleForm.targetCount} onChange={e => setScheduleForm(prev => ({ ...prev, targetCount: e.target.value }))} placeholder='Expected' />
                </div>
              </div>
              <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
                <GlassInput label='Venue' value={scheduleForm.venue} onChange={e => setScheduleForm(prev => ({ ...prev, venue: e.target.value }))} placeholder='Location' />
                <GlassSelect label='Target Group' value={scheduleForm.targetGroup} onChange={v => setScheduleForm(prev => ({ ...prev, targetGroup: v }))} options={targetGroups.map(g => ({ value: g, label: g }))} />
                <GlassInput label='Target Count' type='number' inputMode='numeric' min='1' step='1' onKeyDown={blockIntegerKeys} value={scheduleForm.targetCount} onChange={e => setScheduleForm(prev => ({ ...prev, targetCount: e.target.value }))} placeholder='Expected' />
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <GlassInput label='Coordinator Name' value={scheduleForm.coordinatorName} onChange={e => setScheduleForm(prev => ({ ...prev, coordinatorName: e.target.value }))} placeholder='Coordinator name' />
                <GlassInput label='Coordinator Contact' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.coordinatorContact} onChange={e => setScheduleForm(prev => ({ ...prev, coordinatorContact: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
              </div>
              <GlassInput label='Partner Organization' value={scheduleForm.partnerOrganization} onChange={e => setScheduleForm(prev => ({ ...prev, partnerOrganization: e.target.value }))} placeholder='e.g., DOH, Red Cross' />

              <hr className='border-white/10' />

              <div>
                <div className='flex items-center justify-between mb-1.5'>
                  <label className="text-xs text-blue-200 font-medium">Healthcare Professionals</label>
                  <button type='button' onClick={handleAddHCP} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                </div>
                <div className='space-y-2'>
                  {healthcareProfessionals.map((hp, idx) => (
                    <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                      <WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} />
                      <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' />
                      <button type='button' onClick={() => handleRemoveHCP(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                    </div>
                  ))}
                </div>
              </div>

              <hr className='border-white/10' />

              <div>
                <div className='flex items-center justify-between mb-1.5'>
                  <label className="text-xs text-blue-200 font-medium">Assigned BHWs</label>
                  <button type='button' onClick={handleAddBHW} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                </div>
                <div className='space-y-2'>
                  {assignedBhws.map((b, idx) => (
                    <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                      <WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} />
                      <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' />
                      <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <hr className='border-white/10 my-4' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Additional Information</label>
            <textarea value={scheduleForm.additionalInfo} onChange={e => setScheduleForm(prev => ({ ...prev, additionalInfo: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Requirements, preparation instructions...' />
          </div>
          <div className='grid !grid-cols-2 gap-3 pt-4 sm:flex sm:justify-end'>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={saving}>Create Schedule</GlassButton>
          </div>
        </form>
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal isOpen={showEditModal} onClose={closeModal} title="Edit Schedule" size="xl">
        <form onSubmit={handleSave} className="max-h-[70vh] overflow-y-auto">
          <div className='flex bg-white/10 rounded-xl p-1 border backdrop-blur-lg border-white/20 mb-4'>
            {[{ value: 'individual', label: 'Individual' }, { value: 'purok', label: 'Per Purok' }, { value: 'barangay', label: 'Barangay-wide' }].map(s => (
              <button key={s.value} type='button' onClick={() => setScope(s.value)} className={`flex-1 py-2.5 px-1 sm:px-3 rounded-[10px] text-xs sm:text-sm font-medium transition-all ${scope === s.value ? 'bg-blue-500/40 text-white' : 'text-white/85 hover:text-white'}`}>{s.label}</button>
            ))}
          </div>

          {scope === 'individual' && (
            <div className='space-y-4'>
              <GlassSelect label='Resident *' value={scheduleForm.residentId} allowCustom placeholder='Select resident...' onChange={v => { const r = residents.find(res => String(res.id) === v); setScheduleForm(prev => ({ ...prev, residentId: v, residentName: r?.name || '', locationPurok: r?.purok || '', contactPerson: r?.contactPerson || '', contactNumber: r?.contactPersonNumber || r?.contactNumber || '', residentContactNumber: r?.contactNumber || '', type: getAllowedIndividualTypes(r).includes(prev.type) ? prev.type : '' })) }} options={[...[...residents].sort((a, b) => a.name?.localeCompare(b.name)).map(r => ({ value: String(r.id), label: `${r.name} (${formatResidentAge(r)}, ${r.gender})` }))]} required />
              <div className='grid grid-flow-col grid-cols-2 gap-3 items-stretch sm:hidden'>
                <GlassInput label='Date *' type='date' className='min-w-0' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                <GlassInput label='Time *' type='time' className='min-w-0' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
              </div>
              <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
                <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                <GlassSelect label='Type *' value={scheduleForm.type} allowCustom onChange={v => setScheduleForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required />
              </div>
              <div className='sm:hidden'><GlassSelect label='Type *' value={scheduleForm.type} allowCustom onChange={v => setScheduleForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required /></div>

               {formResident && hiddenFormTypeReasons.length > 0 && (
                 <p className='text-xs text-white/50 -mt-2'>Not applicable to this resident: {hiddenFormTypeReasons.join(' · ')}</p>
               )}

               {scheduleForm.type === 'Referral' ? (
                 <div className='space-y-3'>
                   <div className='grid grid-cols-2 gap-3'>
                     <GlassSelect label='Facility Type' value={scheduleForm.referralDestinationType} onChange={v => setScheduleForm(prev => ({ ...prev, referralDestinationType: v }))} options={[{ value: 'Hospital', label: 'Hospital' }, { value: 'Laboratory', label: 'Laboratory' }, { value: 'Clinic', label: 'Clinic' }, { value: 'Specialist', label: 'Specialist' }]} placeholder='e.g., Hospital, Laboratory, Specialist' />
                     <GlassInput label='Facility Name' value={scheduleForm.referralFacilityName} onChange={e => setScheduleForm(prev => ({ ...prev, referralFacilityName: e.target.value }))} placeholder='Facility name' />
                   </div>
                   <GlassInput label='Facility Location' value={scheduleForm.referralFacilityAddress} onChange={e => setScheduleForm(prev => ({ ...prev, referralFacilityAddress: e.target.value }))} placeholder='Facility address' />
                 </div>
                ) : (
                  <>
                    <div className='sm:hidden'><GlassSelect label='Service Location' value={scheduleForm.checkupCategory} onChange={v => setScheduleForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>
                    <div className='hidden sm:block'><GlassSelect label='Service Location' value={scheduleForm.checkupCategory} onChange={v => setScheduleForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>
                  </>
                )}

               <hr className='border-white/10' />

               <div>
                 <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose</label>
                 <textarea value={scheduleForm.purpose} onChange={e => setScheduleForm(prev => ({ ...prev, purpose: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Reason for visit...' />
               </div>

               <hr className='border-white/10' />

               <div>
                 <label className="block text-xs text-blue-200 font-medium mb-1.5">Location & Contact</label>
                 <div className='space-y-3'>
                   <GlassInput label='Location Description' value={scheduleForm.locationDescription} onChange={e => setScheduleForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' />
                   <div className='grid grid-cols-3 gap-3'>
                     <GlassInput label='Purok' value={scheduleForm.locationPurok} onChange={e => setScheduleForm(prev => ({ ...prev, locationPurok: e.target.value }))} placeholder='Purok' />
                     <GlassInput label='Contact Person' value={scheduleForm.contactPerson} onChange={e => setScheduleForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                     <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.contactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                   </div>
                   <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.residentContactNumber} onChange={e => setScheduleForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                 </div>
               </div>

               <hr className='border-white/10' />

               <div>
                 <div className='flex items-center justify-between mb-1.5'>
                   <label className="text-xs text-blue-200 font-medium">Healthcare Professionals</label>
                   <button type='button' onClick={handleAddHCP} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                 </div>
                 <div className='space-y-2'>
                   {healthcareProfessionals.map((hp, idx) => (
                     <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                       <WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' />
                       <button type='button' onClick={() => handleRemoveHCP(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                     </div>
                   ))}
                 </div>
               </div>

               <hr className='border-white/10' />

               <div>
                 <div className='flex items-center justify-between mb-1.5'>
                   <label className="text-xs text-blue-200 font-medium">Assigned BHWs</label>
                   <button type='button' onClick={handleAddBHW} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                 </div>
                 <div className='space-y-2'>
                   {assignedBhws.map((b, idx) => (
                     <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                       <WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' />
                       <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           )}

           {(scope === 'purok' || scope === 'barangay') && (
             <div className='space-y-4'>
               <GlassInput label='Program Name *' value={scheduleForm.programName} onChange={e => setScheduleForm(prev => ({ ...prev, programName: e.target.value }))} placeholder='e.g., Purok Kalusugan' required />
               {scope === 'purok' && (
                 <GlassSelect label='Purok *' value={scheduleForm.purokId} allowCustom placeholder='Select purok...' onChange={v => { setScheduleForm(prev => ({ ...prev, purokId: v })); const p = puroks.find(x => String(x.id) === parseInt(v)); if (p) setScheduleForm(prev => ({ ...prev, venue: `${p.name} Covered Court / Plaza` })); }} options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: `${p.name} · ${p.totalResidents || 0} residents` }))]} required />
               )}
               <div className='grid grid-cols-3 gap-3 items-stretch'>
                 <GlassInput label='Date *' type='date' value={scheduleForm.date} onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))} required />
                 <GlassInput label='Time *' type='time' value={scheduleForm.time} onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))} required />
                 <GlassInput label='Duration (hour/s)' type='number' inputMode='decimal' value={scheduleForm.duration} onChange={e => setScheduleForm(prev => ({ ...prev, duration: e.target.value }))} min='1' step='0.5' placeholder='e.g., 4' />
               </div>

               <hr className='border-white/10' />

               <div>
                 <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose & Description</label>
                 <textarea value={scheduleForm.programDescription} onChange={e => setScheduleForm(prev => ({ ...prev, programDescription: e.target.value }))} className='glass-textarea min-h-[100px] text-sm w-full' rows='4' placeholder='Describe the program purpose...' />
               </div>

               <div className='grid grid-cols-3 gap-3 items-stretch'>
                 <GlassInput label='Venue' value={scheduleForm.venue} onChange={e => setScheduleForm(prev => ({ ...prev, venue: e.target.value }))} placeholder='Location' />
                 <GlassSelect label='Target Group' value={scheduleForm.targetGroup} onChange={v => setScheduleForm(prev => ({ ...prev, targetGroup: v }))} options={targetGroups.map(g => ({ value: g, label: g }))} />
                 <GlassInput label='Target Count' type='number' inputMode='numeric' min='1' step='1' onKeyDown={blockIntegerKeys} value={scheduleForm.targetCount} onChange={e => setScheduleForm(prev => ({ ...prev, targetCount: e.target.value }))} placeholder='Expected' />
               </div>
               <div className='grid grid-cols-2 gap-3'>
                 <GlassInput label='Coordinator Name' value={scheduleForm.coordinatorName} onChange={e => setScheduleForm(prev => ({ ...prev, coordinatorName: e.target.value }))} placeholder='Coordinator name' />
                 <GlassInput label='Coordinator Contact' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={scheduleForm.coordinatorContact} onChange={e => setScheduleForm(prev => ({ ...prev, coordinatorContact: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
               </div>
               <GlassInput label='Partner Organization' value={scheduleForm.partnerOrganization} onChange={e => setScheduleForm(prev => ({ ...prev, partnerOrganization: e.target.value }))} placeholder='e.g., DOH, Red Cross' />

               <hr className='border-white/10' />

               <div>
                 <div className='flex items-center justify-between mb-1.5'>
                   <label className="text-xs text-blue-200 font-medium">Healthcare Professionals</label>
                   <button type='button' onClick={handleAddHCP} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                 </div>
                 <div className='space-y-2'>
                   {healthcareProfessionals.map((hp, idx) => (
                     <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                       <WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' />
                       <button type='button' onClick={() => handleRemoveHCP(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                     </div>
                   ))}
                 </div>
               </div>

               <hr className='border-white/10' />

               <div>
                 <div className='flex items-center justify-between mb-1.5'>
                   <label className="text-xs text-blue-200 font-medium">Assigned BHWs</label>
                   <button type='button' onClick={handleAddBHW} className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'><Plus className='w-3.5 h-3.5' />Add</button>
                 </div>
                 <div className='space-y-2'>
                   {assignedBhws.map((b, idx) => (
                     <div key={idx} className='grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_32px] gap-2 items-end'>
                       <WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} />
                        <GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' />
                       <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           )}

           <hr className='border-white/10 my-4' />

           <div>
             <label className="block text-xs text-blue-200 font-medium mb-1.5">Additional Information</label>
             <textarea value={scheduleForm.additionalInfo} onChange={e => setScheduleForm(prev => ({ ...prev, additionalInfo: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Requirements, preparation instructions...' />
           </div>
           <div className='flex justify-end gap-3 pt-4'>
             <GlassButton variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton>
             <GlassButton type='submit' loading={saving}>Update Schedule</GlassButton>
           </div>
        </form>
      </Modal>

      {/* Schedule Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={closeDetailModal} title="Schedule Details" panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none' bodyClassName='p-4 sm:p-6 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'>
        {detailLoading ? (
          <SkeletonScheduleDetailModal />
        ) : selectedSchedule ? (
          <div className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold text-white'>{selectedSchedule.programName || selectedSchedule.type || 'Schedule'}</h3>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(selectedSchedule.status)}`}>{selectedSchedule.status}</span>
            </div>

            {/* Schedule Info */}
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Date</label>
                <p className='text-sm text-white/85'>{selectedSchedule.date ? new Date(selectedSchedule.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</p>
              </div>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Time</label>
                <p className='text-sm text-white/85'>{formatTime(selectedSchedule.time) || '—'}</p>
              </div>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Scope</label>
                <p className='text-sm text-white/85 capitalize'>{selectedSchedule.scope || '—'}</p>
              </div>
              {selectedSchedule.scope === 'individual' ? (
                <>
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Type</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.type || '—'}</p>
                  </div>
                  {selectedSchedule.type !== 'Referral' && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Service Location</label>
                      <p className='text-sm text-white/85'>{selectedSchedule.checkupCategory || selectedSchedule.serviceCategory || '—'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Duration</label>
                  <p className='text-sm text-white/85'>{selectedSchedule.duration ? (selectedSchedule.duration >= 60 ? `${Math.floor(selectedSchedule.duration / 60)}hr ${selectedSchedule.duration % 60 ? `${selectedSchedule.duration % 60}min` : ''}`.trim() : `${selectedSchedule.duration}min`) : '—'}</p>
                </div>
              )}
            </div>

            <hr className='border-white/10' />

            {/* Resident (individual) */}
            {selectedSchedule.scope === 'individual' && selectedSchedule.residentName && (
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Resident</label>
                  <p className='text-sm text-white/85'>{selectedSchedule.residentName}</p>
                </div>
                {(selectedSchedule.residentContactNumber || selectedSchedule.resident?.contactNumber || selectedSchedule.residentContact) && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'><span className='sm:hidden'>Contact Number</span><span className='hidden sm:inline'>Resident Contact Number</span></label>
                    <p className='text-sm text-white/85'>{selectedSchedule.residentContactNumber || selectedSchedule.resident?.contactNumber || selectedSchedule.residentContact}</p>
                  </div>
                )}
              </div>
            )}

            {/* Referral Details (LGU Referral / Referral) */}
            {(selectedSchedule.type === 'LGU Referral' || selectedSchedule.type === 'Referral') && (selectedSchedule.referralDestinationType || selectedSchedule.referralFacilityName || selectedSchedule.referralFacilityAddress) && (
              <div className='space-y-3'>
                <div className='grid grid-cols-2 gap-4'>
                  {selectedSchedule.referralDestinationType && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Type</label>
                      <p className='text-sm text-white/85'>{selectedSchedule.referralDestinationType}</p>
                    </div>
                  )}
                  {selectedSchedule.referralFacilityName && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Name</label>
                      <p className='text-sm text-white/85'>{selectedSchedule.referralFacilityName}</p>
                    </div>
                  )}
                </div>
                {selectedSchedule.referralFacilityAddress && (
                  <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Location</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.referralFacilityAddress}</p>
                  </div>
                )}
              </div>
            )}

            {/* Program Info (purok/barangay) */}
            {(selectedSchedule.scope === 'purok' || selectedSchedule.scope === 'barangay') && (
              <div className='grid grid-cols-2 gap-4'>
                {selectedSchedule.targetGroup && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Target Group</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.targetGroup}</p>
                  </div>
                )}
                {selectedSchedule.scope === 'barangay' && selectedSchedule.purokName && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.purokName}</p>
                  </div>
                )}
                {selectedSchedule.targetCount && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Target Count</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.targetCount}</p>
                  </div>
                )}
                {selectedSchedule.scope === 'purok' && selectedSchedule.purokName && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.purokName}</p>
                  </div>
                )}
                {selectedSchedule.venue && (
                  <div className='col-span-2 sm:col-span-1'>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Venue</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.venue}</p>
                  </div>
                )}
                {selectedSchedule.scope !== 'barangay' && selectedSchedule.maxParticipants && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Max Participants</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.maxParticipants}</p>
                  </div>
                )}
              </div>
            )}

            {/* Purpose */}
            {selectedSchedule.purpose && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purpose</label>
                <p className='text-sm text-white/85'>{selectedSchedule.purpose}</p>
              </div>
            )}

            <hr className='border-white/10' />

            {/* Location */}
            {(selectedSchedule.locationDetails || (selectedSchedule.purokName && selectedSchedule.scope === 'individual')) && (
              <div className='grid grid-cols-2 gap-4'>
                {selectedSchedule.locationDetails && (
                  <div className='col-span-2 sm:col-span-1'>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Location</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.locationDetails}</p>
                  </div>
                )}
                {(selectedSchedule.locationPurok || selectedSchedule.purokName) && selectedSchedule.scope === 'individual' && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.locationPurok || selectedSchedule.purokName}</p>
                  </div>
                )}
              </div>
            )}

            {/* Contact */}
            {(selectedSchedule.contactPerson || selectedSchedule.contactNumber) && (
              <div className='grid grid-cols-2 gap-4'>
                {selectedSchedule.contactPerson && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Contact Person</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.contactPerson}</p>
                  </div>
                )}
                {selectedSchedule.contactNumber && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Contact Person Number</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.contactNumber}</p>
                  </div>
                )}
              </div>
            )}

            {/* Coordinator */}
            {(selectedSchedule.coordinatorName || selectedSchedule.coordinatorContact || selectedSchedule.partnerOrganization) && (
              <>
                <div className='grid grid-cols-2 gap-4'>
                  {selectedSchedule.coordinatorName && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Coordinator</label>
                      <p className='text-sm text-white/85'>{selectedSchedule.coordinatorName}</p>
                    </div>
                  )}
                  {selectedSchedule.coordinatorContact && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Coordinator Contact</label>
                      <p className='text-sm text-white/85'>{selectedSchedule.coordinatorContact}</p>
                    </div>
                  )}
                </div>
                {selectedSchedule.partnerOrganization && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Partner Organization</label>
                    <p className='text-sm text-white/85'>{selectedSchedule.partnerOrganization}</p>
                  </div>
                )}
              </>
            )}

            <hr className='border-white/10' />

            {/* Assigned BHWs */}
            {selectedSchedule.assignedBhws && selectedSchedule.assignedBhws.length > 0 && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1.5'>Assigned BHWs</label>
                <div className='flex flex-wrap gap-2'>
                  {selectedSchedule.assignedBhws.map((b, i) => (
                    <span key={i} className='inline-flex items-center gap-1.5 text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/85'>
                      <User className='w-3.5 h-3.5 text-blue-400' />
                      {b.name}
                      {b.contactNumber && <span className='text-white/50'>· {b.contactNumber}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Healthcare Professionals */}
            {selectedSchedule.healthcareProfessionals && selectedSchedule.healthcareProfessionals.length > 0 && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1.5'>Healthcare Professionals</label>
                <div className='flex flex-wrap gap-2'>
                  {selectedSchedule.healthcareProfessionals.map((hp, i) => (
                    <span key={i} className='inline-flex items-center gap-1.5 text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/85'>
                      <Stethoscope className='w-3.5 h-3.5 text-emerald-400' />
                      {hp.name}
                      {hp.contact && <span className='text-white/50'>· {hp.contact}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedSchedule.notes && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Notes</label>
                <p className='text-sm text-white/85'>{selectedSchedule.notes}</p>
              </div>
            )}

            <hr className='border-white/10' />

            {/* Buttons */}
            <div className='flex flex-wrap items-center gap-2 mb-6 pb-2 sm:mb-0 sm:pb-0'>
              {(selectedSchedule.status === 'Missed' || selectedSchedule.status === 'Cancelled') && (
                <GlassButton aria-label='Reschedule schedule' variant='secondary' icon={Calendar} onClick={() => openRescheduleModal(selectedSchedule)} className='flex-1'><span className='hidden sm:inline'>Reschedule</span></GlassButton>
              )}
              {selectedSchedule.status === 'Completed' && (
                <GlassButton aria-label='Schedule again' variant='secondary' icon={Plus} onClick={() => openScheduleAgainModal(selectedSchedule)} className='flex-1'><span className='hidden sm:inline'>Schedule Again</span></GlassButton>
              )}
              {selectedSchedule.status !== 'Completed' && selectedSchedule.status !== 'Cancelled' && (
                <GlassButton aria-label='Complete schedule' variant='solid-success' icon={Check} onClick={handleCompleteClick} className='flex-1'><span className='hidden sm:inline'>Complete</span></GlassButton>
              )}
              {selectedSchedule.status === 'Scheduled' && (
                <GlassButton aria-label='Cancel schedule' variant='secondary' icon={X} onClick={handleCancelSchedule} className='flex-1'><span className='hidden sm:inline'>Cancel</span></GlassButton>
              )}
               <GlassButton className='shrink-0' variant='solid-primary' icon={Pencil} title={selectedSchedule.status === 'Scheduled' ? 'Edit Schedule' : 'Locked - use Reschedule or Schedule Again'} disabled={selectedSchedule.status !== 'Scheduled'} onClick={() => { openEditModal(selectedSchedule, { fromDetail: true }) }} />
               <GlassButton className='shrink-0' variant='solid-danger' icon={Trash2} onClick={() => { handleDelete(selectedSchedule.id, { stopPropagation: () => {} }) }} />
            </div>
          </div>
        ) : (
          <SkeletonScheduleDetailModal />
        )}
      </Modal>

      {/* Day Schedules Modal (calendar day with multiple schedules) */}
      <Modal
        isOpen={showDayModal}
        onClose={() => setShowDayModal(false)}
        title={dayModalTitle}
        size='md'
      >
        {loading ? (
          <SkeletonDayModalList count={3} />
        ) : (
        <div className='space-y-2'>
          {paginatedDayModalSchedules.map(schedule => (
            <div
              key={schedule.id}
              className='bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/[0.07]'
              onClick={() => {
                // Stacked over the day modal — closing the detail reveals it again.
                openDetailModal(schedule)
              }}
            >
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-white text-sm font-medium'>
                    {schedule.scope === 'individual'
                      ? schedule.residentName
                      : schedule.programName || schedule.type}
                  </p>
                  <div className='flex items-center gap-2 text-xs text-white/40 mt-0.5'>
                    <span className='flex items-center gap-0.5'>
                      <Clock className='w-3 h-3' />
                      {formatTime(schedule.time)}
                    </span>
                    <span>{schedule.type}</span>
                    <span className='capitalize'>{schedule.scope}</span>
                  </div>
                </div>
                <span className={`badge text-xs ${getStatusColor(schedule.status)}`}>
                  {schedule.status}
                </span>
              </div>
            </div>
          ))}
          <Pagination
            page={safeDayModalPage}
            totalPages={totalDayModalPages}
            onPageChange={setDayModalPage}
            total={dayModalSchedules.length}
            perPage={dayModalPerPage}
          />
        </div>
        )}
      </Modal>

      {/* Complete-flow: resident's Add Medical Record linked to the schedule.
          The Add Medical Record form auto-opens prefilled with the Schedule
          Details info; the schedule flips to Completed only after save. */}
      <Modal
        isOpen={showCompleteFlow}
        onClose={() => setShowCompleteFlow(false)}
        title='Complete Schedule — Add Medical Record'
        size='xl'
      >
        {showCompleteFlow && selectedSchedule?.residentId && (
          <ResidentDetail
            residentId={selectedSchedule.residentId}
            embedded
            onClose={() => setShowCompleteFlow(false)}
            completeSchedule={buildCompletePrefill(selectedSchedule)}
            onScheduleCompleted={handleScheduleCompleted}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null) }}
        onConfirm={confirmDelete}
        title="Delete Schedule"
        message="Are you sure you want to delete this schedule?"
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  )
}

export default Schedules
