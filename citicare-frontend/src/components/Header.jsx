// components/Header.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Bell,
  AlertTriangle,
  Clock,
  Activity,
  Search,
  ChevronRight,
  LogOut,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  XCircle,
  Stethoscope,
  MapPin
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { dashboardApi } from '../api/dashboardApi'
import { navigateWithReturn } from '../utils/navigation'
import GlassInput from './GlassInput'
import GlassSelect from './GlassSelect'
import Modal from './Modal'
import { dialog } from '../context/DialogContext'
import Pagination from './Pagination'
import { SkeletonNotificationList } from './Skeleton'
import logo from '../assets/logo.png'

const Header = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showAllNotifications, setShowAllNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  // IDs the user has already viewed (persisted) — the bell bubble only
  // counts new (unseen) notifications and clears once viewed.
  const [seenNotifIds, setSeenNotifIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('citicare_seen_notifs') || '[]'))
    } catch {
      return new Set()
    }
  })

  const [notifSearch, setNotifSearch] = useState('')
  const [notifType, setNotifType] = useState('all')
  const [notifMonth, setNotifMonth] = useState('all')
  const [notifYear, setNotifYear] = useState('all')
  const [notifPage, setNotifPage] = useState(1)
  const notifPerPage = 6

  useEffect(() => {
    setNotifPage(1)
  }, [notifSearch, notifType, notifMonth, notifYear, showAllNotifications])

  const notifDropdownRef = useRef(null)

  useEffect(() => {
    if (showNotifications || showAllNotifications) {
      fetchNotifications()
    }
  }, [showNotifications, showAllNotifications])

  // Once the user views the notifications, mark everything currently
  // loaded as seen so the bell bubble goes back to 0 / hides.
  useEffect(() => {
    if ((showNotifications || showAllNotifications) && notifications.length > 0) {
      setSeenNotifIds(prev => {
        if (!notifications.some(n => !prev.has(n.id))) return prev
        const next = [...prev, ...notifications.map(n => n.id)].slice(-300)
        try {
          localStorage.setItem('citicare_seen_notifs', JSON.stringify(next))
        } catch {
          // storage unavailable — keep in-memory only
        }
        return new Set(next)
      })
    }
  }, [notifications, showNotifications, showAllNotifications])

  const unreadCount = notifications.filter(n => !seenNotifIds.has(n.id)).length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = e => {
      if (
        notifDropdownRef.current &&
        !notifDropdownRef.current.contains(e.target)
      ) {
        setShowNotifications(false)
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifications])

  const formatNotifTime = time => {
    if (!time) return ''
    const [h, m] = time.split(':')
    if (!h || h === '00' && !m) return ''
    const hours = parseInt(h, 10)
    const mins = m || '00'
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHour = hours % 12 || 12
    return `${displayHour}:${mins} ${period}`
  }

  const formatNotifDate = dateStr => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    if (isNaN(date)) return dateStr
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const fetchNotifications = async () => {
    setLoadingNotifications(true)
    try {
      const res = await dashboardApi.getNotifications()
      if (!res.data.success) return

      const data = res.data.data
      const todayStr = new Date().toISOString().split('T')[0]
      const allNotifications = []

      const scheduleTitle = s =>
        s.scope && s.scope !== 'individual'
          ? s.programName || s.type
          : s.residentName || s.programName || s.type
      const scheduleNav = s => ({
        to: '/schedules',
        state: { viewScheduleId: s.id }
      })

      // Recent activities (last 7 days)
      if (data.activities?.length) {
        data.activities.forEach(activity => {
          allNotifications.push({
            id: `activity-${activity.id}`,
            type: 'Activity',
            title: scheduleTitle(activity),
            description: `${
              activity.residentName || 'Multiple residents'
            } - ${formatNotifTime(activity.time)}`,
            date: activity.date,
            status: activity.status,
            icon: Activity,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            nav: scheduleNav(activity)
          })
        })
      }

      // Due today — most urgent actionable item
      if (data.today?.length) {
        data.today.forEach(item => {
          allNotifications.push({
            id: `today-${item.id}`,
            type: item.reminderType || "Today's Schedule",
            title: scheduleTitle(item),
            description: `${item.residentName || 'Multiple residents'} - Today at ${formatNotifTime(item.time)}`,
            date: item.date,
            status: item.status,
            icon: CalendarCheck,
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10',
            nav: scheduleNav(item)
          })
        })
      }

      // Reminders (tomorrow + upcoming schedules)
      if (data.reminders?.length) {
        data.reminders.forEach(reminder => {
          const isTomorrow = reminder.reminderType === "Tomorrow's Schedule"
          allNotifications.push({
            id: `reminder-${reminder.id}`,
            type: reminder.reminderType,
            title: scheduleTitle(reminder),
            description: `${reminder.residentName || 'Multiple residents'} - ${formatNotifDate(
              reminder.date
            )} at ${formatNotifTime(reminder.time)}`,
            date: reminder.date,
            status: reminder.status,
            icon: isTomorrow ? CalendarDays : Clock,
            color: isTomorrow ? 'text-blue-400' : 'text-purple-300',
            bgColor: isTomorrow ? 'bg-blue-500/10' : 'bg-purple-500/10',
            nav: scheduleNav(reminder)
          })
        })
      }

      // Missed schedules — need rescheduling
      if (data.missed?.length) {
        data.missed.forEach(item => {
          allNotifications.push({
            id: `missed-${item.id}`,
            type: item.reminderType || 'Missed Schedule',
            title: scheduleTitle(item),
            description: `Missed on ${formatNotifDate(item.date)} - needs reschedule`,
            date: item.date,
            status: item.status,
            icon: XCircle,
            color: 'text-red-400',
            bgColor: 'bg-red-500/10',
            nav: scheduleNav(item)
          })
        })
      }

      // Recently cancelled schedules
      if (data.cancelled?.length) {
        data.cancelled.forEach(item => {
          allNotifications.push({
            id: `cancelled-${item.id}`,
            type: item.reminderType || 'Cancelled Schedule',
            title: scheduleTitle(item),
            description: `Cancelled - was set for ${formatNotifDate(item.date)}`,
            date: item.date,
            status: item.status,
            icon: XCircle,
            color: 'text-white/65',
            bgColor: 'bg-white/5',
            nav: scheduleNav(item)
          })
        })
      }

      // Critical risk residents
      if (data.criticalResidents?.length) {
        data.criticalResidents.forEach(resident => {
          allNotifications.push({
            id: `critical-${resident.id}`,
            type: 'Critical Risk',
            title: resident.name,
            description: `Risk Score: ${resident.riskScore} - ${resident.purok}`,
            date: todayStr,
            status: 'Critical',
            icon: AlertTriangle,
            color: 'text-red-400',
            bgColor: 'bg-red-500/10',
            nav: { to: '/residents', state: { viewResidentId: resident.id } }
          })
        })
      }

      // High risk residents
      if (data.highRiskResidents?.length) {
        data.highRiskResidents.forEach(resident => {
          allNotifications.push({
            id: `high-${resident.id}`,
            type: 'High Risk',
            title: resident.name,
            description: `Risk Score: ${resident.riskScore} - ${resident.purok}`,
            date: todayStr,
            status: 'High',
            icon: AlertTriangle,
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10',
            nav: { to: '/residents', state: { viewResidentId: resident.id } }
          })
        })
      }

      // Overdue checkups — no visit recorded, or last visit over 90 days ago
      if (data.overdueCheckups?.length) {
        data.overdueCheckups.forEach(resident => {
          allNotifications.push({
            id: `overdue-${resident.id}`,
            type: 'Overdue Checkup',
            title: resident.name,
            description: resident.lastCheckup
              ? `Last visit ${formatNotifDate(resident.lastCheckup)} - ${resident.purok}`
              : `No visit recorded - ${resident.purok}`,
            date: todayStr,
            status: 'Overdue',
            icon: Stethoscope,
            color: 'text-amber-300',
            bgColor: 'bg-amber-500/10',
            nav: { to: '/residents', state: { viewResidentId: resident.id } }
          })
        })
      }

      // Puroks with no active BHW assigned
      if (data.unassignedPuroks?.length) {
        data.unassignedPuroks.forEach(purok => {
          allNotifications.push({
            id: `unassigned-purok-${purok.id}`,
            type: 'Unassigned Purok',
            title: purok.name,
            description: 'No active BHW assigned',
            date: todayStr,
            status: 'Action needed',
            icon: MapPin,
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10',
            nav: { to: '/purok', state: { viewPurokId: purok.id } }
          })
        })
      }

      // Puroks with no upcoming health program
      if (data.puroksWithoutPrograms?.length) {
        data.puroksWithoutPrograms.forEach(purok => {
          allNotifications.push({
            id: `no-program-${purok.id}`,
            type: 'No Upcoming Program',
            title: purok.name,
            description: 'No upcoming health program scheduled',
            date: todayStr,
            status: 'Action needed',
            icon: CalendarX,
            color: 'text-blue-300',
            bgColor: 'bg-blue-500/10',
            nav: { to: '/purok', state: { viewPurokId: purok.id } }
          })
        })
      }

      allNotifications.sort((a, b) => new Date(b.date) - new Date(a.date))
      setNotifications(allNotifications)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoadingNotifications(false)
    }
  }

  const closeAllNotifications = () => {
    setShowAllNotifications(false)
    setNotifSearch('')
    setNotifType('all')
    setNotifMonth('all')
    setNotifYear('all')
  }

  // Clicking a notification goes to its Schedule / Resident / Purok details.
  const handleNotifClick = notif => {
    if (!notif.nav) return
    setShowNotifications(false)
    setShowAllNotifications(false)
    navigateWithReturn(navigate, location, notif.nav.to, notif.nav.state)
  }

  const filteredNotifications = notifications.filter(n => {
    if (
      notifSearch &&
      !n.title?.toLowerCase().includes(notifSearch.toLowerCase()) &&
      !n.description?.toLowerCase().includes(notifSearch.toLowerCase())
    )
      return false
    if (notifType !== 'all' && n.type !== notifType) return false
    if (
      notifMonth !== 'all' &&
      new Date(n.date).getMonth() !== parseInt(notifMonth)
    )
      return false
    if (
      notifYear !== 'all' &&
      new Date(n.date).getFullYear() !== parseInt(notifYear)
    )
      return false
    return true
  })

  const notificationCount = notifications.length
  const recentNotifications = notifications.slice(0, 5)
  const totalNotifPages = Math.max(1, Math.ceil(filteredNotifications.length / notifPerPage))
  const safeNotifPage = Math.min(Math.max(1, notifPage), totalNotifPages)
  const paginatedNotifications = filteredNotifications.slice(
    (safeNotifPage - 1) * notifPerPage,
    safeNotifPage * notifPerPage
  )

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
  const years = [
    ...new Set(notifications.map(n => new Date(n.date).getFullYear()))
  ].sort((a, b) => b - a)
  const notificationTypes = [...new Set(notifications.map(n => n.type))].sort((a, b) => a.localeCompare(b))

  const hasActiveNotifFilters =
    notifSearch !== '' ||
    notifType !== 'all' ||
    notifMonth !== 'all' ||
    notifYear !== 'all'
  const clearNotifFilters = () => {
    setNotifSearch('')
    setNotifType('all')
    setNotifMonth('all')
    setNotifYear('all')
  }

  return (
    <>
      <header className='sticky top-0 z-20 glass m-0 lg:m-4 lg:mb-0 px-4 md:px-6 py-3 md:py-4 rounded-none lg:rounded-2xl'>
        <div className='flex items-center justify-between'>
          <div className='hidden sm:flex items-end gap-1 min-w-0'>
            <p className='text-sm font-medium uppercase tracking-wider text-white/50 hidden sm:block'>
              Welcome back,
            </p>
            <h2 className='text-lg font-bold text-white leading-tight truncate'>
              {user?.name}
            </h2>
          </div>

          <div className='md:hidden flex items-center gap-2'>
            <div className='w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 p-0.5'>
              <img
                src={logo}
                alt='CitiCare'
                className='w-full h-full object-contain rounded-full'
              />
            </div>
            <span className='text-lg font-bold text-white'>
              CITICARE
            </span>
          </div>

          <div className='responsive-header-actions flex items-center space-x-2 ml-auto'>
            {/* Notification Bell */}
            <div className='relative' ref={notifDropdownRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className='relative p-2.5 rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/15 hover:border-white/20 transition-all duration-200'
              >
                <Bell className='w-5 h-5 text-white/75' />
                {unreadCount > 0 && (
                  <span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold shadow-md shadow-red-500/40'>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown - Glassmorphism Blue */}
              {showNotifications && (
                <>
                  <button
                    type='button'
                    aria-label='Close notifications'
                    onClick={() => setShowNotifications(false)}
                    className='fixed inset-0 z-40 bg-black/80 backdrop-blur-xl sm:hidden'
                  />
                  <div className='absolute -right-11 sm:right-0 top-12 w-[calc(100vw-2rem)] sm:w-80 rounded-2xl bg-[#0a0f28]/95 backdrop-blur-2xl sm:bg-[#0a0f28]/80 sm:backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40 z-50 overflow-hidden'>
                  <div className='p-4 border-b border-white/10 flex items-center justify-between'>
                    <h3
                      className='text-md font-semibold text-white'
                     
                    >
                      Notifications
                    </h3>
                    <span className='text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30'>
                      {notificationCount}
                    </span>
                  </div>

                  <div className='max-h-80 overflow-y-auto'>
                    {loadingNotifications ? (
                      <SkeletonNotificationList count={4} />
                    ) : recentNotifications.length > 0 ? (
                      recentNotifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className='p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer'
                        >
                          <div className='flex items-start gap-3'>
                            <div
                              className={`w-8 h-8 rounded-lg ${notif.bgColor} border border-white/10 flex items-center justify-center flex-shrink-0`}
                            >
                              <notif.icon
                                className={`w-4 h-4 ${notif.color}`}
                              />
                            </div>
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center justify-between'>
                                <span className='text-[10px] text-white/65'>
                                  {notif.type}
                                </span>
                                <span className='text-[10px] text-white/65'>
                                  {formatNotifDate(notif.date)}
                                </span>
                              </div>
                              <p className='text-white text-sm font-medium truncate'>
                                {notif.title}
                              </p>
                              <p className='text-xs text-white/75 truncate'>
                                {notif.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className='text-center py-8'>
                        <Bell className='w-8 h-8 text-white/50 mx-auto mb-2' />
                        <p className='text-xs text-white/65'>
                          No notifications
                        </p>
                      </div>
                    )}
                  </div>

                  {notifications.length > 5 && (
                    <button
                      onClick={() => {
                        setShowNotifications(false)
                        setShowAllNotifications(true)
                      }}
                      className='w-full p-3 text-center text-xs text-blue-400 hover:text-blue-300 border-t border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-1'
                    >
                      See all notifications
                      <ChevronRight className='w-3 h-3' />
                    </button>
                  )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={async () => {
                const confirmed = await dialog.confirm({
                  message: 'Are you sure you want to log out?',
                  confirmText: 'Sign out',
                  cancelText: 'Cancel',
                  destructive: true,
                  initialFocus: 'none',
                  messageSize: 'lg',
                  iconTone: 'danger',
                  confirmClassName:
                    '!bg-red-700 hover:!bg-red-700 active:!bg-red-700 hover:!filter-none',
                  ariaLabel: 'Log out',
                })
                if (confirmed) logout()
              }}
              className='responsive-signout lg:hidden p-2.5 rounded-xl border border-white/10 bg-white/[0.06] hover:bg-red-500/15 hover:border-red-400/30 transition-all duration-200'
              title='Sign Out'
            >
              <LogOut className='w-5 h-5 text-white/75' />
            </button>
          </div>
        </div>
      </header>

      {/* All Notifications Modal */}
      <Modal
        isOpen={showAllNotifications}
        onClose={closeAllNotifications}
        title='All Notifications'
        size='lg'
        backdropClassName='!backdrop-blur-md sm:!backdrop-blur-sm'
        panelClassName='!max-h-[calc(100dvh-1.5rem)] sm:!max-h-none'
        bodyClassName='p-4 sm:p-6 !pb-5 !max-h-[calc(100dvh-5rem)] sm:!max-h-[70vh] overflow-y-auto'
      >
        <div className='space-y-4'>
          {/* Filters — single row of compact bubble controls */}
          <div className='flex w-full flex-wrap items-center gap-2'>
            <div className='w-full min-w-0 flex-1 basis-full sm:basis-auto'>
              <GlassInput icon={Search} placeholder='Search notifications...' value={notifSearch} onChange={e => setNotifSearch(e.target.value)} className='!rounded-full !py-2 !text-xs' />
            </div>
            <GlassSelect
              value={notifType}
              onChange={setNotifType}
              size='sm'
              className='min-w-0 flex-1 sm:flex-none sm:w-28 [&_input]:!rounded-full [&_input]:!py-2 [&_input]:!text-xs'
              options={[
                { value: 'all', label: 'All Types' },
                ...notificationTypes.map(type => ({
                  value: type,
                  label: type
                }))
              ]}
            />
            <GlassSelect
              value={notifMonth}
              onChange={setNotifMonth}
              size='sm'
              paginate={false}
              className='min-w-0 flex-1 sm:flex-none sm:w-28 [&_input]:!rounded-full [&_input]:!py-2 [&_input]:!text-xs'
              options={[
                { value: 'all', label: 'All Months' },
                ...months.map((m, i) => ({ value: String(i), label: m }))
              ]}
            />
            <GlassSelect
              value={notifYear}
              onChange={setNotifYear}
              size='sm'
              className='min-w-0 flex-1 sm:flex-none sm:w-28 [&_input]:!rounded-full [&_input]:!py-2 [&_input]:!text-xs'
              options={[
                { value: 'all', label: 'All Years' },
                ...years.map(y => ({ value: String(y), label: String(y) }))
              ]}
            />
            {hasActiveNotifFilters && (
              <button
                onClick={clearNotifFilters}
                className='px-2.5 py-2 rounded-full text-xs font-medium transition-all duration-200 bg-white/10 text-white/85 hover:bg-white/20 border border-white/20 shrink-0'
              >
                Clear
              </button>
            )}
          </div>

          <p className='text-xs text-white/65'>
            {filteredNotifications.length} of {notifications.length} notification
            {filteredNotifications.length !== 1 ? 's' : ''}{hasActiveNotifFilters && ' (filtered)'}
          </p>

          <div className='max-h-96 overflow-y-auto space-y-2'>
            {loadingNotifications ? (
              <SkeletonNotificationList count={6} variant='cards' />
            ) : filteredNotifications.length > 0 ? (
              paginatedNotifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className='bg-white/5 rounded-lg p-4 hover:bg-white/[0.07] transition-colors cursor-pointer'
                >
                  <div className='flex items-start gap-3'>
                    <div
                      className={`w-10 h-10 rounded-lg ${notif.bgColor} border border-white/10 flex items-center justify-center flex-shrink-0`}
                    >
                      <notif.icon className={`w-5 h-5 ${notif.color}`} />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center justify-between mb-1'>
                        <span className='text-xs text-blue-300'>
                          {notif.type}
                        </span>
                        <span className='text-xs text-white/65'>
                          {formatNotifDate(notif.date)}
                        </span>
                      </div>
                      <p className='text-white text-sm font-medium'>
                        {notif.title}
                      </p>
                      <p className='text-xs text-white/75 mt-0.5'>
                        {notif.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center py-12'>
                <Bell className='w-12 h-12 text-white/50 mx-auto mb-3' />
                <p className='text-white/65 text-sm'>
                  No notifications match your filters
                </p>
              </div>
            )}
          </div>
          {!loadingNotifications && filteredNotifications.length > 0 && (
            <Pagination
              page={safeNotifPage}
              totalPages={totalNotifPages}
              onPageChange={setNotifPage}
              total={filteredNotifications.length}
              perPage={notifPerPage}
              hidePageIndicatorOnMobile
            />
          )}
        </div>
      </Modal>

    </>
  )
}

export default Header
