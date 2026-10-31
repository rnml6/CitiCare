import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { residentApi } from '../api/residentApi'
import { purokApi } from '../api/purokApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassInput from '../components/GlassInput'
import GlassSelect from '../components/GlassSelect'
import Modal from '../components/Modal'
import { SkeletonResidentForm, SkeletonSelectField } from '../components/Skeleton'
import { getRiskColor, formatAgeLong } from '../utils/helpers'
import { useSmartBack } from '../utils/navigation'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm'
import { focusFirstError } from '../utils/focusInvalidField'
import {
  validateResidentFields,
  validateVitalSigns,
  hasErrors,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizeBloodPressureInput,
  sanitizePhoneInput,
  blockBloodPressureKeys,
  blockIntegerKeys,
  blockPhoneKeys
} from '../utils/validation'

const ResidentForm = () => {
  const { id } = useParams()
  const isEditing = !!id
  const navigate = useNavigate()
  const goBack = useSmartBack('/residents')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(isEditing)
  const [puroks, setPuroks] = useState([])
  const [puroksLoading, setPuroksLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    dateOfBirth: '',
    age: '',
    gender: '',
    civilStatus: 'Single',
    purokId: '',
    contactNumber: '',
    contactPerson: '',
    contactPersonNumber: '',
    contactPersonAddress: '',
    lastCheckup: '',
    focusGroups: [],
    chronicConditions: [],
    motherName: '',
    fatherName: '',
    disabilityType: ''
  })

  const [riskLevel, setRiskLevel] = useState(null)
  const [ageDisplay, setAgeDisplay] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [vitalErrors, setVitalErrors] = useState({})

  const [vitalSigns, setVitalSigns] = useState({
    bloodPressure: '',
    heartRate: '',
    temperature: '',
    weight: '',
    height: '',
    bloodSugar: '',
    bmi: ''
  })

  const manualFocusGroupOptions = [{ value: 'pwd', label: 'PWD' }]

  const calculateDetailedAge = dateOfBirth => {
    if (!dateOfBirth) return { years: 0, months: 0, weeks: 0, days: 0, display: '' }

    const today = new Date()
    const birthDate = new Date(dateOfBirth)

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

  useEffect(() => {
    fetchPuroks()
    if (isEditing) fetchResident()
  }, [id])

  useEffect(() => {
    if (formData.dateOfBirth) {
      const ageData = calculateDetailedAge(formData.dateOfBirth)
      setFormData(prev => ({ ...prev, age: ageData.years.toString() }))
      setAgeDisplay(ageData.display)
    } else {
      setAgeDisplay('Enter date of birth')
    }
  }, [formData.dateOfBirth])

  const fetchPuroks = async () => {
    try {
      const response = await purokApi.getAll()
      if (response.data.success) setPuroks(response.data.data)
    } catch (error) {
      console.error('Error fetching puroks:', error)
    } finally {
      setPuroksLoading(false)
    }
  }

  const fetchResident = async () => {
    try {
      const response = await residentApi.getById(id)
      if (response.data.success) {
        const resident = response.data.data
        setFormData({
          name: resident.name || '',
          dateOfBirth: resident.dateOfBirth || '',
          age: resident.age || '',
          gender: resident.gender || '',
          civilStatus: resident.civilStatus || 'Single',
          purokId: resident.purokId || '',
          contactNumber: resident.contactNumber || '',
          contactPerson: resident.contactPerson || '',
          contactPersonNumber: resident.contactPersonNumber || '',
          contactPersonAddress: resident.contactPersonAddress || '',
          lastCheckup: resident.lastCheckup || '',
          focusGroups: resident.focusGroups || [],
          chronicConditions: resident.chronicConditions || [],
          motherName: resident.motherName || '',
          fatherName: resident.fatherName || '',
          disabilityType: resident.disabilityType || ''
        })
        setVitalSigns({
          bloodPressure: resident.vitalSigns?.bloodPressure || '',
          heartRate: resident.vitalSigns?.heartRate || '',
          temperature: resident.vitalSigns?.temperature || '',
          weight: resident.vitalSigns?.weight || '',
          height: resident.vitalSigns?.height || '',
          bloodSugar: resident.vitalSigns?.bloodSugar || '',
          bmi: resident.vitalSigns?.bmi || ''
        })
        setRiskLevel(resident.riskLevel || null)
        
        if (resident.dateOfBirth) {
          const ageData = calculateDetailedAge(resident.dateOfBirth)
          setAgeDisplay(ageData.display)
        }
      }
    } catch (error) {
      console.error('Error fetching resident:', error)
    } finally {
      setFetching(false)
    }
  }

  const handleChange = e => {
    const { name, value, type, checked } = e.target
    const nextValue = (name === 'contactNumber' || name === 'contactPersonNumber')
      ? sanitizePhoneInput(value)
      : value
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : nextValue
    }))
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleVitalChange = e => {
    const { name } = e.target
    let value = e.target.value
    // Keep punctuation, letters, and extra separators out of measurement
    // fields even when the value arrives via paste or autofill.
    if (name === 'bloodPressure') value = sanitizeBloodPressureInput(value)
    else if (name === 'heartRate' || name === 'bloodSugar') value = sanitizeIntegerInput(value)
    else if (name === 'weight' || name === 'height' || name === 'temperature') {
      value = sanitizeDecimalInput(value, { maxDecimals: 1 })
    }
    if (vitalErrors[name]) {
      setVitalErrors(prev => {
        if (!prev[name]) return prev
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    setVitalSigns(prev => {
      const updated = { ...prev, [name]: value }
      const w = parseFloat(updated.weight)
      const h = parseFloat(updated.height)
      if (w > 0 && h > 0) {
        updated.bmi = (w / ((h / 100) * (h / 100))).toFixed(1)
      } else {
        updated.bmi = ''
      }
      return updated
    })
  }

  const handleFocusGroupToggle = groupValue => {
    setFormData(prev => {
      const current = prev.focusGroups || []
      if (current.includes(groupValue)) {
        const next = { ...prev, focusGroups: current.filter(g => g !== groupValue) }
        if (groupValue === 'pwd') next.disabilityType = ''
        return next
      } else {
        return { ...prev, focusGroups: [...current, groupValue] }
      }
    })
  }

  const buildDataToSend = () => {
    const age = parseInt(formData.age) || 0
    let focusGroups = [...(formData.focusGroups || [])]
    const chronicConditions = formData.chronicConditions || []
    const hasDobForBuild = !!formData.dateOfBirth
    const isInfantAge = hasDobForBuild && age >= 0 && age < 5
    const isPwdChecked = focusGroups.includes('pwd')

    if (isInfantAge) {
      if (!focusGroups.includes('infant')) focusGroups.push('infant')
    } else {
      focusGroups = focusGroups.filter(g => g !== 'infant')
    }

    if (age >= 60) {
      if (!focusGroups.includes('senior')) focusGroups.push('senior')
    } else {
      focusGroups = focusGroups.filter(g => g !== 'senior')
    }

    if (chronicConditions.length > 0) {
      if (!focusGroups.includes('withCondition'))
        focusGroups.push('withCondition')
    } else {
      focusGroups = focusGroups.filter(g => g !== 'withCondition')
    }

    if (formData.gender === 'Male') {
      focusGroups = focusGroups.filter(g => g !== 'pregnant')
    }

    return {
      ...formData,
      age: age,
      focusGroups: focusGroups,
      isPwd: isPwdChecked,
      motherName: isInfantAge ? (formData.motherName?.trim() || null) : null,
      fatherName: isInfantAge ? (formData.fatherName?.trim() || null) : null,
      disabilityType: isPwdChecked ? (formData.disabilityType?.trim() || null) : null,
      vitalSigns: {
        bloodPressure: vitalSigns.bloodPressure || null,
        heartRate: vitalSigns.heartRate || null,
        temperature: vitalSigns.temperature || null,
        weight: vitalSigns.weight || null,
        height: vitalSigns.height || null,
        bloodSugar: vitalSigns.bloodSugar || null,
        bmi: vitalSigns.bmi || null
      }
    }
  }

  const validateForm = form => {
    const errors = validateResidentFields(formData)

    if (
      formData.purokId &&
      !puroks.some(p => String(p.id) === String(formData.purokId))
    ) {
      errors.purokId = 'Please select a valid purok from the list.'
    }

    const nextVitalErrors = validateVitalSigns(vitalSigns)
    setFormErrors(errors)
    setVitalErrors(nextVitalErrors)

    if (hasErrors(errors) || hasErrors(nextVitalErrors)) {
      focusFirstError({ ...errors, ...nextVitalErrors }, form)
      return false
    }
    return true
  }

  const applyApiErrors = (error, form) => {
    const backendErrors = error?.response?.data?.errors
    if (!backendErrors || typeof backendErrors !== 'object') return false
    const entries = Object.entries(backendErrors).filter(([, message]) => Boolean(message))
    if (entries.length === 0) return false

    const vitalFields = new Set([
      'bloodPressure',
      'heartRate',
      'temperature',
      'weight',
      'height',
      'bloodSugar',
      'bmi'
    ])
    const nextFormErrors = {}
    const nextVitalErrors = {}
    entries.forEach(([field, message]) => {
      if (vitalFields.has(field)) nextVitalErrors[field] = String(message)
      else nextFormErrors[field] = String(message)
    })

    if (Object.keys(nextFormErrors).length > 0) {
      setFormErrors(previous => ({ ...previous, ...nextFormErrors }))
    }
    if (Object.keys(nextVitalErrors).length > 0) {
      setVitalErrors(previous => ({ ...previous, ...nextVitalErrors }))
    }
    focusFirstError({ ...nextFormErrors, ...nextVitalErrors }, form)
    return true
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const form = e.currentTarget

    if (!validateForm(form)) return

    const confirmed = isEditing
      ? await confirmUpdate('resident', `Please confirm that you want to save the changes to ${formData.name}.`)
      : await confirmCreate('resident', `Please confirm that you want to add ${formData.name}.`)
    if (!confirmed) return

    setLoading(true)
    try {
      const dataToSend = buildDataToSend()

      if (isEditing) {
        await residentApi.update(id, dataToSend)
      } else {
        await residentApi.create(dataToSend)
      }
      navigate('/residents')
      dialog.toast(isEditing ? 'Resident updated successfully.' : 'Resident added successfully.', 'success')
    } catch (error) {
      console.error('Error saving resident:', error)
      if (applyApiErrors(error, form)) return
      dialog.error(error.response?.data?.message || 'Failed to save resident', 'Unable to save resident')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!validateForm(form)) return
    const confirmed = await confirmCreate('resident', `Please confirm that you want to add ${formData.name}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      const dataToSend = buildDataToSend()

      await residentApi.create(dataToSend)
      setShowAddModal(false)
      navigate('/residents')
      dialog.toast('Resident added successfully.', 'success')
    } catch (error) {
      console.error('Error saving resident:', error)
      if (applyApiErrors(error, form)) return
      dialog.error(error.response?.data?.message || 'Failed to save resident', 'Unable to save resident')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!validateForm(form)) return
    const confirmed = await confirmUpdate('resident', `Please confirm that you want to save the changes to ${formData.name}.`)
    if (!confirmed) return
    setSaving(true)
    try {
      const dataToSend = buildDataToSend()

      await residentApi.update(id, dataToSend)
      setShowEditModal(false)
      navigate('/residents')
      dialog.toast('Resident updated successfully.', 'success')
    } catch (error) {
      console.error('Error saving resident:', error)
      if (applyApiErrors(error, form)) return
      dialog.error(error.response?.data?.message || 'Failed to save resident', 'Unable to save resident')
    } finally {
      setSaving(false)
    }
  }

  if (fetching) return <SkeletonResidentForm />

  const age = parseInt(formData.age) || 0
  const hasDob = !!formData.dateOfBirth
  const isInfant = hasDob && age >= 0 && age < 5
  const isSenior = hasDob && age >= 60
  const isMale = formData.gender === 'Male'
  const isPwd = (formData.focusGroups || []).includes('pwd')
  const hasChronicCondition = (formData.chronicConditions || []).length > 0

  const displayFocusGroups = [...(formData.focusGroups || [])]
  if (isInfant && !displayFocusGroups.includes('infant'))
    displayFocusGroups.push('infant')
  if (isSenior && !displayFocusGroups.includes('senior'))
    displayFocusGroups.push('senior')
  if (hasChronicCondition && !displayFocusGroups.includes('withCondition'))
    displayFocusGroups.push('withCondition')

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <button
        onClick={goBack}
        className='flex items-center space-x-2 text-white/85 hover:text-white transition-colors'
      >
        <ArrowLeft className='w-5 h-5' />
        <span>Back to Residents</span>
      </button>
      <h1 className='text-2xl font-bold text-white'>
        {isEditing ? 'Edit Resident Profile' : 'Add New Resident'}
      </h1>
      <div className='flex space-x-3'>
        {isEditing ? (
          <GlassButton
            variant='secondary'
            type='button'
            onClick={() => setShowEditModal(true)}
          >
            Edit Modally
          </GlassButton>
        ) : (
          <GlassButton
            variant='secondary'
            type='button'
            onClick={() => setShowAddModal(true)}
          >
            Add Modally
          </GlassButton>
        )}
        <GlassButton
          variant='secondary'
          type='button'
          onClick={goBack}
        >
          Cancel
        </GlassButton>
      </div>

      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Personal Information */}
        <GlassCard hover={false}>
          <h2 className='text-base sm:text-lg font-semibold text-white mb-4'>
            Personal Information
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <GlassInput
              label='Full Name *'
              name='name'
              value={formData.name}
              onChange={handleChange}
              error={formErrors.name}
              required
              placeholder='Enter full name'
            />
            <GlassInput
              label='Date of Birth *'
              name='dateOfBirth'
              type='date'
              value={formData.dateOfBirth}
              onChange={handleChange}
              error={formErrors.dateOfBirth}
              required
            />

            <div className='space-y-1.5'>
              <label className='block text-sm font-medium text-blue-200'>
                Age (auto-calculated)
              </label>
              <input
                type='text'
                value={ageDisplay}
                readOnly
                className='glass-input text-white/75 cursor-not-allowed'
              />
              {age > 0 && age < 5 && (
                <p className='text-xs text-blue-300 mt-1'>
                  ({age} year{age > 1 ? 's' : ''})
                </p>
              )}
            </div>

            <div className='space-y-1.5'>
              <label className='block text-sm font-medium text-blue-200'>
                Gender *
              </label>
              <GlassSelect
                name='gender'
                value={formData.gender}
                onChange={v => handleChange({ target: { name: 'gender', value: v } })}
                error={formErrors.gender}
                placeholder='Select gender'
                allowCustom
                options={[
                  { value: 'Female', label: 'Female' },
                  { value: 'Male', label: 'Male' },
                  { value: 'Other', label: 'Other' }
                ]}
                required
              />
            </div>
            <div className='space-y-1.5'>
              <label className='block text-sm font-medium text-blue-200'>
                Civil Status
              </label>
              <GlassSelect
                name='civilStatus'
                value={formData.civilStatus}
                onChange={v => handleChange({ target: { name: 'civilStatus', value: v } })}
                options={[
                  { value: 'Married', label: 'Married' },
                  { value: 'Separated', label: 'Separated' },
                  { value: 'Single', label: 'Single' },
                  { value: 'Widowed', label: 'Widowed' }
                ]}
              />
            </div>
            <GlassInput
              label='Contact Number'
              name='contactNumber'
              type='tel'
              inputMode='tel'
              maxLength={11}
              onKeyDown={blockPhoneKeys}
              value={formData.contactNumber}
              onChange={handleChange}
              error={formErrors.contactNumber}
              placeholder='Enter contact number'
            />
            <div className='space-y-1.5'>
              {puroksLoading ? (
                <SkeletonSelectField labelWidth='w-16' />
              ) : (
              <>
              <label className='block text-sm font-medium text-blue-200'>
                Purok
              </label>
              <GlassSelect
                name='purokId'
                value={formData.purokId}
                onChange={v => handleChange({ target: { name: 'purokId', value: v } })}
                error={formErrors.purokId}
                placeholder='Select purok'
                allowCustom
                allowClear
                options={[
                  ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(purok => ({ value: String(purok.id), label: purok.name }))
                ]}
              />
              </>
              )}
            </div>
            <GlassInput
              label='Last Checkup'
              name='lastCheckup'
              type='date'
              value={formData.lastCheckup}
              onChange={handleChange}
              error={formErrors.lastCheckup}
            />
          </div>
          {isInfant && (
            <div className='mt-4 border-t border-white/10 pt-4'>
              <p className='text-sm font-medium text-emerald-300 mb-3'>
                Parent / Guardian Details (Infant)
              </p>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <GlassInput
                  label="Mother's Name"
                  name='motherName'
                  value={formData.motherName}
                  onChange={handleChange}
                  placeholder="Enter mother's name"
                />
                <GlassInput
                  label="Father's Name"
                  name='fatherName'
                  value={formData.fatherName}
                  onChange={handleChange}
                  placeholder="Enter father's name"
                />
              </div>
            </div>
          )}
        </GlassCard>

        {/* Risk Level */}
        {isEditing && riskLevel && (
          <GlassCard hover={false}>
            <h2 className='text-base sm:text-lg font-semibold text-white mb-4'>
              Risk Assessment
            </h2>
            <div className='flex items-center gap-3'>
              <span
                className={`badge text-sm px-4 py-2 ${getRiskColor(riskLevel)}`}
              >
                {riskLevel}
              </span>
              {riskLevel === 'Critical Health Risk' && (
                <p className='text-sm text-red-400'>
                  Requires immediate attention and regular monitoring
                </p>
              )}
              {riskLevel === 'High Health Risk' && (
                <p className='text-sm text-orange-400'>
                  Needs frequent checkups and close monitoring
                </p>
              )}
              {riskLevel === 'Moderate Health Risk' && (
                <p className='text-sm text-yellow-400'>
                  Regular monitoring recommended
                </p>
              )}
              {riskLevel === 'Low Health Risk' && (
                <p className='text-sm text-emerald-400'>
                  Routine checkups sufficient
                </p>
              )}
            </div>
          </GlassCard>
        )}

        {/* Vital Signs */}
        <GlassCard hover={false}>
          <h2 className='text-base sm:text-lg font-semibold text-white mb-4'>
            Vital Signs
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <GlassInput
              label='Blood Pressure (mmHg)'
              name='bloodPressure'
              error={vitalErrors.bloodPressure}
              pattern='[0-9]{2,3}/[0-9]{2,3}'
              title='Blood pressure must look like 120/80.'
              type='text'
              inputMode='numeric'
              maxLength={7}
              onKeyDown={blockBloodPressureKeys}
              value={vitalSigns.bloodPressure}
              onChange={handleVitalChange}
              placeholder='e.g. 120/80'
            />
            <GlassInput
              label='Heart Rate (bpm)'
              name='heartRate'
              error={vitalErrors.heartRate}
              type='number'
              inputMode='numeric'
              min='20'
              max='300'
              step='1'
              onKeyDown={blockIntegerKeys}
              value={vitalSigns.heartRate}
              onChange={handleVitalChange}
              placeholder='e.g. 75'
            />
            <GlassInput
              label='Temperature (°C)'
              name='temperature'
              error={vitalErrors.temperature}
              type='number'
              min='25'
              max='50'
              step='0.1'
              value={vitalSigns.temperature}
              onChange={handleVitalChange}
              placeholder='e.g. 36.7'
            />
            <GlassInput
              label='Weight (kg)'
              name='weight'
              error={vitalErrors.weight}
              type='number'
              min='0.1'
              max='500'
              step='0.1'
              value={vitalSigns.weight}
              onChange={handleVitalChange}
              placeholder='e.g. 58'
            />
            <GlassInput
              label='Height (cm)'
              name='height'
              error={vitalErrors.height}
              type='number'
              min='10'
              max='300'
              step='0.1'
              value={vitalSigns.height}
              onChange={handleVitalChange}
              placeholder='e.g. 165'
            />
            <GlassInput
              label='Blood Sugar (mg/dL)'
              name='bloodSugar'
              error={vitalErrors.bloodSugar}
              type='number'
              inputMode='numeric'
              min='0'
              max='1000'
              step='1'
              onKeyDown={blockIntegerKeys}
              value={vitalSigns.bloodSugar}
              onChange={handleVitalChange}
              placeholder='e.g. 95'
            />
            <GlassInput
              label='BMI'
              name='bmi'
              value={vitalSigns.bmi}
              readOnly
              placeholder='Auto-calculated'
            />
          </div>
        </GlassCard>

        {/* Focus Groups */}
        <GlassCard hover={false}>
          <h2 className='text-base sm:text-lg font-semibold text-white mb-2'>
            Focus Groups
          </h2>

          <div>
            <div className='flex flex-wrap gap-2'>
              {isInfant && (
                <span className='px-3 py-1.5 mb-3 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full text-sm font-medium'>
                  Infant (0-59 months)
                </span>
              )}
              {isSenior && (
                <span className='px-3 py-1.5 mb-3 bg-purple-500/20 text-purple-300 border border-purple-400/30 rounded-full text-sm font-medium'>
                  Senior Citizen (60+)
                </span>
              )}
              {hasChronicCondition && (
                <span className='px-3 py-1.5 mb-3 bg-orange-500/20 text-orange-300 border border-orange-400/30 rounded-full text-sm font-medium'>
                  With Chronic Condition
                </span>
              )}
            </div>
          </div>

          <div>
            <div className='flex flex-wrap gap-3'>
              {!isMale && (
                <label
                  className={`flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                    displayFocusGroups.includes('pregnant')
                      ? 'bg-pink-500/20 border-pink-400/50 text-pink-200'
                      : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                  }`}
                >
                  <input
                    type='checkbox'
                    checked={displayFocusGroups.includes('pregnant')}
                    onChange={() => handleFocusGroupToggle('pregnant')}
                    className='w-4 h-4 rounded border-white/20 bg-white/5 text-pink-500 focus:ring-pink-400/50'
                  />
                  <span className='text-sm'>Pregnant</span>
                </label>
              )}

              <label
                className={`flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                  displayFocusGroups.includes('pwd')
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                }`}
              >
                <input
                  type='checkbox'
                  checked={displayFocusGroups.includes('pwd')}
                  onChange={() => handleFocusGroupToggle('pwd')}
                  className='w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50'
                />
                <span className='text-sm'>PWD</span>
              </label>
            </div>
          </div>
          {isPwd && (
            <div className='mt-4'>
              <GlassInput
                label='Specify Disability *'
                name='disabilityType'
                value={formData.disabilityType}
                onChange={handleChange}
                error={formErrors.disabilityType}
                required
                placeholder='Enter resident disability'
              />
            </div>
          )}
        </GlassCard>

        {/* Emergency Contact */}
        <GlassCard hover={false}>
          <h2 className='text-base sm:text-lg font-semibold text-white mb-4'>
            Emergency Contact
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <GlassInput
              label='Contact Person'
              name='contactPerson'
              value={formData.contactPerson}
              onChange={handleChange}
              placeholder='Enter contact person name'
            />
            <GlassInput
              label='Contact Person Number'
              name='contactPersonNumber'
              type='tel'
              inputMode='tel'
              maxLength={11}
              onKeyDown={blockPhoneKeys}
              value={formData.contactPersonNumber}
              onChange={handleChange}
              placeholder='Enter contact person number'
            />
            <div className='md:col-span-2'>
              <GlassInput
                label='Contact Person Address'
                name='contactPersonAddress'
                value={formData.contactPersonAddress}
                onChange={handleChange}
                placeholder='Enter contact person address'
              />
            </div>
          </div>
        </GlassCard>

        <div className='flex justify-end space-x-3'>
          <GlassButton
            variant='secondary'
            type='button'
            onClick={goBack}
          >
            Cancel
          </GlassButton>
          <GlassButton type='submit' icon={Save} loading={loading}>
            {isEditing ? 'Update Profile' : 'Add Resident'}
          </GlassButton>
        </div>
      </form>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Resident"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <GlassInput
            label='Full Name *'
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
            placeholder='Enter full name'
          />
          <GlassInput
            label='Date of Birth *'
            type='date'
            value={formData.dateOfBirth}
            onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
            required
          />
          <GlassSelect
            name='gender'
            value={formData.gender}
            onChange={(v) => setFormData(prev => ({ ...prev, gender: v }))}
            placeholder='Select gender'
            allowCustom
            required
            options={[
              { value: 'Female', label: 'Female' },
              { value: 'Male', label: 'Male' },
              { value: 'Other', label: 'Other' }
            ]}
          />
          <GlassSelect
            name='civilStatus'
            value={formData.civilStatus}
            onChange={(v) => setFormData(prev => ({ ...prev, civilStatus: v }))}
            options={[
              { value: 'Married', label: 'Married' },
              { value: 'Separated', label: 'Separated' },
              { value: 'Single', label: 'Single' },
              { value: 'Widowed', label: 'Widowed' }
            ]}
          />
          <GlassInput
            label='Contact Number'
            type='tel'
            inputMode='tel'
            maxLength={11}
            onKeyDown={blockPhoneKeys}
            value={formData.contactNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))}
            placeholder='Enter contact number'
          />
          <GlassSelect
            name='purokId'
            value={formData.purokId}
            onChange={(v) => setFormData(prev => ({ ...prev, purokId: v }))}
            placeholder='Select purok'
            allowCustom
            allowClear
            options={[
              ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(purok => ({ value: String(purok.id), label: purok.name }))
            ]}
          />
          <GlassInput
            label='Last Checkup'
            type='date'
            value={formData.lastCheckup}
            onChange={(e) => setFormData(prev => ({ ...prev, lastCheckup: e.target.value }))}
          />
          {isInfant && (
            <>
              <GlassInput
                label="Mother's Name"
                value={formData.motherName}
                onChange={(e) => setFormData(prev => ({ ...prev, motherName: e.target.value }))}
                placeholder="Enter mother's name"
              />
              <GlassInput
                label="Father's Name"
                value={formData.fatherName}
                onChange={(e) => setFormData(prev => ({ ...prev, fatherName: e.target.value }))}
                placeholder="Enter father's name"
              />
            </>
          )}
          <label className='flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-all duration-200 bg-white/5 border-white/10 text-white/75 hover:bg-white/10'>
            <input
              type='checkbox'
              checked={(formData.focusGroups || []).includes('pwd')}
              onChange={() => handleFocusGroupToggle('pwd')}
              className='w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50'
            />
            <span className='text-sm'>PWD</span>
          </label>
          {isPwd && (
            <GlassInput
              label='Specify Disability *'
              value={formData.disabilityType}
              onChange={(e) => setFormData(prev => ({ ...prev, disabilityType: e.target.value }))}
              required
              placeholder='Enter resident disability'
            />
          )}
          <GlassInput
            label='Blood Pressure (mmHg)'
            name='bloodPressure'
              error={vitalErrors.bloodPressure}
              pattern='[0-9]{2,3}/[0-9]{2,3}'
              title='Blood pressure must look like 120/80.'
            type='text'
            inputMode='numeric'
            maxLength={7}
            onKeyDown={blockBloodPressureKeys}
            value={vitalSigns.bloodPressure}
            onChange={handleVitalChange}
            placeholder='e.g. 120/80'
          />
          <GlassInput
            label='Heart Rate (bpm)'
            name='heartRate'
              error={vitalErrors.heartRate}
            type='number'
            inputMode='numeric'
            min='20'
            max='300'
            step='1'
            onKeyDown={blockIntegerKeys}
            value={vitalSigns.heartRate}
            onChange={handleVitalChange}
            placeholder='e.g. 75'
          />
          <GlassInput
            label='Temperature (°C)'
            name='temperature'
              error={vitalErrors.temperature}
            type='number'
            min='25'
            max='50'
            step='0.1'
            value={vitalSigns.temperature}
            onChange={handleVitalChange}
            placeholder='e.g. 36.7'
          />
          <GlassInput
            label='Weight (kg)'
            name='weight'
              error={vitalErrors.weight}
            type='number'
            min='0.1'
            max='500'
            step='0.1'
            value={vitalSigns.weight}
            onChange={handleVitalChange}
            placeholder='e.g. 58'
          />
          <GlassInput
            label='Height (cm)'
            name='height'
              error={vitalErrors.height}
            type='number'
            min='10'
            max='300'
            step='0.1'
            value={vitalSigns.height}
            onChange={handleVitalChange}
            placeholder='e.g. 165'
          />
          <GlassInput
            label='Blood Sugar (mg/dL)'
            name='bloodSugar'
              error={vitalErrors.bloodSugar}
            type='number'
            inputMode='numeric'
            min='0'
            max='1000'
            step='1'
            onKeyDown={blockIntegerKeys}
            value={vitalSigns.bloodSugar}
            onChange={handleVitalChange}
            placeholder='e.g. 95'
          />
          <GlassInput
            label='BMI'
            value={vitalSigns.bmi}
            readOnly
            placeholder='Auto-calculated'
          />
          <GlassInput
            label='Contact Person'
            value={formData.contactPerson}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
            placeholder='Enter contact person name'
          />
          <GlassInput
            label='Contact Person Number'
            type='tel'
            inputMode='tel'
            maxLength={11}
            onKeyDown={blockPhoneKeys}
            value={formData.contactPersonNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPersonNumber: sanitizePhoneInput(e.target.value) }))}
            placeholder='Enter contact person number'
          />
          <GlassInput
            label='Contact Person Address'
            value={formData.contactPersonAddress}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPersonAddress: e.target.value }))}
            placeholder='Enter contact person address'
          />
          <div className="flex justify-end gap-3">
            <GlassButton
              variant="secondary"
              type="button"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton type="submit" loading={saving}>
              Add Resident
            </GlassButton>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Resident Profile"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <GlassInput
            label='Full Name *'
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
            placeholder='Enter full name'
          />
          <GlassInput
            label='Date of Birth *'
            type='date'
            value={formData.dateOfBirth}
            onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
            required
          />
          <GlassSelect
            name='gender'
            value={formData.gender}
            onChange={(v) => setFormData(prev => ({ ...prev, gender: v }))}
            placeholder='Select gender'
            allowCustom
            required
            options={[
              { value: 'Female', label: 'Female' },
              { value: 'Male', label: 'Male' },
              { value: 'Other', label: 'Other' }
            ]}
          />
          <GlassSelect
            name='civilStatus'
            value={formData.civilStatus}
            onChange={(v) => setFormData(prev => ({ ...prev, civilStatus: v }))}
            options={[
              { value: 'Married', label: 'Married' },
              { value: 'Separated', label: 'Separated' },
              { value: 'Single', label: 'Single' },
              { value: 'Widowed', label: 'Widowed' }
            ]}
          />
          <GlassInput
            label='Contact Number'
            type='tel'
            inputMode='tel'
            maxLength={11}
            onKeyDown={blockPhoneKeys}
            value={formData.contactNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: sanitizePhoneInput(e.target.value) }))}
            placeholder='Enter contact number'
          />
          <GlassSelect
            name='purokId'
            value={formData.purokId}
            onChange={(v) => setFormData(prev => ({ ...prev, purokId: v }))}
            placeholder='Select purok'
            allowCustom
            allowClear
            options={[
              ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(purok => ({ value: String(purok.id), label: purok.name }))
            ]}
          />
          <GlassInput
            label='Last Checkup'
            type='date'
            value={formData.lastCheckup}
            onChange={(e) => setFormData(prev => ({ ...prev, lastCheckup: e.target.value }))}
          />
          {isInfant && (
            <>
              <GlassInput
                label="Mother's Name"
                value={formData.motherName}
                onChange={(e) => setFormData(prev => ({ ...prev, motherName: e.target.value }))}
                placeholder="Enter mother's name"
              />
              <GlassInput
                label="Father's Name"
                value={formData.fatherName}
                onChange={(e) => setFormData(prev => ({ ...prev, fatherName: e.target.value }))}
                placeholder="Enter father's name"
              />
            </>
          )}
          <label className='flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-all duration-200 bg-white/5 border-white/10 text-white/75 hover:bg-white/10'>
            <input
              type='checkbox'
              checked={(formData.focusGroups || []).includes('pwd')}
              onChange={() => handleFocusGroupToggle('pwd')}
              className='w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400/50'
            />
            <span className='text-sm'>PWD</span>
          </label>
          {isPwd && (
            <GlassInput
              label='Specify Disability *'
              value={formData.disabilityType}
              onChange={(e) => setFormData(prev => ({ ...prev, disabilityType: e.target.value }))}
              required
              placeholder='Enter resident disability'
            />
          )}
          <GlassInput
            label='Blood Pressure (mmHg)'
            name='bloodPressure'
              error={vitalErrors.bloodPressure}
              pattern='[0-9]{2,3}/[0-9]{2,3}'
              title='Blood pressure must look like 120/80.'
            type='text'
            inputMode='numeric'
            maxLength={7}
            onKeyDown={blockBloodPressureKeys}
            value={vitalSigns.bloodPressure}
            onChange={handleVitalChange}
            placeholder='e.g. 120/80'
          />
          <GlassInput
            label='Heart Rate (bpm)'
            name='heartRate'
              error={vitalErrors.heartRate}
            type='number'
            inputMode='numeric'
            min='20'
            max='300'
            step='1'
            onKeyDown={blockIntegerKeys}
            value={vitalSigns.heartRate}
            onChange={handleVitalChange}
            placeholder='e.g. 75'
          />
          <GlassInput
            label='Temperature (°C)'
            name='temperature'
              error={vitalErrors.temperature}
            type='number'
            min='25'
            max='50'
            step='0.1'
            value={vitalSigns.temperature}
            onChange={handleVitalChange}
            placeholder='e.g. 36.7'
          />
          <GlassInput
            label='Weight (kg)'
            name='weight'
              error={vitalErrors.weight}
            type='number'
            min='0.1'
            max='500'
            step='0.1'
            value={vitalSigns.weight}
            onChange={handleVitalChange}
            placeholder='e.g. 58'
          />
          <GlassInput
            label='Height (cm)'
            name='height'
              error={vitalErrors.height}
            type='number'
            min='10'
            max='300'
            step='0.1'
            value={vitalSigns.height}
            onChange={handleVitalChange}
            placeholder='e.g. 165'
          />
          <GlassInput
            label='Blood Sugar (mg/dL)'
            name='bloodSugar'
              error={vitalErrors.bloodSugar}
            type='number'
            inputMode='numeric'
            min='0'
            max='1000'
            step='1'
            onKeyDown={blockIntegerKeys}
            value={vitalSigns.bloodSugar}
            onChange={handleVitalChange}
            placeholder='e.g. 95'
          />
          <GlassInput
            label='BMI'
            value={vitalSigns.bmi}
            readOnly
            placeholder='Auto-calculated'
          />
          <GlassInput
            label='Contact Person'
            value={formData.contactPerson}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
            placeholder='Enter contact person name'
          />
          <GlassInput
            label='Contact Person Number'
            type='tel'
            inputMode='tel'
            maxLength={11}
            onKeyDown={blockPhoneKeys}
            value={formData.contactPersonNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPersonNumber: sanitizePhoneInput(e.target.value) }))}
            placeholder='Enter contact person number'
          />
          <GlassInput
            label='Contact Person Address'
            value={formData.contactPersonAddress}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPersonAddress: e.target.value }))}
            placeholder='Enter contact person address'
          />
          <div className="flex justify-end gap-3">
            <GlassButton
              variant="secondary"
              type="button"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton type="submit" loading={saving}>
              Update Profile
            </GlassButton>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ResidentForm