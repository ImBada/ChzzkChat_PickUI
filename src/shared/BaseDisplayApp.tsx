import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getSocket } from './socket'
import type { ChatMessage, DisplayConfigPayload, DisplayShowPayload } from './types'

interface BaseDisplayAppProps {
    MessageComponent: React.ComponentType<{
        message: ChatMessage
        showNick: boolean
        duration: number
        scale: number
        onDismiss: () => void
    }>
}

export default function BaseDisplayApp({ MessageComponent }: BaseDisplayAppProps) {
    const [currentMessage, setCurrentMessage] = useState<ChatMessage | null>(null)
    const [showNick, setShowNick] = useState(true)
    const [duration, setDuration] = useState(10000)
    const [scale, setScale] = useState(1.0)

    useEffect(() => {
        const socket = getSocket()

        socket.on('display:show', ({ message }: DisplayShowPayload) => {
            setCurrentMessage(message)
        })

        socket.on('display:config', ({ showNick: sn, duration: d, scale: s }: DisplayConfigPayload) => {
            setShowNick(sn)
            if (d !== undefined) setDuration(d)
            if (s !== undefined) setScale(s)
        })

        return () => {
            socket.off('display:show')
            socket.off('display:config')
        }
    }, [])

    return (
        <div className="fixed inset-0 pointer-events-none">
            <AnimatePresence mode="sync">
                {currentMessage && (
                    <MessageComponent
                        key={currentMessage.id}
                        message={currentMessage}
                        showNick={showNick}
                        duration={duration}
                        scale={scale}
                        onDismiss={() => setCurrentMessage(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
