import { memo } from 'react'
import type { ChatMessage } from '../../shared/types'
import MessageContent from '../../shared/MessageContent'

interface Props {
  message: ChatMessage
  isPicked: boolean
  onPick: (msg: ChatMessage) => void
}

const NICK_COLORS = [
  '#ff6b6b', '#ffa94d', '#ffe066', '#69db7c',
  '#4dabf7', '#cc5de8', '#f783ac', '#a9e34b',
]

function nickColor(nick: string): string {
  let hash = 0
  for (let i = 0; i < nick.length; i++) {
    hash = nick.charCodeAt(i) + ((hash << 5) - hash)
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

const ChatMessageRow = memo(function ChatMessageRow({ message, isPicked, onPick }: Props) {
  return (
    <div
      onClick={() => onPick(message)}
      className={[
        'flex gap-2 px-3 py-1.5 rounded cursor-pointer select-none transition-all duration-150',
        'hover:bg-gray-700 active:scale-[0.99]',
        isPicked
          ? 'bg-purple-900/60 border border-purple-500/70'
          : 'bg-gray-800/60',
      ].join(' ')}
    >
      <span
        className="font-bold text-sm shrink-0 mt-0.5"
        style={{ color: nickColor(message.nick) }}
      >
        {message.nick}
      </span>
      <span className="text-sm text-gray-200 break-words min-w-0 leading-relaxed">
        <MessageContent text={message.message} emojis={message.emojis} />
      </span>
      {isPicked && (
        <span className="ml-auto text-xs text-purple-300 shrink-0 mt-0.5 font-medium">
          ✓ 선택됨
        </span>
      )}
    </div>
  )
})

export default ChatMessageRow
