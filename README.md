# ML in Gene Therapy

▶ **[View the presentation](https://project-delphi.github.io/gene-therapy-talk/)**

A talk by Ravi Kalia on where machine learning fits into adeno-associated virus
(rAAV) gene therapy — why the design space is too large to search directly, and
what generative modelling offers instead.

The deck walks from four impactful therapeutic sequences (ChAdOx1, the BioNTech
mRNA vaccine, Elevidys, Keytruda) through what a virus actually is and why AAV
became the vector of choice, to the three engineerable modules of the AAV genome
— **capsid**, **promoter**, and **inverted terminal repeats** — and the ML
approaches being applied to each.

38 slides. Every figure links to its source and every slide cites its reference.

## Reading it

Open the link above. Useful keys:

| Key | Does |
| --- | --- |
| `←` `→` | previous / next slide |
| `Esc` or `O` | slide overview |
| `S` | speaker view |
| `F` | fullscreen |
| `E` then print | export to PDF |
| `?` | all shortcuts |

## Building it

The slides are [Quarto](https://quarto.org) reveal.js — `index.qmd` for content,
`theme.scss` for styling.

```bash
quarto render          # writes the site to docs/
quarto preview index.qmd
```

`docs/` is committed because GitHub Pages serves the site from it, so re-render
before pushing any change to the slides.

## Layout

```
index.qmd      the 38 slides
theme.scss     dark theme, ported from the original PowerPoint's colour scheme
images/        figures, extracted from the deck and resized for the web
docs/          rendered site — GitHub Pages source (main branch, /docs)
source/        the original gene_therapy.pptx this was converted from
```

## Provenance

Converted from `source/gene_therapy.pptx`. The Quarto version keeps the
original's colours (`#212121` background, `#ADADAD` body text, `#009688` teal
accent), Arial typeface, 16:9 geometry, slide order, wording, and all 53 source
hyperlinks. Figures were re-encoded for the web, taking the deck from 31 MB to
about 5 MB with no visible change.

## Licence

The slide source, theme, and build configuration are MIT licensed — see
[LICENSE](LICENSE).

This does **not** extend to the figures in `images/`. Those are third-party
scientific figures, diagrams, and photographs reproduced here under the original
talk's academic use; each one links to its source, and the rights remain with
their respective owners.
