// pages/bhw-worker/MySchedules.jsx
// Mirrors the admin Schedules page (same layout, filters, cards, calendar,
// day modal, and detail sections) — the only difference is the data source:
// only schedules assigned to the logged-in BHW. Writes stay worker-scoped
// (individual scope, self as lead, status/notes/attendance only).
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Calendar, Clock, MapPin, User, Plus, Pencil, Trash2,
  Building2, Search, List, CalendarDays, X, Stethoscope, Check
} from 'lucide-react'
import { scheduleApi } from '../../api/scheduleApi'
import { residentApi } from '../../api/residentApi'
import { bhwApi } from '../../api/bhwApi'
import { useAuth } from '../../context/AuthContext'
import GlassCard from '../../components/GlassCard'
import GlassButton from '../../components/GlassButton'
import GlassInput from '../../components/GlassInput'
import GlassSelect from '../../components/GlassSelect'
import StatCard from '../../components/StatCard'
import WorkerNamePicker from '../../components/WorkerNamePicker'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import CalendarView from '../../components/CalendarView'
import ResidentDetail from '../ResidentDetail'
import { formatTime, getStatusColor, formatAge } from '../../utils/helpers'
import { SkeletonMySchedulesPage, SkeletonScheduleDetailModal } from '../../components/Skeleton'
import { dialog } from '../../context/DialogContext'
import { confirmCreate, confirmMutation, confirmUpdate } from '../../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys } from '../../utils/validation'

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
const serviceLocations = ['Health Center', 'Home Visit']

const getAllowedIndividualTypes = (resident) => {
  const all = presetTypes.map(t => t.value)
  if (!resident) return all
  const age = Number(resident.age) || 0
  const groups = resident.focusGroups || []
  const isPregnant = groups.includes('pregnant')
  const isInfant = groups.includes('infant') || age < 5
  const isSenior = groups.includes('senior') || age >= 60
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
const formatResidentAge = r => formatAge(r?.age, r?.dateOfBirth)

const MySchedules = () => {
  const statScrollIndicatorRef = useRef(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // When opened from another page (e.g. home dashboard) with a schedule id,
  // the Detail modal opens on top and closing returns there — admin parity.
  const [returnTo, setReturnTo] = useState(null)
  const [returnState, setReturnState] = useState(null)
  // Set when the New Schedule form was opened from another page (calendar
  // action in Resident Details) — closing/saving returns there.
  const [formReturn, setFormReturn] = useState(null)
  const bhwName = user?.bhw?.name || user?.name || 'Me'
  const [schedules, setSchedules] = useState([])
  const [residents, setResidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [scopeFilter, setScopeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [page, setPage] = useState(1)
  const perPage = 8
  const [dayModalPage, setDayModalPage] = useState(1)
  const dayModalPerPage = 5
  const [selectedDate, setSelectedDate] = useState(null)
  const [showDayModal, setShowDayModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  // When the edit form is opened via Reschedule / Schedule Again, saving
  // flips the (Missed/Cancelled/Completed) schedule back to Scheduled.
  const [editStatusOverride, setEditStatusOverride] = useState(null)
  const actionClickRef = useRef(false)
  const [form, setForm] = useState({
    residentId: '', date: '', time: '', type: 'Checkup', purpose: '', additionalInfo: '',
    checkupCategory: 'Health Center', locationDescription: '', locationPurok: '',
    contactPerson: '', contactNumber: '', residentContactNumber: '',
    referralDestinationType: '', referralFacilityName: '', referralFacilityAddress: ''
  })
  const [bhws, setBhws] = useState([])
  const meBhwId = user?.bhw?.id ? String(user.bhw.id) : ''
  const meBhwName = user?.bhw?.name || user?.name || ''
  const meBhwContact = user?.bhw?.contactNumber || ''
  // Purok is fixed to this BHW's handled purok — the New/Edit schedule
  // forms display it read-only and always save it, never a typed value.
  const handledPurok = user?.bhw?.assignedPurokName || ''
  const [assignedBhws, setAssignedBhws] = useState([{ bhwId: meBhwId, name: meBhwName, contactNumber: meBhwContact }])
  const [healthcareProfessionals, setHealthcareProfessionals] = useState([{ hcpId: '', name: '', contact: '' }])

  useEffect(() => { fetchMine() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, scopeFilter, statusFilter, viewMode])
  // Keep the draft pinned to the handled purok (field is read-only, but
  // resident picks and older drafts could still carry another value).
  useEffect(() => {
    if (handledPurok) setForm(prev => (prev.locationPurok === handledPurok ? prev : { ...prev, locationPurok: handledPurok }))
  }, [handledPurok])

  const fetchMine = async () => {
    try {
      setLoading(true)
      const [schedRes, resRes, bhwRes] = await Promise.all([
        scheduleApi.getMine(),
        residentApi.getMine().catch(() => ({ data: { success: false } })),
        bhwApi.getAll({ forAssignment: 'true' }).catch(() => ({ data: { success: false } }))
      ])
      if (schedRes.data.success) setSchedules(schedRes.data.data || [])
      if (resRes.data?.success) setResidents(resRes.data.data.handledResidents || resRes.data.data.purokResidents || [])
      if (bhwRes.data?.success) setBhws(bhwRes.data.data || [])
    } catch (err) {
      console.error('My schedules error:', err)
    } finally {
      setLoading(false)
    }
  }

  const activeBhws = bhws.filter(b => b.status === 'Active')
  const isHeadPosition = b => String(b.position || '').toLowerCase().includes('head')
  const isBhwPosition = b => {
    const p = String(b.position || '').toLowerCase()
    return !isHeadPosition(b) && (p.includes('health worker') || p === 'bhw')
  }
  const bhwWorkers = activeBhws.filter(isBhwPosition)
  const healthcareProfessionalsList = activeBhws.filter(b => !isBhwPosition(b) && !isHeadPosition(b))

  const formResident = residents.find(res => String(res.id) === String(form.residentId)) || null
  const allowedFormTypes = getAllowedIndividualTypes(formResident)
  const hiddenFormTypeReasons = getHiddenIndividualTypeReasons(formResident)
  const formTypeOptions = presetTypes.filter(t => allowedFormTypes.includes(t.value))
  if (form.type && !formTypeOptions.some(t => t.value === form.type)) {
    formTypeOptions.push({ value: form.type, label: form.type })
  }

  const timeToMinutes = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
  const getConflictSchedule = (workerId) => {
    if (!workerId || !form.date || !form.time) return null
    const newStart = timeToMinutes(form.time)
    if (newStart == null) return null
    return schedules.find(s => {
      if (s.status !== 'Scheduled' || String(s.date || '').slice(0, 10) !== form.date) return false
      const ids = new Set()
      if (s.leadBhwId) ids.add(String(s.leadBhwId))
      ;(s.assignedBhws || []).forEach(b => { if (b.bhwId) ids.add(String(b.bhwId)) })
      ;(s.healthcareProfessionals || []).forEach(h => { if (h.hcpId) ids.add(String(h.hcpId)) })
      if (!ids.has(String(workerId))) return false
      const start = timeToMinutes(s.time)
      if (start == null) return false
      const dur = s.duration || 30
      return !(newStart >= start + dur || start >= newStart + 30)
    }) || null
  }
  const workerConflictNote = (workerId) => {
    const c = getConflictSchedule(workerId)
    if (!c) return null
    return `Has schedule ${formatTime(c.time)}`
  }
  const hcpSuggestions = (idx) => healthcareProfessionalsList.filter(h => !healthcareProfessionals.some((ah, ai) => ai !== idx && String(ah.hcpId) === String(h.id))).map(h => ({ ...h, note: workerConflictNote(h.id) }))
  const bhwSuggestions = (idx) => bhwWorkers.filter(b => !assignedBhws.some((ab, ai) => ai !== idx && String(ab.bhwId) === String(b.id))).map(b => ({ ...b, note: workerConflictNote(b.id) }))

  const handleAddBHW = () => { setAssignedBhws([...assignedBhws, { bhwId: '', name: '', contactNumber: '' }]) }
  const handleRemoveBHW = (index) => { setAssignedBhws(assignedBhws.filter((_, i) => i !== index)) }
  const handleAddHCP = () => { setHealthcareProfessionals([...healthcareProfessionals, { hcpId: '', name: '', contact: '' }]) }
  const handleRemoveHCP = (index) => { setHealthcareProfessionals(healthcareProfessionals.filter((_, i) => i !== index)) }
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

  const goToPreviousMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)) }
  const goToNextMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)) }
  const goToToday = () => { setCurrentMonth(new Date()) }

  const handleSelectDay = (dateStr, daySchedules) => {
    const list = daySchedules || []
    if (list.length === 0) return
    setSelectedDate({ dateStr, schedules: list })
    setDayModalPage(1)
    setShowDayModal(true)
  }

  const openDetail = async (s) => {
    try {
      setDetailLoading(true)
      setSelected(s)
      const res = await scheduleApi.getById(s.id)
      if (res.data.success) setSelected({ ...s, ...res.data.data })
    } catch (err) {
      console.error('Schedule detail error:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  // Cross-page redirection (admin parity): closing the Detail modal returns
  // to the originating page when opened via navigation state.
  const navigateBack = (dest, state) => {
    setReturnTo(null)
    setReturnState(null)
    navigate(dest, { state: state || {} })
  }

  const closeDetail = () => {
    setSelected(null)
    setDetailLoading(false)
    if (returnTo) navigateBack(returnTo, returnState)
  }

  useEffect(() => {
    if (location.state?.viewScheduleId && schedules.length > 0) {
      const schedule = schedules.find(s => String(s.id) === String(location.state.viewScheduleId))
      if (schedule) {
        openDetail(schedule)
        if (location.state?.from && location.state.from !== '/my-schedules') {
          setReturnTo(location.state.from)
          setReturnState(location.state?.returnState || null)
        }
        window.history.replaceState({}, document.title)
      } else {
        window.history.replaceState({}, document.title)
      }
    }
  }, [location.state, schedules])

  // New Schedule prefilled for a resident (calendar action in Resident
  // Details) — admin parity. Purok stays pinned to the handled purok.
  useEffect(() => {
    if (location.state?.addScheduleForResident) {
      const r = location.state.addScheduleForResident
      setForm({
        residentId: r.id ? String(r.id) : '', date: '', time: '', type: 'Checkup',
        purpose: '', additionalInfo: '', checkupCategory: 'Health Center',
        locationDescription: '', locationPurok: handledPurok || '',
        contactPerson: r.contactPerson || '', contactNumber: r.contactPersonNumber || r.contactNumber || '',
        residentContactNumber: r.contactNumber || '',
        referralDestinationType: '', referralFacilityName: '', referralFacilityAddress: ''
      })
      setAssignedBhws([{ bhwId: meBhwId, name: meBhwName, contactNumber: meBhwContact }])
      setHealthcareProfessionals([{ hcpId: '', name: '', contact: '' }])
      if (location.state?.from && location.state.from !== '/my-schedules') {
        setFormReturn({ to: location.state.from, state: location.state?.returnState || {} })
      } else {
        setFormReturn(null)
      }
      setShowAdd(true)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const closeAdd = () => {
    setShowAdd(false)
    // Close returns to the previous page when the add flow came from elsewhere.
    if (formReturn) {
      const dest = formReturn
      setFormReturn(null)
      navigate(dest.to, { state: dest.state })
    }
  }

  const updateStatus = async (status, extra = {}) => {
    if (!selected) return
    const confirmed = await confirmMutation({
      title: status === 'Cancelled' ? 'Cancel schedule?' : 'Update schedule status?',
      message: `Please confirm that you want to mark this schedule as ${status.toLowerCase()}.`,
      confirmText: status === 'Cancelled' ? 'Cancel schedule' : `Mark ${status.toLowerCase()}`,
      destructive: status === 'Cancelled',
    })
    if (!confirmed) return
    try {
      await scheduleApi.update(selected.id, { status, ...extra })
      setSelected({ ...selected, status, ...extra })
      setSchedules(prev => prev.map(s => s.id === selected.id ? { ...s, status } : s))
      dialog.toast(`Schedule marked as ${status.toLowerCase()}.`, 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to update schedule', 'Unable to update schedule')
    }
  }

  // Complete-flow for individual schedules (admin parity): open the
  // resident's Add Medical Record prefilled with Schedule Details info. The
  // schedule flips to Completed only after the medical record saves.
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
      administeredBy: s.assignedBhws?.find(b => b.name)?.name || s.healthcareProfessionals?.find(h => h.name)?.name || '',
      referralCategory: 'General Concern',
      facilityType: s.referralDestinationType || '',
      facilityName: s.referralFacilityName || '',
      facilityLocation: s.referralFacilityAddress || ''
    }
  }

  const handleCompleteClick = () => {
    if (!selected) return
    if (selected.scope === 'individual') {
      if (!selected.residentId) {
        dialog.error('This individual schedule has no linked resident. Please edit the schedule to link a resident first.', 'Resident required')
        return
      }
      setShowCompleteFlow(true)
    } else {
      updateStatus('Completed', { notes: selected.notes })
    }
  }

  const handleScheduleCompleted = async (scheduleId) => {
    setShowCompleteFlow(false)
    await fetchMine()
    if (selected && String(selected.id) === String(scheduleId)) {
      try {
        const res = await scheduleApi.getById(scheduleId)
        if (res.data.success) setSelected({ ...selected, ...res.data.data })
      } catch (err) {
        console.error('Schedule refresh error:', err)
      }
    }
  }

  // Reschedule / Schedule Again: open the full Edit Schedule form with the
  // existing info; saving flips the schedule back to Scheduled.
  const openRescheduleEdit = () => {
    if (!selected) return
    setEditStatusOverride('Scheduled')
    openEditModal(selected)
  }

  // Fill the edit form from a schedule object. The /mine list only carries
  // a minimal projection (no purpose/notes/contacts/workers), so callers
  // must pass the full getById() detail — see openEditModal below.
  const fillEditForm = (d) => {
    setForm({
      residentId: d.residentId ?? d.resident?.id ?? '',
      date: String(d.date || '').slice(0, 10),
      time: String(d.time || '').slice(0, 5),
      type: d.type === 'General Checkup' ? 'Checkup' : (d.type || 'Checkup'), purpose: d.purpose || '',
      additionalInfo: d.additionalInfo || d.notes || '',
      checkupCategory: d.checkupCategory || d.serviceCategory || 'Health Center',
      locationDescription: d.locationDescription || d.locationDetails || '',
      // Purok is fixed to the BHW's handled purok — never the saved row's.
      locationPurok: handledPurok || d.locationPurok || d.purokName || '',
      contactPerson: d.contactPerson || '', contactNumber: d.contactNumber || '',
      residentContactNumber: d.residentContactNumber || d.resident?.contactNumber || d.residentContact || '',
      referralDestinationType: d.referralDestinationType || '',
      referralFacilityName: d.referralFacilityName || '',
      referralFacilityAddress: d.referralFacilityAddress || ''
    })
    setAssignedBhws(d.assignedBhws?.length ? d.assignedBhws : [{ bhwId: meBhwId, name: meBhwName, contactNumber: meBhwContact }])
    setHealthcareProfessionals(d.healthcareProfessionals?.length ? d.healthcareProfessionals : [{ hcpId: '', name: '', contact: '' }])
  }

  const openEditModal = async (s) => {
    actionClickRef.current = true
    try {
      setEditingSchedule(s)
      // Prefill immediately from the list row so the modal opens fast,
      // then enrich with the full detail (list rows lack purpose, notes,
      // contacts, referral info, and worker assignments).
      fillEditForm(s)
      setSelected(null)
      setShowEditModal(true)
      setEditLoading(true)
      try {
        const res = await scheduleApi.getById(s.id)
        if (res.data?.success && res.data?.data) {
          fillEditForm({ ...s, ...res.data.data })
        }
      } catch (err) {
        console.error('Edit schedule detail fetch error:', err)
      } finally {
        setEditLoading(false)
      }
    } catch (err) {
      console.error('openEditModal error:', err)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingSchedule) return
    if (!form.date || !form.time) { dialog.error('Date and time are required.', 'Validation error'); return }
    if (!form.residentId) { dialog.error('Resident is required.', 'Validation error'); return }
    const confirmed = await confirmUpdate('schedule', 'Please confirm that you want to save the changes to this schedule.')
    if (!confirmed) return
    setSaving(true)
    try {
      const validBhws = assignedBhws.filter(b => b.name && b.name.trim() !== '')
      const validHcps = healthcareProfessionals.filter(h => h.name && h.name.trim() !== '')
      await scheduleApi.update(editingSchedule.id, {
        date: form.date, time: form.time, type: form.type || 'Checkup',
        checkupCategory: form.type === 'Referral' ? '' : (form.checkupCategory || ''),
        purpose: form.purpose || '', notes: form.additionalInfo || '',
        locationDetails: form.locationDescription || '', locationPurok: handledPurok || form.locationPurok || '',
        contactPerson: form.contactPerson || '', contactNumber: form.contactNumber || '',
        residentContactNumber: form.residentContactNumber || '', duration: 30,
        referralDestinationType: form.referralDestinationType || '',
        referralFacilityName: form.referralFacilityName || '',
        referralFacilityAddress: form.referralFacilityAddress || '',
        ...(editStatusOverride ? { status: editStatusOverride } : {}),
        assignedBhws: validBhws.map(b => ({ bhwId: b.bhwId, id: b.bhwId, name: b.name, contactNumber: b.contactNumber, customName: (b.name || '').trim() })),
        healthcareProfessionals: validHcps.map(h => ({ hcpId: h.hcpId, id: h.hcpId, name: h.name, contact: h.contact, customName: h.hcpId ? undefined : (h.name || '').trim() }))
      })
      setShowEditModal(false)
      setEditingSchedule(null)
      setEditStatusOverride(null)
      fetchMine()
      dialog.toast('Schedule updated successfully.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to update schedule', 'Unable to update schedule')
    } finally {
      setSaving(false)
    }
  }

  const markAttendance = async (residentId, attendanceStatus) => {
    if (!selected) return
    const confirmed = await confirmMutation({
      title: 'Update attendance?',
      message: `Please confirm that you want to mark this participant as ${attendanceStatus}.`,
      confirmText: 'Update attendance',
    })
    if (!confirmed) return
    try {
      await scheduleApi.updateParticipant(selected.id, residentId, { attendanceStatus })
      const res = await scheduleApi.getById(selected.id)
      if (res.data.success) setSelected({ ...selected, ...res.data.data })
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to update attendance', 'Unable to update attendance')
    }
  }

  const handleDelete = async (id) => {
    actionClickRef.current = true
    const confirmed = await dialog.confirm({
      title: 'Delete schedule?',
      message: 'This schedule will be permanently deleted. This cannot be undone.',
      confirmText: 'Delete schedule',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await scheduleApi.delete(id)
      setSchedules(prev => prev.filter(s => s.id !== id))
      closeDetail()
      dialog.toast('Schedule deleted.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to delete schedule', 'Unable to delete schedule')
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.residentId || !form.date || !form.time) { dialog.error('Resident, date, and time are required.', 'Validation error'); return }
    if (form.type && !allowedFormTypes.includes(form.type)) {
      dialog.error(`${form.type} is not applicable to this resident.`, 'Validation error')
      return
    }
    const validBhws = assignedBhws.filter(b => b.name && b.name.trim() !== '')
    const validHcps = healthcareProfessionals.filter(h => h.name && h.name.trim() !== '')
    const conflictedBhws = validBhws.filter(b => b.bhwId && getConflictSchedule(b.bhwId))
    const conflictedHcps = validHcps.filter(h => h.hcpId && getConflictSchedule(h.hcpId))
    if (conflictedBhws.length > 0 || conflictedHcps.length > 0) {
      const bhwMsg = conflictedBhws.map(b => `${b.name} — ${workerConflictNote(b.bhwId)}`).join('\n')
      const hcpMsg = conflictedHcps.map(h => `${h.name} — ${workerConflictNote(h.hcpId)}`).join('\n')
      dialog.error(`These health workers already have a schedule at ${form.date} ${form.time}:\n\n${[bhwMsg, hcpMsg].filter(Boolean).join('\n')}\n\nPlease remove them or pick a different date/time.`, 'Schedule conflict')
      return
    }
    const confirmed = await confirmCreate('schedule', 'Please confirm that you want to create this schedule.')
    if (!confirmed) return
    setSaving(true)
    try {
      await scheduleApi.create({
        scope: 'individual',
        residentId: form.residentId,
        date: form.date,
        time: form.time,
        type: form.type || 'Checkup',
        checkupCategory: form.type === 'Referral' ? '' : (form.checkupCategory || ''),
        purpose: form.purpose || '',
        notes: form.additionalInfo || '',
        locationDetails: form.locationDescription || '',
        locationPurok: handledPurok || form.locationPurok || '',
        contactPerson: form.contactPerson || '',
        contactNumber: form.contactNumber || '',
        residentContactNumber: form.residentContactNumber || '',
        duration: 30,
        referralDestinationType: form.referralDestinationType || '',
        referralFacilityName: form.referralFacilityName || '',
        referralFacilityAddress: form.referralFacilityAddress || '',
        assignedBhws: validBhws.map(b => ({ bhwId: b.bhwId, id: b.bhwId, name: b.name, contactNumber: b.contactNumber, customName: (b.name || '').trim() })),
        healthcareProfessionals: validHcps.map(h => ({ hcpId: h.hcpId, id: h.hcpId, name: h.name, contact: h.contact, customName: h.hcpId ? undefined : (h.name || '').trim() }))
      })
      setShowAdd(false)
      setForm({ residentId: '', date: '', time: '', type: 'Checkup', purpose: '', additionalInfo: '', checkupCategory: 'Health Center', locationDescription: '', locationPurok: handledPurok || '', contactPerson: '', contactNumber: '', residentContactNumber: '', referralDestinationType: '', referralFacilityName: '', referralFacilityAddress: '' })
      setAssignedBhws([{ bhwId: meBhwId, name: meBhwName, contactNumber: meBhwContact }])
      setHealthcareProfessionals([{ hcpId: '', name: '', contact: '' }])
      fetchMine()
      dialog.toast('Schedule created successfully.', 'success')
      // Saving returns to the previous page when the add flow came from elsewhere.
      if (formReturn) {
        const dest = formReturn
        setFormReturn(null)
        navigate(dest.to, { state: dest.state })
      }
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to create schedule', 'Unable to create schedule')
    } finally {
      setSaving(false)
    }
  }

  // Same filter pipeline as admin: scope + status + search, sorted by date.
  const filtered = schedules
    .filter(s => scopeFilter === 'all' || s.scope === scopeFilter)
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => {
      if (!searchTerm) return true
      const q = searchTerm.toLowerCase()
      return s.residentName?.toLowerCase().includes(q) || s.type?.toLowerCase().includes(q) ||
        s.programName?.toLowerCase().includes(q) || s.purokName?.toLowerCase().includes(q) ||
        s.purpose?.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const hasActiveFilters = scopeFilter !== 'all' || statusFilter !== 'all' || searchTerm !== ''

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paged = hasActiveFilters ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const dayModalSchedules = selectedDate?.dateStr
    ? filtered.filter(s => s.date && s.date.startsWith(selectedDate.dateStr))
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

  const getScopeIcon = scope => {
    switch (scope) {
      case 'individual': return <User className='w-4 h-4' />
      case 'purok': return <MapPin className='w-4 h-4' />
      case 'barangay': return <Building2 className='w-4 h-4' />
      default: return <User className='w-4 h-4' />
    }
  }
  const getScopeColor = scope => {
    switch (scope) {
      case 'individual': return 'bg-blue-500/20 text-blue-300 border-blue-400/30'
      case 'purok': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
      case 'barangay': return 'bg-purple-500/20 text-purple-300 border-purple-400/30'
      default: return 'bg-blue-500/20 text-blue-300 border-blue-400/30'
    }
  }
  const getScopeLabel = scope => {
    switch (scope) {
      case 'individual': return 'Individual'
      case 'purok': return 'Purok'
      case 'barangay': return 'Barangay'
      default: return 'Individual'
    }
  }

  const getScheduleResidentAge = (schedule) => {
    if (schedule.residentAgeDisplay) return schedule.residentAgeDisplay
    const r = residents.find(res => String(res.id) === String(schedule.residentId))
    if (r?.dateOfBirth) return formatAge(r.age, r.dateOfBirth)
    if (schedule.residentAge != null) return `${schedule.residentAge}y`
    return null
  }

  // Assignment stats for the Schedules tab — computed from the BHW's own
  // schedules so they stay in sync with the list below.
  const totalAssigned = schedules.length
  const completedCount = schedules.filter(s => s.status === 'Completed').length
  const missedCount = schedules.filter(s => s.status === 'Missed').length
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0

  if (loading) {
    return <SkeletonMySchedulesPage count={5} />
  }

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>My Schedules</h1>
          <p className='text-sm text-white/75'>{filtered.length} schedule{filtered.length !== 1 ? 's' : ''}{hasActiveFilters && ' (filtered)'}</p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} title='New Schedule' onClick={() => setShowAdd(true)}>
          <span className='hidden sm:inline'>New Schedule</span>
        </GlassButton>
      </div>

          <div className='relative min-w-0'>
            <div
              onScroll={event => {
                const element = event.currentTarget
                const maxScroll = element.scrollWidth - element.clientWidth
                const progress = maxScroll > 0 ? element.scrollLeft / maxScroll : 0
                if (statScrollIndicatorRef.current) {
                  statScrollIndicatorRef.current.style.left = `${progress * 72}%`
                }
              }}
              className='dashboard-stat-scroll flex flex-nowrap touch-pan-x overscroll-x-contain lg:grid lg:grid-cols-4 gap-3 overflow-x-auto pb-3 lg:overflow-visible lg:pb-0'
            >
              <StatCard label='Assigned' value={totalAssigned} icon={Calendar} color='blue' />
              <StatCard label='Completed' value={completedCount} icon={Check} color='green' />
              <StatCard label='Missed' value={missedCount} icon={X} color='red' />
              <StatCard label='Completion' value={`${completionRate}%`} icon={Clock} color='purple' />
            </div>
            <div className='dashboard-stat-scroll-indicator lg:hidden' aria-hidden='true'>
              <span ref={statScrollIndicatorRef} />
            </div>
          </div>

      <div className='space-y-3'>
        <div className='flex items-end gap-2 sm:block'>
          <div className='min-w-0 flex-1 sm:w-full'>
            <GlassInput className='h-[42px] sm:h-auto' icon={Search} placeholder='Search by resident, program, type, or purok...' value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className='flex h-[42px] self-stretch shrink-0 bg-white/10 rounded-lg p-0.5 border border-white/20 sm:hidden'>
            <button aria-label='List view' title='List view' onClick={() => setViewMode('list')} className={`px-2.5 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><List className='w-5 h-5' /></button>
            <button aria-label='Calendar view' title='Calendar view' onClick={() => setViewMode('calendar')} className={`px-2.5 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center ${viewMode === 'calendar' ? 'bg-blue-500/40 text-blue-200' : 'text-white/75 hover:text-white'}`}><CalendarDays className='w-5 h-5' /></button>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
          <div className='flex w-full gap-2 sm:hidden'>
            <GlassSelect aria-label='Filter by scope' value={scopeFilter} onChange={setScopeFilter} allowCustom={false} size='sm' className='flex-1 min-w-0' options={[{ value: 'all', label: 'All Scopes' }, { value: 'individual', label: 'Individual' }, { value: 'purok', label: 'Purok' }, { value: 'barangay', label: 'Barangay' }]} />
            <GlassSelect aria-label='Filter by status' value={statusFilter} onChange={setStatusFilter} allowCustom={false} size='sm' className='flex-1 min-w-0' options={[{ value: 'all', label: 'All Statuses' }, { value: 'Scheduled', label: 'Scheduled' }, { value: 'Completed', label: 'Completed' }, { value: 'Missed', label: 'Missed' }, { value: 'Cancelled', label: 'Cancelled' }]} />
          </div>
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/85 py-1.5 sm:py-2 mr-0.5 sm:mr-1 font-semibold'>Scope:</span>
          {[['all', 'All Scopes'], ['individual', 'Individual'], ['purok', 'Purok'], ['barangay', 'Barangay']].map(([v, label]) => (
            <button key={v} onClick={() => setScopeFilter(v)} className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all items-center gap-1 sm:gap-1.5 ${scopeFilter === v ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40' : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'}`}>{v !== 'all' && getScopeIcon(v)}{label}</button>
          ))}
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/85 py-1.5 sm:py-2 mr-0.5 sm:mr-1 ml-2 sm:ml-3 font-semibold'>Status:</span>
          {['all', 'Scheduled', 'Completed', 'Missed', 'Cancelled'].map(f => (
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
          <CalendarView month={currentMonth.getMonth()} year={currentMonth.getFullYear()} onPrevMonth={goToPreviousMonth} onNextMonth={goToNextMonth} onToday={goToToday} getSchedulesForDate={dateStr => filtered.filter(s => s.date && s.date.startsWith(dateStr))} onSelectDay={handleSelectDay} onSelectSchedule={schedule => openDetail(schedule)} showToday={false} />
        </GlassCard>
      )}

      {viewMode === 'list' && (
        <>
          {filtered.length > 0 ? (
            <div className='space-y-4'>
              {paged.map(schedule => (
                <GlassCard key={schedule.id} className='!px-2 sm:!px-6' onClick={() => { if (!actionClickRef.current) openDetail(schedule); actionClickRef.current = false }}>
                  <div className='flex flex-row items-start lg:items-center justify-between gap-2 lg:gap-4'>
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
                          <span className='flex items-center space-x-1'><Clock className='w-4 h-4' /><span>{formatTime(schedule.time)}</span></span>
                          <span className='px-2 py-0.5 rounded bg-white/5 text-xs'>{schedule.type}</span>
                          {schedule.scope === 'individual' && getScheduleResidentAge(schedule) && <span>{getScheduleResidentAge(schedule)}{schedule.residentGender ? `, ${schedule.residentGender}` : ''}</span>}
                          {schedule.scope === 'purok' && schedule.purokName && <span className='flex items-center space-x-1'><MapPin className='w-3.5 h-3.5' /><span>{schedule.purokName}</span></span>}
                          {schedule.scope === 'barangay' && <span className='flex items-center space-x-1'><Building2 className='w-3.5 h-3.5' /><span>Whole Barangay</span></span>}
                        </div>
                      </div>
                    </div>
                    <div className='flex shrink-0 items-center space-x-2'>
                      <div className='flex space-x-1' onClick={e => e.stopPropagation()}>
                        {schedule.scope === 'individual' && schedule.status === 'Scheduled' && (
                          <button onClick={(e) => { e.stopPropagation(); openEditModal(schedule) }} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400 transition-colors' title='Edit Schedule'><Pencil className='w-4 h-4' /></button>
                        )}
                        <button onClick={() => handleDelete(schedule.id)} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400 transition-colors' title='Delete Schedule'><Trash2 className='w-4 h-4' /></button>
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
          {!hasActiveFilters && <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} total={filtered.length} perPage={perPage} hidePageIndicatorOnMobile />}
        </>
      )}

      {/* Day Schedules Modal (calendar day with multiple schedules) */}
      <Modal
        isOpen={showDayModal}
        onClose={() => setShowDayModal(false)}
        title={dayModalTitle}
        size='md'
      >
        <div className='space-y-2'>
          {paginatedDayModalSchedules.map(schedule => (
            <div
              key={schedule.id}
              className='bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/[0.07]'
              onClick={() => openDetail(schedule)}
            >
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-white text-sm font-medium'>
                    {schedule.scope === 'individual' ? schedule.residentName : schedule.programName || schedule.type}
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
      </Modal>

      {/* Schedule Details — matches admin layout */}
      <Modal isOpen={!!selected} onClose={closeDetail} title='Schedule Details' panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none' bodyClassName='p-4 sm:p-6 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'>
        {detailLoading ? (
          <SkeletonScheduleDetailModal />
        ) : selected ? (
          <div className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold text-white'>{selected.programName || selected.type || 'Schedule'}</h3>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(selected.status)}`}>{selected.status}</span>
            </div>

            {/* Schedule Info */}
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Date</label>
                <p className='text-sm text-white/85'>{selected.date ? new Date(selected.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</p>
              </div>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Time</label>
                <p className='text-sm text-white/85'>{formatTime(selected.time) || '—'}</p>
              </div>
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Scope</label>
                <p className='text-sm text-white/85 capitalize'>{selected.scope || '—'}</p>
              </div>
              {selected.scope === 'individual' ? (
                <>
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Type</label>
                    <p className='text-sm text-white/85'>{selected.type || '—'}</p>
                  </div>
                  {selected.type !== 'Referral' && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Service Location</label>
                      <p className='text-sm text-white/85'>{selected.checkupCategory || selected.serviceCategory || '—'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Duration</label>
                  <p className='text-sm text-white/85'>{selected.duration ? (selected.duration >= 60 ? `${Math.floor(selected.duration / 60)}hr ${selected.duration % 60 ? `${selected.duration % 60}min` : ''}`.trim() : `${selected.duration}min`) : '—'}</p>
                </div>
              )}
            </div>

            <hr className='border-white/10' />

            {/* Resident (individual) */}
            {selected.scope === 'individual' && selected.residentName && (
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Resident</label>
                  <p className='text-sm text-white/85'>{selected.residentName}</p>
                </div>
                {(selected.residentContactNumber || selected.resident?.contactNumber || selected.residentContact) && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'><span className='sm:hidden'>Contact Number</span><span className='hidden sm:inline'>Resident Contact Number</span></label>
                    <p className='text-sm text-white/85'>{selected.residentContactNumber || selected.resident?.contactNumber || selected.residentContact}</p>
                  </div>
                )}
              </div>
            )}

            {/* Referral Details (LGU Referral / Referral) */}
            {(selected.type === 'LGU Referral' || selected.type === 'Referral') && (selected.referralDestinationType || selected.referralFacilityName || selected.referralFacilityAddress) && (
              <div className='space-y-3'>
                <div className='grid grid-cols-2 gap-4'>
                  {selected.referralDestinationType && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Type</label>
                      <p className='text-sm text-white/85'>{selected.referralDestinationType}</p>
                    </div>
                  )}
                  {selected.referralFacilityName && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Name</label>
                      <p className='text-sm text-white/85'>{selected.referralFacilityName}</p>
                    </div>
                  )}
                </div>
                {selected.referralFacilityAddress && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Facility Location</label>
                    <p className='text-sm text-white/85'>{selected.referralFacilityAddress}</p>
                  </div>
                )}
              </div>
            )}

            {/* Program Info (purok/barangay) */}
            {(selected.scope === 'purok' || selected.scope === 'barangay') && (
              <div className='grid grid-cols-2 gap-4'>
                {selected.targetGroup && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Target Group</label>
                    <p className='text-sm text-white/85'>{selected.targetGroup}</p>
                  </div>
                )}
                {selected.scope === 'barangay' && selected.purokName && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selected.purokName}</p>
                  </div>
                )}
                {selected.targetCount && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Target Count</label>
                    <p className='text-sm text-white/85'>{selected.targetCount}</p>
                  </div>
                )}
                {selected.scope === 'purok' && selected.purokName && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selected.purokName}</p>
                  </div>
                )}
                {selected.venue && (
                  <div className='col-span-2 sm:col-span-1'>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Venue</label>
                    <p className='text-sm text-white/85'>{selected.venue}</p>
                  </div>
                )}
                {selected.scope !== 'barangay' && selected.maxParticipants && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Max Participants</label>
                    <p className='text-sm text-white/85'>{selected.maxParticipants}</p>
                  </div>
                )}
              </div>
            )}

            {/* Purpose */}
            {selected.purpose && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purpose</label>
                <p className='text-sm text-white/85'>{selected.purpose}</p>
              </div>
            )}

            <hr className='border-white/10' />

            {/* Location */}
            {(selected.locationDetails || (selected.purokName && selected.scope === 'individual')) && (
              <div className='grid grid-cols-2 gap-4'>
                {selected.locationDetails && (
                  <div className='col-span-2 sm:col-span-1'>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Location</label>
                    <p className='text-sm text-white/85'>{selected.locationDetails}</p>
                  </div>
                )}
                {(selected.locationPurok || selected.purokName) && selected.scope === 'individual' && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Purok</label>
                    <p className='text-sm text-white/85'>{selected.locationPurok || selected.purokName}</p>
                  </div>
                )}
              </div>
            )}

            {/* Contact */}
            {(selected.contactPerson || selected.contactNumber) && (
              <div className='grid grid-cols-2 gap-4'>
                {selected.contactPerson && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Contact Person</label>
                    <p className='text-sm text-white/85'>{selected.contactPerson}</p>
                  </div>
                )}
                {selected.contactNumber && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Contact Person Number</label>
                    <p className='text-sm text-white/85'>{selected.contactNumber}</p>
                  </div>
                )}
              </div>
            )}

            {/* Coordinator */}
            {(selected.coordinatorName || selected.coordinatorContact || selected.partnerOrganization) && (
              <>
                <div className='grid grid-cols-2 gap-4'>
                  {selected.coordinatorName && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Coordinator</label>
                      <p className='text-sm text-white/85'>{selected.coordinatorName}</p>
                    </div>
                  )}
                  {selected.coordinatorContact && (
                    <div>
                      <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Coordinator Contact</label>
                      <p className='text-sm text-white/85'>{selected.coordinatorContact}</p>
                    </div>
                  )}
                </div>
                {selected.partnerOrganization && (
                  <div>
                    <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Partner Organization</label>
                    <p className='text-sm text-white/85'>{selected.partnerOrganization}</p>
                  </div>
                )}
              </>
            )}

            <hr className='border-white/10' />

            {/* Assigned BHWs */}
            {selected.assignedBhws && selected.assignedBhws.length > 0 && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1.5'>Assigned BHWs</label>
                <div className='flex flex-wrap gap-2'>
                  {selected.assignedBhws.map((b, i) => (
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
            {selected.healthcareProfessionals && selected.healthcareProfessionals.length > 0 && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1.5'>Healthcare Professionals</label>
                <div className='flex flex-wrap gap-2'>
                  {selected.healthcareProfessionals.map((hp, i) => (
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
            {selected.notes && (
              <div>
                <label className='block text-[11px] text-blue-200/70 font-medium uppercase tracking-wide mb-1'>Notes</label>
                <p className='text-sm text-white/85'>{selected.notes}</p>
              </div>
            )}

            <hr className='border-white/10' />

            {/* Buttons — hidden for purok/barangay scope */}
            {selected.scope !== 'purok' && selected.scope !== 'barangay' && (
            <div className='flex flex-wrap items-center gap-2 mb-6 pb-2 sm:mb-0 sm:pb-0'>
              {(selected.status === 'Missed' || selected.status === 'Cancelled') && (
                <GlassButton aria-label='Reschedule schedule' variant='secondary' icon={Calendar} onClick={openRescheduleEdit} className='flex-1'><span className='hidden sm:inline'>Reschedule</span></GlassButton>
              )}
              {selected.status === 'Completed' && (
                <GlassButton aria-label='Schedule again' variant='secondary' icon={Plus} onClick={openRescheduleEdit} className='flex-1'><span className='hidden sm:inline'>Schedule Again</span></GlassButton>
              )}
              {selected.status !== 'Completed' && selected.status !== 'Cancelled' && (
                <GlassButton aria-label='Complete schedule' variant='solid-success' icon={Check} onClick={handleCompleteClick} className='flex-1'><span className='hidden sm:inline'>Complete</span></GlassButton>
              )}
              {selected.status === 'Scheduled' && (
                <GlassButton aria-label='Cancel schedule' variant='secondary' icon={X} onClick={() => updateStatus('Cancelled')} className='flex-1'><span className='hidden sm:inline'>Cancel</span></GlassButton>
              )}
              <GlassButton className='shrink-0' variant='solid-primary' icon={Pencil} title={selected.status === 'Scheduled' ? 'Edit Schedule' : 'Locked - use Reschedule or Schedule Again'} disabled={selected.status !== 'Scheduled'} onClick={() => openEditModal(selected)} />
              <GlassButton className='shrink-0' variant='solid-danger' icon={Trash2} onClick={() => handleDelete(selected.id)} />
            </div>
            )}
          </div>
        ) : (
          <SkeletonScheduleDetailModal />
        )}
      </Modal>

      {/* Complete-flow: resident's Add Medical Record linked to the schedule.
          Prefilled with Schedule Details info; the schedule flips to
          Completed only after save. */}
      <Modal
        isOpen={showCompleteFlow}
        onClose={() => setShowCompleteFlow(false)}
        title='Complete Schedule — Add Medical Record'
        size='xl'
        bodyClassName='p-4 sm:p-6 max-h-[80vh] overflow-y-auto'
      >
        {showCompleteFlow && selected?.residentId && (
          <ResidentDetail
            residentId={selected.residentId}
            embedded
            onClose={() => setShowCompleteFlow(false)}
            completeSchedule={buildCompletePrefill(selected)}
            onScheduleCompleted={handleScheduleCompleted}
          />
        )}
      </Modal>

      {/* New Schedule — individual scope under her own name (server-enforced) */}
      <Modal isOpen={showAdd} onClose={closeAdd} title='New Schedule' size='xl'>
        <form onSubmit={handleAdd} className='max-h-[70vh] overflow-y-auto space-y-4'>
          <GlassSelect label='Resident *' value={form.residentId} allowCustom placeholder='Select resident...' onChange={v => { const r = residents.find(res => String(res.id) === v); setForm(prev => ({ ...prev, residentId: v, locationPurok: handledPurok || prev.locationPurok, contactPerson: r?.contactPerson || '', contactNumber: r?.contactPersonNumber || r?.contactNumber || '', residentContactNumber: r?.contactNumber || '', type: getAllowedIndividualTypes(r).includes(prev.type) ? prev.type : '' })) }} options={[...[...residents].sort((a, b) => a.name?.localeCompare(b.name)).map(r => ({ value: String(r.id), label: `${r.name} (${formatResidentAge(r)}, ${r.gender})` }))]} required />
          {residents.length === 0 && (
            <p className='text-xs text-amber-300/90'>No residents found in your handled purok or focus group.</p>
          )}
          <div className='grid grid-flow-col grid-cols-2 gap-3 items-stretch sm:hidden'>
            <GlassInput label='Date *' type='date' className='min-w-0' value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} required min={new Date().toISOString().split('T')[0]} />
            <GlassInput label='Time *' type='time' className='min-w-0' value={form.time} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} required />
          </div>
          <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
            <GlassInput label='Date *' type='date' value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} required min={new Date().toISOString().split('T')[0]} />
            <GlassInput label='Time *' type='time' value={form.time} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} required />
            <GlassSelect label='Type *' value={form.type} allowCustom onChange={v => setForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required />
          </div>
          <div className='sm:hidden'><GlassSelect label='Type *' value={form.type} allowCustom onChange={v => setForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required /></div>
          {form.type !== 'Referral' && <div className='sm:hidden'><GlassSelect label='Service Location' value={form.checkupCategory} onChange={v => setForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>}
          {form.type !== 'Referral' && <div className='hidden sm:block'><GlassSelect label='Service Location' value={form.checkupCategory} onChange={v => setForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>}

          {formResident && hiddenFormTypeReasons.length > 0 && (
            <p className='text-xs text-white/50 -mt-2'>Not applicable to this resident: {hiddenFormTypeReasons.join(' · ')}</p>
          )}

          {form.type === 'Referral' ? (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <GlassSelect label='Facility Type' value={form.referralDestinationType} onChange={v => setForm(prev => ({ ...prev, referralDestinationType: v }))} options={[{ value: 'Hospital', label: 'Hospital' }, { value: 'Laboratory', label: 'Laboratory' }, { value: 'Clinic', label: 'Clinic' }, { value: 'Specialist', label: 'Specialist' }]} placeholder='e.g., Hospital, Laboratory, Specialist' />
                <GlassInput label='Facility Name' value={form.referralFacilityName} onChange={e => setForm(prev => ({ ...prev, referralFacilityName: e.target.value }))} placeholder='Facility name' />
              </div>
              <GlassInput label='Facility Location' value={form.referralFacilityAddress} onChange={e => setForm(prev => ({ ...prev, referralFacilityAddress: e.target.value }))} placeholder='Facility address' />
            </div>
          ) : null}

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose</label>
            <textarea value={form.purpose} onChange={e => setForm(prev => ({ ...prev, purpose: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Reason for visit...' />
          </div>

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Location & Contact</label>
            <div className='grid grid-cols-[2fr_1fr] gap-3 sm:hidden'>
              <div className='min-w-0'><GlassInput label='Location Description' value={form.locationDescription} onChange={e => setForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' /></div>
              <GlassInput label='Purok' value={handledPurok || form.locationPurok} disabled title='Fixed to your handled purok' placeholder='Purok' />
              <div className='col-span-2 grid grid-cols-2 gap-3'>
                <GlassInput label='Contact Person' value={form.contactPerson} onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.contactNumber} onChange={e => setForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.residentContactNumber} onChange={e => setForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
              </div>
            </div>
            <div className='hidden sm:block space-y-3'>
              <GlassInput label='Location Description' value={form.locationDescription} onChange={e => setForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' />
              <div className='grid grid-cols-3 gap-3'>
                <GlassInput label='Purok' value={handledPurok || form.locationPurok} disabled title='Fixed to your handled purok' placeholder='Purok' />
                <GlassInput label='Contact Person' value={form.contactPerson} onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.contactNumber} onChange={e => setForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
              </div>
              <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.residentContactNumber} onChange={e => setForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
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
                  <div className='min-w-0'><WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} /></div>
                  <div className='min-w-0'><GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' /></div>
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
                  <div className='min-w-0'><WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} /></div>
                  <div className='min-w-0'><GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' /></div>
                  <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                </div>
              ))}
            </div>
          </div>

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Additional Information</label>
            <textarea value={form.additionalInfo} onChange={e => setForm(prev => ({ ...prev, additionalInfo: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Requirements, preparation instructions...' />
          </div>
          <div className='flex !flex-row !flex-nowrap justify-end gap-3 pt-0 sm:pt-4'>
            <GlassButton className='w-auto shrink-0' variant='secondary' type='button' onClick={closeAdd}>Cancel</GlassButton>
            <GlassButton className='w-auto shrink-0' type='submit' loading={saving}>Create Schedule</GlassButton>
          </div>
        </form>
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setEditingSchedule(null); setEditStatusOverride(null) }} title='Edit Schedule' size='xl'>
        <form onSubmit={handleEditSubmit} className='max-h-[70vh] overflow-y-auto space-y-4'>
          <GlassSelect label='Resident *' value={form.residentId} allowCustom placeholder='Select resident...' onChange={v => { const r = residents.find(res => String(res.id) === v); setForm(prev => ({ ...prev, residentId: v, locationPurok: handledPurok || prev.locationPurok, contactPerson: r?.contactPerson || '', contactNumber: r?.contactPersonNumber || r?.contactNumber || '', residentContactNumber: r?.contactNumber || '', type: getAllowedIndividualTypes(r).includes(prev.type) ? prev.type : '' })) }} options={(() => {
            const opts = [...[...residents].sort((a, b) => a.name?.localeCompare(b.name)).map(r => ({ value: String(r.id), label: `${r.name} (${formatResidentAge(r)}, ${r.gender})` }))]
            // Keep the schedule's linked resident visible even when it is
            // outside the worker's handled list.
            if (form.residentId && !opts.some(o => String(o.value) === String(form.residentId))) {
              opts.push({ value: String(form.residentId), label: editingSchedule?.residentName || `Resident #${form.residentId}` })
            }
            return opts
          })()} required />
          <div className='grid grid-flow-col grid-cols-2 gap-3 items-stretch sm:hidden'>
            <GlassInput label='Date *' type='date' className='min-w-0' value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} required />
            <GlassInput label='Time *' type='time' className='min-w-0' value={form.time} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} required />
          </div>
          <div className='hidden sm:grid sm:grid-cols-3 gap-3 items-stretch'>
            <GlassInput label='Date *' type='date' value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} required />
            <GlassInput label='Time *' type='time' value={form.time} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} required />
            <GlassSelect label='Type *' value={form.type} allowCustom onChange={v => setForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required />
          </div>
          <div className='sm:hidden'><GlassSelect label='Type *' value={form.type} allowCustom onChange={v => setForm(prev => ({ ...prev, type: v }))} options={formTypeOptions} placeholder='Choose type...' required /></div>
          {form.type !== 'Referral' && <div className='sm:hidden'><GlassSelect label='Service Location' value={form.checkupCategory} onChange={v => setForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>}
          {form.type !== 'Referral' && <div className='hidden sm:block'><GlassSelect label='Service Location' value={form.checkupCategory} onChange={v => setForm(prev => ({ ...prev, checkupCategory: v }))} options={serviceLocations.map(c => ({ value: c, label: c }))} /></div>}

          {formResident && hiddenFormTypeReasons.length > 0 && (
            <p className='text-xs text-white/50 -mt-2'>Not applicable to this resident: {hiddenFormTypeReasons.join(' · ')}</p>
          )}

          {form.type === 'Referral' ? (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <GlassSelect label='Facility Type' value={form.referralDestinationType} onChange={v => setForm(prev => ({ ...prev, referralDestinationType: v }))} options={[{ value: 'Hospital', label: 'Hospital' }, { value: 'Laboratory', label: 'Laboratory' }, { value: 'Clinic', label: 'Clinic' }, { value: 'Specialist', label: 'Specialist' }]} placeholder='e.g., Hospital, Laboratory, Specialist' />
                <GlassInput label='Facility Name' value={form.referralFacilityName} onChange={e => setForm(prev => ({ ...prev, referralFacilityName: e.target.value }))} placeholder='Facility name' />
              </div>
              <GlassInput label='Facility Location' value={form.referralFacilityAddress} onChange={e => setForm(prev => ({ ...prev, referralFacilityAddress: e.target.value }))} placeholder='Facility address' />
            </div>
          ) : null}

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Purpose</label>
            <textarea value={form.purpose} onChange={e => setForm(prev => ({ ...prev, purpose: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Reason for visit...' />
          </div>

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Location & Contact</label>
            <div className='grid grid-cols-[2fr_1fr] gap-3 sm:hidden'>
              <div className='min-w-0'><GlassInput label='Location Description' value={form.locationDescription} onChange={e => setForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' /></div>
              <GlassInput label='Purok' value={handledPurok || form.locationPurok} disabled title='Fixed to your handled purok' placeholder='Purok' />
              <div className='col-span-2 grid grid-cols-2 gap-3'>
                <GlassInput label='Contact Person' value={form.contactPerson} onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.contactNumber} onChange={e => setForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
                <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.residentContactNumber} onChange={e => setForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
              </div>
            </div>
            <div className='hidden sm:block space-y-3'>
              <GlassInput label='Location Description' value={form.locationDescription} onChange={e => setForm(prev => ({ ...prev, locationDescription: e.target.value }))} placeholder='e.g., Near the basketball court' />
              <div className='grid grid-cols-3 gap-3'>
                <GlassInput label='Purok' value={handledPurok || form.locationPurok} disabled title='Fixed to your handled purok' placeholder='Purok' />
                <GlassInput label='Contact Person' value={form.contactPerson} onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder='Name' />
                <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.contactNumber} onChange={e => setForm(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
              </div>
              <GlassInput label='Resident Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.residentContactNumber} onChange={e => setForm(prev => ({ ...prev, residentContactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
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
                  <div className='min-w-0'><WorkerNamePicker label={idx === 0 ? 'Professional' : ''} name={hp.name} suggestions={hcpSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleHCPPick(idx, item, text)} /></div>
                  <div className='min-w-0'><GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={hp.contact} onChange={e => { const updated = [...healthcareProfessionals]; updated[idx] = { ...updated[idx], contact: sanitizePhoneInput(e.target.value) }; setHealthcareProfessionals(updated) }} placeholder='Phone' /></div>
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
                  <div className='min-w-0'><WorkerNamePicker label={idx === 0 ? 'BHW' : ''} name={b.name} suggestions={bhwSuggestions(idx)} placeholder='Type or pick name...' onPick={(item, text) => handleBHWPick(idx, item, text)} /></div>
                  <div className='min-w-0'><GlassInput label={idx === 0 ? 'Contact' : ''} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={b.contactNumber} onChange={e => { const updated = [...assignedBhws]; updated[idx] = { ...updated[idx], contactNumber: sanitizePhoneInput(e.target.value) }; setAssignedBhws(updated) }} placeholder='Phone' /></div>
                  <button type='button' onClick={() => handleRemoveBHW(idx)} className='-ml-1 -mr-2 sm:ml-0 sm:mr-0 text-red-400 hover:text-red-300 flex items-center justify-center h-[38px]'><X className='w-4 h-4' /></button>
                </div>
              ))}
            </div>
          </div>

          <hr className='border-white/10' />

          <div>
            <label className="block text-xs text-blue-200 font-medium mb-1.5">Additional Information</label>
            <textarea value={form.additionalInfo} onChange={e => setForm(prev => ({ ...prev, additionalInfo: e.target.value }))} className='glass-textarea min-h-[80px] text-sm w-full' rows='3' placeholder='Requirements, preparation instructions...' />
          </div>
          <div className='flex !flex-row !flex-nowrap justify-end gap-3 pt-0 sm:pt-4'>
            <GlassButton className='w-auto shrink-0' variant='secondary' type='button' onClick={() => { setShowEditModal(false); setEditingSchedule(null); setEditStatusOverride(null) }}>Cancel</GlassButton>
            <GlassButton className='w-auto shrink-0' type='submit' loading={saving || editLoading}>Save Changes</GlassButton>
          </div>
          {editLoading && <p className='text-xs text-white/50 text-right'>Loading schedule details…</p>}
        </form>
      </Modal>
    </div>
  )
}

export default MySchedules
