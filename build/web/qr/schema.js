/* ==========================================================================
   Declarative control schema. app.js turns this into DOM; adding a knob means
   adding a line here plus a default in state.js.

   type: text | area | select | range | color | colors | check | file | divider
   when: (S) => boolean   — hides the row when false
   ========================================================================== */

const sel = (id, label, opts, extra) => Object.assign({ id, label, type: "select", opts }, extra || {});
const rng = (id, label, min, max, step, extra) =>
  Object.assign({ id, label, type: "range", min, max, step }, extra || {});

const CAPTION_ON = s => ["bottom", "top", "pill", "bar"].includes(s.frame);

const SECTIONS = [
{ id: "payload", title: "Payload", open: true, controls: [
  { id: "text", label: "Content", type: "area" },
  sel("ecl", "Error correction",
    [[0, "L — recovers 7%"], [1, "M — 15%"], [2, "Q — 25%"], [3, "H — 30%"]], { num: true }),
  sel("minver", "Minimum version",
    [[0, "Auto"]].concat(Array.from({ length: 40 }, (_, i) => [i + 1, "v" + (i + 1)])), { num: true }),
  sel("mask", "Mask pattern",
    [[-1, "Auto (lowest penalty)"], [0, "0"], [1, "1"], [2, "2"], [3, "3"],
     [4, "4"], [5, "5"], [6, "6"], [7, "7"]], { num: true })
]},

{ id: "geometry", title: "Geometry", controls: [
  rng("cell", "Module size", 2, 40, 1, { unit: "px" }),
  rng("quiet", "Quiet zone", 0, 12, 1, { unit: " mod" })
]},

{ id: "modules", title: "Module shape", open: true, controls: [
  sel("shape", "Shape", MODULE_SHAPES),
  { id: "mergeRuns", label: "Merge into continuous strokes", type: "check",
    when: s => s.shape === "barH" || s.shape === "barV" },
  rng("scale", "Fill ratio", 0.2, 1.35, 0.01),
  rng("radius", "Corner radius", 0, 1, 0.01,
    { when: s => ["rounded", "leaf", "leaf2", "fluid", "barH", "barV"].includes(s.shape) }),

  { type: "divider" },
  sel("falloff", "Size falloff", [
    ["none", "None"], ["radial", "Radial — larger centre"], ["radialInv", "Radial — larger edges"],
    ["diagX", "Diagonal"], ["rowWave", "Wave by row"], ["random", "Random"]]),
  rng("falloffAmount", "Falloff strength", 0, 1, 0.01, { when: s => s.falloff !== "none" }),

  { type: "divider" },
  rng("jitterRot", "Jitter — rotation", 0, 45, 1, { unit: "°" }),
  rng("jitterScale", "Jitter — scale", 0, 0.6, 0.01),
  rng("jitterPos", "Jitter — position", 0, 0.4, 0.01),
  rng("seed", "Random seed", 1, 999, 1,
    { when: s => s.jitterRot || s.jitterScale || s.jitterPos || s.falloff === "random" })
]},

{ id: "eyes", title: "Finder eyes", controls: [
  sel("eyeFrame", "Outer frame", EYE_FRAMES),
  rng("eyeFrameR", "Frame radius", 0, 1, 0.01,
    { when: s => ["rounded", "leaf", "leaf2", "cut"].includes(s.eyeFrame) }),
  sel("eyeBall", "Inner ball", EYE_BALLS),
  rng("eyeBallR", "Ball radius", 0, 1, 0.01,
    { when: s => ["rounded", "leaf"].includes(s.eyeBall) }),

  { type: "divider" },
  sel("eyeColorMode", "Colouring",
    [["inherit", "Inherit from modules"], ["custom", "Custom frame + ball"]]),
  { id: "eyeFrameColor", label: "Frame colour", type: "color",
    when: s => s.eyeColorMode === "custom" && !s.eyePerCorner },
  { id: "eyeBallColor", label: "Ball colour", type: "color", when: s => s.eyeColorMode === "custom" },
  { id: "eyePerCorner", label: "Different frame colour per corner", type: "check",
    when: s => s.eyeColorMode === "custom" },
  { id: "eyeTriple", label: "Top-left / top-right / bottom-left", type: "colors",
    keys: ["eyeC1", "eyeC2", "eyeC3"],
    when: s => s.eyeColorMode === "custom" && s.eyePerCorner },

  { type: "divider" },
  { id: "alignOverride", label: "Recolour alignment patterns", type: "check" },
  { id: "alignColor", label: "Alignment colour", type: "color", when: s => s.alignOverride }
]},

{ id: "foreground", title: "Colour — foreground", open: true, controls: [
  sel("fgMode", "Fill", [["solid", "Solid"], ["linear", "Linear gradient"], ["radial", "Radial gradient"]]),
  { id: "fg", label: "Colour", type: "color", when: s => s.fgMode === "solid" },
  { id: "gA", label: "Stop 1", type: "color", when: s => s.fgMode !== "solid" },
  { id: "gUseThird", label: "Add middle stop", type: "check", when: s => s.fgMode !== "solid" },
  { id: "gC", label: "Stop 2 (middle)", type: "color", when: s => s.fgMode !== "solid" && s.gUseThird },
  { id: "gB", label: "Final stop", type: "color", when: s => s.fgMode !== "solid" },
  rng("gAngle", "Gradient angle", 0, 360, 1, { unit: "°", when: s => s.fgMode === "linear" }),
  sel("gScope", "Gradient spans",
    [["code", "Whole code"], ["module", "Each module"]], { when: s => s.fgMode !== "solid" }),
  rng("fgOpacity", "Opacity", 0.1, 1, 0.01),
  { id: "invert", label: "Invert (light code on dark)", type: "check" }
]},

{ id: "background", title: "Colour — background", controls: [
  sel("bgMode", "Fill", [["solid", "Solid"], ["linear", "Linear gradient"], ["none", "Transparent"]]),
  { id: "bg", label: "Colour", type: "color", when: s => s.bgMode !== "none" },
  { id: "bgB", label: "Second stop", type: "color", when: s => s.bgMode === "linear" },
  rng("bgAngle", "Gradient angle", 0, 360, 1, { unit: "°", when: s => s.bgMode === "linear" }),

  { type: "divider" },
  { id: "bgImage", label: "Background image", type: "file" },
  rng("bgImgOpacity", "Image opacity", 0, 1, 0.01, { when: s => !!s.bgImage }),
  rng("bgImgBlur", "Image blur", 0, 10, 0.5, { unit: "px", when: s => !!s.bgImage })
]},

{ id: "logo", title: "Centre logo", controls: [
  { id: "logo", label: "Image", type: "file" },
  { id: "logoText", label: "…or text / emoji", type: "text" },
  rng("logoSize", "Size", 0.05, 0.45, 0.005, { pct: true }),
  rng("logoPad", "Padding", 0, 0.1, 0.002, { pct: true }),
  { id: "excavate", label: "Clear modules underneath", type: "check" },

  { type: "divider" },
  sel("logoBackdrop", "Backdrop",
    [["none", "None"], ["circle", "Circle"], ["square", "Square"], ["rounded", "Rounded"]]),
  { id: "logoBackdropColor", label: "Backdrop colour", type: "color", when: s => s.logoBackdrop !== "none" },
  rng("logoBorder", "Backdrop border", 0, 8, 0.5, { unit: "px", when: s => s.logoBackdrop !== "none" }),
  { id: "logoBorderColor", label: "Border colour", type: "color",
    when: s => s.logoBackdrop !== "none" && s.logoBorder > 0 },

  { type: "divider" },
  rng("logoRot", "Rotation", -45, 45, 1, { unit: "°" }),
  rng("logoOpacity", "Opacity", 0.1, 1, 0.01),
  { id: "logoGray", label: "Greyscale", type: "check" }
]},

{ id: "effects", title: "Effects", controls: [
  { id: "shadow", label: "Drop shadow", type: "check" },
  rng("shX", "Shadow X", -10, 10, 0.5, { unit: "px", when: s => s.shadow }),
  rng("shY", "Shadow Y", -10, 10, 0.5, { unit: "px", when: s => s.shadow }),
  rng("shBlur", "Shadow blur", 0, 12, 0.5, { unit: "px", when: s => s.shadow }),
  { id: "shColor", label: "Shadow colour", type: "color", when: s => s.shadow },
  rng("shOpacity", "Shadow opacity", 0, 1, 0.01, { when: s => s.shadow }),

  { type: "divider" },
  { id: "glow", label: "Glow", type: "check" },
  { id: "glowColor", label: "Glow colour", type: "color", when: s => s.glow },
  rng("glowBlur", "Glow radius", 0, 14, 0.5, { unit: "px", when: s => s.glow }),

  { type: "divider" },
  rng("stroke", "Module outline", 0, 3, 0.1, { unit: "px" }),
  { id: "strokeColor", label: "Outline colour", type: "color", when: s => s.stroke > 0 },
  rng("noise", "Paper grain", 0, 0.6, 0.01)
]},

{ id: "frame", title: "Frame & caption", controls: [
  sel("frame", "Frame", [
    ["none", "None"], ["border", "Border only"], ["bottom", "Caption below"],
    ["top", "Caption above"], ["pill", "Pill badge below"], ["bar", "Label bar below"]]),
  { id: "frameColor", label: "Frame colour", type: "color", when: s => s.frame !== "none" },
  rng("frameWidth", "Frame thickness", 0, 20, 1, { unit: "px", when: s => s.frame !== "none" }),
  rng("framePad", "Frame padding", 0, 40, 1, { unit: "px", when: s => s.frame !== "none" }),
  rng("frameRadius", "Frame radius", 0, 60, 1, { unit: "px", when: s => s.frame !== "none" }),

  { type: "divider" },
  { id: "caption", label: "Caption", type: "text", when: CAPTION_ON },
  { id: "captionColor", label: "Caption colour", type: "color", when: CAPTION_ON },
  rng("captionSize", "Caption size", 8, 40, 1, { unit: "px", when: CAPTION_ON }),
  sel("captionWeight", "Caption weight",
    [[400, "Regular"], [600, "Semibold"], [800, "Bold"]], { num: true, when: CAPTION_ON }),
  rng("captionSpacing", "Letter spacing", 0, 0.4, 0.01, { when: CAPTION_ON })
]}
];
