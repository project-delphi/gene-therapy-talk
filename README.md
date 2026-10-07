# ML in Gene Therapy

▶ **[View the presentation](https://project-delphi.github.io/gene-therapy-talk/)**

A talk by Ravi Kalia on where machine learning fits into adeno-associated virus
(rAAV) gene therapy — why the design space is too large to search directly, and
what generative modelling offers instead.

Written for an audience of graduate virologists. The argument runs: AAV's
defectiveness is what made it a good vector; being a good vector meant giving up
integration; episomal persistence means the dose has to work the first time; the
dose is bounded by immunogenicity and toxicity; and the only lever that moves is
potency per particle. Machine learning is in the talk because that is the lever,
and the space is too large to search by hand.

60 slides, with speaker notes throughout and a cited bibliography.

## Reading it

Open the link above. Useful keys:

| Key | Does |
| --- | --- |
| `←` `→` | previous / next slide |
| `Esc` or `O` | slide overview |
| `S` | speaker view (every slide has notes) |
| `F` | fullscreen |
| `E` then print | export to PDF |
| `?` | all shortcuts |

Twelve slides carry a live render, across thirteen canvases — the AAV2/AAV9 slide
draws both capsids side by side.

Ten of those slides are WebGL, and their molecular views are draggable: the AAV2 capsid;
its icosahedral symmetry axes; an AAV2/AAV9 comparison; the four opening sequences drawn
to scale; the interactive cell-entry journey; second-strand synthesis and circularisation;
the capsid fitness landscape; DNA shuffling across nine serotypes; a VAE latent space; and
the ITR hairpin with its CpG sites. They need WebGL and fall back to a static message
without it.

The two machine-learning figures are SVG instead, and work without WebGL — see
[The machine-learning figures](#the-machine-learning-figures).

The symmetry axes are not drawn by hand — the runtime reads the 60 operators out
of the deposited assembly, classifies each by its rotation angle (72°/144° →
5-fold, 120° → 3-fold, 180° → 2-fold) and recovers the axis from the matrix,
giving 6, 10 and 15 axes as the icosahedral group requires.

## Building it

The slides are [Quarto](https://quarto.org) reveal.js — `index.qmd` for content,
`theme.scss` for styling, `references.bib` for citations.

```bash
quarto render          # writes the site to docs/
quarto preview index.qmd
```

`docs/` is committed because GitHub Pages serves the site from it, so re-render
before pushing any change to the slides.

## Layout

```
index.qmd         the 59 authored slides, with speaker notes
references.bib    primary literature behind every claim on a slide
theme.scss        dark theme, ported from the original PowerPoint's colour scheme
js/aav-viz.js     visualisation runtime (lifecycle, lazy init, teardown)
js/cell-journey.js the narrated cell-entry animation, registered into that runtime
js/ml-viz.js      the two SVG machine-learning figures, registered into it too
js/head.html      import map and script tags, injected via include-in-header
js/vendor/        pinned three.js r186 and NGL 2.5.0, vendored rather than CDN
assets/pdb/       AAV2 (1LP3) and AAV9 (3UX1) asymmetric units
assets/diagrams/  authored SVG figures
assets/portraits/ CC BY-SA portraits and a public-domain plate (see CREDITS.json)
docs/             rendered site — GitHub Pages source (main branch, /docs)
source/           the original gene_therapy.pptx this was converted from
tools/            builds PowerPoint and PDF exports of the deck from index.qmd
images/           figures from the original PowerPoint — no longer referenced
```

## How the visualisations work

`js/aav-viz.js` exists because reveal.js keeps every non-current slide at
`display: none`. A canvas built at page load measures 0×0, `camera.aspect`
becomes `NaN`, and the slide stays blank for the rest of the talk. So nothing is
built until its slide is actually reached and the container reports a real box.
Each animation loop starts on slide-enter and is cancelled on slide-leave, so
only the visualisation on screen is ever drawing.

The capsids are the deposited structures, with the 60-mer icosahedral assembly
expanded in the browser from one asymmetric unit — 480 KB and offline-capable,
where the pre-expanded coordinates would be tens of megabytes.

Libraries are vendored rather than loaded from a CDN: conference wifi is not a
dependency worth taking, and it keeps `docs/` self-contained. three.js ships only
ES modules since the UMD builds were removed at r161, hence the import map in
`js/head.html`.

For troubleshooting, `aavViz.state()` in the browser console reports what the
runtime has built and what is running.

## Exports

`tools/build_decks.py` re-lays the deck out as PowerPoint, in the deck's own
dark styling and in a conference template's. It parses `index.qmd` through
pandoc and positions every slide with python-pptx — pandoc's own pptx writer
starts a new slide for anything following a `.columns` block, which orphans the
citation and the stacked figures on almost every slide here.

```bash
uv run --with python-pptx --with pillow python3 tools/build_decks.py
uv run --with python-pptx python3 tools/check_layout.py
```

It needs LibreOffice (pptx to PDF) and Chrome (printing the reveal deck to
PDF), and it reads the conference template out of `no_commit/`.

Slides marked `.webonly` are built around a live render and are dropped from the
PowerPoint export, since there is no still to fall back on. SVG diagrams are
skipped too, because python-pptx cannot embed them.

*From Mouse to Macaque* became `.webonly` when it gained the cross-species chart,
so it now leaves the PowerPoint decks as well. Its text column still reads on its
own, but the bang line under it has nothing left to stand on, which is the usual
argument for the `.webonly` mark. Dropping the mark would put the text back in the
exports and lose only the chart — worth revisiting whenever the pptx path builds
again.

**The PowerPoint exports currently do not build.** Nine slides carry a diagram and
no body text, so they would come out as a title and a citation. The script names
them and exits rather than reporting success over blank slides. Rasterising the
SVGs to PNG at build time is the fix; until then the reveal deck is the only
complete one.

`SHORT_DECK` in `build_decks.py` selects slides for the 10-minute cut by exact
heading text, so it has to be re-synced whenever headings are rewritten — the
script checks and warns, and `render()` builds what still resolves instead of
aborting. Only slides that survive the `.webonly` filter can be named there.

## Provenance

Converted from `source/gene_therapy.pptx`, then rewritten. The deck keeps the
original's colours (`#212121` background, `#ADADAD` body text, `#009688` teal
accent), Arial typeface and 16:9 geometry.

The figures are no longer the PowerPoint's. The rasters in `images/` were
extracted from `ppt/media/` and were largely second-hand renditions — figure
deep-links, a stock-photo search page, a blog post — so they have been replaced
by hand-authored SVG and by live renders of deposited structures. `images/` is
kept for now but nothing references it.

## Licence

The slide source, theme, visualisation runtime, authored diagrams and build
configuration are MIT licensed — see [LICENSE](LICENSE).

Third-party components keep their own terms: [three.js](https://threejs.org) and
[NGL](https://nglviewer.org) under `js/vendor/` are MIT. The structures in
`assets/pdb/` are from the [RCSB PDB](https://www.rcsb.org) and carry no usage
restriction.

Portraits in `assets/portraits/` are **CC BY-SA 4.0** via Wikimedia Commons —
Uğur Şahin and Özlem Türeci © BioNTech SE, Katalin Karikó © University of
Szeged — and are attributed on the deck's Credits slide as that licence
requires. `CREDITS.json` records each file's author, licence and source. The
Duchenne plate is public domain. No photograph of an identifiable patient
appears in the deck.

The unreferenced rasters in `images/` remain the property of their respective
owners.

## Cell-entry animation

Slide 26, **The Journey In, Step by Step**, follows attachment, endocytosis,
membrane escape, nuclear uncoating, duplex DNA formation, two-genome and
four-genome circular concatemers, transcription and mRNA export, and translation
by a polysome. Once playing it loops; use Pause, Restart, or the numbered stage buttons. Stage
selection pauses the animation.

The four colours track independently delivered genomes, not replication.
Concatemer sizes are examples, and expression need not wait for circularization.
Geometry, timing and survival fractions are schematic. Reduced-motion mode
starts paused; the static transduction diagram is the WebGL fallback.
The implementation is in `js/cell-journey.js`, using the existing lazy lifecycle.

## The machine-learning figures

Two slides in the engineering act are drawn with SVG rather than WebGL, in
`js/ml-viz.js`. Both are mostly *text* — split tests, feature names, hit rates —
and an SVG `<text>` stays crisp at projector size where a texture-mapped label in
a three.js scene goes soft. They register into the same runtime as everything
else, so they still build lazily and stop animating on slide-leave, and they are
the two stages that survive the no-WebGL path instead of falling back.

**What a Random Forest Actually Computes** routes one variant down three decision
trees and averages the leaves they reach. The routing is really computed: the
three trees are each restricted to a different pair of features, which is why
they disagree about the same variant, and the ensemble value on the axis is the
mean of the leaves actually reached. The features and leaf values themselves are
invented for the slide, and the caption says so.

**From Mouse to Macaque** charts the Fit4Function transferability result — how
well each predictor, alone and in combination, recovers macaque liver
transduction. The numbers are the authors' own, from `data/transferability.csv`
in [the paper's repository](https://github.com/vector-engineering/fit4function):
chance is 0.24, the best single predictor reaches 0.86, and all six together
reach 0.91.

Colour in both figures is amber for mouse in vivo, cyan for human in vitro and
magenta for the combination. That set was chosen by running the palette through a
contrast and colour-vision check against the `#0b0f14` ground rather than by eye —
worst all-pairs ΔE 10.4 under simulated deuteranopia, 27.0 under normal vision.
The deck's violet sits too close to cyan for deuteranopia (ΔE 5.2) and teal too
close to cyan for tritanopia (ΔE 3.5), so neither is used where the two would be
adjacent.

Both figures carry their own Play/Pause controls, which the runtime gives a band
at the foot of the stage via the `.has-controls` class so the buttons never cover
the figure. Printing drops the band and paints one settled frame.
