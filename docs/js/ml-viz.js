// Machine-learning visualisations for the ML act.
//
// These two are SVG rather than WebGL, deliberately. Both are diagrams whose
// content is mostly *text* — split tests, feature names, hit rates — and a
// texture-mapped label in a WebGL scene is blurry at the back of a room where
// an SVG <text> is not. They register into the same aav-viz lifecycle, so they
// still build lazily and stop animating on slide-leave.
//
// Palette is the deck's own, with one constraint checked rather than eyeballed:
// amber / cyan / magenta separate for deuteranopia, protanopia and tritanopia
// against the #0b0f14 ground (worst all-pairs CVD ΔE 10.4, normal 27.0). Teal
// is avoided here because teal↔cyan collapses to ΔE 3.5 under tritanopia, and
// these charts put the two next to each other.

const NS = 'http://www.w3.org/2000/svg';

const INK = '#f2f7fa';        // $gt-heading
const BODY = '#9fb3c8';       // $gt-body
const MUTED = '#6d8aa3';      // $gt-muted
const RULE = '#2b3a49';
const PANEL = '#121a23';      // $gt-surface
const AMBER = '#fbbf24';      // mouse, in vivo
const CYAN = '#38bdf8';       // human, in vitro
const MAGENTA = '#f472b6';    // the combined model — also the act colour
const SLATE = '#475569';      // neutral: no model, or a non-tropism control

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// A text node carrying text tokens, never a series colour — identity comes from
// the mark beside it.
function label(parent, x, y, str, { size = 17, fill = BODY, anchor = 'start', weight = null, family = null } = {}) {
  const t = el('text', { x, y, fill, 'font-size': size, 'text-anchor': anchor }, parent);
  if (weight) t.setAttribute('font-weight', weight);
  if (family) t.setAttribute('font-family', family);
  t.textContent = str;
  return t;
}

function stage(host, vb) {
  const svg = el('svg', {
    viewBox: `0 0 ${vb[0]} ${vb[1]}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  });
  Object.assign(svg.style, { width: '100%', height: '100%', display: 'block' });
  host.appendChild(svg);
  return svg;
}

// Controls that look and behave like the cell journey's, including the part
// that matters most: reveal.js must not read a button press as a slide change.
function controlBar(el_, aria) {
  // The stage gives up a band at its foot for the buttons. The host shrinks
  // with it, which is free here: an SVG rescales to whatever box it is given,
  // so unlike the WebGL stages there is no renderer to re-measure.
  el_.classList.add('has-controls');
  const bar = document.createElement('div');
  bar.className = 'ml-controls';
  bar.setAttribute('aria-label', aria);
  el_.appendChild(bar);
  const swallow = (e) => e.stopPropagation();
  ['keydown', 'pointerdown', 'click'].forEach((e) => bar.addEventListener(e, swallow));
  return {
    bar,
    button(text, action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.onclick = action;
      bar.appendChild(b);
      return b;
    },
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Smoothstep over [a,b] — the only easing used here.
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (u) => u * u * (3 - 2 * u);
const seg = (t, a, b) => ease(ramp(t, a, b));

// Deterministic jitter, so the ghost-tree shower is the same on every loop and
// on every machine — a presenter who rehearses should see what they rehearsed.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// viz: forest
// ---------------------------------------------------------------------------
// What a random forest actually computes, routed rather than mimed: the three
// drawn trees really are evaluated against the variant's feature vector, and
// the ensemble mean really is the mean of the leaves they reach.
//
// The teaching beats, in order: a tree is a cascade of threshold questions;
// each tree sees a different bootstrap sample and a random subset of features,
// so they disagree; averaging the disagreement is the whole trick.

export function forestFactory({ reduced, printing }) {
  return function forest({ host, cap, el: root }, w, h) {
    const VB = [1400, 540];
    const svg = stage(host, VB);
    svg.setAttribute('aria-label',
      'A variant’s features routed down three decision trees to three different leaf values, ' +
      'which average to the forest’s predicted fitness.');

    // Four tabular features. A forest is the natural model class for this shape
    // of data — a handful of engineered columns, not a raw sequence.
    const FEATURES = [
      { key: 'q', name: 'net charge', fmt: (v) => (v > 0 ? `+${v}` : `${v}`), lo: -2, hi: 3 },
      { key: 'h', name: 'hydrophobicity', fmt: (v) => v.toFixed(2), lo: 0, hi: 1 },
      { key: 'b', name: 'side-chain bulk', fmt: (v) => v.toFixed(2), lo: 0, hi: 1 },
      { key: 's', name: 'SASA at 588', fmt: (v) => v.toFixed(2), lo: 0, hi: 1 },
    ];

    // Illustrative 7-mers, deliberately not real capsid variants: the slide is
    // about the mechanism, and borrowing a published peptide here would imply
    // published numbers that these are not.
    const VARIANTS = [
      { pep: 'KSTQPFR', q: 2, h: 0.31, b: 0.44, s: 0.62 },
      { pep: 'WDPQMHC', q: -1, h: 0.72, b: 0.81, s: 0.25 },
      { pep: 'GNLTAVE', q: -1, h: 0.55, b: 0.38, s: 0.48 },
    ];

    // Three trees, each restricted to a different pair of features — that
    // restriction is the "random subspace" half of a random forest, and it is
    // why the three disagree about the same variant.
    const TREES = [
      {
        uses: 'charge · SASA',
        root: { f: 'q', thr: 0, test: 'charge ≤ 0' },
        kids: [
          { f: 's', thr: 0.40, test: 'SASA ≤ 0.40', leaves: [0.18, 0.41] },
          { f: 's', thr: 0.50, test: 'SASA ≤ 0.50', leaves: [0.55, 0.86] },
        ],
      },
      {
        uses: 'hydrophobicity · bulk',
        root: { f: 'h', thr: 0.50, test: 'hydroph. ≤ 0.50' },
        kids: [
          { f: 'b', thr: 0.50, test: 'bulk ≤ 0.50', leaves: [0.79, 0.52] },
          { f: 'b', thr: 0.60, test: 'bulk ≤ 0.60', leaves: [0.34, 0.12] },
        ],
      },
      {
        uses: 'bulk · charge',
        root: { f: 'b', thr: 0.60, test: 'bulk ≤ 0.60' },
        kids: [
          { f: 'q', thr: 0, test: 'charge ≤ 0', leaves: [0.37, 0.81] },
          { f: 'q', thr: 1, test: 'charge ≤ 1', leaves: [0.15, 0.44] },
        ],
      },
    ];

    // Route one variant down one tree. Returns which branch was taken at each
    // level and the leaf value reached.
    function route(tree, v) {
      const goLeft = v[tree.root.f] <= tree.root.thr;
      const kid = tree.kids[goLeft ? 0 : 1];
      const leafLeft = v[kid.f] <= kid.thr;
      return {
        rootLeft: goLeft,
        kidIndex: goLeft ? 0 : 1,
        leafIndex: (goLeft ? 0 : 2) + (leafLeft ? 0 : 1),
        value: kid.leaves[leafLeft ? 0 : 1],
      };
    }

    // --- geometry ---------------------------------------------------------
    const PANEL_X = 14, PANEL_W = 250;
    const TREE_X = 300, TREE_W = 232, TREE_GAP = 20;
    const AXIS_X = 1272, AXIS_TOP = 118, AXIS_BOT = 452;
    const yOf = (v) => AXIS_BOT - v * (AXIS_BOT - AXIS_TOP);

    // --- variant panel ----------------------------------------------------
    el('rect', {
      x: PANEL_X, y: 60, width: PANEL_W, height: 414, rx: 8,
      fill: PANEL, stroke: RULE,
    }, svg);
    label(svg, PANEL_X + 16, 46, 'ONE VARIANT', { size: 15, fill: MUTED, weight: 'bold' });

    const resBoxes = [], resText = [];
    const RES_W = 29, RES_X = PANEL_X + 18;
    for (let i = 0; i < 7; i++) {
      resBoxes.push(el('rect', {
        x: RES_X + i * (RES_W + 3), y: 80, width: RES_W, height: 34, rx: 4,
        fill: '#1d2b38', stroke: RULE,
      }, svg));
      resText.push(label(svg, RES_X + i * (RES_W + 3) + RES_W / 2, 104, '', {
        size: 19, fill: INK, anchor: 'middle', weight: 'bold', family: 'monospace',
      }));
    }
    label(svg, RES_X, 136, '7-mer inserted at VR-VIII', { size: 14, fill: MUTED });

    const featRows = FEATURES.map((f, i) => {
      const y = 182 + i * 72;
      label(svg, PANEL_X + 18, y, f.name, { size: 16, fill: BODY });
      const val = label(svg, PANEL_X + PANEL_W - 18, y, '', {
        size: 17, fill: INK, anchor: 'end', weight: 'bold', family: 'monospace',
      });
      el('rect', {
        x: PANEL_X + 18, y: y + 12, width: PANEL_W - 36, height: 7, rx: 3.5, fill: '#1d2b38',
      }, svg);
      const bar = el('rect', {
        x: PANEL_X + 18, y: y + 12, width: 0, height: 7, rx: 3.5, fill: SLATE,
      }, svg);
      return { f, val, bar, max: PANEL_W - 36 };
    });
    label(svg, PANEL_X + 18, 466, 'four engineered columns', { size: 14, fill: MUTED });

    // --- trees ------------------------------------------------------------
    // Ghost stack behind each tree: the other 497 are real members of the
    // ensemble, not decoration, so they get drawn even if only as a hint.
    const treeViews = TREES.map((tree, ti) => {
      const x0 = TREE_X + ti * (TREE_W + TREE_GAP);
      const cx = x0 + TREE_W / 2;
      const g = el('g', {}, svg);

      for (let k = 3; k >= 1; k--) {
        el('rect', {
          x: x0 + k * 5, y: 74 + k * 5, width: TREE_W, height: 320, rx: 8,
          fill: 'none', stroke: RULE, opacity: 0.5 - k * 0.1,
        }, g);
      }
      el('rect', {
        x: x0, y: 74, width: TREE_W, height: 320, rx: 8, fill: PANEL, stroke: RULE,
      }, g);
      label(g, x0 + 12, 60, `TREE ${ti + 1}`, { size: 14, fill: MUTED, weight: 'bold' });
      label(g, x0 + TREE_W - 12, 60, tree.uses, { size: 13, fill: MUTED, anchor: 'end' });

      const ROOT_Y = 112, KID_Y = 212, LEAF_Y = 330;
      const kidX = [cx - 58, cx + 58];
      const leafX = [cx - 86, cx - 30, cx + 30, cx + 86];

      // Edges first, so nodes sit on top of them.
      const edges = [];
      const edge = (x1, y1, x2, y2) => {
        const base = el('path', {
          d: `M ${x1} ${y1} L ${x2} ${y2}`, stroke: RULE, 'stroke-width': 2, fill: 'none',
        }, g);
        const lit = el('path', {
          d: `M ${x1} ${y1} L ${x2} ${y2}`, stroke: MAGENTA, 'stroke-width': 3,
          fill: 'none', 'stroke-linecap': 'round', opacity: 0,
        }, g);
        edges.push({ base, lit });
        return edges.length - 1;
      };
      const eRoot = [edge(cx, ROOT_Y + 17, kidX[0], KID_Y - 17), edge(cx, ROOT_Y + 17, kidX[1], KID_Y - 17)];
      const eKid = [
        [edge(kidX[0], KID_Y + 17, leafX[0], LEAF_Y - 15), edge(kidX[0], KID_Y + 17, leafX[1], LEAF_Y - 15)],
        [edge(kidX[1], KID_Y + 17, leafX[2], LEAF_Y - 15), edge(kidX[1], KID_Y + 17, leafX[3], LEAF_Y - 15)],
      ];

      // An internal node is a split test; the text is the question it asks.
      const node = (x, y, text, wide) => {
        const bw = wide ? 150 : 128;
        const box = el('rect', {
          x: x - bw / 2, y: y - 17, width: bw, height: 34, rx: 17,
          fill: '#182430', stroke: RULE, 'stroke-width': 1.5,
        }, g);
        const t = label(g, x, y + 6, text, { size: 14, fill: BODY, anchor: 'middle' });
        return { box, t };
      };
      const rootNode = node(cx, ROOT_Y, tree.root.test, true);
      const kidNodes = tree.kids.map((k, i) => node(kidX[i], KID_Y, k.test, false));

      // Leaves carry the value the tree would predict.
      const leaves = [];
      const allLeaves = [...tree.kids[0].leaves, ...tree.kids[1].leaves];
      for (let i = 0; i < 4; i++) {
        const box = el('rect', {
          x: leafX[i] - 25, y: LEAF_Y - 15, width: 50, height: 30, rx: 6,
          fill: '#162029', stroke: RULE, 'stroke-width': 1.5,
        }, g);
        const t = label(g, leafX[i], LEAF_Y + 6, allLeaves[i].toFixed(2), {
          size: 15, fill: MUTED, anchor: 'middle', family: 'monospace',
        });
        leaves.push({ box, t });
      }

      // The token that descends the tree, and the dot that carries the leaf
      // value out to the axis.
      const token = el('circle', { cx, cy: ROOT_Y, r: 7, fill: INK, opacity: 0 }, g);
      const flyer = el('circle', { cx: 0, cy: 0, r: 5.5, fill: MAGENTA, opacity: 0 }, svg);

      return {
        tree, cx, edges, eRoot, eKid, rootNode, kidNodes, leaves, token, flyer,
        ROOT_Y, KID_Y, LEAF_Y, kidX, leafX,
      };
    });

    label(svg, TREE_X, 492,
      'Each tree: a different bootstrap sample of the data, and a random subset of the features — so the three disagree.',
      { size: 15, fill: MUTED });
    label(svg, TREE_X + (TREE_W + TREE_GAP) * 2 + TREE_W - 12, 418, '+ 497 more trees', {
      size: 14, fill: MUTED, anchor: 'end',
    });

    // --- prediction axis --------------------------------------------------
    el('line', {
      x1: AXIS_X, y1: AXIS_TOP, x2: AXIS_X, y2: AXIS_BOT, stroke: RULE, 'stroke-width': 2,
    }, svg);
    for (let i = 0; i <= 5; i++) {
      const v = i / 5;
      el('line', {
        x1: AXIS_X - 5, y1: yOf(v), x2: AXIS_X, y2: yOf(v), stroke: RULE, 'stroke-width': 2,
      }, svg);
      label(svg, AXIS_X - 11, yOf(v) + 5, v.toFixed(1), { size: 13, fill: MUTED, anchor: 'end' });
    }
    label(svg, AXIS_X - 11, 92, 'predicted fitness', { size: 14, fill: MUTED, anchor: 'end' });

    // 497 ghost votes, drawn around the ensemble mean so the mean stays honest.
    const GHOSTS = 90;
    const ghostTicks = [];
    for (let i = 0; i < GHOSTS; i++) {
      ghostTicks.push(el('line', {
        x1: AXIS_X + 4, y1: 0, x2: AXIS_X + 16, y2: 0,
        stroke: CYAN, 'stroke-width': 1.5, opacity: 0,
      }, svg));
    }
    // The three drawn trees' own votes sit on top, longer and brighter.
    const treeTicks = treeViews.map(() => el('line', {
      x1: AXIS_X + 4, y1: 0, x2: AXIS_X + 26, y2: 0,
      stroke: INK, 'stroke-width': 2.5, opacity: 0, 'stroke-linecap': 'round',
    }, svg));

    const meanG = el('g', { opacity: 0 }, svg);
    el('path', { d: 'M 0 0 L -13 -8 L -13 8 Z', fill: MAGENTA }, meanG);
    el('line', { x1: 0, y1: 0, x2: 44, y2: 0, stroke: MAGENTA, 'stroke-width': 3 }, meanG);
    const meanVal = label(meanG, 50, 7, '', { size: 23, fill: INK, weight: 'bold', family: 'monospace' });
    const meanCap = label(meanG, 50, 28, 'forest prediction', { size: 14, fill: MUTED });

    const spreadG = el('g', { opacity: 0 }, svg);
    const spreadBar = el('line', {
      x1: AXIS_X + 36, y1: 0, x2: AXIS_X + 36, y2: 0, stroke: MUTED, 'stroke-width': 1.5,
    }, spreadG);
    const spreadTop = el('line', { x1: AXIS_X + 32, y1: 0, x2: AXIS_X + 40, y2: 0, stroke: MUTED, 'stroke-width': 1.5 }, spreadG);
    const spreadBot = el('line', { x1: AXIS_X + 32, y1: 0, x2: AXIS_X + 40, y2: 0, stroke: MUTED, 'stroke-width': 1.5 }, spreadG);

    // Legend: two marks, so identity is never carried by colour alone.
    const leg = el('g', {}, svg);
    el('line', { x1: AXIS_X - 2, y1: 486, x2: AXIS_X + 14, y2: 486, stroke: INK, 'stroke-width': 2.5 }, leg);
    label(leg, AXIS_X + 20, 491, 'the 3 trees shown', { size: 13, fill: MUTED });
    el('line', { x1: AXIS_X - 2, y1: 508, x2: AXIS_X + 14, y2: 508, stroke: CYAN, 'stroke-width': 1.5 }, leg);
    label(leg, AXIS_X + 20, 513, 'the rest of the forest', { size: 13, fill: MUTED });

    cap.textContent = 'Illustrative features and tree values — the routing and the average are really computed';

    // --- playback ---------------------------------------------------------
    const CYCLE = 13;
    let time = 0;
    let playing = !reduced && !printing;
    let pick = -1;   // -1 = follow the clock

    const ctl = controlBar(root, 'Random forest controls');
    const playBtn = ctl.button(playing ? 'Pause' : 'Play', () => {
      playing = !playing;
      playBtn.textContent = playing ? 'Pause' : 'Play';
      draw(0);
    });
    ctl.button('Restart', () => { time = 0; pick = -1; draw(0); });
    const picks = VARIANTS.map((v, i) => ctl.button(v.pep, () => {
      pick = i;
      // Land late enough in the cycle that the whole result is on screen.
      time = i * CYCLE + CYCLE * 0.84;
      playing = false;
      playBtn.textContent = 'Play';
      draw(0);
    }));

    function draw(dt, settled) {
      if (playing && !settled) time += dt;
      if (settled) time = CYCLE * 0.84;   // one-shot paint: show a finished prediction

      const span = CYCLE * VARIANTS.length;
      time = ((time % span) + span) % span;
      const vi = Math.floor(time / CYCLE);
      const t = (time % CYCLE) / CYCLE;
      const v = VARIANTS[vi];

      picks.forEach((b, i) => b.setAttribute('aria-pressed', String(pick === i ? true : (pick === -1 && vi === i))));

      // 1. The variant arrives.
      const peptide = seg(t, 0.02, 0.14);
      for (let i = 0; i < 7; i++) {
        const u = clamp01(peptide * 7 - i);
        resText[i].textContent = u > 0.4 ? v.pep[i] : '';
        resBoxes[i].setAttribute('fill', u > 0.4 ? '#24323f' : '#1d2b38');
        resBoxes[i].setAttribute('stroke', u > 0.4 ? SLATE : RULE);
      }
      const feats = seg(t, 0.10, 0.24);
      featRows.forEach(({ f, val, bar, max }, i) => {
        const u = clamp01(feats * 4 - i * 0.6);
        const raw = v[f.key];
        val.textContent = u > 0.3 ? f.fmt(raw) : '';
        bar.setAttribute('width', max * ((raw - f.lo) / (f.hi - f.lo)) * u);
      });

      // 2. Each tree routes it. Staggered, so three cascades read as three.
      const routes = treeViews.map((tv) => route(tv.tree, v));
      treeViews.forEach((tv, ti) => {
        const r = routes[ti];
        const a = 0.24 + ti * 0.075;        // this tree's descent starts here
        const d = seg(t, a, a + 0.17);      // 0 at the root, 1 at the leaf
        const live = d > 0 && d < 1;

        tv.token.setAttribute('opacity', d > 0 && d < 0.999 ? 1 : 0);
        // Two legs: root -> chosen child, then child -> chosen leaf.
        const leg = d < 0.5 ? 0 : 1;
        const u = leg === 0 ? d / 0.5 : (d - 0.5) / 0.5;
        const from = leg === 0
          ? { x: tv.cx, y: tv.ROOT_Y }
          : { x: tv.kidX[r.kidIndex], y: tv.KID_Y };
        const to = leg === 0
          ? { x: tv.kidX[r.kidIndex], y: tv.KID_Y }
          : { x: tv.leafX[r.leafIndex], y: tv.LEAF_Y };
        tv.token.setAttribute('cx', from.x + (to.x - from.x) * u);
        tv.token.setAttribute('cy', from.y + (to.y - from.y) * u);

        // Light the taken edges, dim the rest.
        const takenRoot = tv.eRoot[r.rootLeft ? 0 : 1];
        const takenKid = tv.eKid[r.kidIndex][r.leafIndex % 2];
        tv.edges.forEach((e, i) => {
          const on = (i === takenRoot && d > 0.04) || (i === takenKid && d > 0.52);
          e.lit.setAttribute('opacity', on ? Math.min(1, seg(t, a, a + 0.2) * 1.4) : 0);
          e.base.setAttribute('opacity', on ? 0 : 0.55);
        });

        // Highlight the node being evaluated.
        const rootHot = d > 0 && d < 0.55;
        tv.rootNode.box.setAttribute('stroke', rootHot ? MAGENTA : RULE);
        tv.rootNode.t.setAttribute('fill', d > 0 ? INK : BODY);
        tv.kidNodes.forEach((n, i) => {
          const hot = i === r.kidIndex && d >= 0.5 && d < 1;
          const used = i === r.kidIndex && d >= 0.5;
          n.box.setAttribute('stroke', hot ? MAGENTA : RULE);
          n.box.setAttribute('opacity', d > 0.5 && !used ? 0.4 : 1);
          n.t.setAttribute('fill', used ? INK : BODY);
        });

        // The reached leaf pops; the three it did not reach recede.
        tv.leaves.forEach((lf, i) => {
          const reached = i === r.leafIndex && d >= 0.995;
          lf.box.setAttribute('stroke', reached ? MAGENTA : RULE);
          lf.box.setAttribute('fill', reached ? '#2a1b27' : '#162029');
          lf.box.setAttribute('opacity', d >= 0.995 && !reached ? 0.35 : 1);
          lf.t.setAttribute('fill', reached ? INK : MUTED);
          lf.t.setAttribute('font-weight', reached ? 'bold' : 'normal');
        });

        // Carry the value out to the axis.
        const fly = seg(t, a + 0.19, a + 0.30);
        const sx = tv.leafX[r.leafIndex], sy = tv.LEAF_Y;
        const dx = AXIS_X + 15, dy = yOf(r.value);
        tv.flyer.setAttribute('opacity', fly > 0 && fly < 1 ? 1 : 0);
        tv.flyer.setAttribute('cx', sx + (dx - sx) * fly);
        // Arc it, so three simultaneous flights stay distinguishable.
        tv.flyer.setAttribute('cy', sy + (dy - sy) * fly - Math.sin(fly * Math.PI) * 42);

        const tick = treeTicks[ti];
        tick.setAttribute('y1', dy);
        tick.setAttribute('y2', dy);
        tick.setAttribute('opacity', fly >= 1 ? 1 : 0);
        void live;
      });

      // 3. The rest of the forest votes.
      const mean = routes.reduce((s, r) => s + r.value, 0) / routes.length;
      const shower = seg(t, 0.58, 0.76);
      const rand = rng(1013 + vi * 7919);
      let lo = 1, hi = 0;
      for (let i = 0; i < GHOSTS; i++) {
        // Box-Muller, spread around the ensemble mean.
        const u1 = Math.max(1e-6, rand()), u2 = rand();
        const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const val = clamp01(mean + g * 0.135);
        if (val < lo) lo = val;
        if (val > hi) hi = val;
        const on = shower * GHOSTS > i;
        ghostTicks[i].setAttribute('y1', yOf(val));
        ghostTicks[i].setAttribute('y2', yOf(val));
        ghostTicks[i].setAttribute('opacity', on ? 0.5 : 0);
      }

      // 4. The average is the prediction.
      const settle = seg(t, 0.78, 0.9);
      meanG.setAttribute('opacity', settle);
      meanG.setAttribute('transform', `translate(${AXIS_X + 30} ${yOf(mean)})`);
      meanVal.textContent = mean.toFixed(2);
      void meanCap;

      spreadG.setAttribute('opacity', settle * 0.9);
      spreadBar.setAttribute('y1', yOf(hi));
      spreadBar.setAttribute('y2', yOf(lo));
      spreadTop.setAttribute('y1', yOf(hi));
      spreadTop.setAttribute('y2', yOf(hi));
      spreadBot.setAttribute('y1', yOf(lo));
      spreadBot.setAttribute('y2', yOf(lo));

      root.dataset.variant = v.pep;
    }

    draw(0);

    return {
      debug: { svg },
      frame: draw,
      resize() { /* the viewBox scales itself */ },
      dispose() {
        svg.remove();
        ctl.bar.remove();
      },
    };
  };
}

// ---------------------------------------------------------------------------
// viz: cross-species transfer
// ---------------------------------------------------------------------------
// The Fit4Function result, drawn from the paper's own transferability table:
// how well each predictor, alone and in combination, recovers macaque liver
// transduction hits. The argument is in the gap between the best single model
// and the six together — and in how little production fitness tells you.

export function crossSpeciesFactory({ reduced, printing }) {
  return function crossSpecies({ host, cap, el: root }, w, h) {
    const VB = [1080, 596];
    const svg = stage(host, VB);
    svg.setAttribute('aria-label',
      'Macaque liver transduction hit rate by predictor set. No model 0.24; production fitness alone 0.27; ' +
      'THLE binding 0.59; mouse liver 0.70; HepG2 binding 0.75; HepG2 transduction 0.85; ' +
      'THLE transduction 0.86; all six models combined 0.91.');

    // Eid et al. 2024, Nat Commun 15:6602 — data/transferability.csv in the
    // authors' repository. `kind` drives colour: amber for the mouse in vivo
    // predictor, cyan for the four human in vitro ones, slate for production
    // (a manufacturability control, not a tropism signal), magenta for the
    // combination. Sorted ascending, so the headline lands last.
    const ROWS = [
      { label: 'no model', sub: 'baseline', tpr: 0.237, kind: 'none' },
      { label: 'Production fitness', sub: 'manufacturability', tpr: 0.269, kind: 'prod' },
      { label: 'THLE binding', sub: 'human, in vitro', tpr: 0.590, kind: 'human' },
      { label: 'Mouse liver', sub: 'mouse, in vivo', tpr: 0.698, kind: 'mouse' },
      { label: 'HepG2 binding', sub: 'human, in vitro', tpr: 0.746, kind: 'human' },
      { label: 'HepG2 transduction', sub: 'human, in vitro', tpr: 0.851, kind: 'human' },
      { label: 'THLE transduction', sub: 'human, in vitro', tpr: 0.856, kind: 'human' },
      { label: 'All six models', sub: 'mouse in vivo + human in vitro + production', tpr: 0.911, kind: 'all' },
    ];
    const FILL = { none: 'none', prod: SLATE, mouse: AMBER, human: CYAN, all: MAGENTA };

    const LAB_W = 322;
    const X0 = LAB_W + 24;
    const X1 = 884;
    const TOP = 96;
    const ROW_H = 50;
    const xOf = (v) => X0 + v * (X1 - X0);

    label(svg, 14, 34, 'Macaque liver transduction, recovered by predictor set', {
      size: 21, fill: INK, weight: 'bold',
    });
    label(svg, 14, 58, 'true-positive rate · models trained only on mouse in vivo and human in vitro data', {
      size: 15, fill: MUTED,
    });

    // Recessive grid, behind the marks.
    for (let i = 0; i <= 5; i++) {
      const v = i / 5;
      el('line', {
        x1: xOf(v), y1: TOP - 10, x2: xOf(v), y2: TOP + ROWS.length * ROW_H - 10,
        stroke: RULE, 'stroke-width': 1, opacity: i === 0 ? 1 : 0.45,
      }, svg);
      label(svg, xOf(v), TOP + ROWS.length * ROW_H + 10, v.toFixed(1), {
        size: 14, fill: MUTED, anchor: 'middle',
      });
    }
    label(svg, (X0 + X1) / 2, TOP + ROWS.length * ROW_H + 34, 'hit rate in macaque', {
      size: 15, fill: MUTED, anchor: 'middle',
    });

    const bars = ROWS.map((r, i) => {
      const y = TOP + i * ROW_H;
      const headline = r.kind === 'all';
      const bh = headline ? 30 : 22;
      const by = y + (headline ? -4 : 0);

      label(svg, LAB_W, y + (r.sub ? 10 : 15), r.label, {
        size: headline ? 18 : 16,
        fill: headline ? INK : BODY,
        anchor: 'end',
        weight: headline ? 'bold' : null,
      });
      if (r.sub) {
        label(svg, LAB_W, y + 27, r.sub, { size: 12.5, fill: MUTED, anchor: 'end' });
      }

      // "No model" is an absence, so it is drawn as an outline rather than a fill.
      const bar = el('rect', {
        x: X0, y: by, width: 0, height: bh, rx: 4,
        fill: r.kind === 'none' ? 'none' : FILL[r.kind],
        stroke: r.kind === 'none' ? SLATE : 'none',
        'stroke-dasharray': r.kind === 'none' ? '5 4' : null,
        'stroke-width': r.kind === 'none' ? 1.5 : 0,
      }, svg);
      const val = label(svg, X0, by + bh / 2 + 6, '', {
        size: headline ? 21 : 16,
        fill: headline ? INK : BODY,
        weight: headline ? 'bold' : null,
        family: 'monospace',
      });
      return { r, bar, val, by, bh };
    });

    // The gap that carries the argument: best single model to all six.
    const ALL = ROWS[ROWS.length - 1].tpr;
    const bestSingle = Math.max(...ROWS.filter((r) => r.kind !== 'all' && r.kind !== 'none').map((r) => r.tpr));
    const gapG = el('g', { opacity: 0 }, svg);
    const gy1 = TOP + 7 * ROW_H + 11;
    // A tick down from where the best single predictor reached, so the headline
    // bar is read against it rather than against the axis.
    el('line', {
      x1: xOf(bestSingle), y1: TOP + 6 * ROW_H + 11, x2: xOf(bestSingle), y2: gy1,
      stroke: MUTED, 'stroke-width': 1.5, 'stroke-dasharray': '4 4',
    }, gapG);
    label(gapG, xOf(ALL) + 68, gy1 - 4, `+${(ALL - bestSingle).toFixed(2)} over the`, { size: 13, fill: MUTED });
    label(gapG, xOf(ALL) + 68, gy1 + 13, 'best single model', { size: 13, fill: MUTED });

    const legend = el('g', {}, svg);
    const LEG_Y = TOP + ROWS.length * ROW_H + 68;
    [['mouse, in vivo', AMBER], ['human, in vitro', CYAN], ['production', SLATE], ['all six combined', MAGENTA]]
      .forEach(([text, colour], i) => {
        const lx = 14 + i * 258;
        el('rect', { x: lx, y: LEG_Y - 11, width: 26, height: 12, rx: 3, fill: colour }, legend);
        label(legend, lx + 34, LEG_Y, text, { size: 14.5, fill: BODY });
      });

    cap.textContent = 'Eid et al. 2024, Nature Communications — transferability data from the authors’ repository';

    const CYCLE = 9;
    let time = 0;
    let playing = !reduced && !printing;
    const ctl = controlBar(root, 'Cross-species chart controls');
    const playBtn = ctl.button(playing ? 'Pause' : 'Play', () => {
      playing = !playing;
      playBtn.textContent = playing ? 'Pause' : 'Play';
      draw(0);
    });
    ctl.button('Replay', () => { time = 0; playing = true; playBtn.textContent = 'Pause'; draw(0); });

    function draw(dt, settled) {
      if (playing && !settled) time += dt;
      if (settled) time = CYCLE;
      const t = Math.min(time / CYCLE, 1);

      bars.forEach(({ r, bar, val, by, bh }, i) => {
        // Staggered growth, the headline bar last and slowest.
        const a = 0.06 + i * 0.075;
        const u = seg(t, a, a + 0.26);
        const wpx = (xOf(r.tpr) - X0) * u;
        bar.setAttribute('width', Math.max(0, wpx));
        val.setAttribute('x', X0 + wpx + 10);
        val.textContent = u > 0.05 ? (u * r.tpr).toFixed(2) : '';
        void by; void bh;
      });

      gapG.setAttribute('opacity', seg(t, 0.82, 0.95));
    }

    draw(0);

    return {
      debug: { svg },
      frame: draw,
      resize() { /* the viewBox scales itself */ },
      dispose() {
        svg.remove();
        ctl.bar.remove();
      },
    };
  };
}
