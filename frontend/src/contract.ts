import {
  DRAFT_PURPOSES,
  ITEM_TYPES,
  REVENUE_MOTIONS,
  type BlockedItem,
  type Draft,
  type DraftPurpose,
  type Item,
  type ItemType,
  type MoneyMove,
  type ParkItem,
  type ProcessResponse,
  type RevenueMotion,
  type ScoredItem,
} from './types'

type UnknownRecord = Record<string, unknown>

export class ContractError extends Error {
  constructor(message: string) {
    super(`Invalid process response: ${message}`)
    this.name = 'ContractError'
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new ContractError(message)
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function validateItem(value: unknown, label: string): asserts value is Item {
  expect(isRecord(value), `${label} must be an object`)
  expect(typeof value.id === 'string' && value.id.length > 0, `${label}.id must be a non-empty string`)
  expect(typeof value.item === 'string' && value.item.length > 0, `${label}.item must be a non-empty string`)
  expect(isOneOf<ItemType>(value.type, ITEM_TYPES), `${label}.type is not supported`)
  expect(isNullableString(value.due_date), `${label}.due_date must be a string or null`)
  expect(isNullableString(value.stated_value), `${label}.stated_value must be a string or null`)
  expect(
    typeof value.source_text === 'string' && value.source_text.length > 0,
    `${label}.source_text must be a non-empty string`,
  )
  expect(typeof value.context === 'string' && value.context.length > 0, `${label}.context must be a non-empty string`)
}

function validateScoredItem(value: unknown, label: string): asserts value is ScoredItem {
  validateItem(value, label)
  const scored = value as unknown as UnknownRecord
  expect(
    isOneOf<RevenueMotion>(scored.revenue_motion, REVENUE_MOTIONS),
    `${label}.revenue_motion is not supported`,
  )
  expect(
    Number.isInteger(scored.revenue_proximity) &&
      Number(scored.revenue_proximity) >= 1 &&
      Number(scored.revenue_proximity) <= 5,
    `${label}.revenue_proximity must be an integer from 1 to 5`,
  )
  expect(
    Number.isInteger(scored.urgency) && Number(scored.urgency) >= 1 && Number(scored.urgency) <= 5,
    `${label}.urgency must be an integer from 1 to 5`,
  )
  expect(typeof scored.evidence === 'string' && scored.evidence.length > 0, `${label}.evidence is required`)
  expect(
    typeof scored.cost_of_delay === 'string' && scored.cost_of_delay.length > 0,
    `${label}.cost_of_delay must be a non-empty string`,
  )
  expect(isNullableString(scored.missing_fact), `${label}.missing_fact must be a string or null`)
  expect(Number.isInteger(scored.priority), `${label}.priority must be an integer`)
}

function validateMoneyMove(value: unknown, label: string): asserts value is MoneyMove {
  expect(isRecord(value), `${label} must be an object`)
  expect(typeof value.id === 'string' && value.id.length > 0, `${label}.id is required`)
  expect(typeof value.why_today === 'string' && value.why_today.length > 0, `${label}.why_today is required`)
  expect(typeof value.next_action === 'string' && value.next_action.length > 0, `${label}.next_action is required`)
  expect(typeof value.done_when === 'string' && value.done_when.length > 0, `${label}.done_when is required`)
}

function validateParkItem(value: unknown, label: string): asserts value is ParkItem {
  expect(isRecord(value), `${label} must be an object`)
  expect(typeof value.id === 'string' && value.id.length > 0, `${label}.id is required`)
  expect(typeof value.why_safe === 'string' && value.why_safe.length > 0, `${label}.why_safe is required`)
}

function validateBlockedItem(value: unknown, label: string): asserts value is BlockedItem {
  expect(isRecord(value), `${label} must be an object`)
  expect(typeof value.id === 'string' && value.id.length > 0, `${label}.id is required`)
  expect(typeof value.blocker === 'string' && value.blocker.length > 0, `${label}.blocker is required`)
  expect(
    typeof value.unblock_action === 'string' && value.unblock_action.length > 0,
    `${label}.unblock_action is required`,
  )
  expect(typeof value.message_needed === 'boolean', `${label}.message_needed must be boolean`)
}

function validateDraft(value: unknown, label: string): asserts value is Draft {
  expect(isRecord(value), `${label} must be an object`)
  expect(typeof value.id === 'string' && value.id.length > 0, `${label}.id is required`)
  expect(isOneOf<DraftPurpose>(value.purpose, DRAFT_PURPOSES), `${label}.purpose is not supported`)
  expect(typeof value.subject === 'string' && value.subject.length > 0, `${label}.subject is required`)
  expect(typeof value.body === 'string' && value.body.length > 0, `${label}.body is required`)
}

function sameBaseFields(item: Item, scored: ScoredItem): boolean {
  return (
    item.item === scored.item &&
    item.type === scored.type &&
    item.due_date === scored.due_date &&
    item.stated_value === scored.stated_value &&
    item.source_text === scored.source_text &&
    item.context === scored.context
  )
}

export function assertProcessResponse(
  value: unknown,
  sourceBraindump?: string,
): asserts value is ProcessResponse {
  expect(isRecord(value), 'payload must be an object')
  expect(Array.isArray(value.items), 'items must be an array')
  expect(Array.isArray(value.scored), 'scored must be an array')
  expect(isRecord(value.plan), 'plan must be an object')
  expect(Array.isArray(value.plan.money_moves), 'plan.money_moves must be an array')
  expect(Array.isArray(value.plan.park), 'plan.park must be an array')
  expect(Array.isArray(value.plan.blocked), 'plan.blocked must be an array')
  expect(Array.isArray(value.drafts), 'drafts must be an array')

  value.items.forEach((item, index) => validateItem(item, `items[${index}]`))
  value.scored.forEach((item, index) => validateScoredItem(item, `scored[${index}]`))
  value.plan.money_moves.forEach((item, index) => validateMoneyMove(item, `plan.money_moves[${index}]`))
  value.plan.park.forEach((item, index) => validateParkItem(item, `plan.park[${index}]`))
  value.plan.blocked.forEach((item, index) => validateBlockedItem(item, `plan.blocked[${index}]`))
  value.drafts.forEach((item, index) => validateDraft(item, `drafts[${index}]`))

  const response = value as unknown as ProcessResponse
  expect(response.plan.money_moves.length <= 3, 'money_moves may contain at most three entries')

  const itemIds = response.items.map((item) => item.id)
  const scoredIds = response.scored.map((item) => item.id)
  expect(new Set(itemIds).size === itemIds.length, 'item ids must be unique')
  expect(new Set(scoredIds).size === scoredIds.length, 'scored ids must be unique')
  expect(
    itemIds.length === scoredIds.length && itemIds.every((id) => scoredIds.includes(id)),
    'items and scored must contain the same ids',
  )

  const itemsById = new Map(response.items.map((item) => [item.id, item]))
  if (sourceBraindump !== undefined) {
    response.items.forEach((item, index) => {
      expect(
        sourceBraindump.includes(item.source_text),
        `items[${index}].source_text is not grounded in the submitted brain-dump`,
      )
      if (item.stated_value !== null) {
        expect(
          sourceBraindump.includes(item.stated_value),
          `items[${index}].stated_value is not grounded in the submitted brain-dump`,
        )
      }
    })
  }
  response.scored.forEach((scored, index) => {
    const item = itemsById.get(scored.id)
    expect(item !== undefined && sameBaseFields(item, scored), `scored[${index}] changed an extracted field`)
    expect(scored.evidence.length > 0 && scored.source_text.includes(scored.evidence), `scored[${index}].evidence is not grounded`)
    expect(
      scored.priority === scored.revenue_proximity * 3 + scored.urgency,
      `scored[${index}].priority does not match the revenue-first formula`,
    )
    if (index > 0) {
      expect(response.scored[index - 1].priority >= scored.priority, 'scored must remain priority-sorted')
    }
  })

  const bucketIds = [
    ...response.plan.money_moves.map((item) => item.id),
    ...response.plan.park.map((item) => item.id),
    ...response.plan.blocked.map((item) => item.id),
  ]
  expect(new Set(bucketIds).size === bucketIds.length, 'plan buckets must not overlap')
  expect(
    bucketIds.length === scoredIds.length && bucketIds.every((id) => scoredIds.includes(id)),
    'plan buckets must partition every scored id',
  )

  const scoredById = new Map(response.scored.map((item) => [item.id, item]))
  const expectedDraftKeys = new Set<string>()
  response.plan.money_moves.forEach((move) => {
    if (scoredById.get(move.id)?.type === 'email_owed') {
      expectedDraftKeys.add(`${move.id}:money_move`)
    }
  })
  response.plan.blocked.forEach((blocked) => {
    if (blocked.message_needed) {
      expectedDraftKeys.add(`${blocked.id}:unblock`)
    }
  })
  const draftKeys = response.drafts.map((draft) => `${draft.id}:${draft.purpose}`)
  expect(new Set(draftKeys).size === draftKeys.length, 'draft targets must be unique')
  expect(
    draftKeys.length === expectedDraftKeys.size && draftKeys.every((key) => expectedDraftKeys.has(key)),
    'drafts must match the selected communication targets exactly',
  )
}
