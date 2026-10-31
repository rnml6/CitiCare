// pages/Residents.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Plus, Users as UsersIcon, Pencil, Trash2,
  ArrowLeft, Save, Loader2
} from 'lucide-react'
import { residentApi } from '../api/residentApi'
import { purokApi } from '../api/purokApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import ResidentDetail from './ResidentDetail'
import { SkeletonResidentsPage } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import ConfirmModal from '../components/ConfirmModal'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm'
import { focusFirstError } from '../utils/focusInvalidField'
import { getRiskColor, getRiskScoreColor, formatDate, focusGroupLabel, focusGroupsMatch, formatAgeLong } from '../utils/helpers'
import {
  validateResidentFields,
  hasErrors,
  sanitizePhoneInput,
  blockPhoneKeys
} from '../utils/validation'

const Residents = () => {
  const [residents, setResidents] = useState([])
  const [puroks, setPuroks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [page, setPage] = useState(1)
  const perPage = 12

  const [filterPurok, setFilterPurok] = useState('all')
  const [filterRisk, setFilterRisk] = useState('all')
  const [filterFocusGroup, setFilterFocusGroup] = useState('all')

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingResident, setEditingResident] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const [formData, setFormData] = useState({
    name: '', dateOfBirth: '', age: '', gender: '', civilStatus: 'Single',
    purokId: '', contactNumber: '', contactPerson: '', contactPersonNumber: '',
    contactPersonAddress: '', lastCheckup: '', focusGroups: [],
    chronicConditions: [], motherName: '', fatherName: '', disabilityType: ''
  })
  // Infant (Mother/Father Name) + PWD disability inputs show when these are true.
  const isInfantResident = (formData.focusGroups || []).includes('infant')
  const isPwdResident = (formData.focusGroups || []).includes('pwd')
   const [ageDisplay, setAgeDisplay] = useState('')

  const [selectedResidentId, setSelectedResidentId] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [returnTo, setReturnTo] = useState(null)
  const [returnState, setReturnState] = useState(null)

  const openDetailModal = (resident) => {
    setSelectedResidentId(resident.id)
    setShowDetailModal(true)
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedResidentId(null)
    fetchResidents()
    // If this detail was opened from another page (Dashboard/Purok),
    // Close returns to that previous page/modal instead of staying here.
    if (returnTo) {
      const dest = returnTo
      const state = returnState
      setReturnTo(null)
      setReturnState(null)
      navigate(dest, { state: state || {} })
    }
  }

  const handleDetailDeleted = (deletedId) => {
    setResidents(prev => prev.filter(r => r.id !== deletedId))
  }

  const navigate = useNavigate()
  const location = useLocation()

  const fetchResidents = useCallback(async () => {
    try { setLoading(true); const response = await residentApi.getAll(); if (response.data.success) setResidents(response.data.data) }
    catch (error) { console.error('Error fetching residents:', error) }
    finally { setLoading(false) }
  }, [])
  const fetchPuroks = useCallback(async () => {
    try { const response = await purokApi.getAll(); if (response.data.success) setPuroks(response.data.data) }
    catch (error) { console.error('Error fetching puroks:', error) }
  }, [])

  useEffect(() => { fetchResidents(); fetchPuroks() }, [fetchResidents, fetchPuroks])

  // Open detail modal when navigated here with viewResidentId (Dashboard/Purok flows) - modal only, no page
  useEffect(() => {
    if (location.state?.viewResidentId) {
      setSelectedResidentId(location.state.viewResidentId)
      setShowDetailModal(true)
      if (location.state?.from && location.state.from !== '/residents') {
        setReturnTo(location.state.from)
        setReturnState(location.state?.returnState || null)
      }
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const calculateAge = dateOfBirth => {
    if (!dateOfBirth) return { years: 0, display: '' }
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let years = today.getFullYear() - birthDate.getFullYear()
    let months = today.getMonth() - birthDate.getMonth()
    if (today.getDate() < birthDate.getDate()) months--
    if (months < 0) { years--; months += 12 }
    // Single-unit display comes from the shared universal helper;
    // years stays full years for infant/senior classification.
    const display = formatAgeLong(dateOfBirth)
    return { years, display }
  }

  const openAddModal = () => {
    setFormData({ name: '', dateOfBirth: '', age: '', gender: '', civilStatus: 'Single', purokId: '', contactNumber: '', contactPerson: '', contactPersonNumber: '', contactPersonAddress: '', lastCheckup: '', focusGroups: [], chronicConditions: [], motherName: '', fatherName: '', disabilityType: '' })
    setAgeDisplay('')
    setEditingResident(null)
    setShowAddModal(true)
  }

  const openEditModal = async (resident) => {
    setEditingResident(resident)
    try {
      const response = await residentApi.getById(resident.id)
      if (response.data.success) {
        const full = response.data.data
        setFormData({
          name: full.name || '', dateOfBirth: full.dateOfBirth || '',
          age: full.age || '', gender: full.gender || '',
          civilStatus: full.civilStatus || 'Single', purokId: full.purokId || '',
          contactNumber: full.contactNumber || '', contactPerson: full.contactPerson || '',
          contactPersonNumber: full.contactPersonNumber || '',
          contactPersonAddress: full.contactPersonAddress || '',
          lastCheckup: full.lastCheckup || '',
          focusGroups: full.focusGroups || [], chronicConditions: full.chronicConditions || [],
          motherName: full.motherName || '', fatherName: full.fatherName || '',
          disabilityType: full.disabilityType || ''
        })
        if (full.dateOfBirth) {
          const ageData = calculateAge(full.dateOfBirth)
          setAgeDisplay(ageData.display)
        }
      }
    } catch (error) {
      console.error('Error fetching resident for edit:', error)
      setFormData({
        name: resident.name || '', dateOfBirth: resident.dateOfBirth || '',
        age: resident.age || '', gender: resident.gender || '',
        civilStatus: resident.civilStatus || 'Single', purokId: resident.purokId || '',
        contactNumber: resident.contactNumber || '', contactPerson: resident.contactPerson || '',
        contactPersonNumber: resident.contactPersonNumber || '',
        contactPersonAddress: resident.contactPersonAddress || '',
        lastCheckup: resident.lastCheckup || '',
        focusGroups: resident.focusGroups || [], chronicConditions: resident.chronicConditions || [],
        motherName: resident.motherName || '', fatherName: resident.fatherName || '',
        disabilityType: resident.disabilityType || ''
      })
      if (resident.dateOfBirth) {
        const ageData = calculateAge(resident.dateOfBirth)
        setAgeDisplay(ageData.display)
      }
    }
    setShowEditModal(true)
  }

  const closeModal = () => { setShowAddModal(false); setShowEditModal(false); setEditingResident(null); setFormErrors({}) }

  const handleFormChange = (field, value) => {
    const nextValue = (field === 'contactNumber' || field === 'contactPersonNumber')
      ? sanitizePhoneInput(value)
      : value
    setFormData(prev => ({ ...prev, [field]: nextValue }))
    setFormErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleFocusGroupToggle = (group) => {
    setFormData(prev => {
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
    if (formData.dateOfBirth) {
      const ageData = calculateAge(formData.dateOfBirth)
      setAgeDisplay(ageData.display)
      setFormData(prev => {
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
      setAgeDisplay('')
      setFormData(prev => ({ ...prev, age: '' }))
    }
  }, [formData.dateOfBirth, formData.chronicConditions, formData.gender])

  const handleSave = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const errors = validateResidentFields(formData)
    if (hasErrors(errors)) {
      setFormErrors(errors)
      focusFirstError(errors, form)
      return
    }
    setFormErrors({})
    const confirmed = editingResident
      ? await confirmUpdate('resident', `Please confirm that you want to save the changes to ${formData.name}.`)
      : await confirmCreate('resident', `Please confirm that you want to add ${formData.name}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      const ageData = calculateAge(formData.dateOfBirth)
      const age = ageData.years
      let focusGroups = [...(formData.focusGroups || [])]
      const isInfantAge = age >= 0 && age < 5
      const isPwdChecked = focusGroups.includes('pwd')
      if (isInfantAge) { if (!focusGroups.includes('infant')) focusGroups.push('infant') }
      else { focusGroups = focusGroups.filter(g => g !== 'infant') }
      if (age >= 60) { if (!focusGroups.includes('senior')) focusGroups.push('senior') }
      else { focusGroups = focusGroups.filter(g => g !== 'senior') }
      if ((formData.chronicConditions || []).length > 0) { if (!focusGroups.includes('withCondition')) focusGroups.push('withCondition') }
      else { focusGroups = focusGroups.filter(g => g !== 'withCondition') }
      if (formData.gender === 'Male') focusGroups = focusGroups.filter(g => g !== 'pregnant')
      const dataToSend = {
        ...formData, age, focusGroups, isPwd: isPwdChecked,
        motherName: isInfantAge ? (formData.motherName?.trim() || null) : null,
        fatherName: isInfantAge ? (formData.fatherName?.trim() || null) : null,
        disabilityType: isPwdChecked ? (formData.disabilityType?.trim() || null) : null
      }
      if (editingResident) { await residentApi.update(editingResident.id, dataToSend) }
      else { await residentApi.create(dataToSend) }
      closeModal()
      fetchResidents()
      dialog.toast(editingResident ? 'Resident updated successfully.' : 'Resident added successfully.', 'success')
    } catch (error) { dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save resident'); }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    setDeleteTargetId(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try { setDeletingId(deleteTargetId); await residentApi.delete(deleteTargetId); setResidents(prev => prev.filter(r => r.id !== deleteTargetId)); dialog.toast('Resident deleted.', 'success') }
    catch (error) { console.error('Error deleting resident:', error); dialog.error(error.response?.data?.message || 'Failed to delete resident', 'Unable to delete resident') }
    finally { setDeletingId(null); setShowDeleteConfirm(false); setDeleteTargetId(null) }
  }

  const filteredResidents = residents.filter(resident => {
    const matchesSearch = !searchTerm || resident.name?.toLowerCase().includes(searchTerm.toLowerCase()) || resident.purok?.toLowerCase().includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false
    if (filterPurok !== 'all' && resident.purok !== filterPurok) return false
    if (filterRisk !== 'all' && resident.riskLevel !== filterRisk) return false
    if (filterFocusGroup !== 'all') { if (filterFocusGroup === 'none') { if ((resident.focusGroups || []).length > 0) return false } else { if (!focusGroupsMatch(resident.focusGroups, filterFocusGroup)) return false } }
    return true
  })

  const hasActiveFilters = filterPurok !== 'all' || filterRisk !== 'all' || filterFocusGroup !== 'all' || searchTerm !== ''

  useEffect(() => { setPage(1) }, [searchTerm, filterPurok, filterRisk, filterFocusGroup])

  const totalPages = Math.ceil(filteredResidents.length / perPage)
  const paginatedResidents = hasActiveFilters ? filteredResidents : filteredResidents.slice((page - 1) * perPage, page * perPage)

  if (loading) return <SkeletonResidentsPage count={6} />

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>Residents</h1>
          <p className='text-sm text-white/75'>{filteredResidents.length} of {residents.length} residents{hasActiveFilters && ' (filtered)'}</p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} title='Add Resident' onClick={openAddModal}>
          <span className='hidden sm:inline'>Add Resident</span>
        </GlassButton>
      </div>

      <div className='space-y-3'>
        <GlassInput icon={Search} placeholder='Search residents by name or purok...' value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />

        {/* Mobile uses compact full-width dropdowns; desktop retains filter pills. */}
        <div className='grid grid-cols-3 items-center gap-2 sm:flex sm:flex-wrap sm:gap-2'>
          <GlassSelect
            aria-label='Filter by purok'
            value={filterPurok}
            allowCustom
            onChange={v => setFilterPurok(v === '' ? 'all' : v)}
            size='sm'
            className='w-full min-w-0 sm:hidden'
            options={[{ value: 'all', label: 'All Puroks' }, ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(purok => ({ value: purok.name, label: purok.name }))]}
          />
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1'>Purok:</span>
          <GlassSelect
            value={filterPurok}
            allowCustom
            onChange={v => setFilterPurok(v === '' ? 'all' : v)}
            size='sm'
            autoWidth
            className='hidden sm:block shrink-0'
            options={[{ value: 'all', label: 'All Puroks' }, ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(purok => ({ value: purok.name, label: purok.name }))]}
          />
          <GlassSelect
            aria-label='Filter by risk'
            value={filterRisk}
            onChange={setFilterRisk}
            allowCustom={false}
            size='sm'
            className='w-full min-w-0 sm:hidden'
            options={[
              { value: 'all', label: 'All Risks' },
              { value: 'Critical Risk', label: 'Critical' },
              { value: 'High Risk', label: 'High' },
              { value: 'Moderate Risk', label: 'Moderate' },
              { value: 'Low Risk', label: 'Low' }
            ]}
          />
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>Risk:</span>
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
          <GlassSelect
            aria-label='Filter by group'
            value={filterFocusGroup}
            onChange={setFilterFocusGroup}
            allowCustom={false}
            size='sm'
            className='w-full min-w-0 sm:hidden'
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
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>Group:</span>
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
              onClick={() => setFilterFocusGroup(opt.value)}
              className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterFocusGroup === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filteredResidents.length > 0 ? (
        <>
          <div className='grid grid-cols-1 gap-3'>
            {paginatedResidents.map(resident => (
              <GlassCard key={resident.id} onClick={() => openDetailModal(resident)} className='cursor-pointer'>
                <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3'>
                  <div className='flex items-center gap-3 sm:flex-1 min-w-0'>
                    <div className='min-w-0'>
                      <h3 className='text-white text-xl font-semibold truncate'>{resident.name}</h3>
                      <p className='text-sm text-white/75 pl-0.5 sm:pl-0'>
                        {resident.dateOfBirth ? calculateAge(resident.dateOfBirth).display : (resident.age != null ? resident.age + 'y' : 'N/A')}
                        <span className='text-white/50 mx-1.5'>•</span>{resident.gender || 'N/A'}
                        <span className='hidden sm:inline'><span className='text-white/50 mx-1.5'>•</span>{resident.purok || 'No Purok'}</span>
                      </p>
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2 sm:shrink-0'>
                    <div className='flex min-w-0 items-center gap-2'>
                    {resident.focusGroups?.length > 0 && (
                    <div className='shrink-0'>
                      <div className='hidden sm:flex flex-wrap gap-1'>
                        {resident.focusGroups.map(group => <span key={group} className='resident-focus-badge px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-[10px] font-medium'>{focusGroupLabel(group)}</span>)}
                      </div>
                      <div className='flex sm:hidden flex-wrap gap-1'>
                        <span className='resident-focus-badge px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-[10px] font-medium'>{focusGroupLabel(resident.focusGroups[0])}</span>
                        {resident.focusGroups.length > 1 && <span className='resident-focus-badge px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-[10px] font-medium'>+{resident.focusGroups.length - 1}</span>}
                      </div>
                    </div>
                  )}
                    <span className={`badge ${getRiskColor(resident.riskLevel)}`}>{resident.riskLevel}</span>
                    </div>
                    <div className='ml-auto flex items-center gap-1 sm:ml-0' onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEditModal(resident)} className='p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400' title='Edit'><Pencil className='w-4 h-4' /></button>
                      <button onClick={e => handleDelete(resident.id, e)} className='p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400' title='Delete'><Trash2 className='w-4 h-4' /></button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
          {!hasActiveFilters && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={filteredResidents.length} perPage={perPage} />}
        </>
      ) : (
        <GlassCard hover={false} className='text-center py-12'>
          <UsersIcon className='w-16 h-16 text-white/50 mx-auto mb-4' />
          <p className='text-white/65 text-sm mb-2'>No residents found</p>
        </GlassCard>
      )}

      {/* Add Resident Modal */}
      <Modal isOpen={showAddModal} onClose={closeModal} title="Add New Resident" panelClassName='resident-add-modal'>
        <form onSubmit={handleSave} className="space-y-4">
          <GlassInput label='Full Name *' value={formData.name} onChange={e => handleFormChange('name', e.target.value)} error={formErrors.name} required placeholder='Enter full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Date of Birth *' type='date' value={formData.dateOfBirth} onChange={e => handleFormChange('dateOfBirth', e.target.value)} error={formErrors.dateOfBirth} required />
            <div className='space-y-1.5'><label className='block text-sm text-blue-200'>Age</label><input type='text' value={ageDisplay} readOnly className='glass-input text-white/75 cursor-not-allowed' /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <GlassSelect label='Gender *' value={formData.gender} onChange={v => handleFormChange('gender', v)} error={formErrors.gender} required allowCustom placeholder='Select gender' options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }, { value: 'Other', label: 'Other' }]} />
            <GlassSelect label='Civil Status' value={formData.civilStatus} onChange={v => handleFormChange('civilStatus', v)} options={[{ value: 'Married', label: 'Married' }, { value: 'Separated', label: 'Separated' }, { value: 'Single', label: 'Single' }, { value: 'Widowed', label: 'Widowed' }]} />
          </div>
          <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactNumber} onChange={e => handleFormChange('contactNumber', e.target.value)} error={formErrors.contactNumber} placeholder='Enter contact number' />
          <GlassSelect label='Purok' value={formData.purokId} onChange={v => handleFormChange('purokId', v)} allowCustom allowClear placeholder='Select purok' options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: p.name }))]} />
<GlassInput label='Last Checkup' type='date' value={formData.lastCheckup} onChange={e => handleFormChange('lastCheckup', e.target.value)} error={formErrors.lastCheckup} />
            {isInfantResident && (
              <div className='grid grid-cols-2 gap-3'>
                <GlassInput label="Mother's Name" value={formData.motherName} onChange={e => handleFormChange('motherName', e.target.value)} placeholder="Enter mother's name" />
                <GlassInput label="Father's Name" value={formData.fatherName} onChange={e => handleFormChange('fatherName', e.target.value)} placeholder="Enter father's name" />
              </div>
            )}
            <div className="border-t border-white/10 my-2"></div>
            <div className="space-y-2">
            <label className="block text-xs text-blue-200 font-medium">Focus Groups</label>
            <div className="grid grid-cols-2 gap-2">
              {formData.gender !== 'Male' && (
                <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${formData.focusGroups.includes('pregnant') ? 'bg-pink-500/20 border-pink-400/60 text-pink-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                  <input type="checkbox" checked={formData.focusGroups.includes('pregnant')} onChange={() => handleFocusGroupToggle('pregnant')} className="w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50" />
                  <span>Pregnant</span>
                </label>
              )}
              <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${formData.focusGroups.includes('pwd') ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                <input type="checkbox" checked={formData.focusGroups.includes('pwd')} onChange={() => handleFocusGroupToggle('pwd')} className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50" />
                <span>PWD</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {formData.focusGroups.includes('pregnant') && <span className="px-3 py-1.5 bg-pink-500/20 text-pink-300 border border-pink-400/40 rounded-full text-xs font-medium">Pregnant</span>}
              {formData.focusGroups.includes('pwd') && <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded-full text-xs font-medium">PWD</span>}
              {formData.focusGroups.includes('infant') && <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full text-xs font-medium">Infant (0-59 months)</span>}
              {formData.focusGroups.includes('senior') && <span className="px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded-full text-xs font-medium">Senior (60+)</span>}
              {formData.focusGroups.includes('withCondition') && <span className="px-3 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full text-xs font-medium">With Condition</span>}
              {formData.focusGroups.length === 0 && <span className="text-xs text-white/50">Select groups above</span>}
            </div>
            {isPwdResident && (
              <GlassInput label='Specify Disability *' value={formData.disabilityType} onChange={e => handleFormChange('disabilityType', e.target.value)} error={formErrors.disabilityType} required placeholder='Enter resident disability' />
            )}
            </div>
            <div className="border-t border-white/10 my-2"></div>
            <label className="block text-xs text-blue-200 font-medium mb-2">Emergency Contact</label>
            <div className="grid grid-cols-2 gap-3">
              <GlassInput label='Contact Person' value={formData.contactPerson} onChange={e => handleFormChange('contactPerson', e.target.value)} placeholder='Name' />
              <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactPersonNumber} onChange={e => handleFormChange('contactPersonNumber', e.target.value)} placeholder='Phone' />
            </div>
            <GlassInput label='Contact Person Address' value={formData.contactPersonAddress} onChange={e => handleFormChange('contactPersonAddress', e.target.value)} placeholder='Address' />
            <div className='flex justify-end gap-3'><GlassButton variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton><GlassButton type='submit' loading={saving}>Add Resident</GlassButton></div>
        </form>
      </Modal>

      {/* Edit Resident Modal */}
      <Modal isOpen={showEditModal} onClose={closeModal} title="Edit Resident Profile" panelClassName='resident-add-modal'>
        <form onSubmit={handleSave} className="space-y-4">
          <GlassInput label='Full Name *' value={formData.name} onChange={e => handleFormChange('name', e.target.value)} error={formErrors.name} required placeholder='Enter full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Date of Birth *' type='date' value={formData.dateOfBirth} onChange={e => handleFormChange('dateOfBirth', e.target.value)} error={formErrors.dateOfBirth} required />
            <div className='space-y-1.5'><label className='block text-sm text-blue-200'>Age</label><input type='text' value={ageDisplay} readOnly className='glass-input text-white/75 cursor-not-allowed' /></div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <GlassSelect label='Gender *' value={formData.gender} onChange={v => handleFormChange('gender', v)} error={formErrors.gender} required allowCustom placeholder='Select gender' options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }, { value: 'Other', label: 'Other' }]} />
            <GlassSelect label='Civil Status' value={formData.civilStatus} onChange={v => handleFormChange('civilStatus', v)} options={[{ value: 'Married', label: 'Married' }, { value: 'Separated', label: 'Separated' }, { value: 'Single', label: 'Single' }, { value: 'Widowed', label: 'Widowed' }]} />
          </div>
          <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactNumber} onChange={e => handleFormChange('contactNumber', e.target.value)} error={formErrors.contactNumber} placeholder='Enter contact number' />
          <GlassSelect label='Purok' value={formData.purokId} onChange={v => handleFormChange('purokId', v)} allowCustom allowClear placeholder='Select purok' options={[...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: String(p.id), label: p.name }))]} />
          <GlassInput label='Last Checkup' type='date' value={formData.lastCheckup} onChange={e => handleFormChange('lastCheckup', e.target.value)} error={formErrors.lastCheckup} />
            {isInfantResident && (
              <div className='grid grid-cols-2 gap-3'>
                <GlassInput label="Mother's Name" value={formData.motherName} onChange={e => handleFormChange('motherName', e.target.value)} placeholder="Enter mother's name" />
                <GlassInput label="Father's Name" value={formData.fatherName} onChange={e => handleFormChange('fatherName', e.target.value)} placeholder="Enter father's name" />
              </div>
            )}
           <div className="space-y-2">
            <label className="block text-xs text-blue-200 font-medium">Focus Groups</label>
            <div className="grid grid-cols-2 gap-2">
              {formData.gender !== 'Male' && (
                <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${formData.focusGroups.includes('pregnant') ? 'bg-pink-500/20 border-pink-400/60 text-pink-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                  <input type="checkbox" checked={formData.focusGroups.includes('pregnant')} onChange={() => handleFocusGroupToggle('pregnant')} className="w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50" />
                  <span>Pregnant</span>
                </label>
              )}
              <label className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${formData.focusGroups.includes('pwd') ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'}`}>
                <input type="checkbox" checked={formData.focusGroups.includes('pwd')} onChange={() => handleFocusGroupToggle('pwd')} className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50" />
                <span>PWD</span>
              </label>
            </div>
             <div className="flex flex-wrap gap-2 mt-1">
               {formData.focusGroups.includes('pregnant') && <span className="px-3 py-1.5 bg-pink-500/20 text-pink-300 border border-pink-400/40 rounded-full text-xs font-medium">Pregnant</span>}
               {formData.focusGroups.includes('pwd') && <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded-full text-xs font-medium">PWD</span>}
               {formData.focusGroups.includes('infant') && <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full text-xs font-medium">Infant (0-59 months)</span>}
               {formData.focusGroups.includes('senior') && <span className="px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded-full text-xs font-medium">Senior (60+)</span>}
               {formData.focusGroups.includes('withCondition') && <span className="px-3 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full text-xs font-medium">With Condition</span>}
               {formData.focusGroups.length === 0 && <span className="text-xs text-white/50">Select groups above</span>}
             </div>
             {isPwdResident && (
              <GlassInput label='Specify Disability *' value={formData.disabilityType} onChange={e => handleFormChange('disabilityType', e.target.value)} error={formErrors.disabilityType} required placeholder='Enter resident disability' />
            )}
            </div>
             <label className="block text-xs text-blue-200 font-medium mb-2">Emergency Contact</label>
            <div className="grid grid-cols-2 gap-3">
              <GlassInput label='Contact Person' value={formData.contactPerson} onChange={e => handleFormChange('contactPerson', e.target.value)} placeholder='Name' />
              <GlassInput label='Contact Person Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactPersonNumber} onChange={e => handleFormChange('contactPersonNumber', e.target.value)} placeholder='Phone' />
            </div>
            <GlassInput label='Contact Person Address' value={formData.contactPersonAddress} onChange={e => handleFormChange('contactPersonAddress', e.target.value)} placeholder='Address' />
            <div className='flex justify-end gap-3'><GlassButton variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton><GlassButton type='submit' loading={saving}>Update Profile</GlassButton></div>
        </form>
      </Modal>

      <ConfirmModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={confirmDelete} title="Delete Resident" message="Are you sure you want to delete this resident? This action cannot be undone." loading={deletingId !== null} />

      {/* Resident Details Modal - stacked cards, not tabs */}
      <Modal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        title='Resident Details'
        size='xl'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        {selectedResidentId && (
          <ResidentDetail
            residentId={selectedResidentId}
            embedded
            onClose={closeDetailModal}
            onDeleted={handleDetailDeleted}
          />
        )}
      </Modal>
    </div>
  )
}

export default Residents
