import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import frozenProcessPayload from '../../../mock/process.json'
import type { ProcessResponse, RevenueMotion } from '../types'
import { CashLeakRadar } from './CashLeakRadar'
import { Results } from './Results'

function clonePayload(): ProcessResponse {
  return structuredClone(frozenProcessPayload) as ProcessResponse
}

function resultSection(name: string): HTMLElement {
  const section = screen.getByRole('heading', { name }).closest('section')
  if (!(section instanceof HTMLElement)) throw new Error(`Missing result section: ${name}`)
  return section
}

function cardById(section: HTMLElement, id: string): HTMLElement {
  const card = within(section)
    .getAllByRole('article')
    .find((candidate) => candidate.dataset.commitmentId === id)
  if (!card) throw new Error(`Missing commitment card: ${id}`)
  return card
}

function moveToPark(payload: ProcessResponse, id: string): void {
  payload.plan.money_moves = payload.plan.money_moves.filter((move) => move.id !== id)
  payload.plan.park = [
    ...payload.plan.park,
    { id, why_safe: 'A deliberate test-only park decision grounded in the response.' },
  ]
}

describe('complete decision accounting', () => {
  test('derives every count from the current plan partition', () => {
    const payload = clonePayload()
    const { rerender } = render(<Results data={payload} />)

    expect(screen.getByRole('region', { name: 'Complete accounting' })).toHaveTextContent(
      '3 Money Moves · 1 blocked · 5 safely parked · 9 commitments accounted for',
    )

    moveToPark(payload, 'i9')
    rerender(<Results data={payload} />)

    expect(screen.getByRole('region', { name: 'Complete accounting' })).toHaveTextContent(
      '2 Money Moves · 1 blocked · 6 safely parked · 9 commitments accounted for',
    )
  })
})

describe('Cash Leak Radar', () => {
  test('derives all six motion counts and preserves stated values without aggregation', () => {
    const payload = clonePayload()
    render(<CashLeakRadar items={payload.scored} />)

    const radar = screen.getByRole('region', { name: 'Cash Leak Radar' })
    const expectedCounts: Record<RevenueMotion, number> = {
      collect: 1,
      close: 2,
      deliver: 0,
      retain: 0,
      grow: 3,
      operate: 3,
    }

    for (const [motion, count] of Object.entries(expectedCounts)) {
      const label = motion[0].toUpperCase() + motion.slice(1)
      expect(
        within(radar).getByRole('group', {
          name: `${label}: ${count} ${count === 1 ? 'commitment' : 'commitments'}`,
        }),
      ).toBeInTheDocument()
    }

    expect(radar).toHaveTextContent('Earned but uncollected')
    expect(radar).toHaveTextContent('Ready to win or renew')
    expect(radar).toHaveTextContent('Paid work to ship')
    expect(radar).toHaveTextContent('Revenue at risk')
    expect(radar).toHaveTextContent('Pipeline for later')
    expect(radar).toHaveTextContent('No direct cash motion')
    expect(within(radar).getByText('S$4,800')).toBeInTheDocument()
    expect(within(radar).getByText('S$12,000/year')).toBeInTheDocument()
    expect(within(radar).getByText('S$18,000')).toBeInTheDocument()
    expect(within(radar).queryByText('S$34,800')).not.toBeInTheDocument()
  })
})

describe('Decision Receipts', () => {
  test('shows exact score arithmetic and clearly labels evidence versus assessment', () => {
    const payload = clonePayload()
    render(<Results data={payload} />)
    const moneySection = resultSection("Today's 3 Money Moves")

    for (const move of payload.plan.money_moves) {
      const item = payload.scored.find((candidate) => candidate.id === move.id)
      if (!item) throw new Error(`Missing scored item: ${move.id}`)

      const card = cardById(moneySection, move.id)
      const receipt = within(card).getByRole('region', {
        name: `Decision Receipt for ${item.item}`,
      })

      expect(receipt).toHaveTextContent(
        `Revenue proximity ${item.revenue_proximity} × 3 + urgency ${item.urgency} = priority ${item.priority}`,
      )
      expect(item.priority).toBe(item.revenue_proximity * 3 + item.urgency)
      expect(within(receipt).getByText('Verbatim evidence')).toBeInTheDocument()
      expect(receipt.querySelector('blockquote')).toHaveTextContent(`“${item.evidence}”`)
      expect(within(receipt).getByText('Cost-of-delay assessment')).toBeInTheDocument()
      expect(receipt).toHaveTextContent(item.cost_of_delay)
    }
  })

  test('presents every prepared message as ready to review', () => {
    render(<Results data={clonePayload()} />)

    expect(screen.getAllByText('Ready to review')).toHaveLength(4)
    expect(screen.queryByText(/ready to send/i)).not.toBeInTheDocument()
  })
})

describe('Parked and Blocked detail', () => {
  test('never renders a draft for a parked item, even if a matching draft is present', () => {
    const payload = clonePayload()
    moveToPark(payload, 'i9')
    render(<Results data={payload} />)

    const parkedCard = cardById(resultSection('Parked Safely'), 'i9')
    const item = payload.scored.find((candidate) => candidate.id === 'i9')
    const parked = payload.plan.park.find((candidate) => candidate.id === 'i9')
    if (!item || !parked) throw new Error('Test fixture is missing parked item i9')

    expect(within(parkedCard).getByText('CLOSE')).toBeInTheDocument()
    expect(parkedCard).toHaveTextContent('Priority 19')
    expect(parkedCard).toHaveTextContent('S$18,000')
    expect(parkedCard.querySelector('blockquote')).toHaveTextContent(`“${item.evidence}”`)
    expect(parkedCard).toHaveTextContent(parked.why_safe)
    expect(within(parkedCard).queryByLabelText(/^Prepared message:/)).not.toBeInTheDocument()
    expect(within(parkedCard).queryByRole('button', { name: /Copy draft:/ })).not.toBeInTheDocument()
  })

  test('shows blocked proof and gates the unblock draft on message_needed', () => {
    const payload = clonePayload()
    const { rerender } = render(<Results data={payload} />)
    const blockedItem = payload.scored.find((candidate) => candidate.id === 'i5')
    const blockedDecision = payload.plan.blocked.find((candidate) => candidate.id === 'i5')
    if (!blockedItem || !blockedDecision) throw new Error('Test fixture is missing blocked item i5')

    const blockedCard = cardById(resultSection('Blocked → Unblock'), 'i5')
    expect(within(blockedCard).getByText('GROW')).toBeInTheDocument()
    expect(blockedCard).toHaveTextContent('Priority 8')
    expect(blockedCard.querySelector('blockquote')).toHaveTextContent(`“${blockedItem.evidence}”`)
    expect(blockedCard).toHaveTextContent(blockedDecision.blocker)
    expect(blockedCard).toHaveTextContent(blockedDecision.unblock_action)
    expect(within(blockedCard).getByLabelText(/^Prepared message:/)).toBeInTheDocument()

    blockedDecision.message_needed = false
    rerender(<Results data={payload} />)
    const updatedCard = cardById(resultSection('Blocked → Unblock'), 'i5')
    expect(within(updatedCard).queryByLabelText(/^Prepared message:/)).not.toBeInTheDocument()
  })
})

describe('empty insight response', () => {
  test('renders named insight sections and all motion names without crashing', () => {
    const emptyPayload: ProcessResponse = {
      items: [],
      scored: [],
      plan: { money_moves: [], park: [], blocked: [] },
      drafts: [],
    }
    const { container } = render(<Results data={emptyPayload} />)

    expect(screen.getByRole('region', { name: 'Revenue plan results' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Complete accounting' })).toHaveTextContent(
      '0 Money Moves · 0 blocked · 0 safely parked · 0 commitments accounted for',
    )

    const radar = screen.getByRole('region', { name: 'Cash Leak Radar' })
    for (const label of ['Collect', 'Close', 'Deliver', 'Retain', 'Grow', 'Operate']) {
      expect(
        within(radar).getByRole('group', { name: `${label}: 0 commitments` }),
      ).toBeInTheDocument()
    }

    expect(screen.getByText('No Money Moves were returned for this pass.')).toBeInTheDocument()
    expect(screen.getByText('Nothing is blocked. Every selected commitment can move.')).toBeInTheDocument()
    expect(screen.getByText('Nothing was parked in this pass.')).toBeInTheDocument()
    expect(screen.getByText('No commitments were extracted from this brain-dump.')).toBeInTheDocument()
    expect(container.querySelector('article')).not.toBeInTheDocument()
  })
})
