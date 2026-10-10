#!/usr/bin/env node
/**
 * Validate workflows/*.yml against schema, emit:
 * - src/data/workflows.json
 * - README.md (awesome-style index)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const workflowsDir = path.join(root, 'workflows')
const schemaPath = path.join(root, 'schema', 'workflow.schema.json')
const outJson = path.join(root, 'src', 'data', 'workflows.json')
const readmePath = path.join(root, 'README.md')

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

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
  workflows.push(data)
}

if (errors.length) {
  console.error('Validation failed:\n' + errors.join('\n'))
  process.exit(1)
}

workflows.sort((a, b) => a.title.localeCompare(b.title))

fs.mkdirSync(path.dirname(outJson), { recursive: true })
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      count: workflows.length,
      workflows
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

const domainTitle = {
  'ai-coding': 'AI Coding',
  'agent-engineering': 'Agent Engineering',
  'repo-ops': 'Repository Ops',
  research: 'Research',
  'design-review': 'Design Review',
  other: 'Other'
}

function stars(w) {
  const s = (w.sources || []).map((x) => x.stars).filter((n) => typeof n === 'number')
  if (!s.length) return ''
  return ` · ★${Math.max(...s).toLocaleString('en-US')}`
}

let toc = ''
let body = ''
for (const [domain, list] of [...byDomain.entries()].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  const anchor = domain
  toc += `- [${domainTitle[domain] || domain}](#${anchor})\n`
  body += `\n## ${domainTitle[domain] || domain}\n\n`
  for (const w of list) {
    const primary = w.sources[0]
    body += `- **[${w.title}](${primary.url})**${stars(w)} — ${w.summary}  \n`
    body += `  Tools: \`${w.tools.join('`, `')}\` · Maturity: \`${w.maturity}\` · Automation: \`${w.automation || 'n/a'}\` · [YAML](workflows/${w.id}.yml)\n`
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

*Generated ${new Date().toISOString().slice(0, 10)} from ${workflows.length} workflow files. Do not hand-edit the Contents section; edit YAML and run \`npm run build:data\`.*
`

fs.writeFileSync(readmePath, readme)
console.log(`OK: ${workflows.length} workflows → README.md + src/data/workflows.json`)
