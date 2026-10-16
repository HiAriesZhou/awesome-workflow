import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import YAML from 'yaml'
import { normalizeWorkflow, validateWorkflow } from './workflow.mjs'
import { compileDiagram, compileDiagramSet } from './diagram/compile.mjs'
import { layoutGraph } from './diagram/graph.mjs'
import { topologies, longLabels, complex, fixture, terminalLoop } from '../tests/fixtures/topologies.mjs'

test('all legacy YAMLs migrate without losing any fields or changing IDs', () => {
  for (const file of fs.readdirSync(new URL('../workflows/', import.meta.url)).filter(f => f.endsWith('.yml'))) {
    const old = YAML.parse(fs.readFileSync(new URL(`../workflows/${file}`, import.meta.url), 'utf8'))
    const copy = structuredClone(old), w = normalizeWorkflow(old)
    assert.deepEqual(old, copy)
    for (const [k, value] of Object.entries(old)) if (!['steps', 'sources'].includes(k)) assert.deepEqual(w[k], value)
    old.steps.forEach((s, i) => { for (const [k, v] of Object.entries(s)) assert.deepEqual(w.steps[i][k], v) })
    old.sources.forEach((s, i) => { for (const [k, v] of Object.entries(s)) assert.deepEqual(w.sources[i][k], v) })
    assert.equal(w.evidence.status, 'unknown')
    assert.ok(w.edges.every(e => e.evidence[0].support === 'migrated'))
    assert.deepEqual(normalizeWorkflow(w), w)
  }
})
for (const w of topologies) test(`${w.id}: semantics, layout and repeat rendering`, () => {
  validateWorkflow(w)
  const svg = compileDiagram(w)
  assert.equal(svg, compileDiagram(w))
  assert.equal((svg.match(/data-edge-id=/g) || []).length, w.edges.length)
  assert.equal((svg.match(/data-node-id=/g) || []).length, w.steps.length)
  const l = layoutGraph(w)
  assert.ok(l.routes.every(r => r.points.flat().every(n => n % 4 === 0)))
  if (w.id === 'parallel-join') {
    assert.equal(l.ranks.s1, l.ranks.s2)
    assert.notEqual(l.nodes.find(n => n.step.id === 's1').y, l.nodes.find(n => n.step.id === 's2').y)
  }
  if (w.id === 'human-approval') assert.ok(w.actors.filter(a => a.kind === 'human').length === 2)
  if (w.id === 'feedback-loop') assert.ok(l.routes.some(r => r.edge.kind === 'feedback' && r.points.at(-1)[0] < r.points[0][0]))
})
test('Chinese and long English labels remain complete; complex diagrams split losslessly', () => {
  const svg = compileDiagram(longLabels)
  assert.match(svg, /responsible/); assert.match(svg, /缺失信息/)
  const views = compileDiagramSet(complex)
  assert.equal(views[0].id, 'overview')
  assert.deepEqual(views.slice(1).flatMap(v => v.step_ids), complex.steps.map(s => s.id))
  const edges = new Set(views.flatMap(v => v.edge_ids))
  assert.ok(complex.edges.every(e => edges.has(e.id)))
  assert.equal(views.slice(1).reduce((n, v) => n + (v.svg.match(/<polygon/g) || []).length, 0), complex.steps.filter(s => s.human_gate).length)
})
test('invalid references, actors, unsupported cycles, conditions and false reproduction reject explicitly', () => {
  const cases = [
    w => { w.edges[0].to = 'missing' },
    w => { w.steps[0].actor_id = 'missing' },
    w => { w.edges.push({ ...w.edges[0], id: 'cycle', from: 's2', to: 's0' }) },
    w => { w.edges[0].kind = 'conditional' },
    w => { w.evidence = { status: 'reproduced', method: 'Claim', checked_at: '2026-10-13T00:00:00Z' } },
    w => { w.steps[0].evidence = [{ support: 'explicit', locator: 'Missing source' }] },
    w => { delete w.schema_version; w.maturity = 'draft'; w.verified = '2026-10-13' },
    w => { w.steps[0].name = '   ' },
  ]
  for (const mutate of cases) { const w = structuredClone(topologies[0]); mutate(w); assert.throws(() => compileDiagram(w)) }
  assert.throws(() => validateWorkflow({ steps: 'not an array' }), /must/)
})

test('split overview preserves parallel/conditional/feedback kinds and original fork/join details', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ name: `Step ${i}` }))
  nodes[0].type = 'fork'; nodes[7].type = 'join'; nodes[7].join_policy = 'all'
  const w = fixture('cross-view-parallel', nodes, [
    { from: 's0', to: 's1', kind: 'parallel' }, { from: 's0', to: 's6', kind: 'parallel' },
    { from: 's1', to: 's7' }, { from: 's6', to: 's7' },
    { from: 's7', to: 's8', kind: 'conditional', condition: 'complete' },
    { from: 's8', to: 's0', kind: 'feedback', condition: 'repeat' },
  ])
  // Non-contiguous groups can have bidirectional overview links; no semantic edge is rewritten.
  const views = compileDiagramSet(w)
  for (const edge of w.edges) assert.ok(views.some(v => v.svg.includes(`data-edge-id="${edge.id}"`) && v.svg.includes(`data-kind="${edge.kind}"`)))
  assert.match(views[1].svg, />FORK</)
})

test('feedback from the last column and dense return channels stay inside the canvas and outside labels', () => {
  const dense = fixture('dense-return', [{}, {}, {}], [
    { from: 's0', to: 's1' }, { from: 's1', to: 's2' },
    ...Array.from({ length: 18 }, (_, i) => ({ from: 's2', to: 's0', kind: 'feedback', condition: `return ${i}` })),
  ])
  for (const w of [terminalLoop, dense]) {
    const l = layoutGraph(w)
    assert.ok(l.routes.every(r => r.points.every(([x, y]) => x >= 240 && x < l.width && y >= 0 && y < l.height)))
    assert.equal(compileDiagram(w), compileDiagram(w))
  }
})
