import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { canonicalURL, candidateKey, fetchSource, readNative, hash, scanSensitive, SourceError } from './source.mjs'
import { validateWorkflow, compare } from '../workflow.mjs'
import { compileDiagramSet } from '../diagram/compile.mjs'
import { esc } from '../diagram/graph.mjs'

export function atomicJSON(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const tmp = `${filename}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, filename)
}
export const readJSON = filename => JSON.parse(fs.readFileSync(filename, 'utf8'))
export function loadState(dir) {
  return fs.existsSync(path.join(dir, 'queue.json')) ? readJSON(path.join(dir, 'queue.json')) : { version: 1, max_pending: 20, candidates: [] }
}
export const saveState = (dir, state) => atomicJSON(path.join(dir, 'queue.json'), state)
const pendingCandidate = c => ['awaiting_review', 'source_changed', 'needs_manual', 'changes_requested'].includes(c.status) || (c.status === 'needs_repair' && Boolean(c.package))
export const pendingCount = state => state.candidates.filter(pendingCandidate).length
const safeID = id => { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new SourceError('invalid_input', 'ID must be kebab-case'); return id }

export function importSeeds(dir, registry, seeds) {
  const state = loadState(dir)
  let added = 0, updated = 0, skipped = 0
  for (const input of seeds.candidates) {
    safeID(input.id); scanSensitive(input)
    if (!registry.sources.some(s => s.id === input.source_id)) throw new SourceError('invalid_input', `${input.id}: unregistered source_id`)
    // Index pages can describe different workflows: seed identity is the workflow ID.
    const seed = { ...input, workflow_id: input.workflow_id || input.id, url: canonicalURL(input.url) }, key = candidateKey(seed)
    const previous = state.candidates.find(c => c.key === key)
    const fingerprint = hash(JSON.stringify(seed))
    if (previous) {
      if (previous.seed_hash === fingerprint) { skipped++; continue }
      previous.seed = seed; previous.seed_hash = fingerprint; previous.next_action = seed.next_action; updated++
      continue
    }
    if (state.candidates.some(c => c.id === seed.id)) throw new SourceError('invalid_input', `${seed.id}: ID already belongs to a different source`)
    const full = pendingCount(state) >= state.max_pending
    state.candidates.push({ id: seed.id, key, url: seed.url, workflow_id: seed.workflow_id, source_id: seed.source_id, seed, seed_hash: fingerprint, status: full ? 'paused_capacity' : 'candidate', lifecycle: 'candidate', evidence_status: 'unknown', next_action: seed.next_action, permission_review: 'pending', reproduced: false, failed_attempts: 0 })
    added++
  }
  state.candidates.sort((a, b) => compare(a.id, b.id))
  saveState(dir, state)
  return { added, updated, skipped, total: state.candidates.length, pending: pendingCount(state) }
}

export function addSource(dir, source, registry, { workflowID, sourcePath } = {}) {
  const state = loadState(dir)
  const native = !/^https?:/.test(source)
  const observed = native ? readNative(source) : null // Scan before storing even candidate metadata.
  const url = native ? `https://example.invalid/user-native/${hash(path.resolve(source))}` : canonicalURL(source)
  const source_id = native ? 'user-native' : registry.sources.find(s => (s.allowed_prefixes || [s.url]).some(p => url === canonicalURL(p) || url.startsWith(`${canonicalURL(p)}/`)))?.id
  if (!source_id) throw new SourceError('forbidden', 'Add an explicit allowed registry entry before reading this source')
  const item = { url, workflow_id: workflowID || (native ? observed.value.id || path.basename(source) : 'source'), ...(sourcePath ? { source_path: sourcePath } : {}) }
  const key = candidateKey(item), previous = state.candidates.find(c => c.key === key)
  if (previous) return previous
  const id = `source-${hash(key).slice(0, 16)}`
  const full = pendingCount(state) >= state.max_pending
  const c = { ...item, id, key, source_id, ...(native ? { native_file: path.resolve(source) } : {}), status: full ? 'paused_capacity' : 'candidate', lifecycle: 'candidate', evidence_status: 'unknown', next_action: 'Read source, map evidence and write a v2 draft. No execution.', permission_review: 'pending', reproduced: false, failed_attempts: 0 }
  state.candidates.push(c); state.candidates.sort((a, b) => compare(a.id, b.id)); saveState(dir, state)
  return c
}

export async function acquire(dir, candidateID, registry, options = {}) {
  let state = loadState(dir), c = state.candidates.find(c => c.id === candidateID)
  if (!c) throw new SourceError('missing', 'Candidate ID not found; import seeds or add the source first')
  if (c.status === 'paused_capacity' && pendingCount(state) >= state.max_pending) return { paused: true, id: c.id }
  try {
    const result = c.native_file ? readNative(c.native_file) : await fetchSource(c.url, registry, { ...options, etag: c.snapshot?.etag })
    // The slow read must not overwrite unrelated updates to other candidates.
    state = loadState(dir); c = state.candidates.find(c => c.id === candidateID)
    c.last_fetch = { result: result.unchanged ? 'unchanged' : 'read', checked_at: new Date().toISOString(), http_status: result.http_status || null }
    if (result.unchanged) {
      if (!c.snapshot || !fs.existsSync(path.join(dir, c.snapshot.file))) throw new SourceError('transient_error', '304 received but cached source is missing; remove stale ETag and retry')
      saveState(dir, state); return { ...c.snapshot, content: fs.readFileSync(path.join(dir, c.snapshot.file), 'utf8'), unchanged: true }
    }
    const same = result.content_hash === c.snapshot?.content_hash
    const snapshot = { canonical_url: c.url, request_url: result.request_url || null, content_hash: result.content_hash, checked_at: result.checked_at, etag: result.etag || null, content_type: result.content_type || 'application/json', file: `sources/${c.id}/${result.content_hash}.txt` }
    fs.mkdirSync(path.dirname(path.join(dir, snapshot.file)), { recursive: true })
    fs.writeFileSync(path.join(dir, snapshot.file), result.content)
    atomicJSON(path.join(dir, 'sources', c.id, 'latest.json'), snapshot)
    if (!same) {
      c.status = c.package ? 'source_changed' : 'needs_extraction'
      c.next_action = 'Agent: read the local source snapshot and update evidence-bound draft.'
    }
    c.snapshot = snapshot; c.last_fetch.result = same ? 'unchanged' : 'read'; delete c.failure
    saveState(dir, state)
    return { ...snapshot, content: result.content, unchanged: same }
  } catch (e) {
    state = loadState(dir); c = state.candidates.find(c => c.id === candidateID)
    c.status = e.kind || 'transient_error'; c.failure = { kind: c.status, message: e.message }; c.next_action = c.status === 'missing' ? 'Resolve the exact source file/URL before extraction.' : c.status === 'forbidden' ? 'Review allowed access; do not bypass the restriction.' : 'Retry later or resolve the recorded failure.'
    saveState(dir, state); throw e
  }
}

export function bindSource(w, snapshot) {
  const matched = w.sources.filter(s => canonicalURL(s.url) === snapshot.canonical_url && s.content_hash === snapshot.content_hash)
  if (!matched.length) throw new SourceError('source_mismatch', 'Draft needs a source URL and content_hash matching the current snapshot; Agent must review changes')
  const sources = new Map(w.sources.map(s => [s.id, s]))
  for (const item of [...w.steps, ...w.edges]) for (const e of item.evidence) {
    if (e.support !== 'explicit') continue
    const s = sources.get(e.source_id)
    if (!matched.some(m => m.id === s.id)) throw new SourceError('source_mismatch', `${item.id}: explicit evidence is not bound to the acquired source`)
    if (e.locator.startsWith('json:')) {
      let value
      try { value = JSON.parse(snapshot.content) } catch { throw new SourceError('source_mismatch', `${item.id}: JSON locator needs native JSON`) }
      const pointer = e.locator.slice(5)
      if (!pointer.startsWith('/')) throw new SourceError('source_mismatch', `${item.id}: JSON pointer must start with /`)
      for (const part of pointer.slice(1).split('/')) value = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')]
      if (value === undefined) throw new SourceError('source_mismatch', `${item.id}: JSON pointer does not exist`)
    } else if (e.locator.startsWith('lines:')) {
      const m = /^lines:(\d+)-(\d+)$/.exec(e.locator), count = snapshot.content.split('\n').length
      if (!m || +m[1] < 1 || +m[1] > +m[2] || +m[2] > count) throw new SourceError('source_mismatch', `${item.id}: source line range does not exist`)
    } else {
      const section = e.locator.split(/\s*[·|]\s*/)[0]
      if (!snapshot.content.toLowerCase().includes(section.toLowerCase())) throw new SourceError('source_mismatch', `${item.id}: evidence locator not found in current snapshot`)
    }
  }
}

export async function prepareCase({ dir, candidateID, registry, draftPath, output, fetchOptions, browserCheck }) {
  const snapshot = await acquire(dir, candidateID, registry, fetchOptions)
  if (snapshot.paused) return snapshot
  const state = loadState(dir), c = state.candidates.find(c => c.id === candidateID)
  if (c.failed_attempts >= 3) { c.status = 'needs_manual'; saveState(dir, state); throw new SourceError('needs_manual', 'Initial attempt plus two repair rounds exhausted; use resume after manual review') }
  let staging
  try {
    const raw = fs.readFileSync(draftPath, 'utf8')
    scanSensitive(raw)
    let w
    try { w = YAML.parse(raw) } catch { throw new SourceError('invalid_input', 'Draft YAML cannot be parsed; fix syntax before validation') }
    scanSensitive(w)
    validateWorkflow(w)
    if (w.schema_version !== 2 || w.lifecycle !== 'draft') throw new SourceError('invalid_input', 'Review packages require a v2 draft; publication is separate')
    if (['reproduced', 'author_confirmed'].includes(w.evidence.status)) throw new SourceError('invalid_input', 'This preparation command only records source checks; confirmation/reproduction require separate human evidence review')
    bindSource(w, snapshot)
    const draftHash = hash(JSON.stringify(w)), target = path.resolve(output, safeID(w.id))
    const rendererFingerprint = hash(['../diagram/compile.mjs', '../diagram/graph.mjs', '../diagram/theme.mjs', '../workflow.mjs', '../../schema/workflow.schema.json', './pipeline.mjs', '../diagram/browser.mjs'].map(file => fs.readFileSync(new URL(file, import.meta.url))).join('\n'))
    if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory())) throw new SourceError('protected_output', 'Output target must be an owned case directory, not a file or symlink')
    const previous = fs.existsSync(path.join(target, 'report.json')) ? readJSON(path.join(target, 'report.json')) : null
    if (fs.existsSync(target)) {
      if (previous?.version !== 1 || previous.id !== w.id || previous.candidate_id !== c.id) throw new SourceError('protected_output', 'Refusing to replace a directory not owned by this case')
      const expected = new Set(['workflow.yml', 'evidence.json', 'index.html', 'review.md', 'report.json', 'browser-report.json', ...previous.views.flatMap(v => [v.file, `${v.id}.png`])])
      for (const name of fs.readdirSync(target)) if (!expected.has(name)) throw new SourceError('protected_output', 'Case directory contains additional files; preserve them or choose another output directory')
      const hashes = previous.files_hashes || Object.fromEntries(previous.views.map(v => [v.file, v.svg_hash]))
      for (const [name, digest] of Object.entries(hashes)) {
        if (path.basename(name) !== name || name.startsWith('.') || !fs.existsSync(path.join(target, name)) || hash(fs.readFileSync(path.join(target, name))) !== digest) throw new SourceError('protected_output', 'Generated case files changed or are missing; refusing to overwrite manual edits')
      }
    }
    if (previous?.source.content_hash === snapshot.content_hash && previous.draft_hash === draftHash && previous.renderer_fingerprint === rendererFingerprint) return { skipped: true, package: target, reason: 'Source, draft and renderer unchanged; retained previous package and review state' }
    if (previous?.checks.browser === 'passed' && !browserCheck) throw new SourceError('browser_required', 'A browser-qualified package cannot be replaced without browser checks')
    if (pendingCount(state) >= state.max_pending && !pendingCandidate(c)) {
      c.status = 'paused_capacity'; c.next_action = 'Review queued packages before adding a new package.'; saveState(dir, state)
      return { paused: true, id: c.id }
    }
    // Compile and validate all views before touching last-good package.
    const views = compileDiagramSet(w)
    const report = { version: 1, id: w.id, candidate_id: c.id, draft_hash: draftHash, renderer_fingerprint: rendererFingerprint, source: { ...snapshot, content: undefined, file: undefined }, checks: { schema: 'passed', semantics: 'passed', source_binding: 'passed_hash_and_locator_only', geometry: 'passed', deterministic_render: views.every((v, i) => v.svg === compileDiagramSet(w)[i].svg) ? 'passed' : 'failed', browser: 'not_run', human_review: 'not_confirmed', reproduction: 'not_run' }, evidence_status: w.evidence.status, lifecycle: 'draft', permission_review: c.permission_review, warning: 'Automated checks do not prove source claims, completeness, permissions or runtime behavior.', views: views.map(({ svg, ...v }) => ({ ...v, file: `${v.id}.svg`, svg_hash: hash(svg) })) }
    if (report.checks.deterministic_render !== 'passed') throw new SourceError('render_failed', 'Repeated render differs')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    staging = fs.mkdtempSync(path.join(path.dirname(target), '.case-'))
    fs.writeFileSync(path.join(staging, 'workflow.yml'), YAML.stringify(w))
    views.forEach(v => fs.writeFileSync(path.join(staging, `${v.id}.svg`), v.svg))
    if (browserCheck) {
      const visual = await browserCheck(views, staging)
      atomicJSON(path.join(staging, 'browser-report.json'), visual)
      if (!visual.passed) {
        const failed = path.join(dir, 'failures', `${safeID(c.id)}-attempt-${c.failed_attempts + 1}`)
        fs.mkdirSync(path.dirname(failed), { recursive: true })
        if (fs.existsSync(failed)) throw new SourceError('render_failed', 'Prior failed attempt already exists; last-good package retained')
        fs.renameSync(staging, failed); staging = null
        throw new SourceError('render_failed', 'Browser label/containment checks failed; last-good retained; failing SVG/screenshots saved under .curator/failures')
      }
      report.checks.browser = 'passed'; report.browser_report = 'browser-report.json'
    }
    atomicJSON(path.join(staging, 'report.json'), report)
    atomicJSON(path.join(staging, 'evidence.json'), { sources: w.sources, steps: w.steps.map(s => ({ id: s.id, evidence: s.evidence })), edges: w.edges.map(e => ({ id: e.id, from: e.from, to: e.to, condition: e.condition, evidence: e.evidence })), coverage: w.coverage })
    const review = `# ${w.title}\n\n${w.summary}\n\n- Lifecycle: draft; evidence: ${w.evidence.status}.\n- Source: ${snapshot.canonical_url}\n- Source hash: ${snapshot.content_hash}\n- Original summary and generated diagrams only; upstream text/images/templates are not redistributed.\n- Automated checks: report.json. Browser check and human acceptance are separate.\n- Runtime execution: not performed.\n\n## Unknowns\n\n${w.coverage.unknowns.map(s => `- ${s}`).join('\n')}\n\n## Inferences\n\n${(w.coverage.inferences || []).map(s => `- ${s}`).join('\n') || '- None recorded.'}\n\n## Human review\n\nCheck every step/edge against evidence.json and the primary source; inspect labels, branch/parallel/loop direction and boundaries in index.html. Review reuse rights. Do not treat narrative/source checks as reproduction. After this review, record an explicit decision with the review command; it never publishes.\n`
    fs.writeFileSync(path.join(staging, 'review.md'), review)
    fs.writeFileSync(path.join(staging, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(w.title)} · review draft</title><style>body{background:#0c0f14;color:#f4efe6;font:16px system-ui;padding:24px}section{overflow:auto;margin:24px 0}a{color:#99ddd3}svg{display:block}p{max-width:900px}</style><h1>${esc(w.title)}</h1><p>${esc(w.summary)}</p><p>Draft · ${esc(w.evidence.status)} · human review pending · not reproduced</p><a href="${esc(snapshot.canonical_url)}">Primary source</a>${views.map(v => `<h2>${esc(v.id)}</h2><section>${v.svg}</section>`).join('')}<h2>Unknowns</h2><ul>${w.coverage.unknowns.map(s => `<li>${esc(s)}</li>`).join('')}</ul></html>`)
    report.files_hashes = Object.fromEntries(fs.readdirSync(staging).filter(name => name !== 'report.json').sort(compare).map(name => [name, hash(fs.readFileSync(path.join(staging, name)))]))
    atomicJSON(path.join(staging, 'report.json'), report)
    const backup = `${target}.previous`
    if (fs.existsSync(backup)) throw new SourceError('invalid_input', 'Interrupted prior replacement exists; inspect .previous before retrying')
    if (fs.existsSync(target)) fs.renameSync(target, backup)
    try { fs.renameSync(staging, target); staging = null } catch (e) { if (fs.existsSync(backup)) fs.renameSync(backup, target); throw e }
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true })
    c.status = 'awaiting_review'; c.lifecycle = 'draft'; c.evidence_status = w.evidence.status; c.draft_hash = draftHash; c.package = target; c.failed_attempts = 0; c.next_action = 'Human: inspect evidence, diagrams, unknowns and reuse permissions; record a review decision.'
    delete c.failure; saveState(dir, state)
    return { package: target, checks: report.checks, source_hash: snapshot.content_hash }
  } catch (e) {
    if (staging) fs.rmSync(staging, { recursive: true })
    c.failed_attempts++; c.status = c.failed_attempts >= 3 ? 'needs_manual' : 'needs_repair'; c.next_action = c.failed_attempts >= 3 ? 'Manual review required before resume.' : 'Agent: fix the reported draft issue, with at most two repair rounds.'
    c.failure = { kind: e.kind || 'validation_failed', message: e.message }; saveState(dir, state)
    atomicJSON(path.join(dir, 'failures', `${safeID(c.id)}.json`), { candidate_id: c.id, attempts: c.failed_attempts, failure: c.failure, previous_package_retained: Boolean(c.package) })
    throw e
  }
}

export function reviewCandidate(dir, id, decision, note) {
  if (!['accepted', 'rejected', 'changes_requested'].includes(decision) || !note?.trim()) throw new SourceError('invalid_input', 'Review needs accepted/rejected/changes_requested and a human note')
  const state = loadState(dir), c = state.candidates.find(c => c.id === id)
  if (!c?.package || !c.snapshot) throw new SourceError('invalid_input', 'No prepared package to review')
  const report = readJSON(path.join(c.package, 'report.json'))
  if (decision === 'accepted' && (c.status !== 'awaiting_review' || report.source.content_hash !== c.snapshot.content_hash || report.draft_hash !== c.draft_hash)) throw new SourceError('source_mismatch', 'Only the currently prepared source/draft can be accepted; update changed/failed candidates first')
  c.status = decision === 'accepted' ? 'reviewed' : decision
  c.review = { decision, note, source_hash: c.snapshot.content_hash, draft_hash: c.draft_hash, recorded_at: new Date().toISOString() }
  if (decision === 'accepted') c.reviewed_hash = c.snapshot.content_hash
  c.next_action = decision === 'accepted' ? 'Publication still requires a separate authorized editorial change.' : 'Follow human review note.'
  saveState(dir, state)
  return c.review
}
