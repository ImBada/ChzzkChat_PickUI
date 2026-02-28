import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '../../shared/types'
import MessageContent from '../../shared/MessageContent'

interface Props {
    message: ChatMessage
    showNick: boolean
    duration: number  // ms
    scale: number
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

export default function PickedMessageRetro({ message, showNick, duration, scale, onDismiss }: Props) {
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
            className="absolute bottom-10 left-10 max-w-lg"
            initial={{ opacity: 0, y: 32, scale }}
            animate={{ opacity: 1, y: 0, scale }}
            exit={{ opacity: 0, scale, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{ originX: 0, originY: 1, fontFamily: '"Galmuri11", sans-serif' }}
        >
            <div
                className="bg-[#1a1a1a] text-white px-6 py-4 border-4"
                style={{
                    boxShadow: `8px 8px 0px ${accentColor}`,
                    borderColor: accentColor
                }}
            >
                {showNick && (
                    <div
                        className="text-lg font-bold mb-2 pb-2 border-b-2 border-dashed"
                        style={{ color: accentColor, borderColor: 'rgba(255,255,255,0.2)' }}
                    >
                        {message.nick}
                    </div>
                )}
                <div className="text-xl leading-relaxed break-words" style={{ textShadow: '2px 2px 0px #000' }}>
                    <MessageContent
                        text={message.message}
                        emojis={message.emojis}
                        imgClassName="inline-block w-8 h-8 align-middle"
                    />
                </div>
            </div>

            {/* Progress bar in retro block style */}
            <div className="mt-4 h-3 bg-black border-2" style={{ borderColor: accentColor }}>
                <div
                    className="h-full transition-none"
                    style={{ width: `${progress}%`, backgroundColor: accentColor }}
                />
            </div>
        </motion.div>
    )
}
