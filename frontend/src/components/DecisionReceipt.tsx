import type { ScoredItem } from '../types'

interface DecisionReceiptProps {
  item: ScoredItem
}

export function DecisionReceipt({ item }: DecisionReceiptProps) {
  return (
    <section
      className="decision-receipt"
      aria-label={`Decision Receipt for ${item.item}`}
    >
      <div className="receipt-heading">
        <div>
          <p className="eyebrow">Proof behind the ranking</p>
          <h4>Decision Receipt</h4>
        </div>
        <span
          className={`motion-badge motion-${item.revenue_motion}`}
          aria-label={`Revenue motion: ${item.revenue_motion}`}
        >
          {item.revenue_motion.toUpperCase()}
        </span>
      </div>

      <div className="meta-row" aria-label="Validated decision inputs">
        {item.stated_value !== null && <span className="value-chip">{item.stated_value}</span>}
        <span className="priority-chip">Priority {item.priority}</span>
      </div>

      <p className="score-formula">
        Revenue proximity {item.revenue_proximity} × 3 + urgency {item.urgency} = priority{' '}
        {item.priority}
      </p>

      <div className="evidence-panel">
        <p className="micro-label">Verbatim evidence</p>
        <blockquote>“{item.evidence}”</blockquote>
        <div className="cost-assessment">
          <p className="micro-label">Cost-of-delay assessment</p>
          <p>{item.cost_of_delay}</p>
        </div>
      </div>

      {item.missing_fact !== null && (
        <p className="uncertainty-note">
          <span>Open question</span>
          {item.missing_fact}
        </p>
      )}
    </section>
  )
}
