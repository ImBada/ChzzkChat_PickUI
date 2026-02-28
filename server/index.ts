import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectToChannel, disconnect } from './chzzkClient.js'
import type { ChatConnectPayload, ChatMessage, DisplayConfigPayload, MessagePickPayload, ServerStatus } from '../src/shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

// Production: serve built Vite output
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('/display', (_req, res) => {
    res.sendFile(path.join(distPath, 'display.html'))
  })
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`)

  // Admin: connect to a Chzzk channel (cookies optional)
  socket.on('chat:connect', ({ channelId, cookies }: ChatConnectPayload) => {
    console.log(`[Server] Connecting to channel: ${channelId}`)

    connectToChannel(
      channelId,
      cookies ?? '',
      (msg: ChatMessage) => {
        io.emit('chat:message', msg)
      },
      (connected: boolean, error?: string) => {
        const status: ServerStatus = {
          connected,
          channelId: connected ? channelId : null,
          error,
        }
        io.emit('server:status', status)
        if (!connected) {
          console.error(`[Server] Connection failed: ${error}`)
        }
      }
    )
  })

  // Admin: disconnect from channel
  socket.on('chat:disconnect', () => {
    console.log('[Server] Disconnecting from channel')
    disconnect()
    const status: ServerStatus = { connected: false, channelId: null }
    io.emit('server:status', status)
  })

  // Admin: pick a message to display on OBS overlay
  socket.on('message:pick', ({ message }: MessagePickPayload) => {
    console.log(`[Server] Picked message from ${message.nick}: ${message.message}`)
    io.emit('display:show', { message })
  })

  // Admin: toggle nickname visibility on display
  socket.on('display:config', (payload: DisplayConfigPayload) => {
    io.emit('display:config', payload)
  })

  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`)
})
