// components/Pagination.jsx
import { ChevronLeft, ChevronRight } from 'lucide-react'

const getPageItems = (current, total) => {
  if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1)
  const items = []
  const start = Math.max(1, current - 1)
  const end = Math.min(total, current + 1)
  if (start > 1) items.push('...')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < total) items.push('...')
  return items
}

const Pagination = ({
  page,
  totalPages,
  onPageChange,
  total = null,
  perPage = null,
  className = '',
  alwaysShow = false,
  pageLabel = false,
  hidePageIndicator = false,
  hidePageIndicatorOnMobile = true
}) => {
  if (totalPages <= 1 && !alwaysShow) return null

  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = total != null ? Math.min(page * perPage, total) : null
  const showing = pageLabel
    ? `Page ${page} of ${totalPages}`
    : total != null
      ? `Showing ${from} - ${to} of ${total}`
      : null

  return (
    <div
      className={`flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-white/10 ${
        showing
          ? (hidePageIndicatorOnMobile ? 'justify-end sm:justify-between' : 'justify-between')
          : 'justify-center'
      } ${className}`}
    >
      {showing && (
        <span className={`text-xs text-white/50 ${hidePageIndicatorOnMobile ? 'hidden sm:inline' : ''}`}>{showing}</span>
      )}
      <div className='flex flex-wrap items-center gap-1.5'>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className='px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/[0.06] flex items-center gap-1 transition-colors'
        >
          <ChevronLeft className='w-3.5 h-3.5' />
          Prev
        </button>
        {getPageItems(page, totalPages).map((item, i) =>
          item === '...' ? (
            <span key={`gap-${i}`} className='px-1 text-xs text-white/50'>
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                page === item
                  ? 'bg-blue-500/80 text-white shadow-md shadow-blue-500/25'
                  : 'border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/15'
              }`}
            >
              {item}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className='px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/[0.06] flex items-center gap-1 transition-colors'
        >
          Next
          <ChevronRight className='w-3.5 h-3.5' />
        </button>
      </div>
    </div>
  )
}

export default Pagination
