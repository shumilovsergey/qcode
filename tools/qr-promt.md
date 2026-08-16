```txt
Design a QR code for an app in the sh-development ecosystem. The parameter spec
above defines every key and its valid range. This is the house style those keys
have to land in.

Codes in this family must look like siblings and never like copies. Everything in
CHASSIS is what makes them siblings — copy it verbatim, do not tune it. Everything
in SKIN is what makes them distinct — derive it from the app being encoded and
change all of it.

CHASSIS — copy exactly, every time:
  "ecl": 3, "minver": 0, "mask": -1, "cell": 10, "quiet": 4, "scale": 0.86,
  "frame": "bar", "frameWidth": 0, "framePad": 18, "frameRadius": 20,
  "captionColor": "#FFFFFF", "captionSize": 30, "captionWeight": 800,
  "captionSpacing": 0,
  "logoSize": 0.25, "logoPad": 0.03, "logoBackdrop": "none", "logoBorder": 0,
  "logoRot": 0, "logoOpacity": 1, "logoGray": false, "excavate": true,
  "noise": 0, "stroke": 0, "shadow": false, "glow": false, "falloff": "none",
  "jitterRot": 0, "jitterScale": 0, "jitterPos": 0,
  "fgOpacity": 1, "invert": false, "alignOverride": false,
  "eyeColorMode": "custom", "bgMode": "solid"

  These land the code on v4, 33x33, 446x536 px for a normal short https URL, so
  every card in the family is the same size. Level H is mandatory: it carries the
  centre logo, and it is what fixes that grid size even when there is no logo.
  frameWidth 0 means no outer border — the ground runs flush to the edge so the
  code reads as a tile, not a framed print. frameRadius 20 makes the label bar a
  pill; that is the family's loudest single signal and the one place the geometry
  is allowed to be round even in an app that is otherwise all hard corners.
  Effects stay off — every one of them trades scan reliability for decoration
  this family does not use. If a design needs texture, change the module shape,
  not the grain.

  "text" is the app's public URL, https://<app>.sh-development.ru
  "caption" is the app's own name in lowercase, spelled exactly as the product
  spells it — "nom-nom", "qcode". Never a URL, never uppercase, never a tagline.
  At 30px/800 weight it is a logotype and has to read like one, which is also why
  captionSpacing is 0: letter-spacing turns a logotype back into a caption.

SKIN — change all four for every app:

  1. Module shape and eye shape. One decision, and they must agree. Use the app's
     own hero geometry: hard rectangular UI -> "square"/"square"; round identity
     -> "circle"/"circle". "rounded", "leaf", "diamond", "ring" and "fluid" are
     unclaimed. This is the strongest identifier — pick it first and never reuse
     one a sibling already holds.

  2. Ground ("bg"). A near-black around 8-13% lightness, tinted toward the app's
     own hue — warm #211C18 for nom-nom, cool #191C20 for qcode. Never #000000,
     never the same value as another app. Quietest variable, does the most work.

  3. Palette. Read the hex values out of the app's live CSS custom properties.
     Do not invent colours and do not work from a description of the palette —
     read the tokens. This is the most common failure and it stays invisible
     until the code sits next to the app that owns it.
     "frameColor" is the app's primary accent: the exact colour of its main
     button. That one value is most of what ties the card to the interface.

  4. Fill ("fgMode"). "solid" when the app's content is monochrome and the accent
     belongs only in the eyes. "radial" or "linear" only when the app has a real
     gradient identity, and the gradient must mean something about the product —
     nom-nom's runs cream at the centre out to salmon at the rim because that is
     the donut, read outward. A gradient chosen for prettiness reads as a
     different family.

  Eye colouring, either is correct:
     uniform  — "eyePerCorner": false, one eyeFrameColor + one eyeBallColor. Calm.
     per corner — "eyePerCorner": true with eyeC1/eyeC2/eyeC3, three different
     frames. Loud, and only worth it when the three colours signify something, as
     qcode's three printing plates do. Three arbitrary colours just look busy.
  Never "eyeColorMode": "inherit" — it lets the eyes vanish into the module fill.

  Every app has an icon and the code should carry it. The logo values above are
  already tuned for the app's favicon at the family's standard size; leave them
  set even when no image is uploaded yet. A code without a logo is acceptable but
  reads as unfinished beside one that has it.

SCAN FLOOR — the renderer scores this; ship only at risk 0:
  Contrast at least 4.5:1 between foreground and background. For a gradient the
  renderer samples "gA", so the lightest stop must clear the floor on its own.
  quiet >= 4, scale >= 0.75, cell >= 4, fgOpacity >= 0.8, jitterPos <= 0.15.
  Logo coverage (logoSize + 2*logoPad)^2 under 60% of the ecl budget (L 7%,
  M 15%, Q 25%, H 30%). At the standard 0.25/0.03 that is 9.6% of H's 30%; the
  warning line sits at logoSize 0.36.

  This family is light modules on a dark ground, which is an inverted code. The
  QR spec assumes dark on light. Phone cameras handle inversion fine, but some
  older and industrial scanners refuse it, and the renderer cannot detect this —
  a dark bg with a light fg scores risk 0 while still being inverted. So risk 0
  is not a guarantee here; the code needs one real phone test before it is used
  in public. Where unknown hardware has to read it, flip it: dark modules on the
  app's light ink colour as the ground, keeping the accent bar and the logotype.
  It still reads as family.

REFERENCE — the two existing codes. Both render at v4, 33x33, 446x536, risk 0,
and share no colour or shape.

nom-nom, the calorie tracker — dots because the product's hero shape is a ring of
them, warm ground, radial cream-to-salmon fill, uniform eyes:
  "shape": "circle", "eyeFrame": "circle", "eyeBall": "circle",
  "eyePerCorner": false, "eyeFrameColor": "#C8695A", "eyeBallColor": "#E9CFA9",
  "fgMode": "radial", "gA": "#EFDCC4", "gB": "#C8695A", "gScope": "code",
  "bg": "#211C18", "frameColor": "#B4472F", "caption": "nom-nom"

qcode, the QR builder — squares because its UI is border-radius 0 throughout,
cool ground, solid ink fill, three eyes as the three plates of a registration
mark:
  "shape": "square", "eyeFrame": "square", "eyeBall": "square",
  "eyePerCorner": true, "eyeC1": "#E4628A", "eyeC2": "#54C2D2",
  "eyeC3": "#E7E9E3", "eyeBallColor": "#E7E9E3",
  "fgMode": "solid", "fg": "#E7E9E3",
  "bg": "#191C20", "frameColor": "#E4628A", "caption": "qcode"

Reply with one JSON object and nothing else.
```
