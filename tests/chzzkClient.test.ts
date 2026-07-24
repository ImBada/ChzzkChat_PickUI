import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEmojiLookup,
  connectToChannel,
  disconnect,
  getReconnectDelay,
  resolveEmojis,
} from '../server/chzzkClient.js'

test('backs off reconnect attempts up to a bounded delay', () => {
  assert.equal(getReconnectDelay(1, 0.5), 1000)
  assert.equal(getReconnectDelay(2, 0.5), 2000)
  assert.equal(getReconnectDelay(5, 0.5), 16000)
  assert.equal(getReconnectDelay(20, 0.5), 30000)
})

test('resolves typed emoticon asset aliases from channel emoji packs', () => {
  const lookup = buildEmojiLookup([{
    emojis: [{
      emojiId: 'd_54',
      imageUrl: 'https://ssl.pstatic.net/static/nng/glive/icon/b_14.gif',
    }],
  }])

  assert.equal(
    lookup.d_54,
    'https://ssl.pstatic.net/static/nng/glive/icon/b_14.gif'
  )
  assert.equal(
    lookup.b_14,
    'https://ssl.pstatic.net/static/nng/glive/icon/b_14.gif'
  )
  assert.deepEqual(
    resolveEmojis('{:b_14:}', {}, lookup),
    {
      b_14: 'https://ssl.pstatic.net/static/nng/glive/icon/b_14.gif',
    }
  )
})

test('keeps inline emoticon URLs ahead of channel fallbacks', () => {
  assert.deepEqual(
    resolveEmojis(
      '{:d_54:}',
      { d_54: 'https://example.com/message.gif' },
      { d_54: 'https://example.com/channel.gif' }
    ),
    { d_54: 'https://example.com/message.gif' }
  )
})

test('does not expose ambiguous image filename aliases', () => {
  const lookup = buildEmojiLookup([
    {
      emojis: [{
        emojiId: 'first',
        imageUrl: 'https://example.com/one/shared.gif',
      }],
    },
    {
      emojis: [{
        emojiId: 'second',
        imageUrl: 'https://example.com/two/shared.gif',
      }],
    },
  ])

  assert.equal(lookup.shared, undefined)
  assert.equal(lookup.first, 'https://example.com/one/shared.gif')
  assert.equal(lookup.second, 'https://example.com/two/shared.gif')
})

test('disconnect aborts a pending channel lookup without reporting stale status', async () => {
  const originalFetch = globalThis.fetch
  let requestSignal: AbortSignal | undefined

  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    requestSignal = init?.signal ?? undefined
    requestSignal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

  const statuses: Array<{ connected: boolean; error?: string }> = []

  try {
    const pending = connectToChannel(
      '00000000000000000000000000000000',
      '',
      () => {},
      (connected, error) => statuses.push({ connected, error })
    )

    assert.ok(requestSignal)
    disconnect()
    await pending

    assert.equal(requestSignal.aborted, true)
    assert.deepEqual(statuses, [])
  } finally {
    globalThis.fetch = originalFetch
    disconnect()
  }
})

test('times out a stalled connection and reports the failure once', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

  const statuses: Array<{ connected: boolean; error?: string }> = []

  try {
    await connectToChannel(
      '00000000000000000000000000000000',
      '',
      () => {},
      (connected, error) => statuses.push({ connected, error }),
      20
    )

    assert.deepEqual(statuses, [{
      connected: false,
      error: '치지직 채팅 연결 시간이 초과되었습니다.',
    }])
  } finally {
    globalThis.fetch = originalFetch
    disconnect()
  }
})
