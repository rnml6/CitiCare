// Shared confirmation helpers for CRUD actions.
//
// Every create, update, and delete initiated from the UI must be confirmed
// through the dialog service before the API request is sent. The generic
// dialog defaults to a destructive confirmation, so create/update helpers
// explicitly opt into the primary (non-destructive) action style.
import { dialog } from '../context/DialogContext'

export const confirmCreate = (entity, message) =>
  dialog.confirm({
    title: `Create ${entity}?`,
    message:
      message ||
      `Please confirm that you want to add this ${String(entity).toLowerCase()}.`,
    confirmText: `Create ${entity}`,
    destructive: false,
  })

export const confirmUpdate = (entity, message) =>
  dialog.confirm({
    title: `Save ${entity} changes?`,
    message:
      message ||
      `Please confirm that you want to save these ${String(entity).toLowerCase()} changes.`,
    confirmText: 'Save changes',
    destructive: false,
  })

export const confirmMutation = options =>
  dialog.confirm({ destructive: false, ...options })
