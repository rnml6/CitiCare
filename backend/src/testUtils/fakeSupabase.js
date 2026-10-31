// In-memory PostgREST-lite used only by the endpoint tests.
//
// It implements the subset of the supabase-js query builder the controllers
// use: select/insert/update/delete/upsert, eq/neq/in/ilike/or/not/match,
// gt/gte/lt/lte, order/limit/range, single/maybeSingle, and exact counts.
// It is intentionally forgiving: unknown columns and nested selects are
// ignored so route-level tests exercise controllers, not PostgREST itself.

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))

const getPath = (row, column) => {
  if (!row || typeof row !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column]
  return column.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), row)
}

const looseEqual = (left, right) => {
  if (left === right) return true
  if (left == null || right == null) return false
  return String(left) === String(right)
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const ilikeToRegex = (pattern) => {
  const source = escapeRegex(pattern).replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${source}$`, 'i')
}

const parseOrExpression = (expression) => {
  // Supports the forms used by the controllers:
  //   name.ilike.%term%,email.ilike.%term%
  //   resident_id.eq.1,schedule_id.eq.2
  return String(expression)
    .split(',')
    .map((part) => {
      const first = part.indexOf('.')
      const second = part.indexOf('.', first + 1)
      if (first < 0 || second < 0) return null
      return {
        column: part.slice(0, first),
        op: part.slice(first + 1, second),
        value: part.slice(second + 1)
      }
    })
    .filter(Boolean)
}

const applyCondition = (row, condition) => {
  const { column, op, value } = condition
  const actual = getPath(row, column)
  switch (op) {
    case 'eq':
      return looseEqual(actual, value)
    case 'neq':
      return !looseEqual(actual, value)
    case 'in':
      return (Array.isArray(value) ? value : []).some((item) => looseEqual(actual, item))
    case 'ilike':
      return ilikeToRegex(String(value)).test(String(actual ?? ''))
    case 'like':
      return new RegExp(`^${escapeRegex(String(value)).replace(/%/g, '.*')}$`).test(String(actual ?? ''))
    case 'gt':
      return Number(actual) > Number(value)
    case 'gte':
      return Number(actual) >= Number(value)
    case 'lt':
      return Number(actual) < Number(value)
    case 'lte':
      return Number(actual) <= Number(value)
    case 'is':
      return value === null ? actual == null : looseEqual(actual, value)
    case 'not':
      return !looseEqual(actual, value)
    case '__not__':
      return true
    default:
      return true
  }
}

const tableIdField = (table) =>
  ({
    users: 'user_id',
    bhws: 'bhw_id',
    puroks: 'purok_id',
    residents: 'resident_id',
    schedules: 'schedule_id',
    medicine_master: 'id',
    medical_histories: 'history_id',
    medical_history_vitals: 'id',
    resident_vital_signs: 'id',
    resident_allergies: 'id',
    resident_chronic_conditions: 'id',
    resident_medications: 'id',
    resident_medicine_records: 'record_id',
    schedule_bhws: 'id',
    schedule_participants: 'id'
  })[table] || 'id'

export const seedData = () => ({
  users: [
    {
      user_id: 'admin-user-1',
      email: 'admin@example.test',
      username: 'admin',
      name: 'Test Administrator',
      role: 'admin',
      role_display: 'Administrator',
      is_active: true,
      has_account: true,
      password_hash: '$2a$10$invalidhashinvalidhashinvalidhashinvalidhashinvalidha'
    },
    {
      user_id: 'bhw-user-1',
      email: 'worker@example.test',
      username: 'worker',
      name: 'Test Worker',
      role: 'BHW Worker',
      role_display: 'BHW Worker',
      is_active: true,
      has_account: true,
      password_hash: '$2a$10$invalidhashinvalidhashinvalidhashinvalidhashinvalidha'
    }
  ],
  bhws: [
    {
      bhw_id: 'bhw-1',
      user_id: 'bhw-user-1',
      name: 'Test Worker',
      position: 'Barangay Health Worker',
      worker_type: 'BHW',
      assigned_purok_id: 'purok-1',
      assigned_focus_group: null,
      email: 'worker@example.test',
      username: 'worker',
      contact_number: '09171234567',
      status: 'Active',
      has_account: true
    }
  ],
  puroks: [
    {
      purok_id: 'purok-1',
      id: 'purok-1',
      name: 'Purok 1',
      latitude: 14.5,
      longitude: 121.0,
      pin_label: 'P1'
    }
  ],
  residents: [
    {
      resident_id: 'resident-1',
      name: 'Maria Santos',
      date_of_birth: '1990-01-15',
      age: 36,
      gender: 'Female',
      civil_status: 'Single',
      purok_id: 'purok-1',
      contact_number: '09171234567',
      last_checkup: '2026-01-10',
      risk_level: 'Low',
      focus_groups: [],
      is_pwd: false,
      status: 'Active'
    }
  ],
  schedules: [
    {
      schedule_id: 'schedule-1',
      date: '2026-11-01',
      time: '09:00',
      type: 'Checkup',
      scope: 'individual',
      status: 'Scheduled',
      resident_id: 'resident-1',
      purok_id: 'purok-1',
      bhw_id: 'bhw-1',
      duration: 30
    }
  ],
  medicine_master: [
    {
      id: 'medicine-1',
      medicine_name: 'Vitamin A',
      category: 'vitamins',
      total_doses: 1,
      target_group: 'all',
      is_active: true
    }
  ],
  medical_histories: [],
  medical_history_vitals: [],
  resident_vital_signs: [],
  resident_allergies: [],
  resident_chronic_conditions: [],
  resident_medications: [],
  resident_medicine_records: [
    {
      id: 'record-1',
      resident_id: 'resident-1',
      medicine_master_id: 'medicine-1',
      medicine_name: 'Vitamin A',
      category: 'vitamins',
      dose_number: 1,
      total_doses: 1,
      date_administered: '2026-01-01'
    }
  ],
  schedule_bhws: [],
  schedule_participants: [
    {
      id: 'participant-1',
      schedule_id: 'schedule-1',
      resident_id: 'resident-1',
      status: 'Registered',
      attendance_status: 'Pending'
    }
  ]
})

export const createFakeSupabase = (initial = seedData()) => {
  const tables = new Map(
    Object.entries(initial).map(([name, rows]) => [name, rows.map((row) => clone(row))])
  )
  let nextId = 1
  const calls = []

  const getTable = (name) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)
  }

  // Minimal unique-constraint emulation for columns whose controllers rely
  // on PostgREST returning 23505 rather than doing a pre-check.
  const uniqueColumns = {
    puroks: ['name'],
    users: ['email']
  }

  const uniqueConflict = (table, payload, rows) => {
    for (const column of uniqueColumns[table] || []) {
      const value = payload?.[column]
      if (value === undefined || value === null) continue
      const duplicate = rows.some(
        (row) =>
          row?.[column] !== undefined &&
          row?.[column] !== null &&
          String(row[column]).toLowerCase() === String(value).toLowerCase()
      )
      if (duplicate) {
        return {
          code: '23505',
          message: `duplicate key value violates unique constraint "${table}_${column}_key"`,
          details: ''
        }
      }
    }
    return null
  }

  const execute = (state) => {
    const rows = getTable(state.table)
    calls.push({
      table: state.table,
      operation: state.operation,
      columns: state.columns,
      filters: clone(state.filters),
      payload: clone(state.payload)
    })

    if (state.operation === 'insert' || state.operation === 'upsert') {
      const payloads = Array.isArray(state.payload) ? state.payload : [state.payload]
      if (state.operation === 'insert') {
        for (const payload of payloads) {
          const conflict = uniqueConflict(state.table, payload, rows)
          if (conflict) return finalise(state, null, conflict, 0)
        }
      }
      const inserted = payloads.map((payload) => {
        const record = clone(payload) || {}
        const idField = tableIdField(state.table)
        if (record[idField] === undefined) {
          record[idField] = `${state.table}-${nextId++}`
        }
        if (record.id === undefined && idField !== 'id') record.id = record[idField]
        const existingIndex =
          state.operation === 'upsert'
            ? rows.findIndex((row) => looseEqual(getPath(row, idField), getPath(record, idField)))
            : -1
        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], ...record }
          return clone(rows[existingIndex])
        }
        rows.push(record)
        return clone(record)
      })
      const data = state.returning ? inserted : null
      return finalise(state, data, null, inserted.length)
    }

    const matched = rows.filter((row) =>
      state.filters.every((filter) => {
        if (typeof filter.apply === 'function') return filter.apply(row)
        if (filter.notOperator) {
          return !applyCondition(row, {
            column: filter.column,
            op: filter.notOperator,
            value: filter.value
          })
        }
        return applyCondition(row, filter)
      })
    )

    if (state.operation === 'update') {
      const payload = clone(state.payload) || {}
      for (const column of uniqueColumns[state.table] || []) {
        const value = payload[column]
        if (value === undefined || value === null) continue
        const others = rows.filter((row) => !matched.includes(row))
        const conflict = uniqueConflict(state.table, payload, others)
        if (conflict) return finalise(state, null, conflict, 0)
      }
      const updated = matched.map((row) => {
        Object.assign(row, payload)
        return clone(row)
      })
      return finalise(state, state.returning ? updated : null, null, updated.length)
    }

    if (state.operation === 'delete') {
      const deleted = matched.map((row) => clone(row))
      // Remove the matched row references, not the clones returned to the
      // caller, so a subsequent query sees the deletion.
      for (const row of matched) {
        const index = rows.indexOf(row)
        if (index >= 0) rows.splice(index, 1)
      }
      return finalise(state, state.returning ? deleted : null, null, deleted.length)
    }

    let data = matched.map((row) => clone(row))

    for (const { column, ascending } of state.orders) {
      data.sort((a, b) => {
        const av = getPath(a, column)
        const bv = getPath(b, column)
        if (av === bv) return 0
        const result = av == null ? 1 : bv == null ? -1 : av > bv ? 1 : -1
        return ascending === false ? -result : result
      })
    }

    if (state.range) {
      data = data.slice(state.range.from, state.range.to + 1)
    } else if (state.limit != null) {
      data = data.slice(0, state.limit)
    }

    const count = state.options?.count === 'exact' ? matched.length : null
    if (state.options?.head) return { data: null, error: null, count, status: 200, statusText: 'OK' }

    return finalise(state, data, null, count)
  }

  const finalise = (state, data, error, count) => {
    let resolved = data
    if (state.singleMode === 'single') {
      if (Array.isArray(data)) {
        if (data.length !== 1) {
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
              details: `The result contains ${data.length} rows`
            },
            count,
            status: 406,
            statusText: 'Not Acceptable'
          }
        }
        resolved = data[0]
      }
    } else if (state.singleMode === 'maybeSingle') {
      resolved = Array.isArray(data) ? data[0] ?? null : data ?? null
    }
    return { data: resolved, error, count, status: 200, statusText: 'OK' }
  }

  const createBuilder = (table) => {
    const state = {
      table,
      operation: null,
      payload: null,
      columns: '*',
      options: {},
      filters: [],
      orders: [],
      limit: null,
      range: null,
      returning: false,
      singleMode: null
    }

    const builder = {
      select(columns = '*', options = {}) {
        if (!state.operation) state.operation = 'select'
        else state.returning = true
        state.columns = columns
        state.options = { ...state.options, ...options }
        return builder
      },
      insert(payload) {
        state.operation = 'insert'
        state.payload = payload
        return builder
      },
      update(payload) {
        state.operation = 'update'
        state.payload = payload
        return builder
      },
      upsert(payload) {
        state.operation = 'upsert'
        state.payload = payload
        return builder
      },
      delete() {
        state.operation = 'delete'
        return builder
      },
      eq(column, value) {
        state.filters.push({ column, op: 'eq', value })
        return builder
      },
      neq(column, value) {
        state.filters.push({ column, op: 'neq', value })
        return builder
      },
      in(column, value) {
        state.filters.push({ column, op: 'in', value })
        return builder
      },
      is(column, value) {
        state.filters.push({ column, op: 'is', value })
        return builder
      },
      gt(column, value) {
        state.filters.push({ column, op: 'gt', value })
        return builder
      },
      gte(column, value) {
        state.filters.push({ column, op: 'gte', value })
        return builder
      },
      lt(column, value) {
        state.filters.push({ column, op: 'lt', value })
        return builder
      },
      lte(column, value) {
        state.filters.push({ column, op: 'lte', value })
        return builder
      },
      ilike(column, value) {
        state.filters.push({ column, op: 'ilike', value })
        return builder
      },
      or(expression) {
        const conditions = parseOrExpression(expression)
        state.filters.push({ column: '__or__', op: 'or', value: conditions })
        const originalFilter = state.filters[state.filters.length - 1]
        originalFilter.apply = (row) => conditions.some((condition) => applyCondition(row, condition))
        return builder
      },
      not(column, operator, value) {
        state.filters.push({ column, op: 'not', value, notOperator: operator })
        return builder
      },
      match(object) {
        for (const [column, value] of Object.entries(object || {})) {
          state.filters.push({ column, op: 'eq', value })
        }
        return builder
      },
      order(column, options = {}) {
        state.orders.push({ column, ascending: options.ascending !== false })
        return builder
      },
      limit(value) {
        state.limit = value
        return builder
      },
      range(from, to) {
        state.range = { from, to }
        return builder
      },
      single() {
        state.singleMode = 'single'
        return builder
      },
      maybeSingle() {
        state.singleMode = 'maybeSingle'
        return builder
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve()
          .then(() => execute(state))
          .then(onFulfilled, onRejected)
      },
      catch(onRejected) {
        return builder.then(undefined, onRejected)
      },
      finally(onFinally) {
        return builder.then(
          (value) => {
            onFinally?.()
            return value
          },
          (error) => {
            onFinally?.()
            throw error
          }
        )
      }
    }
    return builder
  }

  const supabase = {
    from: (table) => createBuilder(table),
    __tables: tables,
    __calls: calls,
    __reset: () => {
      tables.clear()
      for (const [name, rows] of Object.entries(initial)) {
        tables.set(name, rows.map((row) => clone(row)))
      }
      calls.length = 0
    }
  }

  return { supabase, supabaseClient: supabase, tables, calls }
}
