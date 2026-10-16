#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { topologies, longLabels, complex, terminalLoop } from '../../tests/fixtures/topologies.mjs'
import { compileDiagramSet } from './compile.mjs'
import { inspectPage } from './browser.mjs'
import { atomicJSON } from '../curator/pipeline.mjs'

const output = path.resolve(process.argv[2] || 'docs/implementation/visual')
fs.mkdirSync(output, { recursive: true })
const samples = []
for (const w of [...topologies, longLabels, complex, terminalLoop]) for (const v of compileDiagramSet(w)) samples.push({ id: `${w.id}-${v.id}`, svg: v.svg, semantic_nodes: w.steps.length, fixture: true })
const packages = path.resolve('docs/review/cases')
if (fs.existsSync(packages)) for (const dir of fs.readdirSync(packages).sort()) {
  const folder = path.join(packages, dir)
  if (!fs.statSync(folder).isDirectory() || !fs.existsSync(path.join(folder, 'report.json'))) continue
  const report = JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8'))
  for (const v of report.views) samples.push({ id: `${dir}-${v.id}`, svg: fs.readFileSync(path.join(folder, v.file), 'utf8'), package: folder, fixture: false })
}
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
const receipts = []
try {
  for (const sample of samples) {
    const file = path.join(output, `${sample.id}.html`)
    fs.writeFileSync(file, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${sample.id}</title><style>body{margin:0;background:#f4efe6}svg{display:block}</style>${sample.svg}</html>`)
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
    await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort())
    await page.goto(pathToFileURL(file).href)
    await page.evaluate(() => document.fonts.ready)
    const check = await inspectPage(page)
    await page.setViewportSize({ width: Math.ceil(check.width), height: Math.ceil(check.height) })
    await page.screenshot({ path: path.join(output, `${sample.id}.png`), fullPage: true })
    receipts.push({ id: sample.id, fixture: sample.fixture, ...check, screenshot: `${sample.id}.png`, package: sample.package ? path.relative(output, sample.package) : null })
    await page.close()
  }
  const report = { playwright: JSON.parse(fs.readFileSync(new URL('../../node_modules/playwright/package.json', import.meta.url))).version, browser: browser.version(), platform: `${process.platform}-${process.arch}`, checks: 'Actual rendered SVG bounding boxes, label overlap/containment, offline screenshots. Geometry routes checked by compiler. Visual acceptance is separate.', receipts }
  atomicJSON(path.join(output, 'report.json'), report)
  for (const folder of new Set(samples.filter(s => s.package).map(s => s.package))) {
    const file = path.join(folder, 'report.json'), r = JSON.parse(fs.readFileSync(file))
    const matching = receipts.filter(s => s.package === path.relative(output, folder))
    r.checks.browser = matching.every(s => s.failures.length === 0) ? 'passed' : 'failed'
    r.browser_report = path.relative(folder, path.join(output, 'report.json'))
    atomicJSON(file, r)
  }
  console.log(JSON.stringify({ samples: receipts.length, failures: receipts.filter(r => r.failures.length).map(r => ({ id: r.id, failures: r.failures })), browser: report.browser, report: path.join(output, 'report.json') }, null, 2))
  if (receipts.some(r => r.failures.length)) process.exitCode = 1
} finally { await browser.close() }
