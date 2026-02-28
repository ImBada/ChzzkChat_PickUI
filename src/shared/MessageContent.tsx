import type { ReactNode } from 'react'

const EMOJI_RE = /\{:([^:]+):\}/g

interface Props {
  text: string
  emojis: Record<string, string>
  imgClassName?: string
}

export default function MessageContent({ text, emojis, imgClassName }: Props) {
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null

  EMOJI_RE.lastIndex = 0
  while ((match = EMOJI_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const id = match[1]
    const url = emojis[id]
    if (url) {
      parts.push(
        <img
          key={`${id}-${match.index}`}
          src={url}
          alt={id}
          className={imgClassName ?? 'inline-block w-5 h-5 align-middle'}
        />
      )
    } else {
      parts.push(match[0])
    }
    last = match.index + match[0].length
  }

  if (last < text.length) {
    parts.push(text.slice(last))
  }

  return <>{parts}</>
}
