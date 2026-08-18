/* ==========================================================================
   collection.js — the qcode tab: cards for every saved code, plus the
   unsaved-changes gate that guards leaving a dirty editor.
   Loaded last; uses the globals from app.js and store.js.
   ========================================================================== */

const grid       = document.getElementById("code-grid");
const emptyState = document.getElementById("codes-empty");
const listStatus = document.getElementById("codes-status");

const paramCache = new Map(); // id -> params, so download never refetches

/* ---------- modal ----------
   A styled dialog rather than confirm(), so the unsaved-changes prompt can
   offer a real third choice — cancel the navigation and stay put. */
const modal      = document.getElementById("modal");
const modalMsg   = document.getElementById("modal-msg");
const modalBtns  = document.getElementById("modal-buttons");
let   modalDone  = null;

function closeModal(value) {
  if (!modalDone) return;
  const done = modalDone;
  modalDone = null;
  modal.hidden = true;
  done(value);
}

/* buttons: [{ value, label, cls }] — the first is the default action. */
function showModal({ message, buttons }) {
  modalMsg.textContent = message;
  modalBtns.innerHTML = "";

  for (const b of buttons) {
    const el = document.createElement("button");
    el.className = "btn" + (b.cls ? " " + b.cls : "");
    el.textContent = b.label;
    el.addEventListener("click", () => closeModal(b.value));
    modalBtns.appendChild(el);
  }

  modal.hidden = false;
  modalBtns.firstChild.focus();

  return new Promise(res => { modalDone = res; });
}

modal.addEventListener("click", e => { if (e.target === modal) closeModal(null); });
document.addEventListener("keydown", e => {
  if (modal.hidden) return;
  if (e.key === "Escape") closeModal(null);
});

/* ---------- the unsaved-changes gate ----------
   Returns true if it is safe to leave the current editor state behind. */
async function confirmLeave() {
  if (!isDirty()) return true;
  const choice = await showModal({
    message: `Unsaved changes in “${currentName}”. Save them?`,
    buttons: [
      { value: "save",    label: "Save", cls: "primary" },
      { value: "discard", label: "Don't save" }
    ]
  });
  if (choice === "save") {
    try { await saveCurrent(); } catch { return false; }
    return true;
  }
  return choice === "discard"; // null (Esc / backdrop) → stay put
}

/* ---------- tabs ----------
   Reuse the switching already wired in script.js by clicking the real tab. */
const goTo = id => document.querySelector(`.tab[data-target="${id}"]`).click();

/* ---------- cards ---------- */
/* Time first, then date: "14:44 14.08.2026". Built by hand rather than with
   toLocaleString(), which puts the date first and follows the browser locale —
   the readout strip and the card stamps have to match whatever machine it is. */
const pad2 = n => String(n).padStart(2, "0");
function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ` +
         `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function cardEl(c) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = c.id;
  el.innerHTML = `
    <div class="card-thumb"><span class="card-spin">…</span></div>
    <div class="card-body">
      <h3 class="card-name">${esc(c.name)}</h3>
      <div class="card-date">${stamp(c.updated_at)}</div>
      <div class="card-actions">
        <button class="cbtn" data-act="edit">edit</button>
        <button class="cbtn" data-act="svg">svg</button>
        <button class="cbtn" data-act="webp">webp</button>
        <button class="cbtn" data-act="delete">delete</button>
      </div>
    </div>`;
  return el;
}

/* Thumbnails are drawn only once a card scrolls into view. The list endpoint
   deliberately omits params, so this is what keeps browsing cheap no matter
   how large an embedded logo is. */
const seen = new IntersectionObserver(async (entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    seen.unobserve(en.target);
    const id = Number(en.target.dataset.id);
    const thumb = en.target.querySelector(".card-thumb");
    try {
      const params = await paramsFor(id);
      const out = renderWith(params);
      thumb.innerHTML = out.error
        ? `<span class="card-err">${esc(out.error)}</span>`
        : out.svg;
    } catch (e) {
      thumb.innerHTML = `<span class="card-err">${esc(e.message)}</span>`;
    }
  }
}, { rootMargin: "200px" });

async function paramsFor(id) {
  if (!paramCache.has(id)) paramCache.set(id, (await api.get(id)).params);
  return paramCache.get(id);
}

async function refreshCards() {
  if (!grid) return;
  let codes;
  try {
    codes = await api.list();
  } catch (e) {
    listStatus.textContent = e.message;
    return;
  }
  listStatus.textContent = "";
  grid.innerHTML = "";
  emptyState.hidden = codes.length > 0;

  for (const c of codes) {
    const el = cardEl(c);
    grid.appendChild(el);
    seen.observe(el);
  }
}

/* ---------- card actions ---------- */
/* Shared by the Edit button and by clicking the thumbnail. */
async function openInEditor(id) {
  if (id === currentId) { goTo("panel-manual"); return; }
  if (!await confirmLeave()) return;
  try { await loadCode(id); } catch (err) { listStatus.textContent = err.message; return; }
  await refreshCards();
  goTo("panel-manual");
}

grid.addEventListener("click", async e => {
  const card = e.target.closest(".card");
  if (!card) return;
  const id   = Number(card.dataset.id);
  const name = card.querySelector(".card-name").textContent;

  /* The thumbnail is a shortcut for Edit. Nothing else in the card is a hit
     target — the body holds the real buttons and must stay inert, or a stray
     click near Delete would silently swap the open code. */
  const btn = e.target.closest(".cbtn");
  if (!btn) {
    if (e.target.closest(".card-thumb")) await openInEditor(id);
    return;
  }

  switch (btn.dataset.act) {
    case "edit":
      await openInEditor(id);
      break;
    /* The grid offers svg + webp only — two buttons is all the card has room
       for, and webp is the smaller of the two rasters. PNG stays available in
       the editor tabs, where the export bar has the space for a scale picker. */
    case "svg":
    case "webp": {
      try {
        const out = renderWith(await paramsFor(id));
        if (out.error) { listStatus.textContent = out.error; return; }
        btn.dataset.act === "svg" ? downloadSVG(out, name) : downloadWEBP(out, name, 2);
      } catch (err) { listStatus.textContent = err.message; }
      break;
    }
    case "delete": {
      const ok = await showModal({
        message: `Delete “${name}”? This cannot be undone.`,
        buttons: [{ value: "yes", label: "Delete", cls: "danger" }, { value: "no", label: "Cancel" }]
      });
      if (ok !== "yes") return;
      try {
        await api.remove(id);
        paramCache.delete(id);
        // the open editor now points at a row that no longer exists — turn it
        // into a draft so the next save re-inserts instead of 404-ing
        if (id === currentId) setEditorMeta(null, currentName);
        await refreshCards();
      } catch (err) { listStatus.textContent = err.message; }
      break;
    }
  }
});

/* ---------- create ---------- */
document.getElementById("code-create").addEventListener("click", async () => {
  if (!await confirmLeave()) return;
  newDraft();
  goTo("panel-manual");
});

/* ---------- keep the list fresh when the tab is opened ---------- */
document.querySelector('.tab[data-target="panel-qcode"]')
  .addEventListener("click", () => { refreshCards(); });

/* ---------- boot ---------- */
newDraft();
refreshCards();
