import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '../../shared/types'
import MessageContent from '../../shared/MessageContent'

interface Props {
  message: ChatMessage
  showNick: boolean
  duration: number  // ms
  onDismiss: () => void
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

export default function PickedMessage({ message, showNick, duration, onDismiss }: Props) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const startTime = Date.now()

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
    }, 50)

    const timeoutId = setTimeout(() => {
      onDismiss()
    }, duration)

    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [duration, onDismiss])

  const accentColor = nickColor(message.nick)

  return (
    <motion.div
      className="absolute bottom-8 left-8 max-w-sm"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Chat bubble */}
      <div className="relative bg-black/75 backdrop-blur-md rounded-2xl px-5 py-3.5 shadow-2xl overflow-hidden">
        {/* Accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: accentColor }}
        />
        {/* Username (conditionally rendered) */}
        {showNick && (
          <div
            className="text-sm font-bold mb-1 tracking-wide"
            style={{ color: accentColor }}
          >
            {message.nick}
          </div>
        )}
        {/* Message */}
        <div className="text-white text-base leading-relaxed break-words">
          <MessageContent
            text={message.message}
            emojis={message.emojis}
            imgClassName="inline-block w-6 h-6 align-middle"
          />
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-0.5 bg-white/15 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-none"
          style={{
            width: `${progress}%`,
            backgroundColor: accentColor,
            opacity: 0.7,
          }}
        />
      </div>
    </motion.div>
  )
}
