// components/MobileBottomNav.jsx
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Heart,
  Calendar,
  MapPin,
  Pill,
  Home,
  ClipboardList
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const adminNav = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/residents', icon: Users, label: 'Residents' },
  { path: '/bhw', icon: Heart, label: 'Health Workers' },
  { path: '/schedules', icon: Calendar, label: 'Schedules' },
  { path: '/purok', icon: MapPin, label: 'Puroks' },
  { path: '/medicines', icon: Pill, label: 'Medicines' }
]

const workerNav = [
{ path: '/my-home', icon: Home, label: 'Dashboard' },
  { path: '/my-schedules', icon: Calendar, label: 'Schedules' },
  { path: '/my-residents', icon: Users, label: 'Residents' },
  { path: '/my-assignment', icon: ClipboardList, label: 'Profile' }
]

const MobileBottomNav = () => {
  const location = useLocation()
  const { isBHWWorker } = useAuth()
  const navItems = isBHWWorker ? workerNav : adminNav

  const isActive = path => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    if (path === '/my-home') return location.pathname === '/my-home'
    return location.pathname.startsWith(path)
  }

  return (
    <nav className='lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-2xl border border-white/20 bg-[#0a0f28]/90 backdrop-blur-xl shadow-2xl shadow-black/40'>
      <div className={`grid p-2 py-2.5 gap-1 ${navItems.length === 6 ? 'grid-cols-6' : 'grid-cols-4'}`}>
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-1 min-h-12 rounded-xl transition-all duration-200 ${
                active
                  ? 'bg-blue-500/25 border border-blue-400/40 text-blue-200'
                  : 'text-white/65 hover:text-white/75'
              }`}
            >
              <Icon
                className='w-5 h-5'
                strokeWidth={active ? 2.2 : 1.8}
              />
              {navItems.length !== 6 && (
                <span className='text-[10px] leading-none font-medium truncate max-w-full'>
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileBottomNav
