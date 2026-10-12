import type { Workflow } from '../lib/types'
import { actorLabel, domainLabel, toolLabel } from '../lib/labels'

export function WorkflowDetail({ workflow }: { workflow: Workflow }) {
  return (
    <aside className="panel" aria-live="polite">
      <div className="eyebrow">Case reference</div>
      <h2>{workflow.title}</h2>
      <p className="summary">{workflow.summary}</p>

      <div className="badges">
        <span className="badge teal">{domainLabel[workflow.domain] ?? workflow.domain}</span>
        <span className="badge">{workflow.maturity}</span>
        {workflow.automation ? (
          <span className="badge amber">{workflow.automation}</span>
        ) : null}
        {workflow.tools.map((t) => (
          <span className="badge" key={t}>
            {toolLabel[t] ?? t}
          </span>
        ))}
      </div>

      {workflow.authors?.length ? (
        <p className="io">Authors: {workflow.authors.join(', ')}</p>
      ) : null}

      <div className="swimlane">
        {workflow.steps.map((step, index) => (
          <div className="step" key={step.id}>
            <div className="rail">
              <div className={`dot ${step.actor}`}>{index + 1}</div>
            </div>
            <div className="step-body">
              <h4>{step.name}</h4>
              <div className="step-meta">
                <span className="badge">{actorLabel[step.actor]}</span>
                {step.human_gate ? <span className="badge rose">human gate</span> : null}
                {step.model_tier && step.model_tier !== 'unknown' ? (
                  <span className="badge amber">{step.model_tier} model</span>
                ) : null}
              </div>
              {step.inputs?.length || step.outputs?.length ? (
                <div className="io">
                  {step.inputs?.length ? <>in: {step.inputs.join(', ')} · </> : null}
                  {step.outputs?.length ? <>out: {step.outputs.join(', ')}</> : null}
                </div>
              ) : null}
              {step.notes ? <p className="step-notes">{step.notes}</p> : null}
              {step.evidence_url ? (
                <p className="step-notes">
                  <a href={step.evidence_url} target="_blank" rel="noreferrer">
                    Evidence
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {workflow.not_for?.length ? (
        <div className="not-for">
          <h3>Not for</h3>
          <ul>
            {workflow.not_for.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sources">
        <h3>Sources</h3>
        <ul>
          {workflow.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
              {typeof s.stars === 'number'
                ? ` (★ ${s.stars.toLocaleString('en-US')})`
                : ''}
            </li>
          ))}
        </ul>
        <p className="io" style={{ marginTop: 10 }}>
          Added {workflow.added} · Verified {workflow.verified}
        </p>
      </div>
    </aside>
  )
}
