import assert from 'node:assert/strict'
import test from 'node:test'
import { findPlacement, type ActiveTrack } from '../src/display/scheduler.js'

test('uses actual vertical ranges when scale changes alter lane geometry', () => {
  const tracks: ActiveTrack[] = [{
    key: 'old-scale-comment',
    top: 54,
    height: 46,
    startedAt: 0,
    duration: 10000,
    width: 500,
  }]

  const result = findPlacement({
    queue: ['next'],
    tracks,
    measureWidth: () => 500,
    duration: 10000,
    viewportWidth: 1920,
    laneCount: 46,
    laneHeight: 23,
    verticalPadding: 8,
    laneCursor: 2,
    horizontalGap: 32,
    now: 100,
  })

  assert.equal(result.placement?.laneIndex, 4)
  assert.equal(result.placement?.top, 100)
})

test('skips a blocked long comment and places a later safe comment', () => {
  const tracks: ActiveTrack[] = [{
    key: 'previous-comment',
    top: 8,
    height: 46,
    startedAt: 0,
    duration: 10000,
    width: 500,
  }]
  const widths: Record<string, number> = {
    long: 2000,
    short: 100,
  }

  const result = findPlacement({
    queue: ['long', 'short'],
    tracks,
    measureWidth: (message) => widths[message],
    duration: 10000,
    viewportWidth: 1920,
    laneCount: 1,
    laneHeight: 46,
    verticalPadding: 8,
    laneCursor: 0,
    horizontalGap: 32,
    now: 3000,
  })

  assert.equal(result.placement?.queueIndex, 1)
  assert.equal(result.placement?.width, 100)
})

test('returns no placement while every overlapping track is too close', () => {
  const tracks: ActiveTrack[] = [{
    key: 'previous-comment',
    top: 8,
    height: 46,
    startedAt: 0,
    duration: 10000,
    width: 500,
  }]

  const result = findPlacement({
    queue: ['next'],
    tracks,
    measureWidth: () => 100,
    duration: 10000,
    viewportWidth: 1920,
    laneCount: 1,
    laneHeight: 46,
    verticalPadding: 8,
    laneCursor: 0,
    horizontalGap: 32,
    now: 100,
  })

  assert.equal(result.placement, null)
  assert.ok(result.retryAfterMs !== null)
  assert.ok(result.retryAfterMs > 0)
})

test('keeps a reserved lane free while later comments use other lanes', () => {
  const tracks: ActiveTrack[] = [{
    key: 'reserved-lane-comment',
    top: 8,
    height: 46,
    startedAt: 0,
    duration: 10000,
    width: 500,
  }]

  const result = findPlacement({
    queue: ['starved', 'later'],
    tracks,
    measureWidth: () => 100,
    duration: 10000,
    viewportWidth: 1920,
    laneCount: 2,
    laneHeight: 46,
    verticalPadding: 8,
    laneCursor: 0,
    horizontalGap: 32,
    now: 100,
    queueStartIndex: 1,
    excludedLaneIndex: 0,
  })

  assert.equal(result.placement?.queueIndex, 1)
  assert.equal(result.placement?.laneIndex, 1)
})
