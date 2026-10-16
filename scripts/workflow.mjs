import fs from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const schema = JSON.parse(fs.readFileSync(new URL('../schema/workflow.schema.json', import.meta.url)))
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)
export class WorkflowError extends Error {}
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0

export function validateWorkflow(w) {
  if (!validate(w)) throw new WorkflowError(ajv.errorsText(validate.errors, { separator: '; ' }))
  const unique = (items, field) => {
    const ids = items.map(x => x[field])
    if (new Set(ids).size !== ids.length) throw new WorkflowError(`Duplicate ${field}: ${ids.join(', ')}`)
  }
  unique(w.steps, 'id')
  unique(w.sources, 'url')
  for (const s of w.steps) if (!s.name.trim()) throw new WorkflowError(`${s.id}: empty step name`)
  if (!w.schema_version) {
    const hybrid = ['actors', 'edges', 'lifecycle', 'evidence', 'coverage'].some(k => k in w) || w.steps.some(s => ['actor_id', 'type', 'evidence', 'phase', 'join_policy', 'execution'].some(k => k in s)) || w.sources.some(s => ['id', 'kind', 'locator', 'revision', 'checked_at', 'content_hash', 'reuse_status'].some(k => k in s))
    if (hybrid) throw new WorkflowError('V2 fields require schema_version: 2; refusing a lossy legacy projection')
    return w
  }
  unique(w.actors, 'id'); unique(w.sources, 'id'); unique(w.edges, 'id')
  const actors = new Map(w.actors.map(a => [a.id, a]))
  const steps = new Map(w.steps.map(s => [s.id, s]))
  const sources = new Map(w.sources.map(s => [s.id, s]))
  for (const item of [...w.steps, ...w.edges]) {
    for (const e of item.evidence) {
      if (e.source_id && !sources.has(e.source_id)) throw new WorkflowError(`${item.id}: unknown source ${e.source_id}`)
      if (e.support === 'explicit' && !e.source_id) throw new WorkflowError(`${item.id}: explicit evidence needs source_id`)
      if (['inferred', 'unknown', 'migrated'].includes(e.support) && !e.reason) throw new WorkflowError(`${item.id}: ${e.support} needs reason`)
    }
  }
  for (const s of w.steps) {
    if (!actors.has(s.actor_id) || actors.get(s.actor_id).kind !== s.actor) throw new WorkflowError(`${s.id}: invalid actor instance/category`)
    const outgoing = w.edges.filter(e => e.from === s.id)
    const incoming = w.edges.filter(e => e.to === s.id && e.kind !== 'feedback')
    if (s.type === 'approval' && (s.actor !== 'human' || !s.human_gate)) throw new WorkflowError(`${s.id}: approval needs human actor and human_gate`)
    if (s.type === 'fork' && (outgoing.length < 2 || outgoing.some(e => e.kind !== 'parallel'))) throw new WorkflowError(`${s.id}: fork needs at least two parallel edges`)
    if (s.type === 'join' && (incoming.length < 2 || !s.join_policy)) throw new WorkflowError(`${s.id}: join needs multiple incoming edges and join_policy`)
    if (s.execution === 'dynamic_parallel' && (s.type !== 'subprocess' || actors.get(s.actor_id).multiplicity !== 'dynamic')) throw new WorkflowError(`${s.id}: dynamic parallel needs a subprocess and dynamic actor group`)
  }
  for (const e of w.edges) {
    if (!steps.has(e.from) || !steps.has(e.to)) throw new WorkflowError(`${e.id}: invalid node reference ${e.from} -> ${e.to}`)
    if (e.kind === 'conditional' && !e.condition?.trim()) throw new WorkflowError(`${e.id}: conditional edge needs condition`)
  }
  // Feedback is deliberate, never silently discard a cyclic dependency.
  graphRanks(w)
  if (w.evidence.status !== 'unknown' && !w.evidence.checked_at) throw new WorkflowError('Evidence status needs checked_at')
  if (['reproduced', 'author_confirmed'].includes(w.evidence.status) && !w.evidence.record) throw new WorkflowError('Confirmation/reproduction needs a reviewable record')
  return w
}

export function graphRanks(w) {
  const edges = w.edges.filter(e => e.kind !== 'feedback')
  const rank = new Map(w.steps.map(s => [s.id, 0]))
  const pending = new Map(w.steps.map(s => [s.id, edges.filter(e => e.to === s.id).length]))
  const ready = [...pending].filter(([, n]) => n === 0).map(([id]) => id).sort(compare)
  let visited = 0
  while (ready.length) {
    const id = ready.shift(); visited++
    for (const e of edges.filter(e => e.from === id).sort((a, b) => compare(a.id, b.id))) {
      rank.set(e.to, Math.max(rank.get(e.to), rank.get(id) + 1))
      pending.set(e.to, pending.get(e.to) - 1)
      if (!pending.get(e.to)) { ready.push(e.to); ready.sort(compare) }
    }
  }
  if (visited !== w.steps.length) throw new WorkflowError('Cycle must have an explicitly marked feedback edge')
  return rank
}

// Pure, lossless compatibility projection. Original fields stay intact.
export function normalizeWorkflow(input) {
  validateWorkflow(input)
  const w = structuredClone(input)
  if (w.schema_version === 2) return w
  w.schema_version = 2
  w.lifecycle = w.maturity === 'archived' ? 'archived' : 'published'
  w.evidence = { status: 'unknown', method: 'Legacy verified/maturity retained; no new source check or reproduction performed.' }
  w.actors = [...new Set(w.steps.map(s => s.actor))].map(kind => ({ id: kind, kind, label: kind }))
  w.sources = w.sources.map((s, i) => ({ ...s, id: `legacy-source-${i + 1}`, kind: 'unknown', locator: 'Legacy sources[]', reuse_status: 'unknown' }))
  w.steps = w.steps.map(s => ({ ...s, actor_id: s.actor, type: 'action', evidence: [{ support: 'migrated', locator: `steps[id=${s.id}]`, reason: 'Imported unchanged from legacy YAML; not independently checked.', ...(s.evidence_url && w.sources.some(x => x.url === s.evidence_url) ? { source_id: w.sources.find(x => x.url === s.evidence_url).id } : {}) }] }))
  w.edges = w.steps.slice(1).map((s, i) => ({ id: `legacy-edge-${i + 1}`, from: w.steps[i].id, to: s.id, kind: 'sequence', evidence: [{ support: 'migrated', locator: `steps[${i}] -> steps[${i + 1}]`, reason: 'Derived solely from legacy array order, matching the old renderer; not reverified.' }] }))
  w.coverage = { mode: 'legacy_order_projection', unknowns: ['Actual branching, parallelism, failures and retries have not been rechecked.', 'Legacy actor categories are placeholders; separate role instances were not reconstructed.'] }
  return validateWorkflow(w)
}
