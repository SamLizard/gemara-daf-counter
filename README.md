# Gemara Page Measurement Research

This is a feasibility study, not a finished counter. It compares two ways of estimating the area occupied by the Mishnah and Gemara, Rashi, and Tosafot on selected Vilna-style amudim. Mishnah is included with the main text.

## Try the Visual Review

Run `npm install` once. The existing `npm run review` command automatically downloads three sample pages, so use it only after confirming that access is permitted. Open the resulting `results/review.html` in a browser. The report works offline, contains third-party page images, and is ignored by Git.

Choose a page and check the texts you want to count. The colored lines show what was detected, and the dashed rectangle is the reference area used as 100%. The large number is the sum of the displayed estimates for the selected texts. For example, 25% means roughly one quarter of that rectangle, not one quarter of the entire sheet.

This is a way to inspect the experiment, not a finished counter: some headings and the decorative opening word are missing, and the results have not been validated across other pages or tractates.

For locally obtained single-page PDFs, the separate geometry inspector does not download anything:

```sh
npm run inspect:pdf -- /path/to/first.pdf /path/to/second.pdf
```

Open `results/inspect-pdf.html`. Select font sizes to inspect approximate extracted boxes, or drag regions labeled Mishnah/Gemara, Rashi, Tosafot, or other/uncertain. Export the annotations as JSON and import them into a report generated from the same PDF files in the same order. The import checks filenames and SHA-256 fingerprints. Export before closing the report; annotations are not automatically saved. Drawn rectangles may include whitespace and overlap, and are not measurements or verified ground truth. Image-only text and some ornaments will not appear in the font-size overlays.

Run `npm run test:inspector` to exercise the annotation workflow in Chrome at desktop and mobile widths. Set `CHROME_PATH` if Chrome is installed elsewhere.

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
npm run experiment:pdf -- /path/to/berakhot-2a.pdf a
npm run experiment:pdf -- /path/to/berakhot-2b.pdf b
npm run experiment:pdf -- /path/to/berakhot-3a.pdf a
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

## Historical Layout Checks

For layout research, eight amudim were drawn without replacement from the two tractates using a 32-bit LCG, seed `20260304`, multiplier `1664525`, increment `1013904223`, and four draws per tractate in the order shown. Candidates were inspected as individual images in the Internet Archive uploader's 1883 and 1887 Vilna scans. The 2a and 4b Rosh Hashanah text and the Horayot 3a header anchor the leaf mapping; other references use the observed leaf order, with printed folio or page numbering where visible. These are bitmap scans, not the native-text PDFs used by the detector; they cannot validate the detector or establish that a different edition has the same layout.

| Tractate | Sampled amudim and archive image leaves | Observations |
| --- | --- | --- |
| Rosh Hashanah | 7b (0021), 6b (0019), 21a (0048), 18b (0043) | Side text can extend above and below the central text. On 18b the main text expands into space on only one side. The outer margin can contain separately headed Rabbeinu Chananel. |
| Horayot | 6b (0235), 3a (0228), 10a (0242), 3b (0229) | Main text can widen below both side columns. On 3a and 3b a separately headed Tosafot section sits below the main text, while the margin has Tosafot HaRosh. On 6b a chapter ending and a new Mishnah share the page. |

The images are in [Rosh Hashanah's volume](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V05_Rosh-Hashanah_Yoma_Shekalim_Sukkah_1887_images/page/n10/mode/1up) and [Horayot's volume](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V16_Avodah-Zarah_Horayot_%27Eduyyot_Makkot_Avot_Masekhtot-Ketanot_1883_images/page/n228/mode/1up); replace the `n` number in the viewer URL with a leaf number above. The opening Rosh Hashanah 2a has commentary continuing below the main text. Its final 35a is followed by [leaf 0077](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V05_Rosh-Hashanah_Yoma_Shekalim_Sukkah_1887_images/page/n77/mode/1up), a completion-prayer and Tosafot-summary page with no Gemara or Mishnah. It is an extra physical page, not evidence of an empty amud within the counted 2a-35a range. A page with Mishnah but no Gemara must still count as main text.

Horayot's opening page includes introductory material, which should not automatically be counted as Tosafot. According to the [Hebrew Wikipedia overview](https://he.wikipedia.org/wiki/%D7%9E%D7%A1%D7%9B%D7%AA_%D7%94%D7%95%D7%A8%D7%99%D7%95%D7%AA), the Vilna edition places Tosafot below the main text and prints it only through daf 8; Tosafot HaRosh is a separate work in the outer margin. [Sefaria's Vilna Tosafot text](https://www.sefaria.org/api/texts/Tosafot_on_Horayot.8b.1-30?context=0&commentary=0) ends at 8b. Pages without standard Tosafot should contribute zero for that selection, not be treated as failures.

The local Horayot 10a PDF provides an example of Rashi on both sides of the main text: readable bold phrases from the medium-size columns on both sides match [Rashi's text](https://www.sefaria.org/api/texts/Rashi_on_Horayot.10a.1-100?context=0&commentary=0). Grouping the main 12.24-size text gives 52 baselines; grouping the 9.84-size text separately on each side gives 42 lines per side. Summed line extents multiplied by their respective median baseline pitches estimate about 21.2% and 12.2% of the full PDF page for those groups. These are exploratory partial estimates, not validated complete Gemara and Rashi areas: differently sized fragments are omitted, and the full PDF page includes substantial margins. A different reference rectangle gives different percentages.

These observations disprove an unconditional three-column or fixed-side classifier. They do not establish which work occupies every region, validate the PDF detector, or verify an example where Tosafot occupies both sides of the main text. Those edge cases and a labeled sample remain necessary before aggregation. Separate segmentation from identification; treat font and position as evidence, not proof, and allow uncertain regions to be reviewed. Define one stable reference area and measure non-overlapping line regions before calculating equivalent sides or dafim.

The archive uploader marks the historical scans as public domain and attributes them to Duke; those statements and scan reuse rights have not been independently verified. Internet Archive access is subject to its [terms](https://archive.org/about/terms.php). The repository does not include these images.

## Browser and Cost Considerations

The word-count calculation can run locally in a browser using the two archive files, or once in a build step with only precomputed numbers sent to the browser. The latter avoids per-user text downloads and parsing, but source rights for the resulting dataset must still be checked. No AI or paid text API is needed by these experiments. Hosting, bandwidth, manual review, maintenance and any permissions may still cost money; no provider pricing or browser performance benchmark has been established.

The Shas.org PDF GET response checked here did not allow cross-origin browser fetching. A PDF-based live calculation would otherwise require one PDF per amud: 92 requests for these two tractates. The two JSON exports have `Access-Control-Allow-Origin: *` in the checked GitHub response, but availability, rate limits and licenses still matter. The PDF API documents non-commercial redistribution with attribution and the full license text; the linked historical HebrewBooks site terms also restrict automated downloading. Whether those site restrictions apply to use of the separate Shas.org API is unclear, so obtain permission before bulk downloading. Do not assume either the PDFs or derived measurements can be redistributed commercially.

## Other Research

[Historical Document Analysis](https://github.com/AIStream-Peelout/historical-document-analysis/blob/master/docs/talmud_ocr_segmentation.md) describes a Talmud-specific OCR and language-model pipeline that separates section *text*, not measured page areas. It reports extraction errors and uses ground-truth lengths for some quality checks; its documented setup can require cloud services and credentials. It was not run here.

[Eynollah](https://github.com/qurator-spk/eynollah) provides generic page and line segmentation but does not claim to label Gemara, Rashi, and Tosafot. Its documented supported configuration is Linux, so it was not tested on this macOS machine.

## Data Licenses

The Sefaria main-text version used here is CC BY-SA; linked commentary reports its own version and license in the experiment output. The Shas.org PDFs are supplied by HebrewBooks and Moznaim for free non-commercial redistribution, subject to attribution and inclusion of the full license terms. See the [API documentation](https://www.shas.org/daf-pdf/api/api-documentation.html) before redistributing them. The PDFs are not included in this repository. Check the renderer's bundled font licenses before redistribution.