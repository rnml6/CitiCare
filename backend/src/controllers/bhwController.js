// controllers/bhwController.js
import { supabase } from '../config/supabase.js'
import bcrypt from 'bcryptjs'
import {
  sendValidationError,
  trimText,
  validateBhwPayload
} from '../utils/validators.js'

// Focus / vulnerable groups a BHW can be assigned to.
// One BHW holds at most one group; one group has at most one BHW.
export const BHW_FOCUS_GROUPS = ['pregnant', 'senior', 'infant']

export const BHW_FOCUS_GROUP_LABELS = {
  pregnant: 'Pregnant',
  senior: 'Senior Citizen',
  infant: 'Infants'
}

const normalizeFocusGroup = value => {
  if (value === undefined || value === null) return undefined
  const raw = String(value).trim().toLowerCase()
  if (!raw) return null
  if (raw === 'senior citizen' || raw === 'seniorcitizen' || raw === 'seniors')
    return 'senior'
  if (raw === 'infants' || raw === 'children' || raw === 'child') return 'infant'
  if (raw === 'pregnant women' || raw === 'pregnantwomen') return 'pregnant'
  return raw
}

const escapeIlike = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);

const isMissingFocusColumn = error => {
  if (!error) return false
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === 'PGRST204' || msg.includes('assigned_focus_group')
}

// Returns the conflicting holder ({ bhw_id, name }) or null.
// Returns { __missingColumn: true } when the column does not exist yet
// (migration not run) so callers can skip enforcement instead of crashing.
const findFocusGroupHolder = async (group, excludeId = null) => {
  try {
    let query = supabase
      .from('bhws')
      .select('bhw_id, name')
      .eq('assigned_focus_group', group)
      .limit(1)
    if (excludeId !== null && excludeId !== undefined)
      query = query.neq('bhw_id', excludeId)
    const { data, error } = await query.maybeSingle()
    if (error) {
      if (isMissingFocusColumn(error)) return { __missingColumn: true }
      throw error
    }
    return data || null
  } catch (error) {
    if (isMissingFocusColumn(error)) return { __missingColumn: true }
    throw error
  }
}

const focusTakenResponse = (res, group, holder) => {
  const label = BHW_FOCUS_GROUP_LABELS[group] || group
  const holderName = holder?.name || 'another BHW'
  const message = `${label} is already assigned to ${holderName}. Each focus group can only have one BHW.`
  return res.status(400).json({
    success: false,
    message,
    errors: { assignedFocusGroup: message }
  })
}

export const getAllBHWs = async (req, res) => {
  try {
    // Workers must never enumerate other health workers — except when
    // assigning BHWs to a schedule (forAssignment=true).
    const forAssignment = req.query.forAssignment === 'true'
    if (req.user?.role === 'BHW Worker' && !forAssignment) {
      let single = await supabase
        .from('bhws')
        .select('bhw_id, name, position, contact_number, email, status, assigned_purok_id, username, has_account, worker_type, assigned_focus_group, puroks:assigned_purok_id (purok_id, name)')
        .eq('bhw_id', req.user.bhwId)
        .maybeSingle();
      if (single.error && isMissingFocusColumn(single.error)) {
        single = await supabase
          .from('bhws')
          .select('bhw_id, name, position, contact_number, email, status, assigned_purok_id, username, has_account, worker_type, puroks:assigned_purok_id (purok_id, name)')
          .eq('bhw_id', req.user.bhwId)
          .maybeSingle();
      }
      if (single.error) throw single.error;
      const b = single.data;
      if (!b) return res.json({ success: true, data: [] });
      return res.json({
        success: true,
        data: [{
          id: b.bhw_id, name: b.name, position: b.position,
          contactNumber: b.contact_number, email: b.email, status: b.status,
          assignedPurok: b.puroks?.name || null, assignedPurokId: b.assigned_purok_id,
          username: b.username, hasAccount: b.has_account, workerType: b.worker_type,
          assignedFocusGroup: b.assigned_focus_group || null
        }]
      });
    }
    const { workerType } = req.query
    const buildQuery = withFocus => {
      let query = supabase.from('bhws').select(`
      bhw_id, name, position, contact_number, email, status,
      assigned_purok_id, username, has_account, worker_type${
        withFocus ? ',\n      assigned_focus_group' : ''
      },
      puroks:assigned_purok_id (purok_id, name)
    `)
      if (workerType) query = query.eq('worker_type', workerType)
      return query.order('bhw_id', { ascending: false })
    }

    let data
    let usedFocus = true
    {
      const { data: rows, error } = await buildQuery(true)
      if (error && isMissingFocusColumn(error)) {
        usedFocus = false
        const retry = await buildQuery(false)
        if (retry.error) throw retry.error
        data = retry.data
      } else {
        if (error) throw error
        data = rows
      }
    }

    const bhws = data.map(bhw => ({
      id: bhw.bhw_id,
      name: bhw.name,
      position: bhw.position,
      contactNumber: bhw.contact_number,
      email: bhw.email,
      status: bhw.status,
      assignedPurok: bhw.puroks?.name || null,
      assignedPurokId: bhw.assigned_purok_id,
      username: bhw.username,
      hasAccount: bhw.has_account,
      workerType: bhw.worker_type,
      assignedFocusGroup: usedFocus ? bhw.assigned_focus_group || null : null
    }))
    res.json({ success: true, data: bhws })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch BHWs' })
  }
}

export const getBHWById = async (req, res) => {
  try {
    const { id } = req.params
    if (req.user?.role === 'BHW Worker' && String(id) !== String(req.user?.bhwId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own profile' })
    }
    const buildQuery = withFocus =>
      supabase
        .from('bhws')
        .select(
          `
      bhw_id, name, position, contact_number, email, status,
      assigned_purok_id, username, has_account, user_id, worker_type${
        withFocus ? ',\n      assigned_focus_group' : ''
      },
      puroks:assigned_purok_id (purok_id, name)
    `
        )
        .eq('bhw_id', id)
        .maybeSingle()

    let data
    let usedFocus = true
    {
      const { data: row, error } = await buildQuery(true)
      if (error && isMissingFocusColumn(error)) {
        usedFocus = false
        const retry = await buildQuery(false)
        if (retry.error) throw retry.error
        data = retry.data
      } else {
        if (error) throw error
        data = row
      }
    }
    if (!data)
      return res.status(404).json({ success: false, message: 'BHW not found' })

    // Get ALL schedules (lead + assigned) for stats — deduped by
    // schedule_id so the counts match the schedule list exactly.
    const { data: leadSchedules } = await supabase
      .from('schedules')
      .select('schedule_id, status')
      .eq('bhw_id', id)
    const { data: assignedInBhws } = await supabase
      .from('schedule_bhws')
      .select('schedule_id')
      .eq('bhw_id', id)

    let additionalStatuses = []
    if (assignedInBhws?.length > 0) {
      const ids = assignedInBhws.map(s => s.schedule_id)
      const { data: extraSchedules } = await supabase
        .from('schedules')
        .select('schedule_id, status')
        .in('schedule_id', ids)
      additionalStatuses = extraSchedules || []
    }

    const uniqueStatuses = []
    const seen = new Set()
    ;[...(leadSchedules || []), ...additionalStatuses].forEach(s => {
      if (s?.schedule_id == null || seen.has(s.schedule_id)) return
      seen.add(s.schedule_id)
      uniqueStatuses.push(s)
    })

    const totalSchedules = uniqueStatuses.length
    const completedSchedules = uniqueStatuses.filter(
      s => s.status === 'Completed'
    ).length
    const missedSchedules = uniqueStatuses.filter(
      s => s.status === 'Missed'
    ).length
    const upcomingSchedules = uniqueStatuses.filter(
      s => s.status === 'Scheduled'
    ).length

    const bhw = {
      id: data.bhw_id,
      name: data.name,
      position: data.position,
      contactNumber: data.contact_number,
      email: data.email,
      status: data.status,
      assignedPurok: data.puroks?.name || null,
      assignedPurokId: data.assigned_purok_id,
      username: data.username,
      hasAccount: data.has_account,
      workerType: data.worker_type,
      assignedFocusGroup: usedFocus ? data.assigned_focus_group || null : null,
      stats: {
        totalSchedules,
        completedSchedules,
        missedSchedules,
        upcomingSchedules,
        completionRate:
          totalSchedules > 0
            ? Math.round((completedSchedules / totalSchedules) * 100)
            : 0
      }
    }
    res.json({ success: true, data: bhw })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch BHW' })
  }
}

export const createBHW = async (req, res) => {
  try {
    const body = req.body || {}
    const errors = validateBhwPayload(body)
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors)

    const {
      name,
      position,
      contactNumber,
      email,
      status,
      assignedPurokId,
      username,
      password,
      accountRole,
      workerType,
      assignedFocusGroup,
      assigned_focus_group,
      focusGroup
    } = body
    const cleanName = trimText(name)

    const type = workerType || 'BHW'
    const isBHW = type === 'BHW'

    // A half-filled pair previously created NO login account while still
    // reporting success. Fail loudly instead so the admin knows.
    const cleanUsername = typeof username === 'string' ? username.trim() : username
    if (isBHW && ((cleanUsername && !password) || (!cleanUsername && password))) {
      const missingField = cleanUsername ? 'password' : 'username'
      const message = 'Provide both a username and a password to create a login account, or leave both blank.'
      return res.status(400).json({
        success: false,
        message,
        errors: { [missingField]: message }
      })
    }
    if (isBHW && cleanUsername && cleanUsername.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.', errors: { username: 'Username must be at least 3 characters.' } })
    }
    if (isBHW && password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.', errors: { password: 'Password must be at least 6 characters.' } })
    }

    // Only BHWs hold a focus group. Normalize + validate the value first.
    let focusGroupValue = normalizeFocusGroup(
      assignedFocusGroup ?? assigned_focus_group ?? focusGroup
    )
    if (focusGroupValue === undefined) focusGroupValue = null
    if (!isBHW) focusGroupValue = null
    if (focusGroupValue && !BHW_FOCUS_GROUPS.includes(focusGroupValue)) {
      const message = `Invalid focus group. Choose one of: ${BHW_FOCUS_GROUPS.map(
        g => BHW_FOCUS_GROUP_LABELS[g]
      ).join(', ')}.`
      return res.status(400).json({
        success: false,
        message,
        errors: { assignedFocusGroup: message }
      })
    }

    if (focusGroupValue) {
      const holder = await findFocusGroupHolder(focusGroupValue)
      if (holder?.__missingColumn) {
        // Migration not run yet — allow save without enforcement.
        focusGroupValue = null
      } else if (holder) {
        return focusTakenResponse(res, focusGroupValue, holder)
      }
    }

    let userId = null

    if (isBHW && cleanUsername && password) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('user_id')
        .ilike('email', escapeIlike(cleanUsername))
        .maybeSingle()
      if (existingUser)
        return res
          .status(400)
          .json({ success: false, message: 'This username is already taken.', errors: { username: 'This username is already taken.' } })

      const passwordHash = await bcrypt.hash(password, 10)
      const allowedRoles = ['BHW Worker', 'BHW Admin']
      const role = allowedRoles.includes(accountRole)
        ? accountRole
        : 'BHW Worker'

      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          email: cleanUsername,
          password_hash: passwordHash,
          name: name,
          role_display: role
        })
        .select()
        .single()

      if (userError) {
        console.error('Failed to create BHW user:', userError)
        return res.status(400).json({
          success: false,
          message: 'Failed to create the login account. The username may already be in use.'
        })
      }
      userId = userData.user_id
    }

    const insertData = {
      name: cleanName,
      position: trimText(position) || type,
      contact_number: trimText(contactNumber) || null,
      email: trimText(email) || null,
      status: status || 'Active',
      assigned_purok_id: assignedPurokId || null,
      worker_type: type,
      username: isBHW ? cleanUsername || null : null,
      has_account: isBHW && !!(cleanUsername && password)
    }
    if (focusGroupValue) insertData.assigned_focus_group = focusGroupValue
    if (userId) insertData.user_id = userId

    let data
    {
      const { data: row, error } = await supabase
        .from('bhws')
        .insert(insertData)
        .select()
        .single()
      if (error) {
        // Column missing (migration not run yet) → retry without focus group.
        if (focusGroupValue && isMissingFocusColumn(error)) {
          delete insertData.assigned_focus_group
          const retry = await supabase
            .from('bhws')
            .insert(insertData)
            .select()
            .single()
          if (retry.error) {
            if (userId)
              await supabase.from('users').delete().eq('user_id', userId)
            throw retry.error
          }
          data = retry.data
        } else {
          if (userId)
            await supabase.from('users').delete().eq('user_id', userId)
          // Race-condition fallback: DB unique index rejected a duplicate.
          if (error.code === '23505' && focusGroupValue) {
            const holder = await findFocusGroupHolder(focusGroupValue)
            if (holder && !holder.__missingColumn)
              return focusTakenResponse(res, focusGroupValue, holder)
          }
          throw error
        }
      } else {
        data = row
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: data.bhw_id,
        name: data.name,
        position: data.position,
        contactNumber: data.contact_number,
        email: data.email,
        status: data.status,
        assignedPurokId: data.assigned_purok_id,
        workerType: data.worker_type,
        username: data.username,
        hasAccount: data.has_account,
        assignedFocusGroup: data.assigned_focus_group || null
      },
      message:
        isBHW && cleanUsername && password
          ? `BHW created with login account (username: ${cleanUsername})`
          : 'Healthcare professional added successfully (no login account)'
    })
  } catch (error) {
    console.error('Error creating BHW:', error)
    res.status(500).json({ success: false, message: 'Failed to create the health worker.' })
  }
}

export const updateBHW = async (req, res) => {
  try {
    const body = req.body || {}
    const errors = validateBhwPayload(body, { partial: true })
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors)

    const { id } = req.params
    // BHW Worker self-service: own contact info only. Everything else
    // (position, status, assignments, credentials) is admin-only.
    if (req.user?.role === 'BHW Worker') {
      if (String(id) !== String(req.user?.bhwId)) {
        return res.status(403).json({ success: false, message: 'You can only update your own information' })
      }
      const { name, contactNumber, email, username, password } = req.body
      const selfUpdate = {}
      if (name !== undefined) selfUpdate.name = name
      if (contactNumber !== undefined) selfUpdate.contact_number = contactNumber
      if (email !== undefined) selfUpdate.email = email
      const blocked = ['position', 'status', 'assignedPurokId', 'assigned_purok_id', 'assignedFocusGroup', 'assigned_focus_group', 'accountRole', 'workerType'].filter(k => req.body[k] !== undefined)
      if (blocked.length > 0) {
        return res.status(403).json({ success: false, message: 'Position, assigned purok, and focus/vulnerable group can only be changed by the administrator.' })
      }

      // Validate username if provided
      if (username !== undefined) {
        const cleanUsername = typeof username === 'string' ? username.trim() : username
        if (cleanUsername && cleanUsername.length < 3) {
          return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.', errors: { username: 'Username must be at least 3 characters.' } })
        }
      }

      // Validate password if provided
      if (password !== undefined && password) {
        if (password.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.', errors: { password: 'Password must be at least 6 characters.' } })
        }
      }

      if (Object.keys(selfUpdate).length === 0 && !username && !password) {
        return res.status(400).json({ success: false, message: 'No fields to update' })
      }

      const { data: currentData, error: currentError } = await supabase
        .from('bhws')
        .select('user_id, username, has_account')
        .eq('bhw_id', id)
        .maybeSingle()
      if (currentError) throw currentError

      // Update username in bhws table
      if (username !== undefined) {
        const cleanUsername = typeof username === 'string' ? username.trim() : username
        selfUpdate.username = cleanUsername || null
      }

      const { data, error } = await supabase
        .from('bhws')
        .update(selfUpdate)
        .eq('bhw_id', id)
        .select()
        .single()
      if (error) throw error

      // Update user account credentials if user_id exists
      if (currentData?.user_id) {
        const userUpdate = {}
        if (name !== undefined) userUpdate.name = name
        if (username !== undefined) {
          const cleanUsername = typeof username === 'string' ? username.trim() : username
          userUpdate.email = cleanUsername
        }
        if (password) {
          userUpdate.password_hash = await bcrypt.hash(password, 10)
        }
        if (Object.keys(userUpdate).length > 0) {
          await supabase
            .from('users')
            .update(userUpdate)
            .eq('user_id', currentData.user_id)
        }
      } else if (username && password) {
        // Create a new user account if one doesn't exist
        const cleanUsername = typeof username === 'string' ? username.trim() : username
        const { data: existingUser } = await supabase
          .from('users')
          .select('user_id')
          .ilike('email', escapeIlike(cleanUsername))
          .maybeSingle()
        if (existingUser) {
          return res.status(400).json({ success: false, message: 'This username is already taken.', errors: { username: 'This username is already taken.' } })
        }
        const passwordHash = await bcrypt.hash(password, 10)
        const { data: userData } = await supabase
          .from('users')
          .insert({
            email: cleanUsername,
            password_hash: passwordHash,
            name: name || selfUpdate.name || '',
            role_display: 'BHW Worker'
          })
          .select()
          .single()
        if (userData) {
          await supabase
            .from('bhws')
            .update({ user_id: userData.user_id, has_account: true })
            .eq('bhw_id', id)
        }
      }

      return res.json({ success: true, data: { id: data.bhw_id, name: data.name, contactNumber: data.contact_number, email: data.email, username: data.username }, message: 'Updated successfully' })
    }
    const allowed = ['Barangay Administrator', 'Administrator', 'admin', 'BHW Admin']
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const {
      name,
      position,
      contactNumber,
      email,
      status,
      assignedPurokId,
      username,
      password,
      accountRole,
      workerType,
      assignedFocusGroup,
      assigned_focus_group,
      focusGroup
    } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (position !== undefined) updateData.position = position
    if (contactNumber !== undefined) updateData.contact_number = contactNumber
    if (email !== undefined) updateData.email = email
    if (status !== undefined) updateData.status = status
    if (assignedPurokId !== undefined)
      updateData.assigned_purok_id = assignedPurokId
    if (workerType !== undefined) updateData.worker_type = workerType

    const { data: currentData, error: currentError } = await supabase
      .from('bhws')
      .select(
        'user_id, username, has_account, worker_type, email, name, assigned_focus_group'
      )
      .eq('bhw_id', id)
      .maybeSingle()
    if (currentError && !isMissingFocusColumn(currentError)) throw currentError
    // Column missing (migration not run) → refetch without it.
    let current = currentData
    let focusColumnAvailable = !isMissingFocusColumn(currentError)
    if (currentError && isMissingFocusColumn(currentError)) {
      const retry = await supabase
        .from('bhws')
        .select('user_id, username, has_account, worker_type, email, name')
        .eq('bhw_id', id)
        .maybeSingle()
      if (retry.error) throw retry.error
      current = retry.data
    }
    if (!current)
      return res.status(404).json({ success: false, message: 'BHW not found' })
    const currentDataSafe = { assigned_focus_group: null, ...current }
    const isBHW = (workerType || currentDataSafe.worker_type) === 'BHW'

    // Focus-group assignment: only BHWs. '' / null clears the assignment.
    const focusProvided =
      assignedFocusGroup !== undefined ||
      assigned_focus_group !== undefined ||
      focusGroup !== undefined
    if (focusProvided && focusColumnAvailable) {
      const normalized = normalizeFocusGroup(
        assignedFocusGroup ?? assigned_focus_group ?? focusGroup
      )
      if (normalized && !BHW_FOCUS_GROUPS.includes(normalized)) {
        const message = `Invalid focus group. Choose one of: ${BHW_FOCUS_GROUPS.map(
          g => BHW_FOCUS_GROUP_LABELS[g]
        ).join(', ')}.`
        return res.status(400).json({
          success: false,
          message,
          errors: { assignedFocusGroup: message }
        })
      }
      const nextValue = !isBHW ? null : normalized || null
      if (nextValue) {
        const holder = await findFocusGroupHolder(nextValue, id)
        if (!holder?.__missingColumn && holder)
          return focusTakenResponse(res, nextValue, holder)
        if (holder?.__missingColumn) focusColumnAvailable = false
      }
      if (focusColumnAvailable) {
        // Skip no-op writes so clearing/keeping the same group is idempotent.
        if ((currentDataSafe.assigned_focus_group || null) !== nextValue)
          updateData.assigned_focus_group = nextValue
      }
    } else if (focusProvided && !focusColumnAvailable) {
      // Migration not run yet — ignore the field instead of failing.
    }

    if (isBHW) {
      const cleanUsername = typeof username === 'string' ? username.trim() : username
      // Creating a brand-new linked account needs both halves; otherwise the
      // save would look successful while login keeps failing.
      const storedUsername = currentDataSafe.username || ''
      const newUsername = cleanUsername || ''
      if (!currentDataSafe.user_id && ((password && !newUsername) || (newUsername && newUsername !== storedUsername && !password))) {
        const missingField = newUsername ? 'password' : 'username'
        const message = 'Provide both a username and a password to create a login account.'
        return res.status(400).json({
          success: false,
          message,
          errors: { [missingField]: message }
        })
      }
      if (cleanUsername && cleanUsername.length < 3) {
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.', errors: { username: 'Username must be at least 3 characters.' } })
      }
      if (password && password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.', errors: { password: 'Password must be at least 6 characters.' } })
      }
      if (username !== undefined) updateData.username = cleanUsername || null
      if (currentDataSafe.user_id) {
        const userUpdateData = {}
        if (username !== undefined) userUpdateData.email = cleanUsername
        if (name !== undefined) userUpdateData.name = name
        if (accountRole !== undefined) {
          userUpdateData.role_display = ['BHW Worker', 'BHW Admin'].includes(
            accountRole
          )
            ? accountRole
            : 'BHW Worker'
        }
        if (password)
          userUpdateData.password_hash = await bcrypt.hash(password, 10)
        if (Object.keys(userUpdateData).length > 0) {
          await supabase
            .from('users')
            .update(userUpdateData)
            .eq('user_id', currentDataSafe.user_id)
          updateData.has_account = true
        }
      } else if (cleanUsername && password) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('user_id')
          .ilike('email', escapeIlike(cleanUsername))
          .maybeSingle()
        if (existingUser)
          return res
            .status(400)
            .json({ success: false, message: 'Username already taken', errors: { username: 'Username already taken.' } })

        const passwordHash = await bcrypt.hash(password, 10)
        const role = ['BHW Worker', 'BHW Admin'].includes(accountRole)
          ? accountRole
          : 'BHW Worker'
        const { data: userData } = await supabase
          .from('users')
          .insert({
            email: cleanUsername,
            password_hash: passwordHash,
            name: name || currentDataSafe.name,
            role_display: role
          })
          .select()
          .single()
        updateData.user_id = userData.user_id
        updateData.has_account = true
      }
    } else {
      if (currentDataSafe.user_id) {
        await supabase
          .from('users')
          .delete()
          .eq('user_id', currentDataSafe.user_id)
        updateData.user_id = null
        updateData.username = null
        updateData.has_account = false
      }
      // Non-BHW roles never hold a focus group — clear it on role change.
      if (
        focusColumnAvailable &&
        !focusProvided &&
        currentDataSafe.assigned_focus_group
      ) {
        updateData.assigned_focus_group = null
      }
    }

    if (Object.keys(updateData).length === 0)
      return res
        .status(400)
        .json({ success: false, message: 'No fields to update' })

    const { data, error } = await supabase
      .from('bhws')
      .update(updateData)
      .eq('bhw_id', id)
      .select()
      .single()
    if (error) {
      if (isMissingFocusColumn(error) && updateData.assigned_focus_group !== undefined) {
        // Migration not run yet — retry without the focus column.
        delete updateData.assigned_focus_group
        const retry = await supabase
          .from('bhws')
          .update(updateData)
          .eq('bhw_id', id)
          .select()
          .single()
        if (retry.error) throw retry.error
        if (!retry.data)
          return res
            .status(404)
            .json({ success: false, message: 'BHW not found' })
        return res.json({
          success: true,
          data: {
            id: retry.data.bhw_id,
            name: retry.data.name,
            position: retry.data.position,
            contactNumber: retry.data.contact_number,
            email: retry.data.email,
            status: retry.data.status,
            assignedPurokId: retry.data.assigned_purok_id,
            workerType: retry.data.worker_type,
            username: retry.data.username,
            hasAccount: retry.data.has_account,
            assignedFocusGroup: null
          },
          message: 'Updated successfully'
        })
      }
      // Race-condition fallback: DB unique index rejected a duplicate.
      if (error.code === '23505' && updateData.assigned_focus_group) {
        const holder = await findFocusGroupHolder(
          updateData.assigned_focus_group,
          id
        )
        if (holder && !holder.__missingColumn)
          return focusTakenResponse(res, updateData.assigned_focus_group, holder)
      }
      throw error
    }
    if (!data)
      return res.status(404).json({ success: false, message: 'BHW not found' })

    res.json({
      success: true,
      data: {
        id: data.bhw_id,
        name: data.name,
        position: data.position,
        contactNumber: data.contact_number,
        email: data.email,
        status: data.status,
        assignedPurokId: data.assigned_purok_id,
        workerType: data.worker_type,
        username: data.username,
        hasAccount: data.has_account,
        assignedFocusGroup: data.assigned_focus_group || null
      },
      message: 'Updated successfully'
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ success: false, message: 'Failed to update' })
  }
}

export const deleteBHW = async (req, res) => {
  try {
    const { id } = req.params
    const { data: bhw, error: bhwError } = await supabase
      .from('bhws')
      .select('user_id')
      .eq('bhw_id', id)
      .maybeSingle()
    if (bhwError) throw bhwError
    if (!bhw)
      return res.status(404).json({ success: false, message: 'BHW not found' })
    if (bhw?.user_id)
      await supabase.from('users').delete().eq('user_id', bhw.user_id)
    const { error } = await supabase.from('bhws').delete().eq('bhw_id', id)
    if (error) {
      if (error.code === '23503')
        return res
          .status(400)
          .json({
            success: false,
            message: 'Cannot delete with existing schedules.'
          })
      throw error
    }
    res.json({ success: true, message: 'Deleted successfully' })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ success: false, message: 'Failed to delete' })
  }
}

// Scoped profile for the logged-in BHW Worker: own record only, resolved
// from the token so IDs cannot be tampered with from the client.
export const getMyProfile = async (req, res) => {
  try {
    const bhwId = req.user?.bhwId;
    if (!bhwId) {
      return res.status(404).json({ success: false, message: 'No BHW profile linked to this account' });
    }
    req.params.id = String(bhwId);
    return getBHWById(req, res);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

export const getBHWSchedules = async (req, res) => {
  try {
    const { bhwId } = req.params

    // Get schedules where this person is the LEAD BHW
    const { data: leadSchedules, error: leadError } = await supabase
      .from('schedules')
      .select(
        `
        schedule_id, scope, date, time, type, status, 
        program_name, purpose,
        resident_id, residents:resident_id (name, puroks:purok_id (name)),
        bhw_id, bhws:bhw_id (name)
      `
      )
      .eq('bhw_id', bhwId)
      .order('date', { ascending: true })

    if (leadError) throw leadError

    // Get schedules where this person is ASSIGNED in schedule_bhws
    const { data: assignedSchedules, error: assignedError } = await supabase
      .from('schedule_bhws')
      .select(
        `
        schedule_id,
        schedules:schedule_id (
          schedule_id, scope, date, time, type, status,
          program_name, purpose,
          resident_id, residents:resident_id (name, puroks:purok_id (name)),
          bhw_id, bhws:bhw_id (name)
        )
      `
      )
      .eq('bhw_id', bhwId)

    if (assignedError) throw assignedError

    // Combine and deduplicate
    const allScheduleIds = new Set()
    const allSchedules = []

    ;(leadSchedules || []).forEach(schedule => {
      if (!allScheduleIds.has(schedule.schedule_id)) {
        allScheduleIds.add(schedule.schedule_id)
        allSchedules.push(schedule)
      }
    })

    ;(assignedSchedules || []).forEach(item => {
      if (item.schedules && !allScheduleIds.has(item.schedules.schedule_id)) {
        allScheduleIds.add(item.schedules.schedule_id)
        allSchedules.push(item.schedules)
      }
    })

    const schedules = allSchedules.map(schedule => ({
      id: schedule.schedule_id,
      scope: schedule.scope,
      date: schedule.date,
      time: schedule.time,
      type: schedule.type,
      status: schedule.status,
      programName: schedule.program_name || null,
      purpose: schedule.purpose || null,
      residentName:
        schedule.residents?.name ||
        (schedule.scope !== 'individual' ? 'Multiple Residents' : 'Unknown'),
      purok: schedule.residents?.puroks?.name || null,
      residentId: schedule.resident_id
    }))

    schedules.sort((a, b) => new Date(a.date) - new Date(b.date))

    res.json({ success: true, data: schedules })
  } catch (error) {
    console.error('Error fetching BHW schedules:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch schedules' })
  }
}
