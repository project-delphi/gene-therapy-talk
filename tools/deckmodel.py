"""Pandoc AST -> slide model for the gene-therapy talk.

The reveal.js deck in index.qmd is regular enough to lower into a small,
explicit slide model: a header opens a slide, a `.columns` div opens a row of
columns, and everything else is a block inside the current column. Pandoc does
the markdown parsing; this module only reshapes its output.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

# --- inline model ----------------------------------------------------------


@dataclass
class Run:
    text: str
    bold: bool = False
    italic: bool = False
    mono: bool = False
    # One of: body, bang, link, quote. Picked up by the theme's palette.
    role: str = "body"
    href: str | None = None


# --- block model -----------------------------------------------------------


@dataclass
class Bullets:
    # (indent level, runs) — level 0 is a top-level bullet.
    items: list[tuple[int, list[Run]]] = field(default_factory=list)


@dataclass
class Text:
    runs: list[Run]
    quote: bool = False


@dataclass
class Figure:
    path: str
    href: str | None = None
    # `.figspot` figures are incidental decoration and stay small, matching
    # the max-height rule in theme.scss.
    spot: bool = False


@dataclass
class Column:
    width: float  # fraction of the row
    blocks: list = field(default_factory=list)
    classes: tuple[str, ...] = ()


@dataclass
class Row:
    columns: list[Column] = field(default_factory=list)


@dataclass
class Slide:
    kind: str  # "section" | "content"
    title: str
    rows: list[Row] = field(default_factory=list)
    cite: list[Run] | None = None
    # Classes from the heading. `.webonly` marks a slide built around a live
    # WebGL or molecular render, which has no still equivalent here, so it is
    # dropped from the PowerPoint export rather than exported empty.
    classes: tuple[str, ...] = ()


# --- inline walk -----------------------------------------------------------


def _inlines(nodes, *, role="body", bold=False, italic=False, href=None) -> list[Run]:
    out: list[Run] = []

    def emit(text, **kw):
        opts = dict(bold=bold, italic=italic, role=role, href=href)
        opts.update(kw)
        if out and out[-1].bold == opts["bold"] and out[-1].italic == opts["italic"] \
                and out[-1].role == opts["role"] and out[-1].href == opts["href"] \
                and out[-1].mono == opts.get("mono", False):
            out[-1].text += text
        else:
            out.append(Run(text, **opts))

    for n in nodes:
        t, c = n["t"], n.get("c")
        if t == "Str":
            emit(c)
        elif t == "Space":
            emit(" ")
        elif t in ("SoftBreak", "LineBreak"):
            emit(" ")
        elif t == "Code":
            emit(c[1], mono=True)
        elif t == "Math":
            # Three occurrences, all short conditional-probability expressions.
            emit(_math_to_text(c[1]), italic=True)
        elif t == "Strong":
            out.extend(_inlines(c, role=role, bold=True, italic=italic, href=href))
        elif t == "Emph":
            out.extend(_inlines(c, role=role, bold=bold, italic=True, href=href))
        elif t == "Quoted":
            quote = "“%s”" if c[0]["t"] == "DoubleQuote" else "‘%s’"
            inner = _inlines(c[1], role=role, bold=bold, italic=italic, href=href)
            if inner:
                inner[0].text = quote.split("%s")[0] + inner[0].text
                inner[-1].text = inner[-1].text + quote.split("%s")[1]
            out.extend(inner)
        elif t == "Span":
            attr, inner = c
            span_role = "bang" if "bang" in attr[1] else role
            out.extend(_inlines(inner, role=span_role, bold=bold, italic=italic, href=href))
        elif t == "Link":
            _, inner, (url, _) = c
            out.extend(_inlines(inner, role="link", bold=bold, italic=italic, href=url))
        elif t == "Cite":
            # With --citeproc the second element is the rendered citation
            # ("Xie et al. 2002"); without it, the literal "[@xie2002]".
            out.extend(_inlines(c[1], role=role, bold=bold, italic=italic, href=href))
        elif t in ("RawInline", "Note"):
            pass  # no representation on a slide
        elif t == "Image":
            pass  # handled at block level
        else:
            raise ValueError(f"unhandled inline node: {t}")
    return out


def _math_to_text(tex: str) -> str:
    return (tex.replace("\\mid", "|").replace("\\,", " ").replace("$", "").strip())


def _lone_image(blocks):
    """Return (path, href) if `blocks` is exactly one image, else None."""
    if len(blocks) != 1 or blocks[0]["t"] not in ("Para", "Plain"):
        return None
    inls = [i for i in blocks[0]["c"] if i["t"] != "Space"]
    if len(inls) != 1:
        return None
    node = inls[0]
    href = None
    if node["t"] == "Link":
        href = node["c"][2][0]
        inner = [i for i in node["c"][1] if i["t"] != "Space"]
        if len(inner) != 1 or inner[0]["t"] != "Image":
            return None
        node = inner[0]
    if node["t"] != "Image":
        return None
    return node["c"][2][0], href


# --- block walk ------------------------------------------------------------


def _bullets(items, level=0, acc=None) -> Bullets:
    acc = acc if acc is not None else Bullets()
    for item in items:
        for blk in item:
            if blk["t"] in ("Para", "Plain"):
                acc.items.append((level, _inlines(blk["c"])))
            elif blk["t"] == "BulletList":
                _bullets(blk["c"], level + 1, acc)
            else:
                raise ValueError(f"unhandled block in list item: {blk['t']}")
    return acc


# Divs that carry no slide content: speaker notes, and the containers the
# browser fills with a live render.
SKIP_DIV_CLASSES = {"notes", "viz-stage", "viz-host", "viz-caption"}


def _column_blocks(blocks) -> list:
    """Lower the blocks inside one column into the block model."""
    out = []
    for blk in blocks:
        t, c = blk["t"], blk.get("c")
        if t == "BulletList":
            out.append(_bullets(c))
        elif t in ("Para", "Plain"):
            img = _lone_image([blk])
            if img:
                out.append(Figure(img[0], img[1]))
            else:
                out.append(Text(_inlines(c)))
        elif t == "BlockQuote":
            for inner in c:
                out.append(Text(_inlines(inner["c"], role="quote"), quote=True))
        elif t == "Div":
            attr, inner = c
            classes = attr[1]
            # Speaker notes are not slide content, and the visualisation
            # containers are empty shells the browser fills at runtime.
            if SKIP_DIV_CLASSES.intersection(classes):
                continue
            img = _lone_image(inner)
            if img and img[0].lower().endswith(".svg"):
                # python-pptx cannot embed SVG. Skip rather than crash; the
                # slide keeps its text and loses the diagram.
                print(f"  note: skipping SVG for pptx export: {img[0]}")
            elif img and "figspot" in classes:
                out.append(Figure(img[0], img[1], spot=True))
            elif img:
                out.append(Figure(img[0], img[1]))
            else:
                out.extend(_column_blocks(inner))
        elif t == "Table":
            # The renderer positions text frames, not table shapes, so a table
            # is flattened to one bullet per row with the cells joined.
            rows = _table_rows(c)
            if rows:
                acc = Bullets()
                for cells in rows:
                    line = "  ·  ".join(x for x in cells if x)
                    if line:
                        acc.items.append((0, [Run(line)]))
                out.append(acc)
        elif t == "RawBlock":
            continue  # raw HTML has no PowerPoint equivalent
        else:
            raise ValueError(f"unhandled block: {t}")
    return out


def _table_rows(c) -> list[list[str]]:
    """Pandoc Table -> a list of rows of plain cell text."""
    _, _, _, head, bodies, foot = c
    rows: list[list[str]] = []

    def take(rowlist):
        for row in rowlist:
            cells = []
            for cell in row[1]:
                runs = []
                for blk in cell[4]:
                    if blk["t"] in ("Para", "Plain"):
                        runs.extend(_inlines(blk["c"]))
                cells.append("".join(r.text for r in runs).strip())
            if any(cells):
                rows.append(cells)

    take(head[1])
    for body in bodies:
        take(body[3])
    take(foot[1])
    return rows


def _parse_columns_div(blocks) -> Row:
    row = Row()
    for blk in blocks:
        if blk["t"] != "Div":
            raise ValueError("non-Div inside .columns")
        attr, inner = blk["c"]
        width = 1.0 / max(len(blocks), 1)
        for key, val in attr[2]:
            if key == "width":
                width = float(val.rstrip("%")) / 100.0
        row.columns.append(Column(width, _column_blocks(inner), tuple(attr[1])))
    return row


def parse(qmd: Path) -> tuple[dict, list[Slide]]:
    # --citeproc resolves the @citekeys in the .cite lines to author-year text
    # and expands the bibliography, so the export reads the same as the deck.
    ast = json.loads(
        subprocess.run(
            ["quarto", "pandoc", str(qmd), "-t", "json", "--citeproc"],
            check=True, capture_output=True, text=True,
            cwd=str(qmd.parent),
        ).stdout
    )
    meta = {
        k: "".join(r.text for r in _inlines(_meta_inlines(v)))
        for k, v in ast["meta"].items()
        if v["t"] in ("MetaInlines", "MetaString", "MetaBlocks")
    }

    slides: list[Slide] = []
    loose: list = []  # blocks not yet flushed into a row

    def flush_loose():
        if loose:
            slides[-1].rows.append(Row([Column(1.0, _column_blocks(loose))]))
            loose.clear()

    for blk in ast["blocks"]:
        t, c = blk["t"], blk.get("c")
        if t == "Header":
            if slides:
                flush_loose()
            level, attr, inls = c
            title = "".join(r.text for r in _inlines(inls))
            slides.append(Slide("section" if level == 1 else "content", title,
                                classes=tuple(attr[1])))
        elif t == "Div" and "cite" in c[0][1]:
            flush_loose()
            slides[-1].cite = _column_blocks(c[1])[0].runs
        elif t == "Div" and "columns" in c[0][1]:
            flush_loose()
            slides[-1].rows.append(_parse_columns_div(c[1]))
        else:
            loose.append(blk)
    if slides:
        flush_loose()
    # Slides built around a live render have no still to fall back on here.
    slides = [s for s in slides if "webonly" not in s.classes]
    return meta, slides


def _meta_inlines(v):
    if v["t"] == "MetaInlines":
        return v["c"]
    if v["t"] == "MetaString":
        return [{"t": "Str", "c": v["c"]}]
    if v["t"] == "MetaBlocks":
        return [i for b in v["c"] for i in b.get("c", [])]
    return []
