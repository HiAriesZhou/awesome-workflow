// Frozen comparison experiment, never imported by the main renderer.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
const [checkout, directory = 'docs/implementation/archify-probe'] = process.argv.slice(2)
if (!checkout) throw new Error('Usage: node scripts/probes/archify-browser.mjs <archify v3.0.1 checkout> [probe output]')
const output = path.resolve(directory), browser = await chromium.launch({ headless: true })
const receipts = []
try {
  for (const id of ['simple-chain', 'conditional-route', 'parallel-join', 'feedback-loop', 'human-approval']) {
    const html = path.join(output, `${id}.html`)
    execFileSync(process.execPath, [path.join(checkout, 'archify/bin/archify.mjs'), 'render', 'workflow', path.join(output, `${id}.json`), html, '--quality', 'standard'], { env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' }, stdio: 'pipe' })
    for (const mode of ['standalone-svg', 'html-template']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
      if (mode === 'standalone-svg') await page.setContent(fs.readFileSync(path.join(output, `${id}.svg`), 'utf8'))
      else await page.goto(pathToFileURL(html).href)
      await page.evaluate(() => document.fonts.ready)
      const observed = await page.evaluate(() => {
        const svg = document.querySelector('svg[role="img"]')
        return { font: getComputedStyle(svg.querySelector('text')).fontFamily, fills: [...new Set([...svg.querySelectorAll('rect, path, polygon, text')].map(el => getComputedStyle(el).fill))], paperToken: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), hasInlineStyle: Boolean(svg.querySelector('style')), nodeCount: svg.querySelectorAll('[data-node-id]').length }
      })
      const screenshot = `${id}-${mode}.png`
      await page.screenshot({ path: path.join(output, screenshot), fullPage: true })
      receipts.push({ id, mode, ...observed, screenshot })
      await page.close()
    }
  }
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ version: '3.0.1', browser: browser.version(), node: process.version, receipts }, null, 2) + '\n')
  console.log(JSON.stringify({ samples: receipts.length, report: path.join(output, 'browser-report.json') }))
} finally { await browser.close() }
