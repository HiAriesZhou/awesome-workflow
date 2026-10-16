import { colors, fonts, grid, type, budget, laneOrder } from './theme.mjs'
import { DiagramError, wrapText, textWidth } from './compile.mjs'
import { graphRanks, compare, validateWorkflow } from '../workflow.mjs'

export const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const up = n => Math.ceil(n / 4) * 4
const text = (x, y, value, size = type.nameSize, color = colors.ink, extra = '') => `<text x="${x}" y="${y}" font-family='${fonts.sans}' font-size="${size}" fill="${color}" ${extra}>${esc(value)}</text>`
const rect = (x, y, w, h, fill, stroke = 'none', extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" ${extra}/>`

export function segmentHitsRect([ax, ay, bx, by], r) {
  return Math.min(ax, bx) < r.x + r.w && Math.max(ax, bx) > r.x && Math.min(ay, by) < r.y + r.h && Math.max(ay, by) > r.y
}

// Only display coordinates live here. Semantic steps/edges are never reordered or edited.
export function layoutGraph(w, display = {}) {
  if (!display.ranks) validateWorkflow(w)
  if (w.steps.length > budget.steps || w.steps.filter(s => s.human_gate).length > budget.gates) throw new DiagramError('Single-view budget exceeded; use compileDiagramSet for overview/details')
  const ranks = display.ranks || graphRanks(w)
  const ordered = [...w.steps].sort((a, b) => compare(a.id, b.id))
  const edges = [...w.edges].sort((a, b) => compare(a.id, b.id))
  const lines = new Map(ordered.map(s => [s.id, wrapText(s.name, grid.nodeW - grid.textLeft - grid.textRight)]))
  const degree = Math.max(1, ...ordered.map(s => Math.max(edges.filter(e => e.from === s.id).length, edges.filter(e => e.to === s.id).length)))
  const nodeH = up(Math.max(grid.nodeH, ...[...lines.values()].map(ls => 32 + ls.length * 16 + 20), 32 + degree * 16))
  const gap = up(Math.max(80, 32 + edges.length * 16))
  const usedActors = w.actors.filter(a => ordered.some(s => s.actor_id === a.id)).sort((a, b) => laneOrder.indexOf(a.kind) - laneOrder.indexOf(b.kind) || compare(a.id, b.id))
  const occupied = new Map(), slots = new Map(), laneRows = []
  for (const a of usedActors) {
    let count = 1
    for (const s of ordered.filter(s => s.actor_id === a.id)) {
      const key = `${a.id}:${ranks.get(s.id)}`, slot = occupied.get(key) || 0
      occupied.set(key, slot + 1); slots.set(s.id, slot); count = Math.max(count, slot + 1)
    }
    laneRows.push({ actor: a, count })
  }
  const labelRail = up(Math.max(240, ...usedActors.flatMap(a => [textWidth(a.label, type.smallWidth) + 40, textWidth(`${a.kind} · ${a.id}`, type.smallWidth) + 40])))
  const channelSpace = 32 + edges.length * 16
  const gutter = labelRail + channelSpace
  const labelLines = edges.map(e => wrapText(`${e.id} · ${e.condition || e.kind}`, labelRail - 32))
  let y = grid.pad
  const buses = edges.map((e, i) => {
    const row = { edge: e, lines: labelLines[i], y: y + labelLines[i].length * 16 + 8 }
    y = row.y + 24
    return row
  })
  const lanesTop = y + 16
  y = lanesTop
  for (const row of laneRows) { row.y = y; row.h = row.count * (nodeH + 32); y += row.h }
  const cols = Math.max(...ranks.values()) + 1
  const width = 2 * grid.pad + gutter + cols * grid.nodeW + (cols - 1) * gap + channelSpace
  const nodes = ordered.map(step => {
    const row = laneRows.find(r => r.actor.id === step.actor_id)
    return { step, x: grid.pad + gutter + ranks.get(step.id) * (grid.nodeW + gap), y: row.y + slots.get(step.id) * (nodeH + 32) + 16, w: grid.nodeW, h: nodeH, lines: lines.get(step.id) }
  })
  const routes = edges.map((e, i) => {
    const from = nodes.find(n => n.step.id === e.from), to = nodes.find(n => n.step.id === e.to)
    const out = edges.filter(x => x.from === e.from), inc = edges.filter(x => x.to === e.to)
    const sy = from.y + 24 + out.indexOf(e) * 16, ty = to.y + 24 + inc.indexOf(e) * 16
    const sx = from.x + from.w + (from.step.human_gate ? 8 : 0), tx = to.x
    const direct = e.kind === 'sequence' && !e.condition && out.length === 1 && inc.length === 1 && sy === ty && ranks.get(e.to) === ranks.get(e.from) + 1
    const points = direct ? [[sx, sy], [tx, ty]] : [[sx, sy], [from.x + from.w + 16 + i * 16, sy], [from.x + from.w + 16 + i * 16, buses[i].y], [to.x - 16 - i * 16, buses[i].y], [to.x - 16 - i * 16, ty], [tx, ty]]
    const segments = points.slice(1).map((p, j) => [...points[j], ...p])
    for (const seg of segments) for (const n of nodes) {
      if (n !== from && n !== to && segmentHitsRect(seg, n)) throw new DiagramError(`${e.id}: connector crosses ${n.step.id}`)
    }
    return { edge: e, points, segments, d: points.map((p, j) => `${j ? 'L' : 'M'}${p.join(' ')}`).join(''), direct }
  })
  const footer = wrapText(`Coverage: ${w.coverage.mode}. ${w.coverage.unknowns.length} unknown items; see review report.`, width - 2 * grid.pad)
  const height = up(y + 40 + footer.length * 16 + 32)
  for (const r of routes) for (const [x, y] of r.points) if (x < 0 || y < 0 || x > width || y > height) throw new DiagramError(`${r.edge.id}: connector leaves canvas`)
  for (const v of [width, height, ...nodes.flatMap(n => [n.x, n.y, n.w, n.h]), ...routes.flatMap(r => r.points.flat())]) if (v % 4 || !Number.isFinite(v)) throw new DiagramError(`Geometry ${v} is off the 4px grid`)
  return { nodes, routes, width, height, laneRows, buses, footer, footerY: y + 32, ranks: Object.fromEntries(ranks) }
}

export function compileGraph(w, display = {}) {
  const l = layoutGraph(w, display), prefix = `wf-${w.id}`
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">`, `<title id="${prefix}-title">${esc(w.title)} workflow diagram</title>`, `<desc id="${prefix}-desc">${esc(JSON.stringify({ steps: w.steps.map(s => ({ id: s.id, name: s.name, actor: s.actor_id, type: s.type })), edges: w.edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, condition: e.condition })), coverage: w.coverage }))}</desc>`, `<defs><marker id="${prefix}-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${colors.edge}"/></marker></defs>`, rect(0, 0, l.width, l.height, colors.paper, colors.rule)]
  for (const row of l.laneRows) {
    out.push(text(grid.pad, row.y + 32, row.actor.label, 11, colors[row.actor.kind]))
    out.push(text(grid.pad, row.y + 48, `${row.actor.kind} · ${row.actor.id}`, 11, colors.muted))
    out.push(`<line x1="24" y1="${row.y}" x2="${l.width - 24}" y2="${row.y}" stroke="${colors.rule}"/>`)
  }
  for (const r of l.routes) {
    const inferred = r.edge.evidence.some(e => e.support !== 'explicit')
    out.push(`<path id="${prefix}-edge-${esc(r.edge.id)}" data-edge-id="${esc(r.edge.id)}" data-from="${esc(r.edge.from)}" data-to="${esc(r.edge.to)}" data-kind="${r.edge.kind}" d="${r.d}" fill="none" stroke="${colors.edge}" ${inferred || r.edge.kind === 'feedback' ? 'stroke-dasharray="4 4"' : ''} marker-end="url(#${prefix}-arrow)"><title>${esc(`${r.edge.id}: ${r.edge.from} → ${r.edge.to} (${r.edge.kind}${r.edge.condition ? `: ${r.edge.condition}` : ''})`)}</title></path>`)
    const bus = l.buses.find(b => b.edge.id === r.edge.id)
    bus.lines.forEach((line, i) => out.push(text(grid.pad, bus.y - (bus.lines.length - i - 1) * 16 + 4, line, 11, colors.muted)))
  }
  for (const n of l.nodes) {
    const color = colors[n.step.actor]
    out.push(`<g id="${prefix}-node-${esc(n.step.id)}" data-node-id="${esc(n.step.id)}">`, rect(n.x, n.y, n.w, n.h, colors.paper, color, 'data-node-box="true"'), rect(n.x, n.y, 4, n.h, color))
    n.lines.forEach((line, i) => out.push(text(n.x + 16, n.y + 24 + i * 16, line, 13, colors.ink, 'data-node-label="true"')))
    out.push(text(n.x + 16, n.y + n.h - 12, n.step.execution === 'dynamic_parallel' ? 'DYNAMIC PARALLEL' : n.step.type === 'join' ? `JOIN ${n.step.join_policy}` : n.step.type.toUpperCase(), 11, colors.muted))
    if (n.step.human_gate) {
      const cx = n.x + n.w, cy = n.y + 24
      out.push(`<polygon points="${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}" fill="${colors.accent}"/>`)
    }
    out.push('</g>')
  }
  l.footer.forEach((line, i) => out.push(text(24, l.footerY + i * 16, line, 11, colors.muted)))
  out.push(text(24, l.height - 16, 'Dashed: inferred / unknown / migrated / feedback. Diamond: human gate.', 11, colors.muted), '</svg>')
  return out.join('\n') + '\n'
}

// A partition is only a view. Every semantic node and edge remains in the input and manifest.
export function graphViews(w) {
  validateWorkflow(w)
  if (w.steps.length <= budget.steps && w.steps.filter(s => s.human_gate).length <= budget.gates) return [{ id: 'full', workflow: w, step_ids: w.steps.map(s => s.id), edge_ids: w.edges.map(e => e.id) }]
  const groups = []
  let group = []
  for (const step of w.steps) {
    if (group.length >= 6 || (step.human_gate && group.filter(s => s.human_gate).length >= 3)) { groups.push(group); group = [] }
    group.push(step)
  }
  if (group.length) groups.push(group)
  if (groups.length > budget.steps) throw new DiagramError('Overview exceeds 9 groups; add an editorial hierarchy before rendering')
  const membership = new Map(groups.flatMap((ss, i) => ss.map(s => [s.id, `detail-${i + 1}`])))
  const evidence = [{ support: 'inferred', locator: 'Generated view partition', reason: 'Editorial grouping only; see original step_ids / edge_ids.' }]
  const overview = { ...w, id: `${w.id}-overview`, actors: [{ id: 'view', kind: 'tool', label: 'Detail views' }], steps: groups.map((ss, i) => ({ id: `detail-${i + 1}`, name: `Detail ${i + 1}: ${ss.length} steps, ${ss.filter(s => s.human_gate).length} gates`, actor: 'tool', actor_id: 'view', type: 'subprocess', evidence })), edges: w.edges.filter(e => membership.get(e.from) !== membership.get(e.to) || e.kind === 'feedback').map(e => ({ ...e, from: membership.get(e.from), to: membership.get(e.to), evidence })) }
  // Display group columns do not change original edge kinds, even after contraction.
  const layout_ranks = Object.fromEntries(overview.steps.map((s, i) => [s.id, i]))
  const views = [{ id: 'overview', workflow: overview, layout_ranks, groups: groups.map((ss, i) => ({ id: `detail-${i + 1}`, step_ids: ss.map(s => s.id) })), step_ids: w.steps.map(s => s.id), edge_ids: overview.edges.map(e => e.id) }]
  for (const [i, ss] of groups.entries()) {
    const ids = new Set(ss.map(s => s.id)), edges = w.edges.filter(e => ids.has(e.from) || ids.has(e.to))
    const boundary = [...new Set(edges.flatMap(e => [e.from, e.to]).filter(id => !ids.has(id)))].sort(compare)
    if (ss.length + boundary.length > budget.steps) throw new DiagramError(`detail-${i + 1}: too many external endpoints; requires an editorial view partition`)
    const steps = [...ss, ...boundary.map(id => ({ ...w.steps.find(s => s.id === id), name: `${membership.get(id)} / ${id}`, type: 'subprocess', human_gate: false }))]
    // These boundary copies are references, not assertions about local fork/join arity.
    const partial = { ...w, id: `${w.id}-detail-${i + 1}`, steps, edges }
    views.push({ id: `detail-${i + 1}`, workflow: partial, step_ids: ss.map(s => s.id), edge_ids: edges.map(e => e.id), boundary: boundary.map(id => ({ step_id: id, view: membership.get(id) })) })
  }
  return views
}
