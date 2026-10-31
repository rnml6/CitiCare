import { forwardRef, useId, useState } from 'react';
import { blockNumericKeys } from '../utils/validation';
import { focusFirstInvalidField } from '../utils/focusInvalidField';

const cleanLabel = (label) =>
  String(label || 'This field')
    .replace(/\s*\*+\s*$/, '')
    .trim() || 'This field';

const nativeValidationMessage = (element, label) => {
  const field = cleanLabel(label);
  const validity = element.validity || {};
  const min = element.getAttribute('min');
  const max = element.getAttribute('max');

  if (validity.valueMissing) return `${field} is required.`;
  if (validity.rangeOverflow && max != null) {
    return `${field} must be less than or equal to ${max}.`;
  }
  if (validity.rangeUnderflow && min != null) {
    return `${field} must be greater than or equal to ${min}.`;
  }
  if (validity.patternMismatch) {
    return element.title || `${field} has an invalid format.`;
  }
  if (validity.stepMismatch) return `${field} must be a valid increment.`;
  if (validity.typeMismatch) return `${field} is not valid.`;
  if (validity.tooLong || validity.tooShort) {
    return element.validationMessage || `${field} has an invalid length.`;
  }
  return element.validationMessage || `${field} is invalid.`;
};

const GlassInput = forwardRef(({
  label,
  error,
  icon: Icon,
  type = 'text',
  className = '',
  inputMode,
  onKeyDown,
  onChange,
  onInvalid,
  id,
  ...props
}, ref) => {
  const [nativeError, setNativeError] = useState('');
  const generatedId = useId();
  const inputId = id || `glass-input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const displayError = error || nativeError;
  const isNumber = type === 'number';

  const handleKeyDown = event => {
    // Browsers still accept e/E/+/- inside number inputs; block them here so
    // measurement fields only ever receive digits and a decimal point.
    if (isNumber) blockNumericKeys(event);
    onKeyDown?.(event);
  };

  const handleChange = event => {
    if (nativeError) setNativeError('');
    onChange?.(event);
  };

  const handleInvalid = event => {
    // Suppress the native tooltip: the message is rendered below the field.
    event.preventDefault();
    setNativeError(nativeValidationMessage(event.currentTarget, label));
    // Cancelling the native event also cancels the browser's automatic
    // focus/scroll, so take the user to the first failing field ourselves.
    focusFirstInvalidField(event.currentTarget);
    onInvalid?.(event);
  };

  const sharedProps = {
    id: inputId,
    'data-inline-validation': 'glass',
    'aria-invalid': displayError ? 'true' : undefined,
    'aria-describedby': displayError ? errorId : undefined,
    onChange: handleChange,
    onInvalid: handleInvalid,
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-blue-200">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/65" />
        )}
        {type === 'textarea' ? (
          <textarea
            ref={ref}
            className={`glass-textarea ${Icon ? 'pl-10' : ''} ${displayError ? 'border-red-400' : ''} ${className}`}
            onKeyDown={onKeyDown}
            {...sharedProps}
            {...props}
          />
        ) : (
          <input
            ref={ref}
            type={type}
            inputMode={inputMode ?? (isNumber ? 'decimal' : undefined)}
            className={`glass-input ${Icon ? 'pl-10' : ''} ${displayError ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''} ${className}`}
            onKeyDown={handleKeyDown}
            {...sharedProps}
            {...props}
          />
        )}
      </div>
      {displayError && (
        <p id={errorId} role="alert" className="text-xs text-red-400 mt-1">
          {displayError}
        </p>
      )}
    </div>
  );
});

GlassInput.displayName = 'GlassInput';

export default GlassInput;
