// Shared "take the user to the problem" helpers.
//
// Inline validation is only useful when the message is on screen. Long forms
// and modals can leave the offending field far above or below the button the
// user just pressed, so every failed submit should bring the first invalid
// field into view and focus it.
//
// GlassInput suppresses the native validation tooltip (the message is rendered
// inline instead). Cancelling the native `invalid` event also cancels the
// browser's automatic focus/scroll, so native constraint failures are revealed
// here as well.

const escapeAttributeValue = value =>
  String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const isVisible = element => {
  if (!element) return false
  if (typeof element.checkVisibility === 'function') {
    try {
      if (!element.checkVisibility()) return false
    } catch {
      // Some implementations do not accept the modern options object.
    }
  }
  const rects = element.getClientRects ? element.getClientRects() : []
  return rects.length > 0 || element.offsetParent !== null
}

const queryAll = (root, selector) => {
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch {
    return []
  }
}

const firstVisible = elements => elements.find(isVisible) || elements[0] || null

const activeRoot = container => {
  if (container && container.isConnected) return container
  if (typeof document === 'undefined') return null
  const dialogs = queryAll(document, '[role="dialog"]')
  // Modals are portalled to the end of <body>; the last one is the top layer.
  return dialogs.length ? dialogs[dialogs.length - 1] : document
}

const reveal = field => {
  if (!field || typeof window === 'undefined') return false
  field.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  // `preventScroll` keeps focus from fighting the smooth scroll above.
  field.focus?.({ preventScroll: true })
  return true
}

// Run once now (for layouts that are already stable) and again after React has
// painted any inline error markup that was just queued by setState.
const revealNowAndAfterRender = resolveTarget => {
  const immediate = resolveTarget()
  if (immediate) reveal(immediate)
  if (typeof window === 'undefined') return Boolean(immediate)

  let done = false
  const run = () => {
    if (done) return
    done = true
    reveal(resolveTarget())
  }
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(run))
  }
  // rAF is throttled in background tabs; the timer keeps submits responsive.
  window.setTimeout(run, 60)
  return Boolean(immediate)
}

const fieldByName = (root, name) =>
  firstVisible(queryAll(root, `[name="${escapeAttributeValue(name)}"]`))

/**
 * Focus and scroll to the first field represented by a validation error map.
 * `errors` keys should match the inputs' `name` attributes.
 */
export const focusFirstError = (errors, container) => {
  const names = Object.keys(errors || {}).filter(name => errors[name])
  if (names.length === 0) return false

  return revealNowAndAfterRender(() => {
    const root = activeRoot(container)
    if (!root) return null
    for (const name of names) {
      const field = fieldByName(root, name)
      if (field) return field
    }
    // Inputs without a `name` (for example GlassSelect) expose the failed
    // state through aria-invalid once React has rendered the error.
    return (
      firstVisible(queryAll(root, '[aria-invalid="true"]')) ||
      firstVisible(queryAll(root, ':invalid')) ||
      null
    )
  })
}

// Used by GlassInput when the browser reports a native constraint failure.
// Multiple invalid events fire in one validation pass; only the first field
// in the form should be revealed.
let pendingNativeReveal = null

export const focusFirstInvalidField = field => {
  if (!field || typeof window === 'undefined') return false
  const form = field.form || field.closest?.('form') || activeRoot(null)
  if (!form) return false
  if (pendingNativeReveal) return true

  const run = () => {
    pendingNativeReveal = null
    const firstInvalid =
      firstVisible(queryAll(form, ':invalid')) ||
      firstVisible(queryAll(form, '[aria-invalid="true"]')) ||
      field
    reveal(firstInvalid)
  }

  pendingNativeReveal = window.setTimeout(run, 0)
  return true
}
