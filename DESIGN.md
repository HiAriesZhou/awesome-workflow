# Design: workflow diagrams

Scope: the static SVG swimlane that `scripts/build.mjs` compiles from each `workflows/<id>.yml` into `docs/diagrams/<id>.svg`. The same file is embedded in the README and inlined in the gallery detail view. Site chrome (hero, cards, filters) is out of scope for v1.

Background research: [docs/research/diagram-quality.md](docs/research/diagram-quality.md).

## Principles

1. **Compiled, not drawn.** Geometry comes from the YAML, never from hand-placed coordinates. The same YAML always produces byte-identical SVG.
2. **A paper card in the ink library.** The diagram is one of DECISIONS P3's "warm paper cards": paper ground, ink text, one teal accent. It carries its own background, so it reads the same in the dark gallery, in GitHub light mode and in GitHub dark mode.
3. **Accent means one thing: a human gate.** "Where does a human approve?" is the headline of every workflow in this library. Teal is spent on that and nothing else.
4. **Color is vocabulary, not decoration.** Each actor has one fixed color. Never add color to make a diagram livelier.
5. **The best edit is a deletion.** If a diagram feels busy, cut steps or split it before adding styling.

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

## Grid and geometry

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

## Complexity budget

| Limit | Value | When exceeded |
|-------|-------|---------------|
| Steps | 9 | Build fails. Once `phases` exists in the schema: band the steps by phase, or split into an overview diagram and a detail diagram |
| Lanes | 4 | Guaranteed by the actor enum |
| Gate markers | 3 | Build fails; decide which approvals matter |
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
