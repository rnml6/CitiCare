// Sticky side panel listing residents that need attention the most:
// Critical/High risk, or residents with missed checkups.
import { useMemo, useState } from 'react'
import Pagination from './Pagination'
import { formatAge, formatDate, getRiskColor } from '../utils/helpers'

const PER_PAGE = 7

const riskRank = (level) => {
  const value = String(level || '').toLowerCase()
  if (value.includes('critical')) return 0
  if (value.includes('high')) return 1
  if (value.includes('moderate')) return 2
  if (value.includes('low')) return 3
  return 4
}

const PriorityResidentsSidebar = ({ residents = [], missedConsultations = [], onOpenResident }) => {
  const [page, setPage] = useState(1)

  const priorityResidents = useMemo(() => {
    const missedById = new Map((missedConsultations || []).map(m => [String(m.id), m]))
    return (residents || [])
      .map(resident => {
        const missed = missedById.get(String(resident.id))
        return {
          ...resident,
          missedCount: missed?.missedCount || 0,
          lastMissed: missed?.lastMissed || null,
        }
      })
      .filter(resident => riskRank(resident.riskLevel) <= 1 || resident.missedCount > 0)
      .sort((a, b) => {
        const byRisk = riskRank(a.riskLevel) - riskRank(b.riskLevel)
        if (byRisk !== 0) return byRisk
        if (a.missedCount !== b.missedCount) return b.missedCount - a.missedCount
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      })
  }, [residents, missedConsultations])

  const totalPages = Math.max(1, Math.ceil(priorityResidents.length / PER_PAGE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paged = priorityResidents.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  return (
    <aside className='hidden xl:sticky xl:top-0 xl:self-start xl:block'>
      <div className='glass-card !p-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h2 className='text-sm font-semibold text-white'>Priority Residents</h2>
            <p className='text-[11px] text-white/50'>Critical, high risk, or missed checkups</p>
          </div>
          <span className='shrink-0 rounded-full border border-red-400/30 bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-200'>
            {priorityResidents.length}
          </span>
        </div>

        <div className='mt-3 space-y-2'>
          {paged.length === 0 ? (
            <p className='py-6 text-center text-xs text-white/50'>No priority residents.</p>
          ) : paged.map(resident => (
            <button
              key={resident.id}
              type='button'
              onClick={() => onOpenResident?.(resident)}
              className='w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]'
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-white'>{resident.name}</p>
                  <p className='truncate text-[11px] text-white/55'>
                    {resident.dateOfBirth ? formatAge(resident.age, resident.dateOfBirth) : (resident.age != null ? `${resident.age}y` : 'N/A')}
                    {' • '}{resident.gender || 'N/A'}
                    {resident.purok ? ` • ${resident.purok}` : ''}
                  </p>
                </div>
                <span className={`badge shrink-0 ${getRiskColor(resident.riskLevel)}`}>
                  {String(resident.riskLevel || '').replace(/ (Health )?Risk$/i, '') || 'Risk'}
                </span>
              </div>
              {resident.missedCount > 0 && (
                <p className='mt-1 text-[11px] font-medium text-amber-300'>
                  {resident.missedCount} missed checkup{resident.missedCount !== 1 ? 's' : ''}
                  {resident.lastMissed ? ` · last ${formatDate(resident.lastMissed)}` : ''}
                </p>
              )}
            </button>
          ))}
        </div>

        <Pagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          total={priorityResidents.length}
          perPage={PER_PAGE}
          hidePageIndicatorOnMobile
          iconOnly
          showSummary={false}
          className='!mt-3 !pt-2'
        />
      </div>
    </aside>
  )
}

export default PriorityResidentsSidebar
