// Bounded experiment only; not a production renderer or a runtime dependency.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { topologies } from '../../tests/fixtures/topologies.mjs'
import { graphRanks } from '../workflow.mjs'
const [checkout, output] = process.argv.slice(2)
if (!checkout || !output) throw new Error('Usage: node scripts/probes/archify.mjs <archify checkout> <output dir>')
fs.mkdirSync(output, { recursive: true })
const { compileWorkflow } = await import(pathToFileURL(path.resolve(checkout, 'archify/renderers/workflow/workflow-compiler.mjs')))
const receipts = []
for (const w of topologies) {
  const ranks = graphRanks(w)
  const occupied = new Map()
  const displayLanes = new Map()
  const nodeLanes = new Map()
  for (const s of w.steps) {
    const key = `${s.actor_id}:${ranks.get(s.id)}`
    const slot = occupied.get(key) || 0
    occupied.set(key, slot + 1)
    const lane = `${s.actor_id}-${slot}`
    nodeLanes.set(s.id, lane)
    displayLanes.set(lane, { id: lane, label: w.actors.find(a => a.id === s.actor_id).label })
  }
  const ir = {
    schema_version: 2, diagram_type: 'workflow', meta: { title: w.title, output: `${w.id}.html`, animation: 'none' },
    lanes: [...displayLanes.values()],
    nodes: w.steps.map(s => ({ id: s.id, lane: nodeLanes.get(s.id), col: ranks.get(s.id), width: 180, type: s.human_gate ? 'security' : 'backend', label: s.name })),
    edges: w.edges.map(e => ({ id: e.id, from: e.from, to: e.to, ...(e.condition ? { label: e.condition } : {}), ...(e.kind === 'feedback' ? { role: 'return', route: 'up-channel', fromSide: 'top', toSide: 'top' } : {}) })),
  }
  fs.writeFileSync(path.join(output, `${w.id}.json`), JSON.stringify(ir, null, 2))
  try {
    const result = compileWorkflow({ workflow: ir, qualityProfile: 'standard' })
    const stable = result.ok && result.svg === compileWorkflow({ workflow: ir, qualityProfile: 'standard' }).svg
    if (result.ok) fs.writeFileSync(path.join(output, `${w.id}.svg`), result.svg)
    receipts.push({ id: w.id, ok: result.ok, stable, error: result.error, diagnostics: result.diagnostics, themeMatches: result.svg?.includes('#f4efe6') || false })
  } catch (e) { receipts.push({ id: w.id, ok: false, error: e.message }) }
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ version: '3.0.1', note: 'Layout mapping is authored by this adapter. Semantics/evidence are not part of the Archify IR.', receipts }, null, 2) + '\n')
console.log(JSON.stringify(receipts, null, 2))
