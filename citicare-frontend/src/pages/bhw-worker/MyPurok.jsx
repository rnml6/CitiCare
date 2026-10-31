// pages/bhw-worker/MyPurok.jsx
// Full information about the handled purok only: risk breakdown,
// assigned BHW (self), and every resident living there.
import { useState, useEffect } from 'react'
import { Search, MapPin, Users, AlertTriangle } from 'lucide-react'
import { purokApi } from '../../api/purokApi'
import GlassCard from '../../components/GlassCard'
import GlassInput from '../../components/GlassInput'
import StatCard from '../../components/StatCard'
import Pagination from '../../components/Pagination'
import { SkeletonMyPurokPage } from '../../components/Skeleton'
import { getRiskColor, getRiskScoreColor } from '../../utils/helpers'

const MyPurok = () => {
  const [purok, setPurok] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 10

  useEffect(() => { fetchMine() }, [])
  useEffect(() => { setPage(1) }, [search])

  const fetchMine = async () => {
    try {
      setLoading(true)
      const res = await purokApi.getMine()
      if (res.data.success) setPurok(res.data.data)
    } catch (err) {
      console.error('My purok error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <SkeletonMyPurokPage />
  }

  if (!purok) {
    return (
      <GlassCard hover={false} className='text-center py-12'>
        <MapPin className='w-10 h-10 text-white/40 mx-auto mb-3' />
        <p className='text-white font-medium mb-1'>No purok assigned yet</p>
        <p className='text-white/65 text-sm'>Please contact the administrator to get a purok assignment.</p>
      </GlassCard>
    )
  }

  const residents = purok.residents || []
  const filtered = residents.filter(r => !search || r.name?.toLowerCase().includes(search.toLowerCase()))
  const hasActiveFilters = search !== ''
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paged = hasActiveFilters ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage)

  return (
    <div className='space-y-4 sm:space-y-6 animate-fade-in'>
      <div className='pl-1'>
        <h1 className='text-2xl font-bold text-white'>{purok.name}</h1>
      </div>

      <div className='grid grid-cols-2 lg:grid-cols-5 gap-3'>
        <StatCard label='Total' value={purok.totalResidents} icon={Users} color='blue' />
        <StatCard label='Critical' value={purok.critical} icon={AlertTriangle} color='red' />
        <StatCard label='High' value={purok.high} icon={AlertTriangle} color='orange' />
        <StatCard label='Moderate' value={purok.moderate} icon={Users} color='purple' />
        <StatCard label='Low' value={purok.low} icon={Users} color='green' />
      </div>

      <GlassCard hover={false}>
        <h2 className='text-base sm:text-lg font-semibold text-white mb-3'>Residents in {purok.name}</h2>
        <GlassInput icon={Search} placeholder='Search residents...' value={search} onChange={e => setSearch(e.target.value)} />
        <div className='overflow-x-auto mt-3'>
          <table className='glass-table min-w-[560px]'>
            <thead><tr><th>Name</th><th>Age</th><th>Risk</th><th>Score</th><th>Last Checkup</th></tr></thead>
            <tbody>
              {paged.length > 0 ? paged.map(r => (
                <tr key={r.id}>
                  <td className='text-white font-medium'>{r.name}</td>
                  <td className='text-white/85'>{r.age ?? '—'}</td>
                  <td><span className={`badge ${getRiskColor(r.riskLevel)}`}>{r.riskLevel}</span></td>
                  <td className={`font-semibold ${getRiskScoreColor(r.riskScore)}`}>{r.riskScore ?? 0}</td>
                  <td className='text-white/85'>{r.lastCheckup || 'No visit yet'}{r.missedCheckup ? ' · overdue' : ''}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className='py-8 text-center text-white/65'>No residents found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!hasActiveFilters && <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} total={filtered.length} perPage={perPage} />}
      </GlassCard>
    </div>
  )
}

export default MyPurok
