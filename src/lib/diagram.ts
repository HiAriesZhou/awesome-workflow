import type { Workflow } from './types'

// Only local, compiler-generated SVG is accepted. Annotate legacy geometry
// without changing the exported/README diagrams.
export function diagramMarkup(raw: string, workflow: Workflow, instance: string, interactive: boolean) {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid generated SVG')
  const svg = doc.documentElement
  const ns = 'http://www.w3.org/2000/svg'
  if (!svg.querySelector('[data-node-id]')) {
    const boxes = [...svg.children].filter(el => el.tagName === 'rect' && el.hasAttribute('x') && el.getAttribute('width') === '160')
    if (boxes.length !== workflow.steps.length) throw new Error('Legacy diagram node mapping does not match workflow')
    boxes.forEach((box, i) => {
      const group = doc.createElementNS(ns, 'g')
      group.setAttribute('data-node-id', workflow.steps[i].id)
      svg.insertBefore(group, box)
      let next: Element | null = box
      while (next && (next === box || next.tagName === 'text' || (next.tagName === 'path' && !next.hasAttribute('marker-end')))) {
        const following: Element | null = next.nextElementSibling
        group.appendChild(next)
        next = following
      }
      box.setAttribute('data-node-box', 'true')
    })
    const paths = [...svg.children].filter(el => el.tagName === 'path' && el.hasAttribute('marker-end'))
    if (paths.length !== (workflow.edges?.length || 0)) throw new Error('Legacy diagram connection mapping does not match workflow')
    paths.forEach((el, i) => el.setAttribute('data-edge-id', workflow.edges![i].id))
  }
  // Thumbnail and explorer coexist; namespace every SVG reference.
  const prefix = `display-${instance.replace(/[^a-zA-Z0-9_-]/g, '')}-`
  const ids = new Map([...svg.querySelectorAll('[id]')].map(el => [el.id, `${prefix}${el.id}`]))
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      let value = attr.value
      if (attr.name === 'id') value = ids.get(value) || value
      if (attr.name === 'aria-labelledby' || attr.name === 'aria-describedby') value = value.split(' ').map(id => ids.get(id) || id).join(' ')
      value = value.replace(/url\(#([^)]*)\)/g, (_, id: string) => `url(#${ids.get(id) || id})`)
      if (attr.name === 'href' && value.startsWith('#')) value = `#${ids.get(value.slice(1)) || value.slice(1)}`
      el.setAttribute(attr.name, value)
    }
  }
  if (interactive) {
    svg.setAttribute('role', 'group')
    svg.querySelectorAll('[data-node-id]').forEach(el => {
      const id = el.getAttribute('data-node-id')!
      const step = workflow.steps.find(s => s.id === id)
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      el.setAttribute('aria-label', step ? `Step: ${step.name}` : `Open view: ${id}`)
      el.setAttribute('aria-pressed', 'false')
    })
    svg.querySelectorAll('[data-edge-id]').forEach(el => {
      const edge = workflow.edges?.find(e => e.id === el.getAttribute('data-edge-id'))
      if (!edge) return
      const hit = el.cloneNode(true) as Element
      hit.removeAttribute('id')
      hit.removeAttribute('marker-end')
      hit.setAttribute('stroke', 'transparent')
      hit.setAttribute('stroke-width', '18')
      hit.setAttribute('vector-effect', 'non-scaling-stroke')
      hit.setAttribute('class', 'edge-hit')
      hit.setAttribute('role', 'button')
      hit.setAttribute('tabindex', '0')
      hit.setAttribute('aria-label', `Connection: ${workflow.steps.find(s => s.id === edge.from)?.name || edge.from} to ${workflow.steps.find(s => s.id === edge.to)?.name || edge.to}`)
      hit.setAttribute('aria-pressed', 'false')
      el.after(hit)
    })
  }
  return new XMLSerializer().serializeToString(svg)
}
