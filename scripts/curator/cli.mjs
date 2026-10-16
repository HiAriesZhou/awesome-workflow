#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { readJSON, loadState, saveState, importSeeds, addSource, acquire, prepareCase, reviewCandidate } from './pipeline.mjs'
import { normalizeWorkflow } from '../workflow.mjs'
import { checkViews } from '../diagram/browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [command, ...args] = process.argv.slice(2), options = {}
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Options require --name value')
  options[args[i].slice(2)] = args[i + 1]
}
const dir = path.resolve(options.state || path.join(root, '.curator'))
const registry = readJSON(options.registry || path.join(root, 'content/source-registry.json'))
const help = `Usage: npm run curate -- <command> [options]
  import-seeds [--seeds file] [--registry file] [--state dir]
  add --source <registered URL|sanitized native JSON> [--workflow-id id] [--source-path path]
  fetch --id <candidate ID>
  prepare --source <candidate ID|registered URL|native JSON> --draft <v2 YAML> [--out dir]
  batch --drafts <dir> [--out dir] (files named <candidate ID>.yml; one source per candidate)
  queue
  config --max-pending <number>
  review --id <candidate ID> --decision <accepted|rejected|changes_requested> --note <human decision>
  resume --id <candidate ID> --note <manual review reason>
  migrate --input <legacy YAML> --output <v2 YAML> (never edits original)
All commands accept --state and --registry. No model API, workflow execution or publishing.`

async function main() {
  switch (command) {
    case 'import-seeds': return importSeeds(dir, registry, readJSON(options.seeds || path.join(root, 'content/candidate-seeds.json')))
    case 'add': return addSource(dir, options.source, registry, { workflowID: options['workflow-id'], sourcePath: options['source-path'] })
    case 'fetch': { const { content, ...metadata } = await acquire(dir, options.id, registry); return metadata }
    case 'queue': return loadState(dir)
    case 'config': {
      const n = Number(options['max-pending']); if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('max-pending must be 1..1000')
      const state = loadState(dir); state.max_pending = n; saveState(dir, state); return { max_pending: n }
    }
    case 'prepare': {
      if (!options.source || !options.draft) throw new Error('prepare requires --source and --draft')
      let candidate = loadState(dir).candidates.find(c => c.id === options.source)
      if (!candidate) candidate = addSource(dir, options.source, registry, { workflowID: options['workflow-id'], sourcePath: options['source-path'] })
      return prepareCase({ dir, candidateID: candidate.id, registry, draftPath: options.draft, output: options.out || path.join(dir, 'review'), browserCheck: checkViews })
    }
    case 'batch': {
      if (!options.drafts) throw new Error('batch requires --drafts')
      const results = []
      for (const file of fs.readdirSync(options.drafts).filter(f => f.endsWith('.yml')).sort()) {
        const id = file.slice(0, -4)
        try { results.push({ id, ...await prepareCase({ dir, candidateID: id, registry, draftPath: path.join(options.drafts, file), output: options.out || path.join(dir, 'review'), browserCheck: checkViews }) }) }
        catch (e) { results.push({ id, failure: e.kind || 'validation_failed', message: e.message }) }
      }
      if (results.some(r => r.failure)) process.exitCode = 1
      return results
    }
    case 'review': return reviewCandidate(dir, options.id, options.decision, options.note)
    case 'resume': {
      if (!options.note?.trim()) throw new Error('resume requires a manual review note')
      const state = loadState(dir), c = state.candidates.find(c => c.id === options.id)
      if (!c) throw new Error('Unknown candidate'); c.failed_attempts = 0; c.status = 'needs_extraction'; c.resume_note = options.note; saveState(dir, state); return { id: c.id, status: c.status }
    }
    case 'migrate': {
      if (!options.input || !options.output || path.resolve(options.input) === path.resolve(options.output)) throw new Error('migrate needs distinct input/output files')
      const w = normalizeWorkflow(YAML.parse(fs.readFileSync(options.input, 'utf8')))
      fs.writeFileSync(options.output, YAML.stringify(w), { flag: 'wx' }); return { output: options.output, evidence: w.evidence.status }
    }
    default: console.log(help); return undefined
  }
}
try { const result = await main(); if (result !== undefined) console.log(JSON.stringify(result, null, 2)) }
catch (e) { console.error(JSON.stringify({ failure: e.kind || 'invalid_input', message: e.message })); process.exitCode = 1 }
