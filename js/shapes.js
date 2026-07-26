/* ==========================================================================
   Shape vocabulary — every function returns raw SVG element markup.
   Coordinates are already in export pixels; fill is inherited from a parent <g>.
   ========================================================================== */

const n2 = v => Math.round(v * 1000) / 1000;

const esc = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* deterministic per-coordinate noise so re-renders are stable */
function hashRand(x, y, seed) {
  let a = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/* rounded-rect path with independent corner radii */
function roundRectPath(x0, y0, w, h, tl, tr, br, bl) {
  const x1 = x0 + w, y1 = y0 + h;
  let d = `M${n2(x0 + tl)} ${n2(y0)}H${n2(x1 - tr)}`;
  if (tr) d += `A${n2(tr)} ${n2(tr)} 0 0 1 ${n2(x1)} ${n2(y0 + tr)}`;
  d += `V${n2(y1 - br)}`;
  if (br) d += `A${n2(br)} ${n2(br)} 0 0 1 ${n2(x1 - br)} ${n2(y1)}`;
  d += `H${n2(x0 + bl)}`;
  if (bl) d += `A${n2(bl)} ${n2(bl)} 0 0 1 ${n2(x0)} ${n2(y1 - bl)}`;
  d += `V${n2(y0 + tl)}`;
  if (tl) d += `A${n2(tl)} ${n2(tl)} 0 0 1 ${n2(x0 + tl)} ${n2(y0)}`;
  return d + "Z";
}

const MODULE_SHAPES = [
  ["square", "Square"], ["rounded", "Rounded"], ["circle", "Dot"],
  ["diamond", "Diamond"], ["star", "Star"], ["plus", "Plus"], ["cross", "Cross ×"],
  ["leaf", "Leaf"], ["leaf2", "Leaf (mirrored)"], ["ring", "Ring"], ["tri", "Triangle"],
  ["barH", "Bars — horizontal"], ["barV", "Bars — vertical"],
  ["fluid", "Fluid / connected"]
];

const EYE_FRAMES = [
  ["square", "Square"], ["rounded", "Rounded"], ["circle", "Circle"],
  ["leaf", "Leaf"], ["leaf2", "Leaf (mirrored)"], ["cut", "Cut corner"],
  ["dots", "Made of dots"], ["thin", "Hairline"]
];

const EYE_BALLS = [
  ["square", "Square"], ["rounded", "Rounded"], ["circle", "Circle"],
  ["diamond", "Diamond"], ["leaf", "Leaf"], ["dots", "Dot cluster"],
  ["ring", "Ring"], ["plus", "Plus"]
];

/* --------------------------------------------------------------------------
   One data module. `grid` + gx/gy are only used by the fluid shape, which
   rounds a corner when both orthogonal neighbours are empty.
   -------------------------------------------------------------------------- */
function moduleSVG(kind, cx, cy, half, radius, rot, grid, gx, gy) {
  const h = half, w = h * 2;
  const x0 = cx - h, y0 = cy - h, x1 = cx + h, y1 = cy + h;
  const t = rot ? ` transform="rotate(${n2(rot)} ${n2(cx)} ${n2(cy)})"` : "";

  switch (kind) {
    case "circle":
      return `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(h)}"/>`;

    case "ring":
      return `<path fill-rule="evenodd" d="M${n2(cx)} ${n2(y0)}a${n2(h)} ${n2(h)} 0 1 0 0.01 0Z` +
             `M${n2(cx)} ${n2(y0 + h * 0.45)}a${n2(h * 0.55)} ${n2(h * 0.55)} 0 1 1 -0.01 0Z"/>`;

    case "diamond":
      return `<path d="M${n2(cx)} ${n2(y0)}L${n2(x1)} ${n2(cy)}L${n2(cx)} ${n2(y1)}L${n2(x0)} ${n2(cy)}Z"${t}/>`;

    case "tri":
      return `<path d="M${n2(cx)} ${n2(y0)}L${n2(x1)} ${n2(y1)}L${n2(x0)} ${n2(y1)}Z"${t}/>`;

    case "star": {
      const ri = h * 0.42, pts = [];
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? ri : h;
        pts.push(`${n2(cx + Math.cos(a) * rr)} ${n2(cy + Math.sin(a) * rr)}`);
      }
      return `<path d="M${pts.join("L")}Z"${t}/>`;
    }

    case "plus": case "cross": {
      const a = h * 0.36;
      const d = `M${n2(cx - a)} ${n2(y0)}H${n2(cx + a)}V${n2(cy - a)}H${n2(x1)}V${n2(cy + a)}` +
                `H${n2(cx + a)}V${n2(y1)}H${n2(cx - a)}V${n2(cy + a)}H${n2(x0)}V${n2(cy - a)}H${n2(cx - a)}Z`;
      const turn = kind === "cross" ? 45 + rot : rot;
      const tt = turn ? ` transform="rotate(${n2(turn)} ${n2(cx)} ${n2(cy)})"` : "";
      return `<path d="${d}"${tt}/>`;
    }

    case "leaf": case "leaf2": {
      const r = Math.min(h, radius * w * 0.5);
      const a = kind === "leaf2" ? 0 : r, b = kind === "leaf2" ? r : 0;
      return `<path d="${roundRectPath(x0, y0, w, w, a, b, a, b)}"${t}/>`;
    }

    case "fluid": {
      const r = Math.min(h, radius * w * 0.5);
      const on = (dx, dy) => {
        const yy = gy + dy, xx = gx + dx;
        return yy >= 0 && yy < grid.length && xx >= 0 && xx < grid.length && grid[yy][xx];
      };
      const tl = (!on(0, -1) && !on(-1, 0)) ? r : 0;
      const tr = (!on(0, -1) && !on(1, 0)) ? r : 0;
      const br = (!on(0, 1) && !on(1, 0)) ? r : 0;
      const bl = (!on(0, 1) && !on(-1, 0)) ? r : 0;
      return `<path d="${roundRectPath(x0, y0, w, w, tl, tr, br, bl)}"/>`;
    }

    case "barH": case "barV": {
      /* unmerged fallback: a stub of a bar, still centred in its cell */
      const thick = w, long = h * 2;
      const bw = kind === "barH" ? long : thick;
      const bh = kind === "barH" ? thick : long;
      const r = Math.min(bw, bh) * 0.5 * radius;
      return `<rect x="${n2(cx - bw / 2)}" y="${n2(cy - bh / 2)}" width="${n2(bw)}" height="${n2(bh)}" rx="${n2(r)}"${t}/>`;
    }

    case "square":
      return `<rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(w)}" height="${n2(w)}"${t}/>`;

    case "rounded":
    default: {
      const r = Math.min(h, radius * w * 0.5);
      return `<rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(w)}" height="${n2(w)}" rx="${n2(r)}"${t}/>`;
    }
  }
}

/* --------------------------------------------------------------------------
   Finder frame: the 7x7 ring. px/py is its top-left corner, u = module px.
   -------------------------------------------------------------------------- */
function eyeFrameSVG(kind, px, py, u, radius) {
  const W = 7 * u, th = u;                 // frame is exactly one module thick
  const x0 = px, y0 = py, x1 = px + W, y1 = py + W;
  const r = radius * W * 0.5;

  switch (kind) {
    case "circle":
      return `<path fill-rule="evenodd" ` +
        `d="M${n2(x0 + W / 2)} ${n2(y0)}a${n2(W / 2)} ${n2(W / 2)} 0 1 0 0.01 0Z` +
        `M${n2(x0 + W / 2)} ${n2(y0 + th)}a${n2(W / 2 - th)} ${n2(W / 2 - th)} 0 1 1 -0.01 0Z"/>`;

    case "dots": {
      let s = "";
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
        if (i === 0 || j === 0 || i === 6 || j === 6) {
          s += `<circle cx="${n2(x0 + (j + 0.5) * u)}" cy="${n2(y0 + (i + 0.5) * u)}" r="${n2(u * 0.42)}"/>`;
        }
      }
      return s;
    }

    case "thin": {
      const t2 = u * 0.5;
      return `<path fill-rule="evenodd" d="M${n2(x0)} ${n2(y0)}H${n2(x1)}V${n2(y1)}H${n2(x0)}Z` +
             `M${n2(x0 + t2)} ${n2(y0 + t2)}V${n2(y1 - t2)}H${n2(x1 - t2)}V${n2(y0 + t2)}Z"/>`;
    }

    case "cut": {
      const c = r, ci = Math.max(0, c - th);
      const outer = `M${n2(x0 + c)} ${n2(y0)}H${n2(x1)}V${n2(y1 - c)}L${n2(x1 - c)} ${n2(y1)}H${n2(x0)}V${n2(y0 + c)}Z`;
      const inner = `M${n2(x0 + th + ci)} ${n2(y0 + th)}H${n2(x1 - th)}V${n2(y1 - th - ci)}` +
                    `L${n2(x1 - th - ci)} ${n2(y1 - th)}H${n2(x0 + th)}V${n2(y0 + th + ci)}Z`;
      return `<path fill-rule="evenodd" d="${outer} ${inner}"/>`;
    }

    case "leaf": case "leaf2": {
      const a = kind === "leaf2" ? 0 : r, b = kind === "leaf2" ? r : 0;
      const ai = Math.max(0, a - th), bi = Math.max(0, b - th);
      return `<path fill-rule="evenodd" d="${roundRectPath(x0, y0, W, W, a, b, a, b)} ` +
             `${roundRectPath(x0 + th, y0 + th, W - 2 * th, W - 2 * th, ai, bi, ai, bi)}"/>`;
    }

    case "square":
    case "rounded":
    default: {
      const c = kind === "square" ? 0 : r;
      const ci = Math.max(0, c - th);
      return `<path fill-rule="evenodd" d="${roundRectPath(x0, y0, W, W, c, c, c, c)} ` +
             `${roundRectPath(x0 + th, y0 + th, W - 2 * th, W - 2 * th, ci, ci, ci, ci)}"/>`;
    }
  }
}

/* --------------------------------------------------------------------------
   Finder ball: the 3x3 core inside the frame.
   -------------------------------------------------------------------------- */
function eyeBallSVG(kind, px, py, u, radius) {
  const cx = px + 3.5 * u, cy = py + 3.5 * u, h = 1.5 * u;

  switch (kind) {
    case "circle":
      return `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(h)}"/>`;

    case "ring":
      return `<path fill-rule="evenodd" d="M${n2(cx)} ${n2(cy - h)}a${n2(h)} ${n2(h)} 0 1 0 0.01 0Z` +
             `M${n2(cx)} ${n2(cy - h * 0.5)}a${n2(h * 0.5)} ${n2(h * 0.5)} 0 1 1 -0.01 0Z"/>`;

    case "diamond":
      return `<path d="M${n2(cx)} ${n2(cy - h)}L${n2(cx + h)} ${n2(cy)}L${n2(cx)} ${n2(cy + h)}L${n2(cx - h)} ${n2(cy)}Z"/>`;

    case "plus": {
      const a = h * 0.36;
      return `<path d="M${n2(cx - a)} ${n2(cy - h)}H${n2(cx + a)}V${n2(cy - a)}H${n2(cx + h)}V${n2(cy + a)}` +
             `H${n2(cx + a)}V${n2(cy + h)}H${n2(cx - a)}V${n2(cy + a)}H${n2(cx - h)}V${n2(cy - a)}H${n2(cx - a)}Z"/>`;
    }

    case "dots": {
      let s = "";
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        s += `<circle cx="${n2(px + (2.5 + j) * u)}" cy="${n2(py + (2.5 + i) * u)}" r="${n2(u * 0.42)}"/>`;
      }
      return s;
    }

    case "leaf": {
      const r = radius * h;
      return `<path d="${roundRectPath(cx - h, cy - h, h * 2, h * 2, 0, r, 0, r)}"/>`;
    }

    case "square":
      return `<rect x="${n2(cx - h)}" y="${n2(cy - h)}" width="${n2(h * 2)}" height="${n2(h * 2)}"/>`;

    case "rounded":
    default:
      return `<rect x="${n2(cx - h)}" y="${n2(cy - h)}" width="${n2(h * 2)}" height="${n2(h * 2)}" rx="${n2(radius * h)}"/>`;
  }
}
