import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

export async function inspectPage(page) {
return page.evaluate(() => {
      const svg = document.querySelector('svg'), vb = svg.viewBox.baseVal, failures = []
      const rect = b => ({ x: b.x, y: b.y, w: b.width, h: b.height })
      const overlap = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5
      const labels = [...svg.querySelectorAll('text')].map(t => ({ text: t.textContent, box: rect(t.getBBox()) }))
      for (const l of labels) if (l.box.x < 0 || l.box.y < 0 || l.box.x + l.box.w > vb.width || l.box.y + l.box.h > vb.height) failures.push(`Text clipped: ${l.text}`)
      for (const edge of svg.querySelectorAll('[data-edge-id]')) { const b = edge.getBBox(); if (b.x < 0 || b.y < 0 || b.x + b.width > vb.width || b.y + b.height > vb.height) failures.push(`Connector clipped: ${edge.dataset.edgeId}`) }
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i].box, labels[j].box)) failures.push(`Label overlap: ${labels[i].text} / ${labels[j].text}`)
      for (const n of svg.querySelectorAll('[data-node-id]')) {
        const box = n.querySelector('[data-node-box]').getBBox()
        for (const t of n.querySelectorAll('[data-node-label]')) { const b = t.getBBox(); if (b.x < box.x + 8 || b.x + b.width > box.x + box.width - 4 || b.y < box.y + 4 || b.y + b.height > box.y + box.height - 4) failures.push(`Node label overflow: ${n.dataset.nodeId}`) }
      }
      return { failures, width: vb.width, height: vb.height, node_count: svg.querySelectorAll('[data-node-id]').length, edge_count: svg.querySelectorAll('[data-edge-id]').length, actual_fonts: getComputedStyle(svg.querySelector('text')).fontFamily, user_agent: navigator.userAgent }
    })
}

export async function checkViews(views, output) {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  const receipts = []
  try {
    for (const view of views) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
      await page.route('**/*', route => route.abort())
      await page.setContent(`<html><meta charset="utf-8"><style>body{margin:0;background:#f4efe6}svg{display:block}</style>${view.svg}</html>`)
      await page.evaluate(() => document.fonts.ready)
      const measured = await inspectPage(page)
      await page.setViewportSize({ width: Math.ceil(measured.width), height: Math.ceil(measured.height) })
      await page.screenshot({ path: path.join(output, `${view.id}.png`), fullPage: true })
      receipts.push({ id: view.id, ...measured, screenshot: `${view.id}.png` })
      await page.close()
    }
    return { playwright: JSON.parse(fs.readFileSync(new URL('../../node_modules/playwright/package.json', import.meta.url))).version, browser: browser.version(), node: process.version, platform: `${process.platform}-${process.arch}`, receipts, passed: receipts.every(r => r.failures.length === 0) }
  } finally { await browser.close() }
}
