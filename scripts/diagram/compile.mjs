/**
 * Compile one validated workflow into a static SVG swimlane.
 * Rules and constants: DESIGN.md and ./theme.mjs. Pure and deterministic:
 * the same workflow always yields the same string.
 */
import { colors, laneOrder, fonts, grid, type, budget } from './theme.mjs'

export class DiagramError extends Error {}

const CJK = /[⺀-鿿豈-﫿＀-￯]/

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function textWidth(text, latinWidth = type.latinWidth) {
  let width = 0
  for (const ch of text) width += CJK.test(ch) ? type.cjkWidth : latinWidth
  return width
}

// Tokens break at whitespace and around every CJK character.
function tokenize(text) {
  const tokens = []
  let current = ''
  let spaceBefore = false
  const flush = () => {
    if (current) tokens.push({ text: current, spaceBefore })
    current = ''
    spaceBefore = false
  }
  for (const ch of text) {
    if (/\s/.test(ch)) {
      flush()
      spaceBefore = tokens.length > 0
    } else if (CJK.test(ch)) {
      const space = spaceBefore
      flush()
      tokens.push({ text: ch, spaceBefore: space })
    } else {
      current += ch
    }
  }
  flush()
  return tokens
}

// A word too wide for one line may break after its hyphens, nowhere else.
function splitWide(token, maxWidth) {
  if (textWidth(token.text) <= maxWidth || !token.text.includes('-')) return [token]
  return token.text
    .split(/(?<=-)/)
    .map((part, i) => ({ text: part, spaceBefore: i === 0 ? token.spaceBefore : false }))
}

export function wrapText(text, maxWidth) {
  const lines = []
  let line = ''
  for (const token of tokenize(text).flatMap((t) => splitWide(t, maxWidth))) {
    if (textWidth(token.text) > maxWidth) {
      throw new DiagramError(`"${token.text}" is wider than ${maxWidth}px and cannot wrap`)
    }
    const next = line ? line + (token.spaceBefore ? ' ' : '') + token.text : token.text
    if (textWidth(next) <= maxWidth) {
      line = next
    } else {
      lines.push(line)
      line = token.text
    }
  }
  if (line) lines.push(line)
  return lines
}

const roundUp = (value, unit) => Math.ceil(value / unit) * unit

// Baselines inside a node, by [name lines][has sublabel].
const BASELINES = {
  1: { false: { name: [40] }, true: { name: [32], sub: 52 } },
  2: { false: { name: [32, 48] }, true: { name: [28, 44], sub: 60 } }
}

function checkBudget(workflow, lanes) {
  const gates = workflow.steps.filter((s) => s.human_gate).length
  const problems = []
  if (workflow.steps.length > budget.steps) {
    problems.push(
      `${workflow.steps.length} steps exceeds the ${budget.steps}-step budget; split the workflow (phases arrive in a later schema change)`
    )
  }
  if (lanes.length > budget.lanes) problems.push(`${lanes.length} lanes exceeds ${budget.lanes}`)
  if (gates > budget.gates) {
    problems.push(`${gates} human gates exceeds ${budget.gates}; decide which approvals matter`)
  }
  if (problems.length) throw new DiagramError(problems.join('; '))
}

function layout(workflow, g) {
  const lanes = laneOrder.filter((a) => workflow.steps.some((s) => s.actor === a))
  checkBudget(workflow, lanes)
  const n = workflow.steps.length
  const width = 2 * g.pad + g.gutter + n * g.nodeW + (n - 1) * g.colGap
  const height = 2 * g.pad + lanes.length * g.laneH + g.legendGap + g.legendH
  const textMax = g.nodeW - g.textLeft - g.textRight
  const nodes = workflow.steps.map((step, i) => {
    const lane = lanes.indexOf(step.actor)
    const x = g.pad + g.gutter + i * (g.nodeW + g.colGap)
    const y = g.pad + lane * g.laneH + (g.laneH - g.nodeH) / 2
    const lines = wrapText(step.name, textMax)
    if (lines.length === 0) throw new DiagramError(`step "${step.id}" has an empty name`)
    if (lines.length > budget.nameLines) {
      throw new DiagramError(
        `step "${step.id}" name needs ${lines.length} lines (max ${budget.nameLines}); shorten it and keep detail in notes`
      )
    }
    const tier = step.model_tier && step.model_tier !== 'unknown' ? step.model_tier.toUpperCase() : ''
    if (textWidth(tier, type.monoWidth) > textMax) {
      throw new DiagramError(`step "${step.id}" sublabel is wider than ${textMax}px`)
    }
    return { step, lane, x, y, cy: y + g.nodeH / 2, lines, tier }
  })
  return { lanes, nodes, width, height }
}

// One connector per consecutive pair; returns straight segments for checks
// plus the SVG path.
function connector(from, to, g) {
  const right = from.x + g.nodeW
  const x1 = right + (from.step.human_gate ? g.gate / 2 : 0)
  const x2 = to.x
  if (from.cy === to.cy) {
    return {
      d: `M${x1} ${from.cy}H${x2}`,
      segments: [[x1, from.cy, x2, to.cy]],
      points: [x1, from.cy, x2, to.cy]
    }
  }
  const r = g.elbow
  const mx = right + g.colGap / 2
  const dir = to.cy > from.cy ? 1 : -1
  const turnIn = dir === 1 ? 1 : 0
  const turnOut = dir === 1 ? 0 : 1
  const yA = from.cy + dir * r
  const yB = to.cy - dir * r
  return {
    d:
      `M${x1} ${from.cy}H${mx - r}A${r} ${r} 0 0 ${turnIn} ${mx} ${yA}` +
      `V${yB}A${r} ${r} 0 0 ${turnOut} ${mx + r} ${to.cy}H${x2}`,
    segments: [
      [x1, from.cy, mx - r, from.cy],
      [mx, yA, mx, yB],
      [mx + r, to.cy, x2, to.cy]
    ],
    points: [x1, from.cy, mx - r, mx, yA, yB, mx + r, to.cy, x2]
  }
}

function crossesNode(seg, node, g) {
  const [ax, ay, bx, by] = seg
  const [minX, maxX] = [Math.min(ax, bx), Math.max(ax, bx)]
  const [minY, maxY] = [Math.min(ay, by), Math.max(ay, by)]
  return minX < node.x + g.nodeW && maxX > node.x && minY < node.y + g.nodeH && maxY > node.y
}

function legend(workflow, lanes, g, rowTop, prefix) {
  const parts = []
  let x = g.pad
  const baseline = rowTop + 12
  const small = `font-family='${fonts.sans}' font-size="${type.smallSize}" fill="${colors.muted}"`
  for (const actor of lanes) {
    const label = actor === 'ci' ? 'CI' : actor[0].toUpperCase() + actor.slice(1)
    parts.push(`<rect x="${x}" y="${rowTop + 4}" width="8" height="8" fill="${colors[actor]}"/>`)
    parts.push(`<text x="${x + 16}" y="${baseline}" ${small}>${label}</text>`)
    x += roundUp(16 + textWidth(label, type.smallWidth), g.unit) + 16
  }
  if (workflow.steps.some((s) => s.human_gate)) {
    const cx = x + g.gate / 2
    const cy = rowTop + g.gate / 2
    const h = g.gate / 2
    parts.push(
      `<polygon points="${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}" fill="${colors.accent}"/>`
    )
    parts.push(`<text x="${x + g.gate + 8}" y="${baseline}" ${small}>Human gate</text>`)
    x += roundUp(g.gate + 8 + textWidth('Human gate', type.smallWidth), g.unit) + 16
  }
  const tools = `tools ${workflow.tools.join(' · ')}`
  parts.push(
    `<text id="${prefix}-tools" x="${x}" y="${baseline}" font-family='${fonts.mono}' font-size="${type.smallSize}" fill="${colors.muted}">${esc(tools)}</text>`
  )
  return { svg: parts.join(''), right: x + textWidth(tools, type.monoWidth) }
}

function describe(workflow, nodes) {
  const steps = nodes
    .map(({ step }, i) => `${i + 1}. ${step.name} (${step.actor}${step.human_gate ? ', human gate' : ''}).`)
    .join(' ')
  return `${nodes.length} steps. ${steps} Tools: ${workflow.tools.join(', ')}.`
}

export function compileDiagram(workflow, g = grid) {
  const prefix = `wf-${workflow.id}`
  const { lanes, nodes, width, height } = layout(workflow, g)
  const problems = []
  const onGrid = (label, values) => {
    for (const v of values) {
      if (!Number.isInteger(v) || v % g.unit !== 0) problems.push(`${label}: ${v} is off the ${g.unit}px grid`)
    }
  }
  onGrid('canvas', [width, height])

  const out = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">`
  )
  out.push(`<title id="${prefix}-title">${esc(workflow.title)} workflow diagram</title>`)
  out.push(`<desc id="${prefix}-desc">${esc(describe(workflow, nodes))}</desc>`)
  out.push(
    `<defs><marker id="${prefix}-arrow" viewBox="0 0 ${g.arrow} ${g.arrow}" refX="${g.arrow}" refY="${g.arrow / 2}" markerWidth="${g.arrow}" markerHeight="${g.arrow}" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L${g.arrow} ${g.arrow / 2}L0 ${g.arrow}Z" fill="${colors.edge}"/></marker></defs>`
  )
  out.push(
    `<rect width="${width}" height="${height}" rx="${g.cardRadius}" fill="${colors.paper}" stroke="${colors.rule}"/>`
  )

  lanes.forEach((actor, i) => {
    const top = g.pad + i * g.laneH
    if (i > 0) {
      out.push(`<line x1="${g.pad}" y1="${top}" x2="${width - g.pad}" y2="${top}" stroke="${colors.rule}"/>`)
    }
    const baseline = top + g.laneH / 2 + 4
    onGrid(`lane ${actor}`, [top, baseline])
    if (textWidth(actor.toUpperCase(), type.monoWidth) > g.gutter - 8) {
      problems.push(`lane label ${actor} is wider than the gutter`)
    }
    out.push(
      `<text x="${g.pad}" y="${baseline}" font-family='${fonts.mono}' font-size="${type.smallSize}" fill="${colors[actor]}">${actor.toUpperCase()}</text>`
    )
  })

  for (let i = 0; i + 1 < nodes.length; i++) {
    const c = connector(nodes[i], nodes[i + 1], g)
    onGrid(`connector ${nodes[i].step.id}`, c.points)
    for (const seg of c.segments) {
      if (seg[0] !== seg[2] && seg[1] !== seg[3]) problems.push(`connector ${nodes[i].step.id} is not orthogonal`)
      for (const node of nodes) {
        if (node !== nodes[i] && node !== nodes[i + 1] && crossesNode(seg, node, g)) {
          problems.push(`connector ${nodes[i].step.id} crosses step ${node.step.id}`)
        }
      }
    }
    out.push(
      `<path d="${c.d}" fill="none" stroke="${colors.edge}" marker-end="url(#${prefix}-arrow)"/>`
    )
  }

  for (const node of nodes) {
    const { step, x, y, lines, tier } = node
    const color = colors[step.actor]
    const s = g.stripe
    const base = BASELINES[lines.length][Boolean(tier)]
    onGrid(`step ${step.id}`, [x, y, ...base.name, base.sub ?? 0])
    out.push(
      `<rect x="${x}" y="${y}" width="${g.nodeW}" height="${g.nodeH}" rx="${g.nodeRadius}" fill="${colors.paper}" stroke="${color}"/>`
    )
    out.push(
      `<path d="M${x + s} ${y}V${y + g.nodeH}A${s} ${s} 0 0 1 ${x} ${y + g.nodeH - s}V${y + s}A${s} ${s} 0 0 1 ${x + s} ${y}Z" fill="${color}"/>`
    )
    lines.forEach((line, li) => {
      out.push(
        `<text x="${x + g.textLeft}" y="${y + base.name[li]}" font-family='${fonts.sans}' font-size="${type.nameSize}" font-weight="500" fill="${colors.ink}">${esc(line)}</text>`
      )
    })
    if (tier) {
      out.push(
        `<text x="${x + g.textLeft}" y="${y + base.sub}" font-family='${fonts.mono}' font-size="${type.smallSize}" fill="${colors.muted}">${tier}</text>`
      )
    }
  }

  for (const node of nodes.filter((nd) => nd.step.human_gate)) {
    const cx = node.x + g.nodeW
    const h = g.gate / 2
    onGrid(`gate ${node.step.id}`, [cx, node.cy - h, node.cy + h])
    out.push(
      `<polygon points="${cx},${node.cy - h} ${cx + h},${node.cy} ${cx},${node.cy + h} ${cx - h},${node.cy}" fill="${colors.accent}"/>`
    )
  }

  const rowTop = g.pad + lanes.length * g.laneH + g.legendGap
  const lg = legend(workflow, lanes, g, rowTop, prefix)
  onGrid('legend', [rowTop])
  if (lg.right > width - g.pad) problems.push(`legend is ${Math.ceil(lg.right)}px wide, past the ${width - g.pad}px content edge`)
  out.push(lg.svg)
  out.push('</svg>')

  if (problems.length) throw new DiagramError(problems.join('; '))
  return out.join('\n') + '\n'
}
