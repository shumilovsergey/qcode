# AI delegation — the app helps the user's AI, it does not host one

A pattern for putting AI into an app without putting a model into the app.

The app owns no API key, opens no network connection, and pays for nothing. It
publishes a **machine-readable description of its own state**, the user runs that
through whatever model they already pay for, and the app **validates and applies**
what comes back. The model never touches the app; it touches the clipboard.

qcode's `ai` tab is the reference implementation — 78 parameters, ~270 lines of
JavaScript, no dependencies. Read `build/web/qr/ai.js` alongside this.

---

## The shape of it

```
   ┌─────────────────────────────────────────────────────────────┐
   │  YOUR APP                                                   │
   │                                                             │
   │   schema  ──┬──▶  the normal UI (controls, forms, panels)   │
   │  (data)     │                                               │
   │             └──▶  spec generator ──▶ [ Copy instructions ]  │
   │                                                    │        │
   │   state  ◀── apply ◀── validator ◀── [ paste box ] │        │
   │                                            ▲       │        │
   └────────────────────────────────────────────┼───────┼────────┘
                                                │       │
                                          ┌─────┴───────▼─────┐
                                          │  THE USER'S OWN   │
                                          │  AI — any model,  │
                                          │  their account    │
                                          └───────────────────┘
```

Three buttons and a textarea. Copy, paste into their AI, paste the reply back,
Apply.

---

## Why bother

**Cost and keys.** No API key to store, rotate, or leak. No per-request bill that
scales with users you do not charge. No rate limit to explain. A hobby project
can ship a first-class AI feature and still cost nothing to run.

**No vendor lock.** The user picks the model, and they pick a new one next year
without you shipping anything. Their subscription, their choice of privacy
posture, their context window.

**A trivial threat model.** Untrusted model output reaches exactly one function:
`JSON.parse`, behind a whitelist. There is no tool call, no shell, no database
write, no prompt injected into a system you control, and no way for a hostile
reply to do anything worse than fail validation. Compare that to an agent loop
with your credentials in it.

**It degrades to nothing.** The manual UI is still there and still complete. A
user with no AI loses a shortcut, not a feature. If every model on earth went
away tomorrow the app would keep working.

**You do not have to be good at prompting.** The spec is generated from your
schema, so it is exhaustive and current by construction. You are not competing on
prompt quality; you are just describing your own data honestly.

---

## The six rules

### 1. Generate the spec from the same source the UI is built from

This is the rule the pattern lives or dies on. Your controls must be **data**, not
markup — a list of `{ id, label, type, min, max, options, when }` that the UI
builder reads to construct itself. The spec generator then reads the same list.

```js
const SECTIONS = [                          // one source of truth
  { title: "Geometry", controls: [
      { id: "cell",  label: "Module size", type: "range", min: 2, max: 40, step: 1 },
      { id: "shape", label: "Shape",       type: "select", opts: [["square","Square"], …] }
  ]}
];

buildUI(SECTIONS);        // the manual panel
buildSpec(SECTIONS);      // the text the user copies
validate(SECTIONS, json); // the gate on the way back in
```

**Never hand-write the parameter documentation.** A hand-maintained copy is
correct on the day you write it and wrong within a week — a renamed key, a
widened range, a new option — and the failure is silent: the model returns
plausible JSON that the validator rejects, and the user blames the AI. Adding a
knob to the schema must keep all three of these correct for free. If it does not,
you have not implemented this pattern, you have written a prompt.

### 2. Emit conditional logic as its own source

Some fields only apply in some states. Do not describe those conditions in prose —
serialise the predicate that actually enforces them:

```js
{ id: "radius", when: s => ["rounded", "leaf"].includes(s.shape) }

String(p.when)
  .replace(/^[^=]*=>\s*/, "")   // drop the "s =>"
  .replace(/\bs\./g, "")        // drop the "s." qualifier
// → '["rounded", "leaf"].includes(shape)'
```

A model reads that fine, and it cannot drift from the code, because it *is* the
code. Skip anything that serialises longer than a line or two.

### 3. Validate strictly, and report every failure at once

Reject the whole payload if any part of it is wrong. Do not clamp, do not coerce,
do not silently drop the bad key and apply the rest.

```js
for (const [k, v] of Object.entries(obj)) {
  const p = BY_ID.get(k);
  if (!p)  { errs.push(`${k} — not a parameter`); continue; }
  const bad = check(p, v);              // type, range, enum, format
  if (bad) errs.push(`${k} — ${bad}`);
  else params[k] = v;
}
```

Collecting every error rather than throwing on the first is what makes the loop
cheap: the user pastes the whole list back to their AI and gets a corrected reply
in one round trip instead of five. Give each failure mode its own message —
unknown key, wrong type, out of range, bad enum, malformed format are five
different mistakes and the fix differs.

Partial application is the trap to avoid. It produces a state that matches
neither what the model said nor what the user had, and nobody can tell which keys
landed.

### 4. Apply is a full replace

Reset to defaults, then merge the payload. A key the model omits returns to its
default; it does not keep its current value.

```js
function applyParams(params) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, DEFAULTS, params || {});
}
```

One paste fully determines the state. The alternative — treating each paste as a
patch — means the result depends on the invisible history of every previous
paste, and neither the user nor their model can predict it. Full replace is
harder to be clever with and much easier to reason about. Say so in the spec, so
the model knows to include every key the design needs.

### 5. Carve out what a model cannot produce, and make it sticky

Some state is bytes: an uploaded image, a recorded sample, a file. No model can
emit it and no user wants to paste a megabyte of base64.

- **Leave those keys out of the spec** and reject them as unknown keys on the way
  back in, so the model is never tempted.
- **Give them their own upload control** in the same panel.
- **Preserve them across Apply** — they are the one exception to rule 4, because
  wiping them would make every paste destroy an upload that no JSON could restore.
- **Keep every key that describes them.** In qcode the model cannot supply the
  logo, but it fully controls `logoSize`, `logoPad`, `logoBackdrop`, `logoRot`,
  `excavate`, `bgImgOpacity` and `bgImgBlur`. It styles an image it never sees.
- **Tell the model what exists.** The generated prompt reports which uploads are
  currently present, so it can style accordingly.

```js
const KEEP = ["logo", "bgImage"];
const kept = {};
for (const k of KEEP) kept[k] = state[k];
applyParams(params);                       // full replace
for (const k of KEEP) state[k] = kept[k];  // …except these
```

### 6. Ship the current state inside the copied text

End the spec with the user's state as a JSON block under a heading like
`## My current code`. It costs nothing and buys three things: the model sees a
worked example in exactly the format you want back, the user can ask for a
modification rather than a design from scratch, and you get a free self-test —
**the block you emit must validate cleanly when pasted straight back in.** That
round trip is the single best regression test this pattern has.

---

## The AI view is a view, not a second app

The AI panel and the manual panel edit **the same state object**. Same open
document, same name field, same Save, same dirty tracking. Switching between them
is not gated by an unsaved-changes prompt, because nothing is being left.

Practically this means every shared widget becomes a list rather than a single
element, and the views mirror each other:

```js
const nameInputs = Array.from(document.querySelectorAll(".savebar-name"));
```

Adding a third view is then adding a few classes and nothing else.

The manual UI is not deprecated by the AI view and must not be quietly starved.
It is the fallback, the ground truth, and the thing the spec is generated from.

---

## Template for a new app

1. **Make your controls data.** If the UI is hand-written markup, this pattern is
   not available to you yet; that refactor is the actual work and everything else
   is a weekend.
2. **Write the state reset.** `clear → DEFAULTS → payload`, one function, used by
   the AI apply, by "new document", and by loading a saved document.
3. **Write `buildSpec()`.** Prompt rules, then the parameter list grouped by
   section, then the current state as JSON. Say plainly: use only these keys,
   match the types, omitted keys reset, reply with one JSON object and nothing
   else.
4. **Write `validate()`** off the same schema. Every error at once, no clamping.
5. **Build the panel:** Copy button, paste box, error list, Apply button, plus an
   upload control for anything that is bytes.
6. **Check the sizes** against whatever limit your storage layer enforces, at
   upload time, by serialising the exact body the server will receive. Keep the
   client constant equal to the server constant or the two drift and the user
   meets a bare `413`.
7. **Test the round trip** — emitted current-state block back through the
   validator, zero errors. Then test each rejection path.
8. **Write the house-style prompt** (see `qr-promt.md`) as a separate paste-able
   file. The generated spec says what the keys *are*; a style prompt says what
   good *looks like*. Keep them separate — one is generated and always current,
   the other is authored and opinionated.

---

## When not to use this

- **The task needs iteration.** If the model must try, observe a result, and
  adjust, a clipboard round trip is agony. This pattern fits one-shot
  transformations of declarative state.
- **The state is not expressible as a flat JSON object.** Deep trees, ordered
  operations and binary content fight the format. If your carve-out list is
  longer than your parameter list, the pattern is wrong for you.
- **The output must be trusted, not validated.** This works because a bad payload
  is cheap to reject. If you cannot mechanically verify the answer, you need a
  real integration and a real threat model.
- **Your users would not know what to do with it.** The pattern assumes someone
  who already has a model open in another tab. That is a fair assumption for a
  developer tool and a poor one for a consumer app.

---

## What you get, restated

The app describes itself. The user brings the intelligence. The app checks the
answer before believing it.

Everything expensive — the model, the account, the tokens, the choice of vendor —
sits outside the boundary. Everything cheap and durable — the schema, the
generator, the validator — sits inside it, and none of it goes stale when the
model landscape changes again next quarter.
