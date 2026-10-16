import { useEffect, useRef, useState } from 'react'
import type { Workflow } from '../lib/types'
import { domainLabel } from '../lib/labels'
import { InteractiveDiagram, type Selection } from './InteractiveDiagram'
import { WorkflowDetail } from './WorkflowDetail'

export function WorkflowExplorer({ workflow, onClose, rawViews }: { workflow: Workflow; onClose: () => void; rawViews?: Record<string, string> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const views = workflow.diagram_views || [{ id: 'full', file: `${workflow.id}.svg` }]
  const [viewId, setViewId] = useState(views[0].id)
  const [selection, setSelection] = useState<Selection>(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => {
      element?.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog ref={dialog} className="explorer" aria-labelledby="explorer-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialog.current) onClose() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
      <div className="explorer-frame">
        <header className="explorer-header">
          <div><div className="eyebrow">{domainLabel[workflow.domain] || workflow.domain} <span> / {workflow.steps.length} steps</span></div><h2 id="explorer-title">{workflow.title}</h2></div>
          <button className="icon-button close-button" aria-label="Close workflow" onClick={onClose} autoFocus><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
        </header>
        <div className="explorer-body">
          <section className="diagram-workspace" aria-label="Interactive workflow">
            {views.length > 1 ? <nav className="view-tabs" aria-label="Diagram views">{views.map(v => <button key={v.id} aria-pressed={v.id === viewId} onClick={() => { setViewId(v.id); setSelection(null) }}>{v.id === 'overview' ? 'Overview' : v.id.replace('detail-', 'Detail ')}</button>)}</nav> : null}
            <InteractiveDiagram key={viewId} workflow={workflow} viewId={viewId} selection={selection} onSelect={setSelection} onView={id => { setViewId(id); setSelection(null) }} rawSvg={rawViews?.[viewId]} />
          </section>
          <WorkflowDetail workflow={workflow} selection={selection} onSelect={setSelection} onView={setViewId} />
        </div>
      </div>
    </dialog>
  )
}
