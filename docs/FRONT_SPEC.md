# Frontend specification (draft 3, for review)

Status: **draft for review**. Nothing is implemented. Remaining open questions are in §11.

## 1. Purpose

Printed page counts do not tell how long a masechet really is. Nazir has 65 printed dafim and Megillah 30.5, yet both have about 12 dafim of Gemara. The site shows the **real length** of each masechet: how many full pages each text of the middle of the Vilna page (Gemara + Mishnah, Rashi, Tosafot, and Ran or Rashbam where they replace them) would fill if printed alone. A learner can then compare masechtot by what they actually want to learn.

Not in scope: study planner, reading speed, time estimates, the side commentaries (Rabbeinu Chananel, Masoret HaShas, Ein Mishpat…).

## 2. What the data contains

`data/shas-metrics.json` (5.7 MB): for each of the 5,406 printed sides (2,703 dafim) of 40 sections, the fraction of the page's text body taken by the main text (Mishnah + Gemara), Rashi and Tosafot, plus per-tractate totals.

**Unit: "full dafim"** (FR « dafim pleins », HE «דפים מלאים»). One full daf = two complete text bodies of one text. Example: Berachos has 62.5 printed dafim; its Gemara alone would fill 28.5 full dafim. The About page explains the unit; a tooltip on the unit links to it.

Whole Shas (current data):

| Text | Full dafim | Share of the text body |
|---|---|---|
| Gemara + Mishnah | 757 | 28 % |
| Rashi | 623 | 23 % |
| Tosafot | 636 | 24 % |

Comparisons the site makes visible (printed dafim → Gemara in full dafim):

| Masechet | Printed | Gemara |
|---|---|---|
| Nazir | 65 | 11.4 |
| Megillah | 30.5 | 12.2 |
| Nedarim | 90 | 14.4 |
| Beitzah | 39 | 11.3 |
| Taanis | 29.5 | 11.3 |
| Berachos | 62.5 | 28.5 |
| Shabbos | 156 | 47.3 |

Other facts: Nazir's Tosafot (24.5) is twice its Gemara; Berachos 58a is 72 % Gemara; Nazir 33b is 92 % Tosafot.

## 3. Texts per masechet

Each masechet shows the texts printed in the middle of its pages. Each text has one state, decided by the export script (§5):

| State | Display |
|---|---|
| `measured` | values and charts |
| `not-measured` | name + "Not calculated for the moment" in place of the value; not in charts |
| `absent` | not displayed at all (never "Rashi: 0 %") |

A 0 on one amud of a measured text shows "none on this amud", not "0 %". A text whose total over the whole masechet is 0 is `absent`.

### 3.1 Cases

| Masechet | Texts |
|---|---|
| 35 regular masechtot | Gemara, Rashi, Tosafot: `measured` |
| Nedarim | Gemara, Rashi, **Ran**: `measured` (Ran measured on all 180 sides, ~31.5 full dafim). Tosafot: `not-measured` (deliberately excluded by the pipeline, stored as 0) |
| Pesachim | Gemara, Rashi, **Rashbam**, Tosafot: `measured` (see §3.2) |
| Bava Basra | Gemara, Rashi, **Rashbam**, Tosafot: `measured` (see §3.2) |
| Shekalim, Kinnim, Tamid, Middos | Gemara/Mishnah: `measured`. One line "Commentaries: not calculated for the moment". Rashi and Tosafot are not displayed (Shekalim: confirmed absent; the other three: excluded by the pipeline) |

### 3.2 Rashi and Rashbam

The two masechtot differ:

- **Bava Basra**: Rashi on 2a–29a, then Rashbam from 29a to the end (29a has both).
- **Pesachim**: Rashi and Rashbam are both printed on 99b–121b (all 45 sides have both).

Rashbam is its own text (`rashbam`, its own color), measured like Ran (`otherCommentary.fraction`). It is not merged with Rashi: on Pesachim 99b–121b both are printed, and merging would hide which one fills the page. The learner toggles each separately.

## 4. Metrics

Values are summed only when every value is numeric (`null` = not calculated, never 0).

| Level | Metrics |
|---|---|
| Shas | full dafim per text; printed dafim; share of the text body per text |
| Seder | same, summed over its masechtot; number of masechtot |
| Masechet | printed dafim; full dafim per text; share of the body; each commentary ÷ Gemara; rank by real length of the selected texts; densest and lightest amud per text |
| Amud | share of the body per text; the rest (headings, spacing, unmeasured texts) in a neutral color |

Units, in the preferences: full dafim (default), full amudim, % of the text body.

Caveats:

- Each masechet has its own fitted text frame, so comparisons between masechtot are approximate. Kinnim uses one frame per side.
- Frames, the Shekalim offsets and Kinnim's per-side frames only matter for drawing on PDFs; the front does not do that, so the export drops them.
- Every value is an automatic estimate, not verified. The About page says so.

## 5. Condensed JSON

`src/export-front.mjs` (`npm run export:front`) reads `data/shas-metrics.json` and writes `front/public/shas-front.json` (about 150 KB, 48 KB gzip). It applies §3, so the front has no per-masechet special cases.

```jsonc
{
  "generatedFrom": { "schemaVersion": 1, "classifierVersion": 2 },
  "attribution": { "pdf": "...", "sources": ["..."] },
  "orders": ["Zeraim", "Moed", "Nashim", "Nezikin", "Kodashim", "Tahorot"],
  "tractates": [
    {
      "id": "pesachim",
      "order": "Moed",
      "firstAmud": "2a",
      "lastAmud": "121b",
      "printedSides": 240,
      "texts": [
        { "id": "main", "state": "measured", "total": 33.21 },
        { "id": "rashi", "state": "measured", "total": 30.37 },
        { "id": "rashbam", "state": "measured", "total": 5.28 },
        { "id": "tosafot", "state": "measured", "total": 23.38 }
      ],
      "otherCommentaries": "none",            // or "not-measured" (Shekalim, Kinnim, Tamid, Middos)
      "columns": ["main", "rashi", "rashbam", "tosafot"],
      "pages": [["2a", 0.2104, 0.1767, 0, 0.3063], ["99b", 0.1298, 0.074, 0.144, 0.4229]]
    }
  ]
}
```

- `total` is in full dafim; `pages` rows follow `columns`; fractions rounded to 4 decimals; `null` = not calculated.
- Masechet and text names (English, French, Hebrew) are in the front's i18n files, keyed by id. No titles in the JSON.

## 6. Pages

Vue 3 + Vuetify 4, folder `front/`, hash router.

### 6.1 Home (`/`)

1. **Daf Yomi card**: today's daf (both amudim) with stacked bars and values; previous/next day; link to the amud in its masechet page; the current masechet's real length and the cycle's progress in it ("Gemara: 12.3 of 28.5 full dafim").
2. Headline figures for the whole Shas: full dafim per text, printed dafim.
3. One stacked bar for the whole Shas.
4. "Did you know" cards built from the data (§2 comparisons), each linking to its masechet.

### 6.2 Masechtot (`/masechtot`)

- One horizontal stacked bar per masechet, grouped by seder, for the enabled texts, next to a thin bar of its printed length.
- Sort: Shas order, real length, printed length, commentary ÷ Gemara.
- Toggle: absolute / 100 %.
- Layout: a list, one row per masechet (name, real length, printed length, stacked bar on a common scale, thin printed-length line); the whole row is a link to the masechet. The texts can be toggled directly on the page (same preference as the drawer).
- Search, and "similar real length": pick a masechet, list the masechtot within ±15 %.

### 6.3 Masechet (`/masechet/:id`, query `amud`)

- Header: printed dafim, real length per text, text list with states (§3).
- Page strip: one stacked column per amud (up to 350, zoom/scroll); tooltip with values; click selects the amud.
- Heatmap: grid of amudim colored by the density of one text.
- Amud detail: values per text and a link to the page on the viewer chosen in the preferences.

### 6.4 About (`/about`)

The unit and the method in plain words, the warning from the JSON, sources and attribution (required by the Shas.org API terms).

### 6.5 Preferences (drawer)

Theme, unit, enabled texts (default: Gemara + Rashi; each text toggled separately), page viewer (Sefaria, HebrewBooks, Shas.org PDF). Stored in localStorage. Language is in the app bar (§7).

## 7. Languages and RTL

- English (default), French, Hebrew. `vue-i18n` with locale files `src/i18n/locales/{en,fr,he}.json`, plus Vuetify's own locale messages through the vue-i18n adapter.
- **Language selector** adapted from [vue3-ts `LanguageSelection.vue`](https://github.com/SamLizard/vue3-ts/blob/dev/src/components/LanguageSelection.vue) (dev branch): `v-select` of the other locales with flags from `public/flags/{en,fr,he}.svg`, label from the `language` message of each locale. Changes needed for this project:
  - Vuetify 4 and the standards: `<template>` first, no `mr-`/`ml-` classes chosen by hand (use `me-`/`ms-`, which follow the direction), Vuetify's `locale.rtl: { he: true }` as in the original `plugins/vuetify.ts`.
  - No `lodash` (the original merges Vuetify messages with `defaults`; a spread does the same).
  - The chosen language is saved in localStorage and sets `<html lang dir>`.
- RTL: in Hebrew the whole layout mirrors (Vuetify does it with `locale.rtl`). Charts: the amud axis runs right-to-left in Hebrew, like a Gemara; legends and tooltips follow the locale. Numbers stay in Western digits.
- Hebrew names of masechtot and texts are shown in Hebrew in all three languages (e.g. "Bava Basra · בבא בתרא" in English); in Hebrew only the Hebrew name.

## 8. Libraries

| Need | Library | Licence |
|---|---|---|
| i18n | `vue-i18n` (+ `@intlify/unplugin-vue-i18n` for the Vite build) | MIT |
| Charts | `echarts` + `vue-echarts`, modules imported per chart type (bar, heatmap) | Apache-2.0 / MIT |
| Daf Yomi | `@hebcal/learning` (+ `@hebcal/core`) | GPL-2.0 |

**Licence note:** `@hebcal/learning` is GPL-2.0. Bundling it in a published site means the site's code must be published under a GPL-compatible licence. Fine if the repository is open source; otherwise replace it with our own util later.

## 9. Responsive

Every page works from 360 px wide: cards stack, long charts zoom or scroll inside their card, the preferences drawer is `temporary` under `md`.

## 10. TODO (later)

- Publish as a static site on GitHub Pages (only the condensed JSON; no PDFs or source texts).
- Pipeline: measure Nedarim Tosafot, and the commentaries of Shekalim, Kinnim, Tamid and Middos. The front then shows them with no code change.

## 11. Open questions

- **[Q1]** Is the repository going to be open source (needed for the GPL Daf Yomi library, §8)?
- ~~**[Q2]** Measure Rashbam and confirm the Pesachim layout (§3.2).~~ Done.
