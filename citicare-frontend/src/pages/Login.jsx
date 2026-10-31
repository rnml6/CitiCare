// pages/Login.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import logo from '../assets/logo.png'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { login, sessionExpired } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!error) return undefined
    const timeout = window.setTimeout(() => setError(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [error])

  useEffect(() => {
    const scrollY = window.scrollY
    const htmlStyle = document.documentElement.style
    const bodyStyle = document.body.style
    const previous = {
      htmlOverflow: htmlStyle.overflow,
      htmlOverscroll: htmlStyle.overscrollBehavior,
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyLeft: bodyStyle.left,
      bodyRight: bodyStyle.right,
      bodyWidth: bodyStyle.width,
      bodyOverflow: bodyStyle.overflow,
      bodyOverscroll: bodyStyle.overscrollBehavior
    }

    htmlStyle.overflow = 'hidden'
    htmlStyle.overscrollBehavior = 'none'
    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${scrollY}px`
    bodyStyle.left = '0'
    bodyStyle.right = '0'
    bodyStyle.width = '100%'
    bodyStyle.overflow = 'hidden'
    bodyStyle.overscrollBehavior = 'none'

    return () => {
      htmlStyle.overflow = previous.htmlOverflow
      htmlStyle.overscrollBehavior = previous.htmlOverscroll
      bodyStyle.position = previous.bodyPosition
      bodyStyle.top = previous.bodyTop
      bodyStyle.left = previous.bodyLeft
      bodyStyle.right = previous.bodyRight
      bodyStyle.width = previous.bodyWidth
      bodyStyle.overflow = previous.bodyOverflow
      bodyStyle.overscrollBehavior = previous.bodyOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!email || !password) {
      setError('Please fill out all fields')
      setLoading(false)
      return
    }

    if (!privacyAccepted) {
      setError('Please acknowledge the Data Privacy Act notice to continue')
      setLoading(false)
      return
    }

    const result = await login(email, password)

    if (result.success) {
      const role = result.data?.role || null
      navigate(role === 'BHW Worker' ? '/my-home' : '/dashboard')
    } else {
      setError(result.message)
    }

    setLoading(false)
  }

  return (
    <div
      className='fixed inset-0 h-[100dvh] min-h-0 w-full flex items-center justify-center px-6 py-3 sm:p-10 overflow-hidden overscroll-none'
     
    >
      {/* Blue overlay */}
      <div className='fixed inset-0 bg-gradient-to-br from-blue-950/80 via-blue-900/70 to-blue-800/55 backdrop-blur-[3px] z-[1]' />

      {/* Initial View */}
      <div
        className={`flex flex-col items-center justify-center absolute inset-0 transition-all duration-500 ease-in-out ${
          showForm
            ? 'opacity-0 scale-95 pointer-events-none'
            : 'opacity-100 scale-100'
        }`}
        style={{ zIndex: showForm ? 8 : 10 }}
      >
        <div className='relative flex flex-col items-center'>
          <div className='shine-sweep w-[190px] h-[190px] sm:w-[340px] sm:h-[340px] rounded-full overflow-hidden bg-white/5 border-2 border-white/20 shadow-[0_25px_80px_rgba(0,0,0,0.6)] flex items-center justify-center p-5 sm:p-8 animate-[logoEntrance_0.8s_ease_forwards]'
            style={{ '--shine-delay': '0.5s', '--shine-duration': '3.2s' }}
          >
            <img
              src={logo}
              alt='CitiCare Logo'
              className='w-full h-full object-contain rounded-full'
            />
          </div>

          <div
            className='mt-1 sm:mt-2 text-center animate-[slideUp_0.6s_ease_forwards] opacity-0'
            style={{ animationDelay: '0.25s' }}
          >
            <h1
              className='text-[30px] sm:text-[40px] font-extrabold uppercase text-white mt-1 sm:mt-2'
             
            >
              CitiCare
            </h1>
            <p
              className='text-[12px] sm:text-[16px] text-blue-200 font-normal -mt-1 sm:-mt-2 uppercase tracking-[0.16em] sm:tracking-widest'
             
            >
              Barangay Gumamela Healthcare Monitoring System
            </p>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className='shine-sweep login-btn mt-4 sm:mt-6 py-[10px] sm:py-[12px] px-8 sm:px-20 rounded-2xl text-white text-[14px] sm:text-[16px] font-semibold'
            style={{
              animationDelay: '0.45s',
              '--shine-delay': '0.9s',
              '--shine-duration': '3.2s'
            }}
          >
            Login
          </button>
        </div>
      </div>

      {/* Form View */}
      <div
        className={`w-full transition-all duration-500 ease-in-out ${
          showForm
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ zIndex: showForm ? 10 : 8 }}
      >
        <div className='relative w-full max-w-full sm:max-w-[400px] mx-auto px-6 py-4 sm:p-7 pt-8 sm:pt-12 rounded-3xl bg-white/[0.09] border border-white/30 shadow-[0_25px_55px_rgba(2,21,41,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl text-white'>
          <button
            onClick={() => setShowForm(false)}
            className='absolute top-4 right-4 w-[27px] h-[27px] bg-white/10 border border-white/20 rounded-full text-white/75 p-1.5 flex items-center justify-center hover:bg-white/20 transition-colors'
          >
            <svg viewBox='0 0 24 24' fill='none' className='w-full h-full'>
              <path
                d='M18 6L6 18M6 6l12 12'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
          </button>

          <div className='text-center mb-4 sm:mb-6 pt-4 sm:pt-6'>
            <h2
              className='text-2xl sm:text-3xl font-bold tracking-[-0.01em]'
             
            >
              Welcome Back
            </h2>
            <p
              className='text-[13px] sm:text-[15px] text-white/75'
             
            >
              Sign in to your account
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className='flex flex-col gap-3 sm:gap-4'
          >
            <label className='flex flex-col gap-1.5 sm:gap-2'>
              <span
                className='text-[14px] sm:text-[16px] font-semibold text-white/85'
               
              >
                Email
              </span>
                <div className='flex items-center gap-2.5 sm:gap-3 bg-white/[0.06] border border-white/20 rounded-2xl px-4 sm:px-5 transition-all focus-within:border-white/65 focus-within:bg-white/[0.12] focus-within:shadow-[0_0_0_4px_rgba(139,160,182,0.22)] focus-within:-translate-y-px'>
                <svg
                  className='w-[20px] h-[20px] flex-shrink-0 text-white/75'
                  viewBox='0 0 24 24'
                  fill='none'
                  aria-hidden='true'
                >
                  <circle
                    cx='12'
                    cy='8'
                    r='3.5'
                    stroke='currentColor'
                    strokeWidth='1.6'
                  />
                  <path
                    d='M5 19c0-3.314 3.134-6 7-6s7 2.686 7 6'
                    stroke='currentColor'
                    strokeWidth='1.6'
                    strokeLinecap='round'
                  />
                </svg>
                <input
                  type='text'
                  placeholder='Enter your email'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete='username'
                  required
                  className='flex-1 bg-transparent border-none outline-none py-3 sm:py-[16px] text-[14px] sm:text-[15px] text-white placeholder:text-white/65 w-full'
                />
              </div>
            </label>

            <label className='flex flex-col gap-1.5 sm:gap-2'>
              <span
                className='text-[14px] sm:text-[16px] font-semibold text-white/85'
               
              >
                Password
              </span>
                <div className='flex items-center gap-2.5 sm:gap-3 bg-white/[0.06] border border-white/20 rounded-2xl px-4 sm:px-5 transition-all focus-within:border-white/65 focus-within:bg-white/[0.12] focus-within:shadow-[0_0_0_4px_rgba(139,160,182,0.22)] focus-within:-translate-y-px'>
                <svg
                  className='w-[20px] h-[20px] flex-shrink-0 text-white/75'
                  viewBox='0 0 24 24'
                  fill='none'
                  aria-hidden='true'
                >
                  <rect
                    x='5'
                    y='10.5'
                    width='14'
                    height='9'
                    rx='1.6'
                    stroke='currentColor'
                    strokeWidth='1.6'
                  />
                  <path
                    d='M8 10.5V8a4 4 0 0 1 8 0v2.5'
                    stroke='currentColor'
                    strokeWidth='1.6'
                  />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Enter your password'
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete='current-password'
                  required
                  className='flex-1 bg-transparent border-none outline-none py-3 sm:py-[16px] text-[14px] sm:text-[15px] text-white placeholder:text-white/65 w-full'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(v => !v)}
                  className='bg-transparent border-none p-1 cursor-pointer flex items-center text-white/75'
                >
                  {showPassword ? (
                    <svg viewBox='0 0 24 24' fill='none' className='w-5 h-5'>
                      <path
                        d='M3 3l18 18'
                        stroke='currentColor'
                        strokeWidth='1.6'
                        strokeLinecap='round'
                      />
                    </svg>
                  ) : (
                    <svg viewBox='0 0 24 24' fill='none' className='w-5 h-5'>
                      <path
                        d='M2 12c1.6-4.7 5.5-7.5 10-7.5s8.4 2.8 10 7.5c-1.6 4.7-5.5 7.5-10 7.5S3.6 16.7 2 12Z'
                        stroke='currentColor'
                        strokeWidth='1.6'
                      />
                      <circle
                        cx='12'
                        cy='12'
                        r='3'
                        stroke='currentColor'
                        strokeWidth='1.6'
                      />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <label className='-mt-1 flex items-start gap-2.5 pl-2 text-xs sm:text-sm text-white/80 leading-snug'>
              <input
                type='checkbox'
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                required
                className='privacy-policy-checkbox mt-0.5 h-4 w-4 shrink-0'
              />
              <span>
                I agree to the{' '}
                <button
                  type='button'
                  onClick={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    setShowPrivacyPolicy(true)
                  }}
                  className='font-semibold text-sky-300 hover:text-sky-200'
                >
                  Privacy Policy
                </button>
              </span>
            </label>

            {error && (
              <p className='text-[13px] sm:text-[14px] text-red-200 bg-red-500/20 border border-red-400/30 rounded-xl p-3 sm:p-4 animate-[shake_0.4s_both]'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading}
              className={`login-btn py-[10px] sm:py-[11px] border-none rounded-2xl text-white text-[14px] sm:text-[16px] font-semibold cursor-pointer ${error ? 'mt-0' : 'mt-2'}`}
             
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <Modal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
        title='Privacy Policy'
        size='md'
      >
        <div className='space-y-4 text-sm leading-relaxed text-white/80'>
          <p>
            CitiCare handles personal information in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.
          </p>
          <section>
            <h3 className='mb-1 font-semibold text-white'>Information and purpose</h3>
            <p>
              Information entered into CitiCare is used by authorized barangay health personnel to manage accounts and support healthcare monitoring, scheduling, and related services.
            </p>
          </section>
          <section>
            <h3 className='mb-1 font-semibold text-white'>Access and protection</h3>
            <p>
              Access is limited to authorized users according to their roles. Reasonable safeguards are used to protect information against unauthorized access, disclosure, alteration, or loss.
            </p>
          </section>
          <section>
            <h3 className='mb-1 font-semibold text-white'>Your rights</h3>
            <p>
              You may exercise your rights as a data subject under applicable privacy laws by contacting the barangay office or the appropriate data protection officer.
            </p>
          </section>
          <label className='mt-2 flex items-start gap-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/90 sm:text-sm'>
            <input
              type='checkbox'
              checked={privacyAccepted}
              onChange={event => setPrivacyAccepted(event.target.checked)}
              className='privacy-policy-checkbox mt-0.5 h-4 w-4 shrink-0'
            />
            <span>By checking this box, I agree to the Privacy Policy.</span>
          </label>
        </div>
      </Modal>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');
        
        @keyframes logoEntrance { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 10%,90% { transform: translate3d(-1px,0,0); } 20%,80% { transform: translate3d(2px,0,0); } 30%,50%,70% { transform: translate3d(-3px,0,0); } 40%,60% { transform: translate3d(3px,0,0); } }

        .shine-sweep {
          position: relative;
          overflow: hidden;
        }
        .shine-sweep::after {
          content: '';
          position: absolute;
          top: -20%;
          bottom: -20%;
          left: -80%;
          width: 45%;
          background: linear-gradient(
            105deg,
            transparent,
            rgba(165, 211, 255, 0.55),
            transparent
          );
          transform: skewX(-15deg);
          animation: shineSweep var(--shine-duration, 3.2s) ease-in-out var(--shine-delay, 1.2s) infinite;
          pointer-events: none;
          z-index: 2;
        }

        @keyframes shineSweep {
          0% { left: -80%; }
          50%, 100% { left: 140%; }
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          14% { transform: scale(1.06); }
          28% { transform: scale(1); }
          42% { transform: scale(1.06); }
          70% { transform: scale(1); }
        }

        .login-btn {
          position: relative;
          background-image: linear-gradient(135deg, #5f96d3, #3d639d);
          color: #fff;
          box-shadow: 0 4px 14px rgba(95, 150, 211, 0.35);
          transition: box-shadow 0.3s ease, background-image 0.3s ease;
          animation: heartbeat 1.6s ease-in-out infinite, loginBtnEntrance 0.6s ease both;
        }
        .login-btn:hover:not(:disabled) {
          background-image: linear-gradient(135deg, #84b2e2, #4a7abb);
          box-shadow: 0 8px 22px rgba(95, 150, 211, 0.45);
        }
        .login-btn:active:not(:disabled) { transform: scale(0.98); }
        .login-btn:disabled { opacity: 0.7; cursor: not-allowed; animation: none; }
      `}</style>
    </div>
  )
}

export default Login
