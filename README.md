# Gemara Page Measurement Research

This research estimates the printed area occupied by Mishnah and Gemara, Rashi, and Tosafot across Shas. It was initially calibrated on Horayot 2a-14a and Rosh Hashanah 2a-35a. Mishnah is included with the main text. The results are estimates from one PDF edition, not manually verified exact totals.

## Full Shas JSON

The generated [results/shas-metrics.json](results/shas-metrics.json) is a frontend-oriented export for 40 separately named sections. All 5,405 sides have a numeric main-text measurement, including a confirmed zero on Nazir 33b. Thirty-five sections have numeric values for all three categories on every side, while five are partial; 145 sides have at least one unknown category. These counts describe coverage, not verified accuracy. There are 300 Wikisource-only Rashi zeroes and 414 numeric Tosafot zeroes, including 151 whose recorded basis is the Wikisource-only section check, 180 deliberately excluded on Nedarim, and 31 deliberately excluded on Kinnim, Tamid, and Middot. Forty Shekalim sides have user-attested Rashi and Tosafot zeroes.

Shekalim, Kinnim, Tamid, and Middot have main-text-only measurements. Their fitted frames also use unclassified printed text, not identified Rashi or Tosafot; they are provisional. Shekalim is checked against the Jerusalem Talmud, Kinnim and Middot against Mishnah, and Tamid against Bavli Tamid. For these four sections, matches are against the entire work because its reference pagination differs from the PDF; this is weaker than a page-specific match. The source lists the Jerusalem Talmud Shekalim version's license as unknown.

Kinnim and Middot have Mishnah but no Gemara in either Talmud ([Kinnim](https://en.wikipedia.org/wiki/Kinnim), [Middot](https://en.wikipedia.org/wiki/Middot_(Talmud))). The printed Kinnim edition includes Tosafot and a commentary attributed to Rashi, alongside other commentaries ([Vilna commentary list](https://he.wikipedia.org/wiki/%D7%9E%D7%A1%D7%9B%D7%AA_%D7%A7%D7%99%D7%A0%D7%99%D7%9D)). At the user's request, Kinnim, Tamid, and Middot export Rashi and Tosafot as zero with `excludedCategories`; this is an exclusion, not an absence finding. Their other commentaries remain a TODO. The Middot PDF names Rambam and Rabbi Shemaiah, and also prints Rosh; a complete attribution is still needed.

Middot's frame-only glyphs now exclude the right margin (body window x85-520); all eight PDF fingerprints and all main rows were checked. Its shared right edge moved from 585.78 to 515.21 PDF units, increasing the main-text fractions through the smaller denominator. The top edge remains provisional: 34a's title is included, while lowering one fixed edge would clip actual commentary on 37a. Page-relative top placement remains a TODO.

Kinnim begins on the lower portion of the shared Meilah 22a PDF, after Meilah ends. The catalog assigns that side to Meilah and begins Kinnim at 22b; the Kinnim portion of 22a has not been measured. A future correction must split that side by tractate rather than double-count the PDF.

The export and the source cache are local and Git-ignored. Check source and derived-data rights before publishing. PDF and commentary sources and attribution are recorded in the JSON; original PDFs and source texts are not included in the export.

### JSON Contract

- `schemaVersion` and `classifierVersion` identify the export structure and measurement method.
- `tractates[]` gives a stable `id`, title, order, first/last amud, status, coverage, fitted frame, category totals, and one entry per expected printed side. Kinnim, Tamid, and Middot use disjoint ranges of the Meilah volume and are not double-counted.
- `coverage.knownByCategory` counts sides with a numeric value for each category. `measured` means at least main text was measured, not that every category is known.
- `pages[].fractions` is a fraction of that tractate's frame for each of `main`, `rashi`, and `tosafot`. `main` includes Mishnah. `null` means unknown, never zero; `inferredAbsent` is evidence of possible absence but remains unknown. A zero indicates confirmed absence unless the category appears in `excludedCategories`, where it is a deliberate exclusion rather than an absence finding. An unresolved side can have `{ main: null, rashi: null, tosafot: 0 }` if a source indicates absence or the category is excluded even though the PDF was not measured.
- Pages can include `rashiEvidence` or `tosafotEvidence`, with the source, revision when available, decision, basis, and PDF SHA-256 when available. `confirmedAbsent` identifies a recorded zero backed by source evidence or explicit user attestation; some rely only on Wikisource section content and have not been verified against the PDF. An incomplete transcription can produce an incorrect zero. User attestation is distinguished by `sourceType: "user-attestation"`, not represented as a source or visual finding. `lastClassificationError` reports failed reclassifications; a prior main measurement can remain available while commentary is unknown.
- `pages[].method` is `classified` or `main-only`. A main-only recovery includes the original failure reason and match evidence; `referenceScope` distinguishes page-specific from whole-tractate matching.
- `pages[].otherCommentary` records independently measured other commentary where available, including its sources, rows, and frame fraction. It is not included in the three standard fractions or their totals.
- `totals.sides` and `totals.dafim` contain separate category totals. An individual total is `null` if that category is unknown on any side; the entire `totals` object is `null` when a side is unresolved or pending. Add categories only when every selected total is numeric. One equivalent daf is two equivalent printed sides.
- `frame.provisional` means the frame can change as missing text is resolved. `referenceBasis` is `classified-text`, `main-and-unclassified-text`, or `main-text-only`. Shekalim, Kinnim, Tamid, and Middot frames remain provisional when using recovered main text or unclassified commentary, even if all category values become numeric. Different tractates' frames are not a common physical area.
- `frame.coordinateSpace: "shekalim-aligned-v1"` and `frame.sideOffsets: { a: 85.08, b: 0 }` are additive schema-version-1 fields. For a printed `amud`, add `frame.sideOffsets[amud.at(-1)]` to both `frame.left` and `frame.right` before converting PDF coordinates to viewport coordinates; leave `top` and `bottom` unchanged. Frames without `sideOffsets` remain absolute PDF coordinates. The offset comes from the existing Shekalim profile, not a second frontend constant.

Other commentators such as Ran and Rashbam are not renamed Rashi or Tosafot. Ran is measured separately where supported on Nedarim; Rashbam remains unmeasured. Unrecognized type sizes, headings, decorations, and other works can be omitted; some line boxes or frames can be incorrectly fitted. No accuracy margin has been established. A section marked `complete` only means the automatic classifier produced all category values, not that the pages were manually verified.

For example, a frontend can add selected categories only when they are all available:

```js
const book = data.tractates.find((tractate) => tractate.id === "berachos");
const selected = [book.totals?.dafim.main, book.totals?.dafim.rashi];
const total = selected.every((value) => typeof value === "number")
	? selected.reduce((sum, value) => sum + value, 0)
	: null;
```

### Reproduce The Export

The legacy calibrated corpus can be generated with the corpus commands below. Shas runs use independently cached Wikisource page texts under ignored `results/wikisource-cache/`, except for Horayot, which uses the pinned Sefaria archive. Missing Wikisource pages are fetched even when Sefaria data is available. PDFs are fetched up to four at a time and cached under ignored `results/pdf-cache/`; matching PDFs in `results/pdfs/` are also reused. Add `--cached-pdfs-only` to fail on missing PDFs instead of downloading them; this does not disable Wikisource or Sefaria requests. Retries verify saved fingerprints before replacing results. Compact checkpoints are written under ignored `results/shas-work/` for resuming a run. Confirm permission and applicable source terms before bulk downloads. The runner stops on PDF HTTP 403, 429, and server errors and preserves previously recovered measurements as unknown where appropriate.

```sh
npm run measure:shas -- --wikisource
npm run export:shas
npm run test:shas
```

Each new `--wikisource` invocation generates a run ID and reprocesses all selected PDFs, even if a previous checkpoint exists. To resume an interrupted run, pass its printed `--run-id=<id>`; already processed pages are skipped. Add `--refresh-wikisource` to fetch the selected Wikisource pages again instead of using cached copies. Use `--retry-unresolved` with the same run ID to retry unknown decisions. To limit a run, pass `--limit=100` after `--`; pass one or more catalog IDs to select tractates. Other runner modes retain their separate legacy checkpoint behavior. The generic runner skips Nedarim and Keritot in broad runs and rejects explicit selections; use their dedicated offline tools below.

To recheck unknown Tosafot absences without downloading the PDFs again, run `npm run measure:shas -- --recheck-absences`. This uses cached Wikisource pages and fetches missing ones; `--refresh-wikisource` refreshes the eligible unknown sides. It stops on Wikisource HTTP 403, 429, and server errors. Resume later with the same command or specify catalog IDs. Existing numeric Tosafot values, including previous zeroes, are preserved.

Run `npm run measure:shas -- --recheck-rashi-absences` for the corresponding Rashi recheck. An unknown Rashi value can become zero when a usable Wikisource page has an empty or missing regular Rashi section and no Rashi was detected in the PDF. An attributed Rashi heading prevents this inference. Missing or redirected source pages do not establish absence. Existing numeric values and confirmed zeroes are preserved. These source-only zeroes can be wrong if Wikisource omits printed text.

To retry pages with saved overlap failures, run `npm run measure:shas -- --wikisource --retry-overlaps --run-id=<id>`. A retry preserves prior measurements when classification still fails, and reusing the same run ID skips attempted pages. The `continuation-fix-20261113` run retried 169 pages: 14 were fully classified and 155 still failed the overlap check. A subsequent shared-quotation fix classified one more, leaving 154 saved overlap failures.

A bounded commentary retry can target any one tractate with `npm run measure:shas -- <tractate> --wikisource --retry-commentary --limit=100 --run-id=<id>`. Optionally pass `--amudim=2a,2b` to select specific pages and `--cached-pdfs-only` to forbid PDF downloads. Existing measurements and confirmed zeroes are protected, and repeating a run ID skips attempted pages. A successful retry can still leave categories unknown, particularly for main-only tractates.

Commentary catchwords are excluded only when a short, inset, standalone stream-tail word follows a source-supported completed row, the current stream has independent source support, and the next printed side's same commentary opens with exactly that word. Wikisource snapshots record the tractate, commentary, amud, revision URL, raw-content SHA-256, and a SHA-256 binding the normalized evidence text to its opening word. Ambiguous geometry, unsupported markup, absent sources, or changed fingerprints leave the fragment intact; the overlap check is unchanged. Removed rows remain frame-only geometry and do not contribute commentary area. Checkpoint `page.fragmentOwnership` records both source snapshots' provenance and the retained frame row.

Megillah 10b and 16a now include their separately classified Tosafot body text: the body font is approximately 10.62 points, compared with approximately 10.14 for Rashi. Their Tosafot catchwords use the Rashi size, and were reattributed only with matching PDF geometry and current/next-page Wikisource fingerprints. Larger 15.60-point opening words remain unmeasured because their separate baselines do not meet the adjacency guard; the reported areas may therefore undercount these headings.

The local hash-pinned regressions verify Arakhin 2a Rashi/Tosafot and Menachot 6a Tosafot, unchanged frames and all other boxes, and genuine Arakhin 3b Rashi retention. Arakhin 3b's separate commentary candidate remains untouched because a detached marker breaks the strict terminal-row geometry. Menachot 97b/99b are not verified. No data retry is part of these tests. For a later bounded retry of the two verified overlap pages:

```sh
npm run measure:shas -- arachin --wikisource --retry-overlaps --cached-pdfs-only --cached-wikisource-only --amudim=2a --limit=1 --run-id=commentary-catchwords-arachin-20261114
npm run measure:shas -- menachos --wikisource --retry-overlaps --cached-pdfs-only --cached-wikisource-only --amudim=6a --limit=1 --run-id=commentary-catchwords-menachos-20261114
```

These commands select only saved overlap failures, require cached current/successor Wikisource revisions and matching cached PDFs, and write checkpoints and the export. The existing runner still requests its pinned Sefaria Rashi archive; the two cache flags do not make it fully offline. Do not run these commands under a no-source-fetch constraint. Reusing each run ID skips already attempted pages; use a new explicit ID for another attempt.

Run `npm run review:problems` and open the printed local URL to browse partial, unresolved, and pending pages. Choose `All pages` to inspect completed pages as well. A fully classified recovery is not a problem solely because it retains its original recovery reason; active classification errors remain problems. Filter by issue or tractate and use the page selector or Previous and Next buttons. The list refreshes when the export changes. The server reuses the disk PDF cache and downloads a missing PDF only when selected; it checks saved fingerprints and never changes the checkpoints or export. For overlap errors, it attempts to reconstruct the candidate boxes using the matching cached Wikisource revision; dashed colors and orange intersections are provisional, while the displayed percentages are the saved values. Suspect commentary highlights are hidden after a failed legacy audit. Rashbam is displayed separately and not included in the selected total. A source-only Rashi or Tosafot zero is identified separately. A scan may be unavailable, or its fingerprint may differ, in which case saved highlights cannot be shown. The generated `results/problem-review.html` requires the local server and should be opened through the printed URL.

### Nedarim Audit

Nedarim's side Tosafot is deliberately excluded from measurement at the user's request. All 180 sides export `tosafot: 0` with `excludedCategories: ["tosafot"]`; this is not a claim that Tosafot is absent. The generic runner does not classify it. The audit separately matches the printed commentary attributed to Rashi and Ran against pinned PDF and Wikisource evidence; Ran is exported as `otherCommentary`. An attributed Rashi heading must not be interpreted as evidence that Rashi is absent. Legacy classifications are retained as history but untrusted commentary measurements were cleared.

Main text, attributed Rashi and Ran are measured on all 180 sides. Six further PDFs (5a, 5b, 50b, 51a, 56a, 56b) were retrieved from the Shas.org API and fingerprint-verified, and three missing Wikisource pages (5b, 51a, 56b) were cached from public page views. The shared frame is no longer provisional; the retry preserved all main rows.

Rashi and Ran share one body font and size in these PDFs (11.16 points, with 11.40/10.92 headings), so type size cannot separate them. Layout does: beside the main text Rashi is in the inner column (right on a-sides, left on b-sides) and Ran in the outer column, which holds for all 12,207 text-attributed column rows except two below-main rows. Text attribution runs first. Column rows the text leaves unresolved then take their column's commentary unless they carry opposite evidence or their column's attributed neighbours disagree; full-width rows only take a commentary when all attributed full-width neighbours agree. Beside the main text, a short quotation (< 24 matched letters) found in the other commentary is re-attributed to its column when the rows directly above and below agree (76b: a comment opening shared by Rashi and Ran). A side needs main text and at least one commentary section. On 11a, Wikisource places the Ran text in its `gmara_ran` container under the attributed-Rashi heading (confirmed against Sefaria's Vilna Ran); a container that contradicts its heading is followed only when the container's own heading is absent.

Run `node experiments/nedarim-audit.mjs --retry-unknown` for an offline dry run against cached, pinned inputs. Add `--apply` to atomically stage and replace the checkpoint and export after validation; do not run it alongside measurement or export writers. Ambiguous or missing evidence remains unknown. Wikisource's robots policy disallows automated access to the revision API, so missing cached revisions have not been fetched through that endpoint.

### Keritot Classification

All 54 sides have classified main text and commentary. The full profile uses 12-point main text, 9.84-point commentary, and a separately identified 8.04-point bottom Tosafot block. Each block requires a unique label, consistent geometry, and matching cached Tosafot text. The six Tosafot zeroes on 26a-28b rely on Wikisource section evidence, not a complete independent visual absence audit. Main rows and prior classifications were preserved; the new shared frame slightly changes the fractions.

`node experiments/kereisos-commentary.mjs --output=<outside-results-directory> --run-id=<id> --sefaria-rashi=<local-json> --sefaria-rashi-sha256=15b7e81d1a50d54deca5fa0d44222364e498ca437a27ce5da59e20d9403f1058` stages results offline without applying them. The pinned source is the [Sefaria Rashi on Keritot archive](https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/json/Talmud/Bavli/Rishonim%20on%20Talmud/Rashi/Seder%20Kodashim/Rashi%20on%20Keritot/Hebrew/merged.json); PDF fingerprints and cached Wikisource revisions are required. The applied run separately checked each previous classification, main row, PDF hash, overlap, and unchanged non-Keritot export before replacing the checkpoint and export with backups.

The current bounded fixes also cover Nazir 33b, Gittin 76b, Kiddushin 36b and 77a, Sanhedrin 57a, Avodah Zarah 35b and 38b, Chullin 138a, Bekhorot 8b, and Zevachim 51b and 71a. They rely on specific source or PDF evidence and remain estimates, not a visual audit of every page.

### Shekalim Frame Geometry

Shekalim's body shifts horizontally between printed sides. Only its frame-only items are filtered, before grouping, to normalized x104-534; side a is offset by +85.08 PDF units relative to side b. Main groups are never filtered or translated in the checkpoint. The existing font-size basis is unchanged. Tests pin the cached PDFs for 2a, 2b, 9b, 14a, and 22b, preserving 9b's genuine left commentary and 14a's main rows reaching x616.38. Marginal references end near normalized x98 or start near x540, outside the body window.

The geometry-only migration has been applied to all 42 saved sides and the full export. The common frame is x104.18843913259376-533.8471179031455 on side b and x189.26843913259376-618.9271179031455 on side a, y344.73885950439995-1140.3795471679998, including the usual two-unit padding. Every side uses the same width, height, and denominator (341853.92663763557 PDF units squared). With saved checkpoint pages, `frameForPage(frame, page)` performs the translation. Export-only consumers can place it using the printed amud:

```js
const offset = book.frame.sideOffsets?.[amud.at(-1)] ?? 0;
const pdfFrame = {
	...book.frame,
	left: book.frame.left + offset,
	right: book.frame.right + offset,
};
```

All 42 saved main groups and all category numerators are unchanged. Main text is numeric on all 42 sides, totaling 10.017160696096097 equivalent sides / 5.008580348048048 equivalent dafim under the corrected denominator. Rashi and Tosafot are zero on all 42 sides: 2a and 16b are Wikisource-only, and the other 40 rely on user confirmation. Shekalim 2a's source uses the alternate title `שקלים א א`, accepted only when its page header identifies the printed side as 2a. Source-only zeroes can be wrong if the transcription is incomplete. The other commentaries remain unclassified; headings, unrecognized type sizes, and 22b's separate closing-prayer appendix are not newly measured.

Shekalim in this edition is Jerusalem Talmud, not a Bavli Gemara. Its printed commentaries include Korban HaEdah, Rivevan, Tiklin Chadtin and Mishnat Eliyahu; these are not renamed Rashi or Tosafot. The [Kollel Iyun HaDaf introduction](https://dafyomi.co.il/shekalim/sk-in-biblio.htm) describes the 22-daf Vilna layout and its commentaries. The [2a Wikisource revision](https://he.wikisource.org/?oldid=863058) identifies Korban HaEdah and Rivevan, but omits some commentary visible in the PDF. Those linked references alone do not establish the absence of regular Rashi and Tosafot on the other 40 sides.

**TODO:** Identify and measure the printed Yerushalmi commentaries, including Korban HaEdah, Rivevan, Tiklin Chadtin and Mishnat Eliyahu, as separately selectable categories, with source evidence and per-page measurements like Rashi and Tosafot.

### User-Authorized Shekalim Absence

The user explicitly confirmed that Yerushalmi has no Rashi or Tosafot. Shekalim (2a-22b, 42 sides) is the only Yerushalmi section in this catalog. Kinnim and Middot are Mishnah, and Tamid is Bavli; none is covered by this decision. This decision has been applied to the saved results.

To repeat the bounded, offline decision from the workspace root:

```sh
npm run measure:shas -- shekalim --confirm-yerushalmi-absence
```

This exact mode accepts only Shekalim and no other flags. It reads the existing 42-side checkpoint, converts genuinely unknown Rashi/Tosafot categories without detected rows, and records `basis: "user-confirmed-yerushalmi-no-rashi-or-tosafot"`, `sourceType: "user-attestation"`, `source: null`, and the consistent saved `pdfSha256`. Old unknown evidence is retained under `previousEvidence`. It preserves numeric values, detected rows, existing confirmed absences, and source evidence, including the independent Wikisource zeroes on 2a and 16b. Missing or disagreeing fingerprints and detected-row conflicts leave categories untouched and produce a nonzero exit status; unrelated eligible categories can still be applied. Unmeasured pages retain their pending/unresolved state and unknown main value.

No PDFs are read or fetched, no sources are requested, and no measurement is run. The checkpoint uses the runner's temporary-file/atomic-rename convention, then the export is rebuilt using saved data only. Stop concurrent measurement/export writers first. The checkpoint and export are not a single transaction; if export generation fails after the checkpoint is saved, run `npm run export:shas` to rebuild from it. Repeating the confirmation makes no checkpoint/export writes when no categories change. Ordinary measurement never automatically applies this decision to new unknown work, and later retries retain the attestation and reject conflicting detected commentary.

User attestation is not a Wikisource or independently verified visual finding. Numeric coverage can make a section `complete` without establishing accuracy: Shekalim's main-only/unclassified frame remains provisional and its actual Yerushalmi commentaries remain unmeasured. Problem review includes a separate `User-attested commentary absence` filter and note; the existing source-only filter still identifies only Wikisource zeroes.

Focused checks use synthetic pages and temporary directories, without changing saved results or loading PDFs:

```sh
node --test experiments/shekalim-absence.test.mjs experiments/shas-export.test.mjs
node --test --test-name-pattern='source-only|user-attested|filters, navigates' experiments/problem-review.test.mjs
```

Read-only local preview, with no source requests, checkpoint changes, or generated report/export writes:

```sh
SHEKALIM_FRAME_PREVIEW=1 npm run review:problems
node --test --test-name-pattern=Shekalim experiments/measure-corpus.test.mjs experiments/shas-export.test.mjs experiments/problem-review.test.mjs
```

The preview remains available after application. It verifies each saved PDF hash and rebuilds only Shekalim frame geometry in memory. Its fractions use the rebuilt denominator and remain identified as a preview. Missing or mismatched cached PDFs block it. Cache-dependent tests explicitly skip when fixtures are unavailable; skips are not successful PDF validation.

Reproduce the implemented, offline migration from the workspace root; do not run a data remeasurement:

```sh
node --test experiments/migrate-shekalim-frame.test.mjs experiments/shas-export.test.mjs
node experiments/migrate-shekalim-frame.mjs
```

The utility rejects active measurement/export writers and concurrent migrations; read-only review processes may remain running. It loads all saved tractate data and the current export, hashes every cached/corpus PDF, and rebuilds only Shekalim frame geometry in memory using exact saved SHA-256 fingerprints and PDF views. It compares every saved entry after deleting ONLY `frameRows`/`frameGeometry`, checks all 42 raw main groups and category numerators, zeroes/unknowns, row containment, common denominators, unchanged export metadata, and byte-identical non-Shekalim tractates. It requires the existing export's canonical two-space JSON format for that byte comparison. Any unreconcilable input aborts before replacement.

The applied run hash-checked 971 PDFs. Four unpinned caches belong to saved unresolved entries (Nazir 33b, Nedarim 40b/45b, Zevachim 71a) and have no saved measurement fingerprint: they are recorded separately in the audit and verified unchanged between staging and commit, not authenticated against a prior fingerprint or used for geometry. No source was fetched and no missing commentary zero was inferred.

Before replacing results, the utility creates a unique timestamped temporary directory outside the workspace, containing byte-exact originals, staged checkpoint/export files, and `validation.json` with input/output/PDF hashes and invariant counts. It rechecks every saved JSON input and the entire PDF cache immediately before commit, writes same-directory temporary result files, and renames the checkpoint followed by the export. It verifies both replacements and writes `applied.json`; normal replacement/reporting failures restore originals. Backups are temporary and may be removed by OS cleanup. Each file replacement is atomic, but the pair is not a filesystem-wide transaction: a process crash or power loss between renames requires recovery from those backups, and a reader can briefly observe different generations. Saved `page.areas`, if any, remain untouched; the export recomputes all fractions on cloned pages with the new denominator instead of trusting cached fractions. Repeating the migration is idempotent for checkpoint/export content and creates a new backup/audit directory. Stale or mixed Shekalim geometry still fails closed; the classifier version is not globally bumped.

Bava Batra's Rashbam is matched against the pinned Sefaria archive as separate commentary, not Rashi or Tosafot. The `rashbam-20261113` pass reclassified 295 partial sides, preserving six source-backed Tosafot zeroes; their previously unknown Rashi values were subsequently set to Wikisource-only zeroes. To repeat a bounded pass, use `npm run measure:shas -- bava-basra --wikisource --retry-commentary --limit=400 --run-id=<id>`. Reuse the same ID to resume; matching PDF fingerprints and Wikisource revisions are required when previously recorded.

Pesachim 99b-121b was also audited for Rashbam, including previously complete sides. A later source-supported stream split classified the mixed Tosafot and Rashbam blocks on 110a, 111a, 111b, 113a, 118b, and 119a; 121b subsequently received a Wikisource-only Rashi zero. The audit can be repeated with `npm run measure:shas -- pesachim --wikisource --retry-commentary --include-classified --limit=50 --run-id=<id>`; sides already attempted with that ID are skipped.

For a Sotah-only fresh rerun:

```sh
npm run measure:shas -- sotah --wikisource
```

The measurement uses regular `תוספות` or `תוס'` text, not Tosafot Shantz or other named commentators, and records the Wikisource revision. An unknown value becomes zero if the regular Tosafot section is explicitly empty, or if there is no populated Tosafot-named section. Detected PDF Tosafot is not replaced. This source-only rule also applies to main-only recoveries and failed PDF classifications, without changing their other unknown values. It is an estimate, not a visual review: Wikisource can omit printed text, Sefaria can follow semantic anchors, and the PDF classifier can miss text. Missing and redirected Wikisource pages are not treated as absence. Sotah 35a's two short Tosafot lines and the absence on 44a were reviewed visually and the overrides apply only to the reviewed PDF hashes. HebrewBooks' own text site forbids automated access and returned HTTP 403, so this workflow does not scrape it. Rashi matching uses Sefaria's per-page commentary references; its source-only absence rule uses Wikisource.

Horayot instead uses its earlier pinned Sefaria Rashi and Tosafot exports and the calibrated Horayot PDF layout. The regular printed Tosafot ends at 8b; pages from 9a onward receive a source-backed zero only when no Tosafot is detected and both commentary runs match Rashi. Sefaria's commentary references can follow semantic anchors rather than physical printed placement, so these results retain that limitation. Run `npm run measure:shas -- horayos --wikisource` to fetch the Horayot PDFs again using this exception.

The current Sotah rerun is `complete` for classifier coverage: 96/96 sides have all category values, including 16 source-backed or manually reviewed Tosafot zeroes. It estimates 16.17 equivalent dafim of Gemara and Mishnah, 13.03 of Rashi, and 9.90 of Tosafot, or 39.10 combined. These are estimates, not manually verified totals.

## Historical Calibrated Results

These are the earlier Sefaria-based calibrated results, not the current Wikisource-based Shas export. One equivalent printed side is the area of that tractate's fitted text-body rectangle described below; one equivalent daf is two such sides. These are area equivalents, not the number of physical folios in the edition or the number of actual pages containing text. Each tractate uses a different reference area, so its equivalents are fractions of its own page format, not a common physical area.

| Tractate | Gemara + Mishnah | Add Rashi | Add Rashi and Tosafot |
| --- | ---: | ---: | ---: |
| Horayot, 25 sides | 9.63 sides / 4.81 dafim | 17.24 sides / 8.62 dafim | 18.06 sides / 9.03 dafim |
| Rosh Hashanah, 67 sides | 20.83 sides / 10.41 dafim | 35.67 sides / 17.84 dafim | 54.25 sides / 27.13 dafim |

Totals can vary if a different edition, reference rectangle, or font classification is used.

### How It Is Measured

PDF.js extracts the position and width of each text fragment. The program groups fragments into lines, preserves separate commentary columns, and uses the actual measured left-to-right width of each line. Each line's area is its width multiplied by the baseline spacing for its text type. The line areas are added and divided by a rectangle fitted separately to each tractate. Its top follows the highest line's baseline plus 70% of its line spacing, rather than the full font-height box of an oversized word; the sides and bottom follow detected text bounds. Each edge has a two-unit allowance. Horayot's rectangle is approximately 382.46 by 766.21 PDF units (293,044 square units); Rosh Hashanah's is 423.82 by 748.83 units (317,367 square units). Each rectangle is fixed across all pages of that tractate, not the entire sheet or an independently established historical standard. Summing fractions yields equivalent sides, and dividing by two yields equivalent dafim.

On Horayot 10a, the 52 main-text lines are 31 narrow and 21 wide; their typical widths are about 152.7 and 377.1 PDF units respectively. The 84 Rashi lines are 76 narrow and 8 medium, typically about 99.6 and 183.7 units wide. The terms narrow and wide are not shared widths across text types. The measured main lines have a combined width of 12,650.03 units and spacing of 10.66825, producing 134,954 square units, or 46.1% of the Horayot rectangle. Rashi's corresponding figures are 9,020.43 units, 8.69562 spacing, 78,438 square units, and 26.8%. Rounding each displayed percentage separately can cause a 0.1 percentage-point difference from the combined result.

The earlier 59.0% and 34.3% for 10a used a smaller rectangle fitted to that page alone; the previous 42.3% and 24.6% used one larger rectangle for both tractates. The current Horayot rectangle is fitted to the whole tractate and extends into space unused by those texts on 10a.

No universal maximum line counts were obtained from the internet or assumed. As a geometric illustration, Horayot's rectangle height divided by its spacing allows approximately 71.8 full-height main-text line spacings, 88.1 Rashi spacings, or 114.0 Tosafot spacings. The corresponding Rosh Hashanah values are 63.0 and 71.7 for main text and commentary. These are not limits on the number of actual lines, since lines can occupy different columns, and are not universal properties of printed Talmud pages.

The historical corpus classifies commentary streams by matching decoded Hebrew against pinned Sefaria Rashi and Tosafot exports, rather than assuming fixed sides. The newer Shas run uses page-specific Wikisource Tosafot where available. Bold openings are included using their PDF text order within the identified commentary streams, including larger initial words and bold-only lines; selected inline citations are also included. Horayot's Tosafot is in two lower columns and ends at 8b; its opening introductory paragraph is excluded. On Rosh Hashanah 31a both side columns are Rashi and a short Tosafot block is embedded beside the main text.

The method measures line boxes, not ink pixels. Tall bold words contribute their width times the normal commentary line spacing; their extra approximate highlight is not added as a second area. Marginal works are excluded, as are some headings, decorations and fragments in other type sizes; spacing is estimated from sampled baselines. Short gaps between fragments within a line are included, and small same-category line-box overlaps are not subtracted. The selected categories do not overlap one another in this corpus. The opening pages and other overlays have been spot-checked, not manually annotated on every page, so classification errors or omitted text remain possible and no accuracy margin has been established.

## Reproduce the Corpus Review

Requires Node.js, `npm install`, internet access, and about 75 MB of local space for PDFs and rendered images. Obtain permission where required and check the source terms before bulk downloading. The user of this study authorized the non-commercial fetch; applicable HebrewBooks restrictions remain uncertain. The program stops on failed downloads.

```sh
npm run fetch:pages -- horayos
npm run fetch:pages -- rosh-hashanah
npm run measure:corpus
npm run test:corpus
npm run review:corpus
```

Open [results/corpus-review.html](results/corpus-review.html) after generating it. This viewer shows the earlier calibrated corpus, not the current Shas JSON. Select a tractate, an amud, and text types to inspect the colored line boxes, dashed tractate rectangle, page percentage, and tractate total. The report and PDFs are local and ignored by Git. The tests use Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` by default; set `CHROME_PATH` to another compatible browser. Corpus-specific integration checks are skipped until the measurements have been generated.

## Try the Visual Review

Run `npm install` once. The existing `npm run review` command automatically downloads three sample pages, so use it only after confirming that access is permitted. Open the resulting `results/review.html` in a browser. The report works offline, contains third-party page images, and is ignored by Git.

Choose a page and check the texts you want to count. The colored lines show what was detected, and the dashed rectangle is the reference area used as 100%. The large number is the sum of the displayed estimates for the selected texts. For example, 25% means roughly one quarter of that rectangle, not one quarter of the entire sheet.

This earlier three-page experiment is separate from the complete corpus review above.

To inspect the Eruvin 12b Shas result, run `npm run review -- eruvin 12b` and open [results/review.html](results/review.html). It downloads the PDF again, verifies its fingerprint, and displays the saved classifications when they match the reconstructed boxes. If classification is partial, reconstructed commentary is provisional and orange outlines show main/Tosafot overlaps. The review does not change the Shas export.

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

Mozilla PDF.js extracts positioned text items. On these samples, the probe identifies the main text by its observed font size and identifies the two commentary streams by PDF content order and inner/outer position. It groups items into lines, approximates each line by its leftmost and rightmost extents and median baseline pitch, and divides their area by an estimated rectangle surrounding the three main text streams. It does not count individual ink pixels. The PDFs' underlying character encodings are partly garbled; this older probe uses geometry and content order rather than the decoded Hebrew matching used in the corpus measurement.

Colored overlays were visually inspected on all three pages. They follow the main and commentary regions, including wraps, but omit the opening decorative word and some differently sized commentary headings. They are not a manually annotated ground-truth dataset. Font sizes, PDF order, grouping, and the inferred body bounds are sample-specific and must not be assumed for other pages or editions.

### Initial Results

Percentages below are exploratory line-box areas relative to each method's own estimated three-text body, **not** to the full physical sheet. The denominators and layouts differ, so matching numbers are not an accuracy validation.

| Berakhot | Renderer: main / Rashi / Tosafot | PDF probe: main / Rashi / Tosafot |
| --- | --- | --- |
| 2a | 27.5% / 23.0% / 40.7% | 26.2% / 21.8% / 37.6% |
| 2b | 39.7% / 25.9% / 26.2% | 39.3% / 25.5% / 22.9% |
| 3a | 40.8% / 24.7% / 26.1% | 42.3% / 21.1% / 25.8% |

The renderer produces 28, 44, and 49 main-text lines compared with the PDF probe's 34, 52, and 50. Its reconstruction is therefore unsuitable as an unvalidated measurement of the actual printed layout. The direct PDF approach is more closely tied to the printed layout; the newer corpus measurement above adds a fixed denominator per tractate and commentary matching, but retains the stated limitations.

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

The older direct PDF probe failed on Horayot 2a and 10a because their type sizes differ from the Berakhot samples. The newer corpus measurement handles the observed Horayot and Rosh Hashanah sizes separately.

## Historical Layout Checks

For layout research, eight amudim were drawn without replacement from the two tractates using a 32-bit LCG, seed `20260304`, multiplier `1664525`, increment `1013904223`, and four draws per tractate in the order shown. Candidates were inspected as individual images in the Internet Archive uploader's 1883 and 1887 Vilna scans. The 2a and 4b Rosh Hashanah text and the Horayot 3a header anchor the leaf mapping; other references use the observed leaf order, with printed folio or page numbering where visible. These are bitmap scans, not the native-text PDFs used by the detector; they cannot validate the detector or establish that a different edition has the same layout.

| Tractate | Sampled amudim and archive image leaves | Observations |
| --- | --- | --- |
| Rosh Hashanah | 7b (0021), 6b (0019), 21a (0048), 18b (0043) | Side text can extend above and below the central text. On 18b the main text expands into space on only one side. The outer margin can contain separately headed Rabbeinu Chananel. |
| Horayot | 6b (0235), 3a (0228), 10a (0242), 3b (0229) | Main text can widen below both side columns. On 3a and 3b a separately headed Tosafot section sits below the main text, while the margin has Tosafot HaRosh. On 6b a chapter ending and a new Mishnah share the page. |

The images are in [Rosh Hashanah's volume](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V05_Rosh-Hashanah_Yoma_Shekalim_Sukkah_1887_images/page/n10/mode/1up) and [Horayot's volume](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V16_Avodah-Zarah_Horayot_%27Eduyyot_Makkot_Avot_Masekhtot-Ketanot_1883_images/page/n228/mode/1up); replace the `n` number in the viewer URL with a leaf number above. The opening Rosh Hashanah 2a has commentary continuing below the main text. Its final 35a is followed by [leaf 0077](https://archive.org/details/talmud-bavli-shas-vilna_images/Talmud_Bavli_Shas_Vilna_A_V05_Rosh-Hashanah_Yoma_Shekalim_Sukkah_1887_images/page/n77/mode/1up), a completion-prayer and Tosafot-summary page with no Gemara or Mishnah. It is an extra physical page, not evidence of an empty amud within the counted 2a-35a range. A page with Mishnah but no Gemara must still count as main text.

Horayot's opening page includes introductory material, which should not automatically be counted as Tosafot. According to the [Hebrew Wikipedia overview](https://he.wikipedia.org/wiki/%D7%9E%D7%A1%D7%9B%D7%AA_%D7%94%D7%95%D7%A8%D7%99%D7%95%D7%AA), the Vilna edition places Tosafot below the main text and prints it only through daf 8; Tosafot HaRosh is a separate work in the outer margin. [Sefaria's Vilna Tosafot text](https://www.sefaria.org/api/texts/Tosafot_on_Horayot.8b.1-30?context=0&commentary=0) ends at 8b. Pages without standard Tosafot should contribute zero for that selection, not be treated as failures.

The local Horayot 10a PDF provides an example of Rashi on both sides of the main text: readable bold phrases from the medium-size columns on both sides match [Rashi's text](https://www.sefaria.org/api/texts/Rashi_on_Horayot.10a.1-100?context=0&commentary=0). Its 52 Gemara lines comprise 31 narrow and 21 wide lines; its 84 Rashi lines comprise 76 narrow and 8 medium lines. The words narrow, medium and wide refer to widths within each text, not the same width across Gemara and Rashi. Measuring each line's extent and each text's baseline spacing gives about 59.0% Gemara and 34.3% Rashi of the rectangle surrounding these two text groups on this page. Other fonts and decorations are omitted. This is a per-page rectangle, not yet a fixed reference for comparing or totaling different pages.

To reproduce the calibration using the local PDF:

```sh
node experiments/measure-horayot-10a.mjs /path/to/horayot-10a.pdf
node --test experiments/measure-horayot-10a.test.mjs
```

The script deliberately rejects layouts that do not match these specific counts and spacing; it is not a general classifier. Historical archive hOCR cannot simply fill the geometry gap: on Horayot 10a its detected lines sometimes combine the main text and side commentary. It requires a different segmentation method and validation before it can support totals.

These observations disprove an unconditional three-column or fixed-side classifier. Matching commentary text and using a fixed rectangle per tractate addresses some of these problems, but a labeled sample remains necessary to quantify accuracy.

The archive uploader marks the historical scans as public domain and attributes them to Duke; those statements and scan reuse rights have not been independently verified. Internet Archive access is subject to its [terms](https://archive.org/about/terms.php). The repository does not include these images.

## Browser and Cost Considerations

The word-count calculation can run locally in a browser using the two archive files, or once in a build step with only precomputed numbers sent to the browser. The latter avoids per-user text downloads and parsing, but source rights for the resulting dataset must still be checked. No AI or paid text API is needed by these experiments. Hosting, bandwidth, manual review, maintenance and any permissions may still cost money; no provider pricing or browser performance benchmark has been established.

The Shas.org PDF GET response checked here did not allow cross-origin browser fetching. A PDF-based live calculation would otherwise require one PDF per amud: 92 requests for these two tractates. The two JSON exports have `Access-Control-Allow-Origin: *` in the checked GitHub response, but availability, rate limits and licenses still matter. The PDF API documents non-commercial redistribution with attribution and the full license text; the linked historical HebrewBooks site terms also restrict automated downloading. Whether those site restrictions apply to use of the separate Shas.org API is unclear, so obtain permission before bulk downloading. Do not assume either the PDFs or derived measurements can be redistributed commercially.

## Other Research

[Historical Document Analysis](https://github.com/AIStream-Peelout/historical-document-analysis/blob/master/docs/talmud_ocr_segmentation.md) describes a Talmud-specific OCR and language-model pipeline that separates section *text*, not measured page areas. It reports extraction errors and uses ground-truth lengths for some quality checks; its documented setup can require cloud services and credentials. It was not run here.

[Eynollah](https://github.com/qurator-spk/eynollah) provides generic page and line segmentation but does not claim to label Gemara, Rashi, and Tosafot. Its documented supported configuration is Linux, so it was not tested on this macOS machine.

## Data Licenses

The Sefaria main-text version used here is CC BY-SA; linked commentary reports its own version and license in the experiment output. The page index uses Hebrew Wikisource content, generally offered under CC BY-SA 4.0; revision links are retained for attribution and checking individual pages. The Shas.org PDFs are supplied by HebrewBooks and Moznaim for free non-commercial redistribution, subject to attribution and inclusion of the full license terms. See the [API documentation](https://www.shas.org/daf-pdf/api/api-documentation.html) before redistributing them. The PDFs are not included in this repository. Check the renderer's bundled font licenses before redistribution.