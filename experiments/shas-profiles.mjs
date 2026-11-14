export function shasDefinition(tractate, { mainOnly = false } = {}) {
  const profile = tractate.slug === "meilah"
    ? { mainSize: 12.6, mainPitch: 10.32, commentaryPitch: 9.48, commentarySizes: [10.2, 9.96] }
    : mainOnly && tractate.slug === "shekalim"
    ? { mainSize: 11.4, mainPitch: 9.72, frameSizes: [7.68, 8.4, 8.64, 8.88, 9.12, 9.36], framePitch: 9,
      frameWindow: { left: 104, right: 534 }, frameSideOffset: 85.08 }
    : mainOnly && tractate.slug === "kinim"
    ? { mainSize: 12.6, mainPitch: 10.44, frameSizes: [10.68, 10.44], framePitch: 10 }
    : mainOnly && tractate.slug === "tamid"
    ? { mainSize: 13.44, mainPitch: 11.88, frameSizes: [10.68, 10.92], framePitch: 10.44 }
    : mainOnly && tractate.slug === "middos"
    ? { mainSize: 13.68, mainPitch: 11.88, frameSizes: [10.2, 9.96], framePitch: 9.48 }
    : mainOnly && tractate.slug === "kereisos"
    ? { mainSize: 12, mainPitch: 10.44, frameSizes: [9.84, 8.04], framePitch: 9.36 }
    : tractate.slug === "megillah"
    ? { mainSize: 12.96, mainPitch: 11.26, commentaryPitch: 9.94, commentarySizes: [10.14, 10.62], boldSizes: [10.86, 11.34], adjacentBoldSizes: [11.34] }
    : tractate.slug === "avodah-zarah"
    ? { mainSize: 13.2, mainPitch: 11.88, commentaryPitch: 10.44 }
    : tractate.slug === "menachos"
    ? { mainSize: 11.65, mainPitch: 10.67, commentaryPitch: 9.42, commentarySizes: [9.64, 9.84], boldSizes: [8.05, 9.41, 10.74], adjacentBoldSizes: [9.41, 10.74] }
    : ["bechoros", "arachin", "temurah"].includes(tractate.slug)
    ? { mainSize: 13.44, mainPitch: tractate.slug === "arachin" ? 11.7 : 11.88, commentaryPitch: tractate.slug === "arachin" ? 10.2 : 10.44, commentarySizes: [10.92, 10.68], boldSizes: [8.4, 8.88, 11.88, 13.92, 14.4, 16.32], adjacentBoldSizes: [13.92, 14.4] }
    : tractate.slug === "horayos"
    ? { mainSize: 12.24, mainPitch: 10.66825, commentaryPitch: 8.69562, tosafotPitch: 6.72 }
    : tractate.slug === "nedarim"
    ? { mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44,
      nedarimLayout: { bodySizes: [11.16], boldSizes: [11.4, 10.92], inlineSizes: [8.46, 8.94, 13.92], window: { left: 84, right: 511 }, gutter: { left: 293, right: 302 } } }
    : { mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44 };
  return { ...tractate, ...profile };
}