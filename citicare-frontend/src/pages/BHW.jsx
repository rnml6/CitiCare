// pages/BHW.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Plus, Phone, Mail, ChevronRight, Pencil, Trash2,
  User, Eye, EyeOff, ChevronDown, ArrowLeft, Save, Loader2
} from 'lucide-react'
import { bhwApi } from '../api/bhwApi'
import { purokApi } from '../api/purokApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import BHWDetail from './BHWDetail'
import ConfirmModal from '../components/ConfirmModal'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys } from '../utils/validation'
import { SkeletonBHWPage } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import { getStatusColor } from '../utils/helpers'

const positionPresets = [
  { label: 'Barangay Health Worker', type: 'BHW', accountRole: 'BHW Worker' },
  { label: 'Barangay Health Worker Head', type: 'BHW', accountRole: 'BHW Admin' },
  { label: 'Doctor', type: 'Doctor', accountRole: null },
  { label: 'Midwife', type: 'Midwife', accountRole: null },
  { label: 'Nurse', type: 'Nurse', accountRole: null },
]

const FOCUS_GROUP_OPTIONS = [
  { value: 'infant', label: 'Infants (0-59 months)' },
  { value: 'pregnant', label: 'Pregnant' },
  { value: 'senior', label: 'Senior Citizen (60+)' },
]

const FOCUS_GROUP_LABELS = {
  pregnant: 'Pregnant',
  senior: 'Senior Citizen',
  infant: 'Infants',
}

const focusGroupLabel = (value) => FOCUS_GROUP_LABELS[value] || value || ''

const BHW = () => {
  const [bhws, setBhws] = useState([])
  const [puroks, setPuroks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPosition, setFilterPosition] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [page, setPage] = useState(1)
  const perPage = 12
  const navigate = useNavigate()
  const location = useLocation()

  const [selectedBHWId, setSelectedBHWId] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const openDetailModal = (bhw) => {
    setSelectedBHWId(bhw.id)
    setShowDetailModal(true)
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedBHWId(null)
    fetchBHWs()
  }

  const handleDetailDeleted = (deletedId) => {
    setBhws(prev => prev.filter(b => b.id !== deletedId))
  }

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBHW, setEditingBHW] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPositionDropdown, setShowPositionDropdown] = useState(false)
  const positionDropdownRef = useRef(null)
  const positionInputRef = useRef(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const [formData, setFormData] = useState({
    name: '', position: '', contactNumber: '', email: '', status: 'Active',
    assignedPurokId: '', assignedFocusGroup: '', username: '', password: '', confirmPassword: '', accountRole: 'BHW Worker'
  })

  const fetchBHWs = useCallback(async () => {
    try { setLoading(true); const response = await bhwApi.getAll(); if (response.data.success) setBhws(response.data.data) } catch (error) { console.error('Error:', error) } finally { setLoading(false) }
  }, [])
  const fetchPuroks = useCallback(async () => {
    try { const response = await purokApi.getAll(); if (response.data.success) setPuroks(response.data.data) } catch (error) { console.error('Error:', error) }
  }, [])

  useEffect(() => { fetchBHWs(); fetchPuroks() }, [fetchBHWs, fetchPuroks])

  // Reopen the detail modal when returning from elsewhere (e.g. closing a
  // Schedule Details opened from inside it) — back goes to the previous modal.
  useEffect(() => {
    if (location.state?.viewBHWId && !selectedBHWId) {
      setSelectedBHWId(location.state.viewBHWId)
      setShowDetailModal(true)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const isBHW = formData.position === 'Barangay Health Worker' || formData.position === 'Barangay Health Worker Head'

  // Focus group → current holder name (excluding the record being edited),
  // so a group already held (e.g. Pregnant held by Elinita) can't be picked again.
  const focusGroupHolders = bhws.reduce((acc, b) => {
    const g = b.assignedFocusGroup
    if (g && (!editingBHW || b.id !== editingBHW.id)) acc[g] = b.name || 'another BHW'
    return acc
  }, {})

  const focusGroupOptions = [
    { value: '', label: 'None' },
    ...FOCUS_GROUP_OPTIONS.map(o => {
      const holder = focusGroupHolders[o.value]
      const taken = !!holder && formData.assignedFocusGroup !== o.value
      return {
        ...o,
        label: taken ? `${o.label} — assigned to ${holder}` : o.label,
        disabled: taken,
      }
    }),
  ]

  // Purok → current holder name (excluding the record being edited),
  // so a purok already assigned to another BHW shows who holds it and
  // can't be picked again.
  const assignedPurokHolders = (() => {
    const nameToId = {}
    for (const p of puroks) nameToId[p.name] = p.id
    const acc = {}
    for (const b of bhws) {
      if (editingBHW && String(b.id) === String(editingBHW.id)) continue
      const pid = b.assignedPurokId || nameToId[b.assignedPurok]
      if (pid) acc[String(pid)] = b.name || 'another BHW'
    }
    return acc
  })()

  const assignedPurokOptions = [
    { value: '', label: 'None' },
    ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => {
      const holder = assignedPurokHolders[String(p.id)]
      const taken = !!holder && String(formData.assignedPurokId) !== String(p.id)
      return {
        value: String(p.id),
        label: taken ? `${p.name} — assigned to ${holder}` : p.name,
        disabled: taken,
      }
    }),
  ]

  const handlePositionChange = (value) => {
    const preset = positionPresets.find(p => p.label.toLowerCase() === value.toLowerCase())
    setFormData(prev => {
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

  const openAddModal = () => {
    setFormData({ name: '', position: '', contactNumber: '', email: '', status: 'Active', assignedPurokId: '', assignedFocusGroup: '', username: '', password: '', confirmPassword: '', accountRole: 'BHW Worker' })
    setShowPassword(false)
    setShowPositionDropdown(false)
    setEditingBHW(null)
    setShowAddModal(true)
  }

  const openEditModal = (bhw) => {
    setFormData({
      name: bhw.name || '', position: bhw.position || '', contactNumber: bhw.contactNumber || '',
      email: bhw.email || '', status: bhw.status || 'Active', assignedPurokId: bhw.assignedPurokId || '',
      assignedFocusGroup: bhw.assignedFocusGroup || '',
      username: bhw.username || '', password: '', confirmPassword: '',
      accountRole: bhw.position === 'Barangay Health Worker Head' ? 'BHW Admin' : 'BHW Worker'
    })
    setShowPassword(false)
    setShowPositionDropdown(false)
    setEditingBHW(bhw)
    setShowEditModal(true)
  }

  const closeModal = () => { setShowAddModal(false); setShowEditModal(false); setEditingBHW(null) }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.position) { dialog.error('Name and Position are required.', 'Validation error'); return }
    if (isBHW) {
      const u = (formData.username || '').trim()
      const p = formData.password || ''
      const c = formData.confirmPassword || ''
      if (!editingBHW) {
        // New record: a half-filled credential pair would silently create NO
        // account, so require the full set when any part is filled.
        if ((u || p || c) && !u) { dialog.error('Username is required to create a login account.', 'Validation error'); return }
        if ((u || p || c) && !p) { dialog.error('Password is required to create a login account.', 'Validation error'); return }
      } else if ((u && u !== (editingBHW.username || '') && !editingBHW.hasAccount) && !p) {
        dialog.error('Enter a password to create the login account for this username.', 'Validation error'); return
      }
      if (u && u.length < 3) { dialog.error('Username must be at least 3 characters.', 'Validation error'); return }
      if (p && p.length < 6) { dialog.error('Password must be at least 6 characters.', 'Validation error'); return }
      if (p && p !== c) { dialog.error('Passwords do not match.', 'Validation error'); return }
    }
    if (isBHW && formData.assignedPurokId && !puroks.some(p => String(p.id) === String(formData.assignedPurokId))) { dialog.error('Please select a valid purok from the list.', 'Validation error'); return }
    if (isBHW && formData.assignedFocusGroup) {
      const holder = focusGroupHolders[formData.assignedFocusGroup]
      if (holder) { dialog.error(`${focusGroupLabel(formData.assignedFocusGroup)} is already assigned to ${holder}. Each focus group can only have one BHW.`, 'Focus group already assigned'); return }
    }
    const confirmed = editingBHW
      ? await confirmUpdate('health worker', `Please confirm that you want to save the changes to ${formData.name}.`)
      : await confirmCreate('health worker', `Please confirm that you want to add ${formData.name} as a health worker.`)
    if (!confirmed) return
    setSaving(true)
    try {
      const workerType = positionPresets.find(p => p.label === formData.position)?.type || 'Other'
      const dataToSend = {
        name: formData.name, position: formData.position, contactNumber: formData.contactNumber,
        email: formData.email, status: formData.status, workerType, accountRole: formData.accountRole,
        assignedPurokId: isBHW ? (formData.assignedPurokId || null) : null,
        assignedFocusGroup: isBHW ? (formData.assignedFocusGroup || null) : null,
      }
      if (isBHW) {
        const trimmedUsername = (formData.username || '').trim()
        if (trimmedUsername || formData.password) {
          dataToSend.username = trimmedUsername
          if (formData.password) dataToSend.password = formData.password
        }
      }
      if (editingBHW) await bhwApi.update(editingBHW.id, dataToSend)
      else await bhwApi.create(dataToSend)
      closeModal()
      fetchBHWs()
      dialog.toast(editingBHW ? 'Healthcare professional updated successfully.' : 'Healthcare professional added successfully.', 'success')
    } catch (error) { dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save') }
    finally { setSaving(false) }
  }

  const handleDelete = (id, e) => {
    e.stopPropagation()
    setDeleteTargetId(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try {
      await bhwApi.delete(deleteTargetId)
      setBhws(prev => prev.filter(b => b.id !== deleteTargetId))
      dialog.toast('Healthcare professional deleted.', 'success')
    }
    catch (error) { console.error('Error deleting BHW:', error); dialog.error(error.response?.data?.message || 'Failed to delete BHW', 'Unable to delete') }
    finally { setShowDeleteConfirm(false); setDeleteTargetId(null) }
  }

  const positions = [...new Set(bhws.map(b => b.position).filter(Boolean))].sort()

  const filteredBHWs = bhws.filter(bhw => {
    const matchesSearch = !searchTerm || bhw.name?.toLowerCase().includes(searchTerm.toLowerCase()) || bhw.position?.toLowerCase().includes(searchTerm.toLowerCase()) || bhw.assignedPurok?.toLowerCase().includes(searchTerm.toLowerCase()) || focusGroupLabel(bhw.assignedFocusGroup)?.toLowerCase().includes(searchTerm.toLowerCase()) || bhw.username?.toLowerCase().includes(searchTerm.toLowerCase()) || bhw.email?.toLowerCase().includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false
    if (filterPosition !== 'all' && bhw.position !== filterPosition) return false
    if (filterStatus !== 'all' && bhw.status !== filterStatus) return false
    if (filterGroup !== 'all' && (bhw.assignedFocusGroup || '') !== filterGroup) return false
    return true
  })

  const hasActiveFilters = filterPosition !== 'all' || filterStatus !== 'all' || filterGroup !== 'all' || searchTerm !== ''

  useEffect(() => { setPage(1) }, [searchTerm, filterPosition, filterStatus, filterGroup])

  const filteredPositions = formData.position
    ? positionPresets.filter(p => p.label.toLowerCase().includes(formData.position.toLowerCase()))
    : positionPresets

  const totalPages = Math.ceil(filteredBHWs.length / perPage)
  const paginatedBHWs = hasActiveFilters ? filteredBHWs : filteredBHWs.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (positionDropdownRef.current && !positionDropdownRef.current.contains(e.target) && positionInputRef.current && !positionInputRef.current.contains(e.target)) setShowPositionDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) return <SkeletonBHWPage count={6} />

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>Health Workers</h1>
          <p className='text-sm text-white/75'>{filteredBHWs.length} of {bhws.length} health worker{bhws.length !== 1 ? 's' : ''}{hasActiveFilters && ' (filtered)'}</p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} title='Add BHW' onClick={openAddModal}>
          <span className='hidden sm:inline'>Add BHW</span>
        </GlassButton>
      </div>

      <div className='space-y-3'>
        <GlassInput icon={Search} placeholder='Search by name, position, username, email, purok, or focus group...' value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />

        {/* Mobile filters use a three-column dropdown row; desktop retains pills. */}
        <div className='grid grid-cols-3 items-center gap-2 sm:flex sm:flex-wrap sm:gap-2'>
          <GlassSelect
            aria-label='Filter by position'
            value={filterPosition}
            allowCustom
            onChange={v => setFilterPosition(v === '' ? 'all' : v)}
            size='sm'
            className='w-full min-w-0 sm:hidden'
            options={[{ value: 'all', label: 'All Positions' }, ...positions.map(pos => ({ value: pos, label: pos }))]}
          />
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1'>Position:</span>
          <GlassSelect
            value={filterPosition}
            allowCustom
            onChange={v => setFilterPosition(v === '' ? 'all' : v)}
            size='sm'
            autoWidth
            className='hidden sm:block shrink-0'
            options={[{ value: 'all', label: 'All Positions' }, ...positions.map(pos => ({ value: pos, label: pos }))]}
          />
          <GlassSelect
            aria-label='Filter by status'
            value={filterStatus}
            onChange={setFilterStatus}
            allowCustom={false}
            size='sm'
            className='w-full min-w-0 sm:hidden'
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' }
            ]}
          />
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>Status:</span>
          {[
            { value: 'all', label: 'All' },
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`hidden sm:flex px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterStatus === opt.value
                  ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                  : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <GlassSelect
            aria-label='Filter by focus group'
            value={filterGroup}
            onChange={setFilterGroup}
            allowCustom={false}
            size='sm'
            className='w-full min-w-0 sm:hidden'
            options={[
              { value: 'all', label: 'All Groups' },
              { value: 'infant', label: 'Infant' },
              { value: 'pregnant', label: 'Pregnant' },
              { value: 'senior', label: 'Senior Citizen' }
            ]}
          />
          <span className='hidden sm:inline text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>Group:</span>
          {[
            { value: 'all', label: 'All' },
            { value: 'infant', label: 'Infant' },
            { value: 'pregnant', label: 'Pregnant' },
            { value: 'senior', label: 'Senior Citizen' }
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
      </div>

      {filteredBHWs.length > 0 ? (
        <>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {paginatedBHWs.map(bhw => (
            <GlassCard key={bhw.id} onClick={() => openDetailModal(bhw)}>
              <div className='flex items-start justify-between mb-0.5 sm:mb-4'>
                <div className='flex items-center space-x-4'>
                  <div className='min-w-0'>
                    <h3 className='text-white font-medium text-lg truncate'>{bhw.name}</h3>
                    <p className='text-sm text-blue-300 pl-0.5 sm:pl-0'>{bhw.position}</p>
                  </div>
                </div>
                <ChevronRight className='w-5 h-5 text-white/65 flex-shrink-0' />
              </div>
              <div className='flex items-center justify-between mt-0 pt-0 border-t-0 sm:mt-3 sm:pt-3 sm:border-t border-white/10 gap-2'>
                <div className='flex flex-wrap items-center gap-2 min-w-0'>
                  <span className={`badge ${getStatusColor(bhw.status)}`}>{bhw.status}</span>
                  {bhw.assignedPurok && (
                    <span className='badge bg-amber-500/20 text-amber-300 border-amber-400/30 truncate'>
                      {bhw.assignedPurok}
                    </span>
                  )}
                  {bhw.assignedFocusGroup && (
                    <span className='badge bg-purple-500/20 text-purple-200 border-purple-400/30 truncate'>
                      {focusGroupLabel(bhw.assignedFocusGroup)}
                    </span>
                  )}
                </div>
                <div className='flex space-x-1 shrink-0' onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditModal(bhw)} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400 transition-colors'><Pencil className='w-4 h-4' /></button>
                  <button onClick={e => handleDelete(bhw.id, e)} className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400 transition-colors'><Trash2 className='w-4 h-4' /></button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
        {!hasActiveFilters && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={filteredBHWs.length} perPage={perPage} />}
        </>
      ) : (
        <GlassCard hover={false} className='text-center py-12'>
          <div className='w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4'><User className='w-8 h-8 text-white/50' /></div>
          <p className='text-white/65 text-sm mb-2'>{hasActiveFilters ? 'No healthcare professional found' : 'No Healthcare workers added yet'}</p>
        </GlassCard>
      )}

      {/* Add BHW Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title="Add Healthcare Professional"
        panelClassName='health-worker-add-modal'
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="relative" ref={positionDropdownRef}>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>Position *</label>
            <div className='relative'>
              <input ref={positionInputRef} type='text' value={formData.position} onChange={e => { setFormData(prev => ({ ...prev, position: e.target.value })); setShowPositionDropdown(true) }} onFocus={() => setShowPositionDropdown(true)} className='glass-input pr-8 text-sm' placeholder='Search or type position...' required />
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
          <GlassInput label='Full Name *' value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} required placeholder='Full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactNumber} onChange={e => setFormData(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
            <GlassInput label='Email' value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder='Email' />
          </div>
          <GlassSelect label='Status' value={formData.status} allowCustom onChange={v => setFormData(prev => ({ ...prev, status: v }))} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
          {isBHW && (
            <>
              <GlassSelect label='Assigned Purok' value={formData.assignedPurokId} allowCustom onChange={v => setFormData(prev => ({ ...prev, assignedPurokId: v }))} options={assignedPurokOptions} />
              <GlassSelect label='Assigned Focus Group' value={formData.assignedFocusGroup} allowCustom onChange={v => setFormData(prev => ({ ...prev, assignedFocusGroup: v }))} options={focusGroupOptions} />
              <div className='pt-2 border-t border-white/10'>
                <h4 className='text-sm font-medium text-white/75 mb-3'>Login Credentials</h4>
                <div className='grid grid-cols-2 gap-3'>
                  <GlassInput label='Username' value={formData.username} onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))} placeholder='Login username' />
                  <GlassSelect label='Account Role' value={formData.accountRole} allowCustom onChange={v => setFormData(prev => ({ ...prev, accountRole: v }))} options={[{ value: 'BHW Admin', label: 'BHW Admin' }, { value: 'BHW Worker', label: 'BHW Worker' }]} />
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>{editingBHW ? 'New Password' : 'Password'}</label>
                    <div className='relative'>
                      <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))} className='glass-input pr-10' placeholder={editingBHW ? 'Leave blank to keep' : 'Password'} />
                      <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-2 top-1/2 -translate-y-1/2 text-white/65 hover:text-white/85'>{showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}</button>
                    </div>
                    <button type='button' onClick={() => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'; let pw = ''; for (let i = 0; i < 12; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length)); setFormData(prev => ({ ...prev, password: pw, confirmPassword: pw })); setShowPassword(true) }} className='text-xs text-blue-400 hover:text-blue-300'>Generate password</button>
                  </div>
                  <GlassInput label='Confirm Password' value={formData.confirmPassword} onChange={e => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder='Confirm password' />
                </div>
              </div>
            </>
          )}
          <div className='grid !grid-cols-2 gap-3 sm:flex sm:justify-end'>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={saving}>Add Professional</GlassButton>
          </div>
        </form>
      </Modal>

      {/* Edit BHW Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={closeModal}
        title="Edit Healthcare Professional"
        panelClassName='health-worker-add-modal'
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="relative" ref={positionDropdownRef}>
            <label className='block text-sm font-medium text-blue-200 mb-1.5'>Position *</label>
            <div className='relative'>
              <input ref={positionInputRef} type='text' value={formData.position} onChange={e => { setFormData(prev => ({ ...prev, position: e.target.value })); setShowPositionDropdown(true) }} onFocus={() => setShowPositionDropdown(true)} className='glass-input pr-8 text-sm' placeholder='Search or type position...' required />
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
          <GlassInput label='Full Name *' value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} required placeholder='Full name' />
          <div className='grid grid-cols-2 gap-3'>
            <GlassInput label='Contact Number' type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={formData.contactNumber} onChange={e => setFormData(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))} placeholder='Phone' />
            <GlassInput label='Email' value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder='Email' />
          </div>
          <GlassSelect label='Status' value={formData.status} allowCustom onChange={v => setFormData(prev => ({ ...prev, status: v }))} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
          {isBHW && (
            <>
              <GlassSelect label='Assigned Purok' value={formData.assignedPurokId} allowCustom onChange={v => setFormData(prev => ({ ...prev, assignedPurokId: v }))} options={assignedPurokOptions} />
              <GlassSelect label='Assigned Focus Group' value={formData.assignedFocusGroup} allowCustom onChange={v => setFormData(prev => ({ ...prev, assignedFocusGroup: v }))} options={focusGroupOptions} />
              <div className='pt-2 border-t border-white/10'>
                <h4 className='text-sm font-medium text-white/75 mb-3'>Login Credentials</h4>
                <div className='grid grid-cols-2 gap-3'>
                  <GlassInput label='Username' value={formData.username} onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))} placeholder='Login username' />
                  <GlassSelect label='Account Role' value={formData.accountRole} allowCustom onChange={v => setFormData(prev => ({ ...prev, accountRole: v }))} options={[{ value: 'BHW Admin', label: 'BHW Admin' }, { value: 'BHW Worker', label: 'BHW Worker' }]} />
                  <div className='space-y-1.5'>
                    <label className='block text-sm font-medium text-blue-200'>New Password</label>
                    <div className='relative'>
                      <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))} className='glass-input pr-10' placeholder='Leave blank to keep' />
                      <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-2 top-1/2 -translate-y-1/2 text-white/65 hover:text-white/85'>{showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}</button>
                    </div>
                  </div>
                  <GlassInput label='Confirm Password' value={formData.confirmPassword} onChange={e => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder='Confirm password' />
                </div>
                {editingBHW?.username && (
                  <div className='mt-3 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg'><p className='text-xs text-blue-300'>Login: <strong>{editingBHW.username}</strong></p></div>
                )}
              </div>
            </>
          )}
          <div className='grid !grid-cols-2 gap-3 sm:flex sm:justify-end'>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' variant='secondary' type='button' onClick={closeModal}>Cancel</GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' loading={saving}>Update Professional</GlassButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null) }}
        onConfirm={confirmDelete}
        title="Delete BHW"
        message="Are you sure you want to delete this BHW?"
      />

      {/* Health Worker Details Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        title='Health Worker Details'
        size='xl'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        {selectedBHWId && (
          <BHWDetail
            bhwId={selectedBHWId}
            embedded
            onClose={closeDetailModal}
            onDeleted={handleDetailDeleted}
          />
        )}
      </Modal>
    </div>
  )
}

export default BHW
