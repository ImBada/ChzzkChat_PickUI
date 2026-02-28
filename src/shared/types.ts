export interface ChatMessage {
  id: string
  channelId: string
  nick: string
  message: string
  badges: string[]
  emojis: Record<string, string>  // emoticon id → image URL
  timestamp: number
}

export interface ServerStatus {
  connected: boolean
  channelId: string | null
  error?: string
}

export interface ChatConnectPayload {
  channelId: string
  cookies?: string
}

export interface MessagePickPayload {
  message: ChatMessage
}

export interface DisplayShowPayload {
  message: ChatMessage
}

export interface DisplayConfigPayload {
  showNick: boolean
  duration?: number  // ms
  scale?: number     // display scale
}
