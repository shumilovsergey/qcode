/* ==========================================================================
   QR encoder — byte mode, versions 1-40, ECC L/M/Q/H, masks 0-7.
   Follows ISO/IEC 18004. No dependencies.

   encodeQR(text, eclIdx, minVer, forcedMask)
     eclIdx     0=L 1=M 2=Q 3=H
     minVer     0 = pick smallest that fits
     forcedMask -1 = pick lowest penalty
   -> { mod, size, ver, mask, bytes, cap, ecPct, align } | { error }
   ========================================================================== */

/* --- GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 --- */
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255];

/* --- per-version, per-ECC tables (index 0 unused) --- */
const ECC_CW = [
  [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
];
const ECC_BLK = [
  [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
];
const ECL_FMT = [1, 0, 3, 2];      // L, M, Q, H -> format-info bits
const ECL_PCT = [7, 15, 25, 30];   // nominal recoverable share

function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}
const rawCW = v => Math.floor(rawModules(v) / 8);
const dataCW = (v, e) => rawCW(v) - ECC_CW[e][v] * ECC_BLK[e][v];

function alignPos(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2;
  const step = (v === 32) ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let p = v * 4 + 10; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

function rsDivisor(deg) {
  const r = new Array(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) {
      r[j] = gmul(r[j], root);
      if (j + 1 < deg) r[j] ^= r[j + 1];
    }
    root = gmul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const res = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < div.length; i++) res[i] ^= gmul(div[i], f);
  }
  return res;
}

function encodeQR(text, eclIdx, minVer, forcedMask) {
  const bytes = Array.from(new TextEncoder().encode(text));

  let ver = -1;
  for (let v = Math.max(1, minVer | 0); v <= 40; v++) {
    const cc = (v <= 9) ? 8 : 16;
    if (4 + cc + bytes.length * 8 <= dataCW(v, eclIdx) * 8) { ver = v; break; }
  }
  if (ver < 0) return { error: "Too much data for version 40 at this error-correction level. Shorten the payload or drop to level L." };

  /* --- bit stream: mode + length + payload + terminator + padding --- */
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4);
  push(bytes.length, (ver <= 9) ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCW(ver, eclIdx) * 8;
  push(0, Math.min(4, cap - bits.length));
  push(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);

  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  /* --- Reed-Solomon per block, then interleave --- */
  const numBlk = ECC_BLK[eclIdx][ver];
  const eccLen = ECC_CW[eclIdx][ver];
  const raw = rawCW(ver);
  const shortLen = Math.floor(raw / numBlk);
  const numShort = numBlk - raw % numBlk;
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlk; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = dataBytes.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, div);
    /* Short blocks get a placeholder so every block is the same length and the
       ECC columns line up during interleaving. It is skipped on the way out. */
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const skipCol = shortLen - eccLen;
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < numBlk; j++) {
      if (i !== skipCol || j >= numShort) codewords.push(blocks[j][i]);
    }
  }

  /* --- function patterns --- */
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { if (x >= 0 && x < size && y >= 0 && y < size) { mod[y][x] = v; fn[y][x] = true; } };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  const ap = alignPos(ver);
  for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  const drawFormat = (mask) => {
    const d = ECL_FMT[eclIdx] << 3 | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | (r & 0x3FF)) ^ 0x5412;
    const bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = (ver << 12) | (r & 0xFFF);
    for (let i = 0; i < 18; i++) {
      const on = ((b >>> i) & 1) === 1;
      const a = size - 11 + i % 3, c = Math.floor(i / 3);
      set(a, c, on); set(c, a, on);
    }
  }

  /* --- zig-zag data placement, skipping the vertical timing column --- */
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) {
          mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  /* --- masking --- */
  const maskFn = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
  ];
  const applyMask = m => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
    }
  };

  let mask = forcedMask;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty(mod, size);
      if (p < best) { best = p; mask = m; }
      applyMask(m);
    }
  }
  applyMask(mask);
  drawFormat(mask);

  return {
    mod, size, ver, mask,
    bytes: bytes.length,
    cap: dataCW(ver, eclIdx),
    ecPct: ECL_PCT[eclIdx],
    align: ap
  };
}

/* --- mask penalty, rules N1..N4 --- */
function penalty(m, size) {
  let p = 0;

  const runs = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1, color = get(0, a);
      for (let b = 1; b < size; b++) {
        if (get(b, a) === color) run++;
        else { if (run >= 5) p += 3 + (run - 5); run = 1; color = get(b, a); }
      }
      if (run >= 5) p += 3 + (run - 5);
    }
  };
  runs((b, a) => m[a][b]);
  runs((b, a) => m[b][a]);

  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }

  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const finderLike = (get) => {
    for (let a = 0; a < size; a++) for (let b = 0; b + 10 < size; b++) {
      let fwd = true, rev = true;
      for (let k = 0; k < 11; k++) {
        if (get(b + k, a) !== pat[k]) fwd = false;
        if (get(b + 10 - k, a) !== pat[k]) rev = false;
      }
      if (fwd) p += 40;
      if (rev) p += 40;
    }
  };
  finderLike((b, a) => m[a][b]);
  finderLike((b, a) => m[b][a]);

  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
  p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;

  return p;
}
