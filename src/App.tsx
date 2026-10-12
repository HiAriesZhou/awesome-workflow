import { useMemo, useState } from 'react'
import bundle from './data/workflows.json'
import type { Domain, Maturity, Tool, Workflow, WorkflowBundle } from './lib/types'
import { domainLabel, toolLabel } from './lib/labels'
import { WorkflowCard } from './components/WorkflowCard'
import { WorkflowDetail } from './components/WorkflowDetail'

const data = bundle as WorkflowBundle

const ALL = 'all' as const

export default function App() {
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState<Domain | typeof ALL>(ALL)
  const [tool, setTool] = useState<Tool | typeof ALL>(ALL)
  const [maturity, setMaturity] = useState<Maturity | typeof ALL>(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(
    data.workflows[0]?.id ?? null
  )

  const domains = useMemo(
    () => [...new Set(data.workflows.map((w) => w.domain))].sort(),
    []
  )
  const tools = useMemo(
    () => [...new Set(data.workflows.flatMap((w) => w.tools))].sort(),
    []
  )
  const maturities = useMemo(
    () => [...new Set(data.workflows.map((w) => w.maturity))].sort(),
    []
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.workflows.filter((w) => {
      if (domain !== ALL && w.domain !== domain) return false
      if (tool !== ALL && !w.tools.includes(tool)) return false
      if (maturity !== ALL && w.maturity !== maturity) return false
      if (!q) return true
      const hay = [
        w.title,
        w.summary,
        w.domain,
        ...(w.tags ?? []),
        ...w.tools,
        ...w.steps.map((s) => s.name),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [query, domain, tool, maturity])

  const selected: Workflow | undefined =
    filtered.find((w) => w.id === selectedId) ?? filtered[0]

  return (
    <div className="app">
      <header className="hero">
        <div className="eyebrow">Awesome Workflow · MIT library</div>
        <h1>Study real agent workflows, don&apos;t invent them alone.</h1>
        <p>
          A curated gallery of structured recipes from notable GitHub projects.
          Filter, open a case, and see who acts at each step, where humans gate,
          and where the evidence lives. This is a library, not a one-click
          generator and not a runtime engine.
        </p>
        <div className="hero-actions">
          <a
            className="btn primary"
            href="https://github.com/HiAriesZhou/awesome-workflow"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repo
          </a>
          <a
            className="btn"
            href="https://github.com/HiAriesZhou/awesome-workflow/tree/main/workflows"
            target="_blank"
            rel="noreferrer"
          >
            Browse YAML
          </a>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('')
              setDomain(ALL)
              setTool(ALL)
              setMaturity(ALL)
            }}
          >
            Reset filters
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search title, tools, steps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search workflows"
        />
        <div className="filters" role="group" aria-label="Domain">
          <button
            type="button"
            className={`chip${domain === ALL ? ' active' : ''}`}
            onClick={() => setDomain(ALL)}
          >
            All domains
          </button>
          {domains.map((d) => (
            <button
              type="button"
              key={d}
              className={`chip${domain === d ? ' active' : ''}`}
              onClick={() => setDomain(d)}
            >
              {domainLabel[d] ?? d}
            </button>
          ))}
        </div>
        <div className="filters" role="group" aria-label="Tool">
          <button
            type="button"
            className={`chip${tool === ALL ? ' active' : ''}`}
            onClick={() => setTool(ALL)}
          >
            All tools
          </button>
          {tools.map((t) => (
            <button
              type="button"
              key={t}
              className={`chip${tool === t ? ' active' : ''}`}
              onClick={() => setTool(t)}
            >
              {toolLabel[t] ?? t}
            </button>
          ))}
        </div>
        <div className="filters" role="group" aria-label="Maturity">
          <button
            type="button"
            className={`chip${maturity === ALL ? ' active' : ''}`}
            onClick={() => setMaturity(ALL)}
          >
            All maturity
          </button>
          {maturities.map((m) => (
            <button
              type="button"
              key={m}
              className={`chip${maturity === m ? ' active' : ''}`}
              onClick={() => setMaturity(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="meta-row">
          <span>
            Showing {filtered.length} / {data.count} workflows
          </span>
          <span>Data generated {data.generated_at.slice(0, 10)}</span>
        </div>
      </div>

      <div className={`layout${selected ? ' split' : ''}`}>
        <section>
          {filtered.length === 0 ? (
            <div className="empty">No workflows match these filters.</div>
          ) : (
            <div className="grid">
              {filtered.map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  active={selected?.id === w.id}
                  onSelect={() => setSelectedId(w.id)}
                />
              ))}
            </div>
          )}
        </section>
        {selected ? <WorkflowDetail workflow={selected} /> : null}
      </div>

      <footer className="footer">
        MIT · Contributions welcome via YAML PRs · Not affiliated with the
        upstream projects we cite · Stars captured 2026-10-10 via GitHub API
      </footer>
    </div>
  )
}
