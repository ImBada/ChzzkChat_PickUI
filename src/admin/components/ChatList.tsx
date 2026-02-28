import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../shared/types'
import ChatMessageRow from './ChatMessage'

interface Props {
  messages: ChatMessage[]
  pickedId: string | null
  onPickMessage: (msg: ChatMessage) => void
}

export default function ChatList({ messages, pickedId, onPickMessage }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // Track if user has scrolled up
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const threshold = 60
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  // Auto-scroll to bottom only if already near bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        채팅이 표시됩니다. 채널에 연결하세요.
      </main>
    )
  }

  return (
    <main
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-2 space-y-1"
    >
      {messages.map((msg) => (
        <ChatMessageRow
          key={msg.id}
          message={msg}
          isPicked={pickedId === msg.id}
          onPick={onPickMessage}
        />
      ))}
      <div ref={bottomRef} />
    </main>
  )
}
