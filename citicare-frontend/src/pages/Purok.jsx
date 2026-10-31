// pages/Purok.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MapPin,
  Map,
  Users,
  AlertTriangle,
  Calendar,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  Clock,
  User,
  Building2,
  ArrowLeft,
  UserPlus,
  Check,
  ChevronLeft,
  List,
  CalendarDays
} from 'lucide-react'
import { purokApi } from '../api/purokApi'
import { bhwApi } from '../api/bhwApi'
import { scheduleApi } from '../api/scheduleApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmMutation, confirmUpdate } from '../utils/crudConfirm'
import CalendarView from '../components/CalendarView'
import PurokRiskMap from '../components/PurokRiskMap'
import Pagination from '../components/Pagination'
import { SkeletonPurokPage, SkeletonPurokDetail, SkeletonDayModalList } from '../components/Skeleton'
import {
  formatDate,
  formatTime,
  getStatusColor,
  getRiskColor,
  formatAge
} from '../utils/helpers'
import { navigateWithReturn } from '../utils/navigation'

const Purok = () => {
  const [puroks, setPuroks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPurokRisk, setFilterPurokRisk] = useState('all')
  const [filterBhwStatus, setFilterBhwStatus] = useState('all')
  // List-level meta (assigned BHWs + schedule counts) now ships with
  // GET /api/puroks, so the tab no longer downloads the full resident, BHW
  // and schedule lists just to render two badges per card.
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditMap, setShowEditMap] = useState(false)
  const [newPurokName, setNewPurokName] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedPurok, setSelectedPurok] = useState(null)
  const [purokResidents, setPurokResidents] = useState([])
  const [purokSchedules, setPurokSchedules] = useState([])
  const [assignedBHWs, setAssignedBHWs] = useState([])
  const [availableBHWs, setAvailableBHWs] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editPurokName, setEditPurokName] = useState('')
  const [showAssignBHWModal, setShowAssignBHWModal] = useState(false)
  const [bhwSearch, setBhwSearch] = useState('')

  const [filterFocusGroup, setFilterFocusGroup] = useState('all')
  const [filterRiskLevel, setFilterRiskLevel] = useState('all')
  const [residentSearch, setResidentSearch] = useState('')
  const [residentPage, setResidentPage] = useState(1)
  const residentsPerPage = 10

  const [scheduleSearch, setScheduleSearch] = useState('')
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState('all')
  const [scheduleScopeFilter, setScheduleScopeFilter] = useState('all')
  const [scheduleView, setScheduleView] = useState('list')
  const [schedulePage, setSchedulePage] = useState(1)
  const schedulesPerPage = 6

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState(null)
  const [showDateModal, setShowDateModal] = useState(false)
  const [dateModalPage, setDateModalPage] = useState(1)
  const dateModalPerPage = 5

  const [purokPage, setPurokPage] = useState(1)
  const puroksPerPage = 9

  const [assignedBhwPage, setAssignedBhwPage] = useState(1)
  const assignedBhwsPerPage = 5

  const [assignBhwPage, setAssignBhwPage] = useState(1)
  const assignBhwsPerPage = 5

  const navigate = useNavigate()
  const location = useLocation()
  const [returnTo, setReturnTo] = useState(null)
  const [returnState, setReturnState] = useState(null)
  const [returnDateStr, setReturnDateStr] = useState(null)
  // State to restore the purok detail (and date modal) when returning
  // from elsewhere — close goes back to the previous modal.
  const purokReturnState = (dateStr) => selectedPurok
    ? { viewPurokId: selectedPurok.id, ...(dateStr ? { viewPurokDate: dateStr } : {}) }
    : {}

  const fetchPuroks = useCallback(async () => {
    try {
      setLoading(true)
      const puroksRes = await purokApi.getAll()
      if (puroksRes.data.success) setPuroks(puroksRes.data.data || [])
    } catch (error) {
      console.error('Error fetching puroks:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Silent refresh of the card metadata after assign/remove actions —
  // the purok list already carries BHW assignments and schedule counts.
  const refreshListMeta = useCallback(async () => {
    try {
      const puroksRes = await purokApi.getAll()
      if (puroksRes.data?.success) setPuroks(puroksRes.data.data || [])
    } catch (error) {
      console.error('Error refreshing purok meta:', error)
    }
  }, [])

  useEffect(() => {
    fetchPuroks()
  }, [fetchPuroks])

  // Per-purok assigned BHW workers — returned by GET /api/puroks.
  const bhwByPurok = useMemo(() => {
    const map = {}
    for (const purok of puroks) {
      map[purok.id] = purok.assignedBhws || []
    }
    return map
  }, [puroks])

  // Per-purok schedule counts — returned by GET /api/puroks.
  const scheduleCountByPurok = useMemo(() => {
    const map = {}
    for (const purok of puroks) {
      map[purok.id] = purok.totalSchedules || 0
    }
    return map
  }, [puroks])

  // Open detail modal when navigated here with viewPurokId (Dashboard map flow)
  useEffect(() => {
    const id = location.state?.viewPurokId
    if (id && puroks.length > 0 && !selectedPurok) {
      const target = puroks.find(p => String(p.id) === String(id))
      if (target) handlePurokClick(target)
      if (location.state?.from && location.state.from !== '/purok') {
        setReturnTo(location.state.from)
        setReturnState(location.state?.returnState || null)
      }
      if (location.state?.viewPurokDate) {
        setReturnDateStr(location.state.viewPurokDate)
      }
      window.history.replaceState({}, document.title)
    }
  }, [location.state, puroks])

  // Reopen the date modal once the detail data is back — close goes back
  // to the previous modal.
  useEffect(() => {
    if (returnDateStr && selectedPurok && !detailLoading) {
      handleDateClick(returnDateStr)
      setReturnDateStr(null)
    }
  }, [returnDateStr, selectedPurok, detailLoading])

  const fetchPurokDetails = async purok => {
    try {
      setDetailLoading(true)
      const [purokRes, bhwsRes, schedulesRes] = await Promise.all([
        purokApi.getById(purok.id),
        bhwApi.getAll(),
        scheduleApi.getAll()
      ])

      // The purok endpoint returns just this purok's residents, so the detail
      // modal no longer downloads the entire barangay resident list.
      const purokResidentsList = purokRes.data?.success
        ? purokRes.data.data?.residents || []
        : []
      const allBhws = bhwsRes.data?.success ? bhwsRes.data.data || [] : []
      const allSchedules = schedulesRes.data?.success
        ? schedulesRes.data.data || []
        : []

      // Only Active BHW Workers assigned to this purok
      const purokBhws = allBhws.filter(b => {
        const isAssigned =
          b.assignedPurokId === purok.id || b.assignedPurok === purok.name
        const isActive = b.status === 'Active'
        const isBHW =
          b.position === 'Barangay Health Worker' || b.workerType === 'BHW'
        return isAssigned && isActive && isBHW
      })

      // Available BHWs - Active BHW Workers only, not assigned to any purok
      const available = allBhws.filter(b => {
        if (b.status !== 'Active') return false
        const isBHW =
          b.position === 'Barangay Health Worker' || b.workerType === 'BHW'
        if (!isBHW) return false
        const hasNoPurok = !b.assignedPurokId && !b.assignedPurok
        const assignedToThisPurok =
          b.assignedPurokId === purok.id || b.assignedPurok === purok.name
        return hasNoPurok || assignedToThisPurok
      })

      const purokSchedulesList = allSchedules.filter(s => {
        if (
          s.scope === 'purok' &&
          (s.purokId === purok.id || s.purokName === purok.name)
        )
          return true
        if (s.scope === 'barangay') return true
        if (s.scope === 'individual')
          return purokResidentsList.some(r => r.id === s.residentId)
        return false
      })

      setPurokResidents(purokResidentsList)
      setPurokSchedules(purokSchedulesList)
      setAssignedBHWs(purokBhws)
      setAvailableBHWs(available)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setDetailLoading(false)
    }
  }

  const handlePurokClick = purok => {
    setSelectedPurok(purok)
    setAssignedBhwPage(1)
    setResidentPage(1)
    setResidentSearch('')
    setScheduleSearch('')
    setScheduleStatusFilter('all')
    setScheduleScopeFilter('all')
    setScheduleView('list')
    const now = new Date()
    setCalendarMonth(now.getMonth())
    setCalendarYear(now.getFullYear())
    fetchPurokDetails(purok)
  }

  const handleBack = () => {
    setSelectedPurok(null)
    setPurokResidents([])
    setPurokSchedules([])
    setAssignedBHWs([])
    setAvailableBHWs([])
    setFilterFocusGroup('all')
    setFilterRiskLevel('all')
    setResidentPage(1)
    setResidentSearch('')
    setScheduleSearch('')
    setScheduleStatusFilter('all')
    setScheduleScopeFilter('all')
    // Close returns to the previous page/modal when this detail was opened from elsewhere.
    if (returnTo) {
      const dest = returnTo
      const state = returnState
      setReturnTo(null)
      setReturnState(null)
      navigate(dest, { state: state || {} })
    }
  }

  const handleAddPurok = async e => {
    e.preventDefault()
    if (!newPurokName.trim()) return
    const confirmed = await confirmCreate('purok', `Please confirm that you want to add ${newPurokName.trim()}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      await purokApi.create({ name: newPurokName.trim() })
      setShowAddModal(false)
      setNewPurokName('')
      fetchPuroks()
      dialog.toast('Purok added successfully.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to add purok', 'Unable to add purok')
    } finally {
      setSaving(false)
    }
  }

  const handleEditPurok = async e => {
    e.preventDefault()
    if (!editPurokName.trim()) return
    const confirmed = await confirmUpdate('purok', `Please confirm that you want to save the changes to ${editPurokName.trim()}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      await purokApi.update(selectedPurok.id, { name: editPurokName.trim() })
      setShowEditModal(false)
      setSelectedPurok(prev => ({ ...prev, name: editPurokName.trim() }))
      fetchPuroks()
      dialog.toast('Purok updated successfully.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to update purok', 'Unable to update purok')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation()
    const confirmed = await dialog.confirm({
      title: 'Delete purok?',
      message: 'This purok will be permanently removed. Puroks with residents or assigned health workers cannot be deleted.',
      confirmText: 'Delete purok',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await purokApi.delete(id)
      setPuroks(prev => prev.filter(p => p.id !== id))
      if (selectedPurok?.id === id) handleBack()
      dialog.toast('Purok deleted.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to delete purok', 'Unable to delete purok')
    }
  }

  const handleAssignBHW = async bhwId => {
    const confirmed = await confirmMutation({
      title: 'Assign health worker?',
      message: `Please confirm that you want to assign this health worker to ${selectedPurok?.name || 'this purok'}.`,
      confirmText: 'Assign',
    })
    if (!confirmed) return
    try {
      await bhwApi.update(bhwId, { assignedPurokId: selectedPurok.id })
      fetchPurokDetails(selectedPurok)
      refreshListMeta()
      setShowAssignBHWModal(false)
      setBhwSearch('')
      dialog.toast('BHW assigned successfully.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to assign BHW', 'Unable to assign BHW')
    }
  }

  const handleRemoveBHW = async bhwId => {
    const confirmed = await confirmMutation({
      title: 'Remove health worker?',
      message: `Please confirm that you want to remove this health worker from ${selectedPurok?.name || 'this purok'}.`,
      confirmText: 'Remove',
    })
    if (!confirmed) return
    try {
      await bhwApi.update(bhwId, { assignedPurokId: null })
      fetchPurokDetails(selectedPurok)
      refreshListMeta()
      dialog.toast('BHW removed from purok.', 'success')
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to remove BHW', 'Unable to remove BHW')
    }
  }

  const openEditModal = () => {
    setEditPurokName(selectedPurok?.name || '')
    setShowEditModal(true)
  }

  // Risk levels come in two forms ('Critical Risk' from residents API,
  // 'Critical Health Risk' from purok API) - normalize before comparing
  const normRisk = level =>
    (level || '').replace(' Health Risk', '').replace(' Risk', '').trim().toLowerCase()

  const getPurokRiskBadgeClass = level => {
    switch (normRisk(level)) {
      case 'critical': return 'bg-red-500/20 text-red-300 border-red-400/30'
      case 'high': return 'bg-orange-500/20 text-orange-300 border-orange-400/30'
      case 'moderate': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30'
      default: return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
    }
  }

  const filteredResidents = purokResidents.filter(r => {
    if (
      residentSearch &&
      !r.name?.toLowerCase().includes(residentSearch.toLowerCase())
    )
      return false
    if (filterFocusGroup !== 'all') {
      const groups = r.focusGroups || []
      if (filterFocusGroup === 'none') {
        if (groups.length > 0) return false
      } else {
        if (!groups.includes(filterFocusGroup)) return false
      }
    }
    if (filterRiskLevel !== 'all' && normRisk(r.riskLevel) !== normRisk(filterRiskLevel))
      return false
    return true
  })
  const hasActiveResidentFilters = residentSearch !== '' || filterFocusGroup !== 'all' || filterRiskLevel !== 'all'
  const totalResidentPages = Math.ceil(
    filteredResidents.length / residentsPerPage
  )
  const paginatedResidents = hasActiveResidentFilters ? filteredResidents : filteredResidents.slice(
    (residentPage - 1) * residentsPerPage,
    residentPage * residentsPerPage
  )

  const filteredSchedules = purokSchedules
    .filter(s => {
      if (scheduleSearch) {
        const search = scheduleSearch.toLowerCase()
        const name =
          s.scope === 'individual' ? s.residentName : s.programName || ''
        if (
          !name?.toLowerCase().includes(search) &&
          !s.type?.toLowerCase().includes(search)
        )
          return false
      }
      if (scheduleStatusFilter !== 'all' && s.status !== scheduleStatusFilter)
        return false
      if (scheduleScopeFilter !== 'all' && s.scope !== scheduleScopeFilter)
        return false
      return true
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  useEffect(() => { setSchedulePage(1) }, [scheduleSearch, scheduleStatusFilter, scheduleScopeFilter])

  const hasActiveScheduleFilters = scheduleSearch !== '' || scheduleStatusFilter !== 'all' || scheduleScopeFilter !== 'all'
  const totalSchedulePages = Math.max(1, Math.ceil(filteredSchedules.length / schedulesPerPage))
  const paginatedSchedules = hasActiveScheduleFilters ? filteredSchedules : filteredSchedules.slice(
    (schedulePage - 1) * schedulesPerPage,
    schedulePage * schedulesPerPage
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
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const getDaysInMonth = (m, y) => new Date(y, m + 1, 0).getDate()
  const getFirstDayOfMonth = (m, y) => new Date(y, m, 1).getDay()
  // Shared-calendar lookup by YYYY-MM-DD string (same as Schedules/BHW).
  const getSchedulesForDateStr = dateStr =>
    filteredSchedules.filter(s => s.date && String(s.date).startsWith(dateStr))
  const getSchedulesForDate = date => {
    // Backwards-compatible day-number lookup for the current calendar month.
    if (typeof date === 'string') return getSchedulesForDateStr(date)
    return filteredSchedules.filter(s => {
      const sDate = new Date(s.date)
      return (
        sDate.getDate() === date &&
        sDate.getMonth() === calendarMonth &&
        sDate.getFullYear() === calendarYear
      )
    })
  }
  const getScheduleCountForDate = date => getSchedulesForDate(date).length
  const getDateColor = date => {
    const day = getSchedulesForDate(date)
    if (day.length === 0) return ''
    if (day.some(s => s.status === 'Missed'))
      return 'bg-orange-500/30 text-orange-200 border-orange-400/30'
    if (day.some(s => s.status === 'Cancelled'))
      return 'bg-red-500/30 text-red-200 border-red-400/30'
    if (day.every(s => s.status === 'Completed'))
      return 'bg-green-500/30 text-green-200 border-green-400/30'
    return 'bg-blue-500/30 text-blue-200 border-blue-400/30'
  }
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11)
      setCalendarYear(y => y - 1)
    } else setCalendarMonth(m => m - 1)
  }
  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0)
      setCalendarYear(y => y + 1)
    } else setCalendarMonth(m => m + 1)
  }
  const handleToday = () => {
    const now = new Date()
    setCalendarMonth(now.getMonth())
    setCalendarYear(now.getFullYear())
  }
  const handleDateClick = (dateOrStr, daySchedules) => {
    // Shared CalendarView calls onSelectDay(dateStr, schedules).
    if (typeof dateOrStr === 'string') {
      const list = daySchedules || getSchedulesForDateStr(dateOrStr)
      if (list.length === 0) return
      // Always open the day modal listing all schedules for the date.
      // Clicking a schedule inside the modal goes to Schedule Details.
      setSelectedDate({
        dateStr: dateOrStr,
        date: new Date(`${dateOrStr}T00:00`).getDate(),
        schedules: list
      })
      setDateModalPage(1)
      setShowDateModal(true)
      return
    }
    const daySchedulesList = getSchedulesForDate(dateOrStr)
    if (daySchedulesList.length > 0) {
      setSelectedDate({ date: dateOrStr, schedules: daySchedulesList })
      setDateModalPage(1)
      setShowDateModal(true)
    }
  }
  const handleSelectSchedule = schedule => {
    setShowDateModal(false)
    navigateWithReturn(navigate, location, '/schedules', { viewScheduleId: schedule.id, returnState: purokReturnState() })
  }

  const riskCounts = {
    total: purokResidents.length,
    critical: purokResidents.filter(r => normRisk(r.riskLevel) === 'critical')
      .length,
    high: purokResidents.filter(r => normRisk(r.riskLevel) === 'high').length,
    moderate: purokResidents.filter(r => normRisk(r.riskLevel) === 'moderate')
      .length,
    low: purokResidents.filter(r => normRisk(r.riskLevel) === 'low').length
  }
  const hasActivePurokFilters =
    searchTerm !== '' || filterPurokRisk !== 'all' || filterBhwStatus !== 'all'
  const filteredPuroks = puroks.filter(p => {
    if (
      searchTerm &&
      !p.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false
    if (filterPurokRisk !== 'all' && normRisk(p.riskLevel) !== normRisk(filterPurokRisk))
      return false
    const assignedCount = (bhwByPurok[p.id] || []).length
    if (filterBhwStatus === 'assigned' && assignedCount === 0) return false
    if (filterBhwStatus === 'unassigned' && assignedCount > 0) return false
    return true
  })
  useEffect(() => { setPurokPage(1) }, [searchTerm, filterPurokRisk, filterBhwStatus])
  const totalPurokPages = Math.max(1, Math.ceil(filteredPuroks.length / puroksPerPage))
  const safePurokPage = Math.min(Math.max(1, purokPage), totalPurokPages)
  const paginatedPuroks = hasActivePurokFilters ? filteredPuroks : filteredPuroks.slice(
    (safePurokPage - 1) * puroksPerPage,
    safePurokPage * puroksPerPage
  )
  const totalAssignedBhwPages = Math.max(1, Math.ceil(assignedBHWs.length / assignedBhwsPerPage))
  const safeAssignedBhwPage = Math.min(Math.max(1, assignedBhwPage), totalAssignedBhwPages)
  const paginatedAssignedBhws = assignedBHWs.slice(
    (safeAssignedBhwPage - 1) * assignedBhwsPerPage,
    safeAssignedBhwPage * assignedBhwsPerPage
  )
  const assignableBHWs = availableBHWs
    .filter(b => !assignedBHWs.some(a => a.id === b.id))
    .filter(b => !bhwSearch || b.name?.toLowerCase().includes(bhwSearch.toLowerCase()))
    .slice()
    .sort((a, b) => a.name?.localeCompare(b.name))
  const hasActiveBhwSearch = bhwSearch !== ''
  const totalAssignBhwPages = Math.max(1, Math.ceil(assignableBHWs.length / assignBhwsPerPage))
  const safeAssignBhwPage = Math.min(Math.max(1, assignBhwPage), totalAssignBhwPages)
  const paginatedAssignableBhws = hasActiveBhwSearch ? assignableBHWs : assignableBHWs.slice(
    (safeAssignBhwPage - 1) * assignBhwsPerPage,
    safeAssignBhwPage * assignBhwsPerPage
  )
  const dateModalSchedules = selectedDate?.schedules || []
  const totalDateModalPages = Math.max(1, Math.ceil(dateModalSchedules.length / dateModalPerPage))
  const safeDateModalPage = Math.min(Math.max(1, dateModalPage), totalDateModalPages)
  const paginatedDateModalSchedules = dateModalSchedules.slice(
    (safeDateModalPage - 1) * dateModalPerPage,
    safeDateModalPage * dateModalPerPage
  )
  const focusGroupOptions = [
    { value: 'infant', label: 'Infant (0-59 months)' },
    { value: 'pregnant', label: 'Pregnant' },
    { value: 'pwd', label: 'PWD' },
    { value: 'senior', label: 'Senior (60+)' },
    { value: 'withCondition', label: 'With Condition' },
    { value: 'none', label: 'No Focus Group' }
  ]

  if (loading) return <SkeletonPurokPage count={6} />

  const renderPurokDetailContent = () => {
    if (!selectedPurok) return null
    // Full-modal shimmer while residents + BHWs + schedules load together,
    // so the modal mirrors its expected header / stats / BHW / resident /
    // schedule sections instead of flashing empty lists.
    if (detailLoading) return <SkeletonPurokDetail />
    return (
      <div className='space-y-4'>
        {/* Header - name row with actions, matches Resident Details */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3 min-w-0 flex-wrap'>
            <h3 className='text-2xl sm:text-3xl font-bold text-white break-words leading-tight min-w-0'>{selectedPurok.name}</h3>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getPurokRiskBadgeClass(selectedPurok.riskLevel)}`}>
              {(selectedPurok.riskLevel || 'Low Health Risk').replace(' Health Risk', '')} Risk
            </span>
          </div>
          <div className='hidden sm:flex gap-2 shrink-0 ml-auto'>
            <GlassButton
              variant='solid-primary'
              icon={Pencil}
              title='Edit purok'
              onClick={openEditModal}
            />
            <GlassButton
              variant='solid-danger'
              icon={Trash2}
              title='Delete purok'
              onClick={e => handleDelete(selectedPurok.id, e)}
            />
          </div>
          <div className='flex sm:hidden gap-2 shrink-0 ml-auto'>
            <button type='button' title='Edit purok' aria-label='Edit purok' onClick={openEditModal} className='p-2 text-blue-300 hover:text-blue-200 transition-colors'>
              <Pencil className='w-5 h-5' />
            </button>
            <button type='button' title='Delete purok' aria-label='Delete purok' onClick={e => handleDelete(selectedPurok.id, e)} className='p-2 text-red-300 hover:text-red-200 transition-colors'>
              <Trash2 className='w-5 h-5' />
            </button>
          </div>
        </div>

        <div className='grid grid-cols-5 text-center divide-x divide-white/10 !mt-3 sm:!mt-6 mobile-stat-strip mobile-stat-strip-lg'>
          {[
            { label: 'Total', value: riskCounts.total, cls: 'text-white' },
            { label: 'Critical', value: riskCounts.critical, cls: 'text-red-400' },
            { label: 'High', value: riskCounts.high, cls: 'text-orange-400' },
            { label: 'Moderate', value: riskCounts.moderate, cls: 'text-yellow-400' },
            { label: 'Low', value: riskCounts.low, cls: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className='px-2'>
              <p className={`text-lg sm:text-3xl font-bold ${s.cls}`}>{s.value}</p>
              <label className='block text-[11px] uppercase tracking-wide text-white/50 mt-0.5'>{s.label}</label>
            </div>
          ))}
        </div>

        <hr className='border-white/10' />

        <div>
          <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
            <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Assigned BHW Workers · {assignedBHWs.length}</label>
            <button
              onClick={() => { setAssignBhwPage(1); setBhwSearch(''); setShowAssignBHWModal(true) }}
              className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
            >
              <UserPlus className='w-3.5 h-3.5' />
              Assign BHW
            </button>
          </div>
          {assignedBHWs.length === 0 ? (
            <div className='text-center py-8'>
              <User className='w-10 h-10 text-white/50 mx-auto mb-3' />
              <p className='text-white/65 text-sm'>
                No BHW workers assigned to this purok
              </p>
            </div>
          ) : (
            <>
            <div className='space-y-2 max-h-64 overflow-y-auto'>
              {paginatedAssignedBhws.map(bhw => (
                <div
                  key={bhw.id}
                  className='flex items-center justify-between bg-white/5 rounded-lg p-3'
                >
                  <div className='min-w-0'>
                    <p className='text-sm text-white truncate'>
                      <span className='font-medium'>{bhw.name}</span>
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    {bhw.contactNumber && (
                      <span className='text-xs text-white/50'>
                        {bhw.contactNumber}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveBHW(bhw.id)}
                      className='text-white/30 hover:text-red-400 transition-colors'
                      title='Remove from purok'
                    >
                      <X className='w-3.5 h-3.5' />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={safeAssignedBhwPage}
              totalPages={totalAssignedBhwPages}
              onPageChange={setAssignedBhwPage}
              total={assignedBHWs.length}
              perPage={assignedBhwsPerPage}
            />
            </>
          )}
        </div>

        <hr className='border-white/10' />
        <hr className='border-white/10' />

        <div>
          <div className='mb-2'>
            <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Residents · {filteredResidents.length}</label>
          </div>
          <div className='flex flex-nowrap items-center gap-2 mb-3'>
            <div className='relative flex-1 min-w-0'>
                <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40' />
                <input
                  type='text'
                  placeholder='Search...'
                  value={residentSearch}
                  onChange={e => {
                    setResidentSearch(e.target.value)
                    setResidentPage(1)
                  }}
                  className='glass-input pl-8 pr-3 py-1.5 text-xs w-full'
                />
              </div>
              <GlassSelect
                value={filterFocusGroup}
                onChange={v => {
                  setFilterFocusGroup(v === '' ? 'all' : v)
                  setResidentPage(1)
                }}
                size='sm'
                className='w-[118px] min-w-0 shrink-0 sm:w-auto sm:min-w-[130px]'
                options={[{ value: 'all', label: 'All Groups' }, ...focusGroupOptions]}
              />
              <GlassSelect
                value={filterRiskLevel}
                onChange={v => {
                  setFilterRiskLevel(v === '' ? 'all' : v)
                  setResidentPage(1)
                }}
                size='sm'
                className='w-[102px] min-w-0 shrink-0 sm:w-auto sm:min-w-[110px]'
                options={[
                  { value: 'all', label: 'All Risks' },
                  { value: 'Critical Health Risk', label: 'Critical' },
                  { value: 'High Health Risk', label: 'High' },
                  { value: 'Moderate Health Risk', label: 'Moderate' },
                  { value: 'Low Health Risk', label: 'Low' }
                ]}
              />
          </div>
          {paginatedResidents.length === 0 ? (
            <div className='text-center py-8'>
              <Users className='w-10 h-10 text-white/50 mx-auto mb-3' />
              <p className='text-white/65 text-sm'>No residents found</p>
              {residentSearch && (
                <button
                  onClick={() => setResidentSearch('')}
                  className='mt-2 text-xs text-blue-400 hover:text-blue-300'
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <div className='space-y-2 max-h-[400px] overflow-y-auto'>
                {paginatedResidents.map(r => (
                  <div
                    key={r.id}
                    role='link'
                    tabIndex={0}
                    onClick={() => navigateWithReturn(navigate, location, '/residents', { viewResidentId: r.id, returnState: purokReturnState() })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigateWithReturn(navigate, location, '/residents', { viewResidentId: r.id, returnState: purokReturnState() })
                      }
                    }}
                    className='bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
                  >
                    <div className='flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1'>
                      <div className='flex flex-row-reverse items-center justify-between gap-2 sm:contents'>
                      <span
                        className={`badge text-xs ${getRiskColor(
                          r.riskLevel
                        )}`}
                      >
                        {r.riskLevel?.replace(' Health Risk', '') || '?'}
                      </span>
                      <span className='text-base sm:text-sm text-white min-w-0 truncate'>{r.name}</span>
                      </div>
                      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 sm:contents'>
                      <span className='text-xs text-white/40'>
                        {formatAge(r.age, r.dateOfBirth)}, {r.gender}
                      </span>
                      {r.lastCheckup && (
                        <span className='text-xs whitespace-nowrap'>
                          <span className='text-white/40'>
                            Last Checkup:
                          </span>{' '}
                          <span className='text-white/70'>
                            {formatDate(r.lastCheckup)}
                          </span>
                        </span>
                      )}
                      <span className='text-xs text-blue-400 ml-auto'>
                        <span className='sm:hidden'>→</span>
                        <span className='hidden sm:inline'>View Full Profile →</span>
                      </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!hasActiveResidentFilters && totalResidentPages > 1 && (
                <Pagination
                  page={residentPage}
                  totalPages={totalResidentPages}
                  onPageChange={setResidentPage}
                  className='!justify-end'
                />
              )}
            </>
          )}
        </div>

        <hr className='border-white/10' />
        <hr className='border-white/10' />

        <div>
          <div className='mb-2'>
            <label className='block text-sm font-semibold uppercase tracking-wider text-blue-200'>Schedules · {filteredSchedules.length}</label>
          </div>
          <div className='flex flex-wrap items-center gap-2 mb-3'>
            <div className='relative order-1 min-w-[100px] flex-1 sm:order-none sm:w-auto sm:flex-1'>
                <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40' />
                <input
                  type='text'
                  placeholder='Search...'
                  value={scheduleSearch}
                  onChange={e => setScheduleSearch(e.target.value)}
                  className='glass-input pl-8 pr-3 py-1.5 text-xs w-full'
                />
              </div>
              <div className='order-3 grid w-full grid-cols-2 gap-2 sm:contents sm:order-none'>
                <GlassSelect
                  value={scheduleStatusFilter}
                  onChange={v => setScheduleStatusFilter(v === '' ? 'all' : v)}
                  size='sm'
                  className='w-full min-w-0 sm:order-none sm:w-auto sm:min-w-[110px]'
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'Cancelled', label: 'Cancelled' },
                    { value: 'Completed', label: 'Completed' },
                    { value: 'Missed', label: 'Missed' },
                    { value: 'Scheduled', label: 'Scheduled' }
                  ]}
                />
                <GlassSelect
                  value={scheduleScopeFilter}
                  onChange={v => setScheduleScopeFilter(v === '' ? 'all' : v)}
                  size='sm'
                  className='w-full min-w-0 sm:order-none sm:w-auto sm:min-w-[120px]'
                  options={[
                    { value: 'all', label: 'All Scopes' },
                    { value: 'barangay', label: 'Barangay-wide' },
                    { value: 'individual', label: 'Individual' },
                    { value: 'purok', label: 'Per Purok' }
                  ]}
                />
              </div>
              <button
                onClick={() => setScheduleView('list')}
                className={`order-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border sm:order-none ${
                  scheduleView === 'list'
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/30 hover:bg-blue-500/30'
                    : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                }`}
              >
                <List className='w-3.5 h-3.5' />
                List
              </button>
              <button
                onClick={() => setScheduleView('calendar')}
                className={`order-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border sm:order-none ${
                  scheduleView === 'calendar'
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/30 hover:bg-blue-500/30'
                    : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                }`}
              >
                <CalendarDays className='w-3.5 h-3.5' />
                Calendar
              </button>
          </div>
          {scheduleView === 'list' ? (
            filteredSchedules.length === 0 ? (
              <div className='text-center py-8'>
                <Calendar className='w-10 h-10 text-white/50 mx-auto mb-3' />
                <p className='text-white/65 text-sm'>No schedules found</p>
              </div>
            ) : (
              <>
              <div className='space-y-2 max-h-80 overflow-y-auto'>
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
                      className='flex items-center justify-between bg-white/5 rounded-lg p-3 hover:bg-white/[0.07] cursor-pointer'
                      onClick={() => navigateWithReturn(navigate, location, '/schedules', { viewScheduleId: schedule.id, returnState: purokReturnState() })}
                    >
                      <div className='flex flex-1 min-w-0 items-center gap-3'>
                        <div className='hidden sm:block text-center min-w-[40px]'>
                          <p className='text-sm font-bold text-white'>
                            {date.getDate()}
                          </p>
                          <p className='text-xs text-blue-300'>
                            {date.toLocaleString('default', { month: 'short' })}
                          </p>
                        </div>
                        <div className='flex flex-1 min-w-0 flex-col'>
                          <div className='order-3 flex items-center justify-between gap-2 sm:order-none'>
                            <div className='flex items-center gap-1.5 min-w-0'>
                              <span className='text-xs text-white/40 flex items-center gap-0.5 shrink-0'>
                                {scopeIcon}
                                {schedule.scope}
                              </span>
                              <span className='text-sm text-white/40 sm:hidden truncate'>{schedule.type}</span>
                            </div>
                            <span className={`badge text-xs shrink-0 sm:hidden ${getStatusColor(schedule.status)}`}>
                              {schedule.status}
                            </span>
                          </div>
                          <p className='order-1 text-white text-sm sm:order-none'>
                            {schedule.scope === 'individual'
                              ? schedule.residentName
                              : schedule.programName || schedule.type}
                          </p>
                          <div className='order-2 mt-1 flex items-center gap-2 text-sm text-white/40 sm:order-none sm:mt-0 sm:text-xs'>
                            <span className='text-sm sm:hidden'>
                              {date.getDate()} {date.toLocaleString('default', { month: 'short' })}
                            </span>
                            <span className='flex items-center gap-0.5'>
                              <Clock className='w-3 h-3' />
                              {formatTime(schedule.time)}
                            </span>
                            <span className='hidden sm:inline'>{schedule.type}</span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`hidden sm:inline-flex badge text-xs ${getStatusColor(
                          schedule.status
                        )}`}
                      >
                        {schedule.status}
                      </span>
                    </div>
                  )
                })}
              </div>
              {!hasActiveScheduleFilters && <Pagination
                page={schedulePage}
                totalPages={totalSchedulePages}
                onPageChange={setSchedulePage}
                total={filteredSchedules.length}
                perPage={schedulesPerPage}
              />}
              </>
            )
          ) : (
            <CalendarView
              month={calendarMonth}
              year={calendarYear}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onToday={handleToday}
              getSchedulesForDate={getSchedulesForDateStr}
              onSelectDay={handleDateClick}
              onSelectSchedule={handleSelectSchedule}
              showToday={false}
            />
          )}
        </div>

        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title='Edit Purok'
        >
          <form onSubmit={handleEditPurok} className='space-y-4'>
            <GlassInput
              label='Purok Name'
              value={editPurokName}
              onChange={e => setEditPurokName(e.target.value)}
              required
              placeholder='Enter purok name'
            />
            <div className='grid !grid-cols-2 gap-3 sm:flex sm:justify-end'>
              <GlassButton
                className='!w-full min-w-0 sm:!w-auto'
                variant='secondary'
                type='button'
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </GlassButton>
              <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={saving}>
                Update Purok
              </GlassButton>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={showAssignBHWModal}
          onClose={() => {
            setShowAssignBHWModal(false)
            setBhwSearch('')
          }}
          title='Assign BHW Worker'
          panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
          bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
        >
          <div className='space-y-3'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
              <input
                type='text'
                placeholder='Search BHW workers...'
                value={bhwSearch}
                onChange={e => { setBhwSearch(e.target.value); setAssignBhwPage(1) }}
                className='glass-input pl-9 pr-3 py-2 text-sm w-full'
              />
            </div>
            <div className='space-y-2 max-h-64 overflow-y-auto'>
              {assignableBHWs.length === 0 ? (
                <p className='text-sm text-white/30 text-center py-4'>
                  {bhwSearch
                    ? 'No BHW workers match your search'
                    : 'No available BHW workers'}
                </p>
              ) : (
                paginatedAssignableBhws.map(bhw => (
                    <div
                      key={bhw.id}
                      className='flex items-center justify-between bg-white/5 rounded-lg p-3 hover:bg-white/10'
                    >
                      <div className='min-w-0'>
                        <p className='text-sm text-white truncate'>
                          <span className='font-medium'>{bhw.name}</span>
                        </p>
                        {bhw.contactNumber && (
                          <p className='text-xs text-white/30'>
                            {bhw.contactNumber}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAssignBHW(bhw.id)}
                        className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                      >
                        <Check className='w-3.5 h-3.5' />
                        Assign
                      </button>
                    </div>
                  ))
              )}
            </div>
            {!hasActiveBhwSearch && <Pagination
              page={safeAssignBhwPage}
              totalPages={totalAssignBhwPages}
              onPageChange={setAssignBhwPage}
              total={assignableBHWs.length}
              perPage={assignBhwsPerPage}
            />}
          </div>
        </Modal>

        <Modal
          isOpen={showDateModal}
          onClose={() => setShowDateModal(false)}
          title={
            selectedDate?.dateStr
              ? `Schedules for ${new Date(`${selectedDate.dateStr}T00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              : selectedDate
              ? `${monthNames[calendarMonth]} ${selectedDate.date}, ${calendarYear}`
              : ''
          }
          size='md'
        >
          {detailLoading ? (
            <SkeletonDayModalList count={3} />
          ) : selectedDate && (
            <div className='space-y-2'>
              {paginatedDateModalSchedules.map(schedule => (
                <div
                  key={schedule.id}
                  className='bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/[0.07] transition-colors'
                  onClick={() => {
                    setShowDateModal(false)
                    navigateWithReturn(navigate, location, '/schedules', { viewScheduleId: schedule.id, returnState: purokReturnState(selectedDate?.dateStr) })
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

                        {schedule.purok && (
                          <span className='text-xs text-white/50 flex items-center gap-1'>
                            <MapPin className='w-3 h-3' />
                            {schedule.purok}
                          </span>
                        )}
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
      </div>
    )
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='pl-1 flex items-center gap-2'>
          <h1
            className='text-2xl font-bold text-white'
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Puroks
          </h1>
          <p className='text-sm text-white/50 mt-1'>
            {filteredPuroks.length} purok
            {filteredPuroks.length !== 1 ? 's' : ''}
            {hasActivePurokFilters && ' (filtered)'}
          </p>
        </div>
        <div className='flex flex-wrap gap-2 ml-auto'>
          <GlassButton variant='secondary' icon={Map} title='Edit Map' onClick={() => setShowEditMap(true)}>
            <span className='sm:hidden'>Edit map</span>
            <span className='hidden sm:inline'>Edit Map</span>
          </GlassButton>
          <GlassButton icon={Plus} onClick={() => setShowAddModal(true)}>
            <span className='hidden sm:inline'>Add Purok</span>
          </GlassButton>
        </div>
      </div>
      <div className='space-y-3'>
        <GlassInput
          icon={Search}
          placeholder='Search puroks...'
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {/* Filters — single-row pill buttons, same design as Medicine / Schedules tabs */}
        <div className='grid grid-cols-2 gap-2 sm:hidden'>
          <GlassSelect
            aria-label='Filter by risk'
            value={filterPurokRisk}
            allowCustom
            onChange={v => setFilterPurokRisk(v === '' ? 'all' : v)}
            size='sm'
            className='w-full min-w-0'
            options={[
              { value: 'all', label: 'All Risks' },
              { value: 'Critical Health Risk', label: 'Critical' },
              { value: 'High Health Risk', label: 'High' },
              { value: 'Moderate Health Risk', label: 'Moderate' },
              { value: 'Low Health Risk', label: 'Low' }
            ]}
          />
          <GlassSelect
            aria-label='Filter by BHW assignment'
            value={filterBhwStatus}
            allowCustom
            onChange={v => setFilterBhwStatus(v === '' ? 'all' : v)}
            size='sm'
            className='w-full min-w-0'
            options={[
              { value: 'all', label: 'All BHWs' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'unassigned', label: 'Unassigned' }
            ]}
          />
        </div>
        <div className='hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2'>
          <span className='text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1'>Risk:</span>
          {[
            { value: 'all', label: 'All' },
            { value: 'Critical Health Risk', label: 'Critical' },
            { value: 'High Health Risk', label: 'High' },
            { value: 'Moderate Health Risk', label: 'Moderate' },
            { value: 'Low Health Risk', label: 'Low' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterPurokRisk(opt.value)}
              className={`px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterPurokRisk === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className='text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>BHW:</span>
          {[
            { value: 'all', label: 'All' },
            { value: 'assigned', label: 'Assigned' },
            { value: 'unassigned', label: 'Unassigned' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterBhwStatus(opt.value)}
              className={`px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterBhwStatus === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {filteredPuroks.length > 0 ? (
        <>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {paginatedPuroks.map(purok => {
            const assignedBhws = bhwByPurok[purok.id] || []
            const scheduleCount = scheduleCountByPurok[purok.id] || 0
            return (
            <GlassCard key={purok.id} onClick={() => handlePurokClick(purok)}>
              <div className='flex items-center justify-between mb-1'>
                <div className='flex items-center gap-2 min-w-0 flex-wrap'>
                  <h3
                    className='text-2xl font-bold text-white'
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    {purok.name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPurokRiskBadgeClass(purok.riskLevel)}`}>
                    {(purok.riskLevel || 'Low Health Risk').replace(' Health Risk', '')} Risk
                  </span>
                </div>
                <button
                  onClick={e => handleDelete(purok.id, e)}
                  className='p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-red-400'
                >
                  <Trash2 className='w-4 h-4' />
                </button>
              </div>
              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-1 pl-0.5'>
                  <Users className='w-5 h-5 text-blue-400' />
                  <p className='pl-1 text-2xl font-bold text-white'>
                    {purok.totalResidents || 0}
                  </p>
                </div>

                <div className='flex justify-between text-xs text-white/30'>
                  <span>Click to view details</span>
                  <ChevronRight className='w-4 h-4' />
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10'>
                {assignedBhws.length > 0 ? (
                  <span
                    title={assignedBhws.map(b => b.name).join(', ')}
                    className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 max-w-full'
                  >
                    <User className='w-3 h-3 shrink-0' />
                    <span className='truncate'>
                      {assignedBhws[0].name}
                      {assignedBhws.length > 1 ? ` +${assignedBhws.length - 1}` : ''}
                    </span>
                  </span>
                ) : (
                  <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30'>
                    <User className='w-3 h-3' />
                    No BHW assigned
                  </span>
                )}
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30'>
                  <Calendar className='w-3 h-3' />
                  {scheduleCount} schedule{scheduleCount !== 1 ? 's' : ''}
                </span>
              </div>
            </GlassCard>
            )
          })}
        </div>
        {!hasActivePurokFilters && <Pagination
          page={safePurokPage}
          totalPages={totalPurokPages}
          onPageChange={setPurokPage}
          total={filteredPuroks.length}
          perPage={puroksPerPage}
        />}
        </>
      ) : (
        <GlassCard hover={false} className='text-center py-12'>
          <MapPin className='w-16 h-16 text-white/20 mx-auto mb-4' />
          <p className='text-white/40 text-sm mb-2'>
            {hasActivePurokFilters ? 'No puroks match your filters' : 'No puroks added yet'}
          </p>
        </GlassCard>
      )}
      <Modal
        isOpen={showEditMap}
        onClose={() => setShowEditMap(false)}
        title='Edit Purok Map'
        size='xl'
        bodyClassName='p-4 sm:p-6 flex flex-col overflow-hidden h-[calc(100vh-9rem)] min-h-[45vh]'
      >
        <PurokRiskMap
          title='Purok Pin Locations'
          puroks={puroks.map(p => ({
            purokId: p.id,
            purokName: p.name,
            latitude: p.latitude,
            longitude: p.longitude,
            pinLabel: p.pinLabel,
            totalResidents: p.totalResidents,
            critical: p.critical || 0,
            high: p.high || 0,
            moderate: p.moderate || 0,
            low: p.low || 0,
            averageRiskScore: p.averageRiskScore,
            riskLevel: p.riskLevel,
          }))}
          fillHeight
          onSaved={(id, lat, lng, pinLabel) =>
            setPuroks(prev =>
              prev.map(p =>
                String(p.id) === String(id)
                  ? {
                      ...p,
                      latitude: lat,
                      longitude: lng,
                      ...(pinLabel !== undefined ? { pinLabel } : {}),
                    }
                  : p
              )
            )
          }
        />
      </Modal>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title='Add New Purok'
      >
        <form onSubmit={handleAddPurok} className='space-y-4'>
          <GlassInput
            label='Purok Name'
            value={newPurokName}
            onChange={e => setNewPurokName(e.target.value)}
            required
            placeholder='Enter purok name'
          />
          <div className='grid !grid-cols-2 gap-3 sm:flex sm:justify-end'>
            <GlassButton
              className='!w-full min-w-0 sm:!w-auto'
              variant='secondary'
              type='button'
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={saving}>
              Add Purok
            </GlassButton>
          </div>
        </form>
      </Modal>

      {/* Purok Details Modal - old layout preserved, shown together */}
      <Modal
        isOpen={!!selectedPurok}
        onClose={handleBack}
        title='Purok Details'
        size='xl'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        {selectedPurok && renderPurokDetailContent()}
      </Modal>
    </div>
  )
}

export default Purok
