# Gemara Daf Counter

**Website: <https://samlizard.github.io/gemara-daf-counter/>** (English, French, Hebrew): the real length of each masechet, amud by amud.

Measures how much of each printed page of the Vilna Shas is occupied by the main text (Mishnah and Gemara), Rashi and Tosfos, for all 40 sections of the Babylonian Talmud (5,406 printed sides).

The result is [data/shas-metrics.json](data/shas-metrics.json): for every side, the fraction of the page's text body taken by each category, plus per-tractate totals in sides and in equivalent dafim.

## How it works

For each side, the original printed page is downloaded as a PDF from the [Shas.org daf PDF API](https://www.shas.org/daf-pdf/api/). The text lines are read with PDF.js and attributed to a category by matching their glyphs against reference texts:

- main text and Rashi from the [Sefaria export archive](https://github.com/Sefaria/Sefaria-Export-Archive/tree/3f1013631fdfe452e953a93a2c5f921319e394ed) (pinned commit);
- Tosfos (and some Rashi) from [Hebrew Wikisource](https://he.wikisource.org/) page transcriptions.

The area of each line box is divided by the tractate's fitted text-body rectangle. These are automatic estimates of line-box area, not ink area, and they are not hand-verified. See [docs/methodology.md](docs/methodology.md) for the methodology, the JSON contract, known limitations and the per-tractate special cases.

## Reproduce the data

Requirements: a recent Node.js (developed and tested with Node 25) and an internet connection.

```sh
npm ci
npm run build
npm run compare
```

`npm run build` downloads about 5,400 PDFs and the Wikisource pages, measures every side and writes `results/shas-metrics.json`. This takes several hours. Downloads are cached in `results/` (Git-ignored); if the build is interrupted or stopped by a server error, run it again and it resumes where it stopped.

`npm run compare` prints, per tractate, the difference between your result and the published `data/shas-metrics.json`. Wikisource pages can be edited and PDFs can be replaced over time, so a fresh build is expected to be close to, but not necessarily identical with, the published data.

## Project layout

- `src/` – the measurement pipeline (`build.mjs` is the entry point) and its tests.
- `research/` – earlier experiments and visual review tools, kept for reference.
- `data/` – the published result.
- `docs/` – methodology and development notes.
- `front/` – the website (Vue 3 + Vuetify 4). See [docs/FRONT_SPEC.md](docs/FRONT_SPEC.md) and [STANDARDS.md](STANDARDS.md).

## Website

The site reads only a condensed copy of the data, `front/public/shas-front.json`.

```sh
npm run export:front        # regenerate front/public/shas-front.json from data/shas-metrics.json
cd front && npm ci
npm run dev                 # local development server
npm run deploy              # type check, build and publish front/dist to the gh-pages branch
```

Other commands: `npm test` runs the tests; `npm run review:problems` starts a local page viewer that draws the measured boxes over each PDF.

## Sources and rights

No PDFs or source texts are included in this repository; the build downloads them. PDFs: Shas.org, HebrewBooks.org and Moznaim (הוצאת ח. וגשל); the Shas.org API documents non-commercial use with attribution. Texts: Sefaria and Hebrew Wikisource contributors, under their respective licenses. Please respect the sources' terms and avoid unnecessary repeated bulk downloads.
