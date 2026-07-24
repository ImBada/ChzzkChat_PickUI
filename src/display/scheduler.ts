export interface ActiveTrack {
  key: string
  top: number
  height: number
  startedAt: number
  duration: number
  width: number
}

export interface Placement {
  queueIndex: number
  laneIndex: number
  top: number
  width: number
}

export interface PlacementSearchResult {
  placement: Placement | null
  retryAfterMs: number | null
}

export function getLaunchDelay(
  lastLaunchAt: number,
  now: number,
  minimumInterval: number
): number {
  if (!Number.isFinite(lastLaunchAt)) return 0
  return Math.max(0, lastLaunchAt + minimumInterval - now)
}

interface FindPlacementOptions<T> {
  queue: T[]
  tracks: ActiveTrack[]
  measureWidth: (item: T) => number
  duration: number
  viewportWidth: number
  laneCount: number
  laneHeight: number
  verticalPadding: number
  laneCursor: number
  horizontalGap: number
  now: number
  queueStartIndex?: number
  queueEndIndex?: number
  onlyLaneIndex?: number
  excludedLaneIndex?: number
}

function verticallyOverlaps(
  track: ActiveTrack,
  candidateTop: number,
  candidateHeight: number
): boolean {
  return (
    candidateTop < track.top + track.height
    && candidateTop + candidateHeight > track.top
  )
}

function horizontalSafeDelay(
  track: ActiveTrack,
  nextWidth: number,
  nextDuration: number,
  viewportWidth: number,
  horizontalGap: number,
  now: number
): number {
  const elapsed = now - track.startedAt
  if (elapsed >= track.duration) return 0

  const previousSpeed = (viewportWidth + track.width) / track.duration
  const nextSpeed = (viewportWidth + nextWidth) / nextDuration
  let requiredElapsed = (track.width + horizontalGap) / previousSpeed

  if (nextSpeed > previousSpeed) {
    const relativeSpeed = nextSpeed - previousSpeed
    const noCatchElapsed = (
      relativeSpeed * track.duration + track.width + horizontalGap
    ) / nextSpeed
    requiredElapsed = Math.max(requiredElapsed, noCatchElapsed)
  }

  const safeElapsed = Math.min(track.duration, requiredElapsed)
  return Math.max(0, safeElapsed - elapsed)
}

export function findPlacement<T>({
  queue,
  tracks,
  measureWidth,
  duration,
  viewportWidth,
  laneCount,
  laneHeight,
  verticalPadding,
  laneCursor,
  horizontalGap,
  now,
  queueStartIndex = 0,
  queueEndIndex = queue.length,
  onlyLaneIndex,
  excludedLaneIndex,
}: FindPlacementOptions<T>): PlacementSearchResult {
  let retryAfterMs = Number.POSITIVE_INFINITY
  const endIndex = Math.min(queue.length, queueEndIndex)

  for (let queueIndex = queueStartIndex; queueIndex < endIndex; queueIndex += 1) {
    const width = measureWidth(queue[queueIndex])

    for (let offset = 0; offset < laneCount; offset += 1) {
      const laneIndex = (laneCursor + offset) % laneCount
      if (onlyLaneIndex !== undefined && laneIndex !== onlyLaneIndex) continue
      if (excludedLaneIndex !== undefined && laneIndex === excludedLaneIndex) continue

      const top = verticalPadding + laneIndex * laneHeight
      let laneDelay = 0

      for (const track of tracks) {
        if (!verticallyOverlaps(track, top, laneHeight)) continue
        laneDelay = Math.max(
          laneDelay,
          horizontalSafeDelay(
            track,
            width,
            duration,
            viewportWidth,
            horizontalGap,
            now
          )
        )
      }

      if (laneDelay <= 0) {
        return {
          placement: { queueIndex, laneIndex, top, width },
          retryAfterMs: 0,
        }
      }

      retryAfterMs = Math.min(retryAfterMs, laneDelay)
    }
  }

  return {
    placement: null,
    retryAfterMs: Number.isFinite(retryAfterMs)
      ? Math.max(1, Math.ceil(retryAfterMs))
      : null,
  }
}
