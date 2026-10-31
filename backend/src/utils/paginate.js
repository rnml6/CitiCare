// Supabase/PostgREST silently caps a single response at 1000 rows. Any list
// endpoint that can grow past that (schedules, residents, ...) must page
// through the result set, otherwise the newest/oldest rows vanish with no
// error — which looks exactly like "the record I just created is missing".

export const POSTGREST_PAGE_SIZE = 1000;

// Run a paginated SELECT.
//
// `buildQuery` must return a *fresh* query builder each call, e.g.
//   fetchAllRows(() => supabase.from('schedules').select('*').order('schedule_id'))
// The same filters/ordering is applied to every page. Ordering must be
// deterministic (include a unique column such as schedule_id as the last
// order key) or rows can be duplicated/skipped between pages.
export const fetchAllRows = async (buildQuery, pageSize = POSTGREST_PAGE_SIZE) => {
  if (typeof buildQuery !== 'function') {
    throw new TypeError('fetchAllRows expects a query factory function');
  }
  const size = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : POSTGREST_PAGE_SIZE;

  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await buildQuery().range(from, from + size - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < size) return rows;
  }
};

// Split a list into fixed-size chunks. Used to keep PostgREST `in.(...)`
// filters inside the URL/header limits when the id list is large.
export const chunk = (items, size = 500) => {
  const list = Array.isArray(items) ? items : [];
  const step = Number.isFinite(size) && size > 0 ? Math.floor(size) : 500;
  const out = [];
  for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
  return out;
};
