import { useState } from 'react'
import type { ServerStatus } from '../../shared/types'

interface Props {
  status: ServerStatus
  onConnect: (channelId: string, cookies: string) => void
  onDisconnect: () => void
}

// Extract channel ID from full URL or return as-is
function parseChannelId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})/i)
  if (match) return match[1]
  if (/^[a-f0-9]{32}$/i.test(trimmed)) return trimmed
  return trimmed
}

const COOKIE_STORAGE_KEY = 'chzzk_nid_cookies'

export default function ConnectForm({ status, onConnect, onDisconnect }: Props) {
  const [input, setInput] = useState('')
  const [cookies, setCookies] = useState(() => localStorage.getItem(COOKIE_STORAGE_KEY) ?? '')
  const [showCookieHelp, setShowCookieHelp] = useState(false)

  const handleConnect = () => {
    const channelId = parseChannelId(input)
    if (!channelId) return
    // Persist cookies for convenience
    if (cookies.trim()) localStorage.setItem(COOKIE_STORAGE_KEY, cookies.trim())
    onConnect(channelId, cookies.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !status.connected) handleConnect()
  }

  return (
    <header className="bg-gray-800 border-b border-gray-700 shrink-0">
      {/* Main row */}
      <div className="flex items-center gap-2 p-3">
        <div className="text-purple-400 font-bold text-sm whitespace-nowrap mr-1">
          치지직 픽
        </div>

        <input
          type="text"
          className="flex-1 bg-gray-700 rounded px-3 py-1.5 text-sm outline-none
                     focus:ring-2 focus:ring-purple-500 placeholder-gray-500
                     disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
          placeholder="채널 ID 또는 URL 붙여넣기"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={status.connected}
        />

        {!status.connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!input.trim()}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            연결
          </button>
        ) : (
          <button
            type="button"
            onClick={onDisconnect}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm font-medium
                       transition-colors whitespace-nowrap"
          >
            해제
          </button>
        )}

        {/* Status badge */}
        <div
          className={[
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium whitespace-nowrap',
            status.connected
              ? 'bg-green-900/60 text-green-300 border border-green-700/50'
              : status.error
                ? 'bg-red-900/60 text-red-300 border border-red-700/50'
                : 'bg-gray-700 text-gray-400',
          ].join(' ')}
        >
          <span
            className={[
              'w-1.5 h-1.5 rounded-full',
              status.connected ? 'bg-green-400 animate-pulse' : 'bg-gray-500',
            ].join(' ')}
          />
          {status.connected ? '연결됨' : status.error ? '연결 실패' : '연결 안됨'}
        </div>
      </div>

      {/* Cookie row */}
      <div className="px-3 pb-3 flex items-start gap-2">
        <input
          type="password"
          className="flex-1 bg-gray-700/60 rounded px-3 py-1.5 text-xs outline-none
                     focus:ring-2 focus:ring-purple-500/60 placeholder-gray-500
                     disabled:opacity-50 disabled:cursor-not-allowed font-mono min-w-0"
          placeholder="NID_AUT=…; NID_SES=… (Naver 로그인 쿠키)"
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
          disabled={status.connected}
        />
        <button
          type="button"
          onClick={() => setShowCookieHelp((v) => !v)}
          className="text-gray-500 hover:text-gray-300 text-xs whitespace-nowrap pt-1.5 transition-colors"
          title="쿠키 설정 방법 보기"
        >
          {showCookieHelp ? '닫기' : '도움말'}
        </button>
      </div>

      {/* Cookie help panel */}
      {showCookieHelp && (
        <div className="mx-3 mb-3 p-3 bg-gray-900/80 border border-gray-700 rounded text-xs text-gray-400 space-y-1.5">
          <p className="text-gray-200 font-medium">Naver 쿠키 가져오는 방법</p>
          <ol className="list-decimal list-inside space-y-1">
            <li><a href="https://naver.com" target="_blank" rel="noreferrer noopener" className="text-blue-400 underline">naver.com</a>에 로그인</li>
            <li>브라우저 개발자 도구 열기 (F12)</li>
            <li>Application → Cookies → <code className="bg-gray-700 px-1 rounded">https://naver.com</code> 선택</li>
            <li><code className="bg-gray-700 px-1 rounded">NID_AUT</code> 값과 <code className="bg-gray-700 px-1 rounded">NID_SES</code> 값을 복사</li>
            <li>위 칸에 <code className="bg-gray-700 px-1 rounded">NID_AUT=값; NID_SES=값</code> 형식으로 입력</li>
          </ol>
          <p className="text-yellow-600/80">쿠키는 이 기기에만 저장되며 서버로 전송됩니다.</p>
        </div>
      )}

      {/* Error message */}
      {status.error && !status.connected && (
        <div className="mx-3 mb-3 px-3 py-2 bg-red-950/60 border border-red-800/50 rounded text-xs text-red-300">
          {status.error}
        </div>
      )}
    </header>
  )
}
