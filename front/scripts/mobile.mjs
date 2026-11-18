// Mobile checks against `vite preview` (port 4317), with touch emulation.
import { chromium, devices } from 'playwright-core'

const base = process.env.BASE_URL ?? 'http://localhost:4317/'
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' })
const context = await browser.newContext({ ...devices['Pixel 7'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (err) => errors.push(err.message))
const check = (name, ok, detail = '') => console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`)

// Masechtot: one tap on a row opens the masechet.
await page.goto(`${base}#/masechtot`)
await page.waitForTimeout(1200)
await page.getByRole('link', { name: /Nazir/ }).first().tap()
await page.waitForTimeout(800)
check('tap on Nazir row opens it', page.url().includes('#/masechet/nazir'), page.url())

// Masechet: a tap on the heatmap selects an amud without scrolling to the top.
await page.goto(`${base}#/masechet/pesachim?amud=100a`)
await page.waitForTimeout(1500)
const heatmap = page.locator('.page-heatmap')
await heatmap.scrollIntoViewIfNeeded()
const before = await page.evaluate(() => window.scrollY)
const box = await heatmap.boundingBox()
await page.touchscreen.tap(box.x + box.width * 0.5, box.y + 60)
await page.waitForTimeout(800)
const after = await page.evaluate(() => window.scrollY)
check('heatmap tap keeps scroll', Math.abs(after - before) < 40, `${before} -> ${after}`)
check('heatmap tap changes amud', !page.url().includes('amud=100a'), page.url())
const tooltip = await page.evaluate(() =>
  [...document.body.children].some((e) => e.style?.position === 'absolute' && e.style.display !== 'none' && e.innerText && getComputedStyle(e).opacity !== '0'),
)
check('heatmap tap shows a tooltip', tooltip)

// Pesachim: Rashi and Rashbam are two texts.
const text = await page.locator('main').innerText()
check('Pesachim lists Rashbam', /Rashbam/.test(text) && !/Rashi \/ Rashbam/.test(text))
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
