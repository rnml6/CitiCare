// pages/Medicines.jsx
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Save, Search, X } from 'lucide-react'
import { medicineApi } from '../api/medicineApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm'
import { SkeletonMedicinesPage } from '../components/Skeleton'
import Pagination from '../components/Pagination'
import {
  normalizeIntervals,
  intervalSummary,
} from '../utils/medicineInterval'
import { blockIntegerKeys } from '../utils/validation'
import { focusFirstError } from '../utils/focusInvalidField'

const Medicines = () => {
  const [medicines, setMedicines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [errors, setErrors] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterTargetGroup, setFilterTargetGroup] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [detailMedicine, setDetailMedicine] = useState(null)
  const perPage = 12

  const [formData, setFormData] = useState({
    medicine_name: '',
    category: 'vaccine',
    total_doses: 1,
    target_group: 'all',
    description: '',
    dose_intervals: []
  })

  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true)
      const response = await medicineApi.getAll()
      if (response.data.success) {
        setMedicines(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching medicines:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMedicines()
  }, [fetchMedicines])

  // Total Doses Required applies to ALL categories. Each dose gets one
  // free-text description field (optional — may be left empty).
  const doseCountOf = v => Math.max(1, Math.min(20, parseInt(v) || 1))

  const handleChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const findStoredRow = (dose) =>
    (Array.isArray(formData.dose_intervals) ? formData.dose_intervals : [])
      .find(r => Number(r?.dose) === Number(dose))

  const updateDoseDescription = (dose, description) => {
    setFormData(prev => {
      const rows = Array.isArray(prev.dose_intervals) ? [...prev.dose_intervals] : []
      const idx = rows.findIndex(r => Number(r?.dose) === Number(dose))
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], description, dose: Number(dose) }
      } else {
        rows.push({ dose: Number(dose), description })
      }
      return { ...prev, dose_intervals: rows }
    })
  }

  // One description field per dose: doses 1..count.
  const doseFields = (count) => {
    const n = doseCountOf(count)
    const out = []
    for (let dose = 1; dose <= n; dose++) {
      const stored = findStoredRow(dose)
      out.push({ dose, description: stored?.description ?? '' })
    }
    return out
  }

  const openAddModal = () => {
    setEditingId(null)
    setErrors({})
    setFormData({
      medicine_name: '',
      category: 'vaccine',
      total_doses: 1,
      target_group: 'all',
      description: '',
      dose_intervals: []
    })
    setShowModal(true)
  }

  const openEditModal = medicine => {
    setEditingId(medicine.id)
    setErrors({})
    const stored = normalizeIntervals(medicine.dose_intervals)
    setFormData({
      medicine_name: medicine.medicine_name,
      category: medicine.category,
      total_doses: medicine.total_doses || 1,
      target_group: medicine.target_group,
      description: medicine.description || '',
      dose_intervals: stored
    })
    setShowModal(true)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const form = e.currentTarget
    const nextErrors = {}
    if (!formData.medicine_name) nextErrors.medicine_name = 'Medicine name is required.'
    if (!formData.category) nextErrors.category = 'Category is required.'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      focusFirstError(nextErrors, form)
      return
    }
    setErrors({})
    const confirmed = editingId
      ? await confirmUpdate('medicine', `Please confirm that you want to save the changes to ${formData.medicine_name}.`)
      : await confirmCreate('medicine', `Please confirm that you want to add ${formData.medicine_name}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      // Keep one entry per dose with text; empty descriptions are
      // dropped (missing = no description).
      const n = doseCountOf(formData.total_doses)
      const rawIntervals = (formData.dose_intervals || [])
        .filter(e => e && Number(e.dose) >= 1 && Number(e.dose) <= n && String(e.description ?? '').trim() !== '')
        .map(e => ({ dose: Number(e.dose), description: String(e.description).trim() }))
      const dataToSend = {
        ...formData,
        total_doses: n,
        dose_intervals: normalizeIntervals(rawIntervals)
      }
      if (editingId) {
        await medicineApi.update(editingId, dataToSend)
      } else {
        await medicineApi.create(dataToSend)
      }
      setShowModal(false)
      fetchMedicines()
      dialog.toast(editingId ? 'Medicine updated successfully.' : 'Medicine added successfully.', 'success')
    } catch (error) {
      console.error('Error saving medicine:', error)
      const backendErrors = error.response?.data?.errors
      if (backendErrors && typeof backendErrors === 'object' && Object.keys(backendErrors).length > 0) {
        const next = Object.fromEntries(
          Object.entries(backendErrors)
            .filter(([, message]) => Boolean(message))
            .map(([field, message]) => [field, String(message)])
        )
        setErrors(next)
        focusFirstError(next, form)
      } else {
        dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save medicine')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async id => {
    setDeleteTargetId(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try {
      await medicineApi.delete(deleteTargetId)
      setShowDeleteConfirm(false)
      setDeleteTargetId(null)
      fetchMedicines()
      dialog.toast('Medicine deleted.', 'success')
    } catch (error) {
      console.error('Error deleting:', error)
      dialog.error(error.response?.data?.message || 'Failed to delete', 'Unable to delete medicine')
    }
  }

  const getCategoryLabel = cat =>
    cat === 'vaccine' ? 'Vaccine' : cat === 'deworming' ? 'Deworming' : cat === 'vitamins' ? 'Vitamins' : cat

  const getCategoryColor = cat =>
    cat === 'vaccine'
      ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
      : cat === 'deworming'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
      : cat === 'vitamins'
      ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
      : 'bg-gray-500/20 text-gray-300 border-gray-400/30'

  const getTargetGroupLabel = group => {
    const labels = {
      all: 'All',
      infant: 'Infant (0-59 months)',
      pregnant: 'Pregnant',
      senior: 'Senior (60+)',
      pwd: 'PWD',
      withCondition: 'With Condition'
    }
    return labels[group] || group
  }

  const getTargetGroupColor = group => {
    const colors = {
      all: 'bg-gray-500/20 text-gray-300 border-gray-400/30',
      infant: 'bg-pink-500/20 text-pink-300 border-pink-400/30',
      pregnant: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
      senior: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
      pwd: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
      withCondition: 'bg-orange-500/20 text-orange-300 border-orange-400/30'
    }
    return colors[group] || 'bg-gray-500/20 text-gray-300 border-gray-400/30'
  }

  const targetGroupOptions = [
    { value: 'all', label: 'All' },
    { value: 'infant', label: 'Infant' },
    { value: 'pregnant', label: 'Pregnant' },
    { value: 'pwd', label: 'PWD' },
    { value: 'senior', label: 'Senior' },
    { value: 'withCondition', label: 'w/ Condition' }
  ]

  // Filter medicines (client-side, so switching filters never reloads the page)
  const filteredMedicines = medicines.filter(medicine => {
    if (
      searchTerm &&
      !medicine.medicine_name?.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false
    }
    if (filterCategory !== 'all' && medicine.category !== filterCategory) {
      return false
    }
    if (
      filterTargetGroup !== 'all' &&
      medicine.target_group !== filterTargetGroup
    ) {
      return false
    }
    return true
  })

  const hasActiveFilters = filterCategory !== 'all' || filterTargetGroup !== 'all' || searchTerm !== ''

  const clearFilters = () => {
    setFilterCategory('all')
    setFilterTargetGroup('all')
    setSearchTerm('')
  }

  useEffect(() => {
    setPage(1)
  }, [searchTerm, filterTargetGroup, filterCategory])

  const totalPages = Math.ceil(filteredMedicines.length / perPage)
  const paginatedMedicines = hasActiveFilters ? filteredMedicines : filteredMedicines.slice(
    (page - 1) * perPage,
    page * perPage
  )

  if (loading) return <SkeletonMedicinesPage count={6} />

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1
            className='text-2xl font-bold text-white'
           
          >
            <span className='sm:hidden'>Medicine</span>
            <span className='hidden sm:inline'>Medicine Management</span>
          </h1>
          <p className='text-sm text-white/75'>
            {filteredMedicines.length} of {medicines.length} medicine
            {medicines.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </p>
        </div>
        <GlassButton size='lg' className='ml-auto' icon={Plus} title='Add Medicine' onClick={openAddModal}>
          <span className='hidden sm:inline'>Add Medicine</span>
        </GlassButton>
      </div>

      <div className='space-y-3'>
      {/* Search */}
      <GlassInput
        icon={Search}
        placeholder='Search medicines by name...'
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />

      {/* Filters */}
      <div className='grid grid-cols-2 gap-2 sm:hidden'>
        <GlassSelect
          aria-label='Filter by category'
          value={filterCategory}
          allowCustom
          onChange={v => setFilterCategory(v === '' ? 'all' : v)}
          size='sm'
          className='w-full min-w-0'
          options={[
            { value: 'all', label: 'All Categories' },
            { value: 'deworming', label: 'Deworming' },
            { value: 'vaccine', label: 'Vaccines' },
            { value: 'vitamins', label: 'Vitamins' }
          ]}
        />
        <GlassSelect
          aria-label='Filter by target group'
          value={filterTargetGroup}
          allowCustom
          onChange={v => setFilterTargetGroup(v === '' ? 'all' : v)}
          size='sm'
          className='w-full min-w-0'
          options={[{ value: 'all', label: 'All Groups' }, ...targetGroupOptions.filter(option => option.value !== 'all')]}
        />
      </div>
      <div className='hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2'>
        <span className='text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1'>Category:</span>
        <GlassSelect
          value={filterCategory}
          allowCustom
          onChange={v => setFilterCategory(v === '' ? 'all' : v)}
          size='sm'
          autoWidth
          className='shrink-0'
          options={[
            { value: 'all', label: 'All Categories' },
            { value: 'deworming', label: 'Deworming' },
            { value: 'vaccine', label: 'Vaccines' },
            { value: 'vitamins', label: 'Vitamins' }
          ]}
        />

        <span className='text-[11px] sm:text-xs text-white/65 mr-0.5 sm:mr-1 ml-2 sm:ml-4'>Target Group:</span>
        {targetGroupOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterTargetGroup(opt.value)}
            className={`px-2.5 py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
              filterTargetGroup === opt.value
                ? 'bg-blue-500/40 text-blue-200 border border-blue-400/40'
                : 'bg-white/10 text-white/85 hover:bg-white/20 border border-white/20'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      </div>

      {/* Medicine Grid */}
      {filteredMedicines.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {paginatedMedicines.map(medicine => (
            <GlassCard key={medicine.id} onClick={() => setDetailMedicine(medicine)}>
              <div className='flex items-start justify-between mb-3'>
                <div className='flex-1'>
                  <h3
                    className='text-white font-semibold text-base sm:text-xl'
                   
                  >
                    {medicine.medicine_name}
                  </h3>
                  <div className='flex gap-2 mt-1.5 flex-wrap'>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getCategoryColor(
                        medicine.category
                      )}`}
                    >
                      {getCategoryLabel(medicine.category)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getTargetGroupColor(
                        medicine.target_group
                      )}`}
                    >
                      {getTargetGroupLabel(medicine.target_group)}
                    </span>
                  </div>
                </div>
                <div className='flex space-x-1 ml-2'>
                  <button
                    onClick={e => { e.stopPropagation(); openEditModal(medicine) }}
                    className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400'
                  >
                    <Pencil className='w-4 h-4' />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(medicine.id) }}
                    className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </div>
              <div className='space-y-2 text-sm'>
                <div className='flex items-center justify-between text-white/65'>
                  <span>
                    Doses Required:
                  </span>
                  <span
                    className='text-white font-medium'
                  >
                    {medicine.total_doses} dose
                    {medicine.total_doses > 1 ? 's' : ''}
                  </span>
                </div>
                {medicine.description && (
                  <p
                    className='hidden sm:block text-white/65 text-sm mt-2'
                  >
                    {medicine.description}
                  </p>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard hover={false} className='text-center py-12'>
          <div className='w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4'>
            <svg
              className='w-8 h-8 text-white/50'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.5'
            >
              <path
                d='M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2'
                strokeLinecap='round'
              />
              <rect x='9' y='3' width='6' height='4' rx='1' />
              <path
                d='M9 14l2 2 4-4'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
          </div>
          <p className='text-white/65 text-sm mb-2'>
            {hasActiveFilters
              ? 'No medicines match your criteria'
              : 'No medicines added yet'}
          </p>
        </GlassCard>
      )}
      {!hasActiveFilters && <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={filteredMedicines.length}
        perPage={perPage}
      />}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Medicine' : 'Add New Medicine'}
        panelClassName='medicine-form-modal'
      >
        <form onSubmit={handleSubmit} className='space-y-4'>
          <GlassInput
            label='Medicine Name'
            name='medicine_name'
            value={formData.medicine_name}
            onChange={handleChange}
            error={errors.medicine_name}
            required
            placeholder='e.g., BCG, Albendazole'
          />

          <hr className='border-white/10' />

          <div>
            <div className='sm:hidden space-y-3'>
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>
                  Category
                </label>
                <GlassSelect
                  name='category'
                  value={formData.category}
                  allowCustom
                  error={errors.category}
                  onChange={v => handleChange({ target: { name: 'category', value: v } })}
                  options={[
                    { value: 'deworming', label: 'Deworming' },
                    { value: 'vaccine', label: 'Vaccine' },
                    { value: 'vitamins', label: 'Vitamins' }
                  ]}
                  required
                />
              </div>

              <div className='grid medicine-mobile-target-grid gap-3'>
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>
                  Target Group
                </label>
                <GlassSelect
                  name='target_group'
                  value={formData.target_group}
                  allowCustom
                  onChange={v => handleChange({ target: { name: 'target_group', value: v } })}
                  options={targetGroupOptions}
                />
              </div>
              <GlassInput
                label='Total Doses Required'
                name='total_doses'
                type='number'
                inputMode='numeric'
                step='1'
                onKeyDown={blockIntegerKeys}
                value={formData.total_doses}
                onChange={handleChange}
                required
                min='1'
                max='20'
              />
              </div>
            </div>

            <div className='hidden sm:grid sm:grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>Category</label>
                <GlassSelect
                  name='category'
                  value={formData.category}
                  allowCustom
                  error={errors.category}
                  onChange={v => handleChange({ target: { name: 'category', value: v } })}
                  options={[
                    { value: 'deworming', label: 'Deworming' },
                    { value: 'vaccine', label: 'Vaccine' },
                    { value: 'vitamins', label: 'Vitamins' }
                  ]}
                  required
                />
              </div>
              <div className='space-y-1.5'>
                <label className='block text-sm font-medium text-blue-200'>Target Group</label>
                <GlassSelect
                  name='target_group'
                  value={formData.target_group}
                  allowCustom
                  onChange={v => handleChange({ target: { name: 'target_group', value: v } })}
                  options={targetGroupOptions}
                />
              </div>
              <div className='col-span-2'>
                <GlassInput
                  label='Total Doses Required'
                  name='total_doses'
                  type='number'
                  inputMode='numeric'
                  step='1'
                  onKeyDown={blockIntegerKeys}
                  value={formData.total_doses}
                  onChange={handleChange}
                  required
                  min='1'
                  max='20'
                />
              </div>
            </div>

            <div className='mt-3 space-y-1.5'>
              <label className='block text-sm font-medium text-blue-200'>
                Dose Descriptions
              </label>
              <div className='space-y-2'>
                {doseFields(formData.total_doses).map((row) => (
                  <GlassInput
                    key={row.dose}
                    label={`Dose ${row.dose}`}
                    value={row.description}
                    onChange={e => updateDoseDescription(row.dose, e.target.value)}
                    placeholder={`Description for dose ${row.dose}`}
                  />
                ))}
              </div>
              {!!intervalSummary(formData.dose_intervals) && (
                <p className='text-[11px] text-white/40'>
                  {intervalSummary(formData.dose_intervals).split('; ').join(' · ')}
                </p>
              )}
            </div>
          </div>

          <hr className='border-white/10' />

          <div>
            <GlassInput
              label='Description'
              name='description'
              type='textarea'
              value={formData.description}
              onChange={handleChange}
              placeholder='Brief description...'
            />
          </div>

          <div className='grid !grid-cols-2 gap-3 pt-4 border-t border-white/10 sm:flex sm:justify-end sm:space-x-3'>
            <GlassButton
              className='!w-full min-w-0 sm:!w-auto'
              variant='secondary'
              type='button'
              onClick={() => setShowModal(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton className='!w-full min-w-0 sm:!w-auto' type='submit' icon={Save} loading={saving}>
              {editingId ? 'Update' : 'Add Medicine'}
            </GlassButton>
          </div>
        </form>
      </Modal>

      {/* Medicine Details Modal */}
      <Modal
        isOpen={!!detailMedicine}
        onClose={() => setDetailMedicine(null)}
        title='Medicine Details'
        size='sm'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        {detailMedicine && (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <div className='flex items-start justify-between gap-3'>
                <h3 className='text-white font-semibold text-xl sm:text-2xl min-w-0 break-words pl-2 pb-1'>
                  {detailMedicine.medicine_name}
                </h3>
                <div className='flex items-center space-x-1 shrink-0'>
                  <button
                    type='button'
                    title='Edit medicine'
                    aria-label='Edit medicine'
                    onClick={() => { const med = detailMedicine; setDetailMedicine(null); openEditModal(med) }}
                    className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-blue-400'
                  >
                    <Pencil className='w-4 h-4' />
                  </button>
                  <button
                    type='button'
                    title='Delete medicine'
                    aria-label='Delete medicine'
                    onClick={() => { const id = detailMedicine.id; setDetailMedicine(null); handleDelete(id) }}
                    className='p-2 rounded-lg hover:bg-white/10 text-white/75 hover:text-red-400'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </div>
              <div className='flex gap-2 flex-wrap items-center'>
              <span
                className={`px-2.5 py-1 rounded-full text-sm font-medium border ${getCategoryColor(
                  detailMedicine.category
                )}`}
              >
                {getCategoryLabel(detailMedicine.category)}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-sm font-medium border ${getTargetGroupColor(
                  detailMedicine.target_group
                )}`}
              >
                {getTargetGroupLabel(detailMedicine.target_group)}
              </span>
              {detailMedicine.is_active === false && (
                <span className='px-2.5 py-1 rounded-full text-sm font-medium border bg-red-500/20 text-red-300 border-red-400/30'>
                  Inactive
                </span>
              )}
                <span className='px-2.5 py-1 rounded-full text-sm font-semibold border whitespace-nowrap bg-blue-500/20 text-blue-200 border-blue-400/40'>
                  {detailMedicine.total_doses} dose
                  {detailMedicine.total_doses > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {(() => {
              const stored = normalizeIntervals(detailMedicine.dose_intervals)
              const count = Math.max(1, parseInt(detailMedicine.total_doses) || 1)
              const doses = Array.from({ length: count }, (_, i) => {
                const dose = i + 1
                return {
                  dose,
                  description: stored.find(d => d.dose === dose)?.description || 'N/A'
                }
              })
              return (
                <div className='space-y-1.5'>
                  <label className='block text-sm font-medium text-blue-200'>
                    Dose Descriptions
                  </label>
                  <div className='space-y-3'>
                    {doses.map(d => (
                      <div key={d.dose} className='rounded-lg bg-white/5 px-3 py-2.5 text-sm leading-relaxed'>
                        <span className='text-white font-semibold'>Dose {d.dose}: </span>
                        <span className='text-white/85'>{d.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div className='space-y-1.5'>
              <label className='block text-sm font-medium text-blue-200'>
                Description
              </label>
              <p className='rounded-lg bg-white/5 px-3 py-2.5 text-sm leading-relaxed text-white/85'>
                {detailMedicine.description || 'N/A'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null) }}
        onConfirm={confirmDelete}
        title='Delete Medicine'
        message='Are you sure you want to delete this medicine? This action cannot be undone.'
        confirmText='Delete'
      />
    </div>
  )
}

export default Medicines
