import type { Workflow } from '../lib/types'
import { domainLabel, toolLabel } from '../lib/labels'

export function WorkflowCard({
  workflow,
  active,
  onSelect,
}: {
  workflow: Workflow
  active: boolean
  onSelect: () => void
}) {
  const topStars = Math.max(
    0,
    ...workflow.sources.map((s) => s.stars ?? 0)
  )

  return (
    <button
      type="button"
      className={`card${active ? ' active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="badges">
        <span className="badge teal">{domainLabel[workflow.domain] ?? workflow.domain}</span>
        <span className="badge">{workflow.maturity}</span>
        {workflow.automation ? (
          <span className="badge amber">{workflow.automation}</span>
        ) : null}
        {topStars > 0 ? (
          <span className="badge">★ {topStars.toLocaleString('en-US')}</span>
        ) : null}
      </div>
      <h3>{workflow.title}</h3>
      <p>{workflow.summary}</p>
      <div className="badges" style={{ marginTop: 12, marginBottom: 0 }}>
        {workflow.tools.slice(0, 4).map((t) => (
          <span className="badge" key={t}>
            {toolLabel[t] ?? t}
          </span>
        ))}
      </div>
    </button>
  )
}
