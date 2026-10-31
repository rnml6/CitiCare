import { useState, useEffect } from 'react';
import { Eye, EyeOff, Key, Mail, User, Shield } from 'lucide-react';
import Modal from './Modal';
import GlassButton from './GlassButton';
import GlassInput from './GlassInput';
import GlassSelect from './GlassSelect';
import { dialog } from '../context/DialogContext';
import { confirmCreate, confirmUpdate } from '../utils/crudConfirm';

const BHWAccountModal = ({ isOpen, onClose, bhw, onSubmit, loading }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'bhw',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (bhw?.account) {
      setFormData({
        email: bhw.account.email || bhw.email || '',
        username: bhw.account.username || '',
        password: '',
        confirmPassword: '',
        role: bhw.account.role || 'bhw',
      });
    } else {
      setFormData({
        email: bhw?.email || '',
        username: '',
        password: '',
        confirmPassword: '',
        role: 'bhw',
      });
    }
    setErrors({});
    setShowPassword(false);
  }, [bhw, isOpen]);

  const validate = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    if (!bhw?.account || formData.password) {
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
      
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const confirmed = bhw?.account
      ? await confirmUpdate('account', `Please confirm that you want to save the changes to ${bhw.name}'s account.`)
      : await confirmCreate('account', `Please confirm that you want to create an account for ${bhw?.name || 'this health worker'}.`);
    if (!confirmed) return;
    const { confirmPassword, ...data } = formData;
    // Only send password if it's provided
    if (bhw?.account && !data.password) {
      delete data.password;
    }
    onSubmit(data);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ 
      ...prev, 
      password, 
      confirmPassword: password 
    }));
    setShowPassword(true);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={bhw?.account ? 'Manage BHW Account' : 'Create BHW Account'}
      size="md"
    >
      {bhw && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* BHW Info Banner */}
          <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-white">
                {bhw.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{bhw.name}</p>
              <p className="text-sm text-blue-300">{bhw.position}</p>
              {bhw.account && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  Account exists ({bhw.account.username})
                </p>
              )}
            </div>
          </div>

          {/* Email */}
          <GlassInput
            label="Email Address"
            name="email"
            type="email"
            icon={Mail}
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            placeholder="bhw@barangay.gov.ph"
            required
          />

          {/* Username */}
          <GlassInput
            label="Username"
            name="username"
            icon={User}
            value={formData.username}
            onChange={handleChange}
            error={errors.username}
            placeholder="Enter username"
            required
          />

          {/* Password */}
          <div>
            <GlassInput
              label={bhw?.account ? 'New Password (leave blank to keep current)' : 'Password'}
              name="password"
              type={showPassword ? 'text' : 'password'}
              icon={Key}
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              placeholder={bhw?.account ? 'Enter new password' : 'Enter password'}
              required={!bhw?.account}
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={() => setShowPassword(!showPassword)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-400/50"
                />
                <span className="text-xs text-white/75">Show password</span>
              </label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Generate secure password
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <GlassInput
            label="Confirm Password"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            icon={Key}
            value={formData.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            placeholder="Confirm password"
            required={!bhw?.account || formData.password}
          />

          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-blue-200">
              <Shield className="w-4 h-4 inline mr-1.5" />
              Account Role
            </label>
            <GlassSelect
              name="role"
              value={formData.role}
              onChange={(v) => handleChange({ target: { name: 'role', value: v } })}
              options={[
                { value: 'bhw_supervisor', label: 'BHW Supervisor' },
                { value: 'bhw', label: 'BHW Worker' },
              ]}
            />
            <p className="text-xs text-white/65 mt-1">
              Supervisor role grants additional permissions for managing schedules and residents.
            </p>
          </div>

          {/* Password Requirements */}
          {(!bhw?.account || formData.password) && (
            <div className="bg-white/5 rounded-lg p-3 text-xs text-white/75 space-y-1.5">
              <p className="text-white/85 font-medium mb-2">Password Requirements:</p>
              <p className={`flex items-center gap-1.5 ${formData.password.length >= 6 ? 'text-emerald-400' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${formData.password.length >= 6 ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                At least 6 characters
              </p>
              <p className={`flex items-center gap-1.5 ${/[A-Z]/.test(formData.password) ? 'text-emerald-400' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(formData.password) ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                At least one uppercase letter
              </p>
              <p className={`flex items-center gap-1.5 ${/[0-9]/.test(formData.password) ? 'text-emerald-400' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(formData.password) ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                At least one number
              </p>
              <p className={`flex items-center gap-1.5 ${/[!@#$%^&*]/.test(formData.password) ? 'text-emerald-400' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[!@#$%^&*]/.test(formData.password) ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                At least one special character (!@#$%^&*)
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t border-white/10">
            {bhw?.account && (
              <GlassButton
                variant="danger"
                type="button"
                onClick={async () => {
                  const confirmed = await dialog.confirm({
                    title: 'Reset password?',
                    message: "This BHW's current password will stop working and they will need to set a new password on next login.",
                    confirmText: 'Reset password',
                    cancelText: 'Keep current',
                    destructive: true,
                  });
                  if (confirmed) onSubmit({ resetPassword: true });
                }}
              >
                Reset Password
              </GlassButton>
            )}
            <div className="flex space-x-3 ml-auto">
              <GlassButton variant="secondary" type="button" onClick={onClose}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" loading={loading}>
                {bhw?.account ? 'Update Account' : 'Create Account'}
              </GlassButton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default BHWAccountModal;