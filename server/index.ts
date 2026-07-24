import express from 'express'
import { createServer } from 'http'
import { Server, type ServerOptions, type Socket } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  connectToChannel,
  disconnect,
  resolveEmojis,
} from './chzzkClient.js'
import { canControl, isLoopbackAddress } from './controlAuth.js'
import type {
  ChatConnectPayload,
  ChatMessage,
  ControlAckPayload,
  ControlPayload,
  DisplayConfigPayload,
  DisplayConfigUpdatePayload,
  ServerStatus,
  ViewerCountPayload,
} from '../src/shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)
const isProduction = process.env.NODE_ENV === 'production'
const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
]

const socketServerOptions: Partial<ServerOptions> = {
  // Browser sources can briefly stall while OBS changes scenes. Give them
  // enough time to answer a ping before treating the local connection as dead.
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 30000,
  allowRequest: (req, callback) => {
    const origin = req.headers.origin
    if (!origin) {
      // Some local browser shells omit Origin on Socket.IO/WebSocket requests.
      // Keep this exception development-only and restricted to loopback clients.
      callback(
        null,
        !isProduction
          && Boolean(req.socket.remoteAddress)
          && isLoopbackAddress(req.socket.remoteAddress ?? '')
      )
      return
    }

    if (!isProduction) {
      callback(null, developmentOrigins.includes(origin))
      return
    }

    try {
      callback(null, new URL(origin).host === req.headers.host)
    } catch {
      callback(null, false)
    }
  },
}

if (!isProduction) {
  socketServerOptions.cors = { origin: developmentOrigins }
}

const io = new Server(httpServer, socketServerOptions)
const configuredControlToken = process.env.CHZZK_CONTROL_TOKEN ?? ''

let currentStatus: ServerStatus = { connected: false, channelId: null }
let currentViewerCount: ViewerCountPayload | null = null
let displayConfig: DisplayConfigPayload = {
  showNick: true,
  duration: 10000,
  scale: 1,
}
const previewMessages = [
  '이모티콘 표시 테스트 {:b_14:}',
  '탄막 오버레이 테스트입니다!',
  '긴 댓글도 앞 댓글을 추월하지 않고 자연스럽게 지나갑니다 ㅋㅋㅋㅋ',
  '치지직 채팅이 오른쪽에서 왼쪽으로 슝—',
  'WWWWWWWW 넓은 글자도 실측 너비로 간격을 지킵니다',
]
let previewIndex = 0
let previewSequence = 0

function requireControl(
  socket: Socket,
  payload: ControlPayload | null | undefined
): boolean {
  const forwarded = isProduction && Boolean(
    socket.handshake.headers.forwarded
    || socket.handshake.headers['x-forwarded-for']
    || socket.handshake.headers['x-real-ip']
    || socket.handshake.headers.via
  )
  if (canControl(
    configuredControlToken,
    payload?.controlToken,
    {
      remoteAddress: socket.handshake.address,
      requestHost: socket.handshake.headers.host,
      forwarded,
      allowLocalFallback: !isProduction,
    }
  )) {
    return true
  }

  socket.emit('control:error', {
    message: configuredControlToken
      ? '관리 토큰이 올바르지 않습니다.'
      : isProduction
        ? '프로덕션 서버에는 CHZZK_CONTROL_TOKEN 설정이 필요합니다.'
        : '로컬 직접 접속만 무토큰 제어가 가능합니다. 서버에 CHZZK_CONTROL_TOKEN을 설정하세요.',
  })
  socket.emit('server:status', currentStatus)
  socket.emit('display:config', displayConfig)
  socket.emit('viewer:count', currentViewerCount)
  return false
}

// Production: serve built Vite output
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('/display', (_req, res) => {
    res.sendFile(path.join(distPath, 'display.html'))
  })
  app.get('/retro', (_req, res) => {
    res.sendFile(path.join(distPath, 'retro.html'))
  })
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`)
  socket.emit('server:status', currentStatus)
  socket.emit('display:config', displayConfig)
  socket.emit('viewer:count', currentViewerCount)

  // Admin: connect to a Chzzk channel (cookies optional)
  socket.on('chat:connect', (payload: ChatConnectPayload) => {
    if (!requireControl(socket, payload)) return
    if (
      !payload
      || typeof payload.channelId !== 'string'
      || !/^[a-f0-9]{32}$/i.test(payload.channelId)
      || (payload.cookies !== undefined && typeof payload.cookies !== 'string')
    ) {
      socket.emit('control:error', {
        message: '올바른 32자리 치지직 채널 ID를 입력하세요.',
      })
      return
    }

    const { channelId, cookies } = payload
    console.log(`[Server] Connecting to channel: ${channelId}`)
    const connectingStatus: ServerStatus = {
      connected: false,
      connecting: true,
      channelId,
    }
    currentStatus = connectingStatus
    currentViewerCount = null
    io.emit('server:status', connectingStatus)
    io.emit('viewer:count', null)

    connectToChannel(
      channelId,
      cookies ?? '',
      (msg: ChatMessage) => {
        io.emit('chat:message', msg)
      },
      (connected: boolean, error?: string, connecting: boolean = false) => {
        const status: ServerStatus = {
          connected,
          connecting,
          channelId: connected || connecting ? channelId : null,
          error,
        }
        currentStatus = status
        io.emit('server:status', status)
        if (!connected && !connecting) {
          currentViewerCount = null
          io.emit('viewer:count', null)
          console.error(`[Server] Connection failed: ${error}`)
        } else if (connecting) {
          console.warn(`[Server] Reconnecting to Chzzk chat: ${error}`)
        }
      },
      undefined,
      (viewerCount: ViewerCountPayload | null) => {
        currentViewerCount = viewerCount
        io.emit('viewer:count', viewerCount)
      }
    )
  })

  // Admin: disconnect from channel
  socket.on('chat:disconnect', (
    payload: ControlPayload | undefined,
    acknowledge?: (response: ControlAckPayload) => void
  ) => {
    if (!requireControl(socket, payload)) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false })
      return
    }
    console.log('[Server] Disconnecting from channel')
    disconnect()
    const status: ServerStatus = { connected: false, channelId: null }
    currentStatus = status
    currentViewerCount = null
    io.emit('server:status', status)
    io.emit('viewer:count', null)
    if (typeof acknowledge === 'function') acknowledge({ ok: true })
  })

  // Admin: update automatic danmaku overlay settings
  socket.on('display:config', (payload: DisplayConfigUpdatePayload) => {
    if (!requireControl(socket, payload)) return
    if (!payload || typeof payload.showNick !== 'boolean') return

    const duration = payload.duration
    const scale = payload.scale
    displayConfig = {
      showNick: payload.showNick,
      duration: duration === undefined || !Number.isFinite(duration)
        ? displayConfig.duration
        : Math.min(30000, Math.max(4000, duration)),
      scale: scale === undefined || !Number.isFinite(scale)
        ? displayConfig.scale
        : Math.min(3, Math.max(0.5, scale)),
    }
    io.emit('display:config', displayConfig)
  })

  // Admin: send a harmless sample comment to verify the OBS overlay
  socket.on('display:preview', (payload: ControlPayload | undefined) => {
    if (!requireControl(socket, payload)) return
    const timestamp = Date.now()
    const preview = previewMessages[previewIndex]
    const message: ChatMessage = {
      id: `preview-${timestamp}-${previewSequence}`,
      channelId: 'preview',
      nick: '미리보기',
      message: preview,
      badges: [],
      emojis: resolveEmojis(preview, {}, {}),
      timestamp,
    }
    previewSequence += 1
    previewIndex = (previewIndex + 1) % previewMessages.length
    io.emit('chat:message', message)
  })

  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`)
})
