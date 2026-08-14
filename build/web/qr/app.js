/* ==========================================================================
   Panel construction, live re-render, export.
   ========================================================================== */

const rack = document.getElementById("rack");
const mount = document.getElementById("mount");
const registry = [];
let paramCount = 0;
let last = { svg: "", w: 0, h: 0 };

/* ---------- build the control rack from SECTIONS ---------- */
for (const section of SECTIONS) {
  const det = document.createElement("details");
  det.className = "sec";
  if (section.open) det.open = true;

  const sum = document.createElement("summary");
  const knobs = section.controls.filter(c => c.type !== "divider").length;
  sum.innerHTML = `<span>${section.title}</span><span class="count">${knobs}</span>`;
  det.appendChild(sum);

  const body = document.createElement("div");
  body.className = "body";

  for (const c of section.controls) {
    if (c.type === "divider") {
      const d = document.createElement("div");
      d.className = "divider";
      body.appendChild(d);
      continue;
    }
    paramCount++;

    const row = document.createElement("div");
    row.className = "ctl" + (c.type === "area" ? " stack" : "");
    const label = document.createElement("label");
    label.textContent = c.label;
    label.setAttribute("for", c.id + "-in");
    row.appendChild(label);

    let input;

    switch (c.type) {
      case "area":
        input = document.createElement("textarea");
        input.value = S[c.id];
        input.addEventListener("input", () => { S[c.id] = input.value; render(); });
        break;

      case "text":
        input = document.createElement("input");
        input.type = "text";
        input.value = S[c.id] || "";
        input.addEventListener("input", () => { S[c.id] = input.value; render(); });
        break;

      case "select":
        input = document.createElement("select");
        for (const [v, l] of c.opts) {
          const o = document.createElement("option");
          o.value = v; o.textContent = l;
          input.appendChild(o);
        }
        input.value = S[c.id];
        input.addEventListener("change", () => {
          S[c.id] = c.num ? Number(input.value) : input.value;
          render();
        });
        break;

      case "range": {
        const out = document.createElement("span");
        out.className = "val";
        input = document.createElement("input");
        input.type = "range";
        input.min = c.min; input.max = c.max; input.step = c.step;
        input.value = S[c.id];
        c._fmt = v => c.pct ? Math.round(v * 100) + "%" : v + (c.unit || "");
        c._out = out;
        out.textContent = c._fmt(S[c.id]);
        input.addEventListener("input", () => {
          S[c.id] = Number(input.value);
          out.textContent = c._fmt(S[c.id]);
          render();
        });
        row.appendChild(out);
        break;
      }

      case "color":
        input = document.createElement("input");
        input.type = "color";
        input.value = S[c.id];
        input.addEventListener("input", () => { S[c.id] = input.value; render(); });
        break;

      case "colors":
        input = document.createElement("div");
        input.className = "swatches";
        for (const key of c.keys) {
          const ci = document.createElement("input");
          ci.type = "color";
          ci.value = S[key];
          ci.setAttribute("aria-label", key);
          ci.addEventListener("input", () => { S[key] = ci.value; render(); });
          input.appendChild(ci);
        }
        break;

      case "check":
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!S[c.id];
        input.addEventListener("change", () => { S[c.id] = input.checked; render(); });
        break;

      case "file":
        input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", () => {
          const f = input.files[0];
          if (!f) { S[c.id] = null; render(); return; }
          const fr = new FileReader();
          fr.onload = () => { S[c.id] = fr.result; render(); };
          fr.readAsDataURL(f);
        });
        break;
    }

    input.id = c.id + "-in";
    row.appendChild(input);
    body.appendChild(row);
    registry.push({ c, row, input });
  }

  det.appendChild(body);
  rack.appendChild(det);
}
/* the qcode UI has no masthead; the standalone skeleton still does */
const paramCountEl = document.getElementById("paramcount");
if (paramCountEl) paramCountEl.textContent = paramCount;

/* ---------- push S back into the widgets (after presets / randomize) ---------- */
function syncPanel() {
  for (const { c, row, input } of registry) {
    if (c.when) row.classList.toggle("hide", !c.when(S));
    switch (c.type) {
      case "range":
        input.value = S[c.id];
        c._out.textContent = c._fmt(S[c.id]);
        break;
      case "check":
        input.checked = !!S[c.id];
        break;
      case "colors":
        Array.from(input.children).forEach((el, i) => { el.value = S[c.keys[i]]; });
        break;
      case "file":
        break; // file inputs cannot be set programmatically
      default:
        input.value = S[c.id] == null ? "" : S[c.id];
    }
  }
}

/* ---------- render ---------- */
/* qcode's manual tab drops the diagnostics block to give the stage more room,
   while the standalone lab keeps it — so these two may be absent. */
const setHTML = (id, html) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
};

function render() {
  syncPanel();
  const out = buildSVG();

  if (out.error) {
    mount.innerHTML = `<div class="err">${esc(out.error)}</div>`;
    setHTML("verdict", `<span class="verdict v-bad">Cannot encode</span>`);
    setHTML("notes", "");
    return;
  }

  mount.innerHTML = out.svg;
  last = { svg: out.svg, w: out.w, h: out.h };

  const i = out.info;
  document.getElementById("ro-ver").textContent = "v" + i.ver;
  document.getElementById("ro-size").textContent = i.size + "×" + i.size;
  document.getElementById("ro-mask").textContent = i.mask;
  document.getElementById("ro-bytes").textContent = i.bytes + "/" + i.cap;
  document.getElementById("ro-mods").textContent = i.drawn;
  document.getElementById("ro-px").textContent = Math.round(out.w) + "×" + Math.round(out.h);

  const { risk, notes } = out.diag;
  if (risk === 0) setHTML("verdict", `<span class="verdict v-good">Reads clean</span>`);
  else if (risk <= 3) setHTML("verdict", `<span class="verdict v-warn">Risky — test it</span>`);
  else setHTML("verdict", `<span class="verdict v-bad">Likely unreadable</span>`);

  setHTML("notes", notes.map(t => `<li>${esc(t)}</li>`).join(""));
}

/* ---------- presets ---------- */
const pbar = document.getElementById("presets");
for (const name of Object.keys(PRESETS)) {
  const b = document.createElement("button");
  b.className = "preset";
  b.textContent = name;
  b.addEventListener("click", () => { Object.assign(S, PRESETS[name]); render(); });
  pbar.appendChild(b);
}

document.getElementById("reset").addEventListener("click", () => {
  Object.assign(S, DEFAULTS);
  render();
});

document.getElementById("randomize").addEventListener("click", () => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const hex = () => "#" + Array.from({ length: 3 },
    () => Math.floor(Math.random() * 160 + 40).toString(16).padStart(2, "0")).join("");
  Object.assign(S, {
    shape: pick(MODULE_SHAPES.map(s => s[0])),
    scale: 0.65 + Math.random() * 0.45,
    radius: Math.random(),
    eyeFrame: pick(EYE_FRAMES.map(s => s[0])),
    eyeBall: pick(EYE_BALLS.map(s => s[0])),
    eyeFrameR: Math.random(),
    eyeBallR: Math.random(),
    fgMode: pick(["solid", "linear", "radial"]),
    fg: hex(), gA: hex(), gB: hex(),
    gAngle: Math.floor(Math.random() * 360),
    eyeColorMode: pick(["inherit", "custom"]),
    eyeFrameColor: hex(), eyeBallColor: hex(),
    seed: Math.floor(Math.random() * 999) + 1
  });
  render();
});

/* ---------- export ---------- */
const svgDataURI = svg => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

function download(name, url) {
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

document.getElementById("dl-svg").addEventListener("click", () => {
  download("qr.svg", svgDataURI(last.svg));
});

document.getElementById("cp-svg").addEventListener("click", async e => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(last.svg);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Clipboard blocked";
  }
  setTimeout(() => { btn.textContent = "Copy SVG"; }, 1400);
});

document.getElementById("dl-png").addEventListener("click", () => {
  const k = Number(document.getElementById("pngscale").value);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = Math.round(last.w * k);
    cv.height = Math.round(last.h * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    download(`qr@${k}x.png`, cv.toDataURL("image/png"));
  };
  img.onerror = () => alert("PNG export failed. Download the SVG instead.");
  img.src = svgDataURI(last.svg);
});

render();
