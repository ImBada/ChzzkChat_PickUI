import { useEffect, useState } from 'react'
import { getSocket } from '../shared/socket'
import ConnectForm from './components/ConnectForm'
import ChatList from './components/ChatList'
import type {
  ChatMessage,
  ControlAckPayload,
  ControlErrorPayload,
  DisplayConfigPayload,
  ServerStatus,
} from '../shared/types'

const MAX_MESSAGES = 200
const CONTROL_TOKEN_STORAGE_KEY = 'chzzk_control_token'

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ServerStatus>({ connected: false, channelId: null })
  const [showNick, setShowNick] = useState(true)
  const [duration, setDuration] = useState(10)
  const [scale, setScale] = useState(1.0)
  const [controlToken, setControlToken] = useState(
    () => localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY) ?? ''
  )
  const [controlError, setControlError] = useState<string | null>(null)

  useEffect(() => {
    const socket = getSocket()

    const handleMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg])
    }

    const handleStatus = (s: ServerStatus) => {
      setStatus(s)
    }

    const handleConfig = (config: DisplayConfigPayload) => {
      setShowNick(config.showNick)
      if (config.duration !== undefined) setDuration(config.duration / 1000)
      if (config.scale !== undefined) setScale(config.scale)
    }

    const handleControlError = ({ message }: ControlErrorPayload) => {
      setControlError(message)
      setStatus((current) => current.connecting
        ? { connected: false, channelId: null }
        : current)
    }

    socket.on('chat:message', handleMessage)
    socket.on('server:status', handleStatus)
    socket.on('display:config', handleConfig)
    socket.on('control:error', handleControlError)

    return () => {
      socket.off('chat:message', handleMessage)
      socket.off('server:status', handleStatus)
      socket.off('display:config', handleConfig)
      socket.off('control:error', handleControlError)
    }
  }, [])

  const handleConnect = (channelId: string, cookies: string) => {
    setControlError(null)
    setStatus({ connected: false, connecting: true, channelId })
    getSocket().emit('chat:connect', { channelId, cookies, controlToken })
  }

  const handleDisconnect = () => {
    setControlError(null)
    getSocket().emit(
      'chat:disconnect',
      { controlToken },
      (response: ControlAckPayload) => {
        if (response.ok) setMessages([])
      }
    )
  }

  const handleToggleNick = () => {
    const next = !showNick
    setShowNick(next)
    setControlError(null)
    getSocket().emit('display:config', {
      showNick: next,
      duration: duration * 1000,
      scale,
      controlToken,
    })
  }

  const handleDurationChange = (value: number) => {
    setDuration(value)
    setControlError(null)
    getSocket().emit('display:config', {
      showNick,
      duration: value * 1000,
      scale,
      controlToken,
    })
  }

  const handleScaleChange = (value: number) => {
    setScale(value)
    setControlError(null)
    getSocket().emit('display:config', {
      showNick,
      duration: duration * 1000,
      scale: value,
      controlToken,
    })
  }

  const handlePreview = () => {
    setControlError(null)
    getSocket().emit('display:preview', { controlToken })
  }

  const handleControlTokenChange = (value: string) => {
    setControlToken(value)
    setControlError(null)
    if (value) {
      localStorage.setItem(CONTROL_TOKEN_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(CONTROL_TOKEN_STORAGE_KEY)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <ConnectForm
        status={status}
        controlToken={controlToken}
        controlError={controlError}
        onControlTokenChange={handleControlTokenChange}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ChatList messages={messages} />
      <footer className="flex items-center gap-3 px-3 py-1.5 border-t border-gray-800 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="shrink-0">통과</span>
          <input
            type="number"
            min={4}
            max={30}
            value={duration}
            title="화면을 가로지르는 시간 (초)"
            onChange={(e) => {
              const v = Math.min(30, Math.max(4, Number(e.target.value)))
              handleDurationChange(v)
            }}
            className="w-10 bg-gray-700 rounded px-1.5 py-0.5 text-center text-white outline-none
                       focus:ring-1 focus:ring-purple-500 [appearance:textfield]
                       [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="shrink-0">초</span>
        </div>

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

        <button
          type="button"
          onClick={handlePreview}
          className="px-2.5 py-1 rounded text-xs font-medium bg-purple-900/50 text-purple-300
                     border border-purple-700/50 hover:bg-purple-900/80 transition-colors"
          title="연결 없이 샘플 탄막 보내기"
        >
          탄막 테스트
        </button>

        <a
          href="/display.html"
          target="_blank"
          rel="noreferrer noopener"
          className="px-2.5 py-1 rounded text-xs font-medium bg-gray-700/60 text-gray-300
                     border border-gray-600/50 hover:bg-gray-700 transition-colors"
        >
          오버레이 열기
        </a>

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
