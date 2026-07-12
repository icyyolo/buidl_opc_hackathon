import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import frozenProcessPayload from '../../mock/process.json'
import App from './App'
import { SAMPLE_BRAINDUMP } from './sampleBraindump'
import type { ProcessResponse } from './types'

const EXPECTED_SAMPLE = `ok brain dump before I lose it:
- Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.
- still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks
- Nordic Labs invoice #204 for S$4,800 was due last Friday. James in AP is the contact; need to ask whether anything is blocking payment.
- finish the generic onboarding deck template by Thursday if there is time; no client is waiting on it
- Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then
- taxes / GST filing due end of month sometime
- reply to that recruiter, not urgent
- coffee chat w/ potential co-founder, want to schedule for next week
- Meridian has an S$18,000 budget. They asked yesterday for a revised scope removing analytics but keeping onboarding; they want it tomorrow and decide on Wednesday.`

const MONEY_MOVE_IDS = ['i3', 'i1', 'i9']
const PARKED_IDS = ['i6', 'i8', 'i2', 'i4', 'i7']
const COMMITMENT_IDS = ['i3', 'i1', 'i9', 'i5', 'i6', 'i8', 'i2', 'i4', 'i7']

let fetchMock: ReturnType<typeof vi.fn>

function clonePayload(): ProcessResponse {
  return JSON.parse(JSON.stringify(frozenProcessPayload)) as ProcessResponse
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function getResultSection(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const section = heading.closest('section')
  if (!section) throw new Error(`Could not find the result section for ${name}`)
  return section
}

function idsFrom(elements: HTMLElement[]): Array<string | null> {
  return elements.map((element) => element.getAttribute('data-commitment-id'))
}

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

async function submitSuccessfulPayload(payload: ProcessResponse = clonePayload()) {
  fetchMock.mockResolvedValueOnce(jsonResponse(payload))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))
  await screen.findByLabelText('Revenue plan results')
  return user
}

async function expectFailureThenRetry(
  queueFailure: () => void,
  expectedMessage: string | RegExp,
) {
  queueFailure()
  fetchMock.mockResolvedValueOnce(jsonResponse(clonePayload()))
  const user = userEvent.setup()
  render(<App />)

  const submit = screen.getByRole('button', { name: 'Find My Money Moves' })
  await user.click(submit)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(expectedMessage)
  expect(screen.queryByText("Finding today's Money Moves…")).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Revenue plan results')).not.toBeInTheDocument()
  expect(submit).toBeEnabled()
  expect(screen.getByRole('textbox', { name: 'Founder brain-dump' })).toBeEnabled()

  await user.click(submit)

  expect(await screen.findByLabelText('Revenue plan results')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
})

describe('Revenue Chief intake', () => {
  test('prefills the exact canonical sample and exposes the exact CTA without requesting data', () => {
    render(<App />)

    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    const submit = screen.getByRole('button', { name: 'Find My Money Moves' })

    expect(SAMPLE_BRAINDUMP).toBe(EXPECTED_SAMPLE)
    expect(textarea).toHaveValue(EXPECTED_SAMPLE)
    expect(submit).toHaveTextContent('Find My Money Moves')
    expect(submit).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('posts edited text to the dev API with JSON headers and the fixed demo date', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(clonePayload()))
    const user = userEvent.setup()
    render(<App />)

    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.clear(textarea)
    await user.type(textarea, 'Send the revised invoice today.')
    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        braindump: 'Send the revised invoice today.',
        today: '2026-07-12',
      }),
    })
  })

  test('uses one honest loading label, disables intake, withholds results, then reveals all sections together', async () => {
    const request = deferred<Response>()
    fetchMock.mockReturnValueOnce(request.promise)
    const user = userEvent.setup()
    render(<App />)

    const submit = screen.getByRole('button', { name: 'Find My Money Moves' })
    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.click(submit)

    expect(screen.getAllByText("Finding today's Money Moves…")).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent("Finding today's Money Moves…")
    expect(submit).toBeDisabled()
    expect(textarea).toBeDisabled()
    expect(screen.queryByLabelText('Revenue plan results')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "Today's 3 Money Moves" })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Blocked → Unblock' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Parked Safely' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'All Commitments' })).not.toBeInTheDocument()
    expect(screen.queryByText(/extracting|scoring|preparing/i)).not.toBeInTheDocument()

    await act(async () => {
      request.resolve(jsonResponse(clonePayload()))
      await request.promise
    })

    const results = await screen.findByLabelText('Revenue plan results')
    expect(screen.queryByText("Finding today's Money Moves…")).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Revenue plan ready. Four result sections are now available.',
    )
    expect(submit).toBeEnabled()
    expect(textarea).toBeEnabled()
    expect(within(results).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Today's 3 Money Moves",
      'Blocked → Unblock',
      'Parked Safely',
      'All Commitments',
    ])
    expect(results.querySelectorAll(':scope > section')).toHaveLength(4)
  })

  test('rejects whitespace-only input locally and leaves the form ready to edit', async () => {
    const user = userEvent.setup()
    render(<App />)

    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.clear(textarea)
    await user.type(textarea, '   ')
    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Paste at least one commitment before asking Revenue Chief to decide.',
    )
    expect(screen.queryByText("Finding today's Money Moves…")).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find My Money Moves' })).toBeEnabled()
    expect(textarea).toBeEnabled()
  })
})

describe('Revenue Chief result rendering', () => {
  test('renders the exact ordered Money Moves with economic logic and selected drafts', async () => {
    const payload = clonePayload()
    await submitSuccessfulPayload(payload)

    const section = getResultSection("Today's 3 Money Moves")
    const cards = within(section).getAllByRole('article')
    expect(idsFrom(cards)).toEqual(MONEY_MOVE_IDS)

    for (const [index, card] of cards.entries()) {
      const id = MONEY_MOVE_IDS[index]
      const item = payload.scored.find((candidate) => candidate.id === id)
      const move = payload.plan.money_moves.find((candidate) => candidate.id === id)
      const draft = payload.drafts.find(
        (candidate) => candidate.id === id && candidate.purpose === 'money_move',
      )
      if (!item || !move || !draft) throw new Error(`Frozen fixture is missing ${id}`)

      expect(card).toHaveTextContent(item.item)
      expect(within(card).getByText(item.revenue_motion.toUpperCase())).toBeInTheDocument()
      expect(within(card).getByText(item.stated_value as string)).toHaveClass('value-chip')
      expect(card).toHaveTextContent(`Priority ${item.priority}`)
      expect(card).toHaveTextContent(`Due ${item.due_date}`)
      expect(card.querySelector('blockquote')).toHaveTextContent(`“${item.evidence}”`)
      expect(card.querySelector('blockquote')?.nextElementSibling).toHaveTextContent(item.cost_of_delay)
      expect(card).toHaveTextContent(move.why_today)
      expect(card).toHaveTextContent(move.next_action)
      expect(card).toHaveTextContent(move.done_when)
      expect(within(card).getByLabelText(`Prepared message: ${draft.subject}`)).toBeInTheDocument()
      expect(card.querySelector('pre')?.textContent).toBe(draft.body)
    }

    expect(cards[0]).toHaveTextContent('Chase Nordic Labs invoice #204')
    expect(cards[0]).toHaveTextContent('COLLECT')
    expect(cards[0]).toHaveTextContent('S$4,800')
    expect(cards[1]).toHaveTextContent('Send Acme revised annual quote')
    expect(cards[1]).toHaveTextContent('CLOSE')
    expect(cards[1]).toHaveTextContent('S$12,000/year')
    expect(cards[2]).toHaveTextContent('Send Meridian revised scope')
    expect(cards[2]).toHaveTextContent('CLOSE')
    expect(cards[2]).toHaveTextContent('S$18,000')

    const acmeDraft = within(cards[1]).getByLabelText('Prepared message: Re: Annual plan pricing')
    expect(acmeDraft).toHaveTextContent('Sarah')
    expect(acmeDraft).toHaveTextContent('S$12,000/year')
    expect(acmeDraft).toHaveTextContent('10%')
    expect(acmeDraft).toHaveTextContent('Friday')
  })

  test('renders the exact Blocked and Parked decisions in payload order without parked drafts', async () => {
    const payload = clonePayload()
    await submitSuccessfulPayload(payload)

    const blockedSection = getResultSection('Blocked → Unblock')
    const blockedCards = within(blockedSection).getAllByRole('article')
    expect(idsFrom(blockedCards)).toEqual(['i5'])
    expect(blockedSection).toHaveTextContent('Do not start the task yet.')
    expect(blockedCards[0]).toHaveTextContent('Redesign landing page after logo arrives')
    expect(blockedCards[0]).toHaveTextContent('Dave has not supplied the final logo files.')
    expect(blockedCards[0]).toHaveTextContent('Ask Dave to deliver the final logo files by 3pm today.')
    expect(
      within(blockedCards[0]).getByLabelText('Prepared message: Final logo files needed today'),
    ).toBeInTheDocument()

    const parkedSection = getResultSection('Parked Safely')
    const parkedCards = within(parkedSection).getAllByRole('article')
    expect(idsFrom(parkedCards)).toEqual(PARKED_IDS)

    for (const [index, card] of parkedCards.entries()) {
      const id = PARKED_IDS[index]
      const item = payload.scored.find((candidate) => candidate.id === id)
      const parked = payload.plan.park.find((candidate) => candidate.id === id)
      if (!item || !parked) throw new Error(`Frozen fixture is missing ${id}`)

      expect(card).toHaveTextContent(item.item)
      expect(card).toHaveTextContent(item.revenue_motion.toUpperCase())
      expect(card).toHaveTextContent(parked.why_safe)
      if (item.due_date) {
        expect(card).toHaveTextContent(`Due ${item.due_date}`)
      } else {
        expect(card).not.toHaveTextContent(/Due \d{4}-\d{2}-\d{2}/)
      }
    }

    expect(within(parkedSection).queryByRole('button', { name: /Copy draft:/ })).not.toBeInTheDocument()
    expect(within(parkedSection).queryByText(/Invoice #204 — payment timing/)).not.toBeInTheDocument()
  })

  test('preserves the frozen commitment order and compact metadata for every extracted item', async () => {
    const payload = clonePayload()
    await submitSuccessfulPayload(payload)

    const list = screen.getByTestId('commitment-list')
    const rows = within(list).getAllByRole('listitem')
    expect(idsFrom(rows)).toEqual(COMMITMENT_IDS)
    expect(rows).toHaveLength(9)

    for (const [index, row] of rows.entries()) {
      const item = payload.scored[index]
      expect(item.id).toBe(COMMITMENT_IDS[index])
      expect(row).toHaveTextContent(String(index + 1).padStart(2, '0'))
      expect(row).toHaveTextContent(item.item)
      expect(row).toHaveTextContent(item.revenue_motion.toUpperCase())
      expect(row).toHaveTextContent(item.stated_value ?? '—')
      expect(row).toHaveTextContent(`P${item.priority}`)
      expect(row).toHaveTextContent(item.due_date ? `Due ${item.due_date}` : 'No due date')
    }

    expect(rows[0]).toHaveTextContent('Email Owed')
    expect(rows[3]).toHaveTextContent('Task')
    expect(rows[4]).toHaveTextContent('Deadline')
  })

  test('shows only the one selected open question and excludes podcast and recruiter drafts', async () => {
    await submitSuccessfulPayload()

    const moneySection = getResultSection("Today's 3 Money Moves")
    expect(within(moneySection).getAllByText('Open question')).toHaveLength(1)
    expect(moneySection).toHaveTextContent("The Meridian contact's name is not stated.")

    const preparedMessages = screen.getAllByLabelText(/^Prepared message:/)
    expect(preparedMessages).toHaveLength(4)
    expect(preparedMessages.map((message) => message.getAttribute('aria-label'))).toEqual([
      'Prepared message: Invoice #204 — payment timing',
      'Prepared message: Re: Annual plan pricing',
      'Prepared message: Re: Revised Meridian scope',
      'Prepared message: Final logo files needed today',
    ])
    expect(preparedMessages.every((message) => !/podcast|recruiter/i.test(message.textContent ?? ''))).toBe(
      true,
    )
  })

  test('omits nullable Money Move metadata and a null missing fact without inventing placeholders', async () => {
    const payload = clonePayload()
    const extracted = payload.items.find((item) => item.id === 'i3')
    const scored = payload.scored.find((item) => item.id === 'i3')
    if (!extracted || !scored) throw new Error('Frozen fixture is missing i3')
    extracted.stated_value = null
    extracted.due_date = null
    scored.stated_value = null
    scored.due_date = null
    scored.missing_fact = null

    await submitSuccessfulPayload(payload)

    const card = within(getResultSection("Today's 3 Money Moves")).getAllByRole('article')[0]
    const metadata = card.querySelector('.meta-row')
    expect(metadata).not.toBeNull()
    expect(metadata?.querySelector('.value-chip')).toBeNull()
    expect(metadata).not.toHaveTextContent('Due')
    expect(metadata).toHaveTextContent('Priority 20')
    expect(within(card).queryByText('Open question')).not.toBeInTheDocument()
  })

  test('does not attach an unblock draft when the plan says no message is needed', async () => {
    const payload = clonePayload()
    payload.plan.blocked[0].message_needed = false
    payload.drafts = payload.drafts.filter((draft) => draft.id !== 'i5')

    await submitSuccessfulPayload(payload)

    const blockedSection = getResultSection('Blocked → Unblock')
    expect(blockedSection).toHaveTextContent('Ask Dave to deliver the final logo files by 3pm today.')
    expect(
      within(blockedSection).queryByLabelText('Prepared message: Final logo files needed today'),
    ).not.toBeInTheDocument()
    expect(within(blockedSection).queryByRole('button', { name: /Copy draft:/ })).not.toBeInTheDocument()
  })

  test('renders stable, explicit empty states for every valid empty response section', async () => {
    const emptyPayload: ProcessResponse = {
      items: [],
      scored: [],
      plan: { money_moves: [], park: [], blocked: [] },
      drafts: [],
    }
    await submitSuccessfulPayload(emptyPayload)

    expect(screen.getByRole('heading', { name: "Today's 3 Money Moves" })).toBeInTheDocument()
    expect(screen.getByText('No Money Moves were returned for this pass.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Blocked → Unblock' })).toBeInTheDocument()
    expect(screen.getByText('Nothing is blocked. Every selected commitment can move.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parked Safely' })).toBeInTheDocument()
    expect(screen.getByText('Nothing was parked in this pass.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All Commitments' })).toBeInTheDocument()
    expect(screen.getByText('No commitments were extracted from this brain-dump.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('draft clipboard behavior', () => {
  test('copies a complete subject and body and announces success', async () => {
    const payload = clonePayload()
    const user = await submitSuccessfulPayload(payload)
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    const draft = payload.drafts.find((candidate) => candidate.id === 'i1')
    if (!draft) throw new Error('Frozen fixture is missing the Acme draft')

    const copyButton = screen.getByRole('button', { name: `Copy draft: ${draft.subject}` })
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(`Subject: ${draft.subject}\n\n${draft.body}`)
    expect(copyButton).toHaveTextContent('Copied')
    expect(screen.getByText('Subject and message copied.')).toHaveAttribute('role', 'status')
  })

  test('keeps the draft selectable and announces a clipboard failure', async () => {
    const payload = clonePayload()
    const user = await submitSuccessfulPayload(payload)
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    installClipboard(writeText)
    const draft = payload.drafts.find((candidate) => candidate.id === 'i5')
    if (!draft) throw new Error('Frozen fixture is missing the unblock draft')

    const copyButton = screen.getByRole('button', { name: `Copy draft: ${draft.subject}` })
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(copyButton).toHaveTextContent('Copy')
    expect(screen.getByText('Copy failed — select the message above.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText(`Prepared message: ${draft.subject}`).querySelector('pre')?.textContent).toBe(
      draft.body,
    )
  })
})

describe('recoverable request failures', () => {
  test('recovers from a network failure and retries the same submission', async () => {
    await expectFailureThenRetry(() => {
      fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    }, "We couldn't reach Revenue Chief. Check the connection and try again.")

    const firstBody = fetchMock.mock.calls[0][1]?.body
    const secondBody = fetchMock.mock.calls[1][1]?.body
    expect(secondBody).toBe(firstBody)
  })

  test('surfaces a non-OK API detail and successfully retries', async () => {
    await expectFailureThenRetry(() => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'model unavailable' }, 503))
    }, "Revenue Chief couldn't finish this pass: model unavailable")
  })

  test('rejects a malformed success payload and successfully retries', async () => {
    await expectFailureThenRetry(() => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          items: [],
          scored: [],
          plan: { money_moves: [], park: [] },
          drafts: [],
        }),
      )
    }, 'Revenue Chief returned an incomplete plan. Please try again.')
  })
})
