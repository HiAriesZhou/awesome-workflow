#!/usr/bin/env node
/**
 * Validate workflows/*.yml against schema, emit:
 * - src/data/workflows.json
 * - README.md (awesome-style index)
 * - docs/diagrams/<id>.svg (see DESIGN.md)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { compileDiagramSet, DiagramError } from './diagram/compile.mjs'
import { validateWorkflow, normalizeWorkflow, compare } from './workflow.mjs'
import { colors } from './diagram/theme.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const workflowsDir = path.join(root, 'workflows')
const schemaPath = path.join(root, 'schema', 'workflow.schema.json')
const outJson = path.join(root, 'src', 'data', 'workflows.json')
const readmePath = path.join(root, 'README.md')
const taxonomyPath = path.join(root, 'src', 'lib', 'taxonomy.json')
const designPath = path.join(root, 'DESIGN.md')
const diagramsDir = path.join(root, 'docs', 'diagrams')

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

// taxonomy.json owns display names; the schema enums must list the same ids.
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'))
const enumChecks = [
  ['domains', schema.properties.domain.enum],
  ['tools', schema.properties.tools.items.enum],
  ['actors', schema.properties.steps.items.properties.actor.enum]
]
for (const [key, schemaIds] of enumChecks) {
  const taxonomyIds = Object.keys(taxonomy[key])
  const same =
    taxonomyIds.length === schemaIds.length &&
    taxonomyIds.every((id) => schemaIds.includes(id))
  if (!same) {
    console.error(
      `taxonomy.json ${key} [${taxonomyIds.join(', ')}] does not match schema enum [${schemaIds.join(', ')}]`
    )
    process.exit(1)
  }
}

const files = fs
  .readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

if (files.length === 0) {
  console.error('No workflow YAML files found')
  process.exit(1)
}

const workflows = []
const errors = []

// Values used as React keys or ids must not repeat within their list.
function duplicates(values) {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]
}

for (const file of files) {
  const full = path.join(workflowsDir, file)
  const raw = fs.readFileSync(full, 'utf8')
  let data
  try {
    data = YAML.parse(raw)
  } catch (e) {
    errors.push(`${file}: YAML parse error: ${e.message}`)
    continue
  }
  const expected = `${data?.id}.yml`
  if (data?.id && file !== expected && file !== `${data.id}.yaml`) {
    errors.push(`${file}: filename should be ${expected}`)
  }
  if (!validate(data)) {
    errors.push(
      `${file}:\n` +
        (validate.errors || [])
          .map((e) => `  - ${e.instancePath || '/'} ${e.message}`)
          .join('\n')
    )
    continue
  }
  try { validateWorkflow(data) } catch (e) { errors.push(`${file}: ${e.message}`); continue }
  const keyedLists = [
    ['steps[].id', data.steps.map((s) => s.id)],
    ['sources[].url', data.sources.map((s) => s.url)],
    ['not_for', data.not_for ?? []]
  ]
  for (const [field, values] of keyedLists) {
    const dup = duplicates(values)
    if (dup.length) errors.push(`${file}: duplicate ${field}: ${dup.join(', ')}`)
  }
  workflows.push(data)
}

for (const id of duplicates(workflows.map((w) => w.id))) {
  errors.push(`duplicate workflow id across files: ${id}`)
}

if (errors.length) {
  console.error('Validation failed:\n' + errors.join('\n'))
  process.exit(1)
}

workflows.sort((a, b) => compare(a.title, b.title))

// DESIGN.md's color table must mirror theme.mjs exactly.
const designColors = Object.fromEntries(
  [...fs.readFileSync(designPath, 'utf8').matchAll(/^\| `([a-z]+)` \| `(#[0-9a-f]{6})` \|/gm)].map(
    (m) => [m[1], m[2]]
  )
)
const sortedJson = (obj) => JSON.stringify(Object.entries(obj).sort())
if (sortedJson(designColors) !== sortedJson(colors)) {
  console.error(
    `DESIGN.md color table ${JSON.stringify(designColors)} does not match scripts/diagram/theme.mjs ${JSON.stringify(colors)}`
  )
  process.exit(1)
}

// Compile every diagram before writing anything, so a failure leaves outputs untouched.
const diagrams = new Map()
const viewsById = new Map()
const diagramErrors = []
for (const w of workflows) {
  try {
    const views = compileDiagramSet(w)
    viewsById.set(w.id, views.map(({ svg, ...v }, i) => ({ ...v, file: i === 0 ? `${w.id}.svg` : `${w.id}--${v.id}.svg` })))
    views.forEach((v, i) => diagrams.set(i === 0 ? w.id : `${w.id}--${v.id}`, v.svg))
  } catch (e) {
    if (!(e instanceof DiagramError)) throw e
    diagramErrors.push(`workflows/${w.id}.yml: ${e.message}`)
  }
}
if (diagramErrors.length) {
  console.error('Diagram budget or layout check failed (see DESIGN.md):\n' + diagramErrors.join('\n'))
  process.exit(1)
}

fs.mkdirSync(diagramsDir, { recursive: true })
for (const file of fs.readdirSync(diagramsDir)) {
  if (file.endsWith('.svg') && !diagrams.has(file.slice(0, -4))) {
    fs.rmSync(path.join(diagramsDir, file))
  }
}
for (const [id, svg] of diagrams) {
  fs.writeFileSync(path.join(diagramsDir, `${id}.svg`), svg)
}

// Derive the date from the data so unchanged YAML regenerates byte-identical output.
const dataDate = workflows
  .map((w) => w.verified || w.evidence?.checked_at?.slice(0, 10) || w.added)
  .reduce((a, b) => (a > b ? a : b))

fs.mkdirSync(path.dirname(outJson), { recursive: true })
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      generated_at: dataDate,
      count: workflows.length,
      workflows: workflows.map(w => ({ ...normalizeWorkflow(w), diagram_views: viewsById.get(w.id) }))
    },
    null,
    2
  ) + '\n'
)

const byDomain = new Map()
for (const w of workflows) {
  if (!byDomain.has(w.domain)) byDomain.set(w.domain, [])
  byDomain.get(w.domain).push(w)
}

// GitHub heading anchor: lowercase, drop punctuation, spaces to hyphens.
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')
}

function stars(w) {
  const s = (w.sources || []).map((x) => x.stars).filter((n) => typeof n === 'number')
  if (!s.length) return ''
  return ` · ★${Math.max(...s).toLocaleString('en-US')}`
}

let toc = ''
let body = ''
for (const [domain, list] of [...byDomain.entries()].sort((a, b) =>
  compare(a[0], b[0])
)) {
  const heading = taxonomy.domains[domain]
  toc += `- [${heading}](#${slug(heading)})\n`
  body += `\n## ${heading}\n\n`
  for (const w of list) {
    const primary = w.sources[0]
    body += `- **[${w.title}](${primary.url})**${stars(w)} — ${w.summary}<br>\n`
    body += `  Tools: \`${w.tools.join('`, `')}\` · Publication: \`${normalizeWorkflow(w).lifecycle}\` · Evidence: \`${normalizeWorkflow(w).evidence.status}\` · Automation: \`${w.automation || 'n/a'}\` · [YAML](workflows/${w.id}.yml)\n`
    body += `\n  ![${w.title.replace(/[[\]]/g, '')} workflow diagram](docs/diagrams/${w.id}.svg)\n\n`
  }
}

const readme = `# Awesome Workflow [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> A curated, **interactive library** of real-world AI agent & coding workflows — structured recipes you can study and adapt.
>
> **Not** a one-click workflow generator. **Not** a workflow execution engine.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Workflows](https://img.shields.io/badge/workflows-${workflows.length}-0d9488)](workflows/)
[![Site](https://img.shields.io/badge/gallery-live-111827)](https://hiarieszhou.github.io/awesome-workflow/)

## Why this exists

Most "awesome" lists are link dumps. Most agent tools either **run** workflows or **generate** diagrams. This repository sits in the gap:

1. **Structured entries** — each workflow is YAML with steps, actors (human / agent / tool / ci), human gates, and evidence links.
2. **Visual gallery** — filter by domain / tool / maturity, open a swimlane detail view.
3. **Human-curated** — candidates become PRs; nothing auto-merges.

If you want to *build* a workflow but do not know how practitioners chain plan → build → review, start here.

## Preview the gallery

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open the local Vite URL (usually http://localhost:5173).  
Static site build: \`npm run build\` → \`dist/\` (GitHub Pages).

## Contents

${toc}
${body}

## Schema

See [\`schema/workflow.schema.json\`](schema/workflow.schema.json). Validate + regenerate README/site data:

\`\`\`bash
npm run build:data
\`\`\`

Legacy \`maturity: verified\` remains available for compatibility and is not proof of reproduction. Publication and evidence are separate in v2. See [the content pipeline](docs/implementation/pipeline.md) for source import and review packages; drafts and synthetic fixtures stay outside the published gallery.

## Contributing

1. Add \`workflows/<id>.yml\` matching the schema (filename = \`id\`).
2. Cite primary sources with URLs (and stars if known).
3. Run \`npm run build:data\` and commit the regenerated \`README.md\` + \`src/data/workflows.json\`.
4. Open a PR — maintainers merge only verified recipes.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [DECISIONS.md](DECISIONS.md).

## Related (not competitors)

| Project | Relationship |
|---------|----------------|
| [Archify](https://github.com/tt-a1i/archify) | Beautiful **generator** of interactive diagrams — complementary, not a library of third-party practices |
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | Broad Claude Code resource list |
| [awesome-claude-code-workflows](https://github.com/ithiria894/awesome-claude-code-workflows) | Cookbook-style link list we cite as a discovery source |
| [awesome-n8n-templates](https://github.com/enescingoz/awesome-n8n-templates) | Executable n8n JSON templates (engine-bound) |
| [awesome-workflow-engines](https://github.com/meirwah/awesome-workflow-engines) | Engines directory — different category |

## License

MIT © Aries Zhou and contributors.

---

*Generated ${dataDate} from ${workflows.length} workflow files. Do not hand-edit the Contents section; edit YAML and run \`npm run build:data\`.*
`

fs.writeFileSync(readmePath, readme)
console.log(`OK: ${workflows.length} workflows → README.md + src/data/workflows.json + docs/diagrams/`)
