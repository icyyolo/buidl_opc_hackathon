import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { requestMoneyMoves } from './api'
import type { ProcessResponse } from './types'

vi.mock('./api', () => ({
  requestMoneyMoves: vi.fn(),
}))

const requestMoneyMovesMock = vi.mocked(requestMoneyMoves)

const EMPTY_RESPONSE: ProcessResponse = {
  items: [],
  scored: [],
  plan: { money_moves: [], park: [], blocked: [] },
  drafts: [],
}

beforeEach(() => {
  requestMoneyMovesMock.mockReset()
})

describe('Revenue Chief positioning copy', () => {
  test('repositions the hero while preserving the Money Moves CTA', () => {
    render(<App />)

    const headline = screen.getByRole('heading', {
      name: 'Paste the chaos. Find the 3 moves that can move cash today.',
    })
    const hero = headline.closest('.hero')
    if (!(hero instanceof HTMLElement)) throw new Error('Hero section was not rendered')

    expect(
      within(hero).getByText('Explainable revenue triage for one-person companies'),
    ).toBeInTheDocument()
    expect(
      within(hero).getByText(
        'Revenue Radar proves what matters from your own words, parks the safe work, unblocks what is stuck, and prepares only the messages needed to act.',
      ),
    ).toBeInTheDocument()

    const proofStrip = within(hero).getByLabelText('How Revenue Radar decides')
    expect(proofStrip).toHaveTextContent('3 Money Moves')
    expect(proofStrip).toHaveTextContent('Visible scoring')
    expect(proofStrip).toHaveTextContent('Verbatim evidence')
    expect(proofStrip).toHaveTextContent('Ready-to-review messages')

    const submit = within(hero).getByRole('button', { name: 'Find My Money Moves' })
    expect(submit).toHaveTextContent('Find My Money Moves')
  })

  test('submits edited founder text through the unchanged request path', async () => {
    requestMoneyMovesMock.mockResolvedValueOnce(EMPTY_RESPONSE)
    const user = userEvent.setup()
    render(<App />)

    const founderText = 'Chase the overdue invoice today.'
    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.clear(textarea)
    await user.type(textarea, founderText)
    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))

    await waitFor(() => expect(requestMoneyMovesMock).toHaveBeenCalledTimes(1))
    expect(requestMoneyMovesMock).toHaveBeenCalledWith(founderText)
    expect(await screen.findByLabelText('Revenue plan results')).toBeInTheDocument()
  })
})
