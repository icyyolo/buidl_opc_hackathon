import type { CSSProperties } from 'react'
import { REVENUE_MOTIONS, type ScoredItem } from '../types'
import { MOTION_DETAILS, MotionMeaning } from './MetricGlossary'

interface CashLeakRadarProps {
  items: ScoredItem[]
}

function commitmentCount(count: number): string {
  return `${count} ${count === 1 ? 'commitment' : 'commitments'}`
}

export function CashLeakRadar({ items }: CashLeakRadarProps) {
  const maxMotionCount = Math.max(
    0,
    ...REVENUE_MOTIONS.map(
      (motion) => items.filter((item) => item.revenue_motion === motion).length,
    ),
  )

  return (
    <section
      className="cash-leak-radar plan-reveal plan-reveal-2"
      aria-labelledby="cash-leak-radar-heading"
    >
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
          const proportion =
            maxMotionCount === 0 ? 0 : (motionItems.length / maxMotionCount) * 100

          return (
            <div
              className={`radar-motion-card radar-motion-${motion}`}
              key={motion}
              role="group"
              aria-label={`${label}: ${commitmentCount(motionItems.length)}`}
            >
              <div className="radar-motion-topline">
                <MotionMeaning motion={motion}>
                  {(triggerProps) => <strong {...triggerProps}>{label}</strong>}
                </MotionMeaning>
                <span>{commitmentCount(motionItems.length)}</span>
              </div>
              <p className="radar-motion-meaning">{meaning}</p>
              <div
                className={`motion-count-bar motion-count-${motion}`}
                role="img"
                aria-label={`${motionItems.length} of ${maxMotionCount} commitments`}
              >
                <span
                  className="motion-count-fill"
                  aria-hidden="true"
                  style={
                    {
                      '--motion-count-proportion': `${proportion}%`,
                    } as CSSProperties
                  }
                />
              </div>

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
