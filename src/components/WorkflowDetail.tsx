import { useEffect, useRef } from 'react'
import type { EvidenceRef, Workflow } from '../lib/types'
import { actorLabel, domainLabel, toolLabel } from '../lib/labels'
import type { Selection } from './InteractiveDiagram'

type Edge = NonNullable<Workflow['edges']>[number]
const kindLabel: Record<string, string> = { sequence: 'Next step', conditional: 'Conditional route', parallel: 'Parallel dispatch', feedback: 'Feedback loop' }
const supportLabel: Record<string, string> = { migrated: 'Imported from legacy data; not independently checked.', inferred: 'Inferred from the source; needs review.', unknown: 'Not established by the source.', explicit: 'Recorded in the source.' }

export function ConnectionInfo({ workflow, edge, compact = false }: { workflow: Workflow; edge: Edge; compact?: boolean }) {
  const from = workflow.steps.find(s => s.id === edge.from)
  const to = workflow.steps.find(s => s.id === edge.to)
  return <>
    <div className="eyebrow">{kindLabel[edge.kind] || edge.kind}</div>
    <h3>{from?.name || edge.from} <span className="connection-arrow">→</span> {to?.name || edge.to}</h3>
    {edge.condition ? <p><strong>Condition</strong> {edge.condition}</p> : null}
    {from?.outputs?.length ? <p><strong>From this step</strong> {from.outputs.join(', ')}</p> : null}
    {to?.inputs?.length && !compact ? <p><strong>Next step expects</strong> {to.inputs.join(', ')}</p> : null}
    {from?.human_gate ? <p className="approval-note">Human approval at the preceding step</p> : null}
    {compact ? <p className="evidence-note">{[...new Set(edge.evidence.map(e => e.support === 'migrated' ? 'From legacy step order; not independently checked.' : supportLabel[e.support] || e.support))].join(' ') || 'Evidence not recorded.'}</p> : <EvidenceList workflow={workflow} refs={edge.evidence} />}
  </>
}

function EvidenceList({ workflow, refs }: { workflow: Workflow; refs?: EvidenceRef[] }) {
  return refs?.length ? <div className="evidence-list">{refs.map((e, i) => {
    const source = workflow.sources.find(s => s.id === e.source_id)
    return <div key={i}><p>{supportLabel[e.support] || e.support}</p><p className="detail-muted">{e.locator}</p>{e.reason ? <p className="detail-muted">{e.reason}</p> : null}{source ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : null}</div>
  })}</div> : <p className="detail-muted">Evidence not recorded.</p>
}

export function WorkflowDetail({ workflow, selection, onSelect, onView }: { workflow: Workflow; selection: Selection; onSelect: (s: Selection) => void; onView: (id: string) => void }) {
  const panel = useRef<HTMLElement>(null)
  const step = selection?.kind === 'node' ? workflow.steps.find(s => s.id === selection.id) : undefined
  const edge = selection?.kind === 'edge' ? workflow.edges?.find(e => e.id === selection.id) : undefined
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [selection])
  return <aside className="inspector" ref={panel} aria-label="Workflow details">
    {selection ? <section className="selection-detail" aria-live="polite">
      <button className="text-button" onClick={() => onSelect(null)}>← Case overview</button>
      {step ? <>
        <div className="eyebrow">Step {workflow.steps.indexOf(step) + 1} <span> / {workflow.steps.length}</span></div>
        <h3>{step.name}</h3>
        <div className="badges"><span className="badge"><i className={`actor-dot ${step.actor}`} />{workflow.actors?.find(a => a.id === step.actor_id)?.label || actorLabel[step.actor]}</span>{step.human_gate ? <span className="badge gate">Human approval</span> : null}{step.model_tier && step.model_tier !== 'unknown' ? <span className="badge">{step.model_tier} model</span> : null}</div>
        {step.notes ? <p>{step.notes}</p> : null}
        <dl className="step-io"><dt>Inputs</dt><dd>{step.inputs?.join(', ') || 'Not recorded'}</dd><dt>Outputs</dt><dd>{step.outputs?.join(', ') || 'Not recorded'}</dd></dl>
        {step.evidence_url ? <a href={step.evidence_url} target="_blank" rel="noreferrer">Step source ↗</a> : null}
        <EvidenceList workflow={workflow} refs={step.evidence} />
        <div className="related-connections"><h4>Connected steps</h4>{workflow.edges?.filter(e => e.from === step.id || e.to === step.id).map(e => <button key={e.id} onClick={() => onSelect({ kind: 'edge', id: e.id })}>{e.from === step.id ? '→ ' : '← '}{workflow.steps.find(s => s.id === (e.from === step.id ? e.to : e.from))?.name}</button>)}</div>
        {workflow.diagram_views && workflow.diagram_views.length > 1 ? <div className="related-connections"><h4>Find in detail view</h4>{workflow.diagram_views.filter(v => v.id !== 'overview' && v.step_ids.includes(step.id)).map(v => <button key={v.id} onClick={() => onView(v.id)}>{v.id.replace('detail-', 'Detail ')}</button>)}</div> : null}
      </> : edge ? <ConnectionInfo workflow={workflow} edge={edge} /> : <p>This item belongs to another diagram view.</p>}
    </section> : <div className="inspector-intro"><span className="eyebrow">Case overview</span><p>Select a node for its inputs, outputs and evidence. Hover a line to see the connection.</p></div>}
    <section className="detail-section"><h3>Purpose</h3><p>{workflow.summary}</p>{workflow.tags?.length ? <div className="badges">{workflow.tags.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div> : null}</section>
    <section className="detail-section"><h3>About this case</h3><dl className="case-facts"><dt>Authors</dt><dd>{workflow.authors?.join(', ') || 'Not recorded'}</dd><dt>Domain</dt><dd>{domainLabel[workflow.domain] || workflow.domain}</dd><dt>Automation</dt><dd>{workflow.automation || 'Not recorded'}</dd><dt>Publication</dt><dd>{workflow.lifecycle || 'published'}</dd><dt>Evidence</dt><dd>{workflow.evidence?.status.replaceAll('_', ' ') || 'unknown'}</dd></dl><p className="detail-muted">{workflow.evidence?.method || 'Source check and reproduction have not been established.'}</p></section>
    <section className="detail-section"><h3>Toolchain</h3><div className="badges">{workflow.tools.map(t => <span className="badge" key={t}>{toolLabel[t] || t}</span>)}</div></section>
    <section className="detail-section"><h3>Sources & links</h3><div className="source-links">{workflow.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer"><span>{s.label}</span><span aria-hidden="true">↗</span></a>)}<a href={`https://github.com/HiAriesZhou/awesome-workflow/blob/main/workflows/${workflow.id}.yml`} target="_blank" rel="noreferrer"><span>Workflow YAML</span><span aria-hidden="true">↗</span></a></div><p className="detail-muted">Added {workflow.added}{workflow.verified ? ` · Legacy review ${workflow.verified}` : ''}</p></section>
    <section className="detail-section"><h3>Steps</h3><div className="step-index">{workflow.steps.map((s, i) => <button key={s.id} aria-pressed={selection?.kind === 'node' && selection.id === s.id} onClick={() => {
      const view = workflow.diagram_views?.find(v => v.id !== 'overview' && v.step_ids.includes(s.id))
      if (view) onView(view.id)
      onSelect({ kind: 'node', id: s.id })
    }}><span className="step-number">{String(i + 1).padStart(2, '0')}</span><span>{s.name}</span><i className={`actor-dot ${s.actor}`} /></button>)}</div></section>
    {workflow.coverage?.unknowns.length ? <section className="detail-section"><h3>Unknowns</h3><ul>{workflow.coverage.unknowns.map(item => <li key={item}>{item}</li>)}</ul></section> : null}
    {workflow.coverage?.inferences?.length ? <section className="detail-section"><h3>Inferences</h3><ul>{workflow.coverage.inferences.map(item => <li key={item}>{item}</li>)}</ul></section> : null}
    {workflow.not_for?.length ? <section className="detail-section"><h3>Not suitable for</h3><ul>{workflow.not_for.map(item => <li key={item}>{item}</li>)}</ul></section> : null}
  </aside>
}
