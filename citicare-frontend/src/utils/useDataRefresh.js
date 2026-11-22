import { useEffect, useRef } from 'react'

const REFRESH_INTERVAL_MS = 30000

export const useDataRefresh = (refresh, enabled = true) => {
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    let refreshing = false
    let lastStartedAt = 0
    const refreshVisiblePage = async () => {
      const now = Date.now()
      if (document.visibilityState !== 'visible' || refreshing || now - lastStartedAt < 1000) return
      lastStartedAt = now
      refreshing = true
      try {
        await refreshRef.current()
      } catch (error) {
        console.error('Background refresh failed:', error)
      } finally {
        refreshing = false
      }
    }

    const timer = window.setInterval(refreshVisiblePage, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshVisiblePage)
    window.addEventListener('focus', refreshVisiblePage)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisiblePage)
      window.removeEventListener('focus', refreshVisiblePage)
    }
  }, [enabled])
}
