export type Actor = 'human' | 'agent' | 'tool' | 'ci'
export type Maturity = 'draft' | 'verified' | 'archived'
export type ModelTier = 'premium' | 'standard' | 'cheap' | 'unknown'

export interface Step {
  id: string
  name: string
  actor: Actor
  human_gate?: boolean
  model_tier?: ModelTier
  inputs?: string[]
  outputs?: string[]
  notes?: string
  evidence_url?: string
}

export interface Source {
  label: string
  url: string
  stars?: number
}

export interface Workflow {
  id: string
  title: string
  summary: string
  domain: string
  maturity: Maturity
  tools: string[]
  model_tiers?: ModelTier[]
  automation?: string
  authors?: string[]
  tags?: string[]
  not_for?: string[]
  steps: Step[]
  sources: Source[]
  added: string
  verified: string
}

export interface WorkflowBundle {
  generated_at: string
  count: number
  workflows: Workflow[]
}
