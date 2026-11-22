import { lazy, Suspense } from 'react'
import { SkeletonResidentDetail } from './Skeleton'

const ResidentDetail = lazy(() => import('../pages/ResidentDetail.jsx'))

export default function LazyResidentDetail(props) {
  return (
    <Suspense fallback={<SkeletonResidentDetail />}>
      <ResidentDetail {...props} />
    </Suspense>
  )
}
