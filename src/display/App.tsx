import { useCallback, useEffect, useRef, useState } from 'react'
import { getSocket } from '../shared/socket'
import type {
  ChatMessage,
  DisplayConfigPayload,
  ViewerCountPayload,
} from '../shared/types'
import DanmakuMessage from './components/DanmakuMessage'
import ViewerCount from './components/ViewerCount'
import {
  findPlacement,
  getLaunchDelay,
  type ActiveTrack,
  type Placement,
} from './scheduler'

const BASE_FONT_SIZE = 32
const BASE_LANE_HEIGHT = 46
const VERTICAL_PADDING = 8
const VIEWER_COUNT_RESERVED_HEIGHT = 68
const MIN_HORIZONTAL_GAP = 32
const MAX_PENDING_MESSAGES = 150
const MAX_PENDING_AGE_MS = 12000
const MIN_LAUNCH_INTERVAL_MS = 75
const MAX_BYPASSES_BEFORE_RESERVATION = 8
const MAX_WAIT_BEFORE_RESERVATION = 2500
const NEW_MESSAGE_RECHECK_DELAY = 100
const WIDTH_SAFETY_MARGIN = 8
const EMOJI_PATTERN = /\{:([^:]+):\}/g

interface OverlayConfig {
  showNick: boolean
  duration: number
  scale: number
}

interface DanmakuItem {
  key: string
  message: ChatMessage
  top: number
  width: number
  duration: number
  fontSize: number
  showNick: boolean
}

interface PendingMessage {
  message: ChatMessage
  enqueuedAt: number
  bypassCount: number
  widthCacheKey?: string
  widthCacheValue?: number
}

const DEFAULT_CONFIG: OverlayConfig = {
  showNick: true,
  duration: 10000,
  scale: 1,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function minimumRetryDelay(
  first: number | null,
  second: number | null
): number | null {
  if (first === null) return second
  if (second === null) return first
  return Math.min(first, second)
}

function normalizeConfig(
  current: OverlayConfig,
  payload: DisplayConfigPayload
): OverlayConfig {
  return {
    showNick: payload.showNick,
    duration: payload.duration === undefined
      ? current.duration
      : clamp(payload.duration, 4000, 30000),
    scale: payload.scale === undefined
      ? current.scale
      : clamp(payload.scale, 0.5, 3),
  }
}

let measurementContext: CanvasRenderingContext2D | null | undefined
let measurementFontFamily: string | undefined

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext !== undefined) return measurementContext
  measurementContext = document.createElement('canvas').getContext('2d')
  return measurementContext
}

function getMeasurementFontFamily(): string {
  if (measurementFontFamily === undefined) {
    measurementFontFamily = getComputedStyle(document.body).fontFamily
  }
  return measurementFontFamily
}

function measureRenderedWidth(
  message: ChatMessage,
  showNick: boolean,
  fontSize: number,
  fontFamily: string
): number {
  const context = getMeasurementContext()
  if (!context) {
    const fallbackLength = Array.from(
      showNick ? `${message.nick}: ${message.message}` : message.message
    ).length
    return fallbackLength * fontSize + WIDTH_SAFETY_MARGIN
  }

  context.font = `700 ${fontSize}px ${fontFamily}`

  let width = showNick
    ? context.measureText(`${message.nick}:`).width + fontSize * 0.35
    : 0
  let lastIndex = 0
  let match: RegExpExecArray | null

  EMOJI_PATTERN.lastIndex = 0
  while ((match = EMOJI_PATTERN.exec(message.message)) !== null) {
    width += context.measureText(message.message.slice(lastIndex, match.index)).width
    width += message.emojis[match[1]]
      ? fontSize * 1.25
      : context.measureText(match[0]).width
    lastIndex = match.index + match[0].length
  }

  width += context.measureText(message.message.slice(lastIndex)).width
  return Math.ceil(width + WIDTH_SAFETY_MARGIN)
}

export default function DisplayApp() {
  const [items, setItems] = useState<DanmakuItem[]>([])
  const [viewerCount, setViewerCount] = useState<ViewerCountPayload | null>(null)
  const viewerCountRef = useRef<ViewerCountPayload | null>(null)
  const configRef = useRef(DEFAULT_CONFIG)
  const queueRef = useRef<PendingMessage[]>([])
  const activeTracksRef = useRef<ActiveTrack[]>([])
  const laneCursorRef = useRef(0)
  const reservedLaneRef = useRef<number | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const retryDueAtRef = useRef<number | null>(null)
  const processQueueRef = useRef<() => void>(() => {})
  const lastLaunchAtRef = useRef(Number.NEGATIVE_INFINITY)
  const dimensionsRef = useRef({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const scheduleRetry = useCallback((delay: number | null) => {
    const retryDelay = Math.max(
      16,
      delay ?? NEW_MESSAGE_RECHECK_DELAY
    )
    const retryDueAt = performance.now() + retryDelay

    if (retryTimerRef.current !== null) {
      if (
        retryDueAtRef.current !== null
        && retryDueAtRef.current <= retryDueAt
      ) {
        return
      }
      window.clearTimeout(retryTimerRef.current)
    }

    retryDueAtRef.current = retryDueAt
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      retryDueAtRef.current = null
      processQueueRef.current()
    }, retryDelay)
  }, [])

  const processQueue = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
      retryDueAtRef.current = null
    }

    const queueNow = performance.now()
    const pendingBeforePrune = queueRef.current.length
    queueRef.current = queueRef.current.filter(
      (pending) => queueNow - pending.enqueuedAt <= MAX_PENDING_AGE_MS
    )
    if (queueRef.current.length !== pendingBeforePrune) {
      reservedLaneRef.current = null
    }
    if (queueRef.current.length === 0) return

    const launchDelay = getLaunchDelay(
      lastLaunchAtRef.current,
      queueNow,
      MIN_LAUNCH_INTERVAL_MS
    )
    if (launchDelay > 0) {
      scheduleRetry(launchDelay)
      return
    }

    let processed = 0

    // Launch at most one item per pass. Upstream frames can contain a batch of
    // chats, and spreading that batch over short intervals avoids a visual
    // burst while preserving the scheduler's lane-safety rules.
    while (queueRef.current.length > 0 && processed < 1) {
      const now = performance.now()
      const config = configRef.current
      const viewportWidth = Math.max(320, dimensionsRef.current.width)
      const fontSize = Math.round(BASE_FONT_SIZE * config.scale)
      const fontFamily = getMeasurementFontFamily()
      const widthCacheKey = `${config.showNick}:${fontSize}:${fontFamily}`
      const laneHeight = Math.round(BASE_LANE_HEIGHT * config.scale)
      const verticalPadding = viewerCountRef.current
        ? VIEWER_COUNT_RESERVED_HEIGHT
        : VERTICAL_PADDING
      const usableHeight = Math.max(
        laneHeight,
        dimensionsRef.current.height
          - verticalPadding
          - VERTICAL_PADDING
      )
      const laneCount = Math.max(1, Math.floor(usableHeight / laneHeight))

      activeTracksRef.current = activeTracksRef.current.filter(
        (track) => now - track.startedAt < track.duration
      )

      const measureWidth = (pending: PendingMessage): number => {
        if (
          pending.widthCacheKey === widthCacheKey
          && pending.widthCacheValue !== undefined
        ) {
          return pending.widthCacheValue
        }

        const width = measureRenderedWidth(
          pending.message,
          config.showNick,
          fontSize,
          fontFamily
        )
        pending.widthCacheKey = widthCacheKey
        pending.widthCacheValue = width
        return width
      }
      const search = (options: {
        queueStartIndex?: number
        queueEndIndex?: number
        onlyLaneIndex?: number
        excludedLaneIndex?: number
      } = {}) => findPlacement({
        queue: queueRef.current,
        tracks: activeTracksRef.current,
        measureWidth,
        duration: config.duration,
        viewportWidth,
        laneCount,
        laneHeight,
        verticalPadding,
        laneCursor: laneCursorRef.current,
        horizontalGap: MIN_HORIZONTAL_GAP,
        now,
        ...options,
      })

      const oldest = queueRef.current[0]
      const shouldReserveLane = (
        oldest.bypassCount >= MAX_BYPASSES_BEFORE_RESERVATION
        || now - oldest.enqueuedAt >= MAX_WAIT_BEFORE_RESERVATION
      )
      let placement: Placement | null = null
      let retryAfterMs: number | null = null

      if (shouldReserveLane) {
        const headSearch = search({ queueEndIndex: 1 })
        placement = headSearch.placement
        retryAfterMs = headSearch.retryAfterMs

        if (!placement) {
          const reservedLane = (
            reservedLaneRef.current ?? laneCursorRef.current
          ) % laneCount
          reservedLaneRef.current = reservedLane

          const reservedHeadSearch = search({
            queueEndIndex: 1,
            onlyLaneIndex: reservedLane,
          })
          const laterSearch = search({
            queueStartIndex: 1,
            excludedLaneIndex: reservedLane,
          })
          placement = laterSearch.placement
          retryAfterMs = minimumRetryDelay(
            reservedHeadSearch.retryAfterMs,
            laterSearch.retryAfterMs
          )
        }
      } else {
        const result = search()
        placement = result.placement
        retryAfterMs = result.retryAfterMs
      }

      if (!placement) {
        scheduleRetry(retryAfterMs)
        return
      }

      for (let index = 0; index < placement.queueIndex; index += 1) {
        queueRef.current[index].bypassCount += 1
      }
      const [pending] = queueRef.current.splice(placement.queueIndex, 1)
      const message = pending.message
      const key = `${message.id}-${now}`
      if (placement.queueIndex === 0) {
        reservedLaneRef.current = null
      }
      activeTracksRef.current.push({
        key,
        top: placement.top,
        height: laneHeight,
        startedAt: now,
        duration: config.duration,
        width: placement.width,
      })
      laneCursorRef.current = (placement.laneIndex + 1) % laneCount

      const item: DanmakuItem = {
        key,
        message,
        top: placement.top,
        width: placement.width,
        duration: config.duration,
        fontSize,
        showNick: config.showNick,
      }

      console.log(
        '[Display] Chat launched:',
        JSON.stringify({
          id: message.id,
          nick: message.nick,
          message: message.message,
          emojis: message.emojis,
          top: placement.top,
          width: placement.width,
          duration: config.duration,
        })
      )
      setItems((current) => [...current, item])
      lastLaunchAtRef.current = now
      processed += 1
    }

    if (queueRef.current.length === 0) {
      reservedLaneRef.current = null
    } else {
      scheduleRetry(MIN_LAUNCH_INTERVAL_MS)
    }
  }, [scheduleRetry])

  processQueueRef.current = processQueue

  useEffect(() => {
    const socket = getSocket()

    const handleMessage = (message: ChatMessage) => {
      const now = performance.now()
      console.log(
        '[Display] Chat received:',
        JSON.stringify({
          id: message.id,
          nick: message.nick,
          message: message.message,
          emojis: message.emojis,
        })
      )
      const pendingBeforePrune = queueRef.current.length
      queueRef.current = queueRef.current.filter(
        (pending) => now - pending.enqueuedAt <= MAX_PENDING_AGE_MS
      )
      if (queueRef.current.length !== pendingBeforePrune) {
        reservedLaneRef.current = null
      }
      if (queueRef.current.length >= MAX_PENDING_MESSAGES) {
        console.warn(
          '[Display] Chat dropped: queue is full',
          JSON.stringify({
            id: message.id,
            message: message.message,
            queueLength: queueRef.current.length,
          })
        )
        return
      }
      queueRef.current.push({
        message,
        enqueuedAt: now,
        bypassCount: 0,
      })
      if (retryTimerRef.current === null) {
        processQueue()
      } else {
        scheduleRetry(NEW_MESSAGE_RECHECK_DELAY)
      }
    }

    const handleConfig = (payload: DisplayConfigPayload) => {
      configRef.current = normalizeConfig(configRef.current, payload)
      processQueue()
    }

    const handleViewerCount = (payload: ViewerCountPayload | null) => {
      viewerCountRef.current = payload
      setViewerCount(payload)
      processQueue()
    }

    socket.on('chat:message', handleMessage)
    socket.on('display:config', handleConfig)
    socket.on('viewer:count', handleViewerCount)

    return () => {
      socket.off('chat:message', handleMessage)
      socket.off('display:config', handleConfig)
      socket.off('viewer:count', handleViewerCount)
    }
  }, [processQueue, scheduleRetry])

  useEffect(() => {
    const handleResize = () => {
      dimensionsRef.current = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      processQueue()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
        retryDueAtRef.current = null
      }
      window.removeEventListener('resize', handleResize)
    }
  }, [processQueue])

  const dismiss = useCallback((key: string) => {
    activeTracksRef.current = activeTracksRef.current.filter(
      (track) => track.key !== key
    )
    setItems((current) => current.filter((item) => item.key !== key))
  }, [])

  return (
    <main className="fixed inset-0 overflow-hidden pointer-events-none select-none">
      {viewerCount && <ViewerCount viewerCount={viewerCount} />}
      {items.map((item) => (
        <DanmakuMessage
          key={item.key}
          message={item.message}
          top={item.top}
          width={item.width}
          duration={item.duration}
          fontSize={item.fontSize}
          showNick={item.showNick}
          onDismiss={() => dismiss(item.key)}
        />
      ))}
    </main>
  )
}
