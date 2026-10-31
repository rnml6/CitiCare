// App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Residents from './pages/Residents.jsx'
import BHW from './pages/BHW.jsx'
import BHWDetail from './pages/BHWDetail.jsx'
import BHWForm from './pages/BHWForm.jsx'
import Schedules from './pages/Schedules.jsx'
import Purok from './pages/Purok.jsx'
import Medicines from './pages/Medicines.jsx'
import BHWHome from './pages/bhw-worker/BHWHome.jsx'
import MySchedules from './pages/bhw-worker/MySchedules.jsx'
import MyResidents from './pages/bhw-worker/MyResidents.jsx'
import MyAssignment from './pages/bhw-worker/MyAssignment.jsx'
import gumamelaBg from './assets/gumamela.jpg'

// BHW Workers (role === 'BHW Worker') get the scoped portal only.
// BHW Admin + Administrator keep the full admin interface.
const RequireAdmin = ({ children }) => {
  const { isAdminLike, loading } = useAuth()
  if (loading) return null
  return isAdminLike ? children : <Navigate to='/my-home' replace />
}

const RequireWorker = ({ children }) => {
  const { isBHWWorker, isAdminLike, loading } = useAuth()
  if (loading) return null
  if (isBHWWorker) return children
  // Admins landing on worker URLs get sent to the admin dashboard.
  return <Navigate to={isAdminLike ? '/dashboard' : '/login'} replace />
}

const HomeIndex = () => {
  const { homePath } = useAuth()
  return <Navigate to={homePath || '/dashboard'} replace />
}

function App () {
  const { isAuthenticated, loading, homePath } = useAuth()

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center relative overflow-hidden'>
        <div
          className='bg-pan'
          style={{ backgroundImage: `url(${gumamelaBg})` }}
        />
        <div className='absolute inset-0 bg-gradient-to-br from-blue-950/90 via-blue-900/85 to-indigo-950/80 backdrop-blur-sm' />

        {/* soft ambient glows */}
        <div className='absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl pointer-events-none' />
        <div className='absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-sky-400/15 blur-3xl pointer-events-none' />

        <div className='text-center animate-fade-in relative z-10 flex flex-col items-center px-6' role='status' aria-label='Loading CitiCare'>
          <div className='w-fit'>
            <h1 className='flex gap-[2px] text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none'>
              {'CITICARE'.split('').map((letter, i) => (
                <span
                  key={i}
                  className='citicare-letter inline-block'
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {letter}
                </span>
              ))}
            </h1>

            {/* loading progress bar - same width as text */}
            <div className='mt-2 w-full h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10'>
              <div className='h-full w-1/3 rounded-full citicare-loading-bar bg-gradient-to-r from-blue-400 via-sky-300 to-blue-400' />
            </div>
          </div>
        </div>

        <style>{`
          .citicare-letter {
            animation: citicareLetterBounce 1.2s ease-in-out infinite;
          }
          @keyframes citicareLetterBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.85; }
            30% { transform: translateY(-8px); opacity: 1; }
          }
          .citicare-loading-bar {
            animation: citicareSlide 1.4s ease-in-out infinite;
          }
          @keyframes citicareSlide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className='relative min-h-screen'>
      {/* Animated gumamela background */}
      <div className='fixed inset-0 z-0 overflow-hidden pointer-events-none'>
        <div
          className='bg-pan'
          style={{ backgroundImage: `url(${gumamelaBg})` }}
        />
      </div>

      {/* Overlay for all pages except login */}
      {isAuthenticated && (
        <div className='fixed inset-0 bg-gradient-to-br from-blue-950/85 via-blue-900/80 to-indigo-950/75 backdrop-blur-[3px] z-0' />
      )}

      {/* Animated background elements for authenticated pages */}
      {isAuthenticated && (
        <div className='fixed inset-0 z-0 overflow-hidden pointer-events-none'>
          <div
            className='absolute -top-1/2 -left-1/2 w-full h-full opacity-20'
            style={{
              background:
                'radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)',
              animation: 'rotate 30s linear infinite'
            }}
          />
        </div>
      )}

      <Routes>
        <Route
          path='/login'
          element={
            isAuthenticated ? <Navigate to={homePath || '/dashboard'} replace /> : <Login />
          }
        />
        <Route
          path='/'
          element={
            isAuthenticated ? <Layout /> : <Navigate to='/login' replace />
          }
        >
          <Route index element={<HomeIndex />} />
          {/* Admin interface (Administrator + BHW Admin) */}
          <Route path='dashboard' element={<RequireAdmin><Dashboard /></RequireAdmin>} />
          <Route path='residents' element={<RequireAdmin><Residents /></RequireAdmin>} />
          <Route path='bhw' element={<RequireAdmin><BHW /></RequireAdmin>} />
          <Route path='bhw/new' element={<RequireAdmin><BHWForm /></RequireAdmin>} />
          <Route path='bhw/:id' element={<RequireAdmin><BHWDetail /></RequireAdmin>} />
          <Route path='bhw/:id/edit' element={<RequireAdmin><BHWForm /></RequireAdmin>} />
          <Route path='schedules' element={<RequireAdmin><Schedules /></RequireAdmin>} />
          <Route path='purok' element={<RequireAdmin><Purok /></RequireAdmin>} />
          <Route path='medicines' element={<RequireAdmin><Medicines /></RequireAdmin>} />
          {/* BHW Worker portal (role === 'BHW Worker') */}
          <Route path='my-home' element={<RequireWorker><BHWHome /></RequireWorker>} />
          <Route path='my-schedules' element={<RequireWorker><MySchedules /></RequireWorker>} />
          <Route path='my-residents' element={<RequireWorker><MyResidents /></RequireWorker>} />
          <Route path='my-assignment' element={<RequireWorker><MyAssignment /></RequireWorker>} />
        </Route>
        <Route path='*' element={<Navigate to={isAuthenticated ? (homePath || '/dashboard') : '/login'} replace />} />
      </Routes>
    </div>
  )
}

export default App
