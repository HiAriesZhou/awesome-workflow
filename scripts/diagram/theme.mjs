// Diagram style constants. Roles and rationale: DESIGN.md (the build checks
// that its color table matches `colors`).

export const colors = {
  paper: '#f4efe6',
  ink: '#0c0f14',
  muted: '#5c6370',
  rule: '#d9d0c1',
  edge: '#7a7266',
  accent: '#0f766e',
  human: '#a1460f',
  agent: '#1e4fa8',
  tool: '#4d6b14',
  ci: '#4b5563'
}

export const laneOrder = ['human', 'agent', 'tool', 'ci']

export const fonts = {
  sans: '"IBM Plex Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
}

// All geometry is in px and must stay on the 4px grid.
export const grid = {
  unit: 4,
  pad: 24,
  gutter: 72,
  nodeW: 160,
  nodeH: 72,
  nodeRadius: 4,
  stripe: 4,
  textLeft: 16,
  textRight: 12,
  colGap: 40,
  laneH: 104,
  legendGap: 16,
  legendH: 16,
  gate: 16,
  elbow: 8,
  arrow: 8,
  cardRadius: 8
}

export const type = {
  nameSize: 13,
  nameLine: 16,
  smallSize: 11,
  // Deliberately wide estimates so fallback fonts still fit.
  latinWidth: 7.2,
  cjkWidth: 13,
  smallWidth: 6.4,
  monoWidth: 6.6
}

export const budget = {
  steps: 9,
  lanes: 4,
  gates: 3,
  nameLines: 2
}
