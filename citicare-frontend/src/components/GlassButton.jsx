import { Loader2 } from 'lucide-react';

const GlassButton = ({ 
  children, 
  variant = 'solid-primary', 
  size = 'md',
  loading = false,
  icon: Icon,
  className = '',
  ...props 
}) => {
  const variants = {
    primary: 'glass-btn-primary',
    secondary: 'glass-btn-secondary',
    danger: 'glass-btn-danger',
    success: 'glass-btn-success',
    'solid-primary': 'glass-btn-solid-primary',
    'solid-secondary': 'glass-btn-solid-secondary',
    'solid-danger': 'glass-btn-solid-danger',
    'solid-success': 'glass-btn-solid-success',
  };

  const sizes = {
    md: '',
    lg: 'glass-btn-lg',
  };

  return (
    <button
      className={`${variants[variant]} ${sizes[size]} flex items-center justify-center gap-1.5 sm:gap-2 ${className}`}
      disabled={loading}
      {...props}
    >
      {loading ? (
        <Loader2 className={`${size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} sm:w-5 sm:h-5 animate-spin`} />
      ) : Icon ? (
        <Icon className={`${size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} sm:w-5 sm:h-5 flex-shrink-0`} />
      ) : null}
      {children}
    </button>
  );
};

export default GlassButton;
