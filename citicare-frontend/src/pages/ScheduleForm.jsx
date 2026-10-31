// pages/ScheduleForm.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Plus, X, ChevronDown } from 'lucide-react'
import { scheduleApi } from '../api/scheduleApi'
import { residentApi } from '../api/residentApi'
import { bhwApi } from '../api/bhwApi'
import { purokApi } from '../api/purokApi'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import GlassSelect from '../components/GlassSelect'
import { SkeletonScheduleForm, SkeletonSelectField, SkeletonDropdownOptions } from '../components/Skeleton'
import { formatAge } from '../utils/helpers'
import { useSmartBack } from '../utils/navigation'
import { dialog } from '../context/DialogContext'
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm'
import {
  blockNumericKeys,
  blockIntegerKeys,
  blockPhoneKeys,
  sanitizePhoneInput
} from '../utils/validation'

const ScheduleForm = () => {
  const { id } = useParams()
  const isEditing = !!id
  const navigate = useNavigate()
  const goBack = useSmartBack('/schedules')
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(isEditing)
  const [residents, setResidents] = useState([])
  const [bhws, setBhws] = useState([])
  const [puroks, setPuroks] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(true)

  const [scope, setScope] = useState('individual')

  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const typeDropdownRef = useRef(null)
  const typeInputRef = useRef(null)

  const [residentSearch, setResidentSearch] = useState('')
  const [openResidentDropdown, setOpenResidentDropdown] = useState(false)
  const residentDropdownRef = useRef(null)
  const [locationPurok, setLocationPurok] = useState('')

  const formDataRef = useRef({
    date: '',
    time: '',
    type: '',
    checkupCategory: 'Health Center',
    status: 'Scheduled',
    duration: 4,
    purpose: '',
    additionalInfo: '',
    locationDescription: '',
    locationPurok: '',
    contactPerson: '',
    contactNumber: '',
    healthcareProfessionals: [],
    assignedBhws: [],
    residentId: '',
    residentName: '',
    referralDestinationType: '',
    referralFacilityName: '',
    referralFacilityAddress: '',
    purokId: '',
    programName: '',
    programDescription: '',
    targetGroup: '',
    targetCount: '',
    venue: '',
    coordinatorName: '',
    coordinatorContact: '',
    partnerOrganization: '',
    budget: '',
    maxParticipants: '',
    participants: []
  })

  const [formUpdateKey, setFormUpdateKey] = useState(0)
  const [bhwKeys, setBhwKeys] = useState([])
  const [hcpKeys, setHcpKeys] = useState([])

  // Keep in sync with Add Medical Record types (ResidentDetail) + Schedules.jsx
  const presetTypes = ['Checkup', 'Prenatal Checkup', 'Postpartum Checkup', 'Growth Monitoring', 'Senior Checkup', 'Vaccination', 'Deworming', 'Vitamin Supplementation', 'Referral']
  const serviceLocations = ['Health Center', 'Home Visit']

  // Type eligibility mirrors Schedules.jsx: Prenatal Checkup for pregnant
  // residents only, Postpartum Checkup for female residents (mothers) only,
  // Growth Monitoring for infants (under 5) only,
  // Senior Checkup for seniors (60+) only.
  const getAllowedIndividualTypes = (resident) => {
    if (!resident) return presetTypes
    const age = Number(resident.age) || 0
    const groups = resident.focusGroups || []
    const isPregnant = groups.includes('pregnant')
    const isInfant = groups.includes('infant') || age < 5
    const isSenior = groups.includes('senior') || age >= 60
    return presetTypes.filter(t => {
      if (t === 'Prenatal Checkup') return isPregnant
      if (t === 'Postpartum Checkup') return resident.gender === 'Female'
      if (t === 'Growth Monitoring') return isInfant
      if (t === 'Senior Checkup') return isSenior
      return true
    })
  }
  const targetGroups = [
    'All Residents',
    'Adolescents (13-19 years)',
    'Adults (20-59 years)',
    'Children (6-12 years)',
    'Infants (0-5 years)',
    'Lactating Mothers',
    'Malnourished Children',
    'Pregnant Women',
    'PWD',
    'Senior Citizens (60+)',
    'With Diabetes',
    'With Hypertension',
    'With TB'
  ]

  const activeBhws = bhws.filter(b => b.status === 'Active')
  const isHeadPosition = b => String(b.position || '').toLowerCase().includes('head')
  const isBhwPosition = b => {
    const p = String(b.position || '').toLowerCase()
    return !isHeadPosition(b) && (p.includes('health worker') || p === 'bhw')
  }
  const bhwWorkers = activeBhws.filter(isBhwPosition)
  const healthcareProfessionalsList = activeBhws.filter(
    b => !isBhwPosition(b) && !isHeadPosition(b)
  )

  useEffect(() => {
    const handleClickOutside = e => {
      if (
        typeDropdownRef.current &&
        !typeDropdownRef.current.contains(e.target) &&
        typeInputRef.current &&
        !typeInputRef.current.contains(e.target)
      ) {
        setShowTypeDropdown(false)
      }
      if (
        residentDropdownRef.current &&
        !residentDropdownRef.current.contains(e.target)
      ) {
        setOpenResidentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    Promise.allSettled([fetchResidents(), fetchBHWs(), fetchPuroks()]).then(() => setOptionsLoading(false))
    if (isEditing) fetchSchedule()
    else if (location.state?.resident) {
      const r = location.state.resident
      formDataRef.current = {
        ...formDataRef.current,
        residentId: r.id || '',
        residentName: r.name || '',
        contactPerson: r.contactPerson || r.contact_person || '',
        contactNumber: r.contactNumber || r.contact_person_number || '',
        locationPurok: r.purok || formDataRef.current.locationPurok
      }
      if (r.name) setResidentSearch(r.name)
      if (r.purok) setLocationPurok(r.purok)
      setFormUpdateKey(prev => prev + 1)
    }
  }, [id])

  const fetchResidents = async () => {
    try {
      const r = await residentApi.getAll()
      if (r.data.success) setResidents(r.data.data)
    } catch (e) {}
  }
  const fetchBHWs = async () => {
    try {
      const r = await bhwApi.getAll()
      if (r.data.success) setBhws(r.data.data || [])
    } catch (e) {}
  }
  const fetchPuroks = async () => {
    try {
      const r = await purokApi.getAll()
      if (r.data.success) setPuroks(r.data.data)
    } catch (e) {}
  }

  const fetchSchedule = async () => {
    try {
      const response = await scheduleApi.getById(id)
      if (response.data.success) {
        const s = response.data.data
        setScope(s.scope || 'individual')
        setResidentSearch(s.resident?.name || s.residentName || '')

        const allBhws = []
        if (s.leadBhw?.id || s.leadBhw?.name) {
          allBhws.push({
            bhwId: s.leadBhw.id || s.leadBhwId || '',
            name: s.leadBhw.name || s.leadBhwName || '',
            contactNumber: s.leadBhw.contactNumber || s.leadBhwContact || ''
          })
        }
        if (s.assignedBhws) {
          s.assignedBhws.forEach(b => {
            if (
              !allBhws.find(existing => existing.bhwId === (b.id || b.bhwId))
            ) {
              allBhws.push({
                bhwId: b.id || b.bhwId || '',
                name: b.name || '',
                contactNumber: b.contactNumber || b.contact_number || ''
              })
            }
          })
        }

        formDataRef.current = {
          date: s.date || '',
          time: s.time || '',
          type: s.type || '',
          checkupCategory: s.checkupCategory || s.serviceCategory || 'Health Center',
          status: s.status || 'Scheduled',
          duration: s.duration ? Math.round(s.duration / 60) : 4,
          purpose: s.purpose || s.programDescription || '',
          additionalInfo: s.additionalInfo || s.notes || '',
          locationDescription: s.locationDescription || s.locationDetails || '',
          locationPurok: s.purokName || s.puroks?.name || s.locationPurok || '',
          contactPerson: s.contactPerson || '',
          contactNumber: s.contactNumber || '',
          healthcareProfessionals: (s.healthcareProfessionals || []).map(h => ({
            hcpId: h.id || h.hcpId || h.bhwId || '',
            name: h.name || '',
            contact: h.contact || h.contactNumber || h.contact_number || ''
          })),
          assignedBhws:
            allBhws.length > 0
              ? allBhws
              : [{ bhwId: '', name: '', contactNumber: '' }],
          residentId: s.resident?.id || s.residentId || '',
          residentName: s.resident?.name || s.residentName || '',
          referralDestinationType: s.referralDestinationType || '',
          referralFacilityName: s.referralFacilityName || '',
          referralFacilityAddress: s.referralFacilityAddress || '',
          purokId: s.purokId || '',
          programName: s.programName || '',
          programDescription: s.programDescription || s.purpose || '',
          targetGroup: s.targetGroup || '',
          targetCount: s.targetCount || '',
          venue: s.venue || '',
          coordinatorName: s.coordinatorName || '',
          coordinatorContact: s.coordinatorContact || '',
          partnerOrganization: s.partnerOrganization || '',
          budget: s.budget || '',
          maxParticipants: s.maxParticipants || '',
          participants:
            s.participants?.map(p => ({ residentId: p.id || p.residentId })) ||
            []
        }

        setBhwKeys(
          formDataRef.current.assignedBhws.map(
            (_, i) => `bhw-${Date.now()}-${i}`
          )
        )
        setLocationPurok(formDataRef.current.locationPurok)
        setHcpKeys(
          formDataRef.current.healthcareProfessionals.map(
            (_, i) => `hcp-${Date.now()}-${i}`
          )
        )
        setFormUpdateKey(prev => prev + 1)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setFetching(false)
    }
  }

  const selectResident = resident => {
    formDataRef.current.residentId = resident.id
    formDataRef.current.residentName = resident.name
    if (!getAllowedIndividualTypes(resident).includes(formDataRef.current.type)) {
      formDataRef.current.type = ''
    }
    formDataRef.current.contactPerson =
      resident.contactPerson || resident.contact_person || ''
    formDataRef.current.contactNumber =
      resident.contactNumber || resident.contact_person_number || ''
    formDataRef.current.locationPurok =
      resident.purok || formDataRef.current.locationPurok
    setLocationPurok(formDataRef.current.locationPurok)
    setResidentSearch(resident.name)
    setOpenResidentDropdown(false)
    setFormUpdateKey(prev => prev + 1)
  }

  const handleResidentChange = e => {
    setResidentSearch(e.target.value)
    if (!openResidentDropdown) setOpenResidentDropdown(true)
  }

  const addBHW = () => {
    formDataRef.current.assignedBhws.push({
      bhwId: '',
      name: '',
      contactNumber: ''
    })
    setBhwKeys([...bhwKeys, `bhw-${Date.now()}`])
    setFormUpdateKey(prev => prev + 1)
  }

  const removeBHW = index => {
    formDataRef.current.assignedBhws.splice(index, 1)
    setBhwKeys(bhwKeys.filter((_, i) => i !== index))
    setFormUpdateKey(prev => prev + 1)
  }

  const addHealthcareProfessional = () => {
    formDataRef.current.healthcareProfessionals.push({
      hcpId: '',
      name: '',
      contact: ''
    })
    setHcpKeys([...hcpKeys, `hcp-${Date.now()}`])
    setFormUpdateKey(prev => prev + 1)
  }

  const removeHealthcareProfessional = index => {
    formDataRef.current.healthcareProfessionals.splice(index, 1)
    setHcpKeys(hcpKeys.filter((_, i) => i !== index))
    setFormUpdateKey(prev => prev + 1)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!formDataRef.current.date || !formDataRef.current.time) {
      dialog.error('Please fill in date and time.', 'Validation error')
      return
    }
    if (scope === 'individual' && !formDataRef.current.residentId) {
      dialog.error('Please select a resident.', 'Validation error')
      return
    }
    if (scope === 'individual' && !residents.some(res => String(res.id) === String(formDataRef.current.residentId))) {
      dialog.error('Please select a valid resident from the list.', 'Validation error')
      return
    }
    if (scope === 'individual' && formDataRef.current.type) {
      const r = residents.find(res => String(res.id) === String(formDataRef.current.residentId))
      if (!getAllowedIndividualTypes(r).includes(formDataRef.current.type)) {
        dialog.error(`${formDataRef.current.type} is not applicable to this resident.`, 'Validation error')
        return
      }
    }
    if (scope === 'purok' && !formDataRef.current.purokId) {
      dialog.error('Please select a purok.', 'Validation error')
      return
    }
    if (scope === 'purok' && !puroks.some(p => String(p.id) === String(formDataRef.current.purokId))) {
      dialog.error('Please select a valid purok from the list.', 'Validation error')
      return
    }
    if (
      (scope === 'purok' || scope === 'barangay') &&
      !formDataRef.current.programName
    ) {
      dialog.error('Please enter a program name.', 'Validation error')
      return
    }

    const validBhws = formDataRef.current.assignedBhws.filter(
      b => b.name && b.name.trim() !== ''
    )
    if (validBhws.length === 0) {
      dialog.error('Please assign at least one BHW.', 'Validation error')
      return
    }

    const confirmed = isEditing
      ? await confirmUpdate('schedule', 'Please confirm that you want to save the changes to this schedule.')
      : await confirmCreate('schedule', 'Please confirm that you want to create this schedule.')
    if (!confirmed) return

    setLoading(true)
    try {
      const validHcps = formDataRef.current.healthcareProfessionals.filter(
        h => h.name && h.name.trim() !== ''
      )

      const dataToSend = {
        scope,
        date: formDataRef.current.date,
        time: formDataRef.current.time,
        type:
          formDataRef.current.type ||
          (scope === 'individual' ? 'Checkup' : 'Program'),
        status: formDataRef.current.status,
        duration:
          scope === 'purok' || scope === 'barangay'
            ? parseInt(formDataRef.current.duration) * 60
            : parseInt(formDataRef.current.duration) || 30,
        purpose:
          formDataRef.current.purpose ||
          formDataRef.current.programDescription ||
          '',
        notes: formDataRef.current.additionalInfo || '',
        locationDetails: formDataRef.current.locationDescription || '',
        contactPerson: formDataRef.current.contactPerson || '',
        contactNumber: formDataRef.current.contactNumber || '',
        residentId:
          scope === 'individual'
            ? formDataRef.current.residentId || null
            : null,
        purokId: scope === 'purok' ? formDataRef.current.purokId || null : null,
        isBarangayWide: scope === 'barangay',
        programName: formDataRef.current.programName || '',
        programDescription: formDataRef.current.programDescription || '',
        targetGroup: formDataRef.current.targetGroup || '',
        targetCount: formDataRef.current.targetCount || null,
        venue: formDataRef.current.venue || '',
        coordinatorName: formDataRef.current.coordinatorName || '',
        coordinatorContact: formDataRef.current.coordinatorContact || '',
        partnerOrganization: formDataRef.current.partnerOrganization || '',
        maxParticipants: formDataRef.current.maxParticipants || null,
        referralDestinationType: formDataRef.current.referralDestinationType || '',
        referralFacilityName: formDataRef.current.referralFacilityName || '',
        referralFacilityAddress: formDataRef.current.referralFacilityAddress || '',
        assignedBhws: validBhws.map(b => ({
          bhwId: b.bhwId,
          id: b.bhwId,
          name: b.name,
          contactNumber: b.contactNumber
        })),
        healthcareProfessionals: validHcps.map(h => ({
          hcpId: h.hcpId,
          id: h.hcpId,
          name: h.name,
          contact: h.contact
        }))
      }

      if (isEditing) await scheduleApi.update(id, dataToSend)
      else await scheduleApi.create(dataToSend)
      navigate('/schedules')
      dialog.toast(isEditing ? 'Schedule updated successfully.' : 'Schedule created successfully.', 'success')
    } catch (error) {
      dialog.error(
        error.response?.data?.message ||
          error.message ||
          'Failed to save schedule',
        'Unable to save schedule'
      )
    } finally {
      setLoading(false)
    }
  }

  const formResidentForTypes =
    residents.find(
      r => String(r.id) === String(formDataRef.current.residentId)
    ) || null
  const allowedFormTypesSf = getAllowedIndividualTypes(formResidentForTypes)

  if (fetching) return <SkeletonScheduleForm />

  return (
    <div className='animate-fade-in'>
      <div className='space-y-4 sm:space-y-6' key={formUpdateKey}>
      <button
        onClick={goBack}
        className='flex items-center space-x-2 text-white/75 hover:text-white text-sm'
      >
        <ArrowLeft className='w-4 h-4' />
        <span>Back to Schedules</span>
      </button>
      <h1 className='text-xl font-bold text-white'>
        {isEditing ? 'Edit Schedule' : 'New Schedule'}
      </h1>

      <form onSubmit={handleSubmit} className='space-y-5'>
        <div className='flex bg-white/10 rounded-xl p-1 border backdrop-blur-lg border-white/20'>
          {[
            { value: 'individual', label: 'Individual' },
            { value: 'purok', label: 'Per Purok' },
            { value: 'barangay', label: 'Barangay-wide' }
          ].map(s => (
            <button
              key={s.value}
              type='button'
              onClick={() => setScope(s.value)}
              className={`flex-1 py-2.5 sm:py-3 px-1 sm:px-3 rounded-[10px] text-xs sm:text-sm font-medium transition-all ${
                scope === s.value
                  ? 'bg-blue-500/40 text-white'
                  : 'text-white/85 hover:text-white/85'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope === 'individual' && (
          <>
            <GlassCard hover={false}>
              <div className='space-y-4'>
                <div className='relative'>
                  <label className='block text-xs text-white/65 mb-1'>
                    Resident *
                  </label>
                  <div className='relative'>
                    <input
                      value={residentSearch}
                      onChange={handleResidentChange}
                      onFocus={() => {
                        if (!openResidentDropdown) setOpenResidentDropdown(true)
                      }}
                      className='glass-input pr-8 text-sm'
                      placeholder='Type name or select resident...'
                    />
                    <ChevronDown
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
                        openResidentDropdown ? 'rotate-180' : ''
                      }`}
                      onClick={() =>
                        setOpenResidentDropdown(!openResidentDropdown)
                      }
                    />
                  </div>
                  {openResidentDropdown && (
                    <div
                      ref={residentDropdownRef}
                      className='absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl max-h-48 overflow-y-auto'
                    >
                      {optionsLoading ? (
                        <SkeletonDropdownOptions count={3} />
                      ) : (
                      [...residents]
                        .sort((a, b) => a.name?.localeCompare(b.name))
                        .filter(r => {
                          const s = residentSearch.toLowerCase()
                          return !s || r.name.toLowerCase().includes(s)
                        })
                        .map(r => (
                          <div
                            key={r.id}
                            onClick={() => selectResident(r)}
                            className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-white/10 ${
                              formDataRef.current.residentId === r.id
                                ? 'text-blue-300 bg-blue-500/10'
                                : 'text-white/85'
                            }`}
                          >
                            {r.name} · {formatAge(r.age, r.dateOfBirth)}, {r.gender} ·{' '}
                            {r.purok || 'No Purok'}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className='grid grid-cols-3 gap-3'>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Date *
                    </label>
                    <input
                      type='date'
                      name='date'
                      defaultValue={formDataRef.current.date}
                      onChange={e => {
                        formDataRef.current.date = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Time *
                    </label>
                    <input
                      type='time'
                      name='time'
                      defaultValue={formDataRef.current.time}
                      onChange={e => {
                        formDataRef.current.time = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div className='relative' ref={typeDropdownRef}>
                    <label className='block text-xs text-white/65 mb-1'>
                      Type *
                    </label>
                    <div className='relative'>
                      <input
                        ref={typeInputRef}
                        type='text'
                        defaultValue={formDataRef.current.type}
                        onChange={e => {
                          formDataRef.current.type = e.target.value
                          setShowTypeDropdown(true)
                        }}
                        onFocus={() => setShowTypeDropdown(true)}
                        className='glass-input pr-8 text-sm'
                        placeholder='Choose type...'
                        required
                      />
                      <ChevronDown
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
                          showTypeDropdown ? 'rotate-180' : ''
                        }`}
                        onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                      />
                    </div>
                    {showTypeDropdown && (
                      <div className='absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl overflow-hidden'>
                        {presetTypes
                          .filter(t => allowedFormTypesSf.includes(t))
                          .filter(
                            t =>
                              !formDataRef.current.type ||
                              t
                                .toLowerCase()
                                .includes(
                                  formDataRef.current.type.toLowerCase()
                                )
                          )
                          .map(type => (
                            <button
                              key={type}
                              type='button'
                              onClick={() => {
                                formDataRef.current.type = type
                                setShowTypeDropdown(false)
                                setFormUpdateKey(prev => prev + 1)
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                                formDataRef.current.type === type
                                  ? 'text-blue-300 bg-blue-500/10'
                                  : 'text-white/85'
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                {formDataRef.current.type === 'Referral' ? (
                  <div className='space-y-3'>
                    <GlassSelect
                      name='referralDestinationType'
                      value={formDataRef.current.referralDestinationType}
                      onChange={v => {
                        formDataRef.current.referralDestinationType = v
                        setFormUpdateKey(prev => prev + 1)
                      }}
                      options={[{ value: 'Hospital', label: 'Hospital' }, { value: 'Laboratory', label: 'Laboratory' }, { value: 'Clinic', label: 'Clinic' }, { value: 'Specialist', label: 'Specialist' }]}
                      placeholder='Facility Type'
                    />
                    <div>
                      <label className='block text-xs text-white/65 mb-1'>
                        Facility Name
                      </label>
                      <input
                        type='text'
                        defaultValue={formDataRef.current.referralFacilityName}
                        onChange={e => { formDataRef.current.referralFacilityName = e.target.value }}
                        className='glass-input text-sm'
                        placeholder='Facility name'
                      />
                    </div>
                    <div>
                      <label className='block text-xs text-white/65 mb-1'>
                        Facility Location
                      </label>
                      <input
                        type='text'
                        defaultValue={formDataRef.current.referralFacilityAddress}
                        onChange={e => { formDataRef.current.referralFacilityAddress = e.target.value }}
                        className='glass-input text-sm'
                        placeholder='Facility address'
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Service Location
                    </label>
                    <GlassSelect
                      name='checkupCategory'
                      value={formDataRef.current.checkupCategory}
                      onChange={v => {
                        formDataRef.current.checkupCategory = v
                        setFormUpdateKey(prev => prev + 1)
                      }}
                      options={serviceLocations.map(c => ({ value: c, label: c }))}
                    />
                  </div>
                )}
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Purpose
              </h3>
              <textarea
                name='purpose'
                defaultValue={formDataRef.current.purpose}
                onChange={e => {
                  formDataRef.current.purpose = e.target.value
                }}
                className='glass-textarea min-h-[80px] text-sm'
                rows='3'
                placeholder='Reason for visit...'
              />
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Location & Contact
              </h3>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Location Description
                  </label>
                  <input
                    type='text'
                    name='locationDescription'
                    defaultValue={formDataRef.current.locationDescription}
                    onChange={e => {
                      formDataRef.current.locationDescription = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='e.g., Near the basketball court'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Purok
                  </label>
                  <GlassSelect
                    name='locationPurok'
                    value={locationPurok}
                    onChange={v => {
                      formDataRef.current.locationPurok = v
                      setLocationPurok(v)
                      setFormUpdateKey(prev => prev + 1)
                    }}
                    placeholder='Select purok'
                    options={[
                      ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({ value: p.name, label: p.name }))
                    ]}
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Contact Person
                  </label>
                  <input
                    type='text'
                    name='contactPerson'
                    defaultValue={formDataRef.current.contactPerson}
                    onChange={e => {
                      formDataRef.current.contactPerson = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='Name'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Contact Number
                  </label>
                  <input
                    type='tel'
                    inputMode='tel'
                    maxLength={11}
                    onKeyDown={blockPhoneKeys}
                    name='contactNumber'
                    defaultValue={formDataRef.current.contactNumber}
                    onChange={e => {
                      const next = sanitizePhoneInput(e.target.value)
                      e.target.value = next
                      formDataRef.current.contactNumber = next
                    }}
                    className='glass-input text-sm'
                    placeholder='Phone'
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Healthcare Professionals
                </h3>
                <button
                  type='button'
                  onClick={addHealthcareProfessional}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.healthcareProfessionals.map(
                  (hp, index) => (
                    <HCPInput
                      key={hcpKeys[index] || `hcp-${index}`}
                      index={index}
                      hp={hp}
                      formDataRef={formDataRef}
                      healthcareProfessionalsList={healthcareProfessionalsList}
                      onRemove={() => removeHealthcareProfessional(index)}
                    />
                  )
                )}
                {formDataRef.current.healthcareProfessionals.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>

            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Assigned BHWs
                </h3>
                <button
                  type='button'
                  onClick={addBHW}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.assignedBhws.map((bhw, index) => (
                  <BHWInput
                    key={bhwKeys[index] || `bhw-${index}`}
                    index={index}
                    bhw={bhw}
                    formDataRef={formDataRef}
                    bhwWorkers={bhwWorkers}
                    onRemove={() => removeBHW(index)}
                  />
                ))}
                {formDataRef.current.assignedBhws.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>

            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Additional Information
              </h3>
              <textarea
                name='additionalInfo'
                defaultValue={formDataRef.current.additionalInfo}
                onChange={e => {
                  formDataRef.current.additionalInfo = e.target.value
                }}
                className='glass-textarea min-h-[80px] text-sm'
                rows='3'
                placeholder='Requirements, preparation instructions, or any other notes...'
              />
            </GlassCard>
          </>
        )}

        {scope === 'purok' && (
          <>
            <GlassCard hover={false}>
              <div className='space-y-4'>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Program Name *
                    </label>
                    <input
                      type='text'
                      name='programName'
                      defaultValue={formDataRef.current.programName}
                      onChange={e => {
                        formDataRef.current.programName = e.target.value
                      }}
                      className='glass-input text-sm'
                      placeholder='e.g., Purok Kalusugan'
                      required
                    />
                  </div>
                  <div>
                    {optionsLoading ? (
                      <SkeletonSelectField labelWidth='w-20' />
                    ) : (
                    <>
                    <label className='block text-xs text-white/65 mb-1'>
                      Purok *
                    </label>
                    <GlassSelect
                      name='purokId'
                      value={formDataRef.current.purokId}
                      allowCustom
                      placeholder='Select purok...'
                      onChange={v => {
                        formDataRef.current.purokId = v
                        const p = puroks.find(
                          x => x.id === parseInt(v)
                        )
                        if (p)
                          formDataRef.current.venue = `${p.name} Covered Court / Plaza`
                        setFormUpdateKey(prev => prev + 1)
                      }}
                      options={[
                        ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => ({
                          value: String(p.id),
                          label: `${p.name} · ${p.totalResidents || 0} residents`
                        }))
                      ]}
                      required
                    />
                    </>
                    )}
                  </div>
                </div>
                <div className='grid grid-cols-3 gap-3'>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Date *
                    </label>
                    <input
                      type='date'
                      name='date'
                      defaultValue={formDataRef.current.date}
                      onChange={e => {
                        formDataRef.current.date = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Time *
                    </label>
                    <input
                      type='time'
                      name='time'
                      defaultValue={formDataRef.current.time}
                      onChange={e => {
                        formDataRef.current.time = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Duration (hour/s)
                    </label>
                    <input
                      type='number'
                      name='duration'
                      defaultValue={formDataRef.current.duration}
                      onChange={e => {
                        formDataRef.current.duration = e.target.value
                      }}
                      className='glass-input text-sm'
                      min='1'
                      step='0.5'
                      inputMode='decimal'
                      onKeyDown={blockNumericKeys}
                      placeholder='e.g., 4'
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Purpose & Description
              </h3>
              <textarea
                name='programDescription'
                defaultValue={formDataRef.current.programDescription}
                onChange={e => {
                  formDataRef.current.programDescription = e.target.value
                }}
                className='glass-textarea min-h-[100px] text-sm'
                rows='4'
                placeholder='Describe the program purpose, objectives, and activities...'
              />
            </GlassCard>
            <GlassCard hover={false}>
              <div className='grid grid-cols-3 gap-3'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Venue
                  </label>
                  <input
                    type='text'
                    name='venue'
                    defaultValue={formDataRef.current.venue}
                    onChange={e => {
                      formDataRef.current.venue = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='Location'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Target Group
                  </label>
                  <GlassSelect
                    name='targetGroup'
                    value={formDataRef.current.targetGroup}
                    onChange={v => {
                      formDataRef.current.targetGroup = v
                      setFormUpdateKey(prev => prev + 1)
                    }}
                    options={targetGroups.map(g => ({ value: g, label: g }))}
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Target Count
                  </label>
                  <input
                    type='number'
                    name='targetCount'
                    defaultValue={formDataRef.current.targetCount}
                    onChange={e => {
                      formDataRef.current.targetCount = e.target.value
                    }}
                    className='glass-input text-sm'
                    inputMode='numeric'
                    min='1'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    placeholder='Expected'
                  />
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Coordinator Name
                  </label>
                  <input
                    type='text'
                    name='coordinatorName'
                    defaultValue={formDataRef.current.coordinatorName}
                    onChange={e => {
                      formDataRef.current.coordinatorName = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='Coordinator name'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Coordinator Contact
                  </label>
                  <input
                    type='tel'
                    inputMode='tel'
                    maxLength={11}
                    onKeyDown={blockPhoneKeys}
                    name='coordinatorContact'
                    defaultValue={formDataRef.current.coordinatorContact}
                    onChange={e => {
                      const next = sanitizePhoneInput(e.target.value)
                      e.target.value = next
                      formDataRef.current.coordinatorContact = next
                    }}
                    className='glass-input text-sm'
                    placeholder='Phone'
                  />
                </div>
                <div className='col-span-2'>
                  <label className='block text-xs text-white/65 mb-1'>
                    Partner Organization
                  </label>
                  <input
                    type='text'
                    name='partnerOrganization'
                    defaultValue={formDataRef.current.partnerOrganization}
                    onChange={e => {
                      formDataRef.current.partnerOrganization = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='e.g., DOH, Red Cross'
                  />
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Healthcare Professionals
                </h3>
                <button
                  type='button'
                  onClick={addHealthcareProfessional}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.healthcareProfessionals.map(
                  (hp, index) => (
                    <HCPInput
                      key={hcpKeys[index] || `hcp-${index}`}
                      index={index}
                      hp={hp}
                      formDataRef={formDataRef}
                      healthcareProfessionalsList={healthcareProfessionalsList}
                      onRemove={() => removeHealthcareProfessional(index)}
                    />
                  )
                )}
                {formDataRef.current.healthcareProfessionals.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Assigned BHWs
                </h3>
                <button
                  type='button'
                  onClick={addBHW}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.assignedBhws.map((bhw, index) => (
                  <BHWInput
                    key={bhwKeys[index] || `bhw-${index}`}
                    index={index}
                    bhw={bhw}
                    formDataRef={formDataRef}
                    bhwWorkers={bhwWorkers}
                    onRemove={() => removeBHW(index)}
                  />
                ))}
                {formDataRef.current.assignedBhws.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Additional Information
              </h3>
              <textarea
                name='additionalInfo'
                defaultValue={formDataRef.current.additionalInfo}
                onChange={e => {
                  formDataRef.current.additionalInfo = e.target.value
                }}
                className='glass-textarea min-h-[80px] text-sm'
                rows='3'
                placeholder='Requirements, preparation instructions, or any other notes...'
              />
            </GlassCard>
          </>
        )}

        {scope === 'barangay' && (
          <>
            <GlassCard hover={false}>
              <div className='space-y-4'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Program Name *
                  </label>
                  <input
                    type='text'
                    name='programName'
                    defaultValue={formDataRef.current.programName}
                    onChange={e => {
                      formDataRef.current.programName = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='e.g., Barangay Kalusugan'
                    required
                  />
                </div>
                <div className='grid grid-cols-3 gap-3'>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Date *
                    </label>
                    <input
                      type='date'
                      name='date'
                      defaultValue={formDataRef.current.date}
                      onChange={e => {
                        formDataRef.current.date = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Time *
                    </label>
                    <input
                      type='time'
                      name='time'
                      defaultValue={formDataRef.current.time}
                      onChange={e => {
                        formDataRef.current.time = e.target.value
                      }}
                      className='glass-input text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-white/65 mb-1'>
                      Duration (hour/s)
                    </label>
                    <input
                      type='number'
                      name='duration'
                      defaultValue={formDataRef.current.duration}
                      onChange={e => {
                        formDataRef.current.duration = e.target.value
                      }}
                      className='glass-input text-sm'
                      min='1'
                      step='0.5'
                      inputMode='decimal'
                      onKeyDown={blockNumericKeys}
                      placeholder='e.g., 8'
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Purpose & Description
              </h3>
              <textarea
                name='programDescription'
                defaultValue={formDataRef.current.programDescription}
                onChange={e => {
                  formDataRef.current.programDescription = e.target.value
                }}
                className='glass-textarea min-h-[100px] text-sm'
                rows='4'
                placeholder='Describe the program purpose, objectives, and activities...'
              />
            </GlassCard>
            <GlassCard hover={false}>
              <div className='grid grid-cols-3 gap-3'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Venue
                  </label>
                  <input
                    type='text'
                    name='venue'
                    defaultValue={formDataRef.current.venue}
                    onChange={e => {
                      formDataRef.current.venue = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='Location'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Target Group
                  </label>
                  <GlassSelect
                    name='targetGroup'
                    value={formDataRef.current.targetGroup}
                    onChange={v => {
                      formDataRef.current.targetGroup = v
                      setFormUpdateKey(prev => prev + 1)
                    }}
                    options={targetGroups.map(g => ({ value: g, label: g }))}
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Target Count
                  </label>
                  <input
                    type='number'
                    name='targetCount'
                    defaultValue={formDataRef.current.targetCount}
                    onChange={e => {
                      formDataRef.current.targetCount = e.target.value
                    }}
                    className='glass-input text-sm'
                    inputMode='numeric'
                    min='1'
                    step='1'
                    onKeyDown={blockIntegerKeys}
                    placeholder='Expected'
                  />
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Coordinator Name
                  </label>
                  <input
                    type='text'
                    name='coordinatorName'
                    defaultValue={formDataRef.current.coordinatorName}
                    onChange={e => {
                      formDataRef.current.coordinatorName = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='Coordinator name'
                  />
                </div>
                <div>
                  <label className='block text-xs text-white/65 mb-1'>
                    Coordinator Contact
                  </label>
                  <input
                    type='tel'
                    inputMode='tel'
                    maxLength={11}
                    onKeyDown={blockPhoneKeys}
                    name='coordinatorContact'
                    defaultValue={formDataRef.current.coordinatorContact}
                    onChange={e => {
                      const next = sanitizePhoneInput(e.target.value)
                      e.target.value = next
                      formDataRef.current.coordinatorContact = next
                    }}
                    className='glass-input text-sm'
                    placeholder='Phone'
                  />
                </div>
                <div className='col-span-2'>
                  <label className='block text-xs text-white/65 mb-1'>
                    Partner Organization
                  </label>
                  <input
                    type='text'
                    name='partnerOrganization'
                    defaultValue={formDataRef.current.partnerOrganization}
                    onChange={e => {
                      formDataRef.current.partnerOrganization = e.target.value
                    }}
                    className='glass-input text-sm'
                    placeholder='e.g., DOH, Red Cross'
                  />
                </div>
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Healthcare Professionals
                </h3>
                <button
                  type='button'
                  onClick={addHealthcareProfessional}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.healthcareProfessionals.map(
                  (hp, index) => (
                    <HCPInput
                      key={hcpKeys[index] || `hcp-${index}`}
                      index={index}
                      hp={hp}
                      formDataRef={formDataRef}
                      healthcareProfessionalsList={healthcareProfessionalsList}
                      onRemove={() => removeHealthcareProfessional(index)}
                    />
                  )
                )}
                {formDataRef.current.healthcareProfessionals.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-base font-medium text-white/75'>
                  Assigned BHWs
                </h3>
                <button
                  type='button'
                  onClick={addBHW}
                  className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                >
                  <Plus className='w-3.5 h-3.5' />
                  Add
                </button>
              </div>
              <div className='space-y-2'>
                {formDataRef.current.assignedBhws.map((bhw, index) => (
                  <BHWInput
                    key={bhwKeys[index] || `bhw-${index}`}
                    index={index}
                    bhw={bhw}
                    formDataRef={formDataRef}
                    bhwWorkers={bhwWorkers}
                    onRemove={() => removeBHW(index)}
                  />
                ))}
                {formDataRef.current.assignedBhws.length === 0 && (
                  <p className='text-sm text-white/65 text-center py-4'>
                    None assigned
                  </p>
                )}
              </div>
            </GlassCard>
            <GlassCard hover={false}>
              <h3 className='text-base font-medium text-white/75 mb-3'>
                Additional Information
              </h3>
              <textarea
                name='additionalInfo'
                defaultValue={formDataRef.current.additionalInfo}
                onChange={e => {
                  formDataRef.current.additionalInfo = e.target.value
                }}
                className='glass-textarea min-h-[80px] text-sm'
                rows='3'
                placeholder='Requirements, preparation instructions, or any other notes...'
              />
            </GlassCard>
          </>
        )}

        <div className='flex justify-end gap-3'>
          <GlassButton
            variant='secondary'
            type='button'
            onClick={goBack}
          >
            Cancel
          </GlassButton>
          <GlassButton type='submit' loading={loading}>
            {isEditing ? 'Update' : 'Create'}{' '}
            {scope === 'individual' ? 'Appointment' : 'Program'}
          </GlassButton>
        </div>
      </form>
      </div>
    </div>
  )
}

// HCP Input Component
const HCPInput = ({
  index,
  hp,
  formDataRef,
  healthcareProfessionalsList,
  onRemove
}) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchTerm, setSearchTerm] = useState(hp.name || '')
  const [contact, setContact] = useState(hp.contact || '')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const selectedHcpIds = formDataRef.current.healthcareProfessionals
    .filter((_, i) => i !== index)
    .map(h => h.hcpId)
    .filter(id => id)

  const activeHCPs = healthcareProfessionalsList.filter(
    h => h.status === 'Active' && !selectedHcpIds.includes(h.id)
  )

  const filtered = !searchTerm
    ? activeHCPs
    : activeHCPs.filter(h =>
        h.name.toLowerCase().includes(searchTerm.toLowerCase())
      )

  const handleSelect = hcp => {
    setSearchTerm(hcp.name)
    setContact(hcp.contactNumber || hcp.contact_number || '')
    formDataRef.current.healthcareProfessionals[index] = {
      hcpId: hcp.id,
      name: hcp.name,
      contact: hcp.contactNumber || hcp.contact_number || ''
    }
    setShowDropdown(false)
  }

  return (
    <div className='flex items-center gap-2'>
      <div className='relative flex-1' ref={dropdownRef}>
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value)
            formDataRef.current.healthcareProfessionals[index] = {
              ...formDataRef.current.healthcareProfessionals[index],
              name: e.target.value,
              hcpId: ''
            }
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          className='glass-input pr-8 text-sm'
          placeholder='Type name or select...'
        />
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
            showDropdown ? 'rotate-180' : ''
          }`}
          onClick={() => setShowDropdown(!showDropdown)}
        />
        {showDropdown && filtered.length > 0 && (
          <div className='absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl max-h-36 overflow-y-auto'>
            {filtered.map(h => (
              <div
                key={h.id}
                onClick={() => handleSelect(h)}
                className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-white/10 ${
                  hp.hcpId === h.id
                    ? 'text-blue-300 bg-blue-500/10'
                    : 'text-white/85'
                }`}
              >
                {h.name} · {h.position}
              </div>
            ))}
          </div>
        )}
      </div>
      <input
        type='tel'
        inputMode='tel'
        maxLength={11}
        onKeyDown={blockPhoneKeys}
        value={contact}
        onChange={e => {
          const next = sanitizePhoneInput(e.target.value)
          setContact(next)
          formDataRef.current.healthcareProfessionals[index].contact = next
        }}
        className='glass-input w-40 text-sm'
        placeholder='Contact no.'
      />
      <button
        type='button'
        onClick={onRemove}
        className='text-white/65 hover:text-red-400 flex-shrink-0'
      >
        <X className='w-3.5 h-3.5' />
      </button>
    </div>
  )
}

// BHW Input Component
const BHWInput = ({ index, bhw, formDataRef, bhwWorkers, onRemove }) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchTerm, setSearchTerm] = useState(bhw.name || '')
  const [contactNumber, setContactNumber] = useState(bhw.contactNumber || '')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const selectedBhwIds = formDataRef.current.assignedBhws
    .filter((_, i) => i !== index)
    .map(b => b.bhwId)
    .filter(id => id)

  const activeBHWs = bhwWorkers.filter(
    b => b.status === 'Active' && !selectedBhwIds.includes(b.id)
  )

  const filtered = !searchTerm
    ? activeBHWs
    : activeBHWs.filter(b =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
      )

  const handleSelect = worker => {
    setSearchTerm(worker.name)
    setContactNumber(worker.contactNumber || worker.contact_number || '')
    formDataRef.current.assignedBhws[index] = {
      bhwId: worker.id,
      name: worker.name,
      contactNumber: worker.contactNumber || worker.contact_number || ''
    }
    setShowDropdown(false)
  }

  return (
    <div className='flex items-center gap-2'>
      <div className='relative flex-1' ref={dropdownRef}>
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value)
            formDataRef.current.assignedBhws[index] = {
              ...formDataRef.current.assignedBhws[index],
              name: e.target.value,
              bhwId: ''
            }
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          className='glass-input pr-8 text-sm'
          placeholder='Type name or select...'
        />
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
            showDropdown ? 'rotate-180' : ''
          }`}
          onClick={() => setShowDropdown(!showDropdown)}
        />
        {showDropdown && filtered.length > 0 && (
          <div className='absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl max-h-36 overflow-y-auto'>
            {filtered.map(b => (
              <div
                key={b.id}
                onClick={() => handleSelect(b)}
                className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-white/10 ${
                  bhw.bhwId === b.id
                    ? 'text-blue-300 bg-blue-500/10'
                    : 'text-white/85'
                }`}
              >
                {b.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <input
        type='tel'
        inputMode='tel'
        maxLength={11}
        onKeyDown={blockPhoneKeys}
        value={contactNumber}
        onChange={e => {
          const next = sanitizePhoneInput(e.target.value)
          setContactNumber(next)
          formDataRef.current.assignedBhws[index].contactNumber = next
        }}
        className='glass-input w-40 text-sm'
        placeholder='Contact no.'
      />
      <button
        type='button'
        onClick={onRemove}
        className='text-white/65 hover:text-red-400 flex-shrink-0'
      >
        <X className='w-3.5 h-3.5' />
      </button>
    </div>
  )
}

export default ScheduleForm