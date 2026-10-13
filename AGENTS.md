# Agent notes

- Source of truth: `workflows/*.yml`
- Never hand-edit the generated Contents in `README.md`, `src/data/workflows.json` or `docs/diagrams/*.svg`; run `npm run build:data`
- This project is a **library**, not a workflow generator or runner
- Prefer Waza `/think` for structure changes, `/check` before release
- No paid APIs in default build/preview path
- Diagram colors, grid, budget and anti-patterns: `DESIGN.md`
