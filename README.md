# Awesome Workflow [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> A curated, **interactive library** of real-world AI agent & coding workflows — structured recipes you can study and adapt.
>
> **Not** a one-click workflow generator. **Not** a workflow execution engine.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Workflows](https://img.shields.io/badge/workflows-10-0d9488)](workflows/)
[![Site](https://img.shields.io/badge/gallery-live-111827)](https://hiarieszhou.github.io/awesome-workflow/)

## Why this exists

Most "awesome" lists are link dumps. Most agent tools either **run** workflows or **generate** diagrams. This repository sits in the gap:

1. **Structured entries** — each workflow is YAML with steps, actors (human / agent / tool / ci), human gates, and evidence links.
2. **Visual gallery** — filter by domain / tool / maturity, open a swimlane detail view.
3. **Human-curated** — candidates become PRs; nothing auto-merges.

If you want to *build* a workflow but do not know how practitioners chain plan → build → review, start here.

## Preview the gallery

```bash
npm install
npm run dev
```

Then open the local Vite URL (usually http://localhost:5173).  
Static site build: `npm run build` → `dist/` (GitHub Pages).

## Contents

- [Agent Engineering](#agent-engineering)
- [AI Coding](#ai-coding)
- [Design Review](#design-review)
- [Repository Ops](#repo-ops)


## Agent Engineering

- **[gstack Virtual Engineering Team](https://github.com/garrytan/gstack)** · ★135,767 — Opinionated Claude Code skill pack that role-plays CEO, design, eng, release, docs, and QA reviews — including autoplan pipelines that chain review phases with checklists and acceptance criteria.  
  Tools: `claude-code`, `skills` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/gstack-virtual-eng-team.yml)
- **[Persistent Agent Memory Across Sessions](https://github.com/thedotmack/claude-mem)** · ★99,062 — Capture what the agent does during a session, compress with AI, and reinject relevant context into future sessions — a continuity workflow for Claude Code and other agents that otherwise forget between chats.  
  Tools: `claude-code`, `mcp`, `skills`, `other` · Maturity: `verified` · Automation: `semi-auto` · [YAML](workflows/claude-mem-session-continuity.yml)
- **[Superpowers Plan-Then-Execute](https://github.com/obra/superpowers)** · ★297,010 — Composable Claude Code plugin skills for brainstorming, writing a structured plan, executing step-by-step with verification gates, plus optional parallel subagent dispatch and review loops.  
  Tools: `claude-code`, `skills` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/obra-superpowers-plan-execute.yml)
- **[Waza Think → Implement → Check](https://github.com/tw93/Waza)** · ★7,222 — Engineering-habit skills for AI assistants: turn rough ideas into decision-complete plans (/think), implement, then review diffs and release readiness (/check) before shipping — without inventing a new platform.  
  Tools: `skills`, `claude-code`, `codex`, `cursor` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/tw93-waza-think-check.yml)

## AI Coding

- **[Automated Security Review Pass](https://github.com/OneRedOak/claude-code-workflows)** · ★3,900 — On-demand and PR-tied security scanning inspired by Anthropic practice and OWASP Top 10, producing severity-classified findings with remediation hints.  
  Tools: `claude-code`, `github-actions` · Maturity: `verified` · Automation: `semi-auto` · [YAML](workflows/oneredoak-security-review.yml)
- **[Bug Fix Loop (Report → Analyze → Fix → Verify)](https://github.com/Pimzino/claude-code-spec-workflow)** · ★3,860 — A short, gated loop for defects: document the bug, find root cause, implement, then verify — paired with the same Claude Code spec-workflow toolkit.  
  Tools: `claude-code` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/pimzino-bugfix.yml)
- **[Dual-Loop AI Code Review](https://github.com/OneRedOak/claude-code-workflows)** · ★3,900 — Automate routine PR review (syntax, completeness, style, bugs) with Claude Code slash commands plus GitHub Actions, freeing humans for architecture judgment.  
  Tools: `claude-code`, `github-actions` · Maturity: `verified` · Automation: `semi-auto` · [YAML](workflows/oneredoak-code-review.yml)
- **[Spec-Driven Feature Workflow](https://github.com/Pimzino/claude-code-spec-workflow)** · ★3,860 — Structure new features as Requirements → Design → Tasks → Implementation with Claude Code slash commands, document templates, and optional per-task agents.  
  Tools: `claude-code`, `skills` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/pimzino-spec-driven.yml)

## Design Review

- **[Browser Design Review with Playwright MCP](https://github.com/OneRedOak/claude-code-workflows)** · ★3,900 — Front-end review loop that drives a real browser via Playwright MCP and specialized Claude Code agents to check UI consistency, a11y, and polish.  
  Tools: `claude-code`, `playwright`, `mcp` · Maturity: `verified` · Automation: `assisted` · [YAML](workflows/oneredoak-design-review.yml)

## Repository Ops

- **[GitHub Agentic Workflows (Markdown → Actions)](https://github.com/github/awesome-copilot/blob/main/docs/README.workflows.md)** · ★39,879 — Define repo automations in Markdown with YAML frontmatter, compile them with `gh aw` into lockfiles, and run coding agents inside GitHub Actions with guardrails.  
  Tools: `github-actions`, `other` · Maturity: `verified` · Automation: `automated` · [YAML](workflows/github-agentic-workflows.yml)


## Schema

See [`schema/workflow.schema.json`](schema/workflow.schema.json). Validate + regenerate README/site data:

```bash
npm run build:data
```

## Contributing

1. Add `workflows/<id>.yml` matching the schema (filename = `id`).
2. Cite primary sources with URLs (and stars if known).
3. Run `npm run build:data` and commit the regenerated `README.md` + `src/data/workflows.json`.
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

*Generated 2026-10-10 from 10 workflow files. Do not hand-edit the Contents section; edit YAML and run `npm run build:data`.*
