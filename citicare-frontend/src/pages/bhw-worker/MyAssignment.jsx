// pages/bhw-worker/MyAssignment.jsx
// Assigned purok card + focus group card + own personal information
// (view/edit name, contact number, email, username, password).
import { useState, useEffect } from 'react'
import { User, Pencil, Save, X, Lock, Eye, EyeOff } from 'lucide-react'
import { bhwApi } from '../../api/bhwApi'
import { useAuth } from '../../context/AuthContext'
import GlassCard from '../../components/GlassCard'
import GlassButton from '../../components/GlassButton'
import GlassInput from '../../components/GlassInput'
import { getStatusColor } from '../../utils/helpers'
import { SkeletonMyAssignmentPage } from '../../components/Skeleton'
import { dialog } from '../../context/DialogContext'
import { confirmUpdate } from '../../utils/crudConfirm'
import { sanitizePhoneInput, blockPhoneKeys } from '../../utils/validation'
import { focusFirstError } from '../../utils/focusInvalidField'

const FOCUS_LABELS = {
  pregnant: 'Pregnant Women',
  senior: 'Senior Citizens (60+)',
  infant: 'Infants (0-59 months)'
}

const MyAssignment = () => {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', contactNumber: '', email: '', username: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => { fetchMe() }, [])

  const fetchMe = async () => {
    try {
      setLoading(true)
      const res = await bhwApi.getMe()
      if (res.data.success) {
        setProfile(res.data.data)
        setForm({
          name: res.data.data.name || '',
          contactNumber: res.data.data.contactNumber || '',
          email: res.data.data.email || '',
          username: res.data.data.username || '',
          password: '',
          confirmPassword: ''
        })
      }
    } catch (err) {
      console.error('My assignment error:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateField = (name, value) => {
    setForm(previous => ({ ...previous, [name]: value }))
    if (errors[name]) setErrors(previous => ({ ...previous, [name]: '' }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const formElement = e.currentTarget
    const nextErrors = {}
    if (!form.name) nextErrors.name = 'Name is required.'
    if (form.username && form.username.length < 3) nextErrors.username = 'Username must be at least 3 characters.'
    if (form.password && form.password.length < 6) nextErrors.password = 'Password must be at least 6 characters.'
    if (form.password && form.password !== form.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      focusFirstError(nextErrors, formElement)
      return
    }
    setErrors({})
    const confirmed = await confirmUpdate('profile', 'Please confirm that you want to save the changes to your information.')
    if (!confirmed) return
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        contactNumber: form.contactNumber,
        email: form.email
      }
      if (form.username) payload.username = form.username
      if (form.password) payload.password = form.password
      await bhwApi.update(profile.id, payload)
      setEditing(false)
      fetchMe()
      dialog.toast('Your information was updated successfully.', 'success')
    } catch (err) {
      dialog.error(err.response?.data?.message || 'Failed to update information', 'Unable to update information')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SkeletonMyAssignmentPage />
  }

  if (!profile) {
    return (
      <GlassCard hover={false} className='text-center py-12'>
        <User className='w-10 h-10 text-white/40 mx-auto mb-3' />
        <p className='text-white/65 text-sm'>Could not load your profile.</p>
      </GlassCard>
    )
  }

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='pl-1'>
        <h1 className='text-2xl font-bold text-white'>My profile</h1>
      </div>

      <GlassCard hover={false}>
        <div className='flex items-center justify-between mb-2'>
          <h2 className='text-base sm:text-lg font-semibold text-white flex items-center gap-2'>
            <User className='w-5 h-5 text-blue-300' /> Personal Information
          </h2>
          {!editing && (
            <GlassButton variant='secondary' icon={Pencil} title='Edit' aria-label='Edit profile' className='!bg-transparent !border-0' onClick={() => { setErrors({}); setEditing(true) }} />
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className='space-y-4 [&_.glass-input]:!border-0'>
            <GlassInput label='Full Name *' name='name' error={errors.name} value={form.name} onChange={e => updateField('name', e.target.value)} required />
            <GlassInput label='Position' value={profile.position || ''} disabled title='Only the administrator can change this' placeholder='Position' />
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <GlassInput label='Contact Number' name='contactNumber' error={errors.contactNumber} type='tel' inputMode='tel' maxLength={11} onKeyDown={blockPhoneKeys} value={form.contactNumber} onChange={e => updateField('contactNumber', sanitizePhoneInput(e.target.value))} placeholder='Phone' />
              <GlassInput label='Email' name='email' error={errors.email} value={form.email} onChange={e => updateField('email', e.target.value)} placeholder='Email' />
            </div>
            <div className='border-t border-white/10 pt-4'>
              <p className='text-xs uppercase tracking-wider text-white/55 mb-3 flex items-center gap-1.5'>
                <Lock className='w-3.5 h-3.5' /> Login Credentials
              </p>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <GlassInput label='Username' name='username' error={errors.username} value={form.username} onChange={e => updateField('username', e.target.value)} placeholder='Username (min 3 characters)' />
                <GlassInput label='Account Role' value={user?.role || ''} disabled title='Only the administrator can change this' placeholder='Role' />
                <div className='relative sm:col-span-2'>
                  <GlassInput label='New Password' name='password' error={errors.password} type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => updateField('password', e.target.value)} placeholder='Leave blank to keep current' />
                  <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-[38px] text-white/50 hover:text-white/80'>
                    {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                  </button>
                </div>
              </div>
              {form.password ? (
                <div className='mt-3'>
                  <GlassInput label='Confirm Password' name='confirmPassword' error={errors.confirmPassword} type='password' value={form.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} placeholder='Confirm password' />
                </div>
              ) : (
                <div className='mt-3'>
                  <GlassInput label='Confirm Password' type='password' value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} placeholder='Confirm password' disabled title='Enter a new password first' className='opacity-60' />
                </div>
              )}
            </div>
            <p className='text-xs text-white/50'>Position, assigned purok, and focus/vulnerable group can only be changed by the administrator.</p>
            <div className='flex justify-end gap-2'>
              <GlassButton
                variant='secondary' type='button' icon={X}
                onClick={() => {
                  setEditing(false)
                  setShowPassword(false)
                  setErrors({})
                  setForm({ name: profile.name || '', contactNumber: profile.contactNumber || '', email: profile.email || '', username: profile.username || '', password: '', confirmPassword: '' })
                }}
              >
                Cancel
              </GlassButton>
              <GlassButton type='submit' loading={saving} icon={Save}>Save</GlassButton>
            </div>
          </form>
        ) : (
          <>
            {/* Personal Information */}
            <div className='mb-4 space-y-3'>
              <div className='grid grid-cols-1 gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Full Name</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.name || '—'}</p>
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-1 gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Position</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.position || '—'}</p>
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Contact Number</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.contactNumber || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Email</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium truncate'>{profile.email || '—'}</p>
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Assigned Purok</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.assignedPurok || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Assigned Focus Group</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.assignedFocusGroup ? (FOCUS_LABELS[profile.assignedFocusGroup] || profile.assignedFocusGroup) : '—'}</p>
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Username</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p className='text-white font-medium'>{profile.username || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className='text-[11px] uppercase tracking-wide text-white/50'>Status</p>
                  <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                    <p><span className={`badge ${getStatusColor(profile.status)}`}>{profile.status}</span></p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  )
}

export default MyAssignment
