// pages/Dashboard.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { navigateWithReturn } from '../utils/navigation'
import {
  Users,
  Heart,
  Calendar,
  CalendarClock,
  AlertTriangle,
  Download,
  Brain,
  ChevronRight
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'
import { dashboardApi } from '../api/dashboardApi'
import { residentApi } from '../api/residentApi'
import { useAuth } from '../context/AuthContext'
import StatCard from '../components/StatCard'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import Modal from '../components/Modal'
import { dialog } from '../context/DialogContext'
import { SkeletonDashboard, SkeletonActivityRows, SkeletonActivityCards, SkeletonAIRecommendation } from '../components/Skeleton'
import PurokRiskMap from '../components/PurokRiskMap'
import GlassSelect from '../components/GlassSelect'
import Pagination from '../components/Pagination'
import { formatTime, formatAge } from '../utils/helpers'
import {
  VULNERABLE_GROUP_META,
  filterVulnerableResidents,
} from '../utils/vulnerableExport'
import {
  downloadGeneralXlsx,
  downloadVulnerableXlsx,
} from '../utils/healthReportExport'
import { downloadInfantsXlsx } from '../utils/infantsReport'
import { downloadSeniorsXlsx } from '../utils/seniorsReport'
import {
  downloadMaternalXlsx,
} from '../utils/maternalReport'

const MOBILE_SAMPLE_ACTIVITIES = [
  {
    id: 'sample-activity-1',
    residentName: 'Maria Santos',
    date: '2026-10-14',
    time: '08:00',
    serviceType: 'Blood pressure check',
    location: 'Purok 1',
    assignedBhw: 'Sample BHW'
  },
  {
    id: 'sample-activity-2',
    residentName: 'Juan Dela Cruz',
    date: '2026-10-15',
    time: '10:30',
    serviceType: 'Health consultation',
    location: 'Purok 2',
    assignedBhw: 'Sample BHW'
  },
  {
    id: 'sample-activity-3',
    residentName: 'Ana Reyes',
    date: '2026-10-16',
    time: '13:00',
    serviceType: 'Medicine follow-up',
    location: 'Purok 3',
    assignedBhw: 'Sample BHW'
  }
]

// Subtle priority-tinted cards, matching the export-modal buttons
// (bg-*/10 + border-*/30) instead of thick solid borders.
const getAIPriorityCard = level => {
  const key = typeof level === 'string' ? level : 'Low'
  return {
    high: 'border-red-400/25 bg-red-500/[0.04]',
    immediate: 'border-red-400/25 bg-red-500/[0.04]',
    Critical: 'border-red-400/25 bg-red-500/[0.04]',
    medium: 'border-orange-400/25 bg-orange-500/[0.04]',
    priority: 'border-orange-400/25 bg-orange-500/[0.04]',
    High: 'border-orange-400/25 bg-orange-500/[0.04]',
    Moderate: 'border-yellow-400/25 bg-yellow-500/[0.04]',
    low: 'border-emerald-400/25 bg-emerald-500/[0.04]',
    routine: 'border-emerald-400/25 bg-emerald-500/[0.04]',
    Low: 'border-emerald-400/25 bg-emerald-500/[0.04]'
  }[key] || 'border-white/10 bg-white/[0.04]'
}

const RiskDistributionTooltip = ({ active, payload }) => {
  const item = payload?.[0]?.payload
  if (!active || !item) return null

  return (
    <div className='max-w-[190px] rounded-xl border border-white/20 bg-[#0f1535]/95 px-3 py-2 text-sm text-white shadow-lg'>
      <div className='flex items-center gap-2 font-medium'>
        <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ backgroundColor: item.color }} />
        <span>{item.name} risk</span>
      </div>
      <p className='mt-1 pl-[18px] text-white/90'>Count: {Number(item.value || 0).toLocaleString()}</p>
    </div>
  )
}

const Dashboard = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isBHWWorker, user, isAdminLike } = useAuth()
  // Same shared dashboard serves the BHW home page — cross-page links must
  // land on the BHW routes for workers (admin routes bounce them back).
  const schedulesPath = isBHWWorker ? '/my-schedules' : '/schedules'
  const residentsPath = isBHWWorker ? '/my-residents' : '/residents'
  // BHW dashboard: residents in the worker's handled focus/vulnerable group
  // get a bubble with the group label (e.g. "Pregnant").
  const bhwFocusGroup = user?.bhw?.assignedFocusGroup || null
  const bhwFocusLabel = bhwFocusGroup ? (VULNERABLE_GROUP_META[bhwFocusGroup]?.label || bhwFocusGroup) : null
  const showsHandledGroupBubble = (r) => isBHWWorker && !!bhwFocusGroup &&
    (r.focusGroups || []).some(g => String(g).toLowerCase() === String(bhwFocusGroup).toLowerCase())
  const [stats, setStats] = useState(null)
  const [riskDistribution, setRiskDistribution] = useState([])
  const [purokRiskData, setPurokRiskData] = useState([])
  const [commonDiseases, setCommonDiseases] = useState({
    overall: [],
    byPurok: {}
  })
  const [monthlyTrends, setMonthlyTrends] = useState([])
  const [todayActivities, setTodayActivities] = useState([])
  const [upcomingActivities, setUpcomingActivities] = useState([])
  const [activityView, setActivityView] = useState('today')
  const [upcomingLoading, setUpcomingLoading] = useState(false)
  const [activitiesPage, setActivitiesPage] = useState(1)
  const activitiesPerPage = 6
  const [criticalPage, setCriticalPage] = useState(1)
  const [highRiskPage, setHighRiskPage] = useState(1)
  const riskResidentsPerPage = 5
  const [purokView, setPurokView] = useState('map')
  const [priorityPage, setPriorityPage] = useState(1)
  const priorityPerPage = 5
  const [missedConsultations, setMissedConsultations] = useState([])
  const [missedPage, setMissedPage] = useState(1)
  const missedPerPage = 5
  const [conditionsPage, setConditionsPage] = useState(1)
  const conditionsPerPage = 6
  const [aiFindingsPage, setAiFindingsPage] = useState(1)
  const [aiRisksPage, setAiRisksPage] = useState(1)
  const [aiActionsPage, setAiActionsPage] = useState(1)
  const [aiPriorityPage, setAiPriorityPage] = useState(1)
  const [aiPurokRankPage, setAiPurokRankPage] = useState(1)
  const [aiProgramsPage, setAiProgramsPage] = useState(1)
  const aiListPerPage = 3
  const [aiRecommendation, setAiRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPeriod, setAiPeriod] = useState('monthly')
  const [selectedPurokForDiseases, setSelectedPurokForDiseases] =
    useState('all')
  const [exportLoading, setExportLoading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  // Reports are monthly — the period always follows the current month.
  const exportMonth = new Date().getMonth()
  const exportYear = new Date().getFullYear()
  const [reportType, setReportType] = useState('general')
  const [vulnerableGroup, setVulnerableGroup] = useState('pregnant')
  // Maternal reports: Admin + the BHW assigned to pregnant only. These sit
  // below the export-type states on purpose (maternalContext reads them).
  const canViewPrenatal = isAdminLike ||
    (isBHWWorker && String(bhwFocusGroup || '').trim().toLowerCase() === 'pregnant')
  // Maternal export covers the pregnant group: one workbook with prenatal +
  // postpartum tabs. Shown instead of the Maternal Report select.
  const maternalContext = canViewPrenatal && (isBHWWorker
    ? String(bhwFocusGroup || '').trim().toLowerCase() === 'pregnant'
    : (reportType === 'vulnerable' && vulnerableGroup === 'pregnant'))

  const leftColRef = useRef(null)
  const rightColRef = useRef(null)
  const statScrollRef = useRef(null)
  const statScrollIndicatorRef = useRef(null)
  const [stickySide, setStickySide] = useState('right')
  const [stickyTop, setStickyTop] = useState(0)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Realtime Missed Health Consultations + Today's activities: silent
  // refresh every 30s and whenever the tab regains focus, so a checkup
  // completed elsewhere shows up without a manual reload.
  useEffect(() => {
    let cancelled = false
    const refreshLive = async () => {
      try {
        const [missedRes, activitiesRes] = await Promise.all([
          dashboardApi.getMissedConsultations(),
          dashboardApi.getTodayActivities()
        ])
        if (cancelled) return
        if (missedRes.data?.success) setMissedConsultations(missedRes.data.data || [])
        if (activitiesRes.data?.success) setTodayActivities(activitiesRes.data.data || [])
      } catch (e) {
        // Silent: keep last good data on background refresh.
      }
    }
    const onFocus = () => refreshLive()
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshLive() }
    const timer = setInterval(refreshLive, 30000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    const measure = () => {
      const left = leftColRef.current
      const right = rightColRef.current
      if (!left || !right) return
      const diff = left.offsetHeight - right.offsetHeight
      if (diff > 40) setStickySide('right')
      else if (diff < -40) setStickySide('left')

      const scrollport = left.closest('main')
      const viewportH = scrollport
        ? scrollport.clientHeight
        : window.innerHeight
      const shortColHeight = Math.min(left.offsetHeight, right.offsetHeight)
      setStickyTop(viewportH - shortColHeight - 48)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (leftColRef.current) ro.observe(leftColRef.current)
    if (rightColRef.current) ro.observe(rightColRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [loading])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [
        statsRes,
        riskRes,
        purokRiskRes,
        diseasesRes,
        trendsRes,
        activitiesRes,
        missedRes
      ] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRiskDistribution(),
        dashboardApi.getRiskDistributionByPurok(),
        dashboardApi.getCommonDiseases(),
        dashboardApi.getMonthlyTrends(),
        dashboardApi.getTodayActivities(),
        dashboardApi.getMissedConsultations()
      ])
      if (statsRes.data.success) setStats(statsRes.data.data)
      if (riskRes.data.success) {
        const d = riskRes.data.data
        setRiskDistribution([
          { name: 'Critical', value: d.critical || 0, color: '#ef4444' },
          { name: 'High', value: d.high || 0, color: '#f97316' },
          { name: 'Moderate', value: d.moderate || 0, color: '#f59e0b' },
          { name: 'Low', value: d.low || 0, color: '#10b981' }
        ])
      }
      if (purokRiskRes.data.success) setPurokRiskData(purokRiskRes.data.data)
      if (diseasesRes.data.success) setCommonDiseases(diseasesRes.data.data)
      if (trendsRes.data.success) setMonthlyTrends(trendsRes.data.data)
      if (activitiesRes.data.success)
        setTodayActivities(activitiesRes.data.data)
      if (missedRes.data.success) setMissedConsultations(missedRes.data.data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUpcomingActivities = async () => {
    try {
      setUpcomingLoading(true)
      const response = await dashboardApi.getUpcomingActivities()
      if (response.data.success) setUpcomingActivities(response.data.data)
    } catch (error) {
      console.error('Error fetching upcoming activities:', error)
    } finally {
      setUpcomingLoading(false)
    }
  }

  const handleActivityViewChange = view => {
    setActivityView(view)
    setActivitiesPage(1)
    if (view === 'upcoming' && upcomingActivities.length === 0) {
      fetchUpcomingActivities()
    }
  }

  useEffect(() => {
    setAiFindingsPage(1)
    setAiRisksPage(1)
    setAiActionsPage(1)
    setAiPriorityPage(1)
    setAiPurokRankPage(1)
    setAiProgramsPage(1)
  }, [aiRecommendation])

  useEffect(() => {
    if (isBHWWorker && showExportModal) {
      setReportType('vulnerable')
      if (user?.bhw?.assignedFocusGroup) setVulnerableGroup(user.bhw.assignedFocusGroup)
    }
  }, [showExportModal, isBHWWorker, user?.bhw?.assignedFocusGroup])

  const paginateAiList = (list, page) => {
    const arr = list || []
    const total = Math.max(1, Math.ceil(arr.length / aiListPerPage))
    const safe = Math.min(Math.max(1, page), total)
    return {
      items: arr.slice((safe - 1) * aiListPerPage, safe * aiListPerPage),
      totalPages: total,
      safePage: safe,
      total: arr.length
    }
  }

  const activities = activityView === 'today' ? todayActivities : upcomingActivities
  const totalActivityPages = Math.max(1, Math.ceil(activities.length / activitiesPerPage))
  const paginatedActivities = activities.slice(
    (activitiesPage - 1) * activitiesPerPage,
    activitiesPage * activitiesPerPage
  )
  const mobileActivities = paginatedActivities.length > 0
    ? paginatedActivities
    : isBHWWorker ? MOBILE_SAMPLE_ACTIVITIES : []
  const criticalResidents = stats?.criticalResidents || []
  const totalCriticalPages = Math.max(1, Math.ceil(criticalResidents.length / riskResidentsPerPage))
  const paginatedCriticalResidents = criticalResidents.slice(
    (criticalPage - 1) * riskResidentsPerPage,
    criticalPage * riskResidentsPerPage
  )
  const highRiskResidents = stats?.highRiskResidents || []
  const totalHighRiskPages = Math.max(1, Math.ceil(highRiskResidents.length / riskResidentsPerPage))
  const paginatedHighRiskResidents = highRiskResidents.slice(
    (highRiskPage - 1) * riskResidentsPerPage,
    highRiskPage * riskResidentsPerPage
  )
  const totalMissedPages = Math.max(1, Math.ceil(missedConsultations.length / missedPerPage))
  const paginatedMissedConsultations = missedConsultations.slice(
    (missedPage - 1) * missedPerPage,
    missedPage * missedPerPage
  )
  const sortedPriorityPuroks = [...purokRiskData].sort((a, b) => {
    const order = { Critical: 4, High: 3, Moderate: 2, Low: 1 }
    return (order[b.riskLevel] ?? 0) - (order[a.riskLevel] ?? 0) ||
      (b.critical ?? 0) - (a.critical ?? 0) ||
      (b.high ?? 0) - (a.high ?? 0) ||
      (b.totalResidents ?? 0) - (a.totalResidents ?? 0)
  })
  const totalPriorityPages = Math.max(
    1,
    Math.ceil(sortedPriorityPuroks.length / priorityPerPage)
  )
  const safePriorityPage = Math.min(Math.max(1, priorityPage), totalPriorityPages)
  const paginatedPriorityPuroks = sortedPriorityPuroks.slice(
    (safePriorityPage - 1) * priorityPerPage,
    safePriorityPage * priorityPerPage
  )

  const getPurokRiskBadge = risk => {
    switch (risk) {
      case 'Critical':
        return 'bg-red-500/20 text-red-300 border border-red-400/30'
      case 'High':
        return 'bg-orange-500/20 text-orange-300 border border-orange-400/30'
      case 'Moderate':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
      default:
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
    }
  }

  const getPurokScoreColor = score => {
    if (score >= 75) return '#ef4444'
    if (score >= 50) return '#f97316'
    if (score >= 25) return '#eab308'
    return '#10b981'
  }

  const fetchAIRecommendation = async period => {
    try {
      setAiLoading(true)
      const response = await dashboardApi.getAIRecommendation(period)
      if (response.data.success) setAiRecommendation(response.data.data)
    } catch (error) {
      console.error('AI Error:', error)
    } finally {
      setAiLoading(false)
    }
  }

  const handleExportReport = async () => {
    try {
      setExportLoading(true)
      const response = await dashboardApi.getGeneralHealthReport()
      if (!response.data?.success) {
        dialog.error(response.data?.message || 'Failed to export general health report.', 'Export failed')
        return
      }
      const residents = response.data.data?.residents || []
      if (!residents.length) {
        dialog.info('No residents with chronic conditions found for the general health report.', 'Nothing to export')
        return
      }
      downloadGeneralXlsx({
        residents,
        exportedBy: user?.bhw?.name || user?.name || '',
      })
      setShowExportModal(false)
      dialog.toast('General health report downloaded.', 'success')
    } catch (error) {
      console.error('Error:', error)
      dialog.error('Failed to export the general health report. Please try again.', 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const handleExportVulnerable = async () => {
    try {
      setExportLoading(true)
      // Infants (0-59 months) export with the vaccination template.
      const effectiveGroup = isBHWWorker
        ? String(user?.bhw?.assignedFocusGroup || '').trim().toLowerCase()
        : vulnerableGroup
      if (effectiveGroup === 'infant') {
        const response = await dashboardApi.getInfantsVaccinationReport()
        if (!response.data?.success) {
          dialog.error(response.data?.message || 'Failed to export infants report.', 'Export failed')
          return
        }
        const infants = response.data.data?.residents || []
        if (!infants.length) {
          dialog.info('No infants found for the vaccination report.', 'Nothing to export')
          return
        }
        downloadInfantsXlsx(infants, { exportedBy: user?.bhw?.name || user?.name || '' })
        setShowExportModal(false)
        dialog.toast('Infant vaccination report downloaded.', 'success')
        return
      }
      if (effectiveGroup === 'senior') {
        const response = await dashboardApi.getSeniorCitizensReport()
        if (!response.data?.success) {
          dialog.error(response.data?.message || 'Failed to export seniors report.', 'Export failed')
          return
        }
        const seniors = response.data.data?.residents || []
        if (!seniors.length) {
          dialog.info('No senior citizens found for the report.', 'Nothing to export')
          return
        }
        downloadSeniorsXlsx(seniors, { exportedBy: user?.bhw?.name || user?.name || '' })
        setShowExportModal(false)
        dialog.toast('Senior citizen report downloaded.', 'success')
        return
      }
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ]
      const periodLabel = `${months[exportMonth]} ${exportYear}`
      let residents = []
      let summary = null
      try {
        const response = await dashboardApi.getVulnerableGroupsReport(vulnerableGroup)
        if (response.data?.success) {
          const payload = response.data.data
          summary = payload.summary || null
          if (payload.group === 'all') {
            const g = payload.groups || {}
            const byId = new Map()
            ;['pregnant', 'senior', 'infant'].forEach(k => {
              ;(g[k] || []).forEach(r => {
                if (!byId.has(r.id)) byId.set(r.id, r)
                else {
                  const prev = byId.get(r.id)
                  byId.set(r.id, { ...prev, vulnerableGroups: [...new Set([...(prev.vulnerableGroups || []), ...(r.vulnerableGroups || [k])])] })
                }
              })
            })
            residents = [...byId.values()]
          } else {
            residents = payload.residents || []
          }
        }
      } catch (apiError) {
        console.warn('Vulnerable-groups API unavailable, falling back to client filter:', apiError?.message)
      }
      // Fallback: filter client-side from full resident list
      if (!residents.length && !summary) {
        const res = await residentApi.getAll()
        const all = res.data?.success ? res.data.data : []
        residents = filterVulnerableResidents(all, vulnerableGroup)
        const countBy = (g) => filterVulnerableResidents(all, g).length
        summary = {
          totalResidents: all.length,
          totalVulnerable: filterVulnerableResidents(all, 'all').length || residents.length,
          pregnant: countBy('pregnant'),
          senior: countBy('senior'),
          infant: countBy('infant')
        }
        if (vulnerableGroup === 'all' && !summary.totalVulnerable) summary.totalVulnerable = residents.length
      }
      downloadVulnerableXlsx({
        group: vulnerableGroup,
        residents,
        summary,
        periodLabel,
        exportedBy: user?.bhw?.name || user?.name || '',
      })
      setShowExportModal(false)
      dialog.toast('Vulnerable groups report downloaded.', 'success')
    } catch (error) {
      console.error('Vulnerable export error:', error)
      dialog.error('Failed to export vulnerable groups report.', 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  // Maternal report (one Excel file, prenatal + postpartum tabs) — Admin and
  // the BHW assigned to pregnant only. The backend enforces the same
  // rule (403) on both endpoints.
  const handleExportMaternal = async () => {
    try {
      setExportLoading(true)
      const meta = { exportedBy: user?.bhw?.name || user?.name || '' }
      const [preRes, postRes] = await Promise.all([
        dashboardApi.getPrenatalReport(),
        dashboardApi.getPostpartumReport(),
      ])
      if (!preRes.data?.success) {
        dialog.error(preRes.data?.message || 'Failed to export prenatal report.', 'Export failed')
        return
      }
      if (!postRes.data?.success) {
        dialog.error(postRes.data?.message || 'Failed to export postpartum report.', 'Export failed')
        return
      }
      const prenatal = preRes.data.data?.residents || []
      const postpartum = postRes.data.data?.residents || []
      if (!prenatal.length && !postpartum.length) {
        dialog.info('No pregnancies or delivered mothers found for the maternal report.', 'Nothing to export')
        return
      }
      downloadMaternalXlsx(prenatal, postpartum, meta)
      setShowExportModal(false)
      dialog.toast('Maternal report downloaded.', 'success')
    } catch (error) {
      console.error('Maternal export error:', error)
      if (error.response?.status === 403) {
        dialog.error('The maternal report is only available to the BHW handling pregnant residents.', 'Access denied')
      } else {
        dialog.error('Failed to export maternal report.', 'Export failed')
      }
    } finally {
      setExportLoading(false)
    }
  }

  if (loading) return <SkeletonDashboard isBHWWorker={isBHWWorker} />

  const DISEASE_COLORS = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#10b981',
    '#5f96d3',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4'
  ]
  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='pl-1 flex flex-col sm:flex-row sm:items-center sm:gap-2'>
          <h1 className='text-2xl font-bold text-white'>Dashboard</h1>
          <p className='text-sm text-white/75'>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
        {(isAdminLike || !isBHWWorker || user?.bhw?.assignedFocusGroup) && (
        <GlassButton size='lg' className='ml-auto' icon={Download} title='Export Report' onClick={() => setShowExportModal(true)}>
          <span className='hidden sm:inline'>Export Report</span>
        </GlassButton>
        )}
      </div>

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title='Export Health Report'
        size='xs'
      >
        <div className='space-y-5'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium uppercase tracking-wider text-white/75'>Report Type</label>
            {isBHWWorker ? (
              <div className='glass-input flex items-center gap-2 text-sm'>
                <span className='text-white/85'>Vulnerable Groups Report</span>
              </div>
            ) : (
            <GlassSelect
              value={reportType}
              allowCustom
              onChange={setReportType}
              paginate={false}
              options={[
                { value: 'general', label: 'General Health Report' },
                { value: 'vulnerable', label: 'Vulnerable Groups Report' }
              ]}
            />
            )}
          </div>

          {(isBHWWorker || reportType === 'vulnerable') && (
            <div className='space-y-1.5'>
              <label className='text-xs font-medium uppercase tracking-wider text-white/75'>Vulnerable Group</label>
              {isBHWWorker ? (
                <div className='glass-input flex items-center gap-2 text-sm'>
                  <span className='text-white/85'>{VULNERABLE_GROUP_META[user?.bhw?.assignedFocusGroup]?.label || user?.bhw?.assignedFocusGroup}</span>
                </div>
              ) : (
              <GlassSelect
                value={vulnerableGroup}
                allowCustom
                onChange={v => setVulnerableGroup(v === '' ? 'all' : v)}
                paginate={false}
                options={[
                  { value: 'pregnant', label: VULNERABLE_GROUP_META.pregnant.label },
                  { value: 'infant', label: VULNERABLE_GROUP_META.infant.label },
                  { value: 'senior', label: VULNERABLE_GROUP_META.senior.label }
                ]}
              />
              )}
            </div>
          )}

          <div className='pt-1'>
            <GlassButton
              size='lg'
              icon={Download}
              loading={exportLoading}
              className='w-full'
              onClick={() => {
                if (maternalContext) handleExportMaternal()
                else if (reportType === 'vulnerable' || isBHWWorker) handleExportVulnerable()
                else handleExportReport()
              }}
            >
              Export Excel
            </GlassButton>
          </div>
        </div>
      </Modal>

      <div className='relative min-w-0'>
        <div
          ref={statScrollRef}
          onScroll={event => {
            const element = event.currentTarget
            const maxScroll = element.scrollWidth - element.clientWidth
            const progress = maxScroll > 0 ? element.scrollLeft / maxScroll : 0
            if (statScrollIndicatorRef.current) {
              statScrollIndicatorRef.current.style.left = `${progress * 72}%`
            }
          }}
          className='dashboard-stat-scroll flex lg:grid lg:grid-cols-4 gap-4 overflow-x-scroll pb-3 lg:overflow-visible lg:pb-0'
        >
        <StatCard
          label='Total Residents'
          value={stats?.totalResidents || 0}
          icon={Users}
          color='blue'
        />
        {isBHWWorker ? (
          <>
            <StatCard
              label="Today's Schedules"
              value={stats?.todaySchedules || 0}
              icon={Calendar}
              color='green'
            />
            <StatCard
              label='Upcoming Schedules'
              value={stats?.upcomingSchedules || 0}
              icon={CalendarClock}
              color='purple'
            />
          </>
        ) : (
          <>
            <StatCard
              label='Active BHWs'
              value={stats?.activeBHW || 0}
              icon={Heart}
              color='green'
            />
            <StatCard
              label="Today's Schedules"
              value={stats?.todaySchedules || 0}
              icon={Calendar}
              color='purple'
            />
          </>
        )}
        <StatCard
          label='At-Risk Residents'
          value={(stats?.criticalCount || 0) + (stats?.highCount || 0)}
          icon={AlertTriangle}
          color='red'
        />
        </div>
        <div className='dashboard-stat-scroll-indicator lg:hidden' aria-hidden='true'>
          <span ref={statScrollIndicatorRef} />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-5 sm:gap-6'>
       <GlassCard hover={false}>
          <div className='flex items-center justify-between mb-2.5 gap-2 sm:gap-3 flex-nowrap'>
           <h2 className='text-base sm:text-lg font-semibold text-white whitespace-nowrap'>
            {activityView === 'today' ? "Today's Activities" : 'Upcoming Activities'}
          </h2>
          <div className='flex rounded-lg border border-white/15 overflow-hidden'>
            <button
              onClick={() => handleActivityViewChange('today')}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                activityView === 'today'
                  ? 'bg-blue-500/30 text-white'
                  : 'text-white/65 hover:bg-white/10'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleActivityViewChange('upcoming')}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                activityView === 'upcoming'
                  ? 'bg-blue-500/30 text-white'
                  : 'text-white/65 hover:bg-white/10'
              }`}
            >
              Upcoming
            </button>
          </div>
        </div>
        {(isBHWWorker || isAdminLike) && (
          <div className='lg:hidden space-y-2'>
            {activityView === 'upcoming' && upcomingLoading ? (
              <SkeletonActivityCards count={3} />
            ) : mobileActivities.length > 0 ? (
              mobileActivities.map(a => (
                <button
                  key={a.id}
                  type='button'
                  onClick={String(a.id ?? '').startsWith('sample-') ? undefined : () => navigateWithReturn(navigate, location, schedulesPath, { viewScheduleId: a.id })}
                  className='w-full text-left rounded-xl border border-white/10 bg-white/[0.04] p-3.5 hover:bg-white/[0.07] transition-colors'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <span className='text-sm font-semibold text-white truncate'>
                      {a.residentName || a.programName || 'Scheduled activity'}
                    </span>
                    <span className='shrink-0 text-xs text-white/60'>
                      {activityView === 'upcoming'
                        ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'Today'}
                    </span>
                  </div>
                  <div className='mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/70'>
                    <span>{formatTime(a.time)}</span>
                    <span className='truncate'>{a.serviceType}</span>
                    <span className='truncate'>{a.location || 'N/A'}</span>
                    <span className='truncate'>{a.assignedBhw}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className='py-8 text-center text-sm text-white/65'>
                {activityView === 'today'
                  ? 'No activities scheduled for today'
                  : 'No upcoming activities scheduled'}
              </p>
            )}
          </div>
        )}
        <div className={isBHWWorker || isAdminLike ? 'hidden lg:block' : 'overflow-x-auto'}>
          <table className='glass-table min-w-[680px]'>
            <thead>
              <tr>
                {activityView === 'upcoming' && <th>Date</th>}
                <th>Resident / Program</th>
                <th>Time</th>
                <th>Type</th>
                <th>Location</th>
                <th>Assigned BHW</th>
              </tr>
            </thead>
            <tbody>
              {activityView === 'today' ? (
                paginatedActivities.length > 0 ? (
                  paginatedActivities.map(a => (
                    <tr key={a.id} onClick={() => navigateWithReturn(navigate, location, schedulesPath, { viewScheduleId: a.id })} className='cursor-pointer hover:bg-white/5 transition-colors'>
                      <td className='text-white font-medium'>{a.residentName}</td>
                      <td className='text-white/85'>{formatTime(a.time)}</td>
                      <td className='text-white/85'>{a.serviceType}</td>
                      <td className='text-white/85'>{a.location || 'N/A'}</td>
                      <td className='text-white/85'>{a.assignedBhw}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className='py-8 text-center text-white/65'>
                      No activities scheduled for today
                    </td>
                  </tr>
                )
              ) : upcomingLoading ? (
                <SkeletonActivityRows columns={6} rows={4} />
              ) : paginatedActivities.length > 0 ? (
                paginatedActivities.map(a => (
                  <tr key={a.id} onClick={() => navigateWithReturn(navigate, location, schedulesPath, { viewScheduleId: a.id })} className='cursor-pointer hover:bg-white/5 transition-colors'>
                    <td className='text-white/85'>
                      {new Date(a.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className='text-white font-medium'>{a.residentName}</td>
                    <td className='text-white/85'>{formatTime(a.time)}</td>
                    <td className='text-white/85'>{a.serviceType}</td>
                    <td className='text-white/85'>{a.location || 'N/A'}</td>
                    <td className='text-white/85'>{a.assignedBhw}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className='py-8 text-center text-white/65'>
                    No upcoming activities scheduled
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={activitiesPage}
          totalPages={totalActivityPages}
          onPageChange={setActivitiesPage}
          total={activities.length}
          perPage={activitiesPerPage}
        />
      </GlassCard>
      </div>

      {(isBHWWorker || isAdminLike) && (
        <div className='lg:hidden flex gap-4 overflow-x-auto snap-x snap-mandatory'>
          <GlassCard hover={false} className='min-w-[88%] snap-start'>
            <h2 className='text-base font-semibold text-white'>Monthly Risk Trends</h2>
            <div className='h-64 mt-2'>
              <ResponsiveContainer>
                <LineChart data={monthlyTrends}>
                  <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.1)' />
                  <XAxis dataKey='month' stroke='rgba(255,255,255,0.8)' fontSize={11} />
                  <YAxis stroke='rgba(255,255,255,0.8)' fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,21,53,0.95)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '12px',
                      color: 'white'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px' }} />
                  <Line type='monotone' dataKey='criticalHealthRisk' stroke='#ef4444' strokeWidth={2} dot={false} name='Critical' />
                  <Line type='monotone' dataKey='highHealthRisk' stroke='#f97316' strokeWidth={2} dot={false} name='High' />
                  <Line type='monotone' dataKey='moderateHealthRisk' stroke='#f59e0b' strokeWidth={2} dot={false} name='Moderate' />
                  <Line type='monotone' dataKey='lowHealthRisk' stroke='#10b981' strokeWidth={2} dot={false} name='Low' />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
          <GlassCard hover={false} className='min-w-[88%] snap-start'>
            <h2 className='text-base font-semibold text-white mb-3'>Overall Risk Distribution</h2>
            <div className='h-60 dashboard-risk-distribution-chart'>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={riskDistribution} cx='50%' cy='50%' innerRadius={45} outerRadius={78} paddingAngle={5} dataKey='value'>
                    {riskDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<RiskDistributionTooltip />} />
                  <Legend
                    iconType='circle'
                    layout='horizontal'
                    wrapperStyle={{
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: '10px',
                      width: '100%',
                      left: 0
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start'>
        <div
          ref={leftColRef}
          className={`lg:col-span-2 space-y-4 sm:space-y-6 max-lg:contents max-lg:!space-y-0 ${
            stickySide === 'left' ? 'lg:sticky' : ''
          }`}
          style={stickySide === 'left' ? { top: `${stickyTop}px` } : undefined}
        >
      {!isBHWWorker && (
       <GlassCard hover={false}>
          <div className='flex items-center justify-between mb-4 gap-2 sm:gap-3 flex-nowrap'>
            <h2 className='text-base sm:text-lg font-semibold text-white whitespace-nowrap'>
              {purokView === 'map' ? 'Purok Risk Map' : 'Priority Puroks'}
            </h2>
            <div className='flex rounded-lg border border-white/15 overflow-hidden'>
              <button
                onClick={() => setPurokView('map')}
                className={`px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                  purokView === 'map'
                    ? 'bg-blue-500/30 text-white'
                    : 'text-white/65 hover:bg-white/10'
                }`}
              >
                <span className='sm:hidden'>Map</span>
                <span className='hidden sm:inline'>Risk Map</span>
              </button>
              <button
                onClick={() => {
                  setPurokView('priority')
                  setPriorityPage(1)
                }}
                className={`px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                  purokView === 'priority'
                    ? 'bg-blue-500/30 text-white'
                    : 'text-white/65 hover:bg-white/10'
                }`}
              >
                <span className='sm:hidden'>Priority Puroks</span>
                <span className='hidden sm:inline'>Priority Puroks</span>
              </button>
            </div>
          </div>
          {purokView === 'map' ? (
            <PurokRiskMap
              editable={false}
              showDetails
              puroks={purokRiskData}
              onSaved={(id, lat, lng) =>
                setPurokRiskData(prev =>
                  prev.map(p =>
                    String(p.purokId) === String(id) ? { ...p, latitude: lat, longitude: lng } : p
                  )
                )
              }
            />
          ) : (
            <div>
              {paginatedPriorityPuroks.length > 0 ? (
                <div className='space-y-2.5'>
                  {paginatedPriorityPuroks.map(p => {
                    return (
                      <div
                        key={p.purokId}
                        onClick={() => navigateWithReturn(navigate, location, '/purok', { viewPurokId: p.purokId })}
                        className='bg-white/[0.04] border border-white/10 rounded-xl p-3.5 hover:bg-white/[0.07] transition-colors cursor-pointer'
                      >
                        <div className='flex items-center gap-3'>
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center justify-between gap-2 flex-wrap'>
                              <p className='text-white text-base sm:text-lg font-bold truncate'>
                                {p.purokName}
                                <span className='ml-2 text-xs font-normal text-white/65'>
                                  {p.totalResidents || 0} resident{(p.totalResidents ?? 0) !== 1 ? 's' : ''}
                                </span>
                              </p>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${getPurokRiskBadge(
                                  p.riskLevel
                                )}`}
                              >
                                {p.riskLevel || 'Low'}
                              </span>
                            </div>
                            <div className='flex flex-wrap items-center gap-1.5 mt-1.5'>
                              <span aria-label={`${p.critical || 0} critical`} className='inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-1'>
                                <span className='w-2 h-2 rounded-full bg-red-400' />
                                {p.critical || 0}
                              </span>
                              <span aria-label={`${p.high || 0} high`} className='inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-1'>
                                <span className='w-2 h-2 rounded-full bg-orange-400' />
                                {p.high || 0}
                              </span>
                              <span aria-label={`${p.moderate || 0} moderate`} className='inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-1'>
                                <span className='w-2 h-2 rounded-full bg-yellow-400' />
                                {p.moderate || 0}
                              </span>
                              <span aria-label={`${p.low || 0} low`} className='inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-1'>
                                <span className='w-2 h-2 rounded-full bg-emerald-400' />
                                {p.low || 0}
                              </span>
                              <ChevronRight className='w-4 h-4 text-white/40 shrink-0 ml-auto' />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className='text-white/50 text-sm text-center py-8'>
                  No purok data available
                </p>
              )}
              <Pagination
                page={safePriorityPage}
                totalPages={totalPriorityPages}
                onPageChange={setPriorityPage}
                total={sortedPriorityPuroks.length}
                perPage={priorityPerPage}
                className='dashboard-priority-pagination'
              />
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard hover={false} className={isBHWWorker || isAdminLike ? 'hidden lg:block' : ''}>
        <h2 className='text-base sm:text-lg font-semibold text-white'>
          Monthly Risk Trends
        </h2>
        <div className='dashboard-risk-chart h-72'>
          <ResponsiveContainer>
            <LineChart data={monthlyTrends}>
              <CartesianGrid
                strokeDasharray='3 3'
                stroke='rgba(255,255,255,0.1)'
              />
              <XAxis
                dataKey='month'
                stroke='rgba(255,255,255,0.8)'
                fontSize={12}
              />
              <YAxis stroke='rgba(255,255,255,0.8)' fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,21,53,0.95)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  color: 'white'
                }}
              />
              <Legend
                wrapperStyle={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: '12px'
                }}
              />
              <Line
                type='monotone'
                dataKey='criticalHealthRisk'
                stroke='#ef4444'
                strokeWidth={2}
                dot={false}
                name='Critical'
              />
              <Line
                type='monotone'
                dataKey='highHealthRisk'
                stroke='#f97316'
                strokeWidth={2}
                dot={false}
                name='High'
              />
              <Line
                type='monotone'
                dataKey='moderateHealthRisk'
                stroke='#f59e0b'
                strokeWidth={2}
                dot={false}
                name='Moderate'
              />

              <Line
                type='monotone'
                dataKey='lowHealthRisk'
                stroke='#10b981'
                strokeWidth={2}
                dot={false}
                name='Low'
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard hover={false} className='min-w-0 max-lg:order-last'>
        <div className='flex flex-wrap items-center justify-between gap-3 mb-1'>
          <div>
            <h2 className='text-base sm:text-lg font-semibold text-white'>
              AI Health Recommendations
            </h2>
          </div>
          <div className='flex items-center gap-2 w-full sm:w-auto'>
            <div className='flex w-full sm:w-auto bg-white/10 rounded-lg p-0.5 border border-white/20'>
              {['monthly', 'quarterly', 'annual'].map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setAiPeriod(p)
                    fetchAIRecommendation(p)
                  }}
                  className={`flex-1 sm:flex-none px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm transition-all ${
                    aiPeriod === p
                      ? 'bg-blue-500/30 text-blue-100 font-medium'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {aiLoading ? (
          <SkeletonAIRecommendation isBHWWorker={isBHWWorker} />
        ) : aiRecommendation ? (
          <div className='space-y-8 mt-6 break-words'>
            <div className='grid grid-cols-1 gap-5'>
              <div className='min-w-0 border-y border-white/10 py-6'>
                <h3 className='text-base font-semibold text-white mb-2'>
                  Key Findings
                </h3>
                {!aiRecommendation.keyFindings?.length && <p className='text-sm text-white/75'>No findings available for this report.</p>}
                {(() => {
                  const p = paginateAiList(aiRecommendation.keyFindings, aiFindingsPage)
                  return (
                    <>
                    <div className='space-y-3'>
                      {p.items.map((f, i) => (
                        <div
                          key={(p.safePage - 1) * aiListPerPage + i}
                          className='p-4 sm:p-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04]'
                        >
                          <span className='text-blue-200 shrink-0 font-semibold text-sm'>
                            {(p.safePage - 1) * aiListPerPage + i + 1}.
                          </span>
                          <p className='text-white text-sm leading-relaxed'>{f}</p>
                        </div>
                      ))}
                    </div>
                    <Pagination
                      page={p.safePage}
                      totalPages={p.totalPages}
                      onPageChange={setAiFindingsPage}
                      total={p.total}
                      perPage={aiListPerPage}
                    />
                    </>
                  )
                })()}
              </div>
              {!isBHWWorker && (
              <div className='min-w-0 border-y border-white/10 py-6'>
                <h3 className='text-base font-semibold text-white mb-2'>
                  Risk Areas
                </h3>
                {!aiRecommendation.riskAreas?.length && <p className='text-sm text-white/75'>No specific risk areas identified in the available data.</p>}
                {(() => {
                  const p = paginateAiList(aiRecommendation.riskAreas, aiRisksPage)
                  return (
                    <>
                    <div className='space-y-3'>
                      {p.items.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-5 ${getAIPriorityCard(r.severity)}`}
                    >
                      <div className='flex flex-wrap items-start justify-between gap-2 mb-1.5'>
                        <h4 className='text-white text-sm font-semibold leading-relaxed'>
                          {typeof r.area === 'string' ? r.area : 'General'}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r.severity === 'Critical' || r.severity === 'high'
                              ? 'bg-red-500/20 text-red-300'
                              : r.severity === 'High' || r.severity === 'medium'
                              ? 'bg-orange-500/20 text-orange-300'
                              : r.severity === 'Moderate'
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {String(r.severity ?? 'Low').toUpperCase()} RISK
                        </span>
                      </div>
                      <p className='text-white text-sm leading-relaxed'>{typeof r.description === 'string' ? r.description : ''}</p>
                    </div>
                      ))}
                    </div>
                    <Pagination
                      page={p.safePage}
                      totalPages={p.totalPages}
                      onPageChange={setAiRisksPage}
                      total={p.total}
                      perPage={aiListPerPage}
                    />
                    </>
                  )
                })()}
              </div>
              )}
            </div>
            <section className='min-w-0 border-y border-white/10 py-6'>
              <h3 className='text-base font-semibold text-white mb-2'>
                Health Intervention Recommendations
              </h3>
              <p className='text-sm text-white/75 leading-relaxed mb-4'>
                Practical next steps based on identified conditions, risk factors, and community needs.
              </p>
              {!aiRecommendation.recommendations?.length && (
                <p className='text-sm text-white/75'>No targeted interventions are supported by the available data.</p>
              )}
              {(() => {
                const p = paginateAiList(aiRecommendation.recommendations, aiActionsPage)
                return (
                  <>
                  <div className='grid grid-cols-1 gap-5'>
                    {p.items.map((r, i) => (
                  <div
                    key={(p.safePage - 1) * aiListPerPage + i}
                    className={`min-w-0 flex flex-col rounded-xl border p-5 ${getAIPriorityCard(r.priority)}`}
                  >
                    <div className='flex flex-wrap items-center gap-2 mb-2.5'>
                      <h4 className='text-sm font-semibold text-white leading-relaxed mr-auto'>
                        Intervention {(p.safePage - 1) * aiListPerPage + i + 1}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.priority === 'high'
                            ? 'bg-red-500/20 text-red-300'
                            : r.priority === 'medium'
                            ? 'bg-orange-500/20 text-orange-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {String(r.priority ?? 'low').toUpperCase()} PRIORITY
                      </span>
                      <span className='text-xs text-white/85 leading-relaxed'>
                        {r.category}
                      </span>
                    </div>
                    <p className='text-white text-sm leading-relaxed mb-3'>
                      {r.action}
                    </p>
                    <dl className='mt-auto border-t border-white/10 pt-3 space-y-2'>
                      <div><dt className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed'>Target group</dt><dd className='text-sm text-white/90 leading-relaxed'>{r.targetGroup}</dd></div>
                      <div><dt className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed'>Suggested timing</dt><dd className='text-sm text-white/90 leading-relaxed'>{r.timeline}</dd></div>
                      {r.expectedImpact && <div><dt className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed'>Follow-up measure</dt><dd className='text-sm text-white/90 leading-relaxed'>{r.expectedImpact}</dd></div>}
                    </dl>
                  </div>
                    ))}
                  </div>
                  <Pagination
                    page={p.safePage}
                    totalPages={p.totalPages}
                    onPageChange={setAiActionsPage}
                    total={p.total}
                    perPage={aiListPerPage}
                  />
                  </>
                )
              })()}
            </section>
            {!isBHWWorker && (
            <section className='min-w-0 border-y border-white/10 py-6'>
              <h3 className='text-base font-semibold text-white mb-2'>
                Health Program Recommendations
              </h3>
              <p className='text-sm text-white/75 leading-relaxed mb-4'>
                Community programs and activities for prevalent health concerns and priority groups.
              </p>
              {!aiRecommendation.healthProgramRecommendation?.programs?.length && (
                <p className='text-sm text-white/75'>No program recommendations are supported by the available data.</p>
              )}
              {(() => {
                const p = paginateAiList(aiRecommendation.healthProgramRecommendation?.programs, aiProgramsPage)
                return (
                  <>
                    <div className='grid grid-cols-1 gap-5'>
                      {p.items.map((pr, i) => (
                        <article key={(p.safePage - 1) * aiListPerPage + i} className='min-w-0 flex flex-col rounded-xl border border-white/10 bg-white/[0.04] p-5 break-words'>
                          <div className='flex items-start gap-3 mb-2.5'>
                            <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200 text-xs font-semibold'>
                              {(p.safePage - 1) * aiListPerPage + i + 1}
                            </span>
                            <h4 className='text-sm font-semibold text-white leading-relaxed'>{pr.program}</h4>
                          </div>
                          <p className='text-sm text-white/90 leading-relaxed mb-2.5'><span className='text-xs font-semibold uppercase tracking-wider text-white/70'>Target group: </span>{pr.targetGroup}</p>
                          {pr.objective && <p className='text-sm text-white/90 leading-relaxed mb-2.5'><span className='text-xs font-semibold uppercase tracking-wider text-white/70'>Goal: </span>{pr.objective}</p>}
                          {pr.activities?.length > 0 && (
                            <div className='mb-3'>
                              <p className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed mb-1.5'>Activities</p>
                              <ul className='list-disc pl-5 space-y-1.5 text-sm text-white/85 leading-relaxed'>
                                {pr.activities.map((activity, j) => <li key={j}>{activity}</li>)}
                              </ul>
                            </div>
                          )}
                          <dl className='mt-auto border-t border-white/10 pt-3 space-y-2'>
                            {pr.timeline && <div><dt className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed'>Suggested timing</dt><dd className='text-sm text-white/90 leading-relaxed'>{pr.timeline}</dd></div>}
                            {pr.expectedOutcome && <div><dt className='text-xs font-semibold uppercase tracking-wider text-white/70 leading-relaxed'>Follow-up measure</dt><dd className='text-sm text-white/90 leading-relaxed'>{pr.expectedOutcome}</dd></div>}
                          </dl>
                        </article>
                      ))}
                    </div>
                    <Pagination page={p.safePage} totalPages={p.totalPages} onPageChange={setAiProgramsPage} total={p.total} perPage={aiListPerPage} />
                  </>
                )
              })()}
            </section>
            )}
            {aiRecommendation.priorityResidents?.recommendations?.length > 0 && (
              <div className='min-w-0 border-y border-white/10 py-6'>
                <h3 className='text-base font-semibold text-white mb-2'>
                  Priority Residents
                </h3>
                <p className='text-sm text-white/75 leading-relaxed mb-4'>
                  Risk scores guide follow-up priority; they do not confirm an emergency. Clinical urgency depends on current symptoms and assessment.
                </p>
                {(() => {
                  const p = paginateAiList(aiRecommendation.priorityResidents.recommendations, aiPriorityPage)
                  return (
                    <>
                    <div className='grid grid-cols-1 gap-5'>
                      {p.items.map((r, i) => (
                        <div
                          key={(p.safePage - 1) * aiListPerPage + i}
                          className={`min-w-0 rounded-xl border p-5 ${getAIPriorityCard(r.urgency)}`}
                        >
                          <div className='flex items-center justify-between gap-2 flex-wrap mb-1'>
                            <h4 className='text-white text-sm font-semibold leading-relaxed'>
                              {r.resident}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                r.urgency === 'immediate'
                                  ? 'bg-red-500/20 text-red-300'
                                  : r.urgency === 'routine'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-orange-500/20 text-orange-300'
                              }`}
                            >
                              {r.urgency === 'immediate' ? 'CONTACT TODAY' : r.urgency?.toUpperCase() || 'PRIORITY'}
                            </span>
                          </div>
                          <p className='text-xs text-white/85 leading-relaxed mb-2.5'>
                            {[r.age != null && r.age !== '' ? `${r.age}y old` : null, !isBHWWorker ? r.purok : null, r.riskLevel, r.riskScore != null ? `Score ${r.riskScore}` : null].filter(Boolean).join(' • ')}
                          </p>
                          {r.conditions?.length > 0 && (
                            <div className='flex flex-wrap gap-1.5 mb-2.5'>
                              {r.conditions.map((c, j) => (
                                <span key={j} className='inline-flex items-center gap-1.5 text-xs text-white/85 bg-white/[0.05] border border-white/10 rounded-full px-2 py-0.5'>
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className='text-white/90 text-sm leading-relaxed'>
                            <span className='text-xs font-semibold uppercase tracking-wider text-white/70'>Next step: </span>
                            {r.intervention}
                          </p>
                          {r.reason && (
                            <p className='text-sm text-white/75 leading-relaxed mt-2'>Why: {r.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Pagination
                      page={p.safePage}
                      totalPages={p.totalPages}
                      onPageChange={setAiPriorityPage}
                      total={p.total}
                      perPage={aiListPerPage}
                    />
                    </>
                  )
                })()}
              </div>
            )}
            {!isBHWWorker && aiRecommendation.purokPriority?.rankings?.length > 0 && (
              <div className='min-w-0 border-y border-white/10 py-6'>
                <h3 className='text-base font-semibold text-white mb-2'>
                  Priority Puroks
                </h3>
                <p className='text-sm text-white/75 mb-4'>Areas to coordinate first, ranked by recorded risk.</p>
                {(() => {
                  const p = paginateAiList(aiRecommendation.purokPriority.rankings, aiPurokRankPage)
                  return (
                    <>
                    <div className='grid grid-cols-1 gap-5'>
                      {p.items.map((rk, i) => (
                        <div
                          key={(p.safePage - 1) * aiListPerPage + i}
                          className={`min-w-0 rounded-xl border p-5 ${getAIPriorityCard(rk.priority)}`}
                        >
                          <div className='flex items-center justify-between gap-2 flex-wrap mb-1.5'>
                            <h4 className='text-white text-sm font-semibold leading-relaxed'>
                              <span className='text-blue-200 font-bold mr-2'>#{rk.rank ?? ((p.safePage - 1) * aiListPerPage + i + 1)}</span>
                              {typeof rk.purok === 'string' ? rk.purok : 'Unknown'}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                rk.priority === 'Critical'
                                  ? 'bg-red-500/20 text-red-300'
                                  : rk.priority === 'High'
                                  ? 'bg-orange-500/20 text-orange-300'
                                  : rk.priority === 'Low'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-yellow-500/20 text-yellow-300'
                              }`}
                            >
                              {String(rk.priority ?? 'Low').toUpperCase()} PRIORITY
                            </span>
                          </div>
                          <p className='text-xs text-white/85 leading-relaxed mb-2.5'>
                              {rk.critical || 0} critical-risk • {rk.high || 0} high-risk • {rk.totalResidents || 0} resident{(rk.totalResidents ?? 0) !== 1 ? 's' : ''}
                          </p>
                          {rk.interventions?.map((s, j) => (
                            <p key={j} className='text-sm text-white/90 leading-relaxed'><span className='text-xs font-semibold uppercase tracking-wider text-white/70'>Coordination: </span>{s}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <Pagination
                      page={p.safePage}
                      totalPages={p.totalPages}
                      onPageChange={setAiPurokRankPage}
                      total={p.total}
                      perPage={aiListPerPage}
                    />
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className='text-center py-12 mt-4'>
            <Brain className='w-10 h-10 text-white/50 mx-auto mb-3' />
            <p className='text-white/65 text-sm'>
              Click a period above to generate AI recommendations
            </p>
          </div>
        )}
      </GlassCard>
      </div>

      <div
        ref={rightColRef}
        className={`space-y-4 sm:space-y-6 max-lg:contents max-lg:!space-y-0 ${
          stickySide === 'right' ? 'lg:sticky' : ''
        }`}
        style={stickySide === 'right' ? { top: `${stickyTop}px` } : undefined}
      >
      <GlassCard hover={false} className={isBHWWorker || isAdminLike ? 'hidden lg:block' : ''}>
         <h2 className='text-base sm:text-lg font-semibold text-white mb-4'>
          Overall Risk Distribution
        </h2>
        <div className='h-64 dashboard-risk-distribution-chart'>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={riskDistribution}
                cx='50%'
                cy='50%'
                innerRadius={50}
                outerRadius={85}
                paddingAngle={5}
                dataKey='value'
              >
                {riskDistribution.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip content={<RiskDistributionTooltip />} />
              <Legend
                iconType='circle'
                layout='horizontal'
                wrapperStyle={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: '12px',
                  width: '100%',
                  left: 0
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className='text-base sm:text-lg font-semibold text-white mb-2.5'>
          Residents Require Attention
        </h2>
        <div className='space-y-4'>
          <div>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-red-400'>
                Critical Risk
              </h3>
              <span className='text-xs bg-red-500/20 text-red-300 px-2.5 py-1 rounded-full font-medium'>
                {stats?.criticalCount || 0} residents
              </span>
            </div>
            <div className='space-y-2 max-h-56 overflow-y-auto pr-1'>
              {paginatedCriticalResidents.length > 0 ? (
                paginatedCriticalResidents.map(r => (
                  <div
                    key={r.id}
                    onClick={() => navigateWithReturn(navigate, location, residentsPath, { viewResidentId: r.id })}
                    className='bg-red-500/5 border border-red-400/15 rounded-lg p-3 cursor-pointer transition-colors hover:bg-red-500/10'
                  >
                    <div className='flex justify-between items-start gap-2'>
                      <div className='min-w-0'>
                        <p className='text-white text-sm font-medium truncate'>
                          {r.name || `Resident #${r.id}`}
                        </p>
                        <p className='text-xs text-white/75 mt-0.5'>
                          {formatAge(r.age, r.dateOfBirth)}{!isBHWWorker && r.purok ? ` • ${r.purok}` : ''}
                          {showsHandledGroupBubble(r) && (
                            <span> • {bhwFocusLabel}</span>
                          )}
                        </p>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <ChevronRight className='w-4 h-4 text-red-400 mt-1 flex-shrink-0' />
                      </div>
                    </div>
                    {r.conditions?.length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-2'>
                        {r.conditions.map((c, i) => (
                          <span
                            key={i}
                            className='px-2 py-0.5 bg-red-500/10 text-red-300 rounded text-xs'
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className='text-white/50 text-sm text-center py-4'>
                  No critical risk residents
                </p>
              )}
            </div>
            <Pagination
              page={criticalPage}
              totalPages={totalCriticalPages}
              onPageChange={setCriticalPage}
              total={criticalResidents.length}
              perPage={riskResidentsPerPage}
            />
          </div>
          <div>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-orange-400'>
                High Risk
              </h3>
              <span className='text-xs bg-orange-500/20 text-orange-300 px-2.5 py-1 rounded-full font-medium'>
                {stats?.highCount || 0} residents
              </span>
            </div>
            <div className='space-y-2 max-h-56 overflow-y-auto pr-1'>
              {paginatedHighRiskResidents.length > 0 ? (
                paginatedHighRiskResidents.map(r => (
                  <div
                    key={r.id}
                    onClick={() => navigateWithReturn(navigate, location, residentsPath, { viewResidentId: r.id })}
                    className='bg-orange-500/5 border border-orange-400/15 rounded-lg p-3 cursor-pointer transition-colors hover:bg-orange-500/10'
                  >
                    <div className='flex justify-between items-start gap-2'>
                      <div className='min-w-0'>
                        <p className='text-white text-sm font-medium truncate'>
                          {r.name || `Resident #${r.id}`}
                        </p>
                        <p className='text-xs text-white/75 mt-0.5'>
                          {formatAge(r.age, r.dateOfBirth)}{!isBHWWorker && r.purok ? ` • ${r.purok}` : ''}
                          {showsHandledGroupBubble(r) && (
                            <span> • {bhwFocusLabel}</span>
                          )}
                        </p>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <ChevronRight className='w-4 h-4 text-orange-400 shrink-0' />
                      </div>
                    </div>
                    {r.conditions?.length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-2'>
                        {r.conditions.map((c, i) => (
                          <span
                            key={i}
                            className='px-2 py-0.5 bg-orange-500/10 text-orange-300 rounded text-xs'
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className='text-white/50 text-sm text-center py-4'>
                  No high risk residents
                </p>
              )}
            </div>
            <Pagination
              page={highRiskPage}
              totalPages={totalHighRiskPages}
              onPageChange={setHighRiskPage}
              total={highRiskResidents.length}
              perPage={riskResidentsPerPage}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard hover={false}>
        <div className='flex items-center justify-between mb-2.5 gap-3 flex-wrap'>
          <h2 className='text-base sm:text-lg font-semibold text-white'>
            Missed Health Consultations
          </h2>
          <span className='text-xs bg-orange-500/20 text-orange-300 px-2.5 py-1 rounded-full font-medium'>
            {missedConsultations.length} resident{missedConsultations.length !== 1 ? 's' : ''}
          </span>
        </div>
        {paginatedMissedConsultations.length > 0 ? (
          <>
            <div className='space-y-2'>
              {paginatedMissedConsultations.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigateWithReturn(navigate, location, residentsPath, { viewResidentId: r.id })}
                  className='bg-orange-500/5 border border-orange-400/15 rounded-lg p-3 cursor-pointer transition-colors hover:bg-orange-500/10'
                >
                  <div className='flex justify-between items-start gap-2'>
                    <div className='min-w-0'>
                      <p className='text-white text-sm font-medium truncate'>
                        {r.name || `Resident #${r.id}`}
                      </p>
                      <p className='text-xs text-white/75 mt-0.5'>
                        {formatAge(r.age, r.dateOfBirth)}{!isBHWWorker && r.purok ? ` • ${r.purok}` : ''}
                        {showsHandledGroupBubble(r) && (
                          <span> • {bhwFocusLabel}</span>
                        )}
                      </p>
                    </div>
                    <div className='flex flex-col items-end gap-1 shrink-0'>
                      <span className='text-xs font-bold text-orange-400'>
                        {r.missedCount} missed
                      </span>
                      <span className='text-[11px] text-white/60'>
                        Last Checkup: {r.lastCheckup
                          ? new Date(r.lastCheckup).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'No checkup recorded'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={missedPage}
              totalPages={totalMissedPages}
              onPageChange={setMissedPage}
              total={missedConsultations.length}
              perPage={missedPerPage}
            />
          </>
        ) : (
          <p className='text-white/50 text-sm text-center py-4'>
            No residents with missed scheduled health consultations
          </p>
        )}
      </GlassCard>

      <GlassCard hover={false}>
        <div className='flex flex-col gap-2 mb-3'>
          <h2 className='text-base sm:text-lg font-semibold text-white'>
            Common Health Conditions
          </h2>
          {!isBHWWorker && (
          <GlassSelect
            value={selectedPurokForDiseases}
            allowCustom
            onChange={v => { setSelectedPurokForDiseases(v === '' ? 'all' : v); setConditionsPage(1) }}
            size="sm"
            className="w-full"
            options={[
              { value: 'all', label: 'All Puroks' },
              ...[...purokRiskData].sort((a, b) => a.purokName?.localeCompare(b.purokName)).map(p => ({
                value: p.purokName,
                label: p.purokName
              }))
            ]}
          />
          )}
        </div>
        {(() => {
          const allData =
            (isBHWWorker || selectedPurokForDiseases === 'all')
              ? [...commonDiseases.overall].sort((a, b) => b.count - a.count)
              : Object.entries(
                  commonDiseases.byPurok[selectedPurokForDiseases] || {}
                )
                  .map(([n, c]) => ({ name: n, count: c }))
                  .sort((a, b) => b.count - a.count)
          if (allData.length === 0) {
            return (
              <p className='text-white/50 text-sm text-center py-8'>
                No conditions recorded
              </p>
            )
          }
          const totalCondPages = Math.max(1, Math.ceil(allData.length / conditionsPerPage))
          const safeCondPage = Math.min(Math.max(1, conditionsPage), totalCondPages)
          const data = allData.slice(
            (safeCondPage - 1) * conditionsPerPage,
            safeCondPage * conditionsPerPage
          )
          const maxCount = Math.max(1, ...allData.map(d => d.count))
          return (
            <>
            <div className='space-y-3.5'>
              {data.map((d, i) => {
                const color = DISEASE_COLORS[((safeCondPage - 1) * conditionsPerPage + i) % DISEASE_COLORS.length]
                const width = Math.max(
                  6,
                  Math.round((d.count / maxCount) * 100)
                )
                return (
                  <div key={d.name}>
                    <div className='flex items-center justify-between gap-3 mb-1.5'>
                      <span className='text-sm text-white/75 truncate'>
                        {d.name}
                      </span>
                      <span className='text-xs text-white/75 font-medium shrink-0'>
                        {d.count} {d.count === 1 ? 'case' : 'cases'}
                      </span>
                    </div>
                    <div className='h-2 bg-white/5 border border-white/10 rounded-full overflow-hidden'>
                      <div
                        className='h-full rounded-full'
                        style={{
                          width: `${width}%`,
                          background: `linear-gradient(90deg, ${color}66, ${color})`,
                          boxShadow: `0 0 8px ${color}40`
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination
              page={safeCondPage}
              totalPages={totalCondPages}
              onPageChange={setConditionsPage}
              total={allData.length}
              perPage={conditionsPerPage}
            />
            </>
          )
        })()}
      </GlassCard>
      </div>
      </div>
    </div>
  )
}

export default Dashboard
