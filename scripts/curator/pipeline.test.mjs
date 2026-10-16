import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { canonicalURL, candidateKey, fetchSource, classifyStatus, scanSensitive, articleText, readNative, hash } from './source.mjs'
import { importSeeds, addSource, acquire, prepareCase, loadState, saveState, reviewCandidate, bindSource } from './pipeline.mjs'
import { topologies } from '../../tests/fixtures/topologies.mjs'

const registry = { sources: [{ id: 'test', url: 'https://example.com/cases', allowed_prefixes: ['https://example.com/cases'], read_allowed: true }] }
const seeds = { candidates: [{ id: 'real-case', source_id: 'test', url: 'https://example.com/cases/sample/', locator: 'Solution', next_action: 'Read original', reproduced: false }] }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'curator-test-'))
const options = (fetcher, extra = {}) => ({ fetcher, sleep: async () => {}, intervalMs: 0, ...extra })
const response = (body = 'Solution\nA request becomes a draft.', status = 200, headers = {}) => new Response(status === 304 ? null : body, { status, headers: { 'content-type': 'text/plain', ...headers } })
function draftFor(content) {
  const w = structuredClone(topologies[0]); w.id = 'real-case'; w.title = 'Test case package'
  w.sources = [{ id: 'source', label: 'Original', url: seeds.candidates[0].url, kind: 'tutorial', locator: 'Solution', checked_at: '2026-10-13T00:00:00Z', content_hash: hash(content), reuse_status: 'original_summary_only' }]
  w.evidence = { status: 'source_checked', checked_at: '2026-10-13T00:00:00Z', method: 'Synthetic fixture only' }
  for (const s of [...w.steps, ...w.edges]) s.evidence = [{ source_id: 'source', locator: 'Solution', support: 'explicit' }]
  return w
}

test('canonical URL, public repo paths and workflow identity deduplicate predictably', () => {
  assert.equal(canonicalURL('https://EXAMPLE.com/cases/?utm_source=x#s'), canonicalURL('https://example.com/cases'))
  assert.equal(canonicalURL('https://raw.githubusercontent.com/o/r/abcdef/file.json'), canonicalURL('https://github.com/o/r/blob/abcdef/file.json'))
  assert.notEqual(candidateKey({ url: seeds.candidates[0].url, workflow_id: 'one' }), candidateKey({ url: seeds.candidates[0].url, workflow_id: 'two' }))
  const dir = tmp()
  assert.equal(importSeeds(dir, registry, seeds).added, 1)
  assert.equal(importSeeds(dir, registry, seeds).skipped, 1)
  assert.equal(loadState(dir).candidates.length, 1)
  const real = JSON.parse(fs.readFileSync(new URL('../../content/candidate-seeds.json', import.meta.url)))
  const reg = JSON.parse(fs.readFileSync(new URL('../../content/source-registry.json', import.meta.url)))
  const all = tmp(); assert.equal(importSeeds(all, reg, real).total, 20); assert.equal(importSeeds(all, reg, real).skipped, 20)
  assert.ok(loadState(all).candidates.every(c => c.next_action && c.id && c.source_id && c.status && c.reproduced === false))
})
test('native secrets reject before candidate/snapshot writes; native revisions keep identity', () => {
  const dir = tmp(), file = path.join(dir, 'input.json')
  for (const bad of [{ credentials: { id: 'abc', name: 'My account' } }, { auth: 'hidden' }, { headers: [{ name: 'Authorization', value: 'hidden' }] }, { headers: { Authorization: 'hidden' } }, { text: 'Bearer abcde' }, { url: 'https://example.com/?api_key=hidden' }]) {
    fs.writeFileSync(file, JSON.stringify(bad)); assert.throws(() => addSource(dir, file, registry), /Sensitive/)
    assert.ok(!fs.existsSync(path.join(dir, 'queue.json')))
  }
  fs.writeFileSync(file, JSON.stringify({ id: 'local-example', nodes: [] }))
  const one = addSource(dir, file, registry)
  fs.writeFileSync(file, JSON.stringify({ id: 'local-example', nodes: [{ id: 'one' }] }))
  assert.equal(addSource(dir, file, registry).id, one.id)
  assert.notEqual(readNative(file).content_hash, hash('{}'))
  assert.doesNotThrow(() => scanSensitive({ nodes: [{ id: 'safe', name: 'Count tokens' }] }))
})

test('specified public repository file adapter and JSON/line locators remain data-only', async () => {
  const repo = { sources: [{ id: 'repo', url: 'https://github.com/example/project', read_allowed: true }] }
  const result = await fetchSource('https://github.com/example/project/blob/abcdef/workflow.json', repo, options(async url => { assert.equal(url, 'https://raw.githubusercontent.com/example/project/abcdef/workflow.json'); return response('{"nodes":[{"id":"start"}]}', 200, { 'content-type': 'application/json' }) }))
  const w = draftFor(result.content); w.sources[0].url = result.canonical
  for (const item of [...w.steps, ...w.edges]) item.evidence[0].locator = 'json:/nodes/0/id'
  bindSource(w, { ...result, canonical_url: result.canonical })
  w.steps[0].evidence[0].locator = 'json:/nodes/9'
  assert.throws(() => bindSource(w, { ...result, canonical_url: result.canonical }), /does not exist/)
  const text = 'first\nsecond\nthird'; const lineDraft = draftFor(text)
  for (const item of [...lineDraft.steps, ...lineDraft.edges]) item.evidence[0].locator = 'lines:1-3'
  bindSource(lineDraft, { content: text, content_hash: hash(text), canonical_url: canonicalURL(seeds.candidates[0].url) })
  lineDraft.steps[0].evidence[0].locator = 'lines:3-4'
  assert.throws(() => bindSource(lineDraft, { content: text, content_hash: hash(text), canonical_url: canonicalURL(seeds.candidates[0].url) }), /does not exist/)
})
test('failure categories are distinct; forbidden does not retry; transient/rate limit back off', async () => {
  assert.deepEqual([404, 410, 401, 403, 429, 503, 408, 400].map(classifyStatus), ['missing', 'missing', 'forbidden', 'forbidden', 'rate_limited', 'transient_error', 'transient_error', 'invalid_response'])
  for (const code of [404, 403, 429, 503]) {
    let calls = 0; const sleeps = []
    await assert.rejects(fetchSource(seeds.candidates[0].url, registry, { fetcher: async () => { calls++; return response('error', code) }, sleep: async n => sleeps.push(n), intervalMs: 0 }), e => e.kind === classifyStatus(code))
    assert.equal(calls, [429, 503].includes(code) ? 3 : 1)
    if (calls > 1) assert.ok(sleeps.some(n => n >= 500))
  }
  let calls = 0
  await assert.rejects(fetchSource(seeds.candidates[0].url, registry, options(async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) })), e => e.kind === 'transient_error')
  assert.equal(calls, 3)
})
test('redirect request retains trailing slash; unregistered redirects reject; size/HTML checks', async () => {
  const addresses = []
  const fetched = await fetchSource('https://example.com/cases/sample', registry, options(async url => {
    addresses.push(url)
    return addresses.length === 1 ? response('', 301, { location: `${url}/` }) : response()
  }))
  assert.equal(addresses[1], 'https://example.com/cases/sample/')
  assert.equal(fetched.canonical, 'https://example.com/cases/sample')
  await assert.rejects(fetchSource(seeds.candidates[0].url, registry, options(async () => response('', 302, { location: 'https://private.example.com/secret' }))), e => e.kind === 'forbidden')
  await assert.rejects(fetchSource(seeds.candidates[0].url, registry, options(async () => response('too large'), { limitBytes: 2 })), /byte limit/)
  assert.equal(articleText('<main><h1>Solution</h1><script>run code</script><p>Read &amp; summarize</p></main>'), 'Solution\n\nRead & summarize')
  assert.throws(() => scanSensitive({ items: [{ nested: { token: '' } }] }), /Sensitive field/)
  await assert.rejects(fetchSource(seeds.candidates[0].url, registry, options(async () => response('{broken', 200, { 'content-type': 'application/json' }))), e => e.kind === 'invalid_response')
})

test('browser failure preserves prior qualified package and records a repair failure', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const content = 'Solution\nA request becomes a draft.', draft = path.join(dir, 'draft.yml')
  const w = draftFor(content); fs.writeFileSync(draft, YAML.stringify(w))
  const args = { dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response(content)) }
  const first = await prepareCase({ ...args, browserCheck: async () => ({ passed: true, mocked_fixture_check: true }) })
  const bytes = fs.readFileSync(path.join(first.package, 'full.svg'), 'utf8')
  w.steps[0].name = 'New name'; fs.writeFileSync(draft, YAML.stringify(w))
  await assert.rejects(prepareCase({ ...args, browserCheck: async () => ({ passed: false, mocked_fixture_check: true }) }), e => e.kind === 'render_failed')
  assert.equal(fs.readFileSync(path.join(first.package, 'full.svg'), 'utf8'), bytes)
  await assert.rejects(prepareCase(args), e => e.kind === 'browser_required')
})

test('unowned output directories, extra files and manual edits are never overwritten', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const content = 'Solution\nA request becomes a draft.', draft = path.join(dir, 'draft.yml'), w = draftFor(content)
  fs.writeFileSync(draft, YAML.stringify(w))
  const args = { dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response(content)) }
  const target = path.join(args.output, w.id); fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'original.txt'), 'Existing user work')
  await assert.rejects(prepareCase(args), e => e.kind === 'protected_output')
  assert.equal(fs.readFileSync(path.join(target, 'original.txt'), 'utf8'), 'Existing user work')
  const other = { ...args, output: path.join(dir, 'owned') }; const good = await prepareCase(other)
  fs.writeFileSync(path.join(good.package, 'review.md'), 'Manual review notes')
  w.steps[0].name = 'Changed name'; fs.writeFileSync(draft, YAML.stringify(w))
  await assert.rejects(prepareCase(other), e => e.kind === 'protected_output')
  assert.equal(fs.readFileSync(path.join(good.package, 'review.md'), 'utf8'), 'Manual review notes')
})

test('malformed draft errors do not echo source fragments into queue, logs or reports', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const draft = path.join(dir, 'bad.yml'); fs.writeFileSync(draft, 'steps: [not-real-private-value')
  await assert.rejects(prepareCase({ dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response()) }), e => e.kind === 'invalid_input' && !e.message.includes('not-real-private-value'))
  assert.ok(!JSON.stringify(loadState(dir)).includes('not-real-private-value'))
})
test('unchanged ETag/hash skips; source update invalidates review, without auto regeneration', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const content = 'Solution\nA request becomes a draft.', draft = path.join(dir, 'draft.yml')
  fs.writeFileSync(draft, YAML.stringify(draftFor(content)))
  const args = { dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response(content, 200, { etag: 'abc' })) }
  const first = await prepareCase(args); assert.ok(fs.existsSync(path.join(first.package, 'full.svg')))
  reviewCandidate(dir, 'real-case', 'accepted', 'Fixture review for testing only')
  const second = await prepareCase({ ...args, fetchOptions: options(async (_, opts) => { assert.equal(opts.headers['If-None-Match'], 'abc'); return response('', 304) }) })
  assert.equal(second.skipped, true); assert.equal(loadState(dir).candidates[0].status, 'reviewed')
  const before = fs.readFileSync(path.join(first.package, 'full.svg'), 'utf8')
  await assert.rejects(prepareCase({ ...args, fetchOptions: options(async () => response('Solution\nChanged article')) }), e => e.kind === 'source_mismatch')
  const c = loadState(dir).candidates[0]
  assert.equal(c.reviewed_hash, hash(content)); assert.notEqual(c.snapshot.content_hash, c.reviewed_hash)
  assert.equal(fs.readFileSync(path.join(first.package, 'full.svg'), 'utf8'), before)
})
test('queue cap pauses new work but allows existing candidate processing', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const state = loadState(dir); state.max_pending = 1; state.candidates[0].status = 'awaiting_review'; saveState(dir, state)
  const other = addSource(dir, 'https://example.com/cases/new', registry)
  assert.equal(other.status, 'paused_capacity')
  let read = 0
  assert.equal((await acquire(dir, other.id, registry, options(async () => { read++; return response() }))).paused, true)
  await acquire(dir, 'real-case', registry, options(async () => { read++; return response() }))
  assert.equal(read, 1)
})

test('at capacity an existing changes-requested package can still be corrected; stale source cannot be accepted', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const content = 'Solution\nA request becomes a draft.', draft = path.join(dir, 'draft.yml'), w = draftFor(content)
  fs.writeFileSync(draft, YAML.stringify(w))
  const args = { dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response(content)) }
  await prepareCase(args)
  reviewCandidate(dir, 'real-case', 'changes_requested', 'Synthetic manual correction request')
  const state = loadState(dir); state.max_pending = 1; saveState(dir, state)
  w.steps[0].name = 'Corrected name'; fs.writeFileSync(draft, YAML.stringify(w))
  assert.ok((await prepareCase(args)).package)
  await acquire(dir, 'real-case', registry, options(async () => response('Solution\nNew revision')))
  assert.throws(() => reviewCandidate(dir, 'real-case', 'accepted', 'Wrong source version'), /currently prepared/)
})
test('initial failure plus two repairs preserves last-good and then queues manual work', async () => {
  const dir = tmp(); importSeeds(dir, registry, seeds)
  const content = 'Solution\nA request becomes a draft.', draft = path.join(dir, 'draft.yml')
  fs.writeFileSync(draft, YAML.stringify(draftFor(content)))
  const args = { dir, candidateID: 'real-case', registry, draftPath: draft, output: path.join(dir, 'packages'), fetchOptions: options(async () => response(content)) }
  const good = await prepareCase(args), bytes = fs.readFileSync(path.join(good.package, 'report.json'), 'utf8')
  const bad = draftFor(content); bad.edges[0].to = 'missing'; fs.writeFileSync(draft, YAML.stringify(bad))
  for (let i = 0; i < 3; i++) await assert.rejects(prepareCase(args), /invalid node reference/)
  assert.equal(loadState(dir).candidates[0].failed_attempts, 3)
  assert.equal(loadState(dir).candidates[0].status, 'needs_manual')
  await assert.rejects(prepareCase(args), e => e.kind === 'needs_manual')
  assert.equal(fs.readFileSync(path.join(good.package, 'report.json'), 'utf8'), bytes)
})

test('CLI entrypoints operate in an isolated native fixture state without publishing', () => {
  const dir = tmp(), file = path.join(dir, 'native.json'), registryFile = path.join(dir, 'registry.json')
  fs.writeFileSync(file, JSON.stringify({ id: 'native-fixture', nodes: [{ id: 'start' }] }))
  fs.writeFileSync(registryFile, JSON.stringify(registry))
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--state', dir, '--registry', registryFile], { encoding: 'utf8' }))
  const c = run('add', '--source', file, '--workflow-id', 'native-fixture')
  assert.equal(run('add', '--source', file, '--workflow-id', 'native-fixture').id, c.id)
  assert.equal(run('fetch', '--id', c.id).content_type, 'application/json')
  assert.equal(run('config', '--max-pending', '2').max_pending, 2)
  assert.equal(run('queue').candidates.length, 1)
  assert.equal(run('resume', '--id', c.id, '--note', 'Manual reset of synthetic test only').status, 'needs_extraction')
  const out = path.join(dir, 'migrated.yml')
  const migrated = run('migrate', '--input', fileURLToPath(new URL('../../workflows/oneredoak-code-review.yml', import.meta.url)), '--output', out)
  assert.equal(migrated.evidence, 'unknown'); assert.ok(fs.existsSync(out))
})
