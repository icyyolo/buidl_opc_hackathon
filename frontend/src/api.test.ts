/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_API_BASE,
  DEMO_TODAY,
  ProcessRequestError,
  buildProcessEndpoint,
  requestMoneyMoves,
} from './api'

const fixtureSource = readFileSync(resolve(process.cwd(), '../mock/process.json'), 'utf8')

function frozenFixture(): unknown {
  return JSON.parse(fixtureSource) as unknown
}

function mockResponse(options: {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}): Response {
  return options as Response
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buildProcessEndpoint', () => {
  it('uses the local API when no base is configured', () => {
    expect(buildProcessEndpoint(undefined)).toBe(`${DEFAULT_API_BASE}/process`)
  })

  it('supports an explicitly empty base as a same-origin endpoint', () => {
    expect(buildProcessEndpoint('')).toBe('/process')
  })

  it('normalizes trailing slashes without changing a nested base path', () => {
    expect(buildProcessEndpoint('/api///')).toBe('/api/process')
    expect(buildProcessEndpoint('https://revenue.example/v1///')).toBe(
      'https://revenue.example/v1/process',
    )
  })
})

describe('requestMoneyMoves', () => {
  it('posts the exact request contract to the normalized endpoint', async () => {
    const payload = {
      items: [],
      scored: [],
      plan: { money_moves: [], park: [], blocked: [] },
      drafts: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(payload),
      }),
    )
    vi.stubEnv('VITE_API_BASE', '/api///')
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestMoneyMoves('messy founder notes')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        braindump: 'messy founder notes',
        today: DEMO_TODAY,
      }),
    })
  })

  it('turns a network failure into a stable request error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(requestMoneyMoves('notes')).rejects.toEqual(
      new ProcessRequestError("We couldn't reach Revenue Radar. Check the connection and try again."),
    )
  })

  it('surfaces a JSON error detail for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 422,
          json: vi.fn().mockResolvedValue({ detail: 'SCORE could not conserve ids' }),
        }),
      ),
    )

    await expect(requestMoneyMoves('notes')).rejects.toEqual(
      new ProcessRequestError(
        "Revenue Radar couldn't finish this pass: SCORE could not conserve ids",
      ),
    )
  })

  it('uses the HTTP status when a non-2xx response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 503,
          json: vi.fn().mockRejectedValue(new SyntaxError('not JSON')),
        }),
      ),
    )

    await expect(requestMoneyMoves('notes')).rejects.toEqual(
      new ProcessRequestError(
        "Revenue Radar couldn't finish this pass (HTTP 503). Please try again.",
      ),
    )
  })

  it('rejects a non-JSON success response as unreadable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(new SyntaxError('not JSON')),
        }),
      ),
    )

    await expect(requestMoneyMoves('notes')).rejects.toEqual(
      new ProcessRequestError('Revenue Radar returned an unreadable response. Please try again.'),
    )
  })

  it('rejects a malformed success payload before it reaches the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ items: [] }),
        }),
      ),
    )

    await expect(requestMoneyMoves('notes')).rejects.toEqual(
      new ProcessRequestError('Revenue Radar returned an incomplete plan. Please try again.'),
    )
  })

  it('rejects a structurally valid response whose evidence was not in the submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(frozenFixture()),
        }),
      ),
    )

    await expect(requestMoneyMoves('These notes contain none of the returned commitments.')).rejects.toEqual(
      new ProcessRequestError('Revenue Radar returned an incomplete plan. Please try again.'),
    )
  })
})
