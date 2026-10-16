# Design: workflow diagrams

Scope: the static SVG compiler, published gallery and internal review pipeline. Existing v1 diagrams keep their geometry. V2 uses explicit graph semantics with separately generated views; see the v2 rules below. The same published diagram is embedded in README and the gallery. The gallery display rules are below.

Background research: [docs/research/diagram-quality.md](docs/research/diagram-quality.md).

## Principles

1. **Compiled, not drawn.** Geometry comes from the YAML, never from hand-placed coordinates. The same YAML always produces byte-identical SVG.
2. **A paper card in the ink library.** The diagram is one of DECISIONS P3's "warm paper cards": paper ground, ink text, one teal accent. It carries its own background, so it reads the same in the dark gallery, in GitHub light mode and in GitHub dark mode.
3. **Accent means one thing: a human gate.** "Where does a human approve?" is the headline of every workflow in this library. Teal is spent on that and nothing else.
4. **Color is vocabulary, not decoration.** Each actor has one fixed color. Never add color to make a diagram livelier.
5. **Split presentation, preserve facts.** If a diagram feels busy, split its views. Never delete real steps, approvals, branches or loops to satisfy a display budget.

## Color roles

Values below are mirrored in `scripts/diagram/theme.mjs`; the build fails if the two drift. Contrast is measured against `paper`.

| Role | Value | Contrast | Use |
|------|-------|----------|-----|
| `paper` | `#f4efe6` | n/a | Card background, node fill |
| `ink` | `#0c0f14` | 16.8:1 | Step names |
| `muted` | `#5c6370` | 5.3:1 | Sublabels, legend text, tools |
| `rule` | `#d9d0c1` | 1.3:1 | Card border, lane separators (decorative only) |
| `edge` | `#7a7266` | 4.1:1 | Connectors and arrowheads |
| `accent` | `#0f766e` | 4.8:1 | Human-gate markers only |
| `human` | `#a1460f` | 5.4:1 | Human lane label, node border and stripe |
| `agent` | `#1e4fa8` | 6.7:1 | Agent lane |
| `tool` | `#4d6b14` | 5.4:1 | Tool lane |
| `ci` | `#4b5563` | 6.6:1 | CI lane |

Text roles need at least 4.5:1 and essential graphics (connectors, actor borders, the accent) at least 3:1. `rule` is exempt because nothing depends on seeing it.

Why these are darker than the site tokens: the site's `--teal` (`#2dd4bf`) and `--amber` (`#f5b94a`) reach only about 1.6:1 on paper. The diagram uses the same hue families darkened: `accent` is the site's existing `--teal-dim`, and `human` stays in the amber family the gallery already uses for humans. `agent` is deliberately not teal so it never competes with the accent.

## Legacy v1 grid and geometry

Every coordinate, width, height, gap and padding is a multiple of **4 px**, and the build asserts it.

| Constant | Value |
|----------|-------|
| Card padding | 24 |
| Lane label gutter | 72 |
| Node | 160 × 72, radius 4, 1 px actor-color border, 4 px actor-color stripe on the left |
| Node text inset | 16 left (after the stripe), 12 right |
| Column gap | 40 |
| Lane height | 104 (node plus 16 above and below) |
| Legend row | 16 below the last lane, 16 tall |
| Gate marker | 16 × 16 diamond |
| Width | `200 × steps + 80` (4 steps = 880) |
| Height | `104 × lanes + 80` |

Layout:

- **Lanes are actors**, in fixed order `human`, `agent`, `tool`, `ci`. Only actors that appear get a lane.
- **Columns are step order.** Step *n* sits in column *n*, so time always reads left to right.
- **Connectors are orthogonal** with r = 8 elbows. A connector between lanes turns in the middle of the column gap. Because columns strictly increase, that vertical run always sits in an empty gap, so a connector can never cross a node.
- **No connector labels in v1.** There is no edge data to label yet. When `on_fail` arrives: at most 14 characters, uppercase, on an opaque `paper` mask, 6 to 10 px off the line.

## Human gates

`human_gate: true` means a human approves the step's result before the flow continues. That is a checkpoint at the step's exit, not a human node, so it shows on agent-only workflows too.

- Drawn as a 16 px `accent` diamond centered on the step node's right edge. The outgoing connector starts after the diamond.
- Nodes are never filled with the accent.
- At most 3 gate markers per diagram. More than that means the workflow has not decided where review actually matters.

## Labels and type

| Text | Face | Size | Rule |
|------|------|------|------|
| Step name | Sans | 13 px, 16 px line | At most 2 lines inside 132 px; the build fails rather than truncating |
| Sublabel | Mono | 11 px | `model_tier`, uppercase; omitted when absent or `unknown` |
| Lane label | Mono | 11 px | Actor name, uppercase, actor color |
| Legend | Sans and mono | 11 px | Actors present, gate marker if any, tools in mono |

- Font stacks only: `"IBM Plex Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif` and `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`. No `@import` or remote fonts; GitHub shows the SVG as an image and would not load them anyway.
- Mono is for technical content only (model tiers, lane ids, tool ids), never for atmosphere.
- Width is estimated, not measured: 7.2 px per Latin character and 13 px per CJK character at 13 px, 6.4 px per character for 11 px sans, 6.6 px for 11 px mono. The estimates are deliberately wide for fallback fonts.
- Names wrap at spaces and between CJK characters. A word that cannot fit on one line may break after a hyphen; otherwise the build fails.
- No visible title. The README entry and the detail panel already show it; the SVG carries it in `<title>` for assistive technology.
- The legend is a strip below the lanes, built from what the diagram actually uses. It never floats inside the lanes.

## Legacy single-view budget

| Limit | Value | When exceeded |
|-------|-------|---------------|
| Steps | 9 | Direct v1 single-diagram calls fail; the build/pipeline view-set entry splits larger graphs |
| Lanes | 4 | Guaranteed by the actor enum |
| Gate markers | 3 | Split detail views; preserve every approval |
| Step name | 2 lines | Build fails; shorten the name, and keep the detail in `notes` |
| Legend | One row inside the card | Build fails; usually too many `tools` for a short workflow |

## Accessibility

- Root `<svg>` has `role="img"` and `aria-labelledby` pointing at its `<title>` and `<desc>`.
- `<title>` is the first child. `<desc>` lists the steps in order, with actor and gate, as plain text.
- Every `id` is prefixed `wf-<workflow id>-` so several inlined diagrams can never collide.
- Styling uses presentation attributes, not a `<style>` block, so inlined SVG cannot leak CSS into the page.
- Wide diagrams scroll horizontally inside their container (`overflow-x: auto`) at natural size instead of shrinking text below legibility.

## Anti-patterns

| Do not | Why |
|--------|-----|
| Use the accent for anything but gate markers | It stops meaning "a human approves here" |
| Fill nodes with the accent, or give every step the same box | The actor stripe and gate marker are the only differentiators; keep both meaningful |
| Add shadows, gradients or glow | Flat paper is the material; depth adds nothing here |
| Use corner radii above 6 px | Reads as generic UI cards, not a diagram |
| Draw on a dark background with neon accents | The classic "AI generated" look; the diagram is a paper card |
| Use mono (or JetBrains Mono) as a general face | Mono marks technical identifiers only |
| Float the legend inside the lanes | Collides with content; legend lives in the bottom strip |
| Draw diagonal connectors, or route a connector through a node | Orthogonal routing in empty gaps keeps flow legible |
| Copy a Mermaid or upstream README layout | Redraw as YAML; the compiler owns geometry |
| Repeat the workflow title inside the SVG | It is already right above the diagram |
| Hand-edit `docs/diagrams/*.svg` | Generated output; edit the YAML or the compiler |

## V2 graph and views (P0)

- Steps and edges are semantic data. Actor instances own lanes; category colors are unchanged. A dynamic actor collection is labelled as such, never expanded into a fictitious fixed number of workers.
- Non-feedback edges determine deterministic longest-path columns, with codepoint-sorted IDs. Parallel siblings sharing an actor receive separate rows in the same lane and the same column. Cycles require an explicit feedback edge; no implicit linear connections are added.
- Nodes retain the 160 px width, 4 px grid, paper, fonts and actor stripes. Height grows to fit complete wrapped names. Empty labels and unbreakable oversized words fail explicitly. Labels are never truncated.
- Orthogonal connectors use deterministic ports and separate channels above the lanes. Conditions/kinds appear in aligned channel rows; SVG path titles and the evidence ledger give exact endpoints. Feedback and inferred/unknown/migrated edges are dashed; the path's data-kind keeps these distinct. Human gates alone use the teal diamond.
- The 9-node / 3-gate budget applies to each view. The compiler partitions into at most 9 overview groups and details (normally up to 6 real steps plus boundary references); all real step IDs, control-edge IDs, original kinds and approvals remain in the manifest/details. Overview groups count gates rather than pretending a group is itself an approval. Overview display ranks may differ from semantic order; edge kinds are preserved. Too many groups or boundary endpoints block rendering and retain the complete draft for editorial partitioning.
- Automatic grouping is recorded as editorial inference, not upstream fact. `phase` is semantic/editorial metadata and does not imply execution. This is a library compiler, not an execution engine or BPMN implementation.
- The pipeline compiles all views into a staging directory, measures labels with Chromium, then replaces the case package only after every check passes. The last-good directory is restored if replacement fails. One initial candidate attempt plus two repair rounds is the limit; further work needs an explicit manual resume note.
- Fixed dependencies are in package-lock.json. SVG bytes are tested for repeatability; screenshot reports record Playwright, Chromium, Node, OS and font stacks. Fonts are local fallbacks, so cross-OS screenshot identity is not promised. No remote fonts or paid services are loaded.

Backend experiment and selection: [renderer evidence](docs/implementation/renderer-decision.md). Commands, evidence meaning and remaining limits: [pipeline](docs/implementation/pipeline.md).

## Gallery and interactive overlay

- Theme: retain the ink background, warm paper diagrams and existing local font
  stacks. Remove the large promotional header and gradients. The diagrams are
  the dominant surface; metadata sits below each image without a separate box.
- Palette: site ink `#0c0f14`, surfaces `#141a22`, text `#f4efe6`, secondary text
  `#a3adbf`. Diagram colors remain the table above. Actor colors still describe
  roles; selected nodes use thicker actor-colored outlines rather than a new hue.
- Type: 23px wordmark, 22px gallery heading, 17px case titles, 13px controls/body,
  11–12px metadata. IBM Plex/system sans is retained for consistency; mono remains
  limited to the generated diagram's technical fields.
- Components: one search/filter toolbar, two-column image gallery, native dialog
  overlay and metadata inspector. Radius 3–4px for controls/images, 6px toolbar,
  8px overlay. Flat surfaces; no decorative shadows or glass.
- Layout: 1680px maximum canvas, 48px desktop page inset, 28px column gap, 32px
  row gap. Thumbnail fitting shows the complete view; it is a browsing preview.
  The overlay offers fit, 50–600% zoom, wheel zoom and pointer/touch pan. SVG
  `viewBox` changes only in the display layer; exported files remain unchanged.
- Interaction: select nodes for recorded detail; hover/focus lines for source and
  target, kind/condition, recorded outputs and evidence origin. Click/Enter pins
  connection details for touch/keyboard users. Legacy connection inference is
  explicitly labelled. Overview nodes and the step index navigate split views.
  A selected node that is too small or offscreen is centered and enlarged within
  the 600% zoom limit; Fit view restores the complete graph.
- Accessibility: native focus containment, Escape/backdrop/close and focus return;
  SVG nodes/connections are keyboard controls with meaningful labels. Namespace
  IDs per display instance. No decorative load motion; reduce-motion removes
  thumbnail hint transitions. Empty/missing diagrams get explicit messages.
- Responsive: at 760px and below use one column and a full-height overlay with
  diagram above metadata. At 1100px and below the search wraps above filters.
  View controls and close targets are at least 40px. Check 320/375/760/1024px.
- Future edits: use the existing CSS tokens and display adapter. Keep full source
  data, approvals and graph kinds. Do not edit generated SVGs, publish fixtures,
  add a second canvas backend or infer new author/tool/source facts for the UI.

Design scope: [gallery design](docs/plans/2026-10-14-gallery-design.md).
Browser evidence: `docs/implementation/gallery/report.json` and screenshots.
