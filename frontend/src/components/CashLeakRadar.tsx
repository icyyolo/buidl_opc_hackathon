import { REVENUE_MOTIONS, type RevenueMotion, type ScoredItem } from '../types'

interface CashLeakRadarProps {
  items: ScoredItem[]
}

const MOTION_DETAILS: Record<RevenueMotion, { label: string; meaning: string }> = {
  collect: { label: 'Collect', meaning: 'Earned but uncollected' },
  close: { label: 'Close', meaning: 'Ready to win or renew' },
  deliver: { label: 'Deliver', meaning: 'Paid work to ship' },
  retain: { label: 'Retain', meaning: 'Revenue at risk' },
  grow: { label: 'Grow', meaning: 'Pipeline for later' },
  operate: { label: 'Operate', meaning: 'No direct cash motion' },
}

function commitmentCount(count: number): string {
  return `${count} ${count === 1 ? 'commitment' : 'commitments'}`
}

export function CashLeakRadar({ items }: CashLeakRadarProps) {
  return (
    <section className="cash-leak-radar" aria-labelledby="cash-leak-radar-heading">
      <div className="radar-heading">
        <div>
          <p className="eyebrow">See every revenue motion</p>
          <h3 id="cash-leak-radar-heading">Cash Leak Radar</h3>
        </div>
        <p>
          Founder-stated values stay exactly as written. They are not summed, converted, or treated
          as verified earned revenue.
        </p>
      </div>

      <div className="radar-motion-grid">
        {REVENUE_MOTIONS.map((motion) => {
          const motionItems = items.filter((item) => item.revenue_motion === motion)
          const { label, meaning } = MOTION_DETAILS[motion]

          return (
            <div
              className={`radar-motion-card radar-motion-${motion}`}
              key={motion}
              role="group"
              aria-label={`${label}: ${commitmentCount(motionItems.length)}`}
            >
              <div className="radar-motion-topline">
                <strong>{label}</strong>
                <span>{commitmentCount(motionItems.length)}</span>
              </div>
              <p className="radar-motion-meaning">{meaning}</p>

              {motionItems.some((item) => item.stated_value !== null) ? (
                <div className="radar-stated-values" aria-label={`${label} stated values`}>
                  {motionItems.map(
                    (item) =>
                      item.stated_value !== null && (
                        <div className="radar-value-row" key={item.id}>
                          <span>{item.item}</span>
                          <strong>{item.stated_value}</strong>
                        </div>
                      ),
                  )}
                </div>
              ) : (
                <p className="radar-no-value">
                  {motionItems.length === 0 ? 'No commitments in this motion.' : 'No stated value.'}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
