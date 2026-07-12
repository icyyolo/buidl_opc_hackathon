import { useMemo } from 'react'
import type {
  BlockedItem,
  Draft,
  MoneyMove,
  ParkItem,
  ProcessResponse,
  RevenueMotion,
  ScoredItem,
} from '../types'
import { CashLeakRadar } from './CashLeakRadar'
import { DecisionReceipt } from './DecisionReceipt'
import { DraftCard } from './DraftCard'
import './revenue-insights.css'

interface ResultsProps {
  data: ProcessResponse
}

function titleCaseToken(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function MotionBadge({ motion }: { motion: RevenueMotion }) {
  return <span className={`motion-badge motion-${motion}`}>{motion.toUpperCase()}</span>
}

function SectionHeading({
  id,
  kicker,
  title,
  description,
}: {
  id: string
  kicker: string
  title: string
  description: string
}) {
  return (
    <header className="section-heading">
      <p className="eyebrow">{kicker}</p>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  )
}

function CompleteAccounting({ data }: { data: ProcessResponse }) {
  const moneyMoveCount = data.plan.money_moves.length
  const blockedCount = data.plan.blocked.length
  const parkedCount = data.plan.park.length
  const accountedCount = moneyMoveCount + blockedCount + parkedCount

  return (
    <div className="complete-accounting" role="region" aria-label="Complete accounting">
      <p className="eyebrow">Complete plan accounting</p>
      <p className="accounting-summary">
        <strong>
          {moneyMoveCount} Money {moneyMoveCount === 1 ? 'Move' : 'Moves'}
        </strong>{' '}
        · {blockedCount} blocked · {parkedCount} safely parked · {accountedCount}{' '}
        {accountedCount === 1 ? 'commitment' : 'commitments'} accounted for
      </p>
    </div>
  )
}

function MoneyMoveCard({
  move,
  item,
  draft,
  position,
}: {
  move: MoneyMove
  item: ScoredItem
  draft?: Draft
  position: number
}) {
  return (
    <article className={`money-card motion-edge-${item.revenue_motion}`} data-commitment-id={item.id}>
      <div className="money-card-topline">
        <span className="move-number" aria-label={`Money Move ${position}`}>
          {String(position).padStart(2, '0')}
        </span>
        {item.due_date && <span className="money-card-due">Due {item.due_date}</span>}
      </div>

      <h3>{item.item}</h3>
      <DecisionReceipt item={item} />

      <dl className="decision-list">
        <div>
          <dt>Why today</dt>
          <dd>{move.why_today}</dd>
        </div>
        <div className="action-callout">
          <dt>Next action</dt>
          <dd>{move.next_action}</dd>
        </div>
        <div>
          <dt>Done when</dt>
          <dd>{move.done_when}</dd>
        </div>
      </dl>

      {draft?.purpose === 'money_move' && <DraftCard draft={draft} />}
    </article>
  )
}

function BlockedCard({
  item,
  blocked,
  draft,
}: {
  item: ScoredItem
  blocked: BlockedItem
  draft?: Draft
}) {
  return (
    <article className="blocked-card" data-commitment-id={item.id}>
      <div className="blocked-summary">
        <div className="blocked-title-row">
          <span className="blocked-mark" aria-hidden="true">
            ↗
          </span>
          <div>
            <p className="eyebrow">Waiting on an input</p>
            <h3>{item.item}</h3>
          </div>
        </div>
        <div className="blocked-meta-row" aria-label="Blocked commitment details">
          <MotionBadge motion={item.revenue_motion} />
          <span className="priority-chip">Priority {item.priority}</span>
        </div>
        <div className="blocked-evidence">
          <p className="micro-label">Verbatim evidence</p>
          <blockquote>“{item.evidence}”</blockquote>
        </div>
        <dl className="blocked-details">
          <div>
            <dt>Blocked on</dt>
            <dd>{blocked.blocker}</dd>
          </div>
          <div>
            <dt>Your unblock move</dt>
            <dd>{blocked.unblock_action}</dd>
          </div>
        </dl>
      </div>
      {blocked.message_needed && draft?.purpose === 'unblock' && <DraftCard draft={draft} />}
    </article>
  )
}

function ParkedCard({ item, parked }: { item: ScoredItem; parked: ParkItem }) {
  return (
    <article className="parked-card" data-commitment-id={item.id}>
      <div className="parked-card-topline">
        <MotionBadge motion={item.revenue_motion} />
        {item.due_date && <span>Due {item.due_date}</span>}
      </div>
      <h3>{item.item}</h3>
      <div className="parked-meta-row" aria-label="Parked commitment details">
        <span className="priority-chip">Priority {item.priority}</span>
        {item.stated_value !== null && <span className="value-chip">{item.stated_value}</span>}
      </div>
      <div className="parked-evidence">
        <p className="micro-label">Verbatim evidence</p>
        <blockquote>“{item.evidence}”</blockquote>
      </div>
      <div className="why-safe-panel">
        <p className="micro-label">Why this is safe to park</p>
        <p>{parked.why_safe}</p>
      </div>
    </article>
  )
}

export function Results({ data }: ResultsProps) {
  const { scoredById, draftByTarget } = useMemo(() => {
    return {
      scoredById: new Map(data.scored.map((item) => [item.id, item])),
      draftByTarget: new Map(
        data.drafts.map((draft) => [`${draft.id}:${draft.purpose}`, draft]),
      ),
    }
  }, [data])

  return (
    <div className="results" role="region" aria-label="Revenue plan results">
      <div className="results-overview">
        <CompleteAccounting data={data} />
        <CashLeakRadar items={data.scored} />
      </div>

      <section className="result-section money-section" aria-labelledby="money-moves-heading">
        <SectionHeading
          id="money-moves-heading"
          kicker="Decide"
          title="Today's 3 Money Moves"
          description="The commitments with the shortest, strongest path to cash — in the order to act."
        />
        {data.plan.money_moves.length > 0 ? (
          <div className="money-grid" data-testid="money-move-list">
            {data.plan.money_moves.map((move, index) => {
              const item = scoredById.get(move.id)
              if (!item) return null
              return (
                <MoneyMoveCard
                  key={move.id}
                  move={move}
                  item={item}
                  draft={draftByTarget.get(`${move.id}:money_move`)}
                  position={index + 1}
                />
              )
            })}
          </div>
        ) : (
          <p className="empty-section">No Money Moves were returned for this pass.</p>
        )}
      </section>

      <section className="result-section" aria-labelledby="blocked-heading">
        <SectionHeading
          id="blocked-heading"
          kicker="Unstick"
          title="Blocked → Unblock"
          description="Do not start the task yet. Move the dependency that is holding it back."
        />
        {data.plan.blocked.length > 0 ? (
          <div className="blocked-list">
            {data.plan.blocked.map((blocked) => {
              const item = scoredById.get(blocked.id)
              if (!item) return null
              return (
                <BlockedCard
                  key={blocked.id}
                  item={item}
                  blocked={blocked}
                  draft={draftByTarget.get(`${blocked.id}:unblock`)}
                />
              )
            })}
          </div>
        ) : (
          <p className="empty-section">Nothing is blocked. Every selected commitment can move.</p>
        )}
      </section>

      <section className="result-section" aria-labelledby="parked-heading">
        <SectionHeading
          id="parked-heading"
          kicker="Protect focus"
          title="Parked Safely"
          description="Deliberate not-today decisions, with the reason waiting is economically safe."
        />
        {data.plan.park.length > 0 ? (
          <div className="parked-grid">
            {data.plan.park.map((parked) => {
              const item = scoredById.get(parked.id)
              if (!item) return null
              return <ParkedCard key={parked.id} item={item} parked={parked} />
            })}
          </div>
        ) : (
          <p className="empty-section">Nothing was parked in this pass.</p>
        )}
      </section>

      <section className="result-section commitments-section" aria-labelledby="commitments-heading">
        <SectionHeading
          id="commitments-heading"
          kicker="Audit the decision"
          title="All Commitments"
          description="Every extracted obligation, preserved in the revenue-first order returned by the backend."
        />
        {data.scored.length > 0 ? (
          <ol className="commitment-list" data-testid="commitment-list">
            {data.scored.map((item, index) => (
              <li key={item.id} data-commitment-id={item.id}>
                <span className="commitment-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="commitment-name">
                  <strong>{item.item}</strong>
                  <span>{titleCaseToken(item.type)}</span>
                </div>
                <MotionBadge motion={item.revenue_motion} />
                <span className="commitment-value">{item.stated_value ?? '—'}</span>
                <span className="commitment-priority">P{item.priority}</span>
                <span className="commitment-date">{item.due_date ? `Due ${item.due_date}` : 'No due date'}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-section">No commitments were extracted from this brain-dump.</p>
        )}
      </section>
    </div>
  )
}
