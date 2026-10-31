// components/CalendarView.jsx
// Shared, unified calendar design used by Schedules, BHW Detail, and Purok.
// - Every date cell always shows the number of schedules for that date.
// - Clicking a date calls onSelectDay(dateStr, schedules) so the parent can
//   open a modal listing all schedules for that date.
// - Clicking a schedule (chip, or row inside the day modal) navigates to
//   Schedule Details (parent decides via onSelectSchedule / modal onClick).
import { ChevronLeft, ChevronRight, User, MapPin, Building2 } from 'lucide-react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_CHIP = {
  Scheduled: 'bg-blue-500/20 text-blue-300',
  Completed: 'bg-emerald-500/20 text-emerald-300',
  Missed: 'bg-orange-500/20 text-orange-300',
  Cancelled: 'bg-red-500/20 text-red-300'
}

const STATUS_DOT = {
  Scheduled: 'bg-blue-500/30 border-blue-400/30',
  Completed: 'bg-emerald-500/30 border-emerald-400/30',
  Missed: 'bg-orange-500/30 border-orange-400/30',
  Cancelled: 'bg-red-500/30 border-red-400/30'
}

const ScopeIcon = ({ scope, className = 'w-3 h-3' }) => {
  switch (scope) {
    case 'individual':
      return <User className={className} />
    case 'purok':
      return <MapPin className={className} />
    case 'barangay':
      return <Building2 className={className} />
    default:
      return <User className={className} />
  }
}

const getChipTitle = schedule =>
  schedule.scope === 'individual'
    ? schedule.residentName
    : schedule.programName || schedule.type

const PREVIEW_COUNT = 2

const CalendarView = ({
  month,
  year,
  onPrevMonth,
  onNextMonth,
  onToday,
  getSchedulesForDate,
  onSelectDay,
  onSelectSchedule,
  showToday = false,
  showLegend = true,
  // Kept for backwards compatibility — the design is now unified so this
  // prop no longer changes the layout.
  compact = false
}) => {
  void compact
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const monthYear = new Date(year, month).toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  })
  const now = new Date()

  const getDateStr = day =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return (
    <div className='responsive-calendar'>
      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div className='flex items-center gap-3'>
          <button
            onClick={onPrevMonth}
            className='p-2 hover:bg-white/10 rounded-lg transition-colors'
          >
            <ChevronLeft className='w-5 h-5 text-white/85' />
          </button>
          <h2
            className='text-lg font-semibold text-white'

          >
            {monthYear}
          </h2>
          <button
            onClick={onNextMonth}
            className='p-2 hover:bg-white/10 rounded-lg transition-colors'
          >
            <ChevronRight className='w-5 h-5 text-white/85' />
          </button>
        </div>
        {showToday && (
          <button
            onClick={onToday}
            className='px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs sm:text-sm text-white/75 transition-colors border border-white/20'
          >
            Today
          </button>
        )}
      </div>

      <div className='calendar-scroll'>
      {/* Weekday Headers */}
      <div className='calendar-weekdays grid grid-cols-7 gap-2 mb-2'>
        {WEEKDAYS.map(day => (
          <div
            key={day}
            className='text-center text-xs font-medium text-white/85 py-2'
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className='calendar-grid grid grid-cols-7 gap-2'>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className='calendar-empty h-24' />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = getDateStr(day)
          const schedules = getSchedulesForDate(dateStr) || []
          const count = schedules.length
          const hasSchedules = count > 0
          const isToday =
            now.getDate() === day &&
            now.getMonth() === month &&
            now.getFullYear() === year

          return (
            <div
              key={day}
              className={`calendar-cell ${!hasSchedules ? 'calendar-cell-no-schedules' : ''} h-24 p-1.5 rounded-lg transition-all ${
                hasSchedules ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'
              } ${
                isToday
                  ? 'bg-blue-500/20 border border-blue-400/30'
                  : 'bg-white/5 border border-white/10'
              }`}
              onClick={() => {
                if (hasSchedules && onSelectDay) onSelectDay(dateStr, schedules)
              }}
            >
              <div className='flex items-center justify-between mb-0.5'>
                <span
                  className={`text-xs font-medium ${
                    isToday ? 'text-blue-300' : 'text-white/85'
                  }`}
                >
                  {day}
                </span>
                {/* Schedule count — always visible for every date */}
                {hasSchedules && (
                  <span
                    title={`${count} schedule${count !== 1 ? 's' : ''}`}
                    aria-label={`${count} schedule${count !== 1 ? 's' : ''}`}
                    className='text-[10px] px-1 rounded font-medium bg-blue-500/30 text-blue-300'
                  >
                    {count}
                  </span>
                )}
              </div>

              <div className='space-y-px'>
                {schedules.slice(0, PREVIEW_COUNT).map(schedule => (
                  <div
                    key={schedule.id}
                    className={`text-[10px] px-1 py-px rounded truncate flex items-center gap-0.5 cursor-pointer ${
                      STATUS_CHIP[schedule.status] || 'bg-white/10 text-white/85'
                    }`}
                    onClick={e => {
                      e.stopPropagation()
                      if (onSelectSchedule) onSelectSchedule(schedule, dateStr)
                      else if (hasSchedules && onSelectDay)
                        onSelectDay(dateStr, schedules)
                    }}
                  >
                    <ScopeIcon scope={schedule.scope} />
                    <span className='truncate'>{getChipTitle(schedule)}</span>
                  </div>
                ))}
                {count > PREVIEW_COUNT && (
                  <div className='text-[10px] text-white/65 px-1'>
                    +{count - PREVIEW_COUNT} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className='calendar-legend flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-white/10'>
          {Object.keys(STATUS_DOT).map(status => (
            <div key={status} className='flex items-center gap-2'>
              <div className={`w-3 h-3 rounded border ${STATUS_DOT[status]}`} />
              <span className='text-xs text-white/85'>{status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CalendarView
