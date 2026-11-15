const archive = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/";
const tractates = [
  { title: "Horayot", order: "Nezikin", expectedAmudim: 25 },
  { title: "Rosh Hashanah", order: "Moed", expectedAmudim: 67 },
];

async function countTractate({ title, order, expectedAmudim }) {
  const file = `json/Talmud/Bavli/Seder ${order}/${title}/Hebrew/merged.json`;
  const url = archive + file.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const book = JSON.parse(new TextDecoder().decode(bytes));
  if (book.title !== title || book.sectionNames?.[0] !== "Daf" || !Array.isArray(book.text)) {
    throw new Error(`${title}: unexpected archive structure`);
  }
  const pages = book.text.map((segments, index) => ({ index, segments })).filter(({ segments }) => segments.length);
  if (pages.length !== expectedAmudim || pages.some(({ index }, position) => index !== position + 2)) {
    throw new Error(`${title}: unexpected or missing amudim`);
  }

  const counts = pages.map(({ index, segments }) => {
    if (!Array.isArray(segments) || segments.some((segment) => typeof segment !== "string")) {
      throw new Error(`${title}: unexpected segments on index ${index}`);
    }
    const text = segments.join(" ");
    const unsupportedMarkup = text.match(/<(?!\/?(?:strong|big)>|br\s*\/?>)[^>]*>|&[^;\s]+;/i);
    if (unsupportedMarkup) throw new Error(`${title}: unsupported markup ${unsupportedMarkup[0]}`);
    const plain = text.replace(/<br\s*\/?>/gi, " ").replace(/<\/?(?:strong|big)>/gi, "");
    const letters = plain.normalize("NFD").replace(/[\u0591-\u05c7]/g, "");
    const words = letters.match(/[\u05d0-\u05ea]+/g) || [];
    return { amud: `${Math.floor(index / 2) + 1}${index % 2 ? "b" : "a"}`, words: words.length, letters: words.join("").length };
  });
  return {
    title,
    source: url,
    versions: book.versions,
    downloadedBytes: bytes.byteLength,
    amudim: counts.length,
    words: counts.reduce((total, page) => total + page.words, 0),
    letters: counts.reduce((total, page) => total + page.letters, 0),
    pages: counts,
  };
}

const results = await Promise.all(tractates.map(countTractate));
console.log(JSON.stringify({
  warning: "Text-length proxy including Mishnah, not a measurement of printed-page area. The merged source may contain licensed versions.",
  counting: "Hebrew letter sequences after removing vocalization and supported HTML markup; punctuation separates words.",
  results,
  ratios: { words: results[1].words / results[0].words, letters: results[1].letters / results[0].letters },
}, null, 2));