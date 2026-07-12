/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertProcessResponse, ContractError } from './contract'
import { SAMPLE_BRAINDUMP } from './sampleBraindump'
import type { ProcessResponse } from './types'

const fixtureSource = readFileSync(resolve(process.cwd(), '../mock/process.json'), 'utf8')

function parseFixture(): unknown {
  return JSON.parse(fixtureSource) as unknown
}

function validFixture(): ProcessResponse {
  const payload = parseFixture()
  assertProcessResponse(payload)
  return structuredClone(payload)
}

function expectContractError(payload: unknown, message: string): void {
  expect(() => assertProcessResponse(payload)).toThrowError(ContractError)
  expect(() => assertProcessResponse(payload)).toThrowError(message)
}

describe('assertProcessResponse', () => {
  it('accepts the frozen frontend/backend fixture', () => {
    expect(() => assertProcessResponse(parseFixture())).not.toThrow()
    expect(() => assertProcessResponse(parseFixture(), SAMPLE_BRAINDUMP)).not.toThrow()
  })

  it('rejects source text that was invented outside the submitted brain-dump', () => {
    expect(() => assertProcessResponse(parseFixture(), 'Unrelated founder notes.')).toThrowError(
      'source_text is not grounded in the submitted brain-dump',
    )
  })

  it('rejects a stated value that was invented outside the submitted brain-dump', () => {
    const payload = validFixture()
    payload.items[0].stated_value = 'S$99,999'
    payload.scored.find((item) => item.id === payload.items[0].id)!.stated_value = 'S$99,999'

    expect(() => assertProcessResponse(payload, SAMPLE_BRAINDUMP)).toThrowError(
      'stated_value is not grounded in the submitted brain-dump',
    )
  })

  it('enforces the deterministic revenue-first priority formula', () => {
    const payload = validFixture()
    payload.scored[0].priority += 1

    expectContractError(payload, 'priority does not match the revenue-first formula')
  })

  it('enforces descending priority order without re-sorting the response', () => {
    const payload = validFixture()
    ;[payload.scored[0], payload.scored[2]] = [payload.scored[2], payload.scored[0]]

    expectContractError(payload, 'scored must remain priority-sorted')
  })

  it('rejects overlapping decision buckets', () => {
    const payload = validFixture()
    payload.plan.park[0].id = payload.plan.money_moves[0].id

    expectContractError(payload, 'plan buckets must not overlap')
  })

  it('rejects a decision plan that does not partition every scored id', () => {
    const payload = validFixture()
    payload.plan.park.pop()

    expectContractError(payload, 'plan buckets must partition every scored id')
  })

  it('requires a draft for every selected communication target', () => {
    const payload = validFixture()
    payload.drafts = payload.drafts.filter((draft) => draft.id !== 'i5')

    expectContractError(payload, 'drafts must match the selected communication targets exactly')
  })

  it('rejects a valid draft purpose when it targets the wrong decision kind', () => {
    const payload = validFixture()
    payload.drafts[0].purpose = 'unblock'

    expectContractError(payload, 'drafts must match the selected communication targets exactly')
  })

  it.each([
    ['item', 'Changed but still non-empty'],
    ['type', 'task'],
    ['due_date', null],
    ['stated_value', null],
    ['source_text', 'Changed source text'],
    ['context', 'Changed context'],
  ] as const)('conserves extracted base field %s through scoring', (field, replacement) => {
    const payload = validFixture()
    ;(payload.scored[0] as unknown as Record<string, unknown>)[field] = replacement

    expectContractError(payload, 'scored[0] changed an extracted field')
  })

  it.each([
    ['revenue_proximity', 0],
    ['revenue_proximity', 6],
    ['revenue_proximity', 1.5],
    ['urgency', 0],
    ['urgency', 6],
    ['urgency', 1.5],
  ] as const)('rejects %s score value %s outside the integer 1–5 range', (field, replacement) => {
    const payload = validFixture()
    ;(payload.scored[0] as unknown as Record<string, unknown>)[field] = replacement

    expectContractError(payload, `${field} must be an integer from 1 to 5`)
  })

  it('rejects an unsupported extracted item type', () => {
    const payload = validFixture()
    ;(payload.items[0] as unknown as Record<string, unknown>).type = 'meeting'

    expectContractError(payload, 'items[0].type is not supported')
  })

  it('rejects an unsupported scored item type', () => {
    const payload = validFixture()
    ;(payload.scored[0] as unknown as Record<string, unknown>).type = 'meeting'

    expectContractError(payload, 'scored[0].type is not supported')
  })

  it('rejects an unsupported revenue motion', () => {
    const payload = validFixture()
    ;(payload.scored[0] as unknown as Record<string, unknown>).revenue_motion = 'churn'

    expectContractError(payload, 'scored[0].revenue_motion is not supported')
  })

  it('rejects an unsupported draft purpose', () => {
    const payload = validFixture()
    ;(payload.drafts[0] as unknown as Record<string, unknown>).purpose = 'parked'

    expectContractError(payload, 'drafts[0].purpose is not supported')
  })
})
