import type { Workflow } from '../lib/types'
import { domainLabel, toolLabel } from '../lib/labels'
import { WorkflowDiagram } from './WorkflowDiagram'

export function WorkflowCard({ workflow, onSelect }: { workflow: Workflow; onSelect: () => void }) {
  return (
    <button type="button" className="gallery-item" onClick={onSelect} aria-label={`Explore ${workflow.title}`} aria-haspopup="dialog">
      <div className="gallery-preview">
        <div className="preview-topline"><span>{domainLabel[workflow.domain] || workflow.domain}</span><span>{workflow.steps.length} steps · {workflow.steps.filter(s => s.human_gate).length} approvals</span></div>
        <WorkflowDiagram workflow={workflow} />
        <span className="open-hint">Explore workflow ↗</span>
      </div>
      <div className="gallery-caption">
        <h2>{workflow.title}</h2>
        <p className="gallery-author">{workflow.authors?.join(', ') || 'Author not recorded'}</p>
        <div className="gallery-tools">{workflow.tools.map(t => <span key={t}>{toolLabel[t] || t}</span>)}</div>
      </div>
    </button>
  )
}
