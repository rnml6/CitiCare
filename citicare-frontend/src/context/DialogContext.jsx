import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle
} from 'lucide-react'
import Modal from '../components/Modal'
import GlassButton from '../components/GlassButton'
import { useToast } from '../components/Toast'

const DialogContext = createContext(null)

// Module-level façade so legacy handlers can migrate without threading a hook
// through every component. The provider registers its implementation on mount.
let registered = null

const fallback = {
  confirm: async () => false,
  prompt: async () => null,
  alert: async () => undefined,
  info: async () => undefined,
  success: async () => undefined,
  error: async () => undefined,
  loading: () => () => {},
  toast: () => {}
}

export const dialog = {
  confirm: (options) => (registered || fallback).confirm(options),
  prompt: (options) => (registered || fallback).prompt(options),
  alert: (options) => (registered || fallback).alert(options),
  info: (message, title) => (registered || fallback).info(message, title),
  success: (message, title) => (registered || fallback).success(message, title),
  error: (message, title) => (registered || fallback).error(message, title),
  loading: (options) => (registered || fallback).loading(options),
  toast: (message, type, duration) => (registered || fallback).toast(message, type, duration)
}

export const useDialog = () => {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialog must be used within a DialogProvider')
  return context
}

let nextId = 1

const normalizeOptions = (options) => {
  if (typeof options === 'string') return { message: options }
  return options || {}
}

const iconFor = (kind) => {
  switch (kind) {
    case 'success':
      return { Icon: CheckCircle2, className: 'text-emerald-400 bg-emerald-500/15 border-emerald-400/30' }
    case 'error':
      return { Icon: XCircle, className: 'text-red-400 bg-red-500/15 border-red-400/30' }
    case 'warning':
    case 'confirm':
      return { Icon: AlertTriangle, className: 'text-yellow-400 bg-yellow-500/15 border-yellow-400/30' }
    default:
      return { Icon: Info, className: 'text-blue-400 bg-blue-500/15 border-blue-400/30' }
  }
}

const DialogHost = ({ request, onResolve }) => {
  const options = request.options
  const [inputValue, setInputValue] = useState(options.defaultValue ?? '')
  const [fieldError, setFieldError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setInputValue(options.defaultValue ?? '')
    setFieldError('')
    setSubmitError('')
    setSubmitting(false)
  }, [request.id, options.defaultValue])

  const isPrompt = request.kind === 'prompt'
  const isLoading = request.kind === 'loading'
  const isConfirm = request.kind === 'confirm'
  const { Icon, className: iconClass } = iconFor(request.kind)
  // Callers can tint the status icon independently of the dialog kind (for
  // example a sign-out prompt that is not a warning).
  const resolvedIconClass =
    options.iconTone === 'danger'
      ? 'text-red-400 bg-red-500/15 border-red-400/30'
      : iconClass
  const titleId = `dialog-title-${request.id}`
  const descriptionId = `dialog-description-${request.id}`
  // Titled message dialogs already expose a close (X) button in the header.
  // Only render a footer button when there is no header close available.
  const hasHeaderClose = Boolean(options.title) && options.dismissible !== false
  const showInfoFooter = !isPrompt && !isLoading && !hasHeaderClose
  // Dialogs can opt out of focusing a button on open (which would otherwise
  // show a focus ring and make that action look highlighted).
  const initialFocus = options.initialFocus === 'none' ? 'panel' : 'auto'

  // Escape/backdrop dismissal is routed through Modal -> here. Confirmations
  // that are actively running must never be dismissed half-way.
  const dismiss = useCallback(() => {
    if (submitting || isLoading || options.dismissible === false) return
    onResolve(isPrompt ? null : false)
  }, [isLoading, isPrompt, onResolve, options.dismissible, submitting])

  const submitPrompt = async (event) => {
    event.preventDefault()
    const raw = String(inputValue ?? '')
    const value = options.trim === false ? raw : raw.trim()
    if (options.required !== false && !value) {
      setFieldError(options.requiredMessage || 'This field is required.')
      inputRef.current?.focus()
      return
    }
    if (typeof options.validate === 'function') {
      const message = options.validate(value)
      if (message) {
        setFieldError(message)
        inputRef.current?.focus()
        return
      }
    }
    setFieldError('')
    setSubmitting(true)
    try {
      if (typeof options.onSubmit === 'function') await options.onSubmit(value)
      onResolve(value)
    } catch (error) {
      setSubmitError(
        error?.response?.data?.message || error?.message || 'The operation failed. Please try again.'
      )
      setSubmitting(false)
    }
  }

  const confirm = async () => {
    if (submitting) return
    if (typeof options.onConfirm !== 'function') {
      onResolve(true)
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await options.onConfirm()
      onResolve(true)
    } catch (error) {
      setSubmitError(
        error?.response?.data?.message || error?.message || 'The operation failed. Please try again.'
      )
      setSubmitting(false)
    }
  }

  const message = options.message
  const messageClassName =
    options.messageSize === 'lg'
      ? 'text-base sm:text-lg leading-relaxed whitespace-pre-line text-white/90 font-medium max-w-sm mt-4'
      : `text-sm leading-relaxed whitespace-pre-line ${
          isPrompt ? 'text-white/75' : 'text-white/65 max-w-sm'
        }`
  const body = (
    <div className={isPrompt ? 'space-y-4' : 'flex flex-col items-center text-center py-2'}>
      {!isPrompt && !isLoading && (
        <div className={`w-14 h-14 rounded-full border flex items-center justify-center mb-1 ${resolvedIconClass}`}>
          <Icon className='w-7 h-7' aria-hidden='true' />
        </div>
      )}
      {isLoading && (
        <div className='w-14 h-14 rounded-full border border-blue-400/30 bg-blue-500/15 flex items-center justify-center mb-1'>
          <Loader2 className='w-7 h-7 text-blue-300 animate-spin' aria-hidden='true' />
        </div>
      )}
      {message && (
        request.kind === 'error' && !isPrompt ? (
          <div
            id={descriptionId}
            className='w-full rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-left'
          >
            <p className='text-sm leading-relaxed whitespace-pre-line text-red-50/90'>
              {message}
            </p>
          </div>
        ) : (
          <div
            id={descriptionId}
            className={messageClassName}
          >
            {message}
          </div>
        )
      )}

      {isPrompt && (
        <form onSubmit={submitPrompt} className='space-y-4' noValidate>
          <div className='space-y-1.5'>
            <label htmlFor={`dialog-input-${request.id}`} className='block text-sm font-medium text-white/85'>
              {options.label || 'Value'}
              {options.required !== false && <span className='text-red-300'> *</span>}
            </label>
            <input
              id={`dialog-input-${request.id}`}
              ref={inputRef}
              type={options.type || 'text'}
              value={inputValue}
              data-autofocus
              onChange={(event) => {
                setInputValue(event.target.value)
                if (fieldError) setFieldError('')
              }}
              placeholder={options.placeholder || ''}
              autoComplete={options.autoComplete || 'off'}
              aria-required={options.required !== false}
              aria-invalid={fieldError ? 'true' : 'false'}
              aria-describedby={fieldError ? `dialog-error-${request.id}` : undefined}
              className={`glass-input w-full ${fieldError ? '!border-red-400/70' : ''}`}
            />
            {fieldError && (
              <p id={`dialog-error-${request.id}`} role='alert' className='text-xs text-red-300'>
                {fieldError}
              </p>
            )}
            {options.helpText && !fieldError && (
              <p className='text-xs text-white/55'>{options.helpText}</p>
            )}
          </div>

          {submitError && (
            <p role='alert' className='text-sm text-red-200 bg-red-500/15 border border-red-400/30 rounded-xl p-3'>
              {submitError}
            </p>
          )}

          <div className='flex justify-end gap-3 pt-2'>
            <GlassButton variant='secondary' type='button' onClick={dismiss} disabled={submitting}>
              {options.cancelText || 'Cancel'}
            </GlassButton>
            <GlassButton variant='solid-primary' type='submit' loading={submitting}>
              {options.submitText || 'Submit'}
            </GlassButton>
          </div>
        </form>
      )}

      {!isPrompt && !isLoading && (isConfirm || showInfoFooter) && (
        <>
          {submitError && (
            <p role='alert' className='mt-3 text-sm text-red-200 bg-red-500/15 border border-red-400/30 rounded-xl p-3 text-left'>
              {submitError}
            </p>
          )}
          <div className='flex justify-center gap-3 mt-6 pt-4 border-t border-white/10 w-full'>
            {isConfirm ? (
              <>
                <GlassButton variant='secondary' type='button' onClick={dismiss} disabled={submitting} data-autofocus>
                  {options.cancelText || 'Cancel'}
                </GlassButton>
                <GlassButton
                  variant={options.destructive ? 'solid-danger' : 'solid-primary'}
                  type='button'
                  onClick={confirm}
                  loading={submitting}
                  className={options.confirmClassName}
                >
                  {options.confirmText || 'Confirm'}
                </GlassButton>
              </>
            ) : (
              <GlassButton variant='solid-primary' type='button' onClick={() => onResolve(true)} data-autofocus>
                {options.confirmText || 'Close'}
              </GlassButton>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <Modal
      isOpen
      onClose={dismiss}
      title={options.title || ''}
      size={options.size || 'sm'}
      hideClose={!options.title || isLoading || options.dismissible === false}
      closeOnBackdrop={!submitting && !isLoading && options.dismissible !== false}
      closeOnEsc={!submitting && !isLoading && options.dismissible !== false}
      ariaLabel={!options.title ? options.ariaLabel || 'Message' : undefined}
      ariaDescribedBy={message ? descriptionId : undefined}
      panelClassName='dialog-panel'
      initialFocus={initialFocus}
    >
      {body}
    </Modal>
  )
}

export const DialogProvider = ({ children }) => {
  const { addToast } = useToast()
  const [requests, setRequests] = useState([])
  // Pending requests are tracked synchronously as well as in state. Two
  // calls in the same event loop tick happen before React re-renders, so a
  // state-only lookup would let a double click open two dialogs.
  const pendingBySignature = useRef(new Map())
  const pendingById = useRef(new Map())

  const resolve = useCallback((id, value) => {
    const request = pendingById.current.get(id)
    if (request) {
      pendingById.current.delete(id)
      pendingBySignature.current.delete(request.signature)
      request.resolve(value)
    }
    setRequests((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const enqueueRequest = useCallback((kind, options) => {
    const normalized = normalizeOptions(options)
    const signature = `${kind}:${normalized.title || ''}:${normalized.message || ''}:${normalized.label || ''}`
    const existing = pendingBySignature.current.get(signature)
    // Rapid duplicate requests (double clicks, duplicate error handlers) must
    // never stack conflicting modals. Information requests share the visible
    // dialog; a second confirmation/prompt is treated as "not confirmed" so a
    // destructive handler can never run twice from one double click.
    if (existing) return { request: existing, duplicate: true }

    let resolvePromise
    const promise = new Promise((resolveRequest) => {
      resolvePromise = resolveRequest
    })
    const request = {
      id: nextId++,
      kind,
      options: normalized,
      signature,
      promise,
      resolve: (value) => {
        resolvePromise(value)
      }
    }
    pendingBySignature.current.set(signature, request)
    pendingById.current.set(request.id, request)
    setRequests((previous) => [...previous, request])
    return { request, duplicate: false }
  }, [])

  const enqueue = useCallback((kind, options) => {
    const { request, duplicate } = enqueueRequest(kind, options)
    if (duplicate) {
      if (kind === 'confirm') return Promise.resolve(false)
      if (kind === 'prompt') return Promise.resolve(null)
    }
    return request.promise
  }, [enqueueRequest])

  // Close anything still open if the provider itself is unmounted.
  useEffect(() => () => {
    for (const request of pendingById.current.values()) {
      request.resolve(request.kind === 'prompt' ? null : false)
    }
    pendingById.current.clear()
    pendingBySignature.current.clear()
  }, [])

  const api = useMemo(() => {
    const show = (kind, options) => enqueue(kind, options)
    return {
      confirm: (options) => show('confirm', { destructive: true, ...normalizeOptions(options) }),
      prompt: (options) => show('prompt', { required: true, ...normalizeOptions(options) }),
      alert: (options) => show('info', options),
      info: (message, title = 'Information') => show('info', { message, title }),
      success: (message, title = 'Success') => show('success', { message, title }),
      error: (message, title = 'Something went wrong') => show('error', { message, title }),
      // Loading dialogs cannot be dismissed by the user, so callers receive a
      // close function they must invoke when the background work settles.
      loading: (options) => {
        const { request } = enqueueRequest('loading', { dismissible: false, ...normalizeOptions(options) })
        return () => resolve(request.id, true)
      },
      // Snackbars are success-only: they auto-dismiss and must never be the
      // only place an error or validation message appears. Anything else is
      // promoted to a dialog so the user has to acknowledge it.
      toast: (message, type = 'success', duration) => {
        if (type === 'success') return addToast(message, duration)
        return show(type === 'error' ? 'error' : 'info', { message })
      }
    }
  }, [addToast, enqueue, enqueueRequest, resolve])

  useEffect(() => {
    registered = api
    return () => {
      if (registered === api) registered = null
    }
  }, [api])

  const current = requests[0] || null

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <DialogHost
          key={current.id}
          request={current}
          onResolve={(value) => resolve(current.id, value)}
        />
      )}
    </DialogContext.Provider>
  )
}

export default DialogContext
