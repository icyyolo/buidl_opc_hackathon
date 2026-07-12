import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { requestMoneyMoves } from '../api'
import type { ProcessResponse, RevenueMotion, ScoredItem } from '../types'
import baseCss from '../styles.css?raw'
import indexHtml from '../../index.html?raw'
import frozenProcessPayload from '../../../mock/process.json'
import { CashLeakRadar } from './CashLeakRadar'
import { DraftCard } from './DraftCard'
import { Results } from './Results'
import insightsCss from './revenue-insights.css?raw'

vi.mock('../api', () => ({
  requestMoneyMoves: vi.fn(),
}))

const requestMoneyMovesMock = vi.mocked(requestMoneyMoves)
const MOTIONS: RevenueMotion[] = ['collect', 'close', 'deliver', 'retain', 'grow', 'operate']
const EMPTY_RESPONSE: ProcessResponse = {
  items: [],
  scored: [],
  plan: { money_moves: [], park: [], blocked: [] },
  drafts: [],
}

let originalScrollIntoView: PropertyDescriptor | undefined

function clonePayload(): ProcessResponse {
  return structuredClone(frozenProcessPayload) as ProcessResponse
}

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

function installScrollIntoView() {
  const scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  return scrollIntoView
}

function installMotionPreference(matches: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

function cssRule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`Missing CSS rule: ${selector}`)
  const end = source.indexOf('}', start)
  return source.slice(start, end + 1)
}

function cssHexProperty(rule: string, property: string): string {
  const value = rule.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`Missing ${property} hex value in ${rule}`)
  return value
}

function cssHexToken(source: string, token: string): string {
  const value = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`Missing CSS token: ${token}`)
  return value
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      )
    if (!channels) throw new Error(`Invalid color: ${hex}`)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function scoredItem(motion: RevenueMotion, index: number): ScoredItem {
  return {
    id: `motion-${motion}`,
    item: `${motion} commitment`,
    type: 'task',
    due_date: null,
    stated_value: null,
    source_text: `${motion} source`,
    context: `${motion} context`,
    revenue_motion: motion,
    revenue_proximity: 1,
    urgency: 1,
    evidence: `${motion} evidence`,
    cost_of_delay: `${motion} assessment`,
    missing_fact: null,
    priority: 4 + index,
  }
}

function allMotionResponse(): ProcessResponse {
  const scored = MOTIONS.map(scoredItem)
  return {
    items: scored,
    scored,
    plan: {
      money_moves: scored.map((item) => ({
        id: item.id,
        why_today: `${item.revenue_motion} why`,
        next_action: `${item.revenue_motion} next`,
        done_when: `${item.revenue_motion} done`,
      })),
      park: [],
      blocked: [],
    },
    drafts: [],
  }
}

beforeEach(() => {
  requestMoneyMovesMock.mockReset()
  originalScrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
  delete document.documentElement.dataset.theme
  try {
    window.localStorage.clear()
  } catch {
    // Ignore storage failures in restricted environments.
  }
})

describe('Cash Leak Radar proportions', () => {
  test('encodes motion counts only and preserves exact stated values', () => {
    const payload = clonePayload()
    render(<CashLeakRadar items={payload.scored} />)

    const expected: Array<[string, number, string]> = [
      ['Collect', 1, '33.33333333333333%'],
      ['Close', 2, '66.66666666666666%'],
      ['Deliver', 0, '0%'],
      ['Retain', 0, '0%'],
      ['Grow', 3, '100%'],
      ['Operate', 3, '100%'],
    ]

    for (const [label, count, proportion] of expected) {
      const group = screen.getByRole('group', {
        name: `${label}: ${count} ${count === 1 ? 'commitment' : 'commitments'}`,
      })
      const bar = within(group).getByRole('img', {
        name: `${count} of 3 commitments`,
      })
      const fill = bar.querySelector<HTMLElement>('.motion-count-fill')
      expect(fill?.style.getPropertyValue('--motion-count-proportion')).toBe(proportion)
    }

    expect(screen.getByText('S$4,800')).toBeInTheDocument()
    expect(screen.getByText('S$12,000/year')).toBeInTheDocument()
    expect(screen.getByText('S$18,000')).toBeInTheDocument()
    expect(screen.queryByText('S$34,800')).not.toBeInTheDocument()
  })

  test('renders a zero-width count bar for every empty motion', () => {
    render(<CashLeakRadar items={[]} />)

    for (const label of ['Collect', 'Close', 'Deliver', 'Retain', 'Grow', 'Operate']) {
      const group = screen.getByRole('group', { name: `${label}: 0 commitments` })
      const bar = within(group).getByRole('img', { name: '0 of 0 commitments' })
      expect(
        bar
          .querySelector<HTMLElement>('.motion-count-fill')
          ?.style.getPropertyValue('--motion-count-proportion'),
      ).toBe('0%')
      expect(within(group).getByText('No commitments in this motion.')).toBeInTheDocument()
    }
  })
})

describe('motion palette and entrance mapping', () => {
  test('maps all six motions across card edges, badges, radar, and shared CSS tokens', () => {
    render(<Results data={allMotionResponse()} />)
    const moneySection = screen.getByRole('heading', { name: "Today's 3 Money Moves" }).closest('section')
    if (!(moneySection instanceof HTMLElement)) throw new Error('Money Move section is missing')

    for (const motion of MOTIONS) {
      const card = moneySection.querySelector<HTMLElement>(`[data-commitment-id="motion-${motion}"]`)
      expect(card).toHaveClass(`motion-edge-${motion}`)
      expect(card?.querySelector('.motion-badge')).toHaveClass(`motion-${motion}`)

      const radarGroup = screen.getByRole('group', { name: new RegExp(`^${motion}:`, 'i') })
      expect(radarGroup).toHaveClass(`radar-motion-${motion}`)
      expect(within(radarGroup).getByRole('img')).toHaveClass(`motion-count-${motion}`)

      expect(insightsCss).toContain(`--motion-${motion}:`)
      expect(insightsCss).toMatch(
        new RegExp(
          `\\.money-card\\.motion-edge-${motion},[\\s\\S]*?\\.motion-badge\\.motion-${motion},[\\s\\S]*?\\.radar-motion-card\\.radar-motion-${motion}\\s*\\{\\s*--motion-accent: var\\(--motion-${motion}\\);`,
        ),
      )
    }

    expect(insightsCss).toMatch(
      /\.money-card\[class\*="motion-edge-"\]\s*\{\s*border-top-color: var\(--motion-accent\)/,
    )
    expect(insightsCss).toMatch(
      /\.motion-badge\[class\*="motion-"\]\s*\{\s*border: 1px solid var\(--motion-accent\)/,
    )
    expect(insightsCss).toMatch(
      /\.radar-motion-card\s*\{[\s\S]*?border-top: 4px solid var\(--motion-accent\)/,
    )
    expect(insightsCss).toMatch(
      /\.motion-count-fill\s*\{[\s\S]*?background: var\(--motion-accent\)/,
    )
  })

  test('assigns the six reveal stages and fully disables them for reduced motion', () => {
    render(<Results data={clonePayload()} />)

    expect(screen.getByRole('region', { name: 'Complete accounting' })).toHaveClass('plan-reveal-1')
    expect(screen.getByRole('region', { name: 'Cash Leak Radar' })).toHaveClass('plan-reveal-2')
    const resultSections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.closest('section'))
    resultSections.forEach((section, index) => {
      expect(section).toHaveClass(`plan-reveal-${index + 3}`)
    })

    expect(insightsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.plan-reveal[\s\S]*?animation: none !important/,
    )
    const expectedDelays = [0, 60, 120, 180, 240, 300]
    expectedDelays.forEach((delay, index) => {
      expect(insightsCss).toMatch(
        new RegExp(`\\.plan-reveal-${index + 1}\\s*\\{\\s*animation-delay: ${delay}ms;`),
      )
    })
    const duration = 180
    expect(insightsCss).toContain(`animation: plan-reveal-in ${duration}ms`)
    expect(duration + Math.max(...expectedDelays)).toBeLessThanOrEqual(500)
    expect(insightsCss).toMatch(
      /@keyframes plan-reveal-in\s*\{[\s\S]*?from\s*\{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(8px\);[\s\S]*?to\s*\{[\s\S]*?opacity: 1;[\s\S]*?transform: translateY\(0\)/,
    )
  })
})

describe('draft copy confirmation', () => {
  test('shows Copied ✓ briefly, reverts the button, and keeps the status message', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    render(
      <DraftCard
        draft={{ id: 'd1', purpose: 'money_move', subject: 'Review me', body: 'Draft body' }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy draft: Review me' })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(button).toHaveTextContent('Copied ✓')
    expect(screen.getByText('Subject and message copied.')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1499))
    expect(button).toHaveTextContent('Copied ✓')
    act(() => vi.advanceTimersByTime(1))
    expect(button).toHaveTextContent('Copy')
    expect(screen.getByText('Subject and message copied.')).toBeInTheDocument()
  })

  test('restarts the 1.5 second confirmation after every successful copy', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    render(
      <DraftCard
        draft={{ id: 'd1', purpose: 'money_move', subject: 'Review me', body: 'Draft body' }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy draft: Review me' })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(1000))
    const firstAnnouncement = screen.getByRole('status')
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(screen.getByRole('status')).not.toBe(firstAnnouncement)

    act(() => vi.advanceTimersByTime(500))
    expect(button).toHaveTextContent('Copied ✓')
    act(() => vi.advanceTimersByTime(999))
    expect(button).toHaveTextContent('Copied ✓')
    act(() => vi.advanceTimersByTime(1))
    expect(button).toHaveTextContent('Copy')
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  test('ignores an older clipboard result that settles after the latest attempt', async () => {
    let rejectOlder!: (reason: Error) => void
    let resolveLatest!: () => void
    const olderAttempt = new Promise<void>((_resolve, reject) => {
      rejectOlder = reject
    })
    const latestAttempt = new Promise<void>((resolve) => {
      resolveLatest = resolve
    })
    const writeText = vi
      .fn()
      .mockReturnValueOnce(olderAttempt)
      .mockReturnValueOnce(latestAttempt)
    installClipboard(writeText)
    render(
      <DraftCard
        draft={{ id: 'd1', purpose: 'money_move', subject: 'Review me', body: 'Draft body' }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy draft: Review me' })
    fireEvent.click(button)
    fireEvent.click(button)

    await act(async () => {
      resolveLatest()
      await latestAttempt
    })
    expect(button).toHaveTextContent('Copied ✓')
    expect(screen.getByText('Subject and message copied.')).toBeInTheDocument()

    await act(async () => {
      rejectOlder(new Error('older copy failed'))
      await olderAttempt.catch(() => undefined)
    })
    expect(button).toHaveTextContent('Copied ✓')
    expect(screen.queryByText('Copy failed — select the message above.')).not.toBeInTheDocument()
  })
})

describe('intake affordances', () => {
  test('clears the textarea without sending a request or imposing a hard maximum', async () => {
    const user = userEvent.setup()
    render(<App />)

    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    expect(textarea).not.toHaveAttribute('maxlength')
    expect(screen.getByText(/950 characters · Ready to scan\./)).toHaveClass(
      'character-count-neutral',
    )
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(textarea).toHaveValue('')
    expect(screen.queryByText('Demo sample loaded')).not.toBeInTheDocument()
    expect(requestMoneyMovesMock).not.toHaveBeenCalled()
    expect(screen.getByText(/0 characters · Start with one commitment\./)).toHaveClass(
      'character-count-short',
    )
  })

  test('clears completed results and returns to the empty idle state without another request', async () => {
    requestMoneyMovesMock.mockResolvedValueOnce(EMPTY_RESPONSE)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))
    expect(await screen.findByLabelText('Revenue plan results')).toBeInTheDocument()
    expect(requestMoneyMovesMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByLabelText('Revenue plan results')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Founder brain-dump' })).toHaveValue('')
    expect(screen.getByRole('region', { name: 'What Revenue Radar returns' })).toBeInTheDocument()
    expect(requestMoneyMovesMock).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
  ])('%s+Enter submits through the same request path', async (_label, modifier) => {
    requestMoneyMovesMock.mockResolvedValueOnce(EMPTY_RESPONSE)
    const user = userEvent.setup()
    render(<App />)
    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.clear(textarea)
    await user.type(textarea, 'Follow up on the overdue invoice.')

    fireEvent.keyDown(textarea, { key: 'Enter', ...modifier })

    await waitFor(() => expect(requestMoneyMovesMock).toHaveBeenCalledTimes(1))
    expect(requestMoneyMovesMock).toHaveBeenCalledWith('Follow up on the overdue invoice.')
    expect(await screen.findByLabelText('Revenue plan results')).toBeInTheDocument()
  })

  test('keeps plain Enter as a textarea newline without submitting', async () => {
    const user = userEvent.setup()
    render(<App />)
    const textarea = screen.getByRole('textbox', { name: 'Founder brain-dump' })
    await user.clear(textarea)
    await user.type(textarea, 'First commitment{enter}Second commitment')

    expect(textarea).toHaveValue('First commitment\nSecond commitment')
    expect(requestMoneyMovesMock).not.toHaveBeenCalled()
  })
})

describe('successful-run handoff', () => {
  test.each([
    ['smooth', false, 'smooth'],
    ['reduced', true, 'auto'],
  ])('focuses the plan and uses %s scrolling', async (_label, reducedMotion, behavior) => {
    const scrollIntoView = installScrollIntoView()
    const matchMedia = installMotionPreference(reducedMotion)
    requestMoneyMovesMock.mockResolvedValueOnce(EMPTY_RESPONSE)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Find My Money Moves' }))
    const results = await screen.findByLabelText('Revenue plan results')
    const heading = screen.getByRole('heading', { name: 'Revenue plan results' })

    await waitFor(() => expect(heading).toHaveFocus())
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(heading.closest('.complete-accounting')).toBe(results.firstElementChild?.firstElementChild)
    expect(results).toHaveAttribute('aria-labelledby', heading.id)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'start' })
    expect(scrollIntoView.mock.contexts[0]).toBe(results)
  })
})

describe('theme, print, focus, and product-name guards', () => {
  test('ships dark, print, focus, and paired theme-color rules', () => {
    const darkCss = insightsCss.slice(
      insightsCss.indexOf(':root[data-theme="dark"]'),
      insightsCss.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    const printCss = baseCss.slice(baseCss.indexOf('@media print'))

    expect(darkCss).toContain('color-scheme: dark')
    expect(darkCss).toContain('--ink: #eff4ef')
    expect(darkCss).toMatch(
      /\.radar-motion-card\[class\*="radar-motion-"\]\s*\{\s*border-top-color: var\(--motion-accent\)/,
    )
    expect(darkCss).toMatch(
      /\.clear-button:hover:not\(:disabled\),\s*\[data-theme="dark"\] \.copy-button:hover\s*\{[\s\S]*?color: var\(--green-2\)/,
    )
    expect(darkCss).toMatch(/\.commitment-rank,[\s\S]*?color: var\(--muted\)/)
    expect(darkCss).toMatch(/\.meta-row \.value-chip,[\s\S]*?color: var\(--positive-ink\)/)
    expect(darkCss).toMatch(/\.meta-row \.priority-chip,[\s\S]*?color: var\(--priority-ink\)/)
    expect(darkCss).toMatch(/\.decision-receipt blockquote,[\s\S]*?color: var\(--ink\)/)

    const darkContrastPairs = [
      [cssHexToken(darkCss, '--positive-ink'), cssHexToken(darkCss, '--positive-bg')],
      [cssHexToken(darkCss, '--priority-ink'), cssHexToken(darkCss, '--priority-bg')],
      [cssHexToken(darkCss, '--ink'), cssHexToken(darkCss, '--dark-soft')],
      ...MOTIONS.map((motion) => {
        const badgeRule = cssRule(baseCss, `.motion-${motion}`)
        return [cssHexProperty(badgeRule, 'color'), cssHexProperty(badgeRule, 'background')]
      }),
    ]
    darkContrastPairs.forEach(([foreground, background]) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
    })

    const radarTrack = cssHexProperty(cssRule(insightsCss, '.motion-count-bar'), 'background')
    MOTIONS.map((motion) => cssHexToken(insightsCss, `--motion-${motion}`)).forEach((accent) =>
      expect(contrastRatio(accent, radarTrack)).toBeGreaterThanOrEqual(3),
    )

    expect(printCss).toContain('size: A4 landscape')
    const hiddenPrintRule = printCss.slice(
      printCss.indexOf('.topbar,'),
      printCss.indexOf('display: none !important;') + 'display: none !important;'.length,
    )
    ;[
      '.topbar',
      '.hero',
      '.intake-card',
      '.loading-panel',
      '.intro-placeholder',
      '.intro-steps',
      'footer',
    ].forEach((selector) => expect(hiddenPrintRule).toContain(selector))
    expect(printCss).toMatch(/\.money-section,\s*\.blocked-section\s*\{\s*display: block !important/)
    expect(printCss).toMatch(/\.cash-leak-radar,[\s\S]*?\.commitments-section,[\s\S]*?display: none !important/)
    expect(printCss).not.toContain('.decision-list > div:not(.action-callout)')
    expect(printCss).toMatch(
      /\.money-card:last-child\s*\{\s*grid-column: auto !important;\s*max-width: none !important/,
    )
    expect(printCss).not.toMatch(/\.results\s*\{[^}]*zoom:/)
    expect(printCss).toMatch(/\.results,\s*\.results \*\s*\{\s*color: #000 !important/)
    expect(printCss).toMatch(
      /\.results \*\s*\{\s*background-color: #fff !important;\s*background-image: none !important/,
    )
    expect(baseCss).toContain('--focus-ring: #4b9061')
    expect(baseCss).toContain('outline: 3px solid var(--focus-ring)')
    const focusRing = cssHexToken(baseCss, '--focus-ring')
    expect(contrastRatio(focusRing, cssHexProperty(cssRule(baseCss, ':root'), 'background'))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(focusRing, cssHexProperty(cssRule(darkCss, ':root[data-theme="dark"]'), 'background'))).toBeGreaterThanOrEqual(3)
    expect(indexHtml).toMatch(
      /<meta name="theme-color" content="#f3f0e8" media="\(prefers-color-scheme: light\)" \/>/,
    )
    expect(indexHtml).toMatch(
      /<meta name="theme-color" content="#0f1511" media="\(prefers-color-scheme: dark\)" \/>/,
    )
  })

  test('renders the consistent Revenue Radar product name', () => {
    render(<App />)

    expect(screen.queryByText(/Revenue Chief/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Revenue Radar proves what matters from your own words, parks the safe work, unblocks what is stuck, and prepares only the messages needed to act.',
      ),
    ).toBeInTheDocument()
  })
})

describe('theme toggle', () => {
  test('flips data-theme both ways, persists the choice, and stays accessible', async () => {
    installMotionPreference(false)
    const user = userEvent.setup()
    render(<App />)

    const toDark = screen.getByRole('button', { name: 'Switch to dark mode' })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(toDark).toHaveAttribute('aria-pressed', 'false')

    await user.click(toDark)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('revenue-radar-theme')).toBe('dark')

    const toLight = screen.getByRole('button', { name: 'Switch to light mode' })
    expect(toLight).toHaveAttribute('aria-pressed', 'true')
    await user.click(toLight)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('revenue-radar-theme')).toBe('light')
  })

  test('adopts the theme the no-flash script already resolved on the document', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<App />)

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
