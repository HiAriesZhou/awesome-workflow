import fs from 'node:fs'
import crypto from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { parse } from 'parse5'
import { fetch as proxyFetch, EnvHttpProxyAgent } from 'undici'

const dispatcher = new EnvHttpProxyAgent()

export const hash = value => crypto.createHash('sha256').update(value).digest('hex')
export class SourceError extends Error {
  constructor(kind, message) { super(message); this.kind = kind }
}
const secretKey = /(?:password|passwd|secret|token|api[_-]?key|authorization|authentication|credentials?|cookie|session[_-]?id|private[_-]?key|client[_-]?id|username|^(?:auth|basicAuth|httpAuth|oauth)$)/i
const secretValue = /(?:(?:Bearer|Basic)\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})\b)/
export function scanSensitive(value, location = '$') {
  if (typeof value === 'string') {
    if (secretValue.test(value) || /https?:\/\/[^/\s:@]+:[^/\s@]+@/.test(value)) throw new SourceError('sensitive', `Sensitive value at ${location}; remove it before import`)
    if (/https?:\/\//.test(value)) for (const match of value.matchAll(/https?:\/\/[^\s"<>]+/g)) {
      try { const u = new URL(match[0]); for (const [key] of u.searchParams) if (secretKey.test(key)) throw new SourceError('sensitive', `Sensitive URL parameter at ${location}`) } catch (e) { if (e instanceof SourceError) throw e }
    }
  } else if (Array.isArray(value)) value.forEach((x, i) => scanSensitive(x, `${location}[${i}]`))
  else if (value && typeof value === 'object') {
    if (typeof value.name === 'string' && secretKey.test(value.name) && 'value' in value) throw new SourceError('sensitive', `Sensitive named parameter at ${location}; remove the whole field`)
    for (const [key, v] of Object.entries(value)) {
    if (secretKey.test(key)) throw new SourceError('sensitive', `Sensitive field at ${location}.${key}; even names/IDs must be removed`)
    scanSensitive(v, `${location}.${key}`)
    }
  }
}

export function canonicalURL(input) {
  let u
  try { u = new URL(input) } catch { throw new SourceError('invalid_input', 'Expected an absolute source URL') }
  scanSensitive(input)
  if (u.protocol !== 'https:' || u.username || u.password) throw new SourceError('forbidden', 'Only public HTTPS URLs without authentication are accepted')
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key)
  u.searchParams.sort()
  u.pathname = u.pathname.replace(/\/+$/, '') || '/'
  if (u.hostname === 'raw.githubusercontent.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length >= 4) { u.hostname = 'github.com'; u.pathname = `/${parts[0]}/${parts[1]}/blob/${parts.slice(2).join('/')}` }
  }
  return u.href
}
export const candidateKey = c => `${canonicalURL(c.url)}\n${c.source_path || c.workflow_id || c.locator || c.id}`

export function permittedURL(url, registry) {
  const canonical = canonicalURL(url), u = new URL(canonical)
  const record = registry.sources.find(s => (s.allowed_prefixes || [s.url]).some(prefix => {
    const p = new URL(prefix)
    return p.origin === u.origin && (u.pathname === p.pathname.replace(/\/+$/, '') || u.pathname.startsWith(`${p.pathname.replace(/\/+$/, '')}/`))
  }))
  if (!record || record.read_allowed !== true) throw new SourceError('forbidden', 'Source is not explicitly allowed by the registry')
  if (u.hostname === 'github.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[2] !== 'blob' || parts.length < 5) throw new SourceError('missing', 'Repository/catalog entry needs a specified public file URL')
    return { record, canonical, requestURL: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join('/')}` }
  }
  // Canonical identity drops trailing '/', request address must preserve it.
  const request = new URL(url); request.hash = ''
  return { record, canonical, requestURL: request.href }
}

export function articleText(html) {
  const doc = parse(html)
  const find = (n, tag) => n.tagName === tag ? n : (n.childNodes || []).map(c => find(c, tag)).find(Boolean)
  const base = find(doc, 'article') || find(doc, 'main') || find(doc, 'body') || doc
  const walk = n => {
    if (['script', 'style', 'nav', 'footer', 'header', 'form'].includes(n.tagName)) return ''
    if (n.nodeName === '#text') return n.value
    const inner = (n.childNodes || []).map(walk).join('')
    return /^(?:p|h[1-6]|li|section|div|br)$/.test(n.tagName || '') ? `\n${inner}\n` : inner
  }
  return walk(base).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
}

export const classifyStatus = code => code === 404 || code === 410 ? 'missing' : code === 401 || code === 403 ? 'forbidden' : code === 429 ? 'rate_limited' : code >= 500 || code === 408 ? 'transient_error' : 'invalid_response'
const lastRequest = new Map()
export async function fetchSource(url, registry, opts = {}) {
  const approved = permittedURL(url, registry)
  const fetcher = opts.fetcher || ((url, options) => proxyFetch(url, { ...options, dispatcher })), sleep = opts.sleep || delay
  const timeoutMs = opts.timeoutMs ?? 15000, limitBytes = opts.limitBytes ?? 2 * 1024 * 1024
  const intervalMs = opts.intervalMs ?? 1000, attempts = opts.attempts ?? 3
  let requestURL = approved.requestURL
  for (let attempt = 0; attempt < attempts; attempt++) {
    const origin = new URL(requestURL).origin
    await sleep(Math.max(0, (lastRequest.get(origin) || 0) + intervalMs - Date.now()))
    lastRequest.set(origin, Date.now())
    try {
      const response = await fetcher(requestURL, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'awesome-workflow-curator/0.1 (public source review)', ...(opts.etag ? { 'If-None-Match': opts.etag } : {}) } })
      if (response.status === 304) return { ...approved, unchanged: true, http_status: 304 }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        // Do not follow arbitrary hosts or attempt to bypass a denied page.
        const next = new URL(response.headers.get('location'), requestURL).href
        const p = permittedURL(next, registry)
        requestURL = p.requestURL
        if (attempt + 1 === attempts) throw new SourceError('transient_error', 'Redirect limit reached')
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        const kind = classifyStatus(response.status)
        if (['rate_limited', 'transient_error'].includes(kind) && attempt + 1 < attempts) {
          const header = response.headers.get('retry-after')
          const retry = header && /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header || '') - Date.now()) || 0
          if (retry > 10000) throw new SourceError(kind, `HTTP ${response.status}; Retry-After exceeds this run's 10-second retry budget. Retry later.`)
          await sleep(Math.max(500 * 2 ** attempt, retry))
          continue
        }
        throw new SourceError(kind, `HTTP ${response.status}`)
      }
      const reader = response.body.getReader(), chunks = []
      let size = 0
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limitBytes) { await reader.cancel(); throw new SourceError('invalid_response', 'Source exceeds byte limit') }; chunks.push(Buffer.from(value)) }
      const raw = Buffer.concat(chunks).toString('utf8')
      const contentType = response.headers.get('content-type') || ''
      if (/application\/json/.test(contentType) || /\.json$/.test(new URL(requestURL).pathname)) {
        let value
        try { value = JSON.parse(raw) } catch { throw new SourceError('invalid_response', 'Source JSON cannot be parsed') }
        scanSensitive(value)
      }
      const content = /text\/html/.test(contentType) ? articleText(raw) : raw
      scanSensitive(content)
      if (!content.trim()) throw new SourceError('invalid_response', 'Source body is empty')
      return { ...approved, raw, content, content_hash: hash(content), etag: response.headers.get('etag'), content_type: contentType, http_status: response.status, checked_at: new Date().toISOString(), request_url: requestURL }
    } catch (e) {
      if (e instanceof SourceError) throw e
      if (attempt + 1 < attempts) { await sleep(500 * 2 ** attempt); continue }
      throw new SourceError('transient_error', e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Fetch timed out' : 'Fetch/body read failed')
    }
  }
  throw new SourceError('transient_error', 'Fetch attempts exhausted')
}

export function readNative(filename) {
  if (fs.statSync(filename).size > 2 * 1024 * 1024) throw new SourceError('invalid_input', 'Native JSON exceeds byte limit')
  let value
  try { value = JSON.parse(fs.readFileSync(filename, 'utf8')) } catch { throw new SourceError('invalid_input', 'Invalid native JSON') }
  scanSensitive(value)
  const content = JSON.stringify(value, null, 2) + '\n'
  return { value, content, content_hash: hash(content), checked_at: new Date().toISOString(), native: true }
}
