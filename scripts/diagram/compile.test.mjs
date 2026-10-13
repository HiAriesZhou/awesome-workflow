import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { compileDiagram, DiagramError, wrapText } from './compile.mjs'
import { colors, grid, budget } from './theme.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflowsDir = path.join(root, 'workflows')
const realWorkflows = fs
  .readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => YAML.parse(fs.readFileSync(path.join(workflowsDir, f), 'utf8')))

function workflow(steps, extra = {}) {
  return {
    id: 'fixture',
    title: 'Fixture',
    tools: ['claude-code'],
    steps: steps.map((s, i) => ({ id: `s${i}`, name: `Step ${i}`, actor: 'agent', ...s })),
    ...extra
  }
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Every geometric number in the output; font sizes and stroke widths excluded.
function geometry(svg) {
  const nums = []
  for (const m of svg.matchAll(/\s(?:x|y|x1|x2|y1|y2|width|height|rx|refX|refY)="([^"]+)"/g)) {
    nums.push(Number(m[1]))
  }
  for (const m of svg.matchAll(/\s(?:d|points|viewBox)="([^"]+)"/g)) {
    // Arc rotation and flag parameters are not coordinates.
    const coords = m[1].replace(/A(\d+) (\d+) 0 [01] [01] /g, 'A$1 $2 ')
    nums.push(...coords.match(/-?\d+(\.\d+)?/g).map(Number))
  }
  return nums
}

test('theme geometry is on the 4px grid', () => {
  for (const [key, value] of Object.entries(grid)) {
    assert.equal(value % grid.unit, 0, `${key}=${value}`)
  }
})

test('theme colors meet DESIGN.md contrast rules on paper', () => {
  for (const role of ['ink', 'muted']) assert.ok(contrast(colors[role], colors.paper) >= 4.5, role)
  for (const role of ['edge', 'accent', 'human', 'agent', 'tool', 'ci']) {
    assert.ok(contrast(colors[role], colors.paper) >= 3, role)
  }
})

test('every real workflow compiles deterministically and on grid', () => {
  assert.ok(realWorkflows.length >= 10)
  for (const w of realWorkflows) {
    const svg = compileDiagram(w)
    assert.equal(compileDiagram(w), svg, `${w.id} is not deterministic`)
    for (const n of geometry(svg)) assert.equal(n % grid.unit, 0, `${w.id}: ${n} off grid`)
  }
})

test('accessibility contract: title first, prefixed ids', () => {
  const svg = compileDiagram(realWorkflows[0])
  const id = realWorkflows[0].id
  assert.match(svg, new RegExp(`^<svg [^>]*role="img" aria-labelledby="wf-${id}-title wf-${id}-desc">\\n<title id="wf-${id}-title">`))
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) assert.ok(m[1].startsWith(`wf-${id}-`), m[1])
  assert.doesNotMatch(svg, /<style|@import|<script/)
})

test('text from YAML is escaped', () => {
  const svg = compileDiagram(workflow([{ name: '<script>' }, { name: 'a & "b"' }], { title: '<x>' }))
  assert.doesNotMatch(svg, /<script>|<x>/)
  assert.match(svg, /&lt;script&gt;/)
  assert.match(svg, /a &amp; &quot;b&quot;/)
})

test('accent appears only on gate markers', () => {
  const svg = compileDiagram(workflow([{ human_gate: true }, {}, { human_gate: true }]))
  const accentUses = svg.split(colors.accent).length - 1
  // two step markers plus one legend marker
  assert.equal(accentUses, 3)
  assert.equal((svg.match(/<polygon/g) || []).length, 3)
})

test('gate on the last step sits on its right edge', () => {
  const svg = compileDiagram(workflow([{}, { human_gate: true }]))
  const lastRight = grid.pad + grid.gutter + 2 * grid.nodeW + grid.colGap
  assert.match(svg, new RegExp(`<polygon points="${lastRight},`))
})

test('single-lane workflow has one lane label and no separators', () => {
  const svg = compileDiagram(workflow([{}, {}]))
  assert.equal((svg.match(/>AGENT</g) || []).length, 1)
  assert.doesNotMatch(svg, /<line /)
})

test('cross-lane connectors are orthogonal elbows', () => {
  const svg = compileDiagram(workflow([{ actor: 'human' }, { actor: 'agent' }]))
  const d = svg.match(/<path d="(M[^"]+)" fill="none"/)[1]
  assert.match(d, /^M\d+ \d+H\d+A8 8 0 0 1 \d+ \d+V\d+A8 8 0 0 0 \d+ \d+H\d+$/)
})

test(`more than ${budget.steps} steps fails the budget`, () => {
  const steps = Array.from({ length: budget.steps + 1 }, () => ({}))
  assert.throws(() => compileDiagram(workflow(steps)), (e) => e instanceof DiagramError && /step budget/.test(e.message))
})

test(`more than ${budget.gates} gates fails the budget`, () => {
  const steps = Array.from({ length: budget.gates + 1 }, () => ({ human_gate: true }))
  assert.throws(() => compileDiagram(workflow(steps)), /human gates exceeds/)
})

test('a name needing three lines fails instead of truncating', () => {
  const name = 'Agent blocking-and-tackling review'
  assert.equal(wrapText(name, 132).length, 3)
  assert.throws(() => compileDiagram(workflow([{ name }, {}])), /needs 3 lines/)
})

test('an empty step name fails clearly', () => {
  assert.throws(() => compileDiagram(workflow([{ name: '  ' }, {}])), (e) => e instanceof DiagramError && /empty name/.test(e.message))
})

test('hyphens break only when a word cannot fit', () => {
  assert.deepEqual(wrapText('Ship follow-through', 132), ['Ship', 'follow-through'])
  assert.deepEqual(wrapText('Agent blocking-and-tackling', 132), ['Agent blocking-', 'and-tackling'])
  assert.throws(() => wrapText('Supercalifragilisticexpialidocious', 132), /cannot wrap/)
})

test('CJK names wrap per character', () => {
  const lines = wrapText('需求分析与人工审批流程确认步骤', 132)
  assert.equal(lines.length, 2)
  assert.equal(lines.join(''), '需求分析与人工审批流程确认步骤')
})

test('off-grid geometry is rejected', () => {
  const bad = { ...grid, colGap: 42 }
  assert.throws(() => compileDiagram(workflow([{}, {}]), bad), /off the 4px grid/)
})

test('legend that overflows the card is rejected', () => {
  const tools = ['claude-code', 'codex', 'cursor', 'grok', 'github-actions', 'n8n', 'playwright', 'mcp', 'skills']
  assert.throws(() => compileDiagram(workflow([{}, {}], { tools })), /legend is \d+px wide/)
})
