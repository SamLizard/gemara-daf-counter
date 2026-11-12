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

### Whole-Tractate Text Comparison

```sh
npm run experiment:compare-text
```

This separate experiment follows the archive-based approach in [Daf](https://github.com/adblumenthal/Daf): it downloads one pinned Sefaria export per tractate, checks that the amudim are contiguous, and counts Hebrew letter sequences after removing vocalization and supported markup. Punctuation separates sequences, so these are approximate word counts, not a linguistic analysis. Mishnah in the Bavli text is included; neither Rashi nor Tosafot is included.

| Tractate | Amudim covered | Approximate words | Hebrew letters |
| --- | ---: | ---: | ---: |
| Horayot, 2a-14a | 25 | 12,924 | 50,492 |
| Rosh Hashanah, 2a-35a | 67 | 23,791 | 95,366 |

Rosh Hashanah has about 1.84 times as many counted words and 1.89 times as many letters as Horayot. **This is text volume, not printed-page area**, and cannot be converted into printed daf equivalents without validated page geometry. The original source includes editorial markers and may differ from the printed edition. The two downloaded JSON files contain 611,997 bytes in total, before any HTTP compression. The program does not save or redistribute the text.

The archive's merged files list the William Davidson vocalized text; Sefaria identifies that version as CC BY-NC. The [Daf archive helper](https://github.com/adblumenthal/Daf/blob/main/scripts/archive_source.py) caches each complete tractate and selects requested references, which is useful for text retrieval but provides no printed coordinates. Its merged files do not themselves settle licensing or select a specific version for commercial reuse. The Wikisource Talmud Bavli version is identified as CC BY-SA by Sefaria and is a possible alternative to investigate.

The direct PDF probe failed on Horayot 2a and 10a because their type sizes differ from the three Berakhot samples. It ran on Rosh Hashanah 2a and 10a, but that is not validation across the tractate. A trustworthy printed-area comparison requires a common reference area, visually annotated checks including opening, ordinary and final pages, and handling of page-specific font and layout changes.

## Browser and Cost Considerations

The word-count calculation can run locally in a browser using the two archive files, or once in a build step with only precomputed numbers sent to the browser. The latter avoids per-user text downloads and parsing, but source rights for the resulting dataset must still be checked. No AI or paid text API is needed by these experiments. Hosting, bandwidth, manual review, maintenance and any permissions may still cost money; no provider pricing or browser performance benchmark has been established.

The Shas.org PDF GET response checked here did not allow cross-origin browser fetching. A PDF-based live calculation would otherwise require one PDF per amud: 92 requests for these two tractates. The two JSON exports have `Access-Control-Allow-Origin: *` in the checked GitHub response, but availability, rate limits and licenses still matter. The PDF API documents non-commercial redistribution with attribution and the full license text; the linked historical HebrewBooks site terms also restrict automated downloading. Whether those site restrictions apply to use of the separate Shas.org API is unclear, so obtain permission before bulk downloading. Do not assume either the PDFs or derived measurements can be redistributed commercially.

## Other Research

[Historical Document Analysis](https://github.com/AIStream-Peelout/historical-document-analysis/blob/master/docs/talmud_ocr_segmentation.md) describes a Talmud-specific OCR and language-model pipeline that separates section *text*, not measured page areas. It reports extraction errors and uses ground-truth lengths for some quality checks; its documented setup can require cloud services and credentials. It was not run here.

[Eynollah](https://github.com/qurator-spk/eynollah) provides generic page and line segmentation but does not claim to label Gemara, Rashi, and Tosafot. Its documented supported configuration is Linux, so it was not tested on this macOS machine.

## Data Licenses

The Sefaria main-text version used here is CC BY-SA; linked commentary reports its own version and license in the experiment output. The Shas.org PDFs are supplied by HebrewBooks and Moznaim for free non-commercial redistribution, subject to attribution and inclusion of the full license terms. See the [API documentation](https://www.shas.org/daf-pdf/api/api-documentation.html) before redistributing them. The PDFs are not included in this repository. Check the renderer's bundled font licenses before redistribution.