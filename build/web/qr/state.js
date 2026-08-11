/* ==========================================================================
   Single mutable state object + presets. Every control writes into S,
   every render reads from it.
   ========================================================================== */

const DEFAULTS = {
  /* payload */
  text: "https://example.com/qr-lab",
  ecl: 2, minver: 0, mask: -1,

  /* geometry */
  cell: 10, quiet: 4,

  /* module shape */
  shape: "rounded", scale: 0.92, radius: 0.5, mergeRuns: true,
  falloff: "none", falloffAmount: 0.35,
  jitterRot: 0, jitterScale: 0, jitterPos: 0, seed: 7,

  /* finder eyes */
  eyeFrame: "rounded", eyeFrameR: 0.35,
  eyeBall: "rounded", eyeBallR: 0.35,
  eyeColorMode: "inherit",
  eyeFrameColor: "#B32B58", eyeBallColor: "#15181B",
  eyePerCorner: false, eyeC1: "#B32B58", eyeC2: "#0B6E7F", eyeC3: "#15181B",
  alignOverride: false, alignColor: "#B32B58",

  /* foreground */
  fgMode: "solid", fg: "#15181B",
  gA: "#B32B58", gB: "#15181B", gC: "#0B6E7F", gUseThird: false,
  gAngle: 135, gScope: "code",
  fgOpacity: 1, invert: false,

  /* background */
  bgMode: "solid", bg: "#EDEEE9", bgB: "#FFFFFF", bgAngle: 45,
  bgImage: null, bgImgOpacity: 1, bgImgBlur: 0,

  /* logo */
  logo: null, logoText: "", logoSize: 0.2, logoPad: 0.02,
  logoBackdrop: "circle", logoBackdropColor: "#EDEEE9",
  logoBorder: 0, logoBorderColor: "#15181B",
  logoRot: 0, logoOpacity: 1, logoGray: false, excavate: true,

  /* effects */
  shadow: false, shX: 0, shY: 2, shBlur: 3, shColor: "#000000", shOpacity: 0.35,
  glow: false, glowColor: "#B32B58", glowBlur: 4,
  stroke: 0, strokeColor: "#FFFFFF",
  noise: 0,

  /* frame + caption */
  frame: "none", frameColor: "#15181B", frameWidth: 6, framePad: 14, frameRadius: 0,
  caption: "SCAN ME", captionColor: "#FFFFFF", captionSize: 16,
  captionWeight: 600, captionSpacing: 0.14
};

const S = Object.assign({}, DEFAULTS);

/* icons/nom-nom.svg inlined so the preset carries its own logo — a file input
   cannot be populated from script, and the point of a preset is one click. */
const NOMNOM_ICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="15" fill="#211C18"/>' +
  '<circle cx="32" cy="33" r="19" fill="none" stroke="#B43E2C" stroke-width="9"/>' +
  '<circle cx="32" cy="33" r="9" fill="none" stroke="#BE8A60" stroke-width="5"/>' +
  '<circle cx="17" cy="17" r="8.5" fill="#211C18"/></svg>');

/* Presets are partial — they reset only the keys they care about, so a preset
   never silently drops your payload or module size. */
const PRESETS = {
  /* nom-nom: the calorie tracker's own palette. Modules are dots because the
     product's hero shape is a ring of them; the foreground runs cream at the
     centre out to salmon at the rim, which is the donut read outward. The
     salmon rim sits at 4.6:1 on the card colour — the floor a scanner wants —
     so the gradient never darkens past it. Level H carries the centre logo. */
  "nom-nom": {
    text: "https://nom-nom.sh-development.ru/",
    ecl: 3, minver: 0, mask: -1,
    cell: 10, quiet: 4, shape: "circle", scale: 0.86, mergeRuns: true,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0,
    eyeFrame: "circle", eyeBall: "circle",
    eyeColorMode: "custom", eyeFrameColor: "#C8695A", eyeBallColor: "#E9CFA9",
    eyePerCorner: false, alignOverride: false,
    fgMode: "radial", gA: "#EFDCC4", gB: "#C8695A", gUseThird: false,
    gScope: "code", fgOpacity: 1, invert: false,
    bgMode: "solid", bg: "#211C18",
    logo: NOMNOM_ICON, logoText: "", logoSize: 0.25, logoPad: 0.03,
    logoBackdrop: "none", logoBorder: 0, logoRot: 0, logoOpacity: 1,
    logoGray: false, excavate: true,
    noise: 0, stroke: 0, shadow: false, glow: false,
    frame: "bar", frameColor: "#B4472F", frameWidth: 0, framePad: 18, frameRadius: 20,
    caption: "nom-nom", captionColor: "#FFFFFF", captionSize: 30,
    captionWeight: 800, captionSpacing: 0
  },
  "Spec default": {
    shape: "square", scale: 1, radius: 0, eyeFrame: "square", eyeBall: "square",
    eyeColorMode: "inherit", fgMode: "solid", fg: "#000000", fgOpacity: 1,
    bgMode: "solid", bg: "#FFFFFF", quiet: 4, ecl: 1,
    logo: null, logoText: "", frame: "none", shadow: false, glow: false,
    noise: 0, stroke: 0, invert: false, falloff: "none",
    jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Soft dots": {
    shape: "circle", scale: 0.82, eyeFrame: "circle", eyeBall: "circle",
    fgMode: "solid", fg: "#1D2733", bgMode: "solid", bg: "#F4F6F8",
    eyeColorMode: "custom", eyeFrameColor: "#2E6BE6", eyeBallColor: "#1D2733",
    eyePerCorner: false, logo: null, logoText: "", frame: "none", noise: 0,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0, glow: false, shadow: false
  },
  "Fluid ink": {
    shape: "fluid", scale: 1, radius: 0.6,
    eyeFrame: "rounded", eyeFrameR: 0.4, eyeBall: "rounded", eyeBallR: 0.5,
    eyeColorMode: "inherit", fgMode: "solid", fg: "#14181D",
    bgMode: "solid", bg: "#EFEDE6", quiet: 4, noise: 0.18,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0,
    logo: null, logoText: "", frame: "none", shadow: false, glow: false, stroke: 0
  },
  "Gradient": {
    shape: "rounded", scale: 0.9, radius: 0.55,
    fgMode: "linear", gA: "#7B2FF7", gB: "#F107A3", gUseThird: true, gC: "#2E6BE6",
    gAngle: 135, gScope: "code", bgMode: "solid", bg: "#0E0B16",
    eyeFrame: "leaf", eyeFrameR: 0.5, eyeBall: "circle", eyeColorMode: "inherit",
    noise: 0, frame: "none", shadow: false, glow: false, stroke: 0,
    logo: null, logoText: "", falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Neon": {
    shape: "circle", scale: 0.68, fgMode: "solid", fg: "#54F0C8",
    bgMode: "solid", bg: "#08131A",
    glow: true, glowColor: "#1BE8B0", glowBlur: 5, shadow: false,
    eyeFrame: "circle", eyeBall: "circle", eyeColorMode: "custom",
    eyeFrameColor: "#FF4D9D", eyeBallColor: "#54F0C8", eyePerCorner: false,
    noise: 0, stroke: 0, logo: null, logoText: "", frame: "none",
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Ticket": {
    shape: "square", scale: 1, fgMode: "solid", fg: "#141414",
    bgMode: "solid", bg: "#FFFFFF", eyeFrame: "square", eyeBall: "square",
    eyeColorMode: "inherit", frame: "bottom", frameColor: "#B32B58",
    frameWidth: 0, framePad: 16, frameRadius: 8, caption: "SCAN FOR ENTRY",
    captionColor: "#FFFFFF", captionSize: 15, captionWeight: 800, captionSpacing: 0.18,
    noise: 0, logo: null, logoText: "", shadow: false, glow: false,
    stroke: 0, falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  }
};
