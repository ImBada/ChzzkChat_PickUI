import { timingSafeEqual } from 'node:crypto'

export function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '::1'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.')
    || normalized.startsWith('::ffff:127.')
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false

  try {
    const hostname = new URL(`http://${host}`).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
    return hostname === 'localhost' || isLoopbackAddress(hostname)
  } catch {
    return false
  }
}

function tokensMatch(expected: string, presented: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const presentedBuffer = Buffer.from(presented)
  return expectedBuffer.length === presentedBuffer.length
    && timingSafeEqual(expectedBuffer, presentedBuffer)
}

export function canControl(
  configuredToken: string,
  presentedToken: string | undefined,
  context: {
    remoteAddress: string
    requestHost?: string
    forwarded: boolean
    allowLocalFallback: boolean
  }
): boolean {
  if (configuredToken) {
    return typeof presentedToken === 'string'
      && tokensMatch(configuredToken, presentedToken)
  }

  return context.allowLocalFallback
    && !context.forwarded
    && isLoopbackAddress(context.remoteAddress)
    && isLoopbackHost(context.requestHost)
}
