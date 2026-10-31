// components/Sidebar.jsx
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Heart,
  Calendar,
  MapPin,
  LogOut,
  ChevronLeft,
  Home,
  ClipboardList
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { dialog } from '../context/DialogContext'
import { Pill } from 'lucide-react'
import logo from '../assets/logo.png'

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

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { user, logout, isBHWWorker } = useAuth()

  const navItems = isBHWWorker ? workerNav : adminNav

  const isActive = path => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    if (path === '/my-home') return location.pathname === '/my-home'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={`
      hidden lg:flex flex-col shrink-0
      transition-[width] duration-300 ease-in-out border border-white/10
      ${collapsed ? 'w-20' : 'w-64'}
      glass m-4 mr-0 rounded-2xl
    `}
    >
      <div className='px-5 py-4 pt-6 border-b border-white/10'>
        <div className='flex items-center justify-between'>
          <div
            className={`flex items-center ${
              collapsed ? 'justify-center w-full' : 'space-x-1.5'
            }`}
          >
            <div
              className='w-11 h-11 rounded-full overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 p-1 shadow-md cursor-pointer'
              onClick={() => collapsed && setCollapsed(false)}
            >
              <img
                src={logo}
                alt='CitiCare'
                className='w-full h-full object-cover rounded-full'
              />
            </div>
{!collapsed && (
              <div>
                <h1 className='text-base uppercase font-bold text-white leading-tight'>
                  CitiCare
                </h1>
                <p className='text-[10px] font-medium uppercase tracking-wider text-blue-300/90'>
                  Barangay Gumamela
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className='p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors'
              title='Collapse sidebar'
            >
              <ChevronLeft className='w-4 h-4' />
            </button>
          ) }
        </div>
      </div>

   

       <nav className='flex-1 px-3 pb-3 space-y-1 overflow-y-auto pt-4'>
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                sidebar-link
                ${active ? 'active' : ''}
                ${collapsed ? 'justify-center px-0' : ''}
              `}
              title={collapsed ? item.label : ''}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 ${
                  active ? 'text-blue-300' : ''
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className='p-3 border-t border-white/10'>
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
          className={`w-full flex items-center space-x-2.5 px-4 py-2.5 rounded-xl text-sm font-medium
            text-white/65 hover:text-red-300 hover:bg-red-500/10
            transition-colors duration-200 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
        >
          <LogOut className='w-4 h-4' />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
