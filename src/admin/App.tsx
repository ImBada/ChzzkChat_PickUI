import { useCallback, useEffect, useState } from 'react'
import { getSocket } from '../shared/socket'
import ConnectForm from './components/ConnectForm'
import ChatList from './components/ChatList'
import type { ChatMessage, ServerStatus } from '../shared/types'

const MAX_MESSAGES = 200
const PICKED_BADGE_DURATION = 3000

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ServerStatus>({ connected: false, channelId: null })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [showNick, setShowNick] = useState(true)
  const [duration, setDuration] = useState(10)
  const [scale, setScale] = useState(1.0)

  useEffect(() => {
    const socket = getSocket()

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg])
    })

    socket.on('server:status', (s: ServerStatus) => {
      setStatus(s)
    })

    return () => {
      socket.off('chat:message')
      socket.off('server:status')
    }
  }, [])

  const handleConnect = (channelId: string, cookies: string) => {
    getSocket().emit('chat:connect', { channelId, cookies })
  }

  const handleDisconnect = () => {
    getSocket().emit('chat:disconnect')
    setMessages([])
  }

  const handlePickMessage = useCallback((msg: ChatMessage) => {
    setPickedId(msg.id)
    getSocket().emit('message:pick', { message: msg })
    setTimeout(() => setPickedId((prev) => (prev === msg.id ? null : prev)), PICKED_BADGE_DURATION)
  }, [])

  const handleToggleNick = () => {
    const next = !showNick
    setShowNick(next)
    getSocket().emit('display:config', { showNick: next, duration: duration * 1000, scale })
  }

  const handleDurationChange = (value: number) => {
    setDuration(value)
    getSocket().emit('display:config', { showNick, duration: value * 1000, scale })
  }

  const handleScaleChange = (value: number) => {
    setScale(value)
    getSocket().emit('display:config', { showNick, duration: duration * 1000, scale: value })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <ConnectForm
        status={status}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ChatList
        messages={messages}
        pickedId={pickedId}
        onPickMessage={handlePickMessage}
      />
      <footer className="flex items-center gap-3 px-3 py-1.5 border-t border-gray-800 shrink-0">
        {/* Duration control */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="shrink-0">표시</span>
          <input
            type="number"
            min={1}
            max={60}
            value={duration}
            title="표시 시간 (초)"
            onChange={(e) => {
              const v = Math.min(60, Math.max(1, Number(e.target.value)))
              handleDurationChange(v)
            }}
            className="w-10 bg-gray-700 rounded px-1.5 py-0.5 text-center text-white outline-none
                       focus:ring-1 focus:ring-purple-500 [appearance:textfield]
                       [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="shrink-0">초</span>
        </div>

        {/* Scale control */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-3">
          <span className="shrink-0">크기</span>
          <input
            type="number"
            min={0.5}
            max={3.0}
            step={0.1}
            value={scale}
            title="디스플레이 크기 (배율)"
            onChange={(e) => {
              const v = Math.min(3.0, Math.max(0.5, Number(e.target.value)))
              handleScaleChange(v)
            }}
            className="w-12 bg-gray-700 rounded px-1.5 py-0.5 text-center text-white outline-none
                       focus:ring-1 focus:ring-purple-500 [appearance:textfield]
                       [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="shrink-0">배</span>
        </div>

        <div className="flex-1" />

        {/* Nick toggle */}
        <button
          type="button"
          onClick={handleToggleNick}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
            showNick
              ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
              : 'bg-gray-700/60 text-gray-400 border border-gray-600/50',
          ].join(' ')}
          title={showNick ? '닉네임 숨기기' : '닉네임 표시하기'}
        >
          <span>{showNick ? '👤' : '👻'}</span>
          <span>{showNick ? '닉 표시 중' : '닉 숨김'}</span>
        </button>
      </footer>
    </div>
  )
}
