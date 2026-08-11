/* ==========================================================================
   Renderer — turns S + an encoded matrix into an SVG string.
   buildSVG() is pure: it reads S and returns { svg, w, h, info, notes, risk }.
   ========================================================================== */

function relLuminance(hex) {
  const h = hex.replace("#", "");
  const to = i => parseInt(h.substr(i, 2), 16) / 255;
  const f = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(to(0)) + 0.7152 * f(to(2)) + 0.0722 * f(to(4));
}
function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function buildSVG() {
  const qr = encodeQR(S.text || " ", S.ecl, S.minver, S.mask);
  if (qr.error) return { error: qr.error };

  const { mod, size, ver, mask } = qr;
  const u = S.cell, q = S.quiet, n = size + q * 2;
  const codePx = n * u;

  /* ---- outer metrics ---- */
  const hasFrame = S.frame !== "none";
  const fw = hasFrame ? S.frameWidth : 0;
  const fp = hasFrame ? S.framePad : 0;
  const capOn = ["bottom", "top", "pill", "bar"].includes(S.frame);
  /* The bar is a detached block rather than a band welded to the code, so it
     carries its own gap — one padding unit — above itself. */
  const barH = S.captionSize * 2.4;
  const capH = S.frame === "bar" ? barH + fp : capOn ? S.captionSize * 2.1 : 0;
  const W = codePx + 2 * (fw + fp);
  const H = codePx + 2 * (fw + fp) + capH;
  const codeX = fw + fp;
  const codeY = fw + fp + (S.frame === "top" ? capH : 0);

  /* Invert swaps the two roles rather than repainting — keeps the dark/light
     relationship explicit so the diagnostics can still reason about it. */
  let FG = S.fg, BG = S.bg;
  if (S.invert) { const t = FG; FG = BG; BG = t; }

  /* ---- excavation under the logo ---- */
  const draw = mod.map(r => r.slice());
  const logoOn = !!(S.logo || S.logoText);
  if (logoOn && S.excavate) {
    const c = size / 2, half = (S.logoSize * size) / 2 + S.logoPad * size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x + 0.5 > c - half && x + 0.5 < c + half && y + 0.5 > c - half && y + 0.5 < c + half) {
        draw[y][x] = false;
      }
    }
  }

  const inEye = (x, y) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

  /* alignment-pattern cells, for the optional recolour */
  const alignSet = new Set();
  if (S.alignOverride) {
    const ap = qr.align;
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        alignSet.add((ap[j] + dy) * size + (ap[i] + dx));
      }
    }
  }

  /* grid the fluid shape reads for neighbour tests — eyes excluded */
  const fgrid = draw.map((row, y) => row.map((v, x) => v && !inEye(x, y)));
  const off = codeX + q * u;
  const offY = codeY + q * u;

  const falloffMul = (x, y) => {
    if (S.falloff === "none") return 1;
    const c = (size - 1) / 2;
    const d = Math.hypot(x - c, y - c) / Math.hypot(c, c);
    let t = 1;
    switch (S.falloff) {
      case "radial":    t = 1 - d; break;
      case "radialInv": t = d; break;
      case "diagX":     t = (x + y) / (2 * (size - 1)); break;
      case "rowWave":   t = (Math.sin(y / size * Math.PI * 4) + 1) / 2; break;
      case "random":    t = hashRand(x, y, S.seed); break;
    }
    return 1 - S.falloffAmount * (1 - t);
  };

  /* ---- data modules ---- */
  let mods = "", tinted = "", drawn = 0;
  const barMode = (S.shape === "barH" || S.shape === "barV") && S.mergeRuns;

  if (barMode) {
    const horiz = S.shape === "barH";
    const thick = u * S.scale;
    const rr = Math.min(thick / 2, S.radius * thick / 2);
    for (let a = 0; a < size; a++) {
      let run = 0;
      for (let b = 0; b <= size; b++) {
        const on = b < size && (horiz ? fgrid[a][b] : fgrid[b][a]);
        if (on) { run++; drawn++; }
        else if (run > 0) {
          const start = b - run;
          const x = horiz ? off + start * u : off + a * u + (u - thick) / 2;
          const y = horiz ? offY + a * u + (u - thick) / 2 : offY + start * u;
          const w = horiz ? run * u : thick;
          const h = horiz ? thick : run * u;
          mods += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(rr)}"/>`;
          run = 0;
        }
      }
    }
  } else {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!draw[y][x] || inEye(x, y)) continue;
      drawn++;

      let sc = S.scale * falloffMul(x, y);
      let dx = 0, dy = 0, rot = 0;
      if (S.jitterScale || S.jitterRot || S.jitterPos) {
        const r1 = hashRand(x, y, S.seed);
        const r2 = hashRand(x + 977, y, S.seed);
        const r3 = hashRand(x, y + 977, S.seed);
        sc *= 1 + (r1 - 0.5) * 2 * S.jitterScale;
        rot = (r2 - 0.5) * 2 * S.jitterRot;
        dx = (r2 - 0.5) * 2 * S.jitterPos * u;
        dy = (r3 - 0.5) * 2 * S.jitterPos * u;
      }

      const half = Math.max(0.01, u * sc / 2);
      const cx = off + x * u + u / 2 + dx;
      const cy = offY + y * u + u / 2 + dy;
      const el = moduleSVG(S.shape, cx, cy, half, S.radius, rot, fgrid, x, y);

      if (alignSet.has(y * size + x)) tinted += el;
      else mods += el;
    }
  }

  /* ---- finder eyes ---- */
  const corners = [[0, 0], [size - 7, 0], [0, size - 7]];
  const frameCols = S.eyeColorMode === "custom"
    ? (S.eyePerCorner ? [S.eyeC1, S.eyeC2, S.eyeC3]
                      : [S.eyeFrameColor, S.eyeFrameColor, S.eyeFrameColor])
    : [null, null, null];

  let eyes = "";
  corners.forEach(([ex, ey], i) => {
    const px = off + ex * u, py = offY + ey * u;
    const fAttr = frameCols[i] ? ` fill="${frameCols[i]}"` : "";
    const bAttr = S.eyeColorMode === "custom" ? ` fill="${S.eyeBallColor}"` : "";
    eyes += `<g${fAttr}>${eyeFrameSVG(S.eyeFrame, px, py, u, S.eyeFrameR)}</g>`;
    eyes += `<g${bAttr}>${eyeBallSVG(S.eyeBall, px, py, u, S.eyeBallR)}</g>`;
  });

  /* ---- defs ---- */
  let defs = "";
  const stops =
    `<stop offset="0" stop-color="${S.gA}"/>` +
    (S.gUseThird ? `<stop offset="0.5" stop-color="${S.gC}"/>` : "") +
    `<stop offset="1" stop-color="${S.gB}"/>`;

  if (S.fgMode !== "solid") {
    const perModule = S.gScope === "module";
    if (S.fgMode === "linear") {
      const a = S.gAngle * Math.PI / 180;
      if (perModule) {
        defs += `<linearGradient id="fgg" x1="${n2(0.5 - Math.cos(a) / 2)}" y1="${n2(0.5 - Math.sin(a) / 2)}"` +
                ` x2="${n2(0.5 + Math.cos(a) / 2)}" y2="${n2(0.5 + Math.sin(a) / 2)}">${stops}</linearGradient>`;
      } else {
        const cx = codeX + codePx / 2, cy = codeY + codePx / 2, r = codePx / 2;
        defs += `<linearGradient id="fgg" gradientUnits="userSpaceOnUse"` +
                ` x1="${n2(cx - Math.cos(a) * r)}" y1="${n2(cy - Math.sin(a) * r)}"` +
                ` x2="${n2(cx + Math.cos(a) * r)}" y2="${n2(cy + Math.sin(a) * r)}">${stops}</linearGradient>`;
      }
    } else {
      if (perModule) {
        defs += `<radialGradient id="fgg" cx="0.5" cy="0.5" r="0.7">${stops}</radialGradient>`;
      } else {
        defs += `<radialGradient id="fgg" gradientUnits="userSpaceOnUse"` +
                ` cx="${n2(codeX + codePx / 2)}" cy="${n2(codeY + codePx / 2)}"` +
                ` r="${n2(codePx * 0.7)}">${stops}</radialGradient>`;
      }
    }
  }

  if (S.bgMode === "linear") {
    const a = S.bgAngle * Math.PI / 180;
    const cx = codeX + codePx / 2, cy = codeY + codePx / 2, r = codePx / 2;
    defs += `<linearGradient id="bgg" gradientUnits="userSpaceOnUse"` +
            ` x1="${n2(cx - Math.cos(a) * r)}" y1="${n2(cy - Math.sin(a) * r)}"` +
            ` x2="${n2(cx + Math.cos(a) * r)}" y2="${n2(cy + Math.sin(a) * r)}">` +
            `<stop offset="0" stop-color="${BG}"/><stop offset="1" stop-color="${S.bgB}"/></linearGradient>`;
  }

  const filters = [];
  if (S.shadow) {
    defs += `<filter id="fsh" x="-30%" y="-30%" width="160%" height="160%">` +
            `<feDropShadow dx="${n2(S.shX)}" dy="${n2(S.shY)}" stdDeviation="${n2(S.shBlur)}"` +
            ` flood-color="${S.shColor}" flood-opacity="${n2(S.shOpacity)}"/></filter>`;
    filters.push("url(#fsh)");
  }
  if (S.glow) {
    defs += `<filter id="fgl" x="-40%" y="-40%" width="180%" height="180%">` +
            `<feDropShadow dx="0" dy="0" stdDeviation="${n2(S.glowBlur)}"` +
            ` flood-color="${S.glowColor}" flood-opacity="0.9"/></filter>`;
    filters.push("url(#fgl)");
  }
  if (S.bgImage && S.bgImgBlur > 0) {
    defs += `<filter id="fbi"><feGaussianBlur stdDeviation="${n2(S.bgImgBlur)}"/></filter>`;
  }
  if (S.noise > 0) {
    defs += `<filter id="fnz" x="0" y="0" width="100%" height="100%">` +
            `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/>` +
            `<feColorMatrix type="saturate" values="0"/></filter>`;
  }
  if (S.bgImage) {
    defs += `<clipPath id="bgclip"><rect x="${n2(codeX)}" y="${n2(codeY)}" ` +
            `width="${n2(codePx)}" height="${n2(codePx)}"/></clipPath>`;
  }

  /* ---- background ----
     Deliberately square. Rounding here cuts four notches out of the plate that
     show whatever sits behind the code, so the background never matches the
     surface it is placed on. Rounding belongs to the shapes drawn on top. */
  let bg = "";
  if (S.bgMode !== "none") {
    /* Framed, the background becomes a plate behind the whole composition —
       otherwise the padding and anything sitting in it float on transparency. */
    const bx = hasFrame ? fw : codeX, by = hasFrame ? fw : codeY;
    const bw = hasFrame ? W - 2 * fw : codePx, bh = hasFrame ? H - 2 * fw : codePx;
    bg += `<rect x="${n2(bx)}" y="${n2(by)}" width="${n2(bw)}" height="${n2(bh)}"` +
          ` fill="${S.bgMode === "linear" ? "url(#bgg)" : BG}"/>`;
  }
  if (S.bgImage) {
    bg += `<g clip-path="url(#bgclip)" opacity="${n2(S.bgImgOpacity)}"` +
          (S.bgImgBlur > 0 ? ` filter="url(#fbi)"` : "") + `>` +
          `<image href="${S.bgImage}" x="${n2(codeX)}" y="${n2(codeY)}"` +
          ` width="${n2(codePx)}" height="${n2(codePx)}" preserveAspectRatio="xMidYMid slice"/></g>`;
  }
  if (S.noise > 0) {
    bg += `<rect x="${n2(codeX)}" y="${n2(codeY)}" width="${n2(codePx)}" height="${n2(codePx)}"` +
          ` filter="url(#fnz)" opacity="${n2(S.noise)}"` +
          ` style="mix-blend-mode:multiply"/>`;
  }

  /* ---- frame + caption ---- */
  let frame = "", caption = "";
  const CAPTION_FONT = "-apple-system, Helvetica Neue, Arial, sans-serif";
  if (hasFrame) {
    if (fw > 0) {
      frame += `<rect x="${n2(fw / 2)}" y="${n2(fw / 2)}" width="${n2(W - fw)}" height="${n2(H - fw)}"` +
               ` rx="${S.frameRadius}" fill="none" stroke="${S.frameColor}" stroke-width="${n2(fw)}"/>`;
    }
    if (S.frame === "bottom" || S.frame === "top") {
      const barY = S.frame === "bottom" ? H - capH - fw : fw;
      frame += `<rect x="${n2(fw)}" y="${n2(barY)}" width="${n2(W - 2 * fw)}" height="${n2(capH)}"` +
               ` fill="${S.frameColor}"/>`;
      const ty = barY + capH / 2 + S.captionSize * 0.35;
      caption = `<text x="${n2(W / 2)}" y="${n2(ty)}" text-anchor="middle" fill="${S.captionColor}"` +
                ` font-family="${CAPTION_FONT}" font-size="${S.captionSize}"` +
                ` font-weight="${S.captionWeight}" letter-spacing="${n2(S.captionSpacing * S.captionSize)}"` +
                `>${esc(S.caption)}</text>`;
    }
    if (S.frame === "bar") {
      const bx = fw + fp, by = H - fw - fp - barH, bw = W - 2 * (fw + fp);
      frame += `<rect x="${n2(bx)}" y="${n2(by)}" width="${n2(bw)}" height="${n2(barH)}"` +
               ` rx="${n2(Math.min(S.frameRadius, barH / 2))}" fill="${S.frameColor}"/>`;
      caption = `<text x="${n2(W / 2)}" y="${n2(by + barH / 2 + S.captionSize * 0.35)}"` +
                ` text-anchor="middle" fill="${S.captionColor}" font-family="${CAPTION_FONT}"` +
                ` font-size="${S.captionSize}" font-weight="${S.captionWeight}"` +
                ` letter-spacing="${n2(S.captionSpacing * S.captionSize)}">${esc(S.caption)}</text>`;
    }

    if (S.frame === "pill") {
      const pw = Math.max(S.caption.length * S.captionSize * 0.72, 80);
      const ph = capH * 0.78;
      const py = H - capH + (capH - ph) / 2;
      frame += `<rect x="${n2((W - pw) / 2)}" y="${n2(py)}" width="${n2(pw)}" height="${n2(ph)}"` +
               ` rx="${n2(ph / 2)}" fill="${S.frameColor}"/>`;
      caption = `<text x="${n2(W / 2)}" y="${n2(py + ph / 2 + S.captionSize * 0.35)}" text-anchor="middle"` +
                ` fill="${S.captionColor}" font-family="${CAPTION_FONT}" font-size="${S.captionSize}"` +
                ` font-weight="${S.captionWeight}" letter-spacing="${n2(S.captionSpacing * S.captionSize)}"` +
                `>${esc(S.caption)}</text>`;
    }
  }

  /* ---- logo ---- */
  let logo = "";
  if (logoOn) {
    const cx = codeX + codePx / 2, cy = codeY + codePx / 2;
    const sz = S.logoSize * codePx, pad = S.logoPad * codePx, box = sz + pad * 2;
    const rot = S.logoRot ? ` transform="rotate(${S.logoRot} ${n2(cx)} ${n2(cy)})"` : "";

    let back = "";
    if (S.logoBackdrop !== "none") {
      const r = S.logoBackdrop === "circle" ? box / 2 : S.logoBackdrop === "rounded" ? box * 0.18 : 0;
      back = `<rect x="${n2(cx - box / 2)}" y="${n2(cy - box / 2)}" width="${n2(box)}" height="${n2(box)}"` +
             ` rx="${n2(r)}" fill="${S.logoBackdropColor}"` +
             (S.logoBorder > 0 ? ` stroke="${S.logoBorderColor}" stroke-width="${n2(S.logoBorder)}"` : "") + `/>`;
    }

    let art = "";
    if (S.logo) {
      art = `<image href="${S.logo}" x="${n2(cx - sz / 2)}" y="${n2(cy - sz / 2)}"` +
            ` width="${n2(sz)}" height="${n2(sz)}" preserveAspectRatio="xMidYMid meet"` +
            (S.logoGray ? ` style="filter:grayscale(1)"` : "") + `/>`;
    } else if (S.logoText) {
      art = `<text x="${n2(cx)}" y="${n2(cy + sz * 0.36)}" text-anchor="middle" font-size="${n2(sz)}"` +
            ` font-family="${CAPTION_FONT}" font-weight="700" fill="${FG}">${esc(S.logoText)}</text>`;
    }
    logo = `<g opacity="${n2(S.logoOpacity)}"${rot}>${back}${art}</g>`;
  }

  /* ---- assemble ---- */
  const fgFill = S.fgMode === "solid" ? FG : "url(#fgg)";
  const strokeAttr = S.stroke > 0
    ? ` stroke="${S.strokeColor}" stroke-width="${n2(S.stroke)}" stroke-linejoin="round"` : "";
  const filterAttr = filters.length ? ` filter="${filters.join(" ")}"` : "";
  const tintedGroup = tinted ? `<g fill="${S.alignColor}">${tinted}</g>` : "";

  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="${n2(W)}" height="${n2(H)}" viewBox="0 0 ${n2(W)} ${n2(H)}" role="img" aria-label="QR code encoding ${esc(S.text).slice(0, 80)}">
<defs>${defs}</defs>
${bg}
<g fill="${fgFill}" opacity="${n2(S.fgOpacity)}"${strokeAttr}${filterAttr}>${mods}${eyes}${tintedGroup}</g>
${logo}
${frame}${caption}
</svg>`;

  return {
    svg, w: W, h: H,
    info: { ver, size, mask, bytes: qr.bytes, cap: qr.cap, drawn },
    diag: diagnose(qr, FG, BG, logoOn)
  };
}

/* --------------------------------------------------------------------------
   Scannability heuristics. Each finding carries a weight; the total picks the
   verdict. These are conservative — they flag risk, they don't prove failure.
   -------------------------------------------------------------------------- */
function diagnose(qr, FG, BG, logoOn) {
  const notes = [];
  let risk = 0;
  const flag = (weight, text) => { risk += weight; if (text) notes.push(text); };

  if (S.invert) {
    flag(1, "Inverted codes are rejected by some older and industrial scanners. Modern phone cameras handle them.");
  }

  const fgSample = S.fgMode === "solid" ? FG : S.gA;
  const bgSample = S.bgMode === "none" ? "#FFFFFF" : BG;
  const cr = contrastRatio(fgSample, bgSample);
  if (cr < 3) flag(3, `Contrast is ${cr.toFixed(1)}:1. Scanners want at least 4.5:1 between modules and background.`);
  else if (cr < 4.5) flag(1, `Contrast ${cr.toFixed(1)}:1 works in good light and struggles in poor light.`);

  if (logoOn) {
    const cover = Math.pow(S.logoSize + S.logoPad * 2, 2) * 100;
    const budget = qr.ecPct;
    if (cover > budget) {
      flag(3, `Logo covers about ${cover.toFixed(0)}% of the code, but level ${"LMQH"[S.ecl]} only recovers about ${budget}%. Raise error correction or shrink the logo.`);
    } else if (cover > budget * 0.6) {
      flag(1, `Logo covers about ${cover.toFixed(0)}% of a ${budget}% budget, leaving little room for print damage or glare.`);
    }
  }

  if (S.quiet < 4) flag(2, "Quiet zone is under 4 modules. That margin is part of the spec and the first thing cheap scanners miss.");
  if (S.scale < 0.6) flag(2, "Fill ratio under 60% leaves modules too small to sample reliably.");
  else if (S.scale < 0.75) flag(1);
  if (S.jitterPos > 0.15) flag(2, "Position jitter above 0.15 pushes modules off the sampling grid.");
  if (S.cell < 4) flag(1, "Below 4px per module, print and screen resampling start eating the code.");
  if (S.fgOpacity < 0.8) flag(2, "Foreground opacity under 80% washes out module contrast.");
  if (S.bgImage && S.bgImgOpacity > 0.5 && S.bgImgBlur < 3) {
    flag(1, "A sharp background image behind the code confuses edge detection. Blur it or lower its opacity.");
  }
  if (S.stroke > 1.5) flag(1, "A thick module outline in the background colour eats into module area.");

  if (!notes.length) notes.push("Every setting sits inside spec tolerance. Still worth one real-camera test before you print.");
  return { risk, notes };
}
