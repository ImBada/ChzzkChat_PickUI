import WebSocket from 'ws'
import type { ChatMessage } from '../src/shared/types.js'

const CHAT_WS_URL = 'wss://kr-ss3.chat.naver.com/chat'
const CONNECTION_TIMEOUT_MS = 15000
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000
const KEEP_ALIVE_INTERVAL_MS = 20000
const HEARTBEAT_STALE_MS = 60000

type MessageCallback = (msg: ChatMessage) => void
type StatusCallback = (
  connected: boolean,
  error?: string,
  connecting?: boolean
) => void

interface ConnectionSession {
  generation: number
  channelId: string
  cookies: string
  onMessage: MessageCallback
  onStatus: StatusCallback
  connectionTimeoutMs: number
  activeAttemptId: number
  nextAttemptId: number
  reconnectAttempt: number
  hasConnected: boolean
  stopped: boolean
  ws: WebSocket | null
  abortController: AbortController | null
  connectionTimeout: NodeJS.Timeout | null
  reconnectTimer: NodeJS.Timeout | null
  keepAliveInterval: NodeJS.Timeout | null
}

let currentSession: ConnectionSession | null = null
let currentChannelId: string | null = null
let connectionGeneration = 0

function isCurrentSession(session: ConnectionSession): boolean {
  return (
    currentSession === session
    && session.generation === connectionGeneration
    && !session.stopped
  )
}

function clearTimer(
  session: ConnectionSession,
  key: 'connectionTimeout' | 'reconnectTimer' | 'keepAliveInterval'
): void {
  const timer = session[key]
  if (!timer) return

  if (key === 'keepAliveInterval') {
    clearInterval(timer)
  } else {
    clearTimeout(timer)
  }
  session[key] = null
}

function disposeAttempt(session: ConnectionSession): void {
  clearTimer(session, 'connectionTimeout')
  clearTimer(session, 'keepAliveInterval')

  if (session.abortController) {
    session.abortController.abort()
    session.abortController = null
  }

  if (session.ws) {
    const ws = session.ws
    session.ws = null
    ws.removeAllListeners()
    // `terminate()` can emit a late error while a TCP handshake is still in
    // flight. Keep that cleanup-only error from becoming an uncaught event.
    ws.on('error', () => {})
    ws.terminate()
  }
}

export function getReconnectDelay(
  attempt: number,
  random: number = Math.random()
): number {
  const exponentialDelay = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  )
  const jitter = 0.8 + Math.min(1, Math.max(0, random)) * 0.4
  return Math.min(
    RECONNECT_MAX_DELAY_MS,
    Math.round(exponentialDelay * jitter)
  )
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function connectToChannel(
  channelId: string,
  cookies: string,
  onMessage: MessageCallback,
  onStatus: StatusCallback,
  connectionTimeoutMs: number = CONNECTION_TIMEOUT_MS
): Promise<void> {
  disconnect()

  const session: ConnectionSession = {
    generation: connectionGeneration,
    channelId,
    cookies,
    onMessage,
    onStatus,
    connectionTimeoutMs,
    activeAttemptId: 0,
    nextAttemptId: 0,
    reconnectAttempt: 0,
    hasConnected: false,
    stopped: false,
    ws: null,
    abortController: null,
    connectionTimeout: null,
    reconnectTimer: null,
    keepAliveInterval: null,
  }
  currentSession = session
  currentChannelId = channelId
  await runConnectionAttempt(session)
}

async function runConnectionAttempt(
  session: ConnectionSession
): Promise<void> {
  if (!isCurrentSession(session)) return

  disposeAttempt(session)
  const attemptId = ++session.nextAttemptId
  session.activeAttemptId = attemptId
  const abortController = new AbortController()
  session.abortController = abortController
  session.connectionTimeout = setTimeout(() => {
    failConnectionAttempt(
      session,
      attemptId,
      '치지직 채팅 연결 시간이 초과되었습니다.'
    )
  }, session.connectionTimeoutMs)

  try {
    const chatChannelId = await getChatChannelId(
      session.channelId,
      session.cookies,
      abortController.signal
    )
    if (!isActiveAttempt(session, attemptId)) return

    const accessToken = await getAccessToken(
      chatChannelId,
      session.cookies,
      abortController.signal
    )
    if (!isActiveAttempt(session, attemptId)) return

    if (session.abortController === abortController) {
      session.abortController = null
    }
    openWebSocket(
      session,
      chatChannelId,
      accessToken,
      attemptId
    )
  } catch (err) {
    if (
      !isActiveAttempt(session, attemptId)
      || abortController.signal.aborted
    ) {
      return
    }

    failConnectionAttempt(
      session,
      attemptId,
      err instanceof Error ? err.message : String(err)
    )
  }
}

export function disconnect(): void {
  connectionGeneration += 1

  if (currentSession) {
    currentSession.stopped = true
    clearTimer(currentSession, 'reconnectTimer')
    disposeAttempt(currentSession)
    currentSession = null
  }
  currentChannelId = null
}

export function getCurrentChannelId(): string | null {
  return currentChannelId
}

// ─── API Helpers ────────────────────────────────────────────────────────────

async function getChatChannelId(
  channelId: string,
  cookies: string,
  signal: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {
    Origin: 'https://chzzk.naver.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
  if (cookies) headers['Cookie'] = cookies

  const resp = await fetch(
    `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`,
    { headers, signal }
  )
  if (!resp.ok) {
    throw new Error(`채널 상태 조회에 실패했습니다. (HTTP ${resp.status})`)
  }
  const data = await resp.json() as { content?: { chatChannelId?: string; liveStatus?: string } }
  const chatChannelId = data?.content?.chatChannelId
  if (!chatChannelId) {
    const status = data?.content?.liveStatus
    if (status === 'CLOSE') {
      throw new Error('채널이 오프라인 상태입니다. 방송 중일 때 연결하세요.')
    }
    throw new Error('채널 ID를 찾을 수 없습니다. 채널 ID를 다시 확인하세요.')
  }
  return chatChannelId
}

async function getAccessToken(
  chatChannelId: string,
  cookies: string,
  signal: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {
    Origin: 'https://chzzk.naver.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
  if (cookies) headers['Cookie'] = cookies

  const resp = await fetch(
    `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${chatChannelId}&chatType=STREAMING`,
    { headers, signal }
  )
  if (!resp.ok) {
    throw new Error(`채팅 접근 토큰 요청에 실패했습니다. (HTTP ${resp.status})`)
  }
  const data = await resp.json() as { content?: { accessToken?: string } }
  const token = data?.content?.accessToken
  if (!token) {
    throw new Error(
      '접근 토큰을 가져올 수 없습니다. Naver 로그인 쿠키(NID_AUT, NID_SES)를 입력하세요.'
    )
  }
  return token
}

// ─── WebSocket ──────────────────────────────────────────────────────────────

function openWebSocket(
  session: ConnectionSession,
  chatChannelId: string,
  accessToken: string,
  attemptId: number
): void {
  const ws = new WebSocket(CHAT_WS_URL)
  session.ws = ws
  let lastFrameAt = Date.now()
  const isCurrent = () => (
    isActiveAttempt(session, attemptId)
    && session.ws === ws
  )

  ws.on('open', () => {
    if (!isCurrent()) {
      ws.terminate()
      return
    }
    const sent = sendFrame(session, attemptId, ws, {
      ver: '2',
      cmd: 100,
      svcid: 'game',
      cid: chatChannelId,
      tid: 1,
      bdy: { uid: null, devType: 2001, accTkn: accessToken, auth: 'READ' },
    })
    if (!sent) return
    console.log(
      `[ChzzkClient] WebSocket opened for channel: ${session.channelId}`
    )
  })

  ws.on('message', (raw: Buffer | string) => {
    if (!isCurrent()) return
    lastFrameAt = Date.now()
    try {
      const data = JSON.parse(raw.toString()) as ChzzkWsMessage
      handleWsMessage(data, session, ws, attemptId, () => {
        lastFrameAt = Date.now()
      })
    } catch {
      // ignore malformed frames
    }
  })

  ws.on('close', () => {
    if (!isCurrent()) return
    console.log('[ChzzkClient] WebSocket closed')
    failConnectionAttempt(
      session,
      attemptId,
      '치지직 채팅 연결이 종료되었습니다.'
    )
  })

  ws.on('error', (err: Error) => {
    if (!isCurrent()) return
    console.error('[ChzzkClient] WebSocket error:', err.message)
    failConnectionAttempt(
      session,
      attemptId,
      `WebSocket 오류: ${err.message}`
    )
  })

  session.keepAliveInterval = setInterval(() => {
    if (!isCurrent()) return
    if (Date.now() - lastFrameAt >= HEARTBEAT_STALE_MS) {
      failConnectionAttempt(
        session,
        attemptId,
        '치지직 채팅 응답이 없어 연결을 다시 시도합니다.'
      )
      return
    }
    if (ws.readyState === WebSocket.OPEN) {
      sendFrame(session, attemptId, ws, { ver: '2', cmd: 10000 })
    }
  }, KEEP_ALIVE_INTERVAL_MS)
}

function sendFrame(
  session: ConnectionSession,
  attemptId: number,
  ws: WebSocket,
  frame: object
): boolean {
  if (!isActiveAttempt(session, attemptId)) return false

  try {
    ws.send(JSON.stringify(frame))
    return true
  } catch (err) {
    failConnectionAttempt(
      session,
      attemptId,
      `WebSocket 전송 오류: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return false
  }
}

function isActiveAttempt(
  session: ConnectionSession,
  attemptId: number
): boolean {
  return (
    isCurrentSession(session)
    && session.activeAttemptId === attemptId
  )
}

function failConnectionAttempt(
  session: ConnectionSession,
  attemptId: number,
  error: string
): void {
  if (!isActiveAttempt(session, attemptId)) return

  session.activeAttemptId = 0
  disposeAttempt(session)

  if (!session.hasConnected) {
    session.stopped = true
    if (currentSession === session) currentSession = null
    currentChannelId = null
    session.onStatus(false, error, false)
    return
  }

  session.reconnectAttempt += 1
  const delay = getReconnectDelay(session.reconnectAttempt)
  const delaySeconds = Math.max(1, Math.ceil(delay / 1000))
  session.onStatus(
    false,
    `${error} ${delaySeconds}초 후 자동으로 재연결합니다.`,
    true
  )
  clearTimer(session, 'reconnectTimer')
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null
    void runConnectionAttempt(session)
  }, delay)
}

// ─── Message Handling ────────────────────────────────────────────────────────

interface ChzzkWsMessage {
  cmd: number
  bdy?: ChzzkChatBody[] | { sid?: string; uuid?: string }
}

interface ChzzkChatBody {
  msg: string
  msgStatusType?: string
  uid?: string
  profile?: string
  extras?: string
}

interface ChzzkProfile {
  nickname: string
  activityBadges?: { imageUrl: string }[]
}

interface ChzzkExtras {
  emojis?: Record<string, string>
}

function handleWsMessage(
  data: ChzzkWsMessage,
  session: ConnectionSession,
  ws: WebSocket,
  attemptId: number,
  markAlive: () => void
): void {
  switch (data.cmd) {
    case 10100: {
      // Successfully joined chat room
      if (!isActiveAttempt(session, attemptId)) break
      clearTimer(session, 'connectionTimeout')
      session.hasConnected = true
      session.reconnectAttempt = 0
      session.onStatus(true, undefined, false)
      console.log('[ChzzkClient] Connected to Chzzk chat')
      markAlive()
      break
    }

    case 0: {
      // Ping from server → pong
      if (ws.readyState === WebSocket.OPEN) {
        sendFrame(session, attemptId, ws, { ver: '2', cmd: 10000 })
      }
      break
    }

    case 93101: {
      // Regular chat messages
      if (!Array.isArray(data.bdy)) break
      for (const item of data.bdy) {
        try {
          const profile: ChzzkProfile = JSON.parse(item.profile ?? '{}')
          if (!profile.nickname) continue

          const chatMsg: ChatMessage = {
            id: generateId(),
            channelId: session.channelId,
            nick: profile.nickname,
            message: item.msgStatusType === 'CBOTBLIND'
              ? '클린봇에 의해 삭제된 메시지입니다.'
              : item.msg,
            badges: parseBadges(profile.activityBadges),
            emojis: parseEmojis(item.extras),
            timestamp: Date.now(),
          }
          session.onMessage(chatMsg)
        } catch {
          // skip malformed entry
        }
      }
      break
    }

    case 94008:
      // cleanBot event — ignore
      break

    default:
      break
  }
}

function parseBadges(badges?: { imageUrl: string }[]): string[] {
  return badges?.map((b) => b.imageUrl) ?? []
}

function parseEmojis(extras?: string): Record<string, string> {
  if (!extras) return {}
  try {
    const parsed = JSON.parse(extras) as ChzzkExtras
    return parsed.emojis ?? {}
  } catch {
    return {}
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
