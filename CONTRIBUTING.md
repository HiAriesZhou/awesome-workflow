# Contributing

Thanks for helping grow this library.

## What belongs here

- Real workflows practiced in public (repo, post, or docs you can cite)
- Structured as steps with actors and preferably human gates / evidence links
- AI coding / agent engineering first (other domains later)

## What does not

- Unsourced “I asked an LLM” recipes
- One-click generators or executable engine templates (point people to Archify / n8n instead)
- Marketing pages without a reproducible sequence

## Add a workflow

1. Copy an existing file in `workflows/` and rename to `<id>.yml` (`id` = kebab-case).
2. Fill every required schema field (`schema/workflow.schema.json`).
3. Run:

```bash
npm install
npm run build:data
```

4. Commit YAML + regenerated `README.md` + `src/data/workflows.json`.
5. Open a PR describing why this recipe is notable and how you verified sources.

## Review bar

Maintainers look for: clear steps, cited URLs, honest `not_for`, and no auto-merge bots.
