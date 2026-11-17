// Lists static i18n keys used in src/ that are missing from en.json. Dynamic keys (`text.${id}`) are checked by prefix.
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const src = new URL('../src/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
const en = JSON.parse(await readFile(join(src, 'i18n/locales/en.json'), 'utf8'))
const has = (key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), en) !== undefined
const hasPrefix = (prefix) => has(prefix.replace(/\.$/, ''))

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (/\.(vue|ts)$/.test(entry.name)) yield path
  }
}

const missing = new Set()
for await (const file of walk(src)) {
  const code = await readFile(file, 'utf8')
  for (const match of code.matchAll(/(?:\$t|\bt|keypath=)\(?\s*['"`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"`]/g)) {
    if (!has(match[1])) missing.add(`${match[1]}  (${file.slice(src.length)})`)
  }
  for (const match of code.matchAll(/['"`]((?:[a-z][\w-]*\.)+[\w-]*\.?)['"`]/g)) {
    const key = match[1]
    if (/^(home|about|masechet|masechtot|app|menu|prefs|unit|value|viewer|text|order|tractate|chart)\./.test(key) && !key.includes('/') && !has(key) && !(key.endsWith('.') && hasPrefix(key))) {
      missing.add(`${key}  (${file.slice(src.length)})`)
    }
  }
  for (const match of code.matchAll(/`((?:[a-z][\w-]*\.)+)\$\{/g)) {
    if (!hasPrefix(match[1])) missing.add(`${match[1]}*  (${file.slice(src.length)})`)
  }
}
console.log(missing.size ? [...missing].join('\n') : 'all keys found')
