import { useId, useMemo } from 'react'
import type { Workflow } from '../lib/types'
import { diagramMarkup } from '../lib/diagram'

const diagrams = import.meta.glob<string>('/docs/diagrams/*.svg', { query: '?raw', import: 'default', eager: true })

export function getDiagram(workflow: Workflow, viewId?: string) {
  const views = workflow.diagram_views || [{ id: 'full', file: `${workflow.id}.svg` }]
  const view = views.find(v => v.id === viewId) || views[0]
  return { view, raw: diagrams[`/docs/diagrams/${view.file}`] }
}

export function WorkflowDiagram({ workflow }: { workflow: Workflow }) {
  const instance = useId()
  const { raw } = getDiagram(workflow)
  const markup = useMemo(() => raw ? diagramMarkup(raw, workflow, instance, false) : '', [raw, workflow, instance])
  return markup ? <div className="diagram-thumbnail" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} /> : <div className="diagram-missing">Diagram unavailable</div>
}
