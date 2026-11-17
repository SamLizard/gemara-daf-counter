// Browser smoke test against `vite preview` (port 4317): console errors, raw i18n keys, overflow at 360 px.
import { chromium } from 'playwright-core'

const base = 'http://localhost:4317/'
const routes = ['#/', '#/masechtot', '#/masechet/berachos?amud=58a', '#/masechet/nedarim', '#/masechet/pesachim?amud=100a', '#/masechet/shekalim', '#/masechet/kinim', '#/masechet/nope', '#/about']
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' })
let failures = 0
for (const locale of ['en', 'fr', 'he']) {
  for (const width of [1280, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.text().slice(0, 200)) })
    page.on('pageerror', (err) => errors.push(`pageerror ${err.message}`))
    await page.goto(base)
    await page.evaluate((code) => localStorage.setItem('gemara-daf-counter:preferences', JSON.stringify({ locale: code })), locale)
    await page.reload()
    page.on('response', (res) => { if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`) })
    for (const route of routes) {
      await page.goto(base + route)
      await page.waitForTimeout(900)
      const report = await page.evaluate(() => {
        const text = document.body.innerText
        const raw = [...new Set(text.match(/\b(home|about|masechet|masechtot|app|menu|prefs|unit|value|viewer|text|order|tractate|chart)\.[a-zA-Z.-]+\b/g) || [])]
        return { raw, overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir, length: text.length }
      })
      const problems = [...report.raw.map((k) => `raw key ${k}`), ...(report.overflow > 1 ? [`overflow ${report.overflow}px`] : []), ...errors.splice(0)]
      if (locale === 'he' && report.dir !== 'rtl') problems.push('dir not rtl')
      if (problems.length) { failures++; console.log(`[${locale} ${width}] ${route}\n  ${problems.join('\n  ')}`) }
      if (width === 1280 && locale !== 'fr') await page.screenshot({ path: `${process.env.SHOTS ?? 'scripts/shots'}/${locale}-${route.replace(/[^\w]+/g, '_')}.png`, fullPage: true })
    }
    await page.close()
  }
}
await browser.close()
console.log(failures ? `${failures} page(s) with problems` : 'smoke OK')
