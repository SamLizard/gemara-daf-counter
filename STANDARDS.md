# Frontend standards (for every contributor, human or agent)

Read first `docs/FRONT_SPEC.md` (the specification) and `front/src/types/metrics.ts` (the schema of the condensed JSON).

## Stack

- Vue 3.5, `<script setup lang="ts">`, strict TypeScript (`noUncheckedIndexedAccess` on).
- **Vuetify 4** (not 3). Differences to know:
  - MD3 typography: `text-display-*`, `text-headline-*`, `text-title-*`, `text-body-*`, `text-label-*`. **No** `text-h1`… `text-h6`, `text-subtitle-*`, `text-caption`, `text-overline`.
  - Elevation 0 to 5 only.
  - `VRow`: no `dense`, `align`, `justify` props → utility classes (`align-center`, `justify-space-between`) or `gap`.
  - Buttons are no longer uppercase.
  - `VSelect` slots: `item` = the raw object; `internalItem` = the Vuetify object.
- Agents: check component props and v3→v4 changes with the Vuetify MCP tools (`get_component_api_by_version`, `get_upgrade_rules`) instead of relying on memory.
- Vuetify components are auto-imported (`vite-plugin-vuetify`). Do not import them by hand.
- Icons: `mdi-*` (`@mdi/font`).
- Router: `vue-router` in hash mode.
- i18n: `vue-i18n`, locales `en` (default), `fr`, `he` (RTL).
- Charts: `echarts` + `vue-echarts`, wrapped in small components under `src/components/charts/`, chart options built in `src/utils/charts/`. Never hand-made SVG charts.
- Daf Yomi: `@hebcal/learning`, used only in `src/utils/dafYomi.ts`.

## Rules

1. **Vuetify first.** Use `v-card`, `v-list`, `v-chip`, `v-chip-group`, `v-btn`, `v-btn-toggle`, `v-tooltip`, `v-dialog`, `v-table`, `v-alert`, `v-tabs`, `v-sheet`, `v-navigation-drawer`, `v-expansion-panels`, `v-text-field`, `v-divider`… Raw HTML only for what Vuetify does not do: `<bdi>`, `<span lang="he" dir="rtl">`.
2. **200 lines max per `.vue`** (template + script + style), aim for 150. Above that, split into sub-components in the same folder. One new component = one new file, never added inside an existing big component.
3. **Block order in a `.vue`**: `<template>` first, at the top of the file, then `<script setup lang="ts">`, then `<style scoped>`. Never the `<template>` at the end.
4. **Reusable logic in `.ts`**: `src/utils/` (pure functions: sums, ratios, formatting, Daf Yomi date, chart options), `src/composables/` (reactive state, `useXxx`). No computation in templates beyond simple property access.
5. **Typed props** with `defineProps<{…}>()` and `withDefaults`; events with `defineEmits<{…}>()` (typed syntax). `v-model` via `defineModel<T>()`.
6. Names: components `PascalCase.vue`, composables `useXxx.ts`, utils `camelCase.ts`. One component per file.
7. **No hard-coded UI text: everything goes through vue-i18n.** Messages live in `src/i18n/locales/en.json`, `fr.json` and `he.json`; every key exists in all three (keys grouped by area: `menu.*`, `home.*`, `masechet.*`, `text.*`, `prefs.*`…). To add a language: create `locales/<code>.json` and register it in `src/i18n/index.ts`.
   - In a template: `{{ $t('key') }}`, `:label="$t('key')"`, `:aria-label="$t('key')"`. With parameters: `$t('key', { id })` and `{id}` in the message. Plurals: `{count}` in the message.
   - In `<script setup>`: `const { t } = useI18n()`.
   - Outside components (`utils/`, `composables/`): `import { t } from '@/i18n'`.
   - Data tables (commentaries, sorts, units…) carry a **key** (`labelKey`), not a label; the component calls `$t(labelKey)`.
   - A message containing Hebrew is displayed with `<HebrewText :text="$t('key')" />` (rule 9).
   - Do not translate: technical ids, Hebrew names, icons.
   - One key = one meaning. Never build a sentence by gluing messages: write the whole sentence with its parameters.
8. **Unknown is not zero, absent is not shown.**
   - `null` = not calculated: display `$t('value.notCalculated')`, never 0 %, never added into a total. Sums go through `sumKnown()` (`src/utils/metrics.ts`), which returns `null` if any value is `null`.
   - A text with state `absent` is not displayed at all for that masechet. Never "Rashi: 0 %".
   - A 0 on one amud of a measured text displays `$t('value.noneOnAmud')`.
   - States come from the condensed JSON (`texts[].state`); components never hard-code per-masechet exceptions.
8b. **RTL**: the layout must work in both directions.
   - Use direction-aware utilities: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`. Never `ml-*`, `mr-*`, `pl-*`, `pr-*`, `text-left`, `text-right`, nor `left`/`right` in CSS (use `inset-inline-start`, `margin-inline-end`…).
   - Direction comes from Vuetify (`useRtl()` / `locale.rtl`), never from testing the locale code by hand.
   - Icons that point a direction (chevrons, arrows) use the Vuetify `$prev` / `$next` aliases or are flipped in RTL.
   - Charts: options get `isRtl` and reverse the amud axis and the legend.
   - Numbers stay in Western digits in all locales.
9. **Hebrew**: names of masechtot and texts go through `<HebrewText :text="…" />` (`src/components/common/HebrewText.vue`), which wraps Hebrew runs in `<span lang="he" dir="rtl">`. Never `dir="auto"` on a mixed paragraph. Never replace ״ and ׳ with " and '. Never transliterate when the Hebrew is available.
10. Data access only through `useMetrics()` (`src/composables/useMetrics.ts`). Components receive ids (`tractateId`, `amud`, `textId`), not copies of the data.
11. External links (page viewers, sources) are built only in `src/utils/links.ts`, from the viewer chosen in the preferences. `target="_blank" rel="noopener"`.
12. Colors: one color per text id defined in the theme and read through `textColor(id)`. No hard-coded color outside the theme and `src/utils/`. Colors must stay distinguishable for color-blind users and in both themes.
13. Styles: `<style scoped>`, short. Prefer Vuetify utility classes (`pa-4`, `d-flex`, `ga-2`, `text-medium-emphasis`…).
14. Accessibility: `aria-label` on icon buttons; clickable elements reachable by keyboard (`v-btn`, `v-list-item`, or `tabindex="0"` + `@keydown.enter`). Each chart has an `aria-label` and a text alternative (table or summary sentence).
15. No new npm dependency without agreement. Approved: `vue`, `vuetify`, `vite-plugin-vuetify`, `vue-router`, `vue-i18n`, `@intlify/unplugin-vue-i18n`, `@mdi/font`, `echarts`, `vue-echarts`, `@hebcal/learning`, `@hebcal/core`, `vite`, `vue-tsc`. No `lodash`.
16. Comments: only to explain why.
17. Check before handing in: `npm run typecheck` and `npm run build` in `front/` pass without errors.

## Data pipeline

- The front never loads `data/shas-metrics.json`. `npm run export:front` (root, `src/export-front.mjs`) writes `front/public/shas-front.json`. Regenerate it after every data change.
- The export script applies all per-masechet rules (text states, Rashi / Rashbam, Ran, "other commentaries not calculated"). The front only reads states.
- The condensed format is defined once in `front/src/types/metrics.ts`; the export script and the types change together.

## Base modules (reuse, do not rewrite)

| File | Content |
|---|---|
| `src/types/metrics.ts` | `TextId`, `TextState`, `TextEntry`, `Tractate`, `PageRow`, `MetricsFile` |
| `src/i18n/index.ts` | i18n instance, `t`, registered locales, Vuetify messages merged under `$vuetify` |
| `src/plugins/vuetify.ts` | themes, `locale.rtl: { he: true }`, vue-i18n adapter |
| `src/utils/metrics.ts` | `sumKnown(values)`, `pageValues(tractate, row)`, `tractateTotal(tractate, ids)`, `ratio(a, b)` |
| `src/utils/format.ts` | `formatValue(value, unit)`, `formatAmud(amud)` |
| `src/utils/dafYomi.ts` | `dafYomiFor(date)` → `{ tractateId, daf }` |
| `src/utils/links.ts` | `pageUrl(viewer, tractateId, amud)` |
| `src/composables/useMetrics.ts` | loads the JSON once; `tractates`, `tractate(id)`, `orderTotals`, `shasTotals`, `loading`, `error` |
| `src/composables/usePreferences.ts` | `locale`, `theme`, `unit`, `enabledTexts`, `viewer` (localStorage); sets `<html lang dir>` |

## Components (provisional until the spec is approved)

| Component | File | Props / events |
|---|---|---|
| `HomePage` | `src/pages/HomePage.vue` | Daf Yomi card, headline figures, Shas bar, "did you know" cards |
| `MasechtotPage` | `src/pages/MasechtotPage.vue` | comparison of masechtot |
| `MasechetPage` | `src/pages/MasechetPage.vue` | prop `id: string` |
| `AboutPage` | `src/pages/AboutPage.vue` | method, warning, attribution |
| `AppHeader` | `src/components/layout/AppHeader.vue` | navigation, language selector; emit `open-preferences` |
| `PreferencesDrawer` | `src/components/layout/PreferencesDrawer.vue` | `v-model: boolean` |
| `LanguageSelection` | `src/components/common/LanguageSelection.vue` | adapted from [vue3-ts `LanguageSelection.vue`](https://github.com/SamLizard/vue3-ts/blob/dev/src/components/LanguageSelection.vue); flags in `public/flags/` |
| `HebrewText` | `src/components/common/HebrewText.vue` | props `text`, `tag?` |
| `TextSelector` | `src/components/common/TextSelector.vue` | `v-model: TextId[]` |
| `TextList` | `src/components/masechet/TextList.vue` | prop `tractateId`; states of spec §3 |
| `StatCard` | `src/components/common/StatCard.vue` | props `labelKey`, `value: number \| null` |
| `DafYomiCard` | `src/components/home/DafYomiCard.vue` | optional prop `date` |
| `StackedBar` | `src/components/charts/StackedBar.vue` | props `segments: { id, value }[]` |
| `MasechtotChart` | `src/components/charts/MasechtotChart.vue` | props `sort`, `mode: 'absolute' \| 'percent'` |
| `PageStrip` | `src/components/charts/PageStrip.vue` | prop `tractateId`; emit `select(amud)` |
| `PageHeatmap` | `src/components/charts/PageHeatmap.vue` | props `tractateId`, `textId`; emit `select(amud)` |
| `AmudDetail` | `src/components/masechet/AmudDetail.vue` | props `tractateId`, `amud` |

## Design

- Light "parchment" theme (cream background, navy primary, gold secondary) and dark "night" theme.
- Airy layout: max content width ~1100 px centered, cards `variant="flat"` or `"outlined"`, elevation 0–1.
- Big numbers first: each page opens with its key figures, details below.
- Responsive from 360 px: cards stack, long charts scroll inside their card, drawers `temporary` under `md` (`useDisplay()`).
