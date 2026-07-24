import type { ChatMessage } from '../../shared/types'
import MessageContent from '../../shared/MessageContent'

interface Props {
  message: ChatMessage
  top: number
  duration: number
  fontSize: number
  showNick: boolean
  onDismiss: () => void
}

const NICK_COLORS = [
  '#ff8787', '#ffc078', '#ffec99', '#8ce99a',
  '#74c0fc', '#da77f2', '#faa2c1', '#c0eb75',
]

function nickColor(nick: string): string {
  let hash = 0
  for (let index = 0; index < nick.length; index += 1) {
    hash = nick.charCodeAt(index) + ((hash << 5) - hash)
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

export default function DanmakuMessage({
  message,
  top,
  duration,
  fontSize,
  showNick,
  onDismiss,
}: Props) {
  return (
    <div
      className="danmaku-message absolute left-full flex items-center whitespace-nowrap font-bold text-white"
      style={{
        top,
        fontSize,
        lineHeight: 1.2,
        animationDuration: `${duration}ms`,
      }}
      onAnimationEnd={onDismiss}
      aria-hidden="true"
    >
      {showNick && (
        <span className="mr-[0.35em]" style={{ color: nickColor(message.nick) }}>
          {message.nick}:
        </span>
      )}
      <span>
        <MessageContent
          text={message.message}
          emojis={message.emojis}
          imgClassName="danmaku-emoji inline-block align-middle"
        />
      </span>
    </div>
  )
}
