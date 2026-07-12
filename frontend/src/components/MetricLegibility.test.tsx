import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import frozenProcessPayload from '../../../mock/process.json'
import App from '../App'
import { requestMoneyMoves } from '../api'
import type { ProcessResponse, RevenueMotion } from '../types'
import { CashLeakRadar } from './CashLeakRadar'
import { DecisionReceipt } from './DecisionReceipt'
import { MOTION_DETAILS } from './MetricGlossary'
import { Results } from './Results'

vi.mock('../api', () => ({
  requestMoneyMoves: vi.fn(),
}))

const requestMoneyMovesMock = vi.mocked(requestMoneyMoves)
const MOTIONS: RevenueMotion[] = ['collect', 'close', 'deliver', 'retain', 'grow', 'operate']

function clonePayload(): ProcessResponse {
  return structuredClone(frozenProcessPayload) as ProcessResponse
}

function resultSection(name: string): HTMLElement {
  const section = screen.getByRole('heading', { name }).closest('section')
  if (!(section instanceof HTMLElement)) throw new Error(`Missing result section: ${name}`)
  return section
}

/** Follows aria-describedby from a trigger element to its on-demand disclosure bubble. */
function disclosureTextFor(trigger: HTMLElement): string {
  const id = trigger.getAttribute('aria-describedby')
  if (!id) throw new Error('Trigger is missing aria-describedby')
  const bubble = document.getElementById(id)
  if (!bubble) throw new Error(`Missing disclosure bubble for id: ${id}`)
  expect(bubble).toHaveAttribute('role', 'tooltip')
  return bubble.textContent ?? ''
}

function radarMotionTrigger(motion: RevenueMotion): HTMLElement {
  const group = screen.getByRole('group', {
    name: new RegExp(`^${MOTION_DETAILS[motion].label}:`),
  })
  return within(group).getByText(MOTION_DETAILS[motion].label)
}

beforeEach(() => {
  requestMoneyMovesMock.mockReset()
})

describe('how to read this strip', () => {
  test('is absent before a run, appears with results, and can be dismissed for the session', async () => {
    requestMoneyMovesMock.mockResolvedValueOnce(clonePayload())
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('note', { name: 'How to read this plan' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))
    const strip = await screen.findByRole('note', { name: 'How to read this plan' })
    expect(strip).toHaveTextContent(
      'Every commitment is scored revenue proximity × 3 + urgency, then sorted into 3 Money Moves, safely parked, or blocked.',
    )

    fireEvent.click(within(strip).getByRole('button', { name: 'Dismiss explanation' }))
    expect(screen.queryByRole('note', { name: 'How to read this plan' })).not.toBeInTheDocument()
  })
})

describe('motion definitions', () => {
  test('every motion exposes its definition via an accessible, keyboard-reachable trigger', () => {
    render(<CashLeakRadar items={clonePayload().scored} />)

    for (const motion of MOTIONS) {
      const trigger = radarMotionTrigger(motion)
      expect(trigger).toHaveAttribute('tabindex', '0')
      expect(disclosureTextFor(trigger)).toBe(MOTION_DETAILS[motion].meaning)
    }
  })

  test('Cash Leak Radar and Money Move badge tooltips render identical wording', () => {
    const payload = clonePayload()
    render(<Results data={payload} />)
    const moneySection = resultSection("Today's 3 Money Moves")

    for (const move of payload.plan.money_moves) {
      const item = payload.scored.find((candidate) => candidate.id === move.id)
      if (!item) throw new Error(`Missing scored item: ${move.id}`)

      const radarTrigger = radarMotionTrigger(item.revenue_motion)
      const card = within(moneySection)
        .getAllByRole('article')
        .find((candidate) => candidate.dataset.commitmentId === item.id)
      if (!card) throw new Error(`Missing money move card: ${item.id}`)
      const badgeTrigger = within(card).getByText(item.revenue_motion.toUpperCase())

      const radarText = disclosureTextFor(radarTrigger)
      const badgeText = disclosureTextFor(badgeTrigger)
      expect(radarText).toBe(badgeText)
      expect(radarText).toBe(MOTION_DETAILS[item.revenue_motion].meaning)
    }
  })

  test('never reads a motion definition from the API response object', () => {
    const payloadA = clonePayload()
    const payloadB = clonePayload()
    payloadB.scored = payloadB.scored.map((item) => ({
      ...item,
      evidence: 'a completely different evidence string',
      cost_of_delay: 'a completely different cost-of-delay string',
    }))

    const { rerender } = render(<CashLeakRadar items={payloadA.scored} />)
    const before = MOTIONS.map((motion) => disclosureTextFor(radarMotionTrigger(motion)))

    rerender(<CashLeakRadar items={payloadB.scored} />)
    const after = MOTIONS.map((motion) => disclosureTextFor(radarMotionTrigger(motion)))

    expect(after).toEqual(before)
    expect(before).toEqual(MOTIONS.map((motion) => MOTION_DETAILS[motion].meaning))
  })

  test('renders every motion trigger without crashing when a motion has zero items', () => {
    render(<CashLeakRadar items={[]} />)

    for (const motion of MOTIONS) {
      const trigger = radarMotionTrigger(motion)
      expect(disclosureTextFor(trigger)).toBe(MOTION_DETAILS[motion].meaning)
    }
  })
})

describe('priority formula explanation', () => {
  test('appears on demand and neither restates nor recomputes the rendered number', () => {
    const item = clonePayload().scored[0]
    render(<DecisionReceipt item={item} />)

    const receipt = screen.getByRole('region', { name: `Decision Receipt for ${item.item}` })
    expect(receipt).toHaveTextContent(
      `Revenue proximity ${item.revenue_proximity} × 3 + urgency ${item.urgency} = priority ${item.priority}`,
    )

    const helpButton = screen.getByRole('button', { name: 'How the priority score is calculated' })
    const explanation = disclosureTextFor(helpButton)
    expect(explanation).toContain('1 (lowest) to 5 (highest)')
    expect(explanation).not.toContain(`${item.revenue_proximity} × 3`)
    expect(explanation).not.toContain(`priority ${item.priority}`)
  })

  test('gives the same explanation regardless of which item is scored', () => {
    const [first, second] = clonePayload().scored
    const { unmount } = render(<DecisionReceipt item={first} />)
    const firstExplanation = disclosureTextFor(
      screen.getByRole('button', { name: 'How the priority score is calculated' }),
    )
    unmount()

    render(<DecisionReceipt item={second} />)
    const secondExplanation = disclosureTextFor(
      screen.getByRole('button', { name: 'How the priority score is calculated' }),
    )

    expect(firstExplanation).toBe(secondExplanation)
  })
})

describe('partition rule clauses', () => {
  test('each section states its membership rule while frozen headings stay verbatim', () => {
    render(<Results data={clonePayload()} />)

    expect(
      resultSection("Today's 3 Money Moves"),
    ).toHaveTextContent(
      'Belongs here: the highest-scoring commitments that can move or protect cash today.',
    )
    expect(resultSection('Blocked → Unblock')).toHaveTextContent(
      'Belongs here: it would score high, but a named dependency must move first.',
    )
    expect(resultSection('Parked Safely')).toHaveTextContent(
      'Belongs here: deliberately not today, with the reason waiting is economically safe.',
    )
    expect(screen.getByRole('heading', { name: 'All Commitments' })).toBeInTheDocument()
  })
})

describe('empty result rendering', () => {
  test('renders the how-to-read strip and every section without crashing on an empty response', () => {
    const emptyPayload: ProcessResponse = {
      items: [],
      scored: [],
      plan: { money_moves: [], park: [], blocked: [] },
      drafts: [],
    }
    render(<Results data={emptyPayload} />)

    expect(screen.getByRole('note', { name: 'How to read this plan' })).toBeInTheDocument()
    expect(screen.getByText('No Money Moves were returned for this pass.')).toBeInTheDocument()
    expect(screen.getByText('Nothing is blocked. Every selected commitment can move.')).toBeInTheDocument()
    expect(screen.getByText('Nothing was parked in this pass.')).toBeInTheDocument()
  })
})
