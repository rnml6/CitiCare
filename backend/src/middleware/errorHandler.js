export const errorHandler = (err, req, res, _next) => {
  let statusCode = Number(err?.statusCode || err?.status) || 500
  let message = err?.message || 'Internal server error'

  // Body parser errors are client errors; never let them fall through as 500.
  if (err?.type === 'entity.parse.failed') {
    statusCode = 400
    message = 'Request body contains invalid JSON.'
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413
    message = 'Request body is too large.'
  }

  // Never return stack traces or database internals to clients. Detailed
  // logs stay server-side only.
  if (statusCode >= 500) {
    console.error(`[${req?.method || 'REQUEST'} ${req?.originalUrl || req?.url || ''}]`, err)
    message = 'Internal server error'
  } else {
    console.warn(`[${req?.method || 'REQUEST'} ${req?.originalUrl || req?.url || ''}] ${statusCode}: ${message}`)
  }

  if (res.headersSent) return
  return res.status(statusCode).json({
    success: false,
    message,
    ...(err?.errors ? { errors: err.errors } : {}),
  })
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
