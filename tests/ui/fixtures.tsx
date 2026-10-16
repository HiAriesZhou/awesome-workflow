// Browser-only test harness. Not imported by the production gallery.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkflowExplorer } from '../../src/components/WorkflowExplorer'
import type { Workflow } from '../../src/lib/types'
import '../../src/styles/global.css'

type Case = { workflow: Workflow; rawViews: Record<string, string> }
const cases: Case[] = await fetch(`${import.meta.env.BASE_URL}__gallery_cases.json`).then(r => r.json())
function Fixtures() {
  const [selected, setSelected] = useState<Case | null>(null)
  return <div className="app"><h1>Synthetic fixtures, not published cases</h1>{cases.map(c => <button className="btn" key={c.workflow.id} onClick={() => setSelected(c)}>{c.workflow.id}</button>)}{selected ? <WorkflowExplorer key={selected.workflow.id} workflow={selected.workflow} rawViews={selected.rawViews} onClose={() => setSelected(null)} /> : null}</div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixtures /></StrictMode>)
