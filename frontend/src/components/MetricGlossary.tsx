import { useId, type ReactNode } from 'react'
import type { RevenueMotion } from '../types'

export const MOTION_DETAILS: Record<RevenueMotion, { label: string; meaning: string }> = {
  collect: { label: 'Collect', meaning: 'Earned but uncollected' },
  close: { label: 'Close', meaning: 'Ready to win or renew' },
  deliver: { label: 'Deliver', meaning: 'Paid work to ship' },
  retain: { label: 'Retain', meaning: 'Revenue at risk' },
  grow: { label: 'Grow', meaning: 'Pipeline for later' },
  operate: { label: 'Operate', meaning: 'No direct cash motion' },
}

export interface DisclosureTriggerProps {
  tabIndex: number
  'aria-describedby': string
}

interface InfoDisclosureProps {
  description: ReactNode
  children: (triggerProps: DisclosureTriggerProps) => ReactNode
}

/**
 * Accessible on-demand disclosure: reveals `description` on hover, keyboard focus, or tap.
 * `children` is a render prop so the trigger keeps its own element/classes/text unchanged
 * (no extra wrapper node with duplicate text, which would break exact-text queries).
 */
export function InfoDisclosure({ description, children }: InfoDisclosureProps) {
  const tooltipId = useId()
  return (
    <span className="info-disclosure">
      {children({ tabIndex: 0, 'aria-describedby': tooltipId })}
      <span role="tooltip" id={tooltipId} className="info-disclosure-bubble">
        {description}
      </span>
    </span>
  )
}

export function MotionMeaning({
  motion,
  children,
}: {
  motion: RevenueMotion
  children: (triggerProps: DisclosureTriggerProps) => ReactNode
}) {
  return (
    <InfoDisclosure description={MOTION_DETAILS[motion].meaning}>{children}</InfoDisclosure>
  )
}
