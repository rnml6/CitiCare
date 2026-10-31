// pages/bhw-worker/MyResidents.jsx
// Combined purok overview + resident list. Shows purok stats and every
// resident in the handled purok (plus focus group if assigned).
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, Users, Heart, User, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { residentApi } from '../../api/residentApi'
import { purokApi } from '../../api/purokApi'
import { useAuth } from '../../context/AuthContext'
import GlassCard from '../../components/GlassCard'
import GlassButton from '../../components/GlassButton'
import GlassInput from '../../components/GlassInput'
import GlassSelect from '../../components/GlassSelect'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatCard from '../../components/StatCard'
import ResidentDetail from '../ResidentDetail'
import { SkeletonMyResidentsPage } from '../../components/Skeleton'
import { getRiskColor, formatAge, formatAgeLong } from '../../utils/helpers'
import { dialog } from '../../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys } from '../../utils/validation'
import { focusFirstError } from '../../utils/focusInvalidField'

const FOCUS_LABELS = { pregnant: 'Pregnant', senior: 'Senior Citizen', infant: 'Infants' }
const FOCUS_META = {
  pregnant: 'Pregnant Women',
  senior: 'Senior Citizens (60+)',
  infant: 'Infants (0-59 months)'
}

const MyResidents = () => {
  const statScrollIndicatorRef = useRef(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Cross-page redirection (admin parity): opening via navigation state
  // shows the detail modal, and closing returns to the originating page.
  const [returnTo, setReturnTo] = useState(null)
  const [returnState, setReturnState] = useState(null)
  const bhwName = user?.bhw?.name || user?.name || ''
  const [data, setData] = useState(null)
  const [purok, setPurok] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('purok')
  const [search, setSearch] = useState('')
  const [filterRisk, setFilterRisk] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [page, setPage] = useState(1)
  const perPage = 9
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', gender: 'Female', dateOfBirth: '', civilStatus: 'Single', contactNumber: '', contactPerson: '', contactPersonNumber: '', contactPersonAddress: '', lastCheckup: '', focusGroups: [], chronicConditions: [], motherName: '', fatherName: '', disabilityType: '' })
  const [addErrors, setAddErrors] = useState({})
  const [addAgeDisplay, setAddAgeDisplay] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [editResident, setEditResident] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', dateOfBirth: '', age: '', gender: '', civilStatus: 'Single', purokId: '', purok: '', contactNumber: '', contactPerson: '', contactPersonNumber: '', contactPersonAddress: '', lastCheckup: '', focusGroups: [], chronicConditions: [], motherName: '', fatherName: '', disabilityType: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editAgeDisplay, setEditAgeDisplay] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => { fetchMine(); fetchPurok() }, [])
  useEffect(() => { setPage(1) }, [search, tab, filterRisk, filterGroup])

  const calculateAge = dateOfBirth => {
    if (!dateOfBirth) return { years: 0, display: '' }
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let years = today.getFullYear() - birthDate.getFullYear()
    let months = today.getMonth() - birthDate.getMonth()
    if (today.getDate() < birthDate.getDate()) months--
    if (months < 0) { years--; months += 12 }
    const display = formatAgeLong(dateOfBirth)
    return { years, display }
  }

  const handleAddFormChange = (field, value) => {
    const nextValue = (field === 'contactNumber' || field === 'contactPersonNumber')
      ? sanitizePhoneInput(value)
      : value
    setAddForm(prev => ({ ...prev, [field]: nextValue }))
    if (addErrors[field]) setAddErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleAddFocusGroupToggle = (group) => {
    setAddForm(prev => {
      const current = prev.focusGroups || []
      if (current.includes(group)) {
        const next = { ...prev, focusGroups: current.filter(g => g !== group) }
        if (group === 'pwd') next.disabilityType = ''
        return next
      }
      return { ...prev, focusGroups: [...current, group] }
    })
  }

  useEffect(() => {
    if (addForm.dateOfBirth) {
      const ageData = calculateAge(addForm.dateOfBirth)
      setAddAgeDisplay(ageData.display)
      setAddForm(prev => {
        const age = ageData.years
        let focusGroups = [...(prev.focusGroups || [])]
        if (age >= 0 && age < 5) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
        else { focusGroups = focusGroups.filter(g => g !== 'infant') }
        if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
        else { focusGroups = focusGroups.filter(g => g !== 'senior') }
        if ((prev.chronicConditions || []).length > 0) { if (!focusGroups.includes('withCondition')) focusGroups.push('withCondition') }
        else { focusGroups = focusGroups.filter(g => g !== 'withCondition') }
        if (prev.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')
        return { ...prev, focusGroups }
      })
    } else {
      setAddAgeDisplay('')
      setAddForm(prev => ({ ...prev, focusGroups: prev.focusGroups?.filter(g => g !== 'infant' && g !== 'senior') || [] }))
    }
  }, [addForm.dateOfBirth, addForm.chronicConditions, addForm.gender])

  const fetchMine = async () => {
    try {
      setLoading(true)
      const res = await residentApi.getMine()
      if (res.data.success) {
        setData(res.data.data)
        if (!res.data.data.focusGroup) setTab('purok')
      }
    } catch (err) {
      console.error('My residents error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPurok = async () => {
    try {
      const res = await purokApi.getMine()
      if (res.data.success) setPurok(res.data.data)
    } catch (err) {
      console.error('My purok error:', err)
    }
  }

  const openDetail = (id) => {
    setDetailId(id)
  }

  const navigateBack = (dest, state) => {
    setReturnTo(null)
    setReturnState(null)
    navigate(dest, { state: state || {} })
  }

  const closeDetail = () => {
    setDetailId(null)
    if (returnTo) navigateBack(returnTo, returnState)
  }

  // Open the detail modal when navigated here with a resident id (e.g.
  // from the home dashboard) — admin parity.
  useEffect(() => {
    if (location.state?.viewResidentId) {
      setDetailId(location.state.viewResidentId)
      if (location.state?.from && location.state.from !== '/my-residents') {
        setReturnTo(location.state.from)
        setReturnState(location.state?.returnState || null)
      }
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const handleAddResident = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const nextErrors = {}
    if (!addForm.name) nextErrors.name = 'Full name is required.'
    if (!addForm.gender) nextErrors.gender = 'Gender is required.'
    if (!addForm.dateOfBirth) nextErrors.dateOfBirth = 'Date of birth is required.'
    if ((addForm.focusGroups || []).includes('pwd') && !addForm.disabilityType?.trim()) {
      nextErrors.disabilityType = 'Please specify the disability for PWD residents.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setAddErrors(nextErrors)
      focusFirstError(nextErrors, form)
      return
    }
    setAddErrors({})
    const confirmed = await confirmCreate('resident', `Please confirm that you want to add ${addForm.name}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      const ageData = calculateAge(addForm.dateOfBirth)
      const age = ageData.years
      let focusGroups = [...(addForm.focusGroups || [])]
      const isInfantAge = age >= 0 && age < 5
      const isPwdChecked = focusGroups.includes('pwd')
      if (isInfantAge) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
      else { focusGroups = focusGroups.filter(g => g !== 'infant') }
      if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
      else { focusGroups = focusGroups.filter(g => g !== 'senior') }
      if ((addForm.chronicConditions || []).length > 0) { if (!focusGroups.includes('withCondition')) focusGroups.push('withCondition') }
      else { focusGroups = focusGroups.filter(g => g !== 'withCondition') }
      if (addForm.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')
      const dataToSend = {
        ...addForm, age, focusGroups, isPwd: isPwdChecked,
        motherName: isInfantAge ? (addForm.motherName?.trim() || null) : null,
        fatherName: isInfantAge ? (addForm.fatherName?.trim() || null) : null,
        disabilityType: isPwdChecked ? (addForm.disabilityType?.trim() || null) : null
      }
      await residentApi.create(dataToSend)
      setShowAdd(false)
      setAddErrors({})
      setAddForm({ name: '', gender: 'Female', dateOfBirth: '', civilStatus: 'Single', contactNumber: '', contactPerson: '', contactPersonNumber: '', contactPersonAddress: '', lastCheckup: '', focusGroups: [], chronicConditions: [], motherName: '', fatherName: '', disabilityType: '' })
      setAddAgeDisplay('')
      fetchMine()
      dialog.toast('Resident added successfully.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to add resident', 'Unable to add resident')
    } finally {
      setSaving(false)
    }
  }

  const openEditResident = async (r) => {
    setEditResident(r)
    setEditErrors({})
    // Same full-profile load as the admin Edit Resident Profile: prefer
    // the fresh getById() detail, fall back to the list row.
    try {
      const response = await residentApi.getById(r.id)
      if (response.data.success) {
        const full = response.data.data
        setEditForm({
          name: full.name || '', dateOfBirth: full.dateOfBirth || '',
          age: full.age || '', gender: full.gender || '',
          civilStatus: full.civilStatus || 'Single', purokId: full.purokId || '', purok: full.purok || '',
          contactNumber: full.contactNumber || '', contactPerson: full.contactPerson || '',
          contactPersonNumber: full.contactPersonNumber || '',
          contactPersonAddress: full.contactPersonAddress || '',
          lastCheckup: full.lastCheckup || '',
          focusGroups: full.focusGroups || [], chronicConditions: full.chronicConditions || [],
          motherName: full.motherName || '', fatherName: full.fatherName || '',
          disabilityType: full.disabilityType || ''
        })
        if (full.dateOfBirth) setEditAgeDisplay(calculateAge(full.dateOfBirth).display)
        else setEditAgeDisplay('')
        return
      }
    } catch (error) {
      console.error('Error fetching resident for edit:', error)
    }
    setEditForm({
      name: r.name || '', dateOfBirth: r.dateOfBirth || '',
      age: r.age || '', gender: r.gender || '',
      civilStatus: r.civilStatus || 'Single', purokId: r.purokId || '', purok: r.purok || '',
      contactNumber: r.contactNumber || '', contactPerson: r.contactPerson || '',
      contactPersonNumber: r.contactPersonNumber || '',
      contactPersonAddress: r.contactPersonAddress || '',
      lastCheckup: r.lastCheckup || '',
      focusGroups: r.focusGroups || [], chronicConditions: r.chronicConditions || [],
      motherName: r.motherName || '', fatherName: r.fatherName || '',
      disabilityType: r.disabilityType || ''
    })
    if (r.dateOfBirth) setEditAgeDisplay(calculateAge(r.dateOfBirth).display)
    else setEditAgeDisplay('')
  }

  const updateEditField = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    if (editErrors[field]) setEditErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleEditFocusGroupToggle = (group) => {
    setEditForm(prev => {
      const current = prev.focusGroups || []
      if (current.includes(group)) {
        const next = { ...prev, focusGroups: current.filter(g => g !== group) }
        if (group === 'pwd') next.disabilityType = ''
        return next
      }
      return { ...prev, focusGroups: [...current, group] }
    })
  }

  // Same age/focus-group auto-sync as the admin form: infant (<5) and
  // senior (60+) derive from date of birth, withCondition from chronic
  // conditions, and males can never be pregnant.
  useEffect(() => {
    if (!editResident) return
    if (editForm.dateOfBirth) {
      const ageData = calculateAge(editForm.dateOfBirth)
      setEditAgeDisplay(ageData.display)
      setEditForm(prev => {
        const age = ageData.years
        let focusGroups = [...(prev.focusGroups || [])]
        if (age >= 0 && age < 5) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
        else { focusGroups = focusGroups.filter(g => g !== 'infant') }
        if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
        else { focusGroups = focusGroups.filter(g => g !== 'senior') }
        if ((prev.chronicConditions || []).length > 0) { if (!focusGroups.includes('withCondition')) focusGroups.push('withCondition') }
        else { focusGroups = focusGroups.filter(g => g !== 'withCondition') }
        if (prev.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')
        return { ...prev, age: age.toString(), focusGroups }
      })
    } else {
      setEditAgeDisplay('')
      setEditForm(prev => ({ ...prev, age: '' }))
    }
  }, [editResident, editForm.dateOfBirth, editForm.chronicConditions, editForm.gender])

  const handleEditResident = async (e) => {
    e.preventDefault()
    if (!editResident) return
    const form = e.currentTarget
    const nextErrors = {}
    if (!editForm.name) nextErrors.name = 'Full name is required.'
    if (!editForm.gender) nextErrors.gender = 'Gender is required.'
    if (!editForm.dateOfBirth) nextErrors.dateOfBirth = 'Date of birth is required.'
    if ((editForm.focusGroups || []).includes('pwd') && !editForm.disabilityType?.trim()) {
      nextErrors.disabilityType = 'Please specify the disability for PWD residents.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors)
      focusFirstError(nextErrors, form)
      return
    }
    setEditErrors({})
    const confirmed = await confirmUpdate('resident', `Please confirm that you want to save the changes to ${editForm.name}.`)
    if (!confirmed) return
    setEditSaving(true)
    try {
      const ageData = calculateAge(editForm.dateOfBirth)
      const age = ageData.years
      let focusGroups = [...(editForm.focusGroups || [])]
      const isInfantAge = age >= 0 && age < 5
      const isPwdChecked = focusGroups.includes('pwd')
      if (isInfantAge) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
      else { focusGroups = focusGroups.filter(g => g !== 'infant') }
      if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
      else { focusGroups = focusGroups.filter(g => g !== 'senior') }
      if ((editForm.chronicConditions || []).length > 0) { if (!focusGroups.includes('withCondition')) focusGroups.push('withCondition') }
      else { focusGroups = focusGroups.filter(g => g !== 'withCondition') }
      if (editForm.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')
      // Purok stays untouched (same id the resident already has) — workers
      // cannot move residents out of their handled purok (server-enforced).
      const dataToSend = {
        ...editForm, age, focusGroups, purokId: editResident.purokId || editForm.purokId || null,
        isPwd: isPwdChecked,
        motherName: isInfantAge ? (editForm.motherName?.trim() || null) : null,
        fatherName: isInfantAge ? (editForm.fatherName?.trim() || null) : null,
        disabilityType: isPwdChecked ? (editForm.disabilityType?.trim() || null) : null
      }
      await residentApi.update(editResident.id, dataToSend)
      setEditResident(null)
      fetchMine()
      dialog.toast('Resident updated successfully.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to update resident', 'Unable to update resident')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteResident = async (id) => {
    const confirmed = await dialog.confirm({
      title: 'Delete resident?',
      message: 'This resident record will be permanently deleted. This cannot be undone.',
      confirmText: 'Delete resident',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await residentApi.delete(id)
      fetchMine()
      dialog.toast('Resident deleted.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to delete resident', 'Unable to delete resident')
    }
  }

  if (loading) {
    return <SkeletonMyResidentsPage count={6} />
  }

  const list = tab === 'focus' ? (data?.focusResidents || []) : (data?.purokResidents || [])
  const filtered = list.filter(r => {
    if (search && !r.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterRisk !== 'all' && r.riskLevel !== filterRisk) return false
    if (filterGroup !== 'all') {
      const groups = r.focusGroups || []
      if (filterGroup === 'none' && groups.length > 0) return false
      if (filterGroup !== 'none' && !groups.includes(filterGroup)) return false
    }
    return true
  })
  const hasActiveFilters = search !== '' || filterRisk !== 'all' || filterGroup !== 'all'
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paged = hasActiveFilters ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage)
  const focusLabel = data?.focusGroup ? (FOCUS_LABELS[data.focusGroup] || data.focusGroup) : null
  // Header + stat cards follow the active tab: handled purok name/stats on
  // the purok tab, focus-group name/stats (computed from its barangay-wide
  // residents) on the focus/vulnerable-group tab.
  const isFocusTab = tab === 'focus' && data?.focusGroup
  const focusTitle = data?.focusGroup ? (FOCUS_META[data.focusGroup] || FOCUS_LABELS[data.focusGroup] || data.focusGroup) : 'Residents'
  const countRisk = (residents, level) => residents.filter(r => String(r.riskLevel || '').toLowerCase().includes(level)).length
  const focusStats = isFocusTab ? (() => {
    const residents = data?.focusResidents || []
    return {
      total: residents.length,
      critical: countRisk(residents, 'critical'),
      high: countRisk(residents, 'high'),
      moderate: countRisk(residents, 'moderate'),
      low: countRisk(residents, 'low')
    }
  })() : null
  const headerCount = filtered.length

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>{isFocusTab ? focusTitle : (purok?.name || 'Residents')}</h1>
          <p className='text-sm text-white/75'>{headerCount} resident{headerCount !== 1 ? 's' : ''}{hasActiveFilters && ' (filtered)'}</p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} aria-label='Add Resident' onClick={() => setShowAdd(true)}>
          <span className='hidden sm:inline'>Add Resident</span>
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
          className='dashboard-stat-scroll flex flex-nowrap touch-pan-x overscroll-x-contain lg:grid lg:grid-cols-5 gap-3 overflow-x-auto pb-3 lg:overflow-visible lg:pb-0'
        >
          {isFocusTab ? (
            <>
              <StatCard label='Total Residents' value={focusStats.total} icon={Users} color='blue' />
              <StatCard label='Critical Risk' value={focusStats.critical} icon={AlertTriangle} color='red' />
              <StatCard label='High Risk' value={focusStats.high} icon={AlertTriangle} color='orange' />
              <StatCard label='Moderate Risk' value={focusStats.moderate} icon={Users} color='purple' />
              <StatCard label='Low Risk' value={focusStats.low} icon={Users} color='green' />
            </>
          ) : purok ? (
            <>
              <StatCard label='Total Residents' value={purok.totalResidents} icon={Users} color='blue' />
              <StatCard label='Critical Risk' value={purok.critical} icon={AlertTriangle} color='red' />
              <StatCard label='High Risk' value={purok.high} icon={AlertTriangle} color='orange' />
              <StatCard label='Moderate Risk' value={purok.moderate} icon={Users} color='purple' />
              <StatCard label='Low Risk' value={purok.low} icon={Users} color='green' />
            </>
          ) : null}
        </div>
        <div className='dashboard-stat-scroll-indicator lg:hidden' aria-hidden='true'><span ref={statScrollIndicatorRef} /></div>
      </div>

      <div className='flex flex-nowrap sm:flex-wrap items-center gap-2 [&+*]:!mt-3'>
        <div className='flex-1 min-w-0 [&_input]:h-10 [&_input]:py-0'>
          <GlassInput icon={Search} placeholder='Search by name...' value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {data?.focusGroup && (
          <div className='inline-flex items-stretch gap-1 px-1.5 py-1 bg-white/[0.06] border border-white/10 rounded-xl min-h-[42px] w-auto shrink-0 min-w-0 sm:hidden'>
            <button type='button' aria-label={`Handled Purok (${data?.counts?.purok || 0})`} title='Handled Purok' onClick={() => setTab('purok')} className={`flex items-center justify-center px-2.5 !py-1.5 rounded-lg text-xs transition-all ${tab === 'purok' ? 'bg-blue-500/30 text-blue-200 shadow-sm' : 'bg-white/[0.06] border border-white/10 text-white/55 hover:text-white/75'}`}>
              <span className='truncate'>Purok</span>
            </button>
            <button type='button' aria-label={`Handled ${FOCUS_LABELS[data.focusGroup] || data.focusGroup} group (${data?.counts?.focus || 0})`} title={FOCUS_LABELS[data.focusGroup] || data.focusGroup} onClick={() => setTab('focus')} className={`flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs transition-all ${tab === 'focus' ? 'bg-purple-500/30 text-purple-200 shadow-sm' : 'bg-white/[0.06] border border-white/10 text-white/55 hover:text-white/75'}`}>
              <span className='text-center leading-tight whitespace-nowrap'>{FOCUS_LABELS[data.focusGroup] || data.focusGroup}</span>
            </button>
          </div>
        )}
        {data?.focusGroup && (
          <div className='hidden sm:inline-flex w-full sm:w-auto items-center gap-1 p-1 bg-white/[0.06] border border-white/10 rounded-xl shrink-0 h-full'>
            <button
              onClick={() => setTab('purok')}
              className={`flex-1 justify-center sm:flex-none px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                tab === 'purok'
                  ? 'bg-blue-500/30 text-blue-200 shadow-sm'
                  : 'text-white/55 hover:text-white/75 hover:bg-white/[0.06]'
              }`}
            >
              <Users className='w-4 h-4' /> Handled Purok ({data?.counts?.purok || 0})
            </button>
            <button
              onClick={() => setTab('focus')}
              className={`flex-1 justify-center sm:flex-none px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                tab === 'focus'
                  ? 'bg-purple-500/30 text-purple-200 shadow-sm'
                  : 'text-white/55 hover:text-white/75 hover:bg-white/[0.06]'
              }`}
            >
              <Heart className='w-4 h-4' /> {FOCUS_LABELS[data.focusGroup] || data.focusGroup} ({data?.counts?.focus || 0})
            </button>
          </div>
        )}
      </div>

      <div className='grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap'>
        <div className='flex flex-wrap items-center gap-2 min-w-0 sm:flex-none sm:w-auto'>
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5'>Risk:</span>
          <GlassSelect
            aria-label='Filter by risk'
            value={filterRisk}
            onChange={setFilterRisk}
            allowCustom={false}
            size='sm'
            className='w-full sm:hidden'
            options={[
              { value: 'all', label: 'All Risks' },
              { value: 'Critical Risk', label: 'Critical' },
              { value: 'High Risk', label: 'High' },
              { value: 'Moderate Risk', label: 'Moderate' },
              { value: 'Low Risk', label: 'Low' }
            ]}
          />
          {[
            { value: 'all', label: 'All' },
            { value: 'Critical Risk', label: 'Critical' },
            { value: 'High Risk', label: 'High' },
            { value: 'Moderate Risk', label: 'Moderate' },
            { value: 'Low Risk', label: 'Low' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterRisk(opt.value)}
              className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterRisk === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {tab !== 'focus' && (
        <div className='flex flex-wrap items-center gap-2 min-w-0 sm:flex-none sm:w-auto'>
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 ml-2 mr-0.5'>Group:</span>
          <GlassSelect
            aria-label='Filter by group'
            value={filterGroup}
            onChange={setFilterGroup}
            allowCustom={false}
            size='sm'
            className='w-full sm:hidden'
            options={[
              { value: 'all', label: 'All Groups' },
              { value: 'infant', label: 'Infant' },
              { value: 'pregnant', label: 'Pregnant' },
              { value: 'pwd', label: 'PWD' },
              { value: 'senior', label: 'Senior' },
              { value: 'withCondition', label: 'w/ Condition' },
              { value: 'none', label: 'None' }
            ]}
          />
          {[
            { value: 'all', label: 'All' },
            { value: 'infant', label: 'Infant' },
            { value: 'pregnant', label: 'Pregnant' },
            { value: 'pwd', label: 'PWD' },
            { value: 'senior', label: 'Senior' },
            { value: 'withCondition', label: 'w/ Condition' },
            { value: 'none', label: 'None' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterGroup(opt.value)}
              className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterGroup === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {paged.length > 0 ? (
        <>
          <div className='grid grid-cols-1 gap-3'>
            {paged.map(r => (
              <GlassCard key={r.id} onClick={() => openDetail(r.id)} className='cursor-pointer'>
                <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3'>
                  <div className='flex items-center gap-3 sm:flex-1 min-w-0'>
                    <div className='min-w-0'>
                      <h3 className='text-white text-xl font-semibold truncate'>{r.name}</h3>
                      <p className='text-sm text-white/75 pl-0.5 sm:pl-0'>
                        {r.dateOfBirth ? formatAge(r.age, r.dateOfBirth) : r.age != null ? `${r.age}y` : 'N/A'}
                        <span className='text-white/50 mx-1.5'>•</span>
                        {r.gender || 'N/A'}
                        {tab === 'focus' && r.purok && <><span className='text-white/50 mx-1.5'>•</span>{r.purok}</>}
                      </p>
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    {r.focusGroups?.length > 0 && (
                      <div className='flex flex-wrap gap-1 min-w-0'>
                        {r.focusGroups.slice(0, 1).map(group => <span key={group} className='resident-focus-badge px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-[10px] font-medium'>{FOCUS_LABELS[group] || group}</span>)}
                        {r.focusGroups.length > 1 && <span className='resident-focus-badge px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-[10px] font-medium'>+{r.focusGroups.length - 1}</span>}
                      </div>
                    )}
                    <span className={`badge ${getRiskColor(r.riskLevel)}`}>{r.riskLevel}</span>
                    <div className='ml-auto flex items-center gap-1 sm:ml-0' onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEditResident(r)} className='p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400' title='Edit'><Pencil className='w-4 h-4' /></button>
                      <button onClick={() => handleDeleteResident(r.id)} className='p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400' title='Delete'><Trash2 className='w-4 h-4' /></button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
          {!hasActiveFilters && <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} total={filtered.length} perPage={perPage} hidePageIndicatorOnMobile />}
        </>
      ) : (
        <GlassCard hover={false} className='text-center py-12'>
          <User className='w-10 h-10 text-white/40 mx-auto mb-3' />
          <p className='text-white/65 text-sm'>{data?.purok ? 'No residents in this list yet' : 'No purok assigned yet — new residents will appear here once you are assigned.'}</p>
        </GlassCard>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title='Add New Resident' panelClassName='resident-add-modal'>
        <form onSubmit={handleAddResident} className='space-y-4'>
          <GlassInput label='Full Name *' name='name' error={addErrors.name} value={addForm.name} onChange={e => handleAddFormChange('name', e.target.value)} required placeholder='Enter full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Date of Birth *' name='dateOfBirth' error={addErrors.dateOfBirth} type='date' value={addForm.dateOfBirth} onChange={e => handleAddFormChange('dateOfBirth', e.target.value)} required />
            <div className='space-y-1.5'>
              <label className='block text-sm text-blue-200'>Age</label>
              <input type='text' value={addAgeDisplay} readOnly className='glass-input text-white/75 cursor-not-allowed' />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <GlassSelect label='Gender *' name='gender' error={addErrors.gender} value={addForm.gender} onChange={v => handleAddFormChange('gender', v)} required allowCustom placeholder='Select gender' options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }, { value: 'Other', label: 'Other' }]} />
            <GlassSelect label='Civil Status' value={addForm.civilStatus} onChange={v => handleAddFormChange('civilStatus', v)} options={[{ value: 'Married', label: 'Married' }, { value: 'Separated', label: 'Separated' }, { value: 'Single', label: 'Single' }, { value: 'Widowed', label: 'Widowed' }]} />
          </div>
          <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={addForm.contactNumber} onChange={e => handleAddFormChange('contactNumber', e.target.value)} placeholder='Enter contact number' />
          <GlassInput label='Last Checkup' type='date' value={addForm.lastCheckup} onChange={e => handleAddFormChange('lastCheckup', e.target.value)} />
          {addForm.focusGroups.includes('infant') && (
            <div className='grid grid-cols-2 gap-3'>
              <GlassInput label="Mother's Name" value={addForm.motherName} onChange={e => handleAddFormChange('motherName', e.target.value)} placeholder="Enter mother's name" />
              <GlassInput label="Father's Name" value={addForm.fatherName} onChange={e => handleAddFormChange('fatherName', e.target.value)} placeholder="Enter father's name" />
            </div>
          )}
          <div className='border-t border-white/10 my-2'></div>
          <div className='space-y-2'>
            <label className='block text-xs text-blue-200 font-medium'>Focus Groups</label>
            <div className='grid grid-cols-2 gap-2'>
              {addForm.gender !== 'Male' && (
                <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${addForm.focusGroups.includes('pregnant') ? 'bg-pink-500/20 border-pink-400/60 text-pink-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                  <input type='checkbox' checked={addForm.focusGroups.includes('pregnant')} onChange={() => handleAddFocusGroupToggle('pregnant')} className='w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50' />
                  <span>Pregnant</span>
                </label>
              )}
              <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${addForm.focusGroups.includes('pwd') ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                <input type='checkbox' checked={addForm.focusGroups.includes('pwd')} onChange={() => handleAddFocusGroupToggle('pwd')} className='w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50' />
                <span>PWD</span>
              </label>
            </div>
            <div className='flex flex-wrap gap-2 mt-1'>
              {addForm.focusGroups.includes('pregnant') && <span className='px-3 py-1.5 bg-pink-500/20 text-pink-300 border border-pink-400/40 rounded-full text-xs font-medium'>Pregnant</span>}
              {addForm.focusGroups.includes('pwd') && <span className='px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded-full text-xs font-medium'>PWD</span>}
              {addForm.focusGroups.includes('infant') && <span className='px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full text-xs font-medium'>Infant (0-59 months)</span>}
              {addForm.focusGroups.includes('senior') && <span className='px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded-full text-xs font-medium'>Senior (60+)</span>}
              {addForm.focusGroups.includes('withCondition') && <span className='px-3 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full text-xs font-medium'>With Condition</span>}
              {addForm.focusGroups.length === 0 && <span className='text-xs text-white/50'>Select groups above</span>}
            </div>
            {addForm.focusGroups.includes('pwd') && (
              <GlassInput label='Specify Disability *' name='disabilityType' error={addErrors.disabilityType} value={addForm.disabilityType} onChange={e => handleAddFormChange('disabilityType', e.target.value)} required placeholder='Enter resident disability' />
            )}
          </div>
          <div className='border-t border-white/10 my-2'></div>
          <label className='block text-xs text-blue-200 font-medium mb-2'>Emergency Contact</label>
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Contact Person' value={addForm.contactPerson} onChange={e => handleAddFormChange('contactPerson', e.target.value)} placeholder='Name' />
            <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={addForm.contactPersonNumber} onChange={e => handleAddFormChange('contactPersonNumber', e.target.value)} placeholder='Phone' />
          </div>
          <GlassInput label='Contact Person Address' value={addForm.contactPersonAddress} onChange={e => handleAddFormChange('contactPersonAddress', e.target.value)} placeholder='Address' />
          <div className='flex justify-end gap-2'>
            <GlassButton variant='secondary' type='button' onClick={() => setShowAdd(false)}>Cancel</GlassButton>
            <GlassButton type='submit' loading={saving}>Add Resident</GlassButton>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!editResident}
        onClose={() => setEditResident(null)}
        title='Edit Resident Profile'
        panelClassName='resident-add-modal'
      >
        <form onSubmit={handleEditResident} className='space-y-4'>
          <GlassInput label='Full Name *' name='name' error={editErrors.name} value={editForm.name} onChange={e => updateEditField('name', e.target.value)} required placeholder='Enter full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Date of Birth *' name='dateOfBirth' error={editErrors.dateOfBirth} type='date' value={editForm.dateOfBirth} onChange={e => updateEditField('dateOfBirth', e.target.value)} required />
            <div className='space-y-1.5'><label className='block text-sm text-blue-200'>Age</label><input type='text' value={editAgeDisplay} readOnly className='glass-input text-white/75 cursor-not-allowed' /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <GlassSelect label='Gender *' name='gender' error={editErrors.gender} value={editForm.gender} onChange={v => updateEditField('gender', v)} required allowCustom placeholder='Select gender' options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }, { value: 'Other', label: 'Other' }]} />
            <GlassSelect label='Civil Status' value={editForm.civilStatus} onChange={v => setEditForm({ ...editForm, civilStatus: v })} options={[{ value: 'Married', label: 'Married' }, { value: 'Separated', label: 'Separated' }, { value: 'Single', label: 'Single' }, { value: 'Widowed', label: 'Widowed' }]} />
          </div>
          <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={editForm.contactNumber} onChange={e => updateEditField('contactNumber', sanitizePhoneInput(e.target.value))} placeholder='Enter contact number' />
          <GlassInput label='Last Checkup' type='date' value={editForm.lastCheckup} onChange={e => setEditForm({ ...editForm, lastCheckup: e.target.value })} />
          {editForm.focusGroups.includes('infant') && (
            <div className='grid grid-cols-2 gap-3'>
              <GlassInput label="Mother's Name" value={editForm.motherName} onChange={e => setEditForm({ ...editForm, motherName: e.target.value })} placeholder="Enter mother's name" />
              <GlassInput label="Father's Name" value={editForm.fatherName} onChange={e => setEditForm({ ...editForm, fatherName: e.target.value })} placeholder="Enter father's name" />
            </div>
          )}
          <div className='space-y-2'>
            <label className='block text-xs text-blue-200 font-medium'>Focus Groups</label>
            <div className='grid grid-cols-2 gap-2'>
              {editForm.gender !== 'Male' && (
                <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${editForm.focusGroups.includes('pregnant') ? 'bg-pink-500/20 border-pink-400/60 text-pink-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                  <input type='checkbox' checked={editForm.focusGroups.includes('pregnant')} onChange={() => handleEditFocusGroupToggle('pregnant')} className='w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50' />
                  <span>Pregnant</span>
                </label>
              )}
              <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${editForm.focusGroups.includes('pwd') ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                <input type='checkbox' checked={editForm.focusGroups.includes('pwd')} onChange={() => handleEditFocusGroupToggle('pwd')} className='w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50' />
                <span>PWD</span>
              </label>
            </div>
            <div className='flex flex-wrap gap-2 mt-1'>
              {editForm.focusGroups.includes('pregnant') && <span className='px-3 py-1.5 bg-pink-500/20 text-pink-300 border border-pink-400/40 rounded-full text-xs font-medium'>Pregnant</span>}
              {editForm.focusGroups.includes('pwd') && <span className='px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded-full text-xs font-medium'>PWD</span>}
              {editForm.focusGroups.includes('infant') && <span className='px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full text-xs font-medium'>Infant (0-59 months)</span>}
              {editForm.focusGroups.includes('senior') && <span className='px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded-full text-xs font-medium'>Senior (60+)</span>}
              {editForm.focusGroups.includes('withCondition') && <span className='px-3 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full text-xs font-medium'>With Condition</span>}
              {editForm.focusGroups.length === 0 && <span className='text-xs text-white/50'>Select groups above</span>}
            </div>
            {editForm.focusGroups.includes('pwd') && (
              <GlassInput label='Specify Disability *' name='disabilityType' error={editErrors.disabilityType} value={editForm.disabilityType} onChange={e => updateEditField('disabilityType', e.target.value)} required placeholder='Enter resident disability' />
            )}
          </div>
          <label className='block text-xs text-blue-200 font-medium mb-2'>Emergency Contact</label>
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Contact Person' value={editForm.contactPerson} onChange={e => setEditForm({ ...editForm, contactPerson: e.target.value })} placeholder='Name' />
            <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={editForm.contactPersonNumber} onChange={e => setEditForm({ ...editForm, contactPersonNumber: sanitizePhoneInput(e.target.value) })} placeholder='Phone' />
          </div>
          <GlassInput label='Contact Person Address' value={editForm.contactPersonAddress} onChange={e => setEditForm({ ...editForm, contactPersonAddress: e.target.value })} placeholder='Address' />
          <div className='flex justify-end gap-3'>
            <GlassButton variant='secondary' type='button' onClick={() => setEditResident(null)}>Cancel</GlassButton>
            <GlassButton type='submit' loading={editSaving}>Update Profile</GlassButton>
          </div>
        </form>
      </Modal>

      {/* Resident Details Modal - uses same component as admin */}
      <Modal
        isOpen={!!detailId}
        onClose={closeDetail}
        title='Resident Details'
        size='xl'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        {detailId && (
          <ResidentDetail
            residentId={detailId}
            embedded
            onClose={closeDetail}
            onDeleted={() => { fetchMine(); closeDetail() }}
          />
        )}
      </Modal>
    </div>
  )
}

export default MyResidents
