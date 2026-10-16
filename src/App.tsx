import { useCallback, useMemo, useState } from 'react'
import bundle from './data/workflows.json'
import type { WorkflowBundle } from './lib/types'
import { actorLabel, domainLabel, toolLabel } from './lib/labels'
import { WorkflowCard } from './components/WorkflowCard'
import { WorkflowExplorer } from './components/WorkflowExplorer'

const data = bundle as WorkflowBundle

export default function App() {
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('all')
  const [tool, setTool] = useState('all')
  const [evidence, setEvidence] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const close = useCallback(() => setSelectedId(null), [])
  const domains = [...new Set(data.workflows.map(w => w.domain))].sort()
  const tools = [...new Set(data.workflows.flatMap(w => w.tools))].sort()
  const statuses = [...new Set(data.workflows.map(w => w.evidence?.status || 'unknown'))].sort()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.workflows.filter(w => {
      if (domain !== 'all' && w.domain !== domain) return false
      if (tool !== 'all' && !w.tools.some(t => t === tool)) return false
      if (evidence !== 'all' && (w.evidence?.status || 'unknown') !== evidence) return false
      return !q || [w.title, w.summary, w.domain, domainLabel[w.domain], ...(w.authors || []),
        ...(w.tags || []), ...w.tools, ...w.tools.map(t => toolLabel[t]), ...w.steps.map(s => s.name)]
        .join(' ').toLowerCase().includes(q)
    })
  }, [query, domain, tool, evidence])
  const selected = data.workflows.find(w => w.id === selectedId)
  const hasFilters = query !== '' || domain !== 'all' || tool !== 'all' || evidence !== 'all'
  const reset = () => { setQuery(''); setDomain('all'); setTool('all'); setEvidence('all') }

  return (
    <div className="app">
      <a className="skip-link" href="#gallery">Skip to workflows</a>
      <header className="site-header">
        <a className="wordmark" href={import.meta.env.BASE_URL}>awesome<span>workflow</span><span className="wordmark-dot" /></a>
        <span className="site-note">Real workflows. In full view.</span>
        <a className="repo-link" href="https://github.com/HiAriesZhou/awesome-workflow" target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>
      <section className="toolbar" aria-label="Search and filter workflows">
        <label className="search-field">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input type="search" placeholder="Search workflows, authors, tools…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search workflows" />
        </label>
        <label className="filter-field"><span>Domain</span><select aria-label="Domain" value={domain} onChange={e => setDomain(e.target.value)}><option value="all">All domains</option>{domains.map(d => <option value={d} key={d}>{domainLabel[d] || d}</option>)}</select></label>
        <label className="filter-field"><span>Tool</span><select aria-label="Tool" value={tool} onChange={e => setTool(e.target.value)}><option value="all">All tools</option>{tools.map(t => <option value={t} key={t}>{toolLabel[t] || t}</option>)}</select></label>
        <label className="filter-field"><span>Evidence</span><select aria-label="Evidence" value={evidence} onChange={e => setEvidence(e.target.value)}><option value="all">All evidence</option>{statuses.map(s => <option value={s} key={s}>{s.replaceAll('_', ' ')}</option>)}</select></label>
        <button className="text-button reset" onClick={reset} disabled={!hasFilters}>Reset filters</button>
      </section>
      <main id="gallery" tabIndex={-1}>
        <div className="collection-heading">
          <div><h1>Workflow gallery</h1><p aria-live="polite">{filtered.length} of {data.count} cases <span>· Open a diagram to explore its steps</span></p></div>
          <div className="actor-key" aria-label="Diagram legend">{Object.entries(actorLabel).map(([id, label]) => <span key={id}><i className={`actor-dot ${id}`} />{label}</span>)}<span><i className="gate-symbol" />Approval</span></div>
        </div>
        {filtered.length ? <div className="gallery-grid">{filtered.map(w => <WorkflowCard key={w.id} workflow={w} onSelect={() => setSelectedId(w.id)} />)}</div> :
          <div className="empty"><h2>No matching workflows</h2><p>Try another title, author or tool.</p><button className="btn" onClick={reset}>Reset filters</button></div>}
      </main>
      <footer className="footer"><span>Awesome Workflow · MIT</span><span>Sources are cited per case. Source checks and reproduction are recorded separately.</span></footer>
      {selected ? <WorkflowExplorer key={selected.id} workflow={selected} onClose={close} /> : null}
    </div>
  )
}
