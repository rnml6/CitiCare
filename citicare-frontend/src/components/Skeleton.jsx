// components/Skeleton.jsx
// Skeleton placeholders mirror the real layout of each page / modal / tab so
// the loading state "shimmers" in the shape of the content that will appear.
// Each exported skeleton matches one expected content type:
//   Page      -> full list-page layout (header + search + filters + cards + pagination)
//   Modal     -> modal body layout (header rows + sections + footer actions)
//   Tab/inner -> inner tab/list section only (rows that sit inside an already
//                rendered card/modal while its tab data reloads).
const Skeleton = ({ className = 'h-4', circle = false }) => {
  return (
    <div
      aria-hidden='true'
      className={`skeleton-shimmer ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}
    />
  )
}

// Pagination footer (Showing X - Y of Z + Prev/Next)
export const SkeletonPagination = () => {
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-white/10'>
      <Skeleton className='h-3 w-36' />
      <div className='flex items-center gap-1.5'>
        <Skeleton className='h-8 w-20 rounded-lg' />
        <Skeleton className='h-8 w-20 rounded-lg' />
      </div>
    </div>
  )
}

// Notification list
// dropdown -> border-b rows with w-8 icon (Header dropdown)
// cards    -> bg-white/5 rounded cards with w-10 icon (All Notifications modal)
export const SkeletonNotificationList = ({ count = 4, variant = 'dropdown' }) => {
  if (variant === 'cards') {
    return (
      <div className='space-y-2'>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className='bg-white/5 rounded-lg p-4 flex items-start gap-3'>
            <Skeleton className='w-10 h-10 rounded-lg shrink-0' />
            <div className='flex-1 space-y-2 pt-0.5 min-w-0'>
              <div className='flex items-center justify-between mb-1'>
                <Skeleton className='h-3 w-20' />
                <Skeleton className='h-3 w-16' />
              </div>
              <Skeleton className='h-4 w-2/3' />
              <Skeleton className='h-3 w-1/2' />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className='divide-y divide-white/5'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='p-4 flex items-start gap-3'>
          <Skeleton className='w-8 h-8 rounded-lg shrink-0' />
          <div className='flex-1 space-y-2 min-w-0'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-2.5 w-16' />
              <Skeleton className='h-2.5 w-12' />
            </div>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
      ))}
    </div>
  )
}

// Dashboard stat cards (mirrors StatCard: gradient icon box + uppercase label + big value)
export const SkeletonStatCards = ({ count = 4, scroll = false }) => {
  return (
    <div className={scroll ? 'dashboard-stat-scroll flex flex-nowrap gap-4 overflow-hidden pb-3 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0' : 'grid grid-cols-2 lg:grid-cols-4 gap-4'}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`stat-card ${scroll ? 'w-[11rem] shrink-0 lg:w-auto' : ''}`}>
          <Skeleton className='w-10 h-10 sm:w-11 sm:h-11 rounded-xl shrink-0' />
          <div className='flex-1 space-y-1.5 min-w-0'>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-7 w-14' />
          </div>
        </div>
      ))}
    </div>
  )
}

// Chart / card block with header
export const SkeletonChart = ({ titleWidth = 'w-56', height = 'h-64' }) => {
  return (
    <div className='glass-card space-y-4'>
      <Skeleton className={`h-5 ${titleWidth}`} />
      <Skeleton className={`w-full ${height}`} />
    </div>
  )
}

// Generic table rows (dashboard activities, detail lists)
export const SkeletonTable = ({ rows = 5, columns = 5, header = true }) => {
  return (
    <div className='glass-card space-y-4'>
      <Skeleton className='h-4 w-40' />
      <div className='space-y-3'>
        {header && (
          <div className='flex gap-4 border-b border-white/10 pb-3'>
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={`h-${i}`} className='h-3 flex-1' />
            ))}
          </div>
        )}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className='flex gap-4'>
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={`r-${i}-${j}`} className='h-3 flex-1' />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Compact date-block schedule rows (mirrors BHW detail / purok schedule
// sub-lists: date block + scope/title + time/type + status badge)
export const SkeletonScheduleCards = ({ count = 4 }) => {
  return (
    <div className='space-y-2'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/5'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='text-center space-y-1 min-w-[40px]'>
              <Skeleton className='h-4 w-6 mx-auto' />
              <Skeleton className='h-3 w-8 mx-auto' />
            </div>
            <div className='space-y-1.5 min-w-0'>
              <Skeleton className='h-3 w-16' />
              <Skeleton className='h-3.5 w-40 max-w-full' />
              <div className='flex items-center gap-2'>
                <Skeleton className='h-3 w-16' />
                <Skeleton className='h-3 w-12' />
              </div>
            </div>
          </div>
          <Skeleton className='h-5 w-20 rounded-md shrink-0' />
        </div>
      ))}
    </div>
  )
}

// Compact table (inside detail pages)
export const SkeletonTableCompact = ({ rows = 4, columns = 4 }) => {
  return (
    <div className='space-y-3'>
      <div className='flex gap-4 border-b border-white/10 pb-3'>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className='h-3 flex-1' />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='flex gap-4'>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={`r-${i}-${j}`} className='h-3 flex-1' />
          ))}
        </div>
      ))}
    </div>
  )
}

// Schedule list rows (mirrors Schedules list card: date block + divider +
// scope/status badges + title + time/type/location meta + delete always +
// edit only when Scheduled)
export const SkeletonScheduleList = ({ count = 4 }) => {
  return (
    <div className='space-y-4'>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className='glass-card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4'
        >
          <div className='flex items-center gap-4 min-w-0 flex-1'>
            <div className='text-center space-y-1.5 min-w-[65px]'>
              <Skeleton className='h-7 w-8 mx-auto' />
              <Skeleton className='h-3 w-10 mx-auto' />
              <Skeleton className='h-2.5 w-8 mx-auto' />
            </div>
            <Skeleton className='h-16 w-px hidden lg:block' />
            <div className='space-y-2.5 min-w-0 flex-1'>
              <div className='flex gap-2'>
                <Skeleton className='h-5 w-20 rounded-full' />
                <Skeleton className='h-5 w-16 rounded-full' />
              </div>
              <Skeleton className='h-5 w-64 max-w-full' />
              <div className='flex gap-3'>
                <Skeleton className='h-3 w-20' />
                <Skeleton className='h-3 w-14' />
                <Skeleton className='h-3 w-24' />
              </div>
            </div>
          </div>
          <div className='flex items-center space-x-2 ml-[81px] lg:ml-0'>
            <div className='flex space-x-1'>
              {i % 2 === 0 && <Skeleton className='w-8 h-8 rounded-lg' />}
              <Skeleton className='w-8 h-8 rounded-lg' />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Resident row (mirrors Residents card: name + age/gender/purok, focus pills,
// risk badge + edit/delete icon buttons)
export const SkeletonResidentRow = ({ count = 6 }) => {
  return (
    <div className='grid grid-cols-1 gap-3'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='glass-card'>
          <div className='flex flex-col sm:flex-row sm:items-center gap-3'>
            <div className='flex items-center gap-3 sm:flex-1 min-w-0'>
              <div className='min-w-0 space-y-2 flex-1'>
                <Skeleton className='h-5 w-48' />
                <Skeleton className='h-3 w-64 max-w-full' />
              </div>
            </div>
            <div className='flex gap-1.5 shrink-0'>
              <Skeleton className='h-5 w-16 rounded-full' />
              <Skeleton className='h-5 w-24 rounded-full' />
            </div>
            <div className='flex items-center justify-between gap-3 sm:shrink-0'>
              <Skeleton className='h-6 w-20 rounded-md' />
              <div className='flex items-center gap-1'>
                <Skeleton className='w-7 h-7 rounded-lg' />
                <Skeleton className='w-7 h-7 rounded-lg' />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// BHW card (mirrors BHW card: name + position + chevron, then status +
// assigned-purok + focus-group badges + edit/delete buttons)
export const SkeletonBHWCard = ({ count = 6 }) => {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='glass-card'>
          <div className='flex items-start justify-between mb-4'>
            <div className='space-y-2 min-w-0'>
              <Skeleton className='h-5 w-36' />
              <Skeleton className='h-4 w-24' />
            </div>
            <Skeleton className='w-5 h-5 shrink-0' />
          </div>
          <div className='flex items-center justify-between mt-3 pt-3 border-t border-white/10'>
            <div className='flex items-center gap-2 min-w-0 flex-wrap'>
              <Skeleton className='h-6 w-16 rounded-md' />
              <Skeleton className='h-6 w-20 rounded-md' />
              <Skeleton className='h-6 w-24 rounded-md' />
            </div>
            <div className='flex gap-1 shrink-0'>
              <Skeleton className='w-8 h-8 rounded-lg' />
              <Skeleton className='w-8 h-8 rounded-lg' />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Medicine card (mirrors medicine card: title + category/target pills +
// edit/delete, then doses row + description)
export const SkeletonMedicineCard = ({ count = 6 }) => {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='glass-card space-y-3'>
          <div className='flex items-start justify-between mb-3 gap-2'>
            <div className='space-y-2 flex-1 min-w-0'>
              <Skeleton className='h-6 w-36' />
              <div className='flex gap-2'>
                <Skeleton className='h-5 w-16 rounded-full' />
                <Skeleton className='h-5 w-20 rounded-full' />
              </div>
            </div>
            <div className='flex gap-1 ml-2'>
              <Skeleton className='w-8 h-8 rounded-lg' />
              <Skeleton className='w-8 h-8 rounded-lg' />
            </div>
          </div>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-3 w-16' />
          </div>
          <Skeleton className='h-3 w-11/12' />
        </div>
      ))}
    </div>
  )
}

// Purok card (mirrors purok card: big name + risk badge + delete, then
// Users icon + resident count + "Click to view details" + chevron, then
// BHW-assignment badge + schedule-count badge row)
export const SkeletonPurokCards = ({ count = 6 }) => {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='glass-card space-y-4'>
          <div className='flex items-center justify-between mb-1 gap-2'>
            <div className='flex items-center gap-2 min-w-0'>
              <Skeleton className='h-7 w-28' />
              <Skeleton className='h-5 w-16 rounded-full' />
            </div>
            <Skeleton className='w-8 h-8 rounded-lg shrink-0' />
          </div>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-1.5'>
              <Skeleton className='w-5 h-5' />
              <Skeleton className='h-7 w-10' />
            </div>
            <div className='flex items-center gap-1.5'>
              <Skeleton className='h-3 w-28' />
              <Skeleton className='w-4 h-4' />
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2 pt-3 border-t border-white/10'>
            <Skeleton className='h-5 w-28 rounded-full' />
            <Skeleton className='h-5 w-24 rounded-full' />
          </div>
        </div>
      ))}
    </div>
  )
}

// Purok detail / assign modal sub-lists.
// variant 'resident' mirrors the resident row: risk badge + name +
// age/gender + last-checkup + "View Full Profile" link.
// variant 'bhw' mirrors the assigned BHW row: "Name • Position" on one line,
// contact number + remove (X) action on the right.
export const SkeletonPurokDetailList = ({ rows = 3, variant = 'resident' }) => {
  if (variant === 'bhw') {
    return (
      <div className='space-y-2'>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className='flex items-center justify-between bg-white/5 rounded-lg p-3 gap-3'>
            <div className='min-w-0 flex-1'>
              <Skeleton className='h-3.5 w-52 max-w-full' />
            </div>
            <div className='flex items-center gap-2 shrink-0'>
              <Skeleton className='h-3 w-20' />
              <Skeleton className='w-3.5 h-3.5 rounded' />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className='space-y-2'>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='bg-white/5 rounded-lg p-3'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
            <Skeleton className='h-5 w-16 rounded-full' />
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-3 w-28' />
            <Skeleton className='h-3 w-24 ml-auto' />
          </div>
        </div>
      ))}
    </div>
  )
}

// Purok detail modal (mirrors renderPurokDetailContent: name + risk badge +
// edit/delete, 5-stat strip, Assigned BHW list + Assign link, Residents w/
// small search + 2 small selects, Schedules w/ small search + 2 small
// selects + List/Calendar toggles)
export const SkeletonPurokDetail = () => {
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-3 min-w-0 flex-wrap'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
        </div>
        <div className='flex gap-2 shrink-0'>
          <Skeleton className='h-10 w-10 rounded-xl' />
          <Skeleton className='h-10 w-10 rounded-xl' />
        </div>
      </div>
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 text-center gap-y-3 divide-x divide-white/10 !mt-6'>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className='px-2 space-y-1.5'>
            <Skeleton className='h-8 w-10 mx-auto' />
            <Skeleton className='h-2.5 w-12 mx-auto' />
          </div>
        ))}
      </div>
      <hr className='border-white/10' />
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-3.5 w-48' />
          <Skeleton className='h-3 w-20' />
        </div>
        <SkeletonPurokDetailList rows={3} variant='bhw' />
      </div>
      <hr className='border-white/10' />
      <hr className='border-white/10' />
      <div className='space-y-3'>
        <Skeleton className='h-3.5 w-32' />
        <div className='flex flex-wrap items-center gap-2'>
          <Skeleton className='h-8 flex-1 rounded-lg' />
          <Skeleton className='h-8 w-24 max-w-full rounded-lg' />
          <Skeleton className='h-8 w-24 max-w-full rounded-lg' />
        </div>
        <SkeletonPurokDetailList rows={3} variant='resident' />
      </div>
      <hr className='border-white/10' />
      <hr className='border-white/10' />
      <div className='space-y-3'>
        <Skeleton className='h-3.5 w-32' />
        <div className='flex flex-wrap items-center gap-2'>
          <Skeleton className='h-8 flex-1 rounded-lg' />
          <Skeleton className='h-8 w-24 max-w-full rounded-lg' />
          <Skeleton className='h-8 w-24 max-w-full rounded-lg' />
          <Skeleton className='h-8 w-[72px] max-w-full rounded-lg' />
          <Skeleton className='h-8 w-[92px] max-w-full rounded-lg' />
        </div>
        <SkeletonScheduleCards count={2} />
      </div>
    </div>
  )
}

// Form field group helper (label + input)
const SkeletonField = ({ labelWidth = 'w-20' }) => {
  return (
    <div className='space-y-1.5'>
      <Skeleton className={`h-3 ${labelWidth}`} />
      <Skeleton className='h-11 w-full rounded-xl' />
    </div>
  )
}

// Form textarea helper (label + taller box)
const SkeletonTextarea = ({ labelWidth = 'w-20' }) => {
  return (
    <div className='space-y-1.5'>
      <Skeleton className={`h-3 ${labelWidth}`} />
      <Skeleton className='h-24 w-full rounded-xl' />
    </div>
  )
}

// Resident form page skeleton (mirrors ResidentForm: Back button + title +
// Add/Edit Modally + Cancel action row, Personal Information x8, Vital
// Signs x7, Focus Groups checkbox cards, Emergency Contact with full-width
// address, Cancel + Save footer)
export const SkeletonResidentForm = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <Skeleton className='h-5 w-40' />
      <Skeleton className='h-7 w-56' />
      <div className='flex space-x-3'>
        <Skeleton className='h-11 w-32 rounded-xl' />
        <Skeleton className='h-11 w-28 rounded-xl' />
      </div>
      <div className='glass-card space-y-5'>
        <Skeleton className='h-5 w-44' />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <SkeletonField labelWidth='w-20' />
          <div className='grid grid-cols-2 gap-3'>
            <SkeletonField labelWidth='w-24' />
            <SkeletonField labelWidth='w-16' />
          </div>
          <SkeletonField labelWidth='w-16' />
          <SkeletonField labelWidth='w-24' />
          <SkeletonField labelWidth='w-24' />
          <SkeletonField labelWidth='w-20' />
          <SkeletonField labelWidth='w-16' />
          <SkeletonField labelWidth='w-28' />
        </div>
      </div>
      <div className='glass-card space-y-5'>
        <Skeleton className='h-5 w-40' />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonField key={i} labelWidth='w-24' />
          ))}
        </div>
      </div>
      <div className='glass-card space-y-4'>
        <Skeleton className='h-5 w-36' />
        <div className='grid grid-cols-2 gap-2'>
          <Skeleton className='h-12 w-full rounded-xl' />
          <Skeleton className='h-12 w-full rounded-xl' />
        </div>
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-6 w-24 rounded-full' />
          <Skeleton className='h-6 w-20 rounded-full' />
          <Skeleton className='h-6 w-28 rounded-full' />
        </div>
      </div>
      <div className='glass-card space-y-5'>
        <Skeleton className='h-5 w-40' />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <SkeletonField labelWidth='w-28' />
          <SkeletonField labelWidth='w-36' />
        </div>
        <SkeletonField labelWidth='w-40' />
      </div>
      <div className='flex justify-end flex-wrap gap-3'>
        <Skeleton className='h-11 w-28 rounded-xl' />
        <Skeleton className='h-11 w-44 rounded-xl' />
      </div>
    </div>
  )
}

// BHW form page skeleton (mirrors BHWForm: Back + title, Professional
// Information with position combobox + name + contact/email 2-col + status +
// conditional Assigned Purok, conditional Login Credentials with
// generate-password link + hint, info notice, Cancel + Save footer)
export const SkeletonBHWForm = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex items-center gap-3'>
        <Skeleton className='w-8 h-8 rounded-lg' />
        <Skeleton className='h-7 w-64' />
      </div>
      <div className='glass-card space-y-4'>
        <Skeleton className='h-5 w-52' />
        <SkeletonField labelWidth='w-20' />
        <SkeletonField labelWidth='w-20' />
        <div className='grid grid-cols-2 gap-3'>
          <SkeletonField labelWidth='w-28' />
          <SkeletonField labelWidth='w-16' />
        </div>
        <SkeletonField labelWidth='w-16' />
        <SkeletonField labelWidth='w-28' />
      </div>
      <div className='glass-card space-y-4'>
        <Skeleton className='h-5 w-40' />
        <div className='grid grid-cols-2 gap-3'>
          <SkeletonField labelWidth='w-20' />
          <SkeletonField labelWidth='w-24' />
        </div>
        <SkeletonField labelWidth='w-20' />
        <Skeleton className='h-3 w-32' />
        <Skeleton className='h-3 w-48' />
      </div>
      <div className='flex justify-end gap-3'>
        <Skeleton className='h-11 w-28 rounded-xl' />
        <Skeleton className='h-11 w-48 rounded-xl' />
      </div>
    </div>
  )
}

// Schedule form page skeleton (mirrors ScheduleForm: Back + title + scope
// segmented toggle, individual-scope info card (resident + date/time/type +
// purpose + location/contact), Healthcare Professionals + Assigned BHWs
// lists (start empty with "None assigned" hint), additional notes, footer)
export const SkeletonScheduleForm = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex items-center gap-3'>
        <Skeleton className='w-8 h-8 rounded-lg' />
        <Skeleton className='h-7 w-52' />
      </div>
      <div className='flex bg-white/10 rounded-xl p-1 border border-white/20 gap-1'>
        <Skeleton className='h-10 flex-1 rounded-[10px]' />
        <Skeleton className='h-10 flex-1 rounded-[10px]' />
        <Skeleton className='h-10 flex-1 rounded-[10px]' />
      </div>
      <div className='glass-card space-y-5'>
        <Skeleton className='h-5 w-40' />
        <SkeletonField labelWidth='w-20' />
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <SkeletonField labelWidth='w-16' />
          <SkeletonField labelWidth='w-16' />
          <SkeletonField labelWidth='w-16' />
        </div>
        <SkeletonTextarea labelWidth='w-20' />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <SkeletonField labelWidth='w-28' />
          <SkeletonField labelWidth='w-28' />
        </div>
      </div>
      <div className='glass-card space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-5 w-52' />
          <Skeleton className='h-8 w-16 rounded-lg' />
        </div>
        <Skeleton className='h-3 w-32' />
      </div>
      <div className='glass-card space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-5 w-40' />
          <Skeleton className='h-8 w-16 rounded-lg' />
        </div>
        <Skeleton className='h-3 w-28' />
      </div>
      <div className='glass-card space-y-4'>
        <Skeleton className='h-5 w-44' />
        <SkeletonTextarea labelWidth='w-32' />
      </div>
      <div className='flex justify-end flex-wrap gap-3'>
        <Skeleton className='h-11 w-28 rounded-xl' />
        <Skeleton className='h-11 w-40 rounded-xl' />
      </div>
    </div>
  )
}

// Resident detail page skeleton (mirrors ResidentDetail flat layout: name +
// 3 icon actions + last-checkup + focus/risk pills, Personal Information grid +
// Emergency Contact grid, Medical Profile with vitals + condition/medication/
// allergy pill groups each with pagination, History filter chips + selects +
// card list)
export const SkeletonResidentDetail = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='space-y-2'>
        <div className='flex items-start justify-between gap-3'>
          <Skeleton className='h-9 w-64 max-w-full' />
          <div className='flex gap-2 shrink-0'>
            <Skeleton className='w-9 h-9 rounded-xl' />
            <Skeleton className='w-9 h-9 rounded-xl' />
            <Skeleton className='w-9 h-9 rounded-xl' />
          </div>
        </div>
        <Skeleton className='h-3 w-48' />
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-6 w-24 rounded-full' />
          <Skeleton className='h-6 w-24 rounded-full' />
          <Skeleton className='h-6 w-20 rounded-full' />
        </div>
      </div>
      <div className='space-y-4'>
        <Skeleton className='h-4 w-40' />
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-16' />
              <Skeleton className='h-4 w-28' />
            </div>
          ))}
        </div>
        <hr className='border-white/10' />
        <Skeleton className='h-4 w-40' />
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-20' />
              <Skeleton className='h-4 w-32' />
            </div>
          ))}
        </div>
      </div>
      <hr className='border-white/10' />
      <div className='space-y-5'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-5 w-52' />
          <Skeleton className='h-9 w-28 rounded-xl' />
        </div>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-36' />
          <div className='flex flex-wrap gap-x-6 gap-y-2'>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className='space-y-1'>
                <Skeleton className='h-2.5 w-14' />
                <Skeleton className='h-3.5 w-20' />
              </div>
            ))}
          </div>
        </div>
        {['w-40', 'w-44', 'w-32'].map(w => (
          <div key={w} className='space-y-2'>
            <Skeleton className={`h-4 ${w}`} />
            <div className='flex flex-wrap gap-2'>
              <Skeleton className='h-6 w-28 rounded-full' />
              <Skeleton className='h-6 w-32 rounded-full' />
              <Skeleton className='h-6 w-24 rounded-full' />
            </div>
            <Skeleton className='h-3 w-40' />
          </div>
        ))}
      </div>
      <hr className='border-white/10' />
      <div className='space-y-4'>
        <Skeleton className='h-5 w-40' />
        <div className='flex flex-wrap gap-1.5'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-8 w-20 rounded-md' />
          ))}
        </div>
        <div className='flex gap-3'>
          <Skeleton className='h-10 w-32 rounded-xl' />
          <Skeleton className='h-10 w-32 rounded-xl' />
        </div>
        <Skeleton className='h-3 w-56' />
        <div className='space-y-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='bg-white/[0.04] border border-white/10 rounded-xl p-3.5 space-y-2'>
              <div className='flex justify-between'>
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-4 w-16' />
              </div>
              <Skeleton className='h-3 w-2/3' />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// BHW detail page skeleton (mirrors BHWDetail flat layout: name + 2 icon
// actions + position/status/username line, Personal Information values,
// 4-stat divide-x + completion bar, Schedules search + status select +
// List/Calendar toggles + date-block cards + pagination)
export const SkeletonBHWDetail = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='space-y-2'>
        <div className='flex items-start justify-between gap-3'>
          <Skeleton className='h-9 w-56' />
          <div className='flex gap-2 shrink-0'>
            <Skeleton className='w-9 h-9 rounded-xl' />
            <Skeleton className='w-9 h-9 rounded-xl' />
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Skeleton className='h-3 w-28' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='h-3 w-24' />
        </div>
      </div>
      <div className='space-y-4'>
        <Skeleton className='h-4 w-44' />
        <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-24' />
              <Skeleton className='h-4 w-32' />
            </div>
          ))}
        </div>
      </div>
      <hr className='border-white/10' />
      <div className='space-y-3'>
        <Skeleton className='h-5 w-40' />
        <div className='grid grid-cols-2 sm:grid-cols-4 text-center gap-y-3 divide-x divide-white/10'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='px-2 space-y-1.5'>
              <Skeleton className='h-7 w-10 mx-auto' />
              <Skeleton className='h-2.5 w-14 mx-auto' />
            </div>
          ))}
        </div>
        <div className='space-y-1.5'>
          <div className='flex justify-between'>
            <Skeleton className='h-3 w-28' />
            <Skeleton className='h-3 w-12' />
          </div>
          <Skeleton className='h-2 w-full rounded-full' />
        </div>
      </div>
      <hr className='border-white/10' />
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Skeleton className='h-5 w-40' />
          <div className='flex gap-2'>
            <Skeleton className='h-9 w-28 rounded-lg' />
            <Skeleton className='h-9 w-16 rounded-lg' />
            <Skeleton className='h-9 w-20 rounded-lg' />
          </div>
        </div>
        <div className='space-y-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex items-center gap-3 bg-white/5 rounded-lg p-3'>
              <div className='text-center space-y-1 min-w-[40px]'>
                <Skeleton className='h-4 w-6 mx-auto' />
                <Skeleton className='h-3 w-8 mx-auto' />
              </div>
              <div className='space-y-1.5 flex-1'>
                <Skeleton className='h-3.5 w-40 max-w-full' />
                <Skeleton className='h-3 w-28' />
              </div>
              <Skeleton className='h-5 w-20 rounded-md shrink-0' />
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>
    </div>
  )
}

// Shared list-page building blocks
const SkeletonListHeader = ({
  titleWidth = 'w-44',
  countWidth = 'w-32',
  actions = 1
}) => {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 space-y-1 sm:space-y-0'>
        <Skeleton className={`h-7 ${titleWidth}`} />
        <Skeleton className={`h-4 ${countWidth}`} />
      </div>
      <div className='ml-auto flex items-center gap-2'>
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className='h-11 w-28 sm:w-36 rounded-xl' />
        ))}
      </div>
    </div>
  )
}

const SkeletonSearchRow = () => {
  return <Skeleton className='h-11 w-full rounded-xl' />
}

// Single-row filter shimmer (mirrors the one-line pill filter bars used by
// every tab: each group's label followed by its pills in one wrapping row)
const SkeletonFilterRow = ({ groups = [{ label: 'Filter:', count: 5 }], mobileSelects = false, mobileColumns = 3 }) => {
  const items = []
  groups.forEach((g, gi) => {
    items.push(
      <Skeleton
        key={`label-${g.label}`}
        className={`h-3 w-16 ${gi > 0 ? 'ml-2 sm:ml-4' : ''}`}
      />
    )
    // type 'select' mirrors an inline dropdown (e.g. Residents Purok filter)
    if (g.type === 'select') {
      items.push(
        <Skeleton key={`${g.label}-select`} className='h-8 w-32 sm:w-36 rounded-md' />
      )
      return
    }
    for (let i = 0; i < g.count; i++) {
      items.push(
        <Skeleton key={`${g.label}-${i}`} className='h-8 w-20 rounded-md' />
      )
    }
  })
  return (
    <>
      {mobileSelects && (
        <div className={`grid grid-cols-${mobileColumns} gap-2 sm:hidden`} aria-hidden='true'>
          {groups.map((group, i) => (
            <Skeleton key={`mobile-${i}`} className='h-10 w-full rounded-xl' />
          ))}
        </div>
      )}
      <div className={`${mobileSelects ? 'hidden sm:flex' : 'flex'} flex-wrap items-center gap-1.5 sm:gap-2`}>{items}</div>
    </>
  )
}

// Residents page skeleton (header w/ Add Resident, search, single-row
// Purok dropdown + Risk x5 + Focus Group x7 pills, resident rows, pagination)
export const SkeletonResidentsPage = ({ count = 6 }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <SkeletonListHeader titleWidth='w-44' actions={1} />
      <div className='space-y-3'>
        <SkeletonSearchRow />
        <SkeletonFilterRow
          mobileSelects
          groups={[
            { label: 'Purok:', type: 'select' },
            { label: 'Risk:', count: 5 },
            { label: 'Group:', count: 7 }
          ]}
        />
      </div>
      <SkeletonResidentRow count={count} />
      <SkeletonPagination />
    </div>
  )
}

// BHW page skeleton (header w/ Add BHW, search, single-row Position
// dropdown + Status x3 + Group x4 pills, worker cards, pagination)
export const SkeletonBHWPage = ({ count = 6 }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <SkeletonListHeader titleWidth='w-40' actions={1} />
      <div className='space-y-3'>
        <SkeletonSearchRow />
        <SkeletonFilterRow
          mobileSelects
          groups={[
            { label: 'Position:', type: 'select' },
            { label: 'Status:', count: 3 },
            { label: 'Group:', count: 4 }
          ]}
        />
      </div>
      <SkeletonBHWCard count={count} />
      <SkeletonPagination />
    </div>
  )
}

// Medicines page skeleton (header w/ Add Medicine, search, single-row
// Category dropdown + Target Group x6 pills, medicine cards, pagination)
export const SkeletonMedicinesPage = ({ count = 6 }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <SkeletonListHeader titleWidth='w-56' actions={1} />
      <div className='space-y-3'>
      <SkeletonSearchRow />
      <SkeletonFilterRow
        mobileSelects
        mobileColumns={2}
        groups={[
          { label: 'Category:', type: 'select' },
          { label: 'Target:', count: 6 }
        ]}
      />
      </div>
      <SkeletonMedicineCard count={count} />
      <SkeletonPagination />
    </div>
  )
}

// Schedules page skeleton (header w/ New Schedule, search, Scope x4 + Status
// x5 chip rows + List/Calendar toggle, schedule list OR calendar grid,
// pagination). `view` must match the expected tab content: 'list' mirrors the
// schedule cards, 'calendar' mirrors the month grid.
export const SkeletonSchedulesPage = ({ count = 5, view = 'list' }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <SkeletonListHeader titleWidth='w-32' countWidth='w-28' actions={1} />
      <div className='space-y-3'>
        <div className='flex items-end gap-2 sm:block'>
          <Skeleton className='h-11 min-w-0 flex-1 rounded-xl' />
          <div className='flex h-11 shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-0.5 sm:hidden'>
            <Skeleton className='h-9 w-9 rounded-md' />
            <Skeleton className='h-9 w-9 rounded-md' />
          </div>
        </div>
        <div className='flex gap-2 sm:hidden'>
          <Skeleton className='h-10 min-w-0 flex-1 rounded-xl' />
          <Skeleton className='h-10 min-w-0 flex-1 rounded-xl' />
        </div>
        <div className='hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2'>
          <Skeleton className='h-3.5 w-10' />
          <Skeleton className='h-8 w-24 rounded-md' />
          <Skeleton className='h-8 w-20 rounded-md' />
          <Skeleton className='h-8 w-16 rounded-md' />
          <Skeleton className='h-8 w-20 rounded-md' />
          <Skeleton className='h-3.5 w-14 ml-3' />
          <Skeleton className='h-8 w-16 rounded-md' />
          <Skeleton className='h-8 w-24 rounded-md' />
          <Skeleton className='h-8 w-20 rounded-md' />
          <Skeleton className='h-8 w-20 rounded-md' />
          <Skeleton className='h-8 w-20 rounded-md' />
          <div className='flex bg-white/10 rounded-lg p-0.5 gap-1 ml-1 border border-white/20'>
            <Skeleton className='h-8 w-16 rounded-md' />
            <Skeleton className='h-8 w-20 rounded-md' />
          </div>
        </div>
      </div>
      {view === 'calendar' ? (
        <div className='glass-card'>
          <SkeletonCalendarGrid />
        </div>
      ) : (
        <SkeletonScheduleList count={count} />
      )}
      <SkeletonPagination />
    </div>
  )
}

// Purok page skeleton (header w/ Edit Map + Add Purok, search, single-row
// Risk x5 + BHW x3 pills, big-name cards, pagination)
export const SkeletonPurokPage = ({ count = 6 }) => {
  return (
      <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <SkeletonListHeader titleWidth='w-36' actions={2} />
      <div className='space-y-3'>
        <SkeletonSearchRow />
        <SkeletonFilterRow
          mobileSelects
          mobileColumns={2}
          groups={[
            { label: 'Risk:', count: 5 },
            { label: 'BHW:', count: 3 }
          ]}
        />
      </div>
      <SkeletonPurokCards count={count} />
      <SkeletonPagination />
    </div>
  )
}

// Priority purok rows (mirrors dashboard Priority Puroks list AND purok tab
// content: name + count + risk badge, 4 Critical/High/Moderate/Low pills,
// chevron). Exported so tab switches render the expected rows, not spinners.
export const SkeletonPriorityPuroks = ({ count = 3 }) => {
  return (
    <div className='space-y-2.5'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='bg-white/[0.04] border border-white/10 rounded-xl p-3.5'>
          <div className='flex items-center gap-3'>
            <div className='flex-1 min-w-0 space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <Skeleton className='h-5 w-32' />
                <Skeleton className='h-5 w-14 rounded' />
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className='h-5 w-20 rounded-full' />
                ))}
              </div>
            </div>
            <Skeleton className='w-4 h-4 shrink-0' />
          </div>
        </div>
      ))}
    </div>
  )
}

// Attention resident cards (mirrors Critical/High/Missed tab lists: name +
// age/purok + chevron or missed count, optional condition pills). Exported
// for tab-level reloads inside the already-rendered dashboard cards.
export const SkeletonAttentionList = ({ count = 3, showPills = true }) => {
  return (
    <div className='space-y-2'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='bg-white/[0.04] border border-white/10 rounded-lg p-3 space-y-2'>
          <div className='flex justify-between items-start gap-2'>
            <div className='space-y-1.5 min-w-0'>
              <Skeleton className='h-3.5 w-32' />
              <Skeleton className='h-3 w-24' />
            </div>
            <Skeleton className='w-4 h-4 shrink-0' />
          </div>
          {showPills && (
            <div className='flex gap-1.5'>
              <Skeleton className='h-5 w-16 rounded' />
              <Skeleton className='h-5 w-20 rounded' />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Common conditions bars (mirrors Common Health Conditions tab content:
// name + count + progress bar rows). Exported for purok-filter reloads.
export const SkeletonConditionBars = ({ count = 5 }) => {
  return (
    <div className='space-y-3.5'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className='flex items-center justify-between gap-3 mb-1.5'>
            <Skeleton className='h-3.5 w-32' />
            <Skeleton className='h-3 w-16' />
          </div>
          <Skeleton className='h-2 w-full rounded-full' />
        </div>
      ))}
    </div>
  )
}

// Full dashboard page skeleton (mirrors Dashboard layout + section order)
export const SkeletonDashboard = ({ isBHWWorker = false }) => {
  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 space-y-1 sm:space-y-0'>
          <Skeleton className='h-7 w-40' />
          <Skeleton className='h-4 w-56' />
        </div>
        <Skeleton className='h-11 w-28 sm:w-36 rounded-xl ml-auto' />
      </div>
      <div className='relative min-w-0'>
        <SkeletonStatCards count={4} scroll />
        <div className='dashboard-stat-scroll-indicator lg:hidden' aria-hidden='true'><span /></div>
      </div>
      {/* Today's Activities table with view toggle (default view is Today = 5 cols: no Date, no Status) */}
      <div className='glass-card space-y-4'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <Skeleton className='h-5 w-44' />
          <div className='flex rounded-lg border border-white/15 overflow-hidden'>
            <Skeleton className='h-8 w-16 rounded-none' />
            <Skeleton className='h-8 w-20 rounded-none' />
          </div>
        </div>
        <div className='lg:hidden space-y-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-3'>
              <div className='flex items-start justify-between gap-3'>
                <Skeleton className='h-4 w-2/3' />
                <Skeleton className='h-3 w-12 shrink-0' />
              </div>
              <div className='grid grid-cols-2 gap-x-3 gap-y-2'>
                {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className='h-3 w-full max-w-[110px]' />)}
              </div>
            </div>
          ))}
        </div>
        <div className='hidden lg:block'>
        <div className='flex gap-4 border-b border-white/10 pb-3'>
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={`h-${j}`} className='h-3 flex-1' />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='flex gap-4'>
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={`r-${i}-${j}`} className='h-3 flex-1' />
            ))}
          </div>
        ))}
        </div>
        <SkeletonPagination />
      </div>
      <div className='lg:hidden flex gap-4 overflow-hidden'>
        {[0, 1].map(i => (
          <div key={i} className='glass-card min-w-[88%] space-y-4'>
            <Skeleton className='h-5 w-44' />
            <Skeleton className='h-60 w-full rounded-xl' />
          </div>
        ))}
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start'>
        <div className='lg:col-span-2 space-y-4 sm:space-y-6 max-lg:contents max-lg:!space-y-0'>
          {/* Purok map is admin-only; workers start with their scoped trends. */}
          {!isBHWWorker && <div className='glass-card space-y-4'>
            <div className='flex items-center justify-between gap-3 flex-wrap'>
              <Skeleton className='h-5 w-44' />
              <div className='flex rounded-lg border border-white/15 overflow-hidden'>
                <Skeleton className='h-8 w-20 rounded-none' />
                <Skeleton className='h-8 w-24 rounded-none' />
              </div>
            </div>
            <Skeleton className='h-64 w-full rounded-xl' />
            <SkeletonPriorityPuroks count={2} />
          </div>}
          {/* Monthly risk trends (line chart) */}
          <div className='glass-card space-y-4 hidden lg:block'>
            <Skeleton className='h-5 w-48' />
            <Skeleton className='h-72 w-full rounded-xl' />
          </div>
          {/* AI Health Recommendations with period toggle */}
          <div className='glass-card space-y-5 max-lg:order-last'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <Skeleton className='h-5 w-56' />
              <div className='flex bg-white/10 rounded-lg p-0.5 gap-1 border border-white/20'>
                <Skeleton className='h-8 w-20 rounded-md' />
                <Skeleton className='h-8 w-24 rounded-md' />
                <Skeleton className='h-8 w-20 rounded-md' />
              </div>
            </div>
            <div className='bg-purple-500/5 border border-purple-400/15 rounded-xl p-5 space-y-2'>
              <Skeleton className='h-3.5 w-32' />
              <Skeleton className='h-3 w-full' />
              <Skeleton className='h-3 w-4/5' />
              <Skeleton className='h-3 w-48' />
            </div>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-5'>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-28' />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className='bg-blue-500/5 border border-blue-400/15 rounded-lg p-3 space-y-2'>
                    <Skeleton className='h-3 w-3/4' />
                    <Skeleton className='h-3 w-1/2' />
                  </div>
                ))}
              </div>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-28' />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className='bg-red-500/5 border border-red-400/15 rounded-lg p-3 space-y-2'>
                    <Skeleton className='h-3 w-3/4' />
                    <Skeleton className='h-3 w-1/2' />
                  </div>
                ))}
              </div>
            </div>
            {!isBHWWorker && <div className='space-y-2'>
              <Skeleton className='h-3.5 w-40' />
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className='bg-emerald-500/5 border border-emerald-400/15 rounded-lg p-4 space-y-2'>
                    <Skeleton className='h-3 w-1/2' />
                    <Skeleton className='h-3 w-3/4' />
                  </div>
                ))}
              </div>
            </div>}
          </div>
        </div>
        <div className='space-y-4 sm:space-y-6 max-lg:contents max-lg:!space-y-0'>
          {/* Overall Risk Distribution (pie) */}
          <div className='glass-card space-y-4 hidden lg:block'>
            <Skeleton className='h-5 w-52' />
            <Skeleton className='h-64 w-full rounded-xl' />
          </div>
          {/* Residents Require Attention (Critical + High with count pills) */}
          <div className='glass-card space-y-4'>
            <Skeleton className='h-5 w-52' />
            <div className='flex items-center justify-between'>
              <Skeleton className='h-3.5 w-24' />
              <Skeleton className='h-5 w-24 rounded-full' />
            </div>
            <SkeletonAttentionList count={3} />
            <SkeletonPagination />
            <div className='flex items-center justify-between'>
              <Skeleton className='h-3.5 w-20' />
              <Skeleton className='h-5 w-24 rounded-full' />
            </div>
            <SkeletonAttentionList count={2} />
            <SkeletonPagination />
          </div>
          {/* Missed Health Consultations */}
          <div className='glass-card space-y-4'>
            <div className='flex items-center justify-between gap-3 flex-wrap'>
              <Skeleton className='h-5 w-48' />
              <Skeleton className='h-5 w-24 rounded-full' />
            </div>
            <SkeletonAttentionList count={2} showPills={false} />
            <SkeletonPagination />
          </div>
          {/* Common Health Conditions (purok select + progress bars) */}
          <div className='glass-card space-y-4'>
            <Skeleton className='h-5 w-52' />
            <Skeleton className='h-9 w-full rounded-xl' />
            <SkeletonConditionBars count={5} />
            <SkeletonPagination />
          </div>
        </div>
      </div>
    </div>
  )
}

// Inline activity table rows (mirrors Dashboard Today's 6-col / Upcoming 7-col
// glass-table: renders bare <tr> shimmer rows so it can sit inside the
// existing GlassCard table while its tab data reloads)
export const SkeletonActivityRows = ({ columns = 6, rows = 4 }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j}>
              {j === columns - 1 ? (
                <Skeleton className='h-5 w-20 rounded-full' />
              ) : (
                <Skeleton className='h-3.5 w-full max-w-[120px]' />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// Mobile counterpart of SkeletonActivityRows: the same activity rows rendered
// as cards (no <tr>), so it can sit inside a plain <div> without breaking
// table markup.
export const SkeletonActivityCards = ({ count = 3 }) => {
  return (
    <div className='space-y-2'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='rounded-xl border border-white/10 bg-white/[0.04] p-3.5'>
          <div className='flex items-start justify-between gap-3'>
            <Skeleton className='h-4 w-40 max-w-[60%]' />
            <Skeleton className='h-3 w-12 shrink-0' />
          </div>
          <div className='mt-2 grid grid-cols-2 gap-x-3 gap-y-2'>
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className='h-3 w-full max-w-[110px]' />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Mirrors the AI Health Recommendations layout: Key Findings + Risk Areas,
// Health Intervention Recommendations (single column), Health Program
// Recommendations, Priority Residents and Priority Puroks — each section
// with its cards, meta rows and pagination footer.
export const SkeletonAIRecommendation = ({ isBHWWorker = false }) => {
  return (
    <div className='space-y-8 mt-6'>
      <div className='grid grid-cols-1 gap-5'>
        {/* Key Findings — numbered rows */}
        <div className='min-w-0 border-y border-white/10 py-6 space-y-3'>
          <Skeleton className='h-4 w-32' />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 flex items-start gap-3'>
              <Skeleton className='h-4 w-5 shrink-0' />
              <div className='flex-1 space-y-2 min-w-0'>
                <Skeleton className='h-3 w-full' />
                <Skeleton className='h-3 w-4/5' />
              </div>
            </div>
          ))}
          <SkeletonPagination />
        </div>
        {/* Risk Areas — title + severity badge + description */}
        <div className='min-w-0 border-y border-white/10 py-6 space-y-3'>
          <Skeleton className='h-4 w-32' />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='rounded-xl border border-white/10 bg-white/[0.04] p-5 space-y-2'>
              <div className='flex items-start justify-between gap-2'>
                <Skeleton className='h-4 w-1/3' />
                <Skeleton className='h-5 w-16 rounded' />
              </div>
              <Skeleton className='h-3 w-full' />
              <Skeleton className='h-3 w-4/5' />
            </div>
          ))}
          <SkeletonPagination />
        </div>
      </div>
      {/* Health Intervention Recommendations — header, action, meta rows */}
      <div className='min-w-0 border-y border-white/10 py-6 space-y-4'>
        <Skeleton className='h-4 w-72 max-w-full' />
        <Skeleton className='h-3 w-4/5' />
        <div className='grid grid-cols-1 gap-5'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='min-w-0 border border-white/10 bg-white/[0.04] rounded-xl p-5 space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <Skeleton className='h-4 w-32 mr-auto' />
                <Skeleton className='h-5 w-24 rounded' />
                <Skeleton className='h-3 w-16' />
              </div>
              <Skeleton className='h-3 w-full' />
              <Skeleton className='h-3 w-11/12' />
              <div className='border-t border-white/10 pt-3 space-y-3'>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className='space-y-1.5'>
                    <Skeleton className='h-3 w-1/4' />
                    <Skeleton className='h-3 w-3/4' />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>
      {/* Health Program Recommendations — numbered program cards */}
      {!isBHWWorker && <div className='min-w-0 border-y border-white/10 py-6 space-y-4'>
        <Skeleton className='h-4 w-72 max-w-full' />
        <Skeleton className='h-3 w-4/5' />
        <div className='grid grid-cols-1 gap-5'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='min-w-0 border border-white/10 bg-white/[0.04] rounded-xl p-5 space-y-3'>
              <div className='flex items-start gap-3'>
                <Skeleton className='w-7 h-7 rounded-lg shrink-0' />
                <Skeleton className='h-4 flex-1' />
              </div>
              <Skeleton className='h-3 w-4/5' />
              <Skeleton className='h-3 w-3/5' />
              <div className='space-y-1.5'>
                <Skeleton className='h-3 w-1/4' />
                <Skeleton className='h-3 w-11/12' />
                <Skeleton className='h-3 w-3/4' />
              </div>
              <div className='border-t border-white/10 pt-3 space-y-3'>
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className='space-y-1.5'>
                    <Skeleton className='h-3 w-1/4' />
                    <Skeleton className='h-3 w-2/3' />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>}
      {/* Priority Residents — name + urgency, meta, condition chips, next step */}
      <div className='min-w-0 border-y border-white/10 py-6 space-y-4'>
        <Skeleton className='h-4 w-44' />
        <Skeleton className='h-3 w-4/5' />
        <div className='grid grid-cols-1 gap-5'>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className='min-w-0 border border-white/10 bg-white/[0.04] rounded-xl p-5 space-y-3'>
              <div className='flex items-center justify-between gap-2'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-5 w-24 rounded' />
              </div>
              <Skeleton className='h-3 w-3/5' />
              <div className='flex flex-wrap gap-1.5'>
                <Skeleton className='h-5 w-20 rounded-full' />
                <Skeleton className='h-5 w-24 rounded-full' />
              </div>
              <div className='space-y-2'>
                <Skeleton className='h-3 w-full' />
                <Skeleton className='h-3 w-5/6' />
              </div>
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>
      {/* Priority Puroks — rank + name + badge, counts, coordination line */}
      {!isBHWWorker && <div className='min-w-0 border-y border-white/10 py-6 space-y-4'>
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-3 w-3/5' />
        <div className='grid grid-cols-1 gap-5'>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className='min-w-0 border border-white/10 bg-white/[0.04] rounded-xl p-5 space-y-3'>
              <div className='flex items-center justify-between gap-2'>
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-5 w-20 rounded' />
              </div>
              <Skeleton className='h-3 w-1/2' />
              <div className='space-y-2'>
                <Skeleton className='h-3 w-full' />
                <Skeleton className='h-3 w-4/5' />
              </div>
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>}
    </div>
  )
}

// Schedule Details modal skeleton (mirrors Schedules detail modal: title +
// status badge, 2-col Date/Time/Scope/Duration info grid, resident or
// program block, purpose, location/contact/coordinator grids, Assigned BHW +
// Healthcare Professional chip groups, notes, action footer)
export const SkeletonScheduleDetailModal = () => {
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <Skeleton className='h-5 w-48' />
        <Skeleton className='h-6 w-20 rounded-full' />
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='space-y-1.5'>
            <Skeleton className='h-2.5 w-16' />
            <Skeleton className='h-4 w-32 max-w-full' />
          </div>
        ))}
      </div>
      <hr className='border-white/10' />
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className='space-y-1.5'>
            <Skeleton className='h-2.5 w-20' />
            <Skeleton className='h-4 w-36 max-w-full' />
          </div>
        ))}
      </div>
      <hr className='border-white/10' />
      <div className='space-y-1.5'>
        <Skeleton className='h-2.5 w-24' />
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-8 w-36 rounded-lg' />
          <Skeleton className='h-8 w-40 rounded-lg' />
        </div>
      </div>
      <div className='space-y-1.5'>
        <Skeleton className='h-2.5 w-40' />
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-8 w-44 rounded-lg' />
          <Skeleton className='h-8 w-32 rounded-lg' />
        </div>
      </div>
      <Skeleton className='h-3 w-2/3' />
      <hr className='border-white/10' />
      <div className='flex items-center gap-2'>
        <Skeleton className='h-11 flex-1 rounded-xl' />
        <Skeleton className='h-11 w-11 rounded-xl' />
        <Skeleton className='h-11 w-11 rounded-xl' />
      </div>
    </div>
  )
}

// Calendar month grid skeleton (mirrors CalendarView: month nav header with
// prev/title/next + optional Today, 7-col weekday headers, h-24 day cells
// each with day number + count badge + up to 2 schedule chips, status legend)
export const SkeletonCalendarGrid = ({ showToday = false }) => {
  return (
    <div className='responsive-calendar'>
      <div className='flex items-center justify-between mb-6'>
        <div className='flex items-center gap-3'>
          <Skeleton className='w-9 h-9 rounded-lg' />
          <Skeleton className='h-5 w-36' />
          <Skeleton className='w-9 h-9 rounded-lg' />
        </div>
        {showToday && <Skeleton className='h-8 w-16 rounded-lg' />}
      </div>
      <div className='calendar-scroll'>
      <div className='calendar-weekdays grid grid-cols-7 gap-2 mb-2'>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`w-${i}`} className='h-4 w-8 mx-auto' />
        ))}
      </div>
      <div className='calendar-grid grid grid-cols-7 gap-2'>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={`d-${i}`} className='calendar-cell h-24 min-w-0 p-1.5 rounded-lg bg-white/5 border border-white/10 space-y-1 overflow-hidden'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-2.5 sm:h-3 w-3 sm:w-4' />
              <Skeleton className='h-3 sm:h-4 w-4 sm:w-6 rounded' />
            </div>
            <div className='space-y-px'>
              <Skeleton className='h-3 sm:h-4 w-full rounded' />
              <Skeleton className='h-3 sm:h-4 w-4/5 rounded' />
            </div>
          </div>
        ))}
      </div>
      </div>
      <div className='flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-white/10'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='flex items-center gap-2'>
            <Skeleton className='w-3 h-3 rounded border' />
            <Skeleton className='h-3 w-16' />
          </div>
        ))}
      </div>
    </div>
  )
}

// Day / date schedules modal list (mirrors Schedules day modal and Purok
// date modal: title + status badge rows with time/type/scope meta)
export const SkeletonDayModalList = ({ count = 3 }) => {
  return (
    <div className='space-y-2'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='bg-white/5 rounded-lg p-3'>
          <div className='flex items-center justify-between gap-2'>
            <div className='space-y-1.5 min-w-0'>
              <Skeleton className='h-4 w-40 max-w-full' />
              <div className='flex gap-2'>
                <Skeleton className='h-3 w-16' />
                <Skeleton className='h-3 w-12' />
                <Skeleton className='h-3 w-14' />
              </div>
            </div>
            <Skeleton className='h-5 w-20 rounded-full shrink-0' />
          </div>
        </div>
      ))}
      <SkeletonPagination />
    </div>
  )
}

// Vaccination record modal skeleton (mirrors 7-col dose table + pagination)
export const SkeletonVaccinationModal = ({ count = 3 }) => {
  return (
    <div className='space-y-4'>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className='bg-white/[0.03] rounded-lg p-4 border border-white/5 space-y-3'
        >
          <div className='flex items-center justify-between gap-3'>
            <div className='space-y-2'>
              <Skeleton className='h-5 w-40' />
              <div className='flex items-center gap-2'>
                <Skeleton className='h-3 w-24' />
                <Skeleton className='h-5 w-28 rounded-full' />
              </div>
            </div>
            <div className='w-32 shrink-0'>
              <Skeleton className='h-2 w-full rounded-full' />
            </div>
          </div>
          <Skeleton className='h-3 w-48' />
          <div className='space-y-3'>
            <div className='flex gap-4 border-b border-white/10 pb-3'>
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={`h-${j}`} className='h-3 flex-1' />
              ))}
            </div>
            {Array.from({ length: 2 }).map((_, r) => (
              <div key={r} className='flex gap-4'>
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={`r-${r}-${j}`} className='h-3 flex-1' />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <SkeletonPagination />
    </div>
  )
}

// Medical history card list (mirrors ResidentDetail History tab content:
// filter chips + 2 selects + count line + record cards with
// title/badge/date + description). Used for tab/filter reloads inside the
// already-rendered detail page.
export const SkeletonHistoryList = ({ count = 3 }) => {
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-1.5'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-8 w-20 rounded-md' />
        ))}
      </div>
      <div className='flex gap-3'>
        <Skeleton className='h-10 w-32 rounded-xl' />
        <Skeleton className='h-10 w-32 rounded-xl' />
      </div>
      <Skeleton className='h-3 w-56' />
      <div className='space-y-3'>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className='bg-white/[0.04] border border-white/10 rounded-xl p-3.5 space-y-2'>
            <div className='flex justify-between gap-2'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-4 w-16' />
            </div>
            <Skeleton className='h-3 w-2/3' />
            <Skeleton className='h-3 w-1/3' />
          </div>
        ))}
      </div>
      <SkeletonPagination />
    </div>
  )
}

// Record Detail modal skeleton (mirrors ResidentDetail Record Details modal:
// header badge + title + date, Visit Information 3-col grid, conditional
// details block, vitals grid, assessment/symptoms rows)
export const SkeletonRecordDetailModal = () => {
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between pb-3 border-b border-white/10'>
        <div className='flex items-center gap-3'>
          <Skeleton className='h-7 w-24 rounded-full' />
          <Skeleton className='h-5 w-40' />
        </div>
        <Skeleton className='h-4 w-32' />
      </div>
      <div className='bg-white/[0.03] rounded-lg p-4 space-y-3'>
        <Skeleton className='h-4 w-36' />
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-20' />
              <Skeleton className='h-4 w-28' />
            </div>
          ))}
        </div>
      </div>
      <div className='bg-white/[0.03] rounded-lg p-4 space-y-3'>
        <Skeleton className='h-4 w-44' />
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-24' />
              <Skeleton className='h-4 w-32 max-w-full' />
            </div>
          ))}
        </div>
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-3 w-28' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-5/6' />
      </div>
    </div>
  )
}

// Assign BHW modal list (mirrors Purok Assign BHW modal: search input +
// worker rows with name/position + contact + Assign action + pagination).
// Reuses the bhw row shape from SkeletonPurokDetailList.
export const SkeletonAssignBHWModal = ({ count = 4 }) => {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-10 w-full rounded-xl' />
      <SkeletonPurokDetailList rows={count} variant='bhw' />
      <SkeletonPagination />
    </div>
  )
}

// Risk map tab skeleton (mirrors PurokRiskMap card: map area + legend +
// priority rows when in priority tab). Used when the map/priority tab data
// reloads inside the already-rendered dashboard card.
export const SkeletonRiskMapTab = () => {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-64 w-full rounded-xl' />
      <SkeletonPriorityPuroks count={2} />
    </div>
  )
}

// -- BHW worker portal ----------------------------------------------
// Each mirrors its page's expected content so the loading state shimmers
// in the shape of what will appear (same rule as the admin skeletons).

// 5-stat strip (mirrors MyPurok / MyResidents grid-cols-2 lg:grid-cols-5
// Total + Critical + High + Moderate + Low StatCards)
const SkeletonWorkerStats = ({ scroll = false }) => {
  return (
    <div className={scroll ? 'dashboard-stat-scroll flex flex-nowrap gap-3 overflow-hidden pb-3 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0' : 'grid grid-cols-2 lg:grid-cols-5 gap-3'}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`stat-card ${scroll ? 'w-[10.5rem] shrink-0 lg:w-auto' : ''}`}>
          <Skeleton className='w-10 h-10 sm:w-11 sm:h-11 rounded-xl shrink-0' />
          <div className='flex-1 space-y-1.5 min-w-0'>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-7 w-14' />
          </div>
        </div>
      ))}
    </div>
  )
}

// MyPurok page (mirrors MyPurok: purok name title, 5 risk StatCards,
// "Residents in X" GlassCard with search + Name/Age/Risk/Score/Last-Checkup
// table + pagination)
export const SkeletonMyPurokPage = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='pl-1'>
        <Skeleton className='h-7 w-48' />
      </div>
      <SkeletonWorkerStats />
      <div className='glass-card space-y-4'>
        <Skeleton className='h-5 w-48' />
        <Skeleton className='h-11 w-full rounded-xl' />
        <div className='space-y-3'>
          <div className='flex gap-4 border-b border-white/10 pb-3'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`h-${i}`} className='h-3 flex-1' />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex gap-4 items-center'>
              <Skeleton className='h-4 w-40 flex-none' />
              <Skeleton className='h-3 w-10 flex-1' />
              <Skeleton className='h-5 w-20 rounded-full flex-none' />
              <Skeleton className='h-3 w-10 flex-1' />
              <Skeleton className='h-3 w-28 flex-1' />
            </div>
          ))}
        </div>
        <SkeletonPagination />
      </div>
    </div>
  )
}

// MyResidents page (mirrors MyResidents: title + count + Add Resident,
// 5 risk StatCards, search + Handled-Purok/Focus toggle, Risk pills,
// resident GlassCard rows with name/meta + focus pills + risk badge +
// edit/delete + pagination)
export const SkeletonMyResidentsPage = ({ count = 6 }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 space-y-1 sm:space-y-0'>
          <Skeleton className='h-7 w-40' />
          <Skeleton className='h-4 w-24' />
        </div>
        <Skeleton className='h-11 w-28 sm:w-36 rounded-xl ml-auto' />
      </div>
      <SkeletonWorkerStats scroll />
      <div className='flex flex-nowrap sm:flex-wrap items-center gap-2'>
        <Skeleton className='h-10 min-w-0 flex-1 rounded-xl' />
        <div className='flex items-center gap-1 p-1 rounded-xl border border-white/10 shrink-0 sm:hidden'>
          <Skeleton className='h-8 w-16 rounded-lg' />
          <Skeleton className='h-8 w-16 rounded-lg' />
        </div>
        <div className='hidden sm:flex items-center gap-1 p-1 rounded-xl border border-white/10 shrink-0'>
          <Skeleton className='h-8 w-32 rounded-lg' />
          <Skeleton className='h-8 w-28 rounded-lg' />
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:hidden'>
        <Skeleton className='h-10 w-full rounded-xl' />
        <Skeleton className='h-10 w-full rounded-xl' />
      </div>
      <div className='hidden sm:flex flex-wrap items-center gap-2'>
        <Skeleton className='h-3 w-10' />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-8 w-20 rounded-md' />
        ))}
      </div>
      <div className='grid grid-cols-1 gap-3'>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className='glass-card'>
            <div className='flex flex-col sm:flex-row sm:items-center gap-3'>
              <div className='min-w-0 sm:flex-1 space-y-2'>
                <Skeleton className='h-5 w-48' />
                <Skeleton className='h-3.5 w-56 max-w-full' />
              </div>
              <div className='flex items-center gap-2 shrink-0'>
                <div className='flex flex-wrap gap-1'>
                  <Skeleton className='h-5 w-16 rounded-full' />
                  <Skeleton className='h-5 w-20 rounded-full' />
                </div>
                <Skeleton className='h-6 w-20 rounded-md' />
                <div className='flex items-center gap-1'>
                  <Skeleton className='w-7 h-7 rounded-lg' />
                  <Skeleton className='w-7 h-7 rounded-lg' />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <SkeletonPagination />
    </div>
  )
}

// MySchedules page (mirrors MySchedules: title + count + New Schedule,
// Assigned/Completed/Missed/Completion StatCards, search, Scope x4 +
// Status x5 pills + List/Calendar toggle, schedule list rows + pagination)
export const SkeletonMySchedulesPage = ({ count = 5 }) => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 space-y-1 sm:space-y-0'>
          <Skeleton className='h-7 w-44' />
          <Skeleton className='h-4 w-24' />
        </div>
        <Skeleton className='h-11 w-28 sm:w-36 rounded-xl ml-auto' />
      </div>
      <SkeletonStatCards count={4} />
      <div className='space-y-3'>
        <div className='flex items-end gap-2 sm:block'>
          <Skeleton className='h-11 min-w-0 flex-1 rounded-xl' />
          <div className='flex h-11 shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-0.5 sm:hidden'>
            <Skeleton className='h-9 w-9 rounded-md' />
            <Skeleton className='h-9 w-9 rounded-md' />
          </div>
        </div>
        <div className='flex gap-2 sm:hidden'>
          <Skeleton className='h-10 min-w-0 flex-1 rounded-xl' />
          <Skeleton className='h-10 min-w-0 flex-1 rounded-xl' />
        </div>
        <div className='hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2'>
          <Skeleton className='h-3.5 w-12' />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`scope-${i}`} className='h-8 w-20 rounded-md' />
          ))}
          <Skeleton className='h-3.5 w-12 ml-2 sm:ml-3' />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`status-${i}`} className='h-8 w-20 rounded-md' />
          ))}
          <div className='flex bg-white/10 rounded-lg p-0.5 gap-1 border border-white/20'>
            <Skeleton className='h-8 w-16 rounded-md' />
            <Skeleton className='h-8 w-20 rounded-md' />
          </div>
        </div>
      </div>
      <SkeletonScheduleList count={count} />
      <SkeletonPagination />
    </div>
  )
}

// Value box helper for the profile skeleton (uppercase label + rounded value box)
const SkeletonValueBox = () => {
  return (
    <div>
      <Skeleton className='h-2.5 w-24' />
      <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
        <Skeleton className='h-4 w-2/3' />
      </div>
    </div>
  )
}

// MyAssignment page (mirrors MyAssignment view mode: "My profile" title +
// Personal Information GlassCard with header + edit action, Full Name /
// Position boxes, Contact/Email + Purok/Focus + Username/Status 2-col grids)
export const SkeletonMyAssignmentPage = () => {
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='pl-1'>
        <Skeleton className='h-7 w-32' />
      </div>
      <div className='glass-card space-y-4'>
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <Skeleton className='w-5 h-5' />
            <Skeleton className='h-5 w-48' />
          </div>
          <Skeleton className='w-9 h-9 rounded-xl shrink-0' />
        </div>
        <div className='space-y-3'>
          <SkeletonValueBox />
          <SkeletonValueBox />
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <SkeletonValueBox />
            <SkeletonValueBox />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <SkeletonValueBox />
            <SkeletonValueBox />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <SkeletonValueBox />
            <div>
              <Skeleton className='h-2.5 w-24' />
              <div className='bg-white/[0.04] rounded-xl p-3 mt-1'>
                <Skeleton className='h-6 w-16 rounded-md' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Form select field (mirrors one labeled GlassSelect: label + select-height
// box). Used for API-fed dropdowns (purok / assigned-purok lists) while
// their options are still loading inside an already-rendered form.
export const SkeletonSelectField = ({ labelWidth = 'w-20' }) => {
  return (
    <div className='space-y-1.5'>
      <Skeleton className={`h-3 ${labelWidth}`} />
      <Skeleton className='h-11 w-full rounded-xl' />
    </div>
  )
}

// Dropdown option rows (mirrors suggestion rows inside open pickers:
// resident search dropdown + worker name dropdown — name/age line on top,
// detail line below). Rendered inside the already-open dropdown panel.
export const SkeletonDropdownOptions = ({ count = 3 }) => {
  return (
    <div className='py-1'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='px-3 py-2 space-y-1.5'>
          <Skeleton className='h-3.5 w-3/4' />
          <Skeleton className='h-3 w-1/2' />
        </div>
      ))}
    </div>
  )
}

// Map tile overlay (mirrors the Leaflet map area itself: full-area shimmer
// with a centered "locating tiles" pill). Shown only for the initial tile
// load inside the already-rendered map card; pointer-events-none so the
// map stays interactive while tiles pop in.
export const SkeletonMapTiles = () => {
  return (
    <div className='absolute inset-0 z-[500] pointer-events-none'>
      <div className='absolute inset-0 skeleton-shimmer !rounded-none opacity-70' />
      <div className='absolute inset-0 flex items-center justify-center'>
        <div className='flex items-center gap-2.5 bg-[#0f1535]/90 border border-white/15 rounded-full pl-2 pr-4 py-1.5 shadow-2xl'>
          <Skeleton className='w-7 h-7 rounded-full shrink-0' />
          <div className='space-y-1.5'>
            <Skeleton className='h-3 w-28' />
            <Skeleton className='h-2.5 w-20' />
          </div>
        </div>
      </div>
    </div>
  )
}


export default Skeleton
