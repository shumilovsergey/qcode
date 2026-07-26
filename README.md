# qcode — QR Lab

A skeleton for exploring how far QR code styling can be pushed on the client.
Plain HTML, CSS and JS. No dependencies, no build step, no network calls.

Open `index.html` in a browser. That's it.

```
index.html
css/style.css
js/encoder.js   QR encoder — byte mode, versions 1-40, ECC L/M/Q/H, masks 0-7
js/shapes.js    shape vocabulary: modules, finder frames, finder balls
js/state.js     defaults + presets
js/schema.js    declarative control list (add a knob here + a default in state.js)
js/render.js    state -> SVG string, plus scannability heuristics
js/app.js       builds the panel, wires live re-render, handles export
```

## Why nothing is imported

The QR spec constrains only two things a designer cares about: the *positions*
of modules, and enough *contrast* to tell dark from light. Everything else —
shape, colour, gradient, logo, frame — is decoration painted over a boolean
matrix. Reed–Solomon error correction is what makes centre logos work: at level
H roughly 30% of the code can be destroyed and still decode.

So the encoder produces the matrix, and the renderer treats it as a canvas.
They are cleanly separated, which is why swapping the renderer for canvas or
WebGL later would not touch `encoder.js`.

## What's adjustable

Roughly 70 parameters across nine groups: payload and error correction,
geometry, module shape (14 shapes, fill ratio, corner radius, size falloff,
positional/rotational/scale jitter), finder eyes (8 frame styles × 8 ball
styles, per-corner colouring), foreground fill (solid / linear / radial, with
gradients spanning either the whole code or each individual module),
background (solid / gradient / transparent / image with blur and opacity),
centre logo (image or text, backdrop, border, rotation, module excavation),
effects (drop shadow, glow, outline, grain), and frame with caption.

Export is PNG at 1–8× or SVG.

The readout under the preview reports the chosen version, grid size, mask,
byte usage and export dimensions. The verdict below it runs contrast,
logo-coverage-versus-error-budget, quiet zone and fill-ratio heuristics — it
flags risk, it does not prove a code will fail. Test with a real camera before
printing anything.

## Adding a control

1. Add the key and its default to `DEFAULTS` in `js/state.js`.
2. Add a row to the relevant section in `js/schema.js`.
3. Read `S.yourKey` in `js/render.js`.

`app.js` builds the widget, wires the listener and handles show/hide via the
optional `when: s => ...` predicate. No other file needs touching.

## Tests

The encoder was verified against a reversing decoder that undoes mask, zig-zag
placement, interleaving and Reed–Solomon, plus structural assertions on finder
patterns, separators, timing patterns, format-info BCH and version-info BCH.
All 160 version × ECC-level combinations round-trip at maximum capacity.
