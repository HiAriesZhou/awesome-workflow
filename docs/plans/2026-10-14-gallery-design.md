# Gallery redesign

User direction: show diagrams below a search/filter toolbar; open a large
overlay with node details, connection information and case metadata.
This replaces the selected-diagram band and card/detail split. The user
requested implementation; no extra plan approval or commit is needed.

- Retain ink canvas, warm paper diagrams, IBM Plex/system fonts and actor
  colors. Use the existing CSS file; no UI or canvas dependency.
- Compact header and toolbar. Search includes authors; domain, tool and
  evidence filters. Two columns on desktop, one on phones. All diagrams visible
  before selection; thumbnail fitting is presentation only.
- Native dialog: zoom/pan/fit, view selection for split graphs, independently
  scrolling metadata. Focus containment, Escape/backdrop/close and return focus.
- Generated SVG is the sole backend. A browser adapter annotates legacy nodes
  and edges and namespaces IDs; no geometry or generated-file changes.
- Select nodes for role, approval, inputs, outputs, notes and evidence. Hover or
  focus connections for endpoints, condition/kind, recorded handoff and evidence
  origin; click pins details for touch users. Migration remains explicit.
- Metadata uses existing summary, authors, domain, tags, tools and source links.
  Missing data stays unknown. No new publication or business execution.
- Verify baseline, all old cases, keyboard/focus, nodes/edges, zoom/pan,
  search/filter/reset, mobile overflow and synthetic V2/split views. Save screenshots.

An inline panel repeats the space constraint. A canvas library adds another
display model. The requested overlay provides room while preserving exports.
