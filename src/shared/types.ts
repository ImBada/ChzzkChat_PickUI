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
  connecting?: boolean
  channelId: string | null
  error?: string
}

export interface ViewerCountPayload {
  channelId: string
  concurrentUserCount: number
  updatedAt: number
}

export interface ControlPayload {
  controlToken?: string
}

export interface ControlErrorPayload {
  message: string
}

export interface ControlAckPayload {
  ok: boolean
}

export interface ChatConnectPayload extends ControlPayload {
  channelId: string
  cookies?: string
}

export interface DisplayConfigPayload {
  showNick: boolean
  duration?: number  // time to cross the screen, in ms
  scale?: number     // comment size scale
}

export interface DisplayConfigUpdatePayload
  extends DisplayConfigPayload, ControlPayload {}
