/* ==========================================================================
   ai.js — the ai tab: a clipboard round-trip in place of the control rack.

   Nothing here talks to a model, and nothing needs to. Copy hands the user a
   prompt plus a spec of every parameter; they run it through whatever AI they
   like; Apply validates the JSON that comes back and renders it. No keys, no
   cost, and no untrusted text ever reaches anything but JSON.parse.

   The spec is GENERATED from SECTIONS + DEFAULTS, never hand-written. Adding a
   knob to schema.js keeps this tab correct for free — the same trick app.js
   uses to build the rack. A hand-maintained copy would be stale in a week.
   ========================================================================== */

/* Dividers are layout. File inputs hold base64 data URIs of uploads: a model
   cannot produce one, so they are left out of the spec and rejected as unknown
   keys on the way back in. The user uploads them in this tab instead, and they
   survive Apply — see AI_IMAGES below. */
const AI_SKIP = ["divider", "file"];

/* The two params that hold bytes rather than a description. Everything *about*
   them (logoSize, logoBackdrop, bgImgBlur, …) stays in the spec, so the model
   styles an image it never has to produce. */
const AI_IMAGES = ["logo", "bgImage"];

/* codes.go caps a save body at 512 KB because these two params are base64.
   Checking here turns a confusing 413 at save time into a clear message at
   upload time, while the file can still be swapped for a smaller one. */
const AI_MAX_BODY = 512 * 1024;

/* ---------- the parameter table, flattened out of SECTIONS ---------- */
function aiParams() {
  const out = [];
  for (const sec of SECTIONS) {
    for (const c of sec.controls) {
      if (AI_SKIP.includes(c.type)) continue;
      /* a "colors" row is one widget over several state keys */
      if (c.type === "colors") {
        for (const k of c.keys) out.push({ id: k, sec: sec.title, label: c.label, type: "color", when: c.when });
        continue;
      }
      out.push({
        id: c.id, sec: sec.title, label: c.label, type: c.type,
        min: c.min, max: c.max, step: c.step, opts: c.opts, when: c.when
      });
    }
  }
  return out;
}
const AI_PARAMS = aiParams();
const AI_BY_ID = new Map(AI_PARAMS.map(p => [p.id, p]));

/* ---------- describing a parameter ---------- */
function aiType(p) {
  switch (p.type) {
    case "range":  return `number, ${p.min}…${p.max} (step ${p.step})`;
    case "check":  return "boolean";
    case "color":  return 'hex colour, "#RRGGBB"';
    case "select": return "one of: " + p.opts.map(o => JSON.stringify(o[0])).join(" | ");
    default:       return "string";
  }
}

/* Long option lists (versions, mask patterns) are self-explanatory; short ones
   are worth spelling out so the model picks on meaning rather than on spelling. */
function aiLegend(p) {
  if (p.type !== "select" || p.opts.length > 12) return "";
  return p.opts.map(o => `${JSON.stringify(o[0])} = ${o[1]}`).join(", ");
}

/* `when` is a live predicate, so its own source is the only description that
   cannot drift. Stripping the `s =>` and the `s.` leaves something a model
   reads fine: `shape === "barH" || shape === "barV"`. */
function aiWhen(p) {
  if (!p.when) return "";
  const src = String(p.when)
    .replace(/^[^=]*=>\s*/, "")
    .replace(/\bs\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  return src.length > 140 ? "" : src;
}

/* ---------- the copied text ---------- */
function aiCurrentParams() {
  const out = {};
  for (const p of AI_PARAMS) if (p.id in S) out[p.id] = S[p.id];
  return out;
}

function aiBuildSpec() {
  const L = [];
  L.push("You are configuring a QR-code renderer. Read the parameter list, then reply");
  L.push("with ONE JSON object and nothing else — no prose, no markdown fence.");
  L.push("");
  /* The three things only the user knows. A model that guesses at these produces
     a code that renders perfectly and points at the wrong place. */
  L.push("Before you write any JSON, check these with me:");
  L.push("- What should the code point at? If I have not given you a URL or some text,");
  L.push("  ask me and wait. Never invent a payload — a QR code that scans cleanly to");
  L.push("  the wrong address is worse than no answer at all.");
  L.push('- What should the label say? A caption only appears when "frame" is "bottom",');
  L.push('  "top", "pill" or "bar". If your design uses one and I have not told you the');
  L.push("  wording, ask me rather than captioning it yourself.");
  L.push("- Do you want a centre icon or a background photo? I upload those myself, so");
  L.push("  if your design assumes either one, say so and I will add it before applying.");
  L.push("  " + AI_IMAGES.map(k => `${k} = ${S[k] ? "uploaded" : "none"}`).join(", ") + " right now.");
  L.push("Ask everything you need in one message, then wait for my answer.");
  L.push("");
  L.push("Rules:");
  L.push("- Use only keys from the list below. Any other key is rejected and nothing renders.");
  L.push("- Match the stated type and range exactly. Out-of-range values are rejected, not clamped.");
  L.push("- Anything you leave out resets to its default, so include every key the design needs.");
  L.push("- The centre logo and background photo are image files I upload myself, so they are");
  L.push("  not in the list and you cannot set them. You DO control everything about them:");
  L.push("  logoSize, logoPad, logoBackdrop, logoRot, excavate, bgImgOpacity, bgImgBlur.");
  L.push("  Set those as if the image were already there — I can upload it at any time");
  L.push("  and it survives every future paste.");
  L.push('- "text" is the payload the code encodes. Keep it unless asked to change it.');
  L.push("- A QR code still has to scan: keep strong contrast between foreground and");
  L.push('  background, and raise "ecl" if you add heavy jitter, noise or a caption.');
  L.push("");
  L.push("## Parameters");

  let sec = null;
  for (const p of AI_PARAMS) {
    if (p.sec !== sec) { sec = p.sec; L.push("", `### ${sec}`); }
    let line = `- ${p.id} — ${p.label} — ${aiType(p)}`;
    const legend = aiLegend(p);
    if (legend) line += `\n    (${legend})`;
    const when = aiWhen(p);
    if (when) line += `\n    only applies when: ${when}`;
    L.push(line);
  }

  L.push("", "## My current code", "", "```json");
  L.push(JSON.stringify(aiCurrentParams(), null, 2));
  L.push("```", "");
  L.push("Return the full JSON for the design I ask for.");
  return L.join("\n");
}

/* ---------- validation ----------
   Strict on purpose: one bad key fails the whole paste and lists every problem
   at once, so a malformed reply is fixed in one round trip rather than five. */
function aiShow(v) {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : (s.length > 40 ? s.slice(0, 37) + "…" : s);
}

function aiCheck(p, v) {
  switch (p.type) {
    case "check":
      return typeof v === "boolean" ? "" : `expected true or false, got ${aiShow(v)}`;
    case "range":
      if (typeof v !== "number" || !isFinite(v)) return `expected a number, got ${aiShow(v)}`;
      if (v < p.min || v > p.max) return `${v} is outside ${p.min}…${p.max}`;
      return "";
    case "color":
      return typeof v === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v)
        ? "" : `expected a hex colour like "#B32B58", got ${aiShow(v)}`;
    case "select":
      return p.opts.some(o => o[0] === v)
        ? "" : `${aiShow(v)} is not one of ${p.opts.map(o => JSON.stringify(o[0])).join(", ")}`;
    default:
      return typeof v === "string" ? "" : `expected a string, got ${aiShow(v)}`;
  }
}

function aiValidate(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return { errs: ["Nothing to apply — paste the JSON your AI returned."] };

  let obj;
  try { obj = JSON.parse(txt); }
  catch (e) { return { errs: ["Not valid JSON — " + e.message] }; }

  if (obj === null || typeof obj !== "object" || Array.isArray(obj))
    return { errs: ['Expected a JSON object, e.g. { "shape": "circle", "fg": "#15181B" }.'] };

  const errs = [], params = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = AI_BY_ID.get(k);
    if (!p) { errs.push(`${k} — not a parameter`); continue; }
    const bad = aiCheck(p, v);
    if (bad) errs.push(`${k} — ${bad}`);
    else params[k] = v;
  }
  return { errs, params };
}

/* ---------- wiring ---------- */
const aiMount  = document.getElementById("ai-mount");
const aiBox    = document.getElementById("ai-json");
const aiErrBox = document.getElementById("ai-errors");
const aiCopyBt = document.getElementById("ai-copy");
const aiApplyBt = document.getElementById("ai-apply");

/* buildSVG() reads the global S and returns a string; app.js paints it into the
   rack's #mount, which lives in the other panel. This tab keeps its own. */
function aiPreview() {
  if (!aiMount) return;
  const out = buildSVG();
  aiMount.innerHTML = out.error ? `<div class="err">${esc(out.error)}</div>` : out.svg;
}

function aiErrors(list) {
  if (!aiErrBox) return;
  aiErrBox.hidden = !list.length;
  aiErrBox.innerHTML = list.length
    ? `<p class="ai-err-head">${list.length === 1 ? "Rejected" : `Rejected — ${list.length} problems`}</p>
       <ul>${list.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`
    : "";
}

function aiFlash(btn, msg) {
  if (!btn) return;
  const was = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = was; }, 1400);
}

/* navigator.clipboard needs a secure context; the execCommand path is the
   fallback for anything served over plain http. */
async function aiCopy() {
  const text = aiBuildSpec();
  try {
    await navigator.clipboard.writeText(text);
    aiFlash(aiCopyBt, "Copied");
    return;
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("denied");
    aiFlash(aiCopyBt, "Copied");
  } catch {
    aiErrors(["Could not reach the clipboard. Copy the instructions from the console instead."]);
    console.log(text); // eslint-disable-line no-console
  }
}

function aiApply() {
  const { errs, params } = aiValidate(aiBox ? aiBox.value : "");
  if (errs.length) { aiErrors(errs); return; }
  aiErrors([]);
  /* Full replace: applyParams clears S and merges onto DEFAULTS, so one paste
     fully determines the code and an omitted key means "default", not "keep".
     The two image params are the exception — they carry uploaded bytes that no
     JSON could restore, so wiping them would make every Apply destroy an
     upload. Everything the model says *about* them still applies. */
  const kept = {};
  for (const k of AI_IMAGES) kept[k] = S[k];
  applyParams(params);
  for (const k of AI_IMAGES) S[k] = kept[k];
  syncPanel();
  render();

  updateDirty();
  aiPreview();
  aiFlash(aiApplyBt, "Applied");
}

/* ---------- image uploads ----------
   The rack's own file inputs write to the same S, so an image picked here shows
   up in the manual tab too; only that tab's <input> stays visually empty, which
   is a browser rule (file inputs cannot be set from script), not a bug. */
const aiUploadRows = Array.from(document.querySelectorAll(".ai-upload"));

function aiSyncUploads() {
  for (const row of aiUploadRows) {
    const on = !!S[row.dataset.param];
    row.querySelector(".ai-up-state").textContent = on ? "uploaded" : "none";
    row.classList.toggle("on", on);
    row.querySelector(".ai-up-clear").hidden = !on;
  }
}

function aiSetImage(param, dataURI) {
  const prev = S[param];
  S[param] = dataURI;
  /* exactly the body codes.go will receive, so the check cannot drift from it */
  const bytes = new Blob([JSON.stringify({ name: nameValue(), params: S })]).size;
  if (bytes > AI_MAX_BODY) {
    S[param] = prev;
    aiErrors([`That image is too large — the code would be ${Math.round(bytes / 1024)} KB and the limit is ${AI_MAX_BODY / 1024} KB. Try a smaller or simpler file (SVG is tiny).`]);
    return false;
  }
  aiErrors([]);
  syncPanel();
  render();
  aiPreview();
  aiSyncUploads();
  updateDirty();
  return true;
}

for (const row of aiUploadRows) {
  const param = row.dataset.param;
  row.querySelector('input[type="file"]').addEventListener("change", ev => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      if (!aiSetImage(param, fr.result)) ev.target.value = "";
    };
    fr.onerror = () => aiErrors([`Could not read ${file.name}.`]);
    fr.readAsDataURL(file);
  });
  row.querySelector(".ai-up-clear").addEventListener("click", () => {
    aiSetImage(param, null);
    row.querySelector('input[type="file"]').value = "";
  });
}

if (aiCopyBt)  aiCopyBt.addEventListener("click", aiCopy);
if (aiApplyBt) aiApplyBt.addEventListener("click", aiApply);

/* script.js registered its tab handler first, so by the time this one runs the
   panel is already visible and S may have moved on in the manual tab. */
/* ---------- export bar ----------
   Randomize and Reset are app.js's own handlers, reached by clicking its
   buttons rather than copying their bodies here — the same trick collection.js
   uses for tabs. They mutate S and re-render, so this tab only has to repaint.
   Downloads go through store.js, which names the file after the code instead of
   the rack's hard-coded "qr.svg". */
function aiWire(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
}
const aiProxy = id => () => {
  const btn = document.getElementById(id);
  if (btn) btn.click();
  aiPreview();
  aiSyncUploads(); // Reset puts logo/bgImage back to null, so the rows must follow
};

aiWire("ai-randomize", aiProxy("randomize"));
aiWire("ai-reset", aiProxy("reset"));

aiWire("ai-dl-svg", () => {
  const out = buildSVG();
  if (!out.error) downloadSVG(out, nameValue() || "qr");
});

const aiScale = () => Number((document.getElementById("ai-pngscale") || {}).value || 2);

aiWire("ai-dl-png", () => {
  const out = buildSVG();
  if (out.error) return;
  downloadPNG(out, nameValue() || "qr", aiScale());
});

aiWire("ai-dl-webp", () => {
  const out = buildSVG();
  if (out.error) return;
  downloadWEBP(out, nameValue() || "qr", aiScale());
});

aiWire("ai-cp-svg", async () => {
  const out = buildSVG();
  if (out.error) { aiErrors([out.error]); return; }
  const btn = document.getElementById("ai-cp-svg");
  try {
    await navigator.clipboard.writeText(out.svg);
    aiFlash(btn, "Copied");
  } catch {
    aiFlash(btn, "Clipboard blocked");
  }
});

const aiTab = document.querySelector('.tab[data-target="panel-ai"]');
if (aiTab) aiTab.addEventListener("click", () => { aiPreview(); aiSyncUploads(); });

aiSyncUploads();
