// context/AuthContext.jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi } from '../api/authApi';
import {
  ACTIVITY_PERSIST_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  TOKEN_KEY,
  USER_KEY,
  clearLastActivity,
  clearSessionStorage,
  readLastActivity,
  touchLastActivity,
} from '../utils/session';

const AuthContext = createContext(null);

// Events that count as the user being active. Passive listeners keep scrolling smooth.
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const lastActivityRef = useRef(0);
  const lastPersistedRef = useRef(0);

  const logout = useCallback((reason = 'manual') => {
    clearSessionStorage();
    lastActivityRef.current = 0;
    lastPersistedRef.current = 0;
    setUser(null);
    setIsAuthenticated(false);
    setSessionExpired(reason === 'idle' || reason === 'expired');
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        const response = await authApi.verifyToken();
        if (response.data.success) {
          setUser(response.data.data.user);
          setIsAuthenticated(true);
        } else {
          logout();
        }
      }
    } catch (error) {
      // Avoid logging tokens or response payloads; keep a concise diagnostic.
      console.error('Auth check failed:', error?.response?.status || error?.message || 'unknown error');
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    try {
      const cleanEmail = typeof email === 'string' ? email.trim() : email;
      const response = await authApi.login({ email: cleanEmail, password });
      if (response.data.success) {
        const { user: userData, token } = response.data.data;
        const timestamp = Date.now();
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        touchLastActivity(timestamp);
        lastActivityRef.current = timestamp;
        lastPersistedRef.current = timestamp;
        setUser(userData);
        setIsAuthenticated(true);
        setSessionExpired(false);
        return { success: true, data: userData };
      }
      return { success: false, message: 'Login failed' };
    } catch (error) {
      console.error('Login failed:', error?.response?.status || error?.message || 'unknown error');
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed. Please try again.'
      };
    }
  }, []);

  // Automatically end the session after 15 minutes without user activity.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const now = Date.now();
    const storedActivity = readLastActivity();
    const initialActivity = storedActivity > 0 ? storedActivity : now;

    lastActivityRef.current = initialActivity;
    lastPersistedRef.current = initialActivity;
    if (storedActivity === 0) touchLastActivity(initialActivity);

    const isIdle = (timestamp) => Date.now() - timestamp >= IDLE_TIMEOUT_MS;

    // Covers the browser being closed or suspended past the idle limit.
    if (isIdle(initialActivity)) {
      logout('idle');
      return undefined;
    }

    const markActivity = () => {
      const timestamp = Date.now();
      lastActivityRef.current = timestamp;
      // Writing to localStorage on every mousemove is expensive; throttle it.
      if (timestamp - lastPersistedRef.current >= ACTIVITY_PERSIST_INTERVAL_MS) {
        lastPersistedRef.current = timestamp;
        touchLastActivity(timestamp);
      }
    };

    const checkIdle = () => {
      // Another tab may have refreshed the shared activity marker more recently.
      const sharedActivity = readLastActivity();
      if (sharedActivity > lastActivityRef.current) {
        lastActivityRef.current = sharedActivity;
        lastPersistedRef.current = sharedActivity;
      }
      if (isIdle(lastActivityRef.current)) {
        logout('idle');
      }
    };

    const handleVisibilityChange = () => {
      // Background tabs throttle timers; re-check as soon as the tab is visible.
      if (document.visibilityState === 'visible') checkIdle();
    };

    const handleStorage = (event) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        // Signed out in another tab: quietly end this tab's session too.
        lastActivityRef.current = 0;
        lastPersistedRef.current = 0;
        setUser(null);
        setIsAuthenticated(false);
        setSessionExpired(false);
        clearLastActivity();
        return;
      }
      if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
        const timestamp = Number(event.newValue);
        if (Number.isFinite(timestamp) && timestamp > lastActivityRef.current) {
          lastActivityRef.current = timestamp;
          lastPersistedRef.current = timestamp;
        }
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);
    const intervalId = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);

    checkIdle();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity, { capture: true });
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, logout]);

  const role = user?.role || null;
  const isBHWWorker = role === 'BHW Worker';
  const isAdminLike = ['Administrator', 'admin', 'Barangay Administrator', 'BHW Admin'].includes(role);
  const bhwProfile = user?.bhw || null;
  const homePath = isBHWWorker ? '/my-home' : '/dashboard';

  const value = {
    user,
    role,
    isBHWWorker,
    isAdminLike,
    bhwProfile,
    homePath,
    isAuthenticated,
    loading,
    sessionExpired,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
