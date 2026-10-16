import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Workflow } from '../lib/types'
import { diagramMarkup } from '../lib/diagram'
import { getDiagram } from './WorkflowDiagram'
import { ConnectionInfo } from './WorkflowDetail'

export type Selection = { kind: 'node' | 'edge'; id: string } | null
type Box = { x: number; y: number; width: number; height: number }

export function InteractiveDiagram({ workflow, viewId, selection, onSelect, onView, rawSvg }: {
  workflow: Workflow; viewId: string; selection: Selection
  onSelect: (selection: Selection) => void; onView: (id: string) => void
  rawSvg?: string
}) {
  const instance = useId()
  const raw = rawSvg ?? getDiagram(workflow, viewId).raw
  const root = useRef<HTMLDivElement>(null)
  const initial = useMemo<Box>(() => {
    const values = raw?.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number)
    return values?.length === 4 ? { x: values[0], y: values[1], width: values[2], height: values[3] } : { x: 0, y: 0, width: 880, height: 392 }
  }, [raw])
  const result = useMemo(() => {
    try { return { markup: raw ? diagramMarkup(raw, workflow, instance, true) : '', error: '' } }
    catch (error) { return { markup: '', error: error instanceof Error ? error.message : 'Diagram mapping failed' } }
  }, [raw, workflow, instance])
  const [box, setBox] = useState(initial)
  const currentBox = useRef(box)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const drag = useRef<{ pointer: number; x: number; y: number; box: Box; matrix: DOMMatrix; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const scale = initial.width / box.width

  useLayoutEffect(() => {
    currentBox.current = box
    root.current?.querySelector('svg')?.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
  }, [box, result.markup])
  useLayoutEffect(() => {
    root.current?.querySelectorAll('[data-node-id], [data-edge-id]').forEach(el => {
      const selected = selection ? selection.id === el.getAttribute(selection.kind === 'node' ? 'data-node-id' : 'data-edge-id') : false
      el.classList.toggle('selected', Boolean(selected))
      if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(Boolean(selected)))
    })
    if (selection?.kind !== 'node') return
    const svg = root.current?.querySelector('svg')
    const node = [...(svg?.querySelectorAll<SVGGElement>('[data-node-id]') || [])].find(el => el.getAttribute('data-node-id') === selection.id)
    const nodeBox = node?.querySelector<SVGRectElement>('[data-node-box]')
    if (!svg || !nodeBox) return
    const screen = nodeBox.getBoundingClientRect(), viewport = svg.getBoundingClientRect()
    const tooSmall = screen.width < 140
    const outside = screen.left < viewport.left || screen.right > viewport.right || screen.top < viewport.top || screen.bottom > viewport.bottom
    if (!tooSmall && !outside) return
    const bounds = nodeBox.getBBox()
    setBox(previous => {
      const nextScale = Math.min(6, initial.width / previous.width * (tooSmall ? 160 / Math.max(1, screen.width) : 1))
      const ratio = initial.width / nextScale / previous.width
      const width = previous.width * ratio, height = previous.height * ratio
      return { x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y + bounds.height / 2 - height / 2, width, height }
    })
  }, [selection, result.markup])

  const zoom = (factor: number, point?: { x: number; y: number }) => {
    setBox(previous => {
      const nextScale = Math.min(6, Math.max(0.5, initial.width / previous.width * factor))
      const ratio = initial.width / nextScale / previous.width
      const anchor = point || { x: previous.x + previous.width / 2, y: previous.y + previous.height / 2 }
      return { x: anchor.x - (anchor.x - previous.x) * ratio, y: anchor.y - (anchor.y - previous.y) * ratio, width: previous.width * ratio, height: previous.height * ratio }
    })
  }
  useEffect(() => {
    const element = root.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      const svg = element.querySelector('svg')
      const matrix = svg?.getScreenCTM()?.inverse()
      if (!matrix) return
      event.preventDefault()
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
      zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.008), point)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [initial])

  const selectTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const node = target.closest('[data-node-id]')?.getAttribute('data-node-id')
    const edge = target.closest('[data-edge-id]')?.getAttribute('data-edge-id')
    if (node) {
      const view = workflow.diagram_views?.find(v => v.id === node)
      if (view && !workflow.steps.some(s => s.id === node)) onView(node)
      else onSelect({ kind: 'node', id: node })
    } else if (edge) onSelect({ kind: 'edge', id: edge })
  }
  const edge = workflow.edges?.find(e => e.id === hoverEdge)
  if (!result.markup) return <div className="diagram-missing" role="alert">{result.error || 'Diagram unavailable for this view.'}</div>
  return (
    <div className="canvas-shell">
      <div className="canvas-instruction">Select a step · Hover a connection · Drag to move</div>
      <div className="interactive-diagram" ref={root}
        onPointerDown={event => {
          if (event.button !== 0) return
          const matrix = root.current?.querySelector('svg')?.getScreenCTM()?.inverse()
          if (!matrix) return
          suppressClick.current = false
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, box: currentBox.current, matrix, moved: false }
        }}
        onPointerMove={event => {
          const start = drag.current
          if (!start || start.pointer !== event.pointerId) {
            const target = event.target as Element
            setHoverEdge(target.closest('[data-edge-id]')?.getAttribute('data-edge-id') || null)
            return
          }
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5 && !start.moved) return
          start.moved = true
          suppressClick.current = true
          setHoverEdge(null)
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.classList.add('dragging')
          const a = new DOMPoint(start.x, start.y).matrixTransform(start.matrix)
          const b = new DOMPoint(event.clientX, event.clientY).matrixTransform(start.matrix)
          setBox({ ...start.box, x: start.box.x + a.x - b.x, y: start.box.y + a.y - b.y })
        }}
        onPointerUp={event => { drag.current = null; event.currentTarget.classList.remove('dragging') }}
        onPointerCancel={event => { drag.current = null; suppressClick.current = true; event.currentTarget.classList.remove('dragging') }}
        onLostPointerCapture={event => { drag.current = null; event.currentTarget.classList.remove('dragging') }}
        onPointerLeave={() => setHoverEdge(null)}
        onClick={event => { if (!suppressClick.current) selectTarget(event.target) }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTarget(event.target) }
        }}
        onFocus={event => setHoverEdge((event.target as Element).getAttribute('data-edge-id'))}
        onBlur={() => setHoverEdge(null)}
        dangerouslySetInnerHTML={{ __html: result.markup }} />
      {edge ? <div className="connection-tooltip" role="tooltip"><ConnectionInfo workflow={workflow} edge={edge} compact /></div> : null}
      <div className="canvas-controls" aria-label="Diagram controls">
        <button onClick={() => zoom(1 / 1.25)} aria-label="Zoom out" disabled={scale <= 0.5}>−</button>
        <output aria-label="Zoom level">{Math.round(scale * 100)}%</output>
        <button onClick={() => zoom(1.25)} aria-label="Zoom in" disabled={scale >= 6}>+</button>
        <span className="control-divider" />
        <button onClick={() => { setBox(initial); setHoverEdge(null) }} className="fit-button">Fit view</button>
      </div>
    </div>
  )
}
