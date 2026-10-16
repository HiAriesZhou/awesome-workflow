import type taxonomy from './taxonomy.json'

export type Actor = keyof typeof taxonomy.actors
export type Domain = keyof typeof taxonomy.domains
export type Tool = keyof typeof taxonomy.tools
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
  actor_id?: string
  type?: string
  evidence?: EvidenceRef[]
}

export interface EvidenceRef { source_id?: string; locator: string; support: string; reason?: string }

export interface Source {
  id?: string
  label: string
  url: string
  stars?: number
}

export interface Workflow {
  id: string
  title: string
  summary: string
  domain: Domain
  maturity?: Maturity
  tools: Tool[]
  model_tiers?: ModelTier[]
  automation?: string
  authors?: string[]
  tags?: string[]
  not_for?: string[]
  steps: Step[]
  sources: Source[]
  added: string
  verified?: string
  schema_version?: number
  lifecycle?: string
  evidence?: { status: string; method: string; checked_at?: string; record?: string }
  actors?: { id: string; kind: Actor; label: string }[]
  edges?: { id: string; from: string; to: string; kind: string; condition?: string; evidence: EvidenceRef[] }[]
  coverage?: { mode: string; unknowns: string[]; inferences?: string[] }
  diagram_views?: { id: string; file: string; step_ids: string[]; edge_ids: string[] }[]
}

export interface WorkflowBundle {
  generated_at: string
  count: number
  workflows: Workflow[]
}
