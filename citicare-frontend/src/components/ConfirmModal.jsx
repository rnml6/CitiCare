import { useId } from 'react'
import Modal from './Modal'
import GlassButton from './GlassButton'
import { AlertTriangle } from 'lucide-react'

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  loading = false,
}) => {
  const descriptionId = useId()
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="sm"
      hideClose
      ariaLabel={title}
      ariaDescribedBy={message ? descriptionId : undefined}
      closeOnBackdrop={!loading}
      closeOnEsc={!loading}
      preventClose={loading}
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        {message && (
          <p id={descriptionId} className="text-white/60 text-sm leading-relaxed max-w-xs whitespace-pre-line">
            {message}
          </p>
        )}
      </div>
      <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-white/10">
        <GlassButton variant="secondary" type="button" onClick={onClose} disabled={loading} data-autofocus>
          {cancelText}
        </GlassButton>
        <GlassButton variant="solid-danger" type="button" onClick={onConfirm} loading={loading}>
          {confirmText}
        </GlassButton>
      </div>
    </Modal>
  )
}

export default ConfirmModal
