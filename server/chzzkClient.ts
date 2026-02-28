import WebSocket from 'ws'
import type { ChatMessage } from '../src/shared/types.js'

const CHAT_WS_URL = 'wss://kr-ss3.chat.naver.com/chat'

type MessageCallback = (msg: ChatMessage) => void
type StatusCallback = (connected: boolean, error?: string) => void

let currentWs: WebSocket | null = null
let currentChannelId: string | null = null
let pingInterval: NodeJS.Timeout | null = null

// ─── Public API ────────────────────────────────────────────────────────────

export async function connectToChannel(
  channelId: string,
  cookies: string,
  onMessage: MessageCallback,
  onStatus: StatusCallback
): Promise<void> {
  disconnect()

  currentChannelId = channelId

  try {
    const chatChannelId = await getChatChannelId(channelId, cookies)
    const accessToken = await getAccessToken(chatChannelId, cookies)
    openWebSocket(channelId, chatChannelId, accessToken, onMessage, onStatus)
  } catch (err) {
    currentChannelId = null
    onStatus(false, String(err))
  }
}

export function disconnect(): void {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  if (currentWs) {
    currentWs.removeAllListeners()
    currentWs.terminate()
    currentWs = null
  }
  currentChannelId = null
}

export function getCurrentChannelId(): string | null {
  return currentChannelId
}

// ─── API Helpers ────────────────────────────────────────────────────────────

async function getChatChannelId(channelId: string, cookies: string): Promise<string> {
  const headers: Record<string, string> = {
    Origin: 'https://chzzk.naver.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
  if (cookies) headers['Cookie'] = cookies

  const resp = await fetch(
    `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`,
    { headers }
  )
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

async function getAccessToken(chatChannelId: string, cookies: string): Promise<string> {
  const headers: Record<string, string> = {
    Origin: 'https://chzzk.naver.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
  if (cookies) headers['Cookie'] = cookies

  const resp = await fetch(
    `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${chatChannelId}&chatType=STREAMING`,
    { headers }
  )
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
  channelId: string,
  chatChannelId: string,
  accessToken: string,
  onMessage: MessageCallback,
  onStatus: StatusCallback
): void {
  const ws = new WebSocket(CHAT_WS_URL)
  currentWs = ws

  ws.on('open', () => {
    ws.send(JSON.stringify({
      ver: '2',
      cmd: 100,
      svcid: 'game',
      cid: chatChannelId,
      tid: 1,
      bdy: { uid: null, devType: 2001, accTkn: accessToken, auth: 'READ' },
    }))
    console.log(`[ChzzkClient] WebSocket opened for channel: ${channelId}`)
  })

  ws.on('message', (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString()) as ChzzkWsMessage
      handleWsMessage(data, channelId, ws, onMessage, onStatus)
    } catch {
      // ignore malformed frames
    }
  })

  ws.on('close', () => {
    console.log('[ChzzkClient] WebSocket closed')
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null }
  })

  ws.on('error', (err: Error) => {
    console.error('[ChzzkClient] WebSocket error:', err.message)
    onStatus(false, `WebSocket 오류: ${err.message}`)
  })
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
  channelId: string,
  ws: WebSocket,
  onMessage: MessageCallback,
  onStatus: StatusCallback
): void {
  switch (data.cmd) {
    case 10100: {
      // Successfully joined chat room
      onStatus(true)
      console.log('[ChzzkClient] Connected to Chzzk chat')
      // Keep-alive ping every 20s
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ver: '2', cmd: 10000 }))
        }
      }, 20000)
      break
    }

    case 0: {
      // Ping from server → pong
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ver: '2', cmd: 10000 }))
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
            channelId,
            nick: profile.nickname,
            message: item.msgStatusType === 'CBOTBLIND'
              ? '클린봇에 의해 삭제된 메시지입니다.'
              : item.msg,
            badges: parseBadges(profile.activityBadges),
            emojis: parseEmojis(item.extras),
            timestamp: Date.now(),
          }
          onMessage(chatMsg)
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
