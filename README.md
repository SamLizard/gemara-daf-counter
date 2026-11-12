# Gemara Page Measurement Research

This is a feasibility study, not a finished counter. It compares two ways of estimating the area occupied by the Mishnah and Gemara, Rashi, and Tosafot on selected Vilna-style amudim. Mishnah is included with the main text.

## Try the Visual Review

Run `npm install` once, then `npm run review`. Open `results/review.html` in a browser. The command needs internet access to download the three sample pages; the generated report then works offline. It contains third-party page images and is ignored by Git.

Choose a page and check the texts you want to count. The colored lines show what was detected, and the dashed rectangle is the reference area used as 100%. The large number is the sum of the displayed estimates for the selected texts. For example, 25% means roughly one quarter of that rectangle, not one quarter of the entire sheet.

This is a way to inspect the experiment, not a finished counter: some headings and the decorative opening word are missing, and the results have not been validated across other pages or tractates.

## Page layout

The main text is normally in the center, Rashi is on the binding side, and Tosafot is on the outside. The side assignments reverse between a and b. Text regions can widen and wrap around each other; marginal references and additional commentary are separate. See [Hadran's layout guide](https://hadran.org.il/terms/the-layout-of-a-talmud-page/) and [daf-renderer's layout explanation](https://github.com/TalmudLab/daf-renderer#how-it-works-better-documenation-on-the-way).

For the three Shas.org Berakhot PDFs tested, main-text baselines have a median pitch of approximately 11.88 PDF units and commentary baselines approximately 10.44. The PDF probe finds 34, 52, and 50 main-text rows respectively; font-size filtering can miss text in other fonts. This is not evidence that every amud has a fixed row count or identical font metrics.

## Experiments

Requirements: Node.js, `npm install`, internet access, and Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Set `CHROME_PATH` to use another compatible browser.

### 1. Sefaria and daf-renderer

```sh
npm run experiment:renderer -- 2a
npm run experiment:renderer -- 2b
npm run experiment:renderer -- 3a
```

This fetches the Wikisource Talmud Bavli version and linked commentary from Sefaria, then uses [daf-renderer](https://github.com/TalmudLab/daf-renderer) to typeset a new page in Chrome. It measures each rendered line's width multiplied by its CSS line height, relative to the synthetic three-text body's bounding rectangle. It does not measure an actual printed page. Links are semantic and can include commentary that is not printed on the same amud; edition, fonts, paragraph formatting, opening ornaments, other marginal works, and widths can differ from the original.

### 2. PDF.js and original printed pages

```sh
curl -fLsS 'https://www.shas.org/daf-pdf/api/?masechta=berachos&daf=2&amud=a' -o /tmp/gemara-berakhot-2a.pdf
curl -fLsS 'https://www.shas.org/daf-pdf/api/?masechta=berachos&daf=2&amud=b' -o /tmp/gemara-berakhot-2b.pdf
curl -fLsS 'https://www.shas.org/daf-pdf/api/?masechta=berachos&daf=3&amud=a' -o /tmp/gemara-berakhot-3a.pdf
npm run experiment:pdf -- /tmp/gemara-berakhot-2a.pdf a
npm run experiment:pdf -- /tmp/gemara-berakhot-2b.pdf b
npm run experiment:pdf -- /tmp/gemara-berakhot-3a.pdf a
```

Mozilla PDF.js extracts positioned text items. On these samples, the probe identifies the main text by its observed font size and identifies the two commentary streams by PDF content order and inner/outer position. It groups items into lines, approximates each line by its leftmost and rightmost extents and median baseline pitch, and divides their area by an estimated rectangle surrounding the three main text streams. It does not count individual ink pixels. The PDFs' underlying character encodings are partly garbled; classification currently uses geometry and content order, not reliable transcription.

Colored overlays were visually inspected on all three pages. They follow the main and commentary regions, including wraps, but omit the opening decorative word and some differently sized commentary headings. They are not a manually annotated ground-truth dataset. Font sizes, PDF order, grouping, and the inferred body bounds are sample-specific and must not be assumed for other pages or editions.

### Initial Results

Percentages below are exploratory line-box areas relative to each method's own estimated three-text body, **not** to the full physical sheet. The denominators and layouts differ, so matching numbers are not an accuracy validation.

| Berakhot | Renderer: main / Rashi / Tosafot | PDF probe: main / Rashi / Tosafot |
| --- | --- | --- |
| 2a | 27.5% / 23.0% / 40.7% | 26.2% / 21.8% / 37.6% |
| 2b | 39.7% / 25.9% / 26.2% | 39.3% / 25.5% / 22.9% |
| 3a | 40.8% / 24.7% / 26.1% | 42.3% / 21.1% / 25.8% |

The renderer produces 28, 44, and 49 main-text lines compared with the PDF probe's 34, 52, and 50. Its reconstruction is therefore unsuitable as an unvalidated measurement of the actual printed layout. The direct PDF approach is promising but still needs annotations, recognition of omitted fonts and exceptions, a fixed definition of the full-page denominator, and validation across more tractates before producing reliable totals.

One amud is one printed side; one daf comprises two sides. Once a denominator is defined, sum amud fractions to obtain equivalent printed sides, then divide by two to obtain equivalent two-sided dafim.

## Other Research

[Historical Document Analysis](https://github.com/AIStream-Peelout/historical-document-analysis/blob/master/docs/talmud_ocr_segmentation.md) describes a Talmud-specific OCR and language-model pipeline that separates section *text*, not measured page areas. It reports extraction errors and uses ground-truth lengths for some quality checks; its documented setup can require cloud services and credentials. It was not run here.

[Eynollah](https://github.com/qurator-spk/eynollah) provides generic page and line segmentation but does not claim to label Gemara, Rashi, and Tosafot. Its documented supported configuration is Linux, so it was not tested on this macOS machine.

## Data Licenses

The Sefaria main-text version used here is CC BY-SA; linked commentary reports its own version and license in the experiment output. The Shas.org PDFs are supplied by HebrewBooks and Moznaim for free non-commercial redistribution, subject to attribution and inclusion of the full license terms. See the [API documentation](https://www.shas.org/daf-pdf/api/api-documentation.html) before redistributing them. The PDFs are not included in this repository. Check the renderer's bundled font licenses before redistribution.