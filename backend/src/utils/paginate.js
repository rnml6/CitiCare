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

// Fetch rows for a potentially huge resident-id list in batches.
// PostgREST rejects URLs carrying thousands of ids, and each batch is still
// paged because a single response is capped at 1000 rows. Batches are issued
// concurrently (a few at a time) so a barangay-wide report costs a couple of
// round-trip waves instead of one remote call per 200 residents.
const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

export const fetchRowsForIds = async (ids, buildQuery, batchSize = 500, concurrency = 4) => {
  const unique = [...new Set((ids || []).filter((v) => v !== null && v !== undefined))];
  const batches = chunk(unique, batchSize);
  const pages = await mapWithConcurrency(batches, concurrency, (batch) => fetchAllRows(() => buildQuery(batch)));
  return pages.flat();
};
