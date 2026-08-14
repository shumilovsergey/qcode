/* ==========================================================================
   store.js — saved codes: API client, editor state, dirty tracking.

   Loaded after app.js. Classic scripts share one global lexical scope, so
   S, DEFAULTS, syncPanel(), render(), buildSVG(), download(), svgDataURI()
   and esc() are all reachable here without app.js being modified.
   ========================================================================== */

const API = "/api/codes";

async function req(method, url, body) {
  const opt = { method, credentials: "same-origin" };
  if (body !== undefined) {
    opt.headers = { "Content-Type": "application/json" };
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("not logged in");
  }
  if (!res.ok) {
    let msg = `request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  list:   ()          => req("GET", API),
  get:    id          => req("GET", `${API}/${id}`),
  create: (name, p)   => req("POST", API, { name, params: p }),
  update: (id, body)  => req("PUT", `${API}/${id}`, body),
  remove: id          => req("DELETE", `${API}/${id}`)
};

/* ---------- editor state ----------
   currentId === null means an unsaved draft: nothing exists in the DB yet and
   the next save inserts rather than updates. */
let currentId   = null;
let currentName = "default";
let baseline    = "";

/* The manual and ai tabs are two views of one editor, so each has its own
   savebar and every widget below is a list. They are never visible at once;
   keeping them in sync is what makes switching tabs feel like staying put. */
const savebarAll = sel => Array.from(document.querySelectorAll(sel));
const nameInputs   = savebarAll(".savebar-name");
const saveBtns     = savebarAll(".savebar-save");
const dirtyMarks   = savebarAll(".savebar-dirty");
const saveStatuses = savebarAll(".savebar-status");
const saveSpins    = savebarAll(".savebar-spin");

const nameValue = () => (nameInputs.length ? nameInputs[0].value.trim() : "");

/* The name is part of what can be unsaved, so it belongs in the snapshot. */
function snapshot() {
  return JSON.stringify({ n: nameValue(), s: S });
}
function isDirty() { return snapshot() !== baseline; }

function updateDirty() {
  const d = isDirty();
  for (const m of dirtyMarks) m.hidden = !d;
}

/* applyParams rebuilds S from DEFAULTS up. Merging onto DEFAULTS first is not
   optional: a saved blob may omit params (saved before a knob existed), and
   without the reset those would silently inherit whatever the previously-open
   code left behind. Keys are cleared rather than overwritten so a param that
   no longer exists in DEFAULTS cannot linger either. */
function applyParams(params) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, DEFAULTS, params || {});
  syncPanel();
  render();
}

function setEditorMeta(id, name) {
  currentId = id;
  currentName = name;
  for (const i of nameInputs) i.value = name;
  baseline = snapshot();
  updateDirty();
  setStatus("");
  setSpin("");
}

async function loadCode(id) {
  const c = await api.get(id);
  applyParams(c.params);
  setEditorMeta(c.id, c.name);
}

function newDraft() {
  applyParams({});
  setEditorMeta(null, "default");
}

/* The status line is now an error channel only — progress and success are the
   spinner's job, so nothing writes prose here on the happy path. */
function setStatus(msg, bad) {
  for (const s of saveStatuses) {
    s.textContent = msg;
    s.classList.toggle("bad", !!bad);
  }
}

/* "busy" spins, "ok" ticks, "" clears. One timer for the whole app: a second
   save landing during the tick must not be cleared by the first one's timeout. */
let spinTimer = null;
function setSpin(state) {
  clearTimeout(spinTimer);
  for (const s of saveSpins) {
    if (state) s.dataset.state = state;
    else delete s.dataset.state;
  }
  if (state === "ok") spinTimer = setTimeout(() => setSpin(""), 1300);
}

async function saveCurrent() {
  const name = nameValue() || "default";
  const params = JSON.parse(JSON.stringify(S));
  setStatus("");
  setSpin("busy");
  try {
    if (currentId === null) {
      const { id } = await api.create(name, params);
      currentId = id;
    } else {
      await api.update(currentId, { name, params });
    }
  } catch (e) {
    setSpin("");
    setStatus(e.message, true);
    throw e;
  }
  paramCache.delete(currentId); // cached params are now stale
  setEditorMeta(currentId, name); // clears the spinner along with the status
  setSpin("ok");
}

/* ---------- rendering an arbitrary code ----------
   buildSVG() takes no arguments — it reads the global S. Drawing a card
   thumbnail or downloading from the collection means rendering a code that is
   not the one open in the editor, so swap the global, build, and put it back.
   This keeps render.js byte-identical to the skeleton. */
function renderWith(params) {
  const saved = Object.assign({}, S);
  try {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, DEFAULTS, params || {});
    return buildSVG();
  } finally {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, saved);
  }
}

const safeFile = n => (String(n).replace(/[^\w\-. ]+/g, "_").trim() || "qr");

function downloadSVG(out, name) {
  download(`${safeFile(name)}.svg`, svgDataURI(out.svg));
}

function downloadPNG(out, name, scale) {
  const k = scale || 2;
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = Math.round(out.w * k);
    cv.height = Math.round(out.h * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    download(`${safeFile(name)}@${k}x.png`, cv.toDataURL("image/png"));
  };
  img.onerror = () => alert("PNG export failed. Download the SVG instead.");
  img.src = svgDataURI(out.svg);
}

/* ---------- wiring ----------
   One delegated listener per editor panel: the rack's inputs, the preset
   buttons, randomize/reset and the ai tab's Apply all bubble here, so no hook
   inside render() is needed to keep the dirty marker honest. */
for (const id of ["panel-manual", "panel-ai"]) {
  const panel = document.getElementById(id);
  if (!panel) continue;
  for (const ev of ["input", "change", "click"]) {
    panel.addEventListener(ev, () => setTimeout(updateDirty, 0));
  }
}

/* Typing in one tab's name field has to reach the other's, or switching tabs
   would silently revert the rename. */
for (const input of nameInputs) {
  input.addEventListener("input", () => {
    for (const other of nameInputs) if (other !== input) other.value = input.value;
  });
}

for (const btn of saveBtns) {
  btn.addEventListener("click", async () => {
    try { await saveCurrent(); await refreshCards(); } catch { /* status shows it */ }
  });
}
