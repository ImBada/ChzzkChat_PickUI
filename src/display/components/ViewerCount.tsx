import type { ViewerCountPayload } from '../../shared/types'

interface Props {
  viewerCount: ViewerCountPayload
}

export default function ViewerCount({ viewerCount }: Props) {
  const formattedCount = viewerCount.concurrentUserCount.toLocaleString('ko-KR')

  return (
    <aside
      className="viewer-count"
      aria-label={`실시간 시청자 ${formattedCount}명`}
    >
      <span className="viewer-count__live" aria-hidden="true">
        LIVE
      </span>
      <svg
        className="viewer-count__icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.75" fill="currentColor" />
      </svg>
      <strong className="viewer-count__number">{formattedCount}</strong>
      <span className="viewer-count__unit">명</span>
    </aside>
  )
}
