import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { bhwApi } from '../api/bhwApi';
import { purokApi } from '../api/purokApi';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';
import GlassSelect from '../components/GlassSelect';
import { SkeletonBHWForm, SkeletonSelectField } from '../components/Skeleton';
import { useSmartBack } from '../utils/navigation';
import { dialog } from '../context/DialogContext';
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm';
import { focusFirstError } from '../utils/focusInvalidField';
import { sanitizePhoneInput, blockPhoneKeys } from '../utils/validation';
const BHWForm = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const goBack = useSmartBack('/bhw');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [puroks, setPuroks] = useState([]);
  const [puroksLoading, setPuroksLoading] = useState(false);
  const [allBHWs, setAllBHWs] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const positionDropdownRef = useRef(null);
  const positionInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    position: '',
    contactNumber: '',
    email: '',
    status: 'Active',
    assignedPurokId: '',
    assignedFocusGroup: '',
    username: '',
    password: '',
    confirmPassword: '',
    accountRole: 'BHW Worker',
  });

  const [errors, setErrors] = useState({});

  const positionPresets = [
    { label: 'Barangay Health Worker', type: 'BHW', accountRole: 'BHW Worker' },
    { label: 'Barangay Health Worker Head', type: 'BHW', accountRole: 'BHW Admin' },
    { label: 'Doctor', type: 'Doctor', accountRole: null },
    { label: 'Midwife', type: 'Midwife', accountRole: null },
    { label: 'Nurse', type: 'Nurse', accountRole: null },
  ];

  // Use direct check instead of debounced for layout stability
  const isBHW = formData.position === 'Barangay Health Worker' || formData.position === 'Barangay Health Worker Head';
  const isBHWWorker = formData.position === 'Barangay Health Worker';
  const isBHWHead = formData.position === 'Barangay Health Worker Head';

  const FOCUS_GROUP_OPTIONS = [
    { value: 'infant', label: 'Infants (0-59 months)' },
    { value: 'pregnant', label: 'Pregnant' },
    { value: 'senior', label: 'Senior Citizen (60+)' },
  ];

  const FOCUS_GROUP_LABELS = {
    pregnant: 'Pregnant',
    senior: 'Senior Citizen',
    infant: 'Infants',
  };

  // Groups already held by another BHW can't be picked again.
  const focusGroupHolders = {};
  for (const b of allBHWs) {
    if (b.assignedFocusGroup && String(b.id) !== String(id)) {
      focusGroupHolders[b.assignedFocusGroup] = b.name || 'another BHW';
    }
  }

  const focusGroupOptions = [
    { value: '', label: 'None' },
    ...FOCUS_GROUP_OPTIONS.map(o => {
      const holder = focusGroupHolders[o.value];
      const taken = !!holder && formData.assignedFocusGroup !== o.value;
      return {
        ...o,
        label: taken ? `${o.label} — assigned to ${holder}` : o.label,
        disabled: taken,
      };
    }),
  ];

  // Puroks already assigned to another BHW show the holder and can't be
  // picked again (this record's own purok stays selectable when editing).
  const assignedPurokHolders = (() => {
    const nameToId = {};
    for (const p of puroks) nameToId[p.name] = p.id;
    const acc = {};
    for (const b of allBHWs) {
      if (String(b.id) === String(id)) continue;
      const pid = b.assignedPurokId || nameToId[b.assignedPurok];
      if (pid) acc[String(pid)] = b.name || 'another BHW';
    }
    return acc;
  })();

  const assignedPurokOptions = [
    { value: '', label: 'None' },
    ...[...puroks].sort((a, b) => a.name?.localeCompare(b.name)).map(p => {
      const holder = assignedPurokHolders[String(p.id)];
      const taken = !!holder && String(formData.assignedPurokId) !== String(p.id);
      return {
        value: String(p.id),
        label: taken ? `${p.name} — assigned to ${holder}` : p.name,
        disabled: taken,
      };
    }),
  ];

  const filteredPositions = formData.position
    ? positionPresets.filter(p => p.label.toLowerCase().includes(formData.position.toLowerCase()))
    : positionPresets;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (positionDropdownRef.current && !positionDropdownRef.current.contains(e.target) &&
          positionInputRef.current && !positionInputRef.current.contains(e.target)) {
        setShowPositionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isBHW) fetchPuroks();
    fetchAllBHWs();
    if (isEditing) fetchBHW();
  }, [id]);

  const fetchPuroks = async () => {
    setPuroksLoading(true);
    try {
      const response = await purokApi.getAll();
      if (response.data.success) setPuroks(response.data.data);
    } catch (error) { console.error('Error:', error); }
    finally { setPuroksLoading(false); }
  };

  const fetchAllBHWs = async () => {
    try {
      const response = await bhwApi.getAll();
      if (response.data.success) setAllBHWs(response.data.data);
    } catch (error) { console.error('Error:', error); }
  };

  const fetchBHW = async () => {
    try {
      const response = await bhwApi.getById(id);
      if (response.data.success) {
        const d = response.data.data;
        if (d.workerType === 'BHW') fetchPuroks();
        setFormData({
          name: d.name || '',
          position: d.position || '',
          contactNumber: d.contactNumber || '',
          email: d.email || '',
          status: d.status || 'Active',
          assignedPurokId: d.assignedPurokId || '',
          assignedFocusGroup: d.assignedFocusGroup || '',
          username: d.username || '',
          password: '',
          confirmPassword: '',
          accountRole: d.position === 'Barangay Health Worker Head' ? 'BHW Admin' : 'BHW Worker',
        });
      }
    } catch (error) { console.error('Error:', error); } 
    finally { setFetching(false); }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'contactNumber' ? sanitizePhoneInput(value) : value;
    setFormData(prev => {
      const updated = { ...prev, [name]: nextValue };
      
      // Auto-set account role when position changes by typing
      if (name === 'position') {
        const preset = positionPresets.find(p => p.label.toLowerCase() === value.toLowerCase());
        if (preset?.accountRole) {
          updated.accountRole = preset.accountRole;
        }
        // Clear fields when switching away from BHW Worker
        if (value !== 'Barangay Health Worker') {
          updated.assignedPurokId = '';
        }
        // Clear credentials + focus group when switching away from BHW entirely
        if (value !== 'Barangay Health Worker' && value !== 'Barangay Health Worker Head') {
          updated.username = '';
          updated.password = '';
          updated.confirmPassword = '';
          updated.assignedFocusGroup = '';
        }
      }
      
      return updated;
    });
    
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handlePositionSelect = (position) => {
    const preset = positionPresets.find(p => p.label === position);
    
    setFormData(prev => {
      const updated = { ...prev, position };
      
      if (preset?.accountRole) {
        updated.accountRole = preset.accountRole;
      }
      
      // Only BHW Worker gets assigned purok
      if (position !== 'Barangay Health Worker') {
        updated.assignedPurokId = '';
      }

      // Only BHW types get credentials + focus group
      if (position !== 'Barangay Health Worker' && position !== 'Barangay Health Worker Head') {
        updated.username = '';
        updated.password = '';
        updated.confirmPassword = '';
        updated.assignedFocusGroup = '';
      }
      return updated;
    });
    setShowPositionDropdown(false);
  };

  const handlePositionInputChange = (e) => {
    setFormData(prev => ({ ...prev, position: e.target.value }));
    setShowPositionDropdown(true);
  };

  const getWorkerType = (position) => {
    const preset = positionPresets.find(p => p.label === position);
    return preset?.type || 'Other';
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.position) newErrors.position = 'Position is required';
    if (isBHW && formData.assignedPurokId && !puroks.some(p => String(p.id) === String(formData.assignedPurokId))) newErrors.assignedPurokId = 'Please select a valid purok from the list';
    
    if (isBHW) {
      if (formData.username || formData.password || formData.confirmPassword) {
        if (!formData.username) newErrors.username = 'Username is required';
        else if (formData.username.length < 3) newErrors.username = 'Min 3 characters';
        if (!isEditing && !formData.password) newErrors.password = 'Password is required';
        else if (formData.password && formData.password.length < 6) newErrors.password = 'Min 6 characters';
        if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    return newErrors;
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormData(prev => ({ ...prev, password, confirmPassword: password }));
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors, form);
      return;
    }
    if (isBHW && formData.assignedFocusGroup) {
      const holder = focusGroupHolders[formData.assignedFocusGroup];
      if (holder) {
        dialog.error(`${FOCUS_GROUP_LABELS[formData.assignedFocusGroup] || formData.assignedFocusGroup} is already assigned to ${holder}. Each focus group can only have one BHW.`, 'Focus group already assigned');
        return;
      }
    }

    const confirmed = isEditing
      ? await confirmUpdate('health worker', `Please confirm that you want to save the changes to ${formData.name}.`)
      : await confirmCreate('health worker', `Please confirm that you want to add ${formData.name} as a health worker.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const workerType = getWorkerType(formData.position);

      const dataToSend = {
        name: formData.name,
        position: formData.position,
        contactNumber: formData.contactNumber,
        email: formData.email,
        status: formData.status,
        workerType: workerType,
        accountRole: formData.accountRole,
        assignedPurokId: isBHWWorker ? (formData.assignedPurokId || null) : null,
        assignedFocusGroup: isBHW ? (formData.assignedFocusGroup || null) : null,
      };

      if (isBHW) {
        const trimmedUsername = (formData.username || '').trim();
        if (trimmedUsername || formData.password) {
          dataToSend.username = trimmedUsername;
          if (formData.password) dataToSend.password = formData.password;
        }
      }

      if (isEditing) {
        await bhwApi.update(id, dataToSend);
      } else {
        await bhwApi.create(dataToSend);
      }
      navigate('/bhw');
      dialog.toast(isEditing ? 'Healthcare professional updated successfully.' : 'Healthcare professional added successfully.', 'success');
    } catch (error) {
      dialog.error(error.response?.data?.message || 'Failed to save', 'Unable to save');
    } finally { setLoading(false); }
  };

  if (fetching) return <SkeletonBHWForm />;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <button onClick={goBack} className="flex items-center space-x-2 text-white/75 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /><span>Back</span>
      </button>
      <h1 className="text-xl font-bold text-white">{isEditing ? 'Edit' : 'Add'} Healthcare Professional</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Professional Information */}
        <GlassCard hover={false}>
          <h3 className="text-base font-medium text-white/75 mb-3">Professional Information</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/65 mb-1">Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="glass-input text-sm" placeholder="Full name" required />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
              </div>
              <div className="relative" ref={positionDropdownRef}>
                <label className="block text-xs text-white/65 mb-1">Position *</label>
                <div className="relative">
                  <input
                    ref={positionInputRef}
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handlePositionInputChange}
                    onFocus={() => setShowPositionDropdown(true)}
                    className="glass-input pr-8 text-sm"
                    placeholder="Search or type position..."
                    required
                  />
                  <ChevronDown 
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${showPositionDropdown ? 'rotate-180' : ''}`}
                    onClick={() => setShowPositionDropdown(!showPositionDropdown)}
                  />
                </div>
                {errors.position && <p className="text-xs text-red-400 mt-1">{errors.position}</p>}
                
                {showPositionDropdown && filteredPositions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                    {filteredPositions.map((pos) => (
                      <button
                        key={pos.label}
                        type="button"
                        onClick={() => handlePositionSelect(pos.label)}
                        className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                          formData.position === pos.label ? 'text-blue-300 bg-blue-500/10' : 'text-white/85'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1">Contact Number</label>
                <input type="tel" inputMode="tel" maxLength={11} onKeyDown={blockPhoneKeys} name="contactNumber" value={formData.contactNumber} onChange={handleChange} className="glass-input text-sm" placeholder="Phone" />
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1">Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="glass-input text-sm" placeholder="Email" />
              </div>
              
              {/* Status and Assigned Purok */}
              {isBHWWorker ? (
                <>
                  <div>
                    <label className="block text-xs text-white/65 mb-1">Status</label>
                    <GlassSelect
                      name="status"
                      value={formData.status}
                      allowCustom
                      onChange={(v) => handleChange({ target: { name: 'status', value: v } })}
                      options={[
                        { value: 'Active', label: 'Active' },
                        { value: 'Inactive', label: 'Inactive' }
                      ]}
                    />
                  </div>
                  <div>
                    {puroksLoading ? (
                      <SkeletonSelectField labelWidth='w-24' />
                    ) : (
                    <>
                    <label className="block text-xs text-white/65 mb-1">Assigned Purok</label>
                    <GlassSelect
                      name="assignedPurokId"
                      value={formData.assignedPurokId}
                      allowCustom
                      onChange={(v) => handleChange({ target: { name: 'assignedPurokId', value: v } })}
                      options={assignedPurokOptions}
                      error={errors.assignedPurokId}
                    />
                    </>
                    )}
                  </div>
                </>
              ) : (
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs text-white/65 mb-1">Status</label>
                  <GlassSelect
                    name="status"
                    value={formData.status}
                    onChange={(v) => handleChange({ target: { name: 'status', value: v } })}
                    options={[
                      { value: 'Active', label: 'Active' },
                      { value: 'Inactive', label: 'Inactive' }
                    ]}
                  />
                </div>
              )}
              {isBHW && (
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs text-white/65 mb-1">Assigned Focus Group</label>
                    <GlassSelect
                      name="assignedFocusGroup"
                      value={formData.assignedFocusGroup}
                      allowCustom
                      onChange={(v) => handleChange({ target: { name: 'assignedFocusGroup', value: v } })}
                      options={focusGroupOptions}
                    />
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Login Credentials - Only for BHW */}
        {isBHW && (
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-medium text-white/75">Login Credentials</h3>
              <span className="text-xs text-white/65">
                {isEditing && formData.username ? 'Leave password blank to keep current' : 'Optional'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/65 mb-1">Username</label>
                <input type="text" name="username" value={formData.username} onChange={handleChange} className="glass-input text-sm" placeholder="Login username" />
                {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1">Account Role</label>
                <GlassSelect
                  name="accountRole"
                  value={formData.accountRole}
                  allowCustom
                  onChange={(v) => handleChange({ target: { name: 'accountRole', value: v } })}
                  options={[
                    { value: 'BHW Admin', label: 'BHW Admin' },
                    { value: 'BHW Worker', label: 'BHW Worker' }
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1">{isEditing ? 'New Password' : 'Password'}</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange}
                    className="glass-input pr-10 text-sm" placeholder={isEditing ? 'Leave blank to keep' : 'Password'} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/65 hover:text-white/85">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
                <button type="button" onClick={generatePassword} className="text-xs text-blue-400 hover:text-blue-300 mt-1">Generate password</button>
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1">Confirm Password</label>
                <input type={showPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                  className="glass-input text-sm" placeholder="Confirm password" />
                {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>
            {isEditing && formData.username && (
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg">
                <p className="text-xs text-blue-300">Login: <strong>{formData.username}</strong></p>
              </div>
            )}
          </GlassCard>
        )}

        {!isBHW && formData.position && (
          <GlassCard hover={false}>
            <div className="p-4 bg-white/5 rounded-lg text-center">
              <p className="text-sm text-white/75">
                This professional type does not require login credentials and is not assigned to specific puroks.
                They can be assigned to schedules and programs.
              </p>
            </div>
          </GlassCard>
        )}

        <div className="flex justify-end gap-3">
          <GlassButton variant="secondary" type="button" onClick={goBack}>Cancel</GlassButton>
          <GlassButton type="submit" loading={loading}>
            {isEditing ? 'Update' : 'Add'} Professional
          </GlassButton>
        </div>
      </form>
    </div>
  );
};

export default BHWForm;