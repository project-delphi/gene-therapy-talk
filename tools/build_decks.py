#!/usr/bin/env python3
"""Build the conference exports of the ML in Gene Therapy talk.

    uv run --with python-pptx --with pillow python3 tools/build_decks.py

Produces, in viii-encuentro-acoi-unimagdalena/:

  * ACOI-styled deck (full and a ~10 minute cut), pptx + pdf
  * the deck in its own dark styling, pptx + pdf

The ACOI styling comes from the template the organisers attached to their
acceptance email; the dark styling comes from source/gene_therapy.pptx, which
is also where theme.scss took its palette.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import deckmodel  # noqa: E402
import deckrender as dr  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "viii-encuentro-acoi-unimagdalena"
TEMPLATE = REPO / "no_commit" / "FORMATO DIAPOSITIVAS ACOI 2026 (1) (1).pptx"
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# The 10-minute cut: 12 content slides plus the closing question slide. Titles
# are matched against the headings in index.qmd, so this list has to be
# re-synced whenever those are rewritten — `main()` checks and warns.
#
# Only slides that survive deckmodel's `.webonly` filter can be named here;
# anything built around a live WebGL stage never reaches the .pptx. That rules
# out the search-space, shuffling, VAE and ITR visualisations, so the cut
# carries their argument through the static slides either side.
#
# The order below follows the talk's spine: the defect is why AAV is a vector,
# being a vector cost integration, episomal means one shot, the dose is capped,
# and potency per particle is the only lever that moves.
SHORT_DECK = [
    "Delandistrogene moxeparvovec",
    "Defective by design",
    "The budget decides the medicine",
    "From the needle to the cell",
    "Why expression fades",
    "The therapeutic window",
    "Three modules",
    "What shuffling produced",
    "Discriminative or generative",
    "What deep mutational scanning measures",
    "Machine-guided capsid design",
    "Where this goes",
    "Questions",
]


def extract_logo(dest: Path) -> Path:
    """Pull the ACOI mark out of the organisers' template."""
    with zipfile.ZipFile(TEMPLATE) as z:
        dest.write_bytes(z.read("ppt/media/image2.png"))
    return dest


def to_pdf(pptx: Path) -> Path:
    subprocess.run(
        [SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", str(pptx.parent),
         str(pptx)],
        check=True, capture_output=True,
    )
    pdf = pptx.with_suffix(".pdf")
    if not pdf.exists():
        raise RuntimeError(f"LibreOffice produced no PDF for {pptx.name}")
    return pdf


def reveal_pdf(dest: Path) -> Path:
    """Print the published reveal.js deck straight to PDF via headless Chrome."""
    import http.server
    import socketserver
    import threading

    docs = REPO / "docs"

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(docs), **k)

        def log_message(self, *a):
            pass

    handler = Quiet
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        try:
            subprocess.run(
                [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                 "--run-all-compositor-stages-before-draw",
                 "--virtual-time-budget=30000",
                 f"--print-to-pdf={dest}",
                 f"http://127.0.0.1:{port}/index.html?print-pdf"],
                check=True, capture_output=True,
            )
        finally:
            srv.shutdown()
    if not dest.exists():
        raise RuntimeError("Chrome produced no PDF for the reveal deck")
    return dest


def main() -> None:
    if not TEMPLATE.exists():
        sys.exit(f"missing ACOI template: {TEMPLATE}")

    meta, slides = deckmodel.parse(REPO / "index.qmd")
    print(f"parsed {len(slides)} slides from index.qmd")

    # SHORT_DECK selects slides by exact heading text, so a rewrite of
    # index.qmd silently empties the 10-minute cut instead of failing. Say so.
    titles = {s.title for s in slides}
    missing = [t for t in SHORT_DECK if t not in titles]
    if missing:
        print(f"  !! SHORT_DECK is stale: {len(missing)}/{len(SHORT_DECK)} headings "
              f"no longer exist in index.qmd")
        for t in missing:
            print(f"     - {t!r}")
        print("     the 10-minute cut will be short or empty until this list is updated")

    # python-pptx cannot embed SVG, so deckmodel drops every `.svg` figure with
    # a note. A slide whose only content was a diagram therefore survives as a
    # title and a citation, and the per-deck "{n} slides" line still looks
    # right — which is how you end up presenting from a deck with blank slides
    # in it. Refuse to build instead.
    bare = [s for s in slides
            if s.kind == "content"
            and not any(c.blocks for r in s.rows for c in r.columns)]
    if bare:
        print(f"  !! {len(bare)} content slide(s) would export as title + citation only,")
        print("     because their content is an SVG diagram and pptx cannot embed SVG:")
        for s in bare:
            in_cut = " (in the 10-minute cut)" if s.title in set(SHORT_DECK) else ""
            print(f"     - {s.title!r}{in_cut}")
        sys.exit("     rasterise the diagrams for the pptx path before building")

    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        logo = extract_logo(Path(tmp) / "acoi-logo.png")
        acoi = dr.acoi_theme(REPO, TEMPLATE)
        acoi.logo = logo
        original = dr.original_theme(REPO)

        jobs = [
            (acoi, None, OUT / "ml-in-gene-therapy-acoi.pptx"),
            (acoi, SHORT_DECK, OUT / "ml-in-gene-therapy-acoi-10min.pptx"),
            (original, None, OUT / "ml-in-gene-therapy-original.pptx"),
        ]
        for theme, only, dest in jobs:
            n = dr.render(meta, slides, theme, REPO, dest, only=only)
            print(f"  {dest.name}: {n} slides")

    for pptx in sorted(OUT.glob("*.pptx")):
        if pptx.stem.endswith("original"):
            continue
        print(f"  -> {to_pdf(pptx).name}")

    print("  -> ml-in-gene-therapy-original.pdf (reveal.js print-pdf)")
    reveal_pdf(OUT / "ml-in-gene-therapy-original.pdf")
    print(f"done: {OUT}")


if __name__ == "__main__":
    main()
