import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview, createServer } from 'vite'
import { compileDiagramSet } from './diagram/compile.mjs'
import { topologies, longLabels, complex } from '../tests/fixtures/topologies.mjs'

const output = path.resolve('docs/implementation/gallery')
fs.mkdirSync(output, { recursive: true })
const data = JSON.parse(fs.readFileSync('src/data/workflows.json'))
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
const url = server.resolvedUrls.local[0]
const errors = [], checks = [], opened = [], screenshots = []
let browser, fixtureServer
const shot = async (page, name, fullPage = false) => {
  await page.screenshot({ path: path.join(output, name), fullPage })
  screenshots.push(name)
}
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page overflows horizontally')
const edgePoint = async locator => locator.evaluate(el => {
  const p = el.getPointAtLength(el.getTotalLength() * 0.5).matrixTransform(el.getScreenCTM())
  return { x: p.x, y: p.y }
})
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', r => r.request().url().startsWith(url) ? r.continue() : r.abort())
  await page.goto(url, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.gallery-item').count(), data.count)
  assert.equal(await page.locator('.gallery-preview svg').count(), data.count)
  assert.equal(await page.locator('dialog[open]').count(), 0)
  await noOverflow(page)
  await shot(page, 'gallery.png')
  await shot(page, 'gallery-full.png', true)
  checks.push('Every published case has a visible SVG before selection; desktop gallery has no overflow.')
  for (const w of data.workflows) {
    const tile = page.getByRole('button', { name: `Explore ${w.title}`, exact: true })
    await tile.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    assert.equal(await dialog.locator('[data-node-id]').count(), w.steps.length)
    assert.equal(await dialog.locator('.edge-hit').count(), w.edges.length)
    assert.ok((await dialog.locator('.inspector').textContent()).includes(w.authors.join(', ')))
    assert.ok((await dialog.locator('.inspector').textContent()).includes('unknown'))
    for (const step of w.steps) {
      await dialog.getByRole('button', { name: `Step: ${step.name}`, exact: true }).click()
      assert.equal(await dialog.locator('.selection-detail h3').textContent(), step.name)
      assert.ok((await dialog.locator('.selection-detail').textContent()).includes(step.outputs?.join(', ') || 'Not recorded'))
    }
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('dialog[open]').count(), 0)
    assert.equal(await tile.evaluate(el => document.activeElement === el), true, 'Closing returns focus to tile')
    opened.push(w.id)
  }
  checks.push('All legacy nodes map to exact recorded details; all connections map; case authors/sources/toolchain present; Escape returns focus.')

  await page.getByRole('button', { name: `Explore ${data.workflows[0].title}`, exact: true }).click()
  const diagram = page.locator('.interactive-diagram svg')
  const fit = await diagram.getAttribute('viewBox')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  assert.notEqual(await diagram.getAttribute('viewBox'), fit)
  assert.equal(await page.getByLabel('Zoom level').textContent(), '125%')
  const canvas = await page.locator('.interactive-diagram').boundingBox()
  const beforePan = await diagram.getAttribute('viewBox')
  await page.mouse.move(canvas.x + 20, canvas.y + 20)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 95, canvas.y + 55, { steps: 5 })
  await page.mouse.up()
  assert.notEqual(await diagram.getAttribute('viewBox'), beforePan)
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  assert.equal(await diagram.getAttribute('viewBox'), fit)
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await page.mouse.wheel(0, -70)
  await page.waitForFunction(old => document.querySelector('.interactive-diagram svg').getAttribute('viewBox') !== old, fit)
  await page.getByRole('button', { name: 'Fit view', exact: true }).click()
  const hit = page.locator('.edge-hit').first()
  const point = await edgePoint(hit)
  await page.mouse.move(point.x, point.y)
  await page.getByRole('tooltip').waitFor()
  assert.ok((await page.getByRole('tooltip').textContent()).includes('legacy step order'))
  await shot(page, 'connection.png')
  await page.mouse.click(point.x, point.y)
  assert.ok((await page.locator('.selection-detail').textContent()).includes('From this step'))
  await page.getByRole('button', { name: `Step: ${data.workflows[0].steps[0].name}`, exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.selection-detail h3').textContent(), data.workflows[0].steps[0].name)
  await page.mouse.move(10, 10)
  await shot(page, 'node-detail.png')
  const idCheck = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id)
    const refs = [...document.querySelectorAll('svg [marker-end]')].map(el => el.getAttribute('marker-end').match(/#([^)]*)/)[1])
    return { unique: ids.length === new Set(ids).size, resolved: refs.every(id => document.getElementById(id)) }
  })
  assert.ok(idCheck.unique && idCheck.resolved, 'SVG ids and marker references are unique and resolved')
  await page.locator('.step-index button').last().focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.getByRole('button', { name: 'Close workflow', exact: true }).evaluate(el => document.activeElement === el), true)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.locator('.step-index button').last().evaluate(el => document.activeElement === el), true)
  await page.getByRole('button', { name: 'Close workflow', exact: true }).click()
  await page.locator('.gallery-item').first().click()
  await page.mouse.click(6, 6)
  assert.equal(await page.locator('dialog[open]').count(), 0)
  checks.push('Node Enter selection, line hover/click, migrated evidence, button/wheel zoom, pointer pan/fit, focus containment and namespaced SVG references.')

  await page.getByRole('searchbox', { name: 'Search workflows' }).fill('Pimzino')
  assert.equal(await page.locator('.gallery-item').count(), 2)
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByLabel('Domain', { exact: true }).selectOption('ai-coding')
  assert.equal(await page.locator('.gallery-item').count(), data.workflows.filter(w => w.domain === 'ai-coding').length)
  await page.getByLabel('Tool', { exact: true }).selectOption('github-actions')
  assert.equal(await page.locator('.gallery-item').count(), data.workflows.filter(w => w.domain === 'ai-coding' && w.tools.includes('github-actions')).length)
  await page.getByLabel('Evidence', { exact: true }).selectOption('unknown')
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByRole('searchbox', { name: 'Search workflows' }).fill('no-matching-workflow-fixture')
  assert.equal(await page.locator('.gallery-item').count(), 0)
  await page.getByRole('heading', { name: 'No matching workflows' }).waitFor()
  await page.locator('.empty').getByRole('button', { name: 'Reset filters' }).click()
  assert.equal(await page.locator('.gallery-item').count(), data.count)
  checks.push('Search includes author names; domain/tool/evidence filters combine; empty state and reset work.')
  for (const width of [375, 320, 760, 1024]) {
    await page.setViewportSize({ width, height: 812 })
    await noOverflow(page)
    if (width === 375) await shot(page, 'gallery-mobile.png')
    await page.locator('.gallery-item').first().click()
    await page.getByRole('dialog').waitFor()
    const bounds = await page.getByRole('dialog').boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
    await page.getByRole('button', { name: `Step: ${data.workflows[0].steps[0].name}`, exact: true }).click()
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Fit view', exact: true }).click()
    if (width === 375) {
      await shot(page, 'explorer-mobile.png')
      await page.locator('.selection-detail').scrollIntoViewIfNeeded()
      await shot(page, 'node-mobile.png')
    }
    await page.getByRole('button', { name: 'Close workflow', exact: true }).click()
  }
  checks.push('320/375/760/1024px: no page overflow; overlay fits; node selection, zoom, fit and close remain usable.')
  const touchPage = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  touchPage.on('pageerror', e => errors.push(e.message))
  await touchPage.goto(url, { waitUntil: 'networkidle' })
  await touchPage.locator('.gallery-item').first().tap()
  await touchPage.getByRole('button', { name: `Step: ${data.workflows[0].steps[0].name}`, exact: true }).tap()
  assert.equal(await touchPage.locator('.selection-detail h3').textContent(), data.workflows[0].steps[0].name)
  await touchPage.getByRole('button', { name: 'Fit view', exact: true }).tap()
  const touchEdge = await edgePoint(touchPage.locator('.edge-hit').first())
  await touchPage.touchscreen.tap(touchEdge.x, touchEdge.y)
  assert.ok((await touchPage.locator('.selection-detail').textContent()).includes('From this step'))
  await touchPage.getByRole('button', { name: 'Close workflow', exact: true }).tap()
  checks.push('Touch context: tap tile/node/connection and close; connection details remain pinned without hover.')

  // Exercise actual React components with synthetic V2 inputs, never publish
  // fixtures into workflows/ or add them to the production bundle.
  const cases = [...topologies, longLabels, complex].map(workflow => {
    const views = compileDiagramSet(workflow)
    return { workflow: { ...workflow, diagram_views: views.map(({ svg, ...v }) => ({ ...v, file: 'fixture-only.svg' })) }, rawViews: Object.fromEntries(views.map(v => [v.id, v.svg])) }
  })
  cases.push({ workflow: { ...cases[0].workflow, id: 'invalid-svg' }, rawViews: { full: '<svg' } })
  fixtureServer = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [{
    name: 'synthetic-gallery-data',
    configureServer(testServer) {
      testServer.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('/__gallery_cases.json')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(cases)) }
        else next()
      })
    },
  }] })
  await fixtureServer.listen()
  const fixtureUrl = fixtureServer.resolvedUrls.local[0]
  const fixturePage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  fixturePage.on('pageerror', e => errors.push(e.message))
  await fixturePage.goto(`${fixtureUrl}tests/ui/index.html`, { waitUntil: 'networkidle' })
  await fixturePage.getByRole('heading', { name: 'Synthetic fixtures, not published cases' }).waitFor({ timeout: 5000 }).catch(async () => {
    await shot(fixturePage, 'fixture-load-failure.png')
    throw new Error(`Fixture page failed: ${JSON.stringify({ errors, url: fixturePage.url(), body: await fixturePage.locator('body').innerText() })}`)
  })
  for (const { workflow: w } of cases.filter(c => c.workflow.id !== 'invalid-svg')) {
    await fixturePage.getByRole('button', { name: w.id, exact: true }).click()
    await fixturePage.getByRole('dialog').waitFor()
    if (w.id === complex.id) {
      await fixturePage.getByRole('button', { name: 'Open view: detail-1', exact: true }).click()
      assert.equal(await fixturePage.getByRole('button', { name: 'Detail 1', exact: true }).getAttribute('aria-pressed'), 'true')
      await fixturePage.locator('.step-index button').last().click()
      assert.equal(await fixturePage.locator('.selection-detail h3').textContent(), w.steps.at(-1).name)
      assert.ok(await fixturePage.locator('.interactive-diagram [data-node-id]').filter({ hasText: w.steps.at(-1).name }).count())
      const focusedBox = await fixturePage.locator('.interactive-diagram [data-node-id].selected [data-node-box]').boundingBox()
      const visibleBox = await fixturePage.locator('.interactive-diagram').boundingBox()
      assert.ok(focusedBox.width >= 120, 'Selected complex node becomes readable')
      assert.ok(focusedBox.x >= visibleBox.x && focusedBox.x + focusedBox.width <= visibleBox.x + visibleBox.width, 'Selected node is centered inside canvas')
      await shot(fixturePage, 'synthetic-split.png')
    } else {
      assert.equal(await fixturePage.locator('.interactive-diagram [data-node-id]').count(), w.steps.length)
      for (const e of w.edges) {
        const el = fixturePage.locator(`.edge-hit[data-edge-id="${e.id}"]`)
        await el.focus()
        await fixturePage.getByRole('tooltip').waitFor()
        if (e.condition) assert.ok((await fixturePage.getByRole('tooltip').textContent()).includes(e.condition))
        await fixturePage.keyboard.press('Enter')
        assert.ok(await fixturePage.locator('.selection-detail h3').count())
      }
      await fixturePage.getByRole('button', { name: `Step: ${w.steps[0].name}`, exact: true }).click()
      if (w.id === longLabels.id) await shot(fixturePage, 'synthetic-long-labels.png')
      if (w.id === 'parallel-join') await shot(fixturePage, 'synthetic-parallel.png')
    }
    await fixturePage.keyboard.press('Escape')
  }
  await fixturePage.getByRole('button', { name: 'invalid-svg', exact: true }).click()
  assert.equal(await fixturePage.getByRole('alert').textContent(), 'Invalid generated SVG')
  checks.push('Synthetic five topologies: all edge details keyboard accessible; conditions shown; Chinese/English labels; overview opens detail; step index switches to matching view; invalid SVG shows an explicit error.')
  await fixturePage.goto(fixtureUrl, { waitUntil: 'networkidle' })
  const devTile = fixturePage.locator('.gallery-item').first()
  await devTile.click()
  await fixturePage.getByRole('dialog').waitFor()
  await fixturePage.keyboard.press('Escape')
  assert.equal(await devTile.evaluate(el => document.activeElement === el), true)
  checks.push('Development React StrictMode: dialog opens and closes with focus returned to gallery.')
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, opened, synthetic: cases.map(c => c.workflow.id), errors, browser: browser.version(), node: process.version, screenshots, visual_review: 'Screenshots generated; see implementation-status.md for Agent image inspection. User acceptance pending.' }, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, opened: opened.length, checks: checks.length, screenshots: screenshots.length, errors }))
} finally {
  if (browser) await browser.close()
  if (fixtureServer) await fixtureServer.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
