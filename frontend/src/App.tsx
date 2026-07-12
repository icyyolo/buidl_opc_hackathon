import { useState, type FormEvent } from 'react'
import { requestMoneyMoves } from './api'
import { Results } from './components/Results'
import { SAMPLE_BRAINDUMP } from './sampleBraindump'
import type { ProcessResponse } from './types'

type ViewState = 'idle' | 'loading' | 'success' | 'error'

function IntroPlaceholder() {
  return (
    <section className="intro-placeholder" aria-label="What Revenue Radar returns">
      <p className="eyebrow">One input. One economic decision.</p>
      <div className="intro-steps">
        <article>
          <span>01</span>
          <h2>Find the cash line</h2>
          <p>Separate collect, close, deliver, retain, grow, and operate work.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Make the trade-off visible</h2>
          <p>See source evidence, urgency, revenue proximity, and cost of waiting.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Leave ready to act</h2>
          <p>Get one next action, one finish line, and only the messages that matter.</p>
        </article>
      </div>
    </section>
  )
}

function LoadingPanel() {
  return (
    <section className="loading-panel" aria-label="Revenue plan loading">
      <div className="radar-loader" aria-hidden="true">
        <span className="radar-sweep" />
        <span className="radar-blip radar-blip-one" />
        <span className="radar-blip radar-blip-two" />
        <span className="radar-blip radar-blip-three" />
      </div>
      <div className="loading-panel-copy">
        <p className="eyebrow">Revenue scan in progress</p>
        <h2>Mapping the shortest path to cash.</h2>
        <p className="loading-status" role="status" aria-live="polite" aria-atomic="true">
          Finding today's Money Moves…
        </p>
        <p className="loading-note">
          One complete, evidence-backed plan will appear here when the analysis is ready.
        </p>
      </div>
    </section>
  )
}

export default function App() {
  const [braindump, setBraindump] = useState(SAMPLE_BRAINDUMP)
  const [viewState, setViewState] = useState<ViewState>('idle')
  const [data, setData] = useState<ProcessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!braindump.trim()) {
      setData(null)
      setError('Paste at least one commitment before asking Revenue Radar to decide.')
      setViewState('error')
      return
    }

    setViewState('loading')
    setData(null)
    setError(null)

    try {
      const response = await requestMoneyMoves(braindump)
      setData(response)
      setViewState('success')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Revenue Radar couldn't finish this pass. Please try again.",
      )
      setViewState('error')
    }
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Revenue Radar home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            Revenue <strong>Radar</strong>
          </span>
        </a>
        <p>Explainable revenue triage for one-person companies</p>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Your 9am operating brief</p>
            <h1>
              Your business, ranked by <em>revenue</em> — not noise.
            </h1>
            <p className="hero-lede">
              Paste the messy list. Revenue Radar finds the three commitments that move cash,
              explains the economic logic, and prepares the messages to act.
            </p>
            <div className="proof-strip" aria-label="How Revenue Radar decides">
              <span>Revenue × 3</span>
              <span>Grounded evidence</span>
              <span>Zero setup</span>
            </div>
          </div>

          <form className="intake-card" onSubmit={handleSubmit} aria-busy={viewState === 'loading'}>
            <div className="intake-heading">
              <div>
                <p className="eyebrow">Founder brain-dump</p>
                <h2>What is competing for your attention?</h2>
              </div>
              <span className="sample-label">Demo sample loaded</span>
            </div>
            <label className="sr-only" htmlFor="braindump">
              Founder brain-dump
            </label>
            <textarea
              id="braindump"
              name="braindump"
              value={braindump}
              onChange={(event) => setBraindump(event.target.value)}
              rows={15}
              spellCheck="true"
              aria-describedby="brain-help brain-count"
              disabled={viewState === 'loading'}
            />
            <div className="intake-footer">
              <div>
                <p id="brain-help">Edit the sample or paste your own tasks, messages, and deadlines.</p>
                <span id="brain-count">{braindump.length.toLocaleString()} characters</span>
              </div>
              <button
                className="primary-button"
                type="submit"
                disabled={viewState === 'loading'}
                aria-label="Find My Money Moves"
              >
                <span>Find My Money Moves</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>

            {viewState === 'error' && error && (
              <div className="error-state" role="alert">
                <strong>We could not build this revenue plan.</strong>
                <span>{error}</span>
              </div>
            )}
          </form>
        </section>

        {viewState === 'success' && data ? (
          <>
            <p className="sr-only" role="status" aria-live="polite">
              Revenue plan ready. Four result sections are now available.
            </p>
            <Results data={data} />
          </>
        ) : viewState === 'loading' ? (
          <LoadingPanel />
        ) : viewState === 'idle' ? (
          <IntroPlaceholder />
        ) : null}
      </main>

      <footer>
        <p>Revenue Radar</p>
        <span>Paste → inspect the logic → act.</span>
      </footer>
    </div>
  )
}
