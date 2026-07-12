import { assertProcessResponse, ContractError } from './contract'
import type { ProcessResponse } from './types'

export const DEMO_TODAY = '2026-07-12'
export const DEFAULT_API_BASE = 'http://localhost:8000'

export class ProcessRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProcessRequestError'
  }
}

export function buildProcessEndpoint(base: string | undefined): string {
  const normalizedBase = (base ?? DEFAULT_API_BASE).replace(/\/+$/, '')
  return `${normalizedBase}/process`
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown
    if (typeof body === 'string' && body.trim()) return body.trim()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
    }
  } catch {
    // A non-JSON error response still receives a useful status-based message.
  }
  return null
}

export async function requestMoneyMoves(braindump: string): Promise<ProcessResponse> {
  const endpoint = buildProcessEndpoint(import.meta.env.VITE_API_BASE)
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ braindump, today: DEMO_TODAY }),
    })
  } catch {
    throw new ProcessRequestError("We couldn't reach Revenue Radar. Check the connection and try again.")
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new ProcessRequestError(
      detail
        ? `Revenue Radar couldn't finish this pass: ${detail}`
        : `Revenue Radar couldn't finish this pass (HTTP ${response.status}). Please try again.`,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProcessRequestError('Revenue Radar returned an unreadable response. Please try again.')
  }

  try {
    assertProcessResponse(payload, braindump)
  } catch (error) {
    if (error instanceof ContractError) {
      throw new ProcessRequestError('Revenue Radar returned an incomplete plan. Please try again.')
    }
    throw error
  }

  return payload
}
