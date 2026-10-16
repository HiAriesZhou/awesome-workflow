// Synthetic semantic/rendering fixtures. Never imported into workflows/.
const ev = [{ support: 'unknown', locator: 'Synthetic fixture', reason: 'Test data; not a real workflow.' }]
export function fixture(id, nodes, edges) {
  const kinds = [...new Set(nodes.map(n => n.actor || 'agent'))]
  return {
    schema_version: 2, id, title: `Synthetic ${id}`, summary: 'Synthetic topology fixture for semantic and visual regression checks only.',
    domain: 'other', tools: ['other'], lifecycle: 'draft', added: '2026-10-13',
    evidence: { status: 'unknown', method: 'Synthetic test, no real source.' },
    actors: kinds.map(kind => ({ id: kind, kind, label: kind })),
    sources: [{ id: 'fixture', label: 'Test only', url: 'https://example.com/synthetic', kind: 'unknown', locator: 'Test', checked_at: '2026-10-13T00:00:00Z', reuse_status: 'unknown' }],
    coverage: { mode: 'synthetic', unknowns: ['Not a published case.'] },
    steps: nodes.map((n, i) => ({ id: `s${i}`, name: `Step ${i}`, actor: 'agent', actor_id: n.actor || 'agent', type: 'action', evidence: structuredClone(ev), ...n })),
    edges: edges.map((e, i) => ({ id: `e${i}`, kind: 'sequence', evidence: structuredClone(ev), ...e })),
  }
}
export const topologies = [
  fixture('simple-chain', [{ name: 'Read source' }, { name: 'Prepare draft' }, { name: 'Check output' }], [{ from: 's0', to: 's1' }, { from: 's1', to: 's2' }]),
  fixture('conditional-route', [{ name: 'Check request', type: 'decision' }, { name: 'Accept request' }, { name: 'Ask for details', actor: 'human' }], [{ from: 's0', to: 's1', kind: 'conditional', condition: 'complete' }, { from: 's0', to: 's2', kind: 'conditional', condition: 'incomplete' }]),
  fixture('parallel-join', [{ name: 'Dispatch work', type: 'fork' }, { name: 'Research A' }, { name: 'Research B' }, { name: 'Gather results', type: 'join', join_policy: 'all' }], [{ from: 's0', to: 's1', kind: 'parallel' }, { from: 's0', to: 's2', kind: 'parallel' }, { from: 's1', to: 's3' }, { from: 's2', to: 's3' }]),
  fixture('feedback-loop', [{ name: 'Write draft' }, { name: 'Evaluate draft', type: 'decision' }, { name: 'Return result', actor: 'human' }], [{ from: 's0', to: 's1' }, { from: 's1', to: 's0', kind: 'feedback', condition: 'revise' }, { from: 's1', to: 's2', kind: 'conditional', condition: 'ready' }]),
  fixture('human-approval', [{ name: 'Submit request', actor: 'human' }, { name: 'Review request', actor: 'human', human_gate: true, type: 'approval' }, { name: 'Apply change', actor: 'tool' }], [{ from: 's0', to: 's1' }, { from: 's1', to: 's2', kind: 'conditional', condition: 'approved' }]),
]
topologies[4].actors = [{ id: 'employee', kind: 'human', label: 'Employee' }, { id: 'manager', kind: 'human', label: 'Manager' }, { id: 'tool', kind: 'tool', label: 'Automation' }]
topologies[4].steps[0].actor_id = 'employee'; topologies[4].steps[1].actor_id = 'manager'
export const longLabels = fixture('long-labels', [
  { name: '核对请求资料并记录需要人工确认的缺失信息' },
  { name: 'Prepare a detailed evidence based review for the responsible account manager', actor: 'human', human_gate: true, type: 'approval' },
], [{ from: 's0', to: 's1', condition: '中文和 English condition with a longer explanation' }])
export const complex = fixture('complex-split', Array.from({ length: 18 }, (_, i) => ({ name: `阶段 ${i + 1} 审核`, actor: 'human', human_gate: i % 2 === 0 })), Array.from({ length: 17 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}` })))
export const terminalLoop = fixture('terminal-loop', [{ name: 'Prepare' }, { name: 'Evaluate' }], [{ from: 's0', to: 's1' }, { from: 's1', to: 's0', kind: 'feedback', condition: 'revise' }])
