/* ==========================================================================
   Single mutable state object + presets. Every control writes into S,
   every render reads from it.
   ========================================================================== */

const DEFAULTS = {
  /* payload */
  text: "https://example.com/qr-lab",
  ecl: 2, minver: 0, mask: -1,

  /* geometry */
  cell: 10, quiet: 4, canvasRadius: 0,

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

/* Presets are partial — they reset only the keys they care about, so a preset
   never silently drops your payload or module size. */
const PRESETS = {
  "Spec default": {
    shape: "square", scale: 1, radius: 0, eyeFrame: "square", eyeBall: "square",
    eyeColorMode: "inherit", fgMode: "solid", fg: "#000000", fgOpacity: 1,
    bgMode: "solid", bg: "#FFFFFF", quiet: 4, canvasRadius: 0, ecl: 1,
    logo: null, logoText: "", frame: "none", shadow: false, glow: false,
    noise: 0, stroke: 0, invert: false, falloff: "none",
    jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Soft dots": {
    shape: "circle", scale: 0.82, eyeFrame: "circle", eyeBall: "circle",
    fgMode: "solid", fg: "#1D2733", bgMode: "solid", bg: "#F4F6F8", canvasRadius: 24,
    eyeColorMode: "custom", eyeFrameColor: "#2E6BE6", eyeBallColor: "#1D2733",
    eyePerCorner: false, logo: null, logoText: "", frame: "none", noise: 0,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0, glow: false, shadow: false
  },
  "Fluid ink": {
    shape: "fluid", scale: 1, radius: 0.6,
    eyeFrame: "rounded", eyeFrameR: 0.4, eyeBall: "rounded", eyeBallR: 0.5,
    eyeColorMode: "inherit", fgMode: "solid", fg: "#14181D",
    bgMode: "solid", bg: "#EFEDE6", quiet: 4, canvasRadius: 0, noise: 0.18,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0,
    logo: null, logoText: "", frame: "none", shadow: false, glow: false, stroke: 0
  },
  "Gradient": {
    shape: "rounded", scale: 0.9, radius: 0.55,
    fgMode: "linear", gA: "#7B2FF7", gB: "#F107A3", gUseThird: true, gC: "#2E6BE6",
    gAngle: 135, gScope: "code", bgMode: "solid", bg: "#0E0B16", canvasRadius: 20,
    eyeFrame: "leaf", eyeFrameR: 0.5, eyeBall: "circle", eyeColorMode: "inherit",
    noise: 0, frame: "none", shadow: false, glow: false, stroke: 0,
    logo: null, logoText: "", falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Neon": {
    shape: "circle", scale: 0.68, fgMode: "solid", fg: "#54F0C8",
    bgMode: "solid", bg: "#08131A", canvasRadius: 16,
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
    noise: 0, canvasRadius: 0, logo: null, logoText: "", shadow: false, glow: false,
    stroke: 0, falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Bars": {
    shape: "barV", mergeRuns: true, scale: 0.72, radius: 1,
    fgMode: "linear", gA: "#0B6E7F", gB: "#B32B58", gUseThird: false,
    gAngle: 90, gScope: "code", bgMode: "solid", bg: "#F5F5F0",
    eyeFrame: "thin", eyeBall: "square", eyeColorMode: "inherit",
    canvasRadius: 0, noise: 0, logo: null, logoText: "", frame: "none",
    shadow: false, glow: false, stroke: 0,
    falloff: "none", jitterRot: 0, jitterScale: 0, jitterPos: 0
  },
  "Scatter": {
    shape: "star", scale: 0.95, jitterRot: 30, jitterScale: 0.25, jitterPos: 0.06, seed: 42,
    falloff: "radial", falloffAmount: 0.3,
    fgMode: "radial", gA: "#B32B58", gB: "#F2B705", gUseThird: false, gScope: "code",
    bgMode: "solid", bg: "#171512", ecl: 3,
    eyeFrame: "dots", eyeBall: "dots", eyeColorMode: "custom",
    eyeFrameColor: "#F2B705", eyeBallColor: "#B32B58", eyePerCorner: false,
    noise: 0, canvasRadius: 0, logo: null, logoText: "", frame: "none",
    shadow: false, glow: false, stroke: 0
  }
};
