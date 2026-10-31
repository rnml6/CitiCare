// pages/BHWDetail.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  Trash2,
  List,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  Search,
  User,
  Building2,
  Eye,
  EyeOff
} from 'lucide-react'
import { bhwApi } from '../api/bhwApi'
import { purokApi } from '../api/purokApi'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import { dialog } from '../context/DialogContext'
import { confirmUpdate } from '../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys } from '../utils/validation'
import CalendarView from '../components/CalendarView'
import { SkeletonBHWDetail, SkeletonScheduleCards, SkeletonCalendarGrid, SkeletonDayModalList } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import ConfirmModal from '../components/ConfirmModal'
import {
  getStatusColor,
  formatDate,
  formatTime
} from '../utils/helpers'
import { useSmartBack, navigateWithReturn } from '../utils/navigation'

const BHWDetail = ({ bhwId, onClose, embedded = false, onDeleted } = {}) => {
  const { id: paramId } = useParams()
  const id = bhwId || paramId
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useSmartBack('/bhw')
  const [bhw, setBhw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)

  const [scheduleView, setScheduleView] = useState('list')
  const [scheduleFilter, setScheduleFilter] = useState('all')
  const [scheduleSearch, setScheduleSearch] = useState('')
  const [schedulePage, setSchedulePage] = useState(1)
  const schedulePerPage = 6

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState(null)
  const [showDateModal, setShowDateModal] = useState(false)
  const [dateModalPage, setDateModalPage] = useState(1)
  const dateModalPerPage = 5

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [puroks, setPuroks] = useState([])
  const [allBHWs, setAllBHWs] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [showPositionDropdown, setShowPositionDropdown] = useState(false)
  const positionDropdownRef = useRef(null)
  const positionInputRef = useRef(null)
  const [editForm, setEditForm] = useState({
    name: '', position: '', contactNumber: '', email: '',
    status: 'Active', assignedPurokId: '', assignedFocusGroup: '',
    username: '', password: '', confirmPassword: '', accountRole: 'BHW Worker'
  })

  const FOCUS_GROUP_OPTIONS = useMemo(() => ([
    { value: 'infant', label: 'Infants (0-59 months)' },
    { value: 'pregnant', label: 'Pregnant' },
    { value: 'senior', label: 'Senior Citizen (60+)' },
  ]), [])

  const FOCUS_GROUP_LABELS = useMemo(() => ({
    pregnant: 'Pregnant',
    senior: 'Senior Citizen',
    infant: 'Infants',
  }), [])

  const focusGroupLabel = useCallback(
    (value) => FOCUS_GROUP_LABELS[value] || value || '',
    [FOCUS_GROUP_LABELS]
  )

  // Groups already held by other BHWs can't be picked again.
  const focusGroupHolders = useMemo(() => {
    const acc = {}
    for (const b of allBHWs) {
      if (b.assignedFocusGroup && String(b.id) !== String(id)) acc[b.assignedFocusGroup] = b.name || 'another BHW'
    }
    // Fall back to the loaded record so its own group stays selectable.
    if (bhw?.assignedFocusGroup && !acc[bhw.assignedFocusGroup]) {
      const holder = allBHWs.find(b => String(b.id) === String(id))
      if (!holder) acc[bhw.assignedFocusGroup] = bhw.name || 'another BHW'
    }
    return acc
  }, [allBHWs, bhw, id])

  const focusGroupOptions = useMemo(() => ([
    { value: '', label: 'None' },
    ...FOCUS_GROUP_OPTIONS.map(o => {
      const holder = focusGroupHolders[o.value]
      const taken = !!holder && editForm.assignedFocusGroup !== o.value
      return {
        ...o,
        label: taken ? `${o.label} — assigned to ${holder}` : o.label,
        disabled: taken,
      }
    }),
  ]), [FOCUS_GROUP_OPTIONS, focusGroupHolders, editForm.assignedFocusGroup])

  // Puroks already assigned to other BHWs show the holder and can't be
  // picked again (the record's own purok stays selectable).
  const assignedPurokHolders = useMemo(() => {
    const nameToId = {}
    for (const p of puroks) nameToId[p.name] = p.id
    const acc = {}
    for (const b of allBHWs) {
      if (String(b.id) === String(id)) continue
      const pid = b.assignedPurokId || nameToId[b.assignedPurok]
      if (pid) acc[String(pid)] = b.name || 'another BHW'
    }
    return acc
  }, [allBHWs, puroks, id])

  const assignedPurokOptions = useMemo(() => ([
    { value: '', label: 'None' },
    ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => {
      const holder = assignedPurokHolders[String(p.id)]
      const taken = !!holder && String(editForm.assignedPurokId) !== String(p.id)
      return {
        value: String(p.id),
        label: taken ? `${p.name} — assigned to ${holder}` : p.name,
        disabled: taken,
      }
    }),
  ]), [puroks, assignedPurokHolders, editForm.assignedPurokId])

  const positionPresets = [
    { label: 'Barangay Health Worker', type: 'BHW', accountRole: 'BHW Worker' },
    { label: 'Barangay Health Worker Head', type: 'BHW', accountRole: 'BHW Admin' },
    { label: 'Doctor', type: 'Doctor', accountRole: null },
    { label: 'Midwife', type: 'Midwife', accountRole: null },
    { label: 'Nurse', type: 'Nurse', accountRole: null },
  ]

  const isBHW = editForm.position === 'Barangay Health Worker' || editForm.position === 'Barangay Health Worker Head'

  const filteredPositions = editForm.position
    ? positionPresets.filter(p => p.label.toLowerCase().includes(editForm.position.toLowerCase()))
    : positionPresets

  const handlePositionChange = (value) => {
    const preset = positionPresets.find(p => p.label.toLowerCase() === value.toLowerCase())
    setEditForm(prev => {
      const updated = { ...prev, position: value }
      if (preset?.accountRole) updated.accountRole = preset.accountRole
      else updated.accountRole = 'BHW Worker'
      if (value !== 'Barangay Health Worker') updated.assignedPurokId = ''
      if (value !== 'Barangay Health Worker' && value !== 'Barangay Health Worker Head') {
        updated.username = ''; updated.password = ''; updated.confirmPassword = ''; updated.assignedFocusGroup = ''
      }
      return updated
    })
    setShowPositionDropdown(false)
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (positionDropdownRef.current && !positionDropdownRef.current.contains(e.target) && positionInputRef.current && !positionInputRef.current.contains(e.target)) setShowPositionDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchBHW()
    fetchSchedules()
  }, [id])

  const fetchBHW = async () => {
    if (!id) return
    try {
      setLoading(true)
      const response = await bhwApi.getById(id)
      if (response.data.success) {
        setBhw(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching BHW:', error)
      if (embedded) onClose?.()
      else goBack()
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async () => {
    if (!id) return
    try {
      setSchedulesLoading(true)
      const response = await bhwApi.getSchedules(id)
      if (response.data.success) {
        setSchedules(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching schedules:', error)
    } finally {
      setSchedulesLoading(false)
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try {
      await bhwApi.delete(id)
      setShowDeleteConfirm(false)
      dialog.toast('Healthcare professional deleted.', 'success')
      if (embedded) {
        onDeleted?.(id)
        onClose?.()
      } else {
        goBack()
      }
    } catch (error) {
      console.error('Error deleting BHW:', error)
      dialog.error(error.response?.data?.message || 'Failed to delete BHW', 'Unable to delete')
    }
  }

  const openEditModal = async () => {
    try {
      const [bhwRes, purokRes, allRes] = await Promise.all([
        bhwApi.getById(id),
        purokApi.getAll(),
        bhwApi.getAll().catch(() => null)
      ])
      if (purokRes.data.success) setPuroks(purokRes.data.data)
      if (allRes?.data?.success) setAllBHWs(allRes.data.data)
      if (bhwRes.data.success) {
        const d = bhwRes.data.data
        setEditForm({
          name: d.name || '', position: d.position || '',
          contactNumber: d.contactNumber || '', email: d.email || '',
          status: d.status || 'Active', assignedPurokId: d.assignedPurokId || '',
          assignedFocusGroup: d.assignedFocusGroup || '',
          username: d.username || '', password: '', confirmPassword: '',
          accountRole: d.position === 'Barangay Health Worker Head' ? 'BHW Admin' : 'BHW Worker'
        })
      }
    } catch (e) {
      console.error('Error fetching BHW for edit:', e)
    }
    setShowEditModal(true)
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    if (!editForm.name || !editForm.position) {
      dialog.error('Name and Position are required.', 'Validation error')
      return
    }
    if (isBHW && editForm.assignedPurokId && !puroks.some(p => String(p.id) === String(editForm.assignedPurokId))) {
      dialog.error('Please select a valid purok from the list.', 'Validation error')
      return
    }
    if (isBHW && editForm.assignedFocusGroup) {
      const holder = focusGroupHolders[editForm.assignedFocusGroup]
      if (holder) {
        dialog.error(`${focusGroupLabel(editForm.assignedFocusGroup)} is already assigned to ${holder}. Each focus group can only have one BHW.`, 'Focus group already assigned')
        return
      }
    }
    const confirmed = await confirmUpdate('health worker', `Please confirm that you want to save the changes to ${editForm.name}.`)
    if (!confirmed) return
    setEditSaving(true)
    try {
      const workerType = editForm.position === 'Barangay Health Worker' || editForm.position === 'Barangay Health Worker Head' ? 'BHW'
        : editForm.position === 'Nurse' ? 'Nurse' : editForm.position === 'Midwife' ? 'Midwife' : 'Doctor'
      const dataToSend = {
        name: editForm.name,
        position: editForm.position,
        contactNumber: editForm.contactNumber,
        email: editForm.email,
        status: editForm.status,
        workerType,
        accountRole: editForm.position === 'Barangay Health Worker Head' ? 'BHW Admin' : isBHW ? 'BHW Worker' : null,
        assignedPurokId: editForm.position === 'Barangay Health Worker' ? (editForm.assignedPurokId || null) : null,
        assignedFocusGroup: isBHW ? (editForm.assignedFocusGroup || null) : null
      }
      if (isBHW && editForm.username) {
        dataToSend.username = editForm.username
        if (editForm.password) dataToSend.password = editForm.password
      }
      await bhwApi.update(id, dataToSend)
      setShowEditModal(false)
      fetchBHW()
      dialog.toast('Healthcare professional updated successfully.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save')
    } finally {
      setEditSaving(false)
    }
  }

  const filteredSchedules = useMemo(() => {
    let filtered = schedules

    if (scheduleFilter !== 'all') {
      filtered = filtered.filter(s => s.status === scheduleFilter)
    }

    if (scheduleSearch) {
      const search = scheduleSearch.toLowerCase()
      filtered = filtered.filter(
        s =>
          s.residentName?.toLowerCase().includes(search) ||
          s.type?.toLowerCase().includes(search) ||
          s.purok?.toLowerCase().includes(search) ||
          s.programName?.toLowerCase().includes(search)
      )
    }

    // Sort ascending by date (earliest/upcoming first)
    return filtered.sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [schedules, scheduleFilter, scheduleSearch])

  useEffect(() => {
    setSchedulePage(1)
  }, [schedules, scheduleFilter, scheduleSearch])

  // Performance Stats are derived from the exact schedule list shown below,
  // so Total / Done / Upcoming / Missed always match the Schedules section.
  // While schedules are still loading, fall back to the backend-computed stats.
  const performanceStats = useMemo(() => {
    const totalSchedules = schedules.length
    const completedSchedules = schedules.filter(s => s.status === 'Completed').length
    const upcomingSchedules = schedules.filter(s => s.status === 'Scheduled').length
    const missedSchedules = schedules.filter(s => s.status === 'Missed').length
    return {
      totalSchedules,
      completedSchedules,
      upcomingSchedules,
      missedSchedules,
      completionRate:
        totalSchedules > 0
          ? Math.round((completedSchedules / totalSchedules) * 100)
          : 0
    }
  }, [schedules])

  const displayStats =
    schedulesLoading && schedules.length === 0
      ? bhw?.stats || performanceStats
      : performanceStats

  const totalSchedulePages = Math.ceil(
    filteredSchedules.length / schedulePerPage
  )
  const paginatedSchedules = filteredSchedules.slice(
    (schedulePage - 1) * schedulePerPage,
    schedulePage * schedulePerPage
  )

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(prev => prev - 1)
    } else setCurrentMonth(prev => prev - 1)
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(prev => prev + 1)
    } else setCurrentMonth(prev => prev + 1)
  }

  const handleSelectScheduleFromList = schedule => {
    if (embedded) onClose?.()
    navigateWithReturn(navigate, location, '/schedules', {
      viewScheduleId: schedule.id,
      // Restore this detail modal when closing Schedule Details.
      ...(embedded ? { returnState: { viewBHWId: id } } : {})
    })
  }

  const handleEditIndividualSchedule = (event, schedule) => {
    event.stopPropagation()
    if (schedule.scope !== 'individual') return
    if (embedded) onClose?.()
    navigateWithReturn(navigate, location, '/schedules', {
      editScheduleId: schedule.id,
      from: location.pathname,
      ...(embedded ? { returnState: { viewBHWId: id } } : {})
    })
  }

  const handleDateClick = (dateStr, daySchedules) => {
    const list = daySchedules || filteredSchedules.filter(s =>
      s.date?.startsWith(dateStr)
    )
    if (list.length === 0) return
    // Always open the day modal listing all schedules for the date.
    // Clicking a schedule inside the modal goes to Schedule Details.
    setSelectedDate({
      dateStr,
      date: new Date(`${dateStr}T00:00`).getDate(),
      schedules: list
    })
    setDateModalPage(1)
    setShowDateModal(true)
  }

  const handleToday = () => {
    const now = new Date()
    setCurrentMonth(now.getMonth())
    setCurrentYear(now.getFullYear())
  }

  // Reopen the date modal when returning from Schedule Details opened
  // inside it — close goes back to the previous modal.
  useEffect(() => {
    const dateStr = location.state?.viewBHWDate
    if (dateStr && !showDateModal && schedules.length > 0) {
      const list = filteredSchedules.filter(s => s.date?.startsWith(dateStr))
      if (list.length > 0) {
        setSelectedDate({
          dateStr,
          date: new Date(`${dateStr}T00:00`).getDate(),
          schedules: list
        })
        setDateModalPage(1)
        setShowDateModal(true)
      }
      window.history.replaceState({}, document.title)
    }
  }, [location.state, schedules])

  const dateModalSchedules = selectedDate?.schedules || []
  const totalDateModalPages = Math.max(1, Math.ceil(dateModalSchedules.length / dateModalPerPage))
  const safeDateModalPage = Math.min(Math.max(1, dateModalPage), totalDateModalPages)
  const paginatedDateModalSchedules = dateModalSchedules.slice(
    (safeDateModalPage - 1) * dateModalPerPage,
    safeDateModalPage * dateModalPerPage
  )

  const getScheduleStatusIcon = status => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className='w-4 h-4 text-emerald-400' />
      case 'Missed':
        return <XCircle className='w-4 h-4 text-red-400' />
      case 'Scheduled':
        return <Clock className='w-4 h-4 text-blue-400' />
      case 'Cancelled':
        return <XCircle className='w-4 h-4 text-red-400' />
      default:
        return <Clock className='w-4 h-4 text-white/65' />
    }
  }

  if (loading) return <SkeletonBHWDetail />
  if (!bhw)
    return (
      <div className='text-center py-12'>
        <p className='text-white/65'>BHW not found</p>
        <GlassButton
          variant='secondary'
          className='mt-4'
          onClick={goBack}
        >
          Back to BHW Workers
        </GlassButton>
      </div>
    )

  return (
    <div className='space-y-4 animate-fade-in'>
      {!embedded && (
        <div className='flex items-center justify-between gap-2'>
          <button
            onClick={goBack}
            className='flex items-center gap-1.5 text-xs text-white/65 hover:text-white transition-colors px-2 py-1'
          >
            <ArrowLeft className='w-3.5 h-3.5' />
            <span>Back to BHW Workers</span>
          </button>
        </div>
      )}

      {/* Header block - tight spacing, matches Resident Details */}
      <div className='space-y-1'>
      {/* Header - name row with actions */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='text-3xl font-bold text-white break-words leading-tight min-w-0'>
          {bhw.name}
        </h3>
        <div className='hidden sm:flex gap-2 shrink-0 ml-auto'>
          <GlassButton variant='solid-primary' icon={Edit} title='Edit health worker' onClick={openEditModal} />
          <GlassButton variant='solid-danger' icon={Trash2} title='Delete health worker' onClick={handleDelete} />
        </div>
      </div>

      {bhw.position && <p className='text-sm text-white/85'>{bhw.position}</p>}
      <div className='flex flex-wrap items-center gap-2'>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(bhw.status)}`}>
          {bhw.status}
        </span>
        {bhw.hasAccount ? (
          bhw.username ? (
            <span className='text-xs text-white/65'>• {bhw.username}</span>
          ) : null
        ) : (
          <span className='text-xs text-white/65'>no account</span>
        )}
        <div className='flex gap-1 ml-auto sm:hidden'>
          <button type='button' title='Edit health worker' aria-label='Edit health worker' onClick={openEditModal} className='p-2 text-blue-300 hover:text-blue-200 transition-colors'>
            <Edit className='w-5 h-5' />
          </button>
          <button type='button' title='Delete health worker' aria-label='Delete health worker' onClick={handleDelete} className='p-2 text-red-300 hover:text-red-200 transition-colors'>
            <Trash2 className='w-5 h-5' />
          </button>
        </div>
      </div>
      </div>

      <hr className='border-white/10' />

      {/* Personal Information - matches Resident Details */}
      <div>
        <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200 mb-1'>Personal Information</label>
        {(() => {
          const infoCount = [bhw.assignedPurok, bhw.assignedFocusGroup, bhw.contactNumber, bhw.email].filter(Boolean).length
          return (
        <div className={`grid gap-4 ${infoCount === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {bhw.assignedPurok && (
          <div>
            <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Assigned Purok</label>
            <p className='text-sm text-white/85'>{bhw.assignedPurok}</p>
          </div>
        )}
        {bhw.assignedFocusGroup && (
          <div>
            <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Assigned Focus Group</label>
            <p className='text-sm text-white/85'>{focusGroupLabel(bhw.assignedFocusGroup)}</p>
          </div>
        )}
        {bhw.contactNumber && (
          <div>
            <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Contact Number</label>
            <p className='text-sm text-white/85'>{bhw.contactNumber}</p>
          </div>
        )}
        {bhw.email && (
          <div className='col-span-2 sm:col-span-1'>
            <label className='block text-[11px] uppercase tracking-wide text-white/50 mb-1'>Email</label>
            <p className='text-sm text-white/85 break-words'>{bhw.email}</p>
          </div>
        )}
        </div>
          )
        })()}
      </div>

      <hr className='border-white/10' />
      <hr className='border-white/10' />

      {/* Performance Stats — counts the schedules listed below */}
      {displayStats && (
        <>
          <div>
            <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200 mb-3'>Performance Stats</label>
            <div className='grid grid-cols-4 text-center divide-x divide-white/10 mobile-stat-strip'>
            <div className='px-2'>
              <p className='text-xl font-bold text-white'>
                {displayStats.totalSchedules || 0}
              </p>
              <label className='block text-[11px] uppercase tracking-wide text-white/50 mt-0.5'>Total</label>
            </div>
            <div className='px-2'>
              <p className='text-xl font-bold text-emerald-300'>
                {displayStats.completedSchedules || 0}
              </p>
              <label className='block text-[11px] uppercase tracking-wide text-white/50 mt-0.5'>Done</label>
            </div>
            <div className='px-2'>
              <p className='text-xl font-bold text-blue-200'>
                {displayStats.upcomingSchedules || 0}
              </p>
              <label className='block text-[11px] uppercase tracking-wide text-white/50 mt-0.5'>Upcoming</label>
            </div>
            <div className='px-2'>
              <p className='text-xl font-bold text-red-300'>
                {displayStats.missedSchedules || 0}
              </p>
              <label className='block text-[11px] uppercase tracking-wide text-white/50 mt-0.5'>Missed</label>
            </div>
          </div>
          {displayStats.completionRate !== undefined && (
            <div className='mt-3'>
              <div className='flex justify-between items-center mb-1'>
                <label className='block text-[11px] uppercase tracking-wide text-white/50'>Completion Rate</label>
                <p className='text-sm font-bold text-white'>
                  {displayStats.completionRate}%
                </p>
              </div>
              <div className='w-full bg-white/10 rounded-full h-2'>
                <div
                  className='bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-500'
                  style={{ width: `${displayStats.completionRate}%` }}
                />
              </div>
            </div>
          )}
          </div>
        </>
      )}

      <hr className='border-white/10' />

      {/* Schedules */}
      <div>
        <div className='flex flex-col space-y-2'>
          <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Schedules · {filteredSchedules.length}</label>

          <div className='flex items-center gap-2'>
            <div className='flex-1 min-w-0'>
              <GlassInput
                icon={Search}
                placeholder='Search schedules...'
                value={scheduleSearch}
                onChange={e => setScheduleSearch(e.target.value)}
                className='!py-1.5 !text-xs sm:!py-1.5 sm:!text-xs min-w-0'
              />
            </div>
            <div className='w-[112px] shrink-0 [&_input]:!py-1.5 sm:[&_input]:!py-1.5 [&_input]:!text-xs sm:[&_input]:!text-xs [&_input]:min-w-0'>
              <GlassSelect
                value={scheduleFilter}
                allowCustom
                onChange={v => setScheduleFilter(v === '' ? 'all' : v)}
                size="sm"
                className="w-auto"
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'Cancelled', label: 'Cancelled' },
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Missed', label: 'Missed' },
                  { value: 'Scheduled', label: 'Scheduled' }
                ]}
              />
            </div>
            <button
              onClick={() => setScheduleView('list')}
              aria-label='List view'
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border shrink-0 ${
                scheduleView === 'list'
                  ? 'bg-blue-500/20 text-blue-200 border-blue-400/30 hover:bg-blue-500/30'
                  : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
              }`}
            >
              <List className='w-3.5 h-3.5' />
              <span className='hidden sm:inline'>List</span>
            </button>
            <button
              onClick={() => setScheduleView('calendar')}
              aria-label='Calendar view'
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border shrink-0 ${
                scheduleView === 'calendar'
                  ? 'bg-blue-500/20 text-blue-200 border-blue-400/30 hover:bg-blue-500/30'
                  : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
              }`}
            >
              <CalendarDays className='w-3.5 h-3.5' />
              <span className='hidden sm:inline'>Calendar</span>
            </button>
          </div>

          <div className='h-0' />

          {scheduleView === 'list' ? (
            <div>
              {schedulesLoading ? (
                <SkeletonScheduleCards count={4} />
              ) : filteredSchedules.length > 0 ? (
                <div className='space-y-2 max-h-[600px] overflow-y-auto pr-1'>
                  {paginatedSchedules.map(schedule => {
                    const date = new Date(schedule.date)
                    const scopeIcon =
                      schedule.scope === 'individual' ? (
                        <User className='w-3 h-3' />
                      ) : schedule.scope === 'purok' ? (
                        <MapPin className='w-3 h-3' />
                      ) : (
                        <Building2 className='w-3 h-3' />
                      )
                    return (
                      <div
                        key={schedule.id}
                        className='flex items-center justify-between bg-white/5 rounded-lg p-3 hover:bg-white/[0.07] transition-all border border-white/5 hover:border-white/10 cursor-pointer'
                        onClick={() => handleSelectScheduleFromList(schedule)}
                      >
                        <div className='flex items-center gap-3 min-w-0'>
                          <div className='text-center min-w-[40px]'>
                            <p className='text-sm font-bold text-white'>
                              {date.getDate()}
                            </p>
                            <p className='text-xs text-blue-300'>
                              {date.toLocaleString('default', {
                                month: 'short'
                              })}
                            </p>
                          </div>
                          <div className='min-w-0'>
                            <div className='flex items-center gap-1.5'>
                              <span className='text-xs text-white/65 flex items-center gap-0.5'>
                                {scopeIcon}
                                {schedule.scope}
                              </span>
                            </div>
                            <p className='text-white text-sm truncate'>
                              {schedule.scope === 'individual'
                                ? schedule.residentName
                                : schedule.programName || schedule.type}
                            </p>
                            <div className='flex items-center gap-2 text-xs text-white/65'>
                              <span className='flex items-center gap-0.5'>
                                <Clock className='w-3 h-3' />
                                {formatTime(schedule.time)}
                              </span>
                              <span>{schedule.type}</span>
                            </div>
                          </div>
                        </div>
                        <div className='flex items-center gap-2 shrink-0'>
                          {schedule.scope === 'individual' && schedule.status === 'Scheduled' && (
                            <button
                              type='button'
                              aria-label='Edit individual schedule'
                              title='Edit individual schedule'
                              className='p-1.5 rounded-md text-blue-200 hover:bg-blue-500/20'
                              onClick={event => handleEditIndividualSchedule(event, schedule)}
                            >
                              <Edit className='w-4 h-4' />
                            </button>
                          )}
                          <span className={`badge text-xs ${getStatusColor(schedule.status)}`}>
                            {schedule.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className='text-center py-12'>
                  <Calendar className='w-12 h-12 text-white/50 mx-auto mb-3' />
                  <p className='text-white/65'>No schedules found</p>
                </div>
              )}
              <Pagination
                page={schedulePage}
                totalPages={totalSchedulePages}
                onPageChange={setSchedulePage}
                total={filteredSchedules.length}
                perPage={schedulePerPage}
                className='mt-4'
                pageLabel
                hidePageIndicator
              />
            </div>
          ) : schedulesLoading ? (
            <SkeletonCalendarGrid />
          ) : (
            <CalendarView
              month={currentMonth}
              year={currentYear}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onToday={handleToday}
              getSchedulesForDate={dateStr =>
                filteredSchedules.filter(s => s.date?.startsWith(dateStr))
              }
              onSelectDay={handleDateClick}
              onSelectSchedule={schedule => handleSelectScheduleFromList(schedule)}
              showToday={false}
            />
          )}
        </div>
      </div>

      {/* Date Schedule Modal */}
      <Modal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
        title={
          selectedDate?.dateStr
            ? `Schedules for ${new Date(`${selectedDate.dateStr}T00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
            : selectedDate
            ? `Schedules for ${monthNames[currentMonth]} ${selectedDate.date}, ${currentYear}`
            : ''
        }
        size='md'
      >
        {schedulesLoading ? (
          <SkeletonDayModalList count={3} />
        ) : selectedDate && (
          <div className='space-y-3'>
            {paginatedDateModalSchedules.map(schedule => (
              <div
                key={schedule.id}
                className='bg-white/5 rounded-lg p-4 border border-white/5 cursor-pointer hover:bg-white/[0.07]'
                onClick={() => {
                  setShowDateModal(false)
                  if (embedded) onClose?.()
                  navigateWithReturn(navigate, location, '/schedules', {
                    viewScheduleId: schedule.id,
                    // Restore the previous modal when closing Schedule Details:
                    // the date modal on this page, or the detail modal on BHW list.
                    returnState: embedded
                      ? { viewBHWId: id }
                      : (selectedDate?.dateStr ? { viewBHWDate: selectedDate.dateStr } : {})
                  })
                }}
                >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <div>
                      <h3 className='text-white font-medium'>
                        {schedule.scope === 'individual'
                          ? schedule.residentName
                          : schedule.programName || schedule.type}
                      </h3>
                      <div className='flex items-center gap-2 mt-1'>
                        <span className='text-xs text-white/75 flex items-center gap-1'>
                          <Clock className='w-3 h-3' />
                          {formatTime(schedule.time)}
                        </span>
                        <span className='text-xs text-white/75'>
                          {schedule.type}
                        </span>
                        <span className='text-xs text-white/75 capitalize'>
                          {schedule.scope === 'individual'
                            ? '|'
                            : schedule.scope}
                        </span>
                        {schedule.purok && (
                          <span className='text-xs text-white/75 flex items-center gap-1'>
                            <MapPin className='w-3 h-3' />
                            {schedule.purok}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`badge text-xs ${getStatusColor(
                      schedule.status
                    )}`}
                  >
                    {schedule.status}
                  </span>
                </div>
                {schedule.scope === 'individual' && schedule.status === 'Scheduled' && (
                  <button
                    type='button'
                    aria-label='Edit individual schedule'
                    className='mt-2 p-1.5 rounded-md text-blue-200 hover:bg-blue-500/20'
                    onClick={event => handleEditIndividualSchedule(event, schedule)}
                  >
                    <Edit className='w-4 h-4' />
                  </button>
                )}
              </div>
            ))}
            <Pagination
              page={safeDateModalPage}
              totalPages={totalDateModalPages}
              onPageChange={setDateModalPage}
              total={dateModalSchedules.length}
              perPage={dateModalPerPage}
            />
          </div>
        )}
      </Modal>

      {/* Edit BHW Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Healthcare Professional"
        panelClassName='health-worker-add-modal'
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <div className="relative" ref={positionDropdownRef}>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>Position *</label>
            <div className='relative'>
              <input ref={positionInputRef} type='text' value={editForm.position} onChange={e => { setEditForm(prev => ({ ...prev, position: e.target.value })); setShowPositionDropdown(true) }} onFocus={() => setShowPositionDropdown(true)} className='glass-input pr-8' placeholder='Search or type position...' required />
              <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${showPositionDropdown ? 'rotate-180' : ''}`} onClick={() => setShowPositionDropdown(!showPositionDropdown)} />
            </div>
            {showPositionDropdown && filteredPositions.length > 0 && (
              <div className='absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl max-h-48 overflow-y-auto'>
                {filteredPositions.map(pos => (
                  <button key={pos.label} type='button' onClick={() => handlePositionChange(pos.label)} className='w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/10 text-white/85'>{pos.label}</button>
                ))}
              </div>
            )}
          </div>
          <GlassInput label='Full Name *' value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required placeholder='Full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={editForm.contactNumber} onChange={e => setEditForm(p => ({ ...p, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
            <GlassInput label='Email' value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder='Email' />
          </div>
          <GlassSelect label='Status' value={editForm.status} allowCustom onChange={v => setEditForm(p => ({ ...p, status: v }))} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
          {isBHW && (
            <>
              <GlassSelect label='Assigned Purok' value={editForm.assignedPurokId} allowCustom onChange={v => setEditForm(p => ({ ...p, assignedPurokId: v }))} options={assignedPurokOptions} />
              <GlassSelect label='Assigned Focus Group' value={editForm.assignedFocusGroup} allowCustom onChange={v => setEditForm(p => ({ ...p, assignedFocusGroup: v }))} options={focusGroupOptions} />
              <div className='pt-2 border-t border-white/10'>
                <h4 className='text-sm font-medium text-white/75 mb-3'>Login Credentials</h4>
                <div className='grid grid-cols-2 gap-3'>
                  <GlassInput label='Username' value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} placeholder='Login username' />
                  <GlassSelect label='Account Role' value={editForm.accountRole} allowCustom onChange={v => setEditForm(p => ({ ...p, accountRole: v }))} options={[{ value: 'BHW Admin', label: 'BHW Admin' }, { value: 'BHW Worker', label: 'BHW Worker' }]} />
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>New Password</label>
                    <div className='relative'>
                      <input type={showPassword ? 'text' : 'password'} value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} className='glass-input pr-10' placeholder='Leave blank to keep' />
                      <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-2 top-1/2 -translate-y-1/2 text-white/65 hover:text-white/85'>{showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}</button>
                    </div>
                  </div>
                  <GlassInput label='Confirm Password' value={editForm.confirmPassword} onChange={e => setEditForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder='Confirm password' />
                </div>
                {bhw?.username && (
                  <div className='mt-3 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg'><p className='text-xs text-blue-300'>Login: <strong>{bhw.username}</strong></p></div>
                )}
              </div>
            </>
          )}
          <div className='grid !grid-cols-2 gap-3 sm:flex sm:justify-end'>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' variant='secondary' type='button' onClick={() => setShowEditModal(false)}>Cancel</GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={editSaving}>Update Professional</GlassButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title='Delete BHW'
        message='Are you sure you want to delete this BHW? This action cannot be undone.'
        confirmText='Delete'
      />
    </div>
  )
}

export default BHWDetail
