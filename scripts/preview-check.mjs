import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Check the user's running URL, not a newly started test server. A successful
// production build cannot prove that an older local process serves that build.
const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const url = new URL(option('--url', 'http://127.0.0.1:5173/awesome-workflow/'))
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Preview checks require a localhost URL')
const output = path.resolve(option('--out', 'docs/implementation/gallery/live-preview'))
fs.mkdirSync(path.dirname(output), { recursive: true })
const data = JSON.parse(fs.readFileSync('src/data/workflows.json', 'utf8'))
const report = { url: url.href, expected: data.count, passed: false, errors: [] }
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort())
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 15000 })
  report.galleryItems = await page.locator('.gallery-item').count()
  report.initialDiagrams = await page.locator('.gallery-preview svg').count()
  report.initialDialogs = await page.locator('dialog[open]').count()
  await page.screenshot({ path: `${output}.png`, fullPage: true })
  assert.equal(report.galleryItems, data.count, 'Running preview must show every workflow without selection')
  assert.equal(report.initialDiagrams, data.count, 'Every workflow must render its SVG before any click')
  assert.equal(report.initialDialogs, 0, 'No case should be selected on arrival')
  for (const workflow of data.workflows) {
    const tile = page.getByRole('button', { name: `Explore ${workflow.title}`, exact: true })
    assert.equal(await tile.locator('svg').count(), 1)
    assert.ok(await tile.locator('svg').evaluate(svg => svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().height > 0))
  }
  await page.locator('.gallery-item').first().click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.locator('.gallery-preview svg').count(), data.count, 'Opening a detail must retain all gallery diagrams')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('dialog[open]').count(), 0)
  assert.equal(await page.locator('.gallery-preview svg').count(), data.count)
  assert.deepEqual(report.errors, [])
  report.passed = true
  report.browser = browser.version()
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  fs.writeFileSync(`${output}.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
