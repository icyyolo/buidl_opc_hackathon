export const ITEM_TYPES = ['task', 'email_owed', 'deadline'] as const
export const REVENUE_MOTIONS = [
  'collect',
  'close',
  'deliver',
  'retain',
  'grow',
  'operate',
] as const
export const DRAFT_PURPOSES = ['money_move', 'unblock'] as const

export type ItemType = (typeof ITEM_TYPES)[number]
export type RevenueMotion = (typeof REVENUE_MOTIONS)[number]
export type DraftPurpose = (typeof DRAFT_PURPOSES)[number]

export interface Item {
  id: string
  item: string
  type: ItemType
  due_date: string | null
  stated_value: string | null
  source_text: string
  context: string
}

export interface ScoredItem extends Item {
  revenue_motion: RevenueMotion
  revenue_proximity: number
  urgency: number
  evidence: string
  cost_of_delay: string
  missing_fact: string | null
  priority: number
}

export interface MoneyMove {
  id: string
  why_today: string
  next_action: string
  done_when: string
}

export interface ParkItem {
  id: string
  why_safe: string
}

export interface BlockedItem {
  id: string
  blocker: string
  unblock_action: string
  message_needed: boolean
}

export interface Draft {
  id: string
  purpose: DraftPurpose
  subject: string
  body: string
}

export interface ProcessResponse {
  items: Item[]
  scored: ScoredItem[]
  plan: {
    money_moves: MoneyMove[]
    park: ParkItem[]
    blocked: BlockedItem[]
  }
  drafts: Draft[]
}
