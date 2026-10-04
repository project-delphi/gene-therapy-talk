// Visualisations for the AAV deck.
//
// Everything here exists to solve one problem: reveal.js keeps every slide that
// is not the current one at `display: none`. A canvas built at parse time
// therefore measures 0x0, `camera.aspect` becomes NaN, and the slide renders
// blank for the rest of the talk. So nothing initialises on load — a viz is
// built the first time its slide is actually reached, and only once the
// container reports a non-zero box.
//
// The second problem is power. A requestAnimationFrame loop left running costs
// GPU for the whole talk, on a laptop that has to survive the whole talk. Every
// loop here starts on slide-enter and is cancelled on slide-leave.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BG = 0x0b0f14;          // $gt-bg
const ACCENT = 0x2dd4bf;      // $gt-accent-bright
const LINK = 0x38bdf8;        // $gt-link
const WARM = 0xfb923c;
const VIOLET = 0xa78bfa;
const MAGENTA = 0xf472b6;
const AMBER = 0xfbbf24;

// Printing flattens the deck: every slide is laid out at once and the print
// driver screenshots it, so animation is meaningless and parallel WebGL
// contexts are actively harmful. Render one frame and stop.
const PRINTING = /print-pdf/.test(window.location.search);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STATIC = PRINTING || REDUCED;

const DPR = Math.min(window.devicePixelRatio || 1, 2);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function fallback(el, msg) {
  el.classList.add('viz-fallback');
  const img = el.dataset.still;
  el.innerHTML = img
    ? `<img src="${img}" alt="${el.dataset.alt || ''}">`
    : `<p>${msg}</p>`;
}

// --- shared scaffolding ----------------------------------------------------

// Every stage gets a host element for the renderer and a caption element
// beside it, never on top of it. The host is absolutely positioned above the
// caption band, so a caption can never cover the thing it describes and the
// renderer gets an unambiguous box to measure.
function scaffold(el) {
  let host = el.querySelector(':scope > .viz-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'viz-host';
    el.appendChild(host);
  }
  let cap = el.querySelector(':scope > .viz-caption');
  if (!cap) {
    cap = document.createElement('div');
    cap.className = 'viz-caption';
    cap.textContent = el.dataset.caption || '';
    el.appendChild(cap);
  }
  return { host, cap };
}

function makeRenderer(host, w, h) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    // The static path (print-pdf, prefers-reduced-motion, backgrounded tab)
    // paints exactly one frame, outside any requestAnimationFrame callback.
    // With the default preserveDrawingBuffer:false that frame is discarded
    // before the compositor runs and the slide exports blank. NGL sets this
    // for the same reason.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(DPR);
  renderer.setSize(w, h, false);
  renderer.setClearColor(BG, 0);
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  return renderer;
}

function orbit(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 40;
  // Without this, reveal.js reads a drag across the canvas as a swipe and
  // advances the slide out from under the thing you are trying to rotate.
  dom.style.touchAction = 'none';
  return controls;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((mat) => {
      Object.values(mat).forEach((v) => { if (v && v.isTexture) v.dispose(); });
      mat.dispose();
    });
  });
}

// --- viz: episome ----------------------------------------------------------
// ssDNA -> second-strand synthesis -> ITR-mediated circularisation. This is the
// one sequence in the deck with no deposited structure to show, which is
// exactly why it is drawn rather than rendered from coordinates.

function episome({ host, cap }, w, h) {
  const N = 240;              // beads along the genome
  const SPAN = 17;            // contour length, world units
  const R = SPAN / (Math.PI * 2);   // radius once closed, so the circle is to scale
  const RISE = 0.42;          // helical amplitude
  const TWIST = 24;           // turns of the double helix

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(0, 2.4, 15.5);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(4, 6, 9);
  scene.add(key);

  // Drawn as instanced beads rather than THREE.Line: WebGL line width is
  // locked to one device pixel on every platform that matters, which is
  // invisible from the back of a lecture theatre.
  const beadGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const mk = (color) => {
    const mesh = new THREE.InstancedMesh(beadGeo, new THREE.MeshLambertMaterial({ color }), N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const plus = mk(ACCENT);             // the packaged strand
  const minus = mk(0xbae6fd);          // the strand the host has to synthesise
  const itrGeo = new THREE.SphereGeometry(0.42, 20, 16);
  const itrMatA = new THREE.MeshLambertMaterial({ color: WARM });
  const itrMatB = new THREE.MeshLambertMaterial({ color: WARM });
  const itrA = new THREE.Mesh(itrGeo, itrMatA);
  const itrB = new THREE.Mesh(itrGeo, itrMatB);
  scene.add(itrA, itrB);

  // `open` 0 -> a straight genome, 1 -> a closed circle. `grown` is how much of
  // the complementary strand exists yet.
  const state = { open: 0, grown: 0, t: 0 };

  // Centre line of the genome, morphing from a straight run to a closed circle.
  function backbone(u, open, out) {
    const lx = (u - 0.5) * SPAN;
    const ly = Math.sin(u * Math.PI) * 0.4;
    const sweep = Math.PI * 2 * open;
    const a = (u - 0.5) * sweep;
    const r = open > 1e-4 ? SPAN / sweep : 0;
    const cx = Math.sin(a) * r;
    const cy = (Math.cos(a) - 1) * r;
    out.set(
      THREE.MathUtils.lerp(lx, cx, open),
      THREE.MathUtils.lerp(ly, cy + R * open, open),
      0
    );
  }

  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 0, 1);
  const bead = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  const noRot = new THREE.Quaternion();
  const SHOW = new THREE.Vector3(1, 1, 1);
  const HIDE = new THREE.Vector3(0, 0, 0);

  // `limit` is how far along the strand exists yet; beads past it are scaled to
  // zero rather than removed, so the instance count never changes.
  function write(mesh, phaseOffset, limit) {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      backbone(u, state.open, p);
      backbone(Math.min(u + 1e-3, 1), state.open, q);
      tangent.subVectors(q, p).normalize();
      binormal.crossVectors(tangent, UP).normalize();
      normal.crossVectors(binormal, tangent).normalize();
      const ang = u * TWIST + phaseOffset + state.t * 0.35;
      const c = Math.cos(ang) * RISE;
      const s = Math.sin(ang) * RISE * 0.35;
      bead.set(
        p.x + binormal.x * c + normal.x * s,
        p.y + binormal.y * c + normal.y * s,
        p.z + binormal.z * c + normal.z * s
      );
      mat4.compose(bead, noRot, u <= limit ? SHOW : HIDE);
      mesh.setMatrixAt(i, mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  const PHASES = [
    { until: 3.2, label: 'ssDNA genome delivered — transcriptionally silent' },
    { until: 7.0, label: 'Second-strand synthesis — the rate-limiting step' },
    { until: 10.5, label: 'ITR-mediated circularisation (NHEJ)' },
    { until: 13.0, label: 'Chromatinised episome — persists without integrating' },
  ];
  let shown = -1;

  function frame(dt) {
    state.t += dt;
    const cycle = state.t % PHASES[PHASES.length - 1].until;
    let phase = 0;
    while (phase < PHASES.length - 1 && cycle > PHASES[phase].until) phase += 1;
    if (phase !== shown) { cap.textContent = PHASES[phase].label; shown = phase; }

    const prev = phase === 0 ? 0 : PHASES[phase - 1].until;
    const local = THREE.MathUtils.clamp((cycle - prev) / (PHASES[phase].until - prev), 0, 1);
    const ease = local * local * (3 - 2 * local);

    state.grown = phase === 0 ? 0 : phase === 1 ? ease : 1;
    state.open = phase < 2 ? 0 : phase === 2 ? ease : 1;

    write(plus, 0, 1);
    write(minus, Math.PI, state.grown);

    // The ITRs ride the ends of the backbone and meet when the circle closes.
    backbone(0, state.open, p); itrA.position.copy(p);
    backbone(1, state.open, p); itrB.position.copy(p);
    const joined = state.open > 0.97;
    itrMatA.color.setHex(joined ? ACCENT : WARM);
    itrMatB.color.setHex(joined ? ACCENT : WARM);

    // Oscillate rather than spin. A continuous rotation eventually presents the
    // closed episome edge-on, which is exactly the frame the slide exists to
    // show; swinging through a bounded arc keeps the loop legible throughout.
    scene.rotation.y = Math.sin(state.t * 0.22) * 0.38;
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    frame,
    debug: { scene, camera, renderer },
    resize(nw, nh) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// --- viz: sequence space ---------------------------------------------------
// A fitness landscape over capsid sequence space. The point is the ratio: a
// handful of known-good wild types, a dense cloud of mostly-dead library
// variants, and an enormous surface nobody has measured.

function seqspace({ host, cap }, w, h) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 300);
  camera.position.set(0, 7.5, 15);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.maxDistance = 60;

  const group = new THREE.Group();
  scene.add(group);

  // Fitness as a sum of gaussian peaks; nine of them are the natural serotypes.
  const PEAKS = [
    [0.0, 0.0, 1.00], [3.4, 1.9, 0.78], [-3.1, 2.4, 0.71],
    [2.2, -3.3, 0.66], [-2.7, -2.9, 0.62], [5.1, -1.2, 0.48],
    [-5.3, -0.4, 0.44], [1.1, 4.6, 0.41], [-1.4, -5.2, 0.37],
  ];
  const SPAN = 14;

  function fitness(x, z) {
    let f = 0;
    for (const [px, pz, amp] of PEAKS) {
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      f += amp * Math.exp(-d2 / 5.5);
    }
    // Rugged background: the landscape is not smooth, which is the whole
    // reason local search struggles.
    f += 0.055 * Math.sin(x * 1.7) * Math.cos(z * 1.6);
    f += 0.035 * Math.sin(x * 3.1 + 1.2) * Math.cos(z * 2.7);
    return f;
  }

  const SEG = 96;
  const plane = new THREE.PlaneGeometry(SPAN * 2, SPAN * 2, SEG, SEG);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, fitness(pos.getX(i), pos.getZ(i)) * 4.2);
  }
  plane.computeVertexNormals();
  group.add(new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
    color: ACCENT, wireframe: true, transparent: true, opacity: 0.17,
  })));

  // Library variants: uniformly sampled sequence space, coloured by fitness.
  const COUNT = 3600;
  const pts = new Float32Array(COUNT * 3);
  const cols = new Float32Array(COUNT * 3);
  const lo = new THREE.Color(0x334155);
  const hi = new THREE.Color(LINK);
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const x = (Math.random() - 0.5) * SPAN * 2;
    const z = (Math.random() - 0.5) * SPAN * 2;
    const f = fitness(x, z);
    pts[i * 3] = x;
    pts[i * 3 + 1] = f * 4.2 + 0.07;
    pts[i * 3 + 2] = z;
    c.copy(lo).lerp(hi, THREE.MathUtils.clamp(f * 1.35, 0, 1));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  const cloud = new THREE.BufferGeometry();
  cloud.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  cloud.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  group.add(new THREE.Points(cloud, new THREE.PointsMaterial({
    size: 0.1, vertexColors: true, transparent: true, opacity: 0.85,
  })));

  // The nine wild types we actually have.
  const markerGeo = new THREE.SphereGeometry(0.26, 20, 16);
  const markerMat = new THREE.MeshBasicMaterial({ color: WARM });
  for (const [px, pz] of PEAKS) {
    const m = new THREE.Mesh(markerGeo, markerMat);
    m.position.set(px, fitness(px, pz) * 4.2 + 0.26, pz);
    group.add(m);
  }

  if (!cap.textContent) {
    cap.textContent = 'Nine natural serotypes (orange) on a landscape of 20⁷ ≈ 1.3 × 10⁹ possible 7-mer insertions';
  }

  return {
    debug: { scene, camera, renderer },
    frame(dt) {
      group.rotation.y += dt * 0.09;
      controls.update();
      renderer.render(scene, camera);
    },
    resize(nw, nh) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose();
      disposeTree(scene);
      markerGeo.dispose();
      markerMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// --- viz: capsid -----------------------------------------------------------
// The deposited structure, with icosahedral assembly expanded client-side from
// the asymmetric unit. Shipping the expanded 60-mer would be ~30 MB; shipping
// one subunit and 60 symmetry operators is 480 KB and works offline.
//
// NGL drives its own render loop but only does GPU work when something calls
// requestRender(). Spinning through viewerControls from our own frame callback
// therefore keeps the expensive part under the same start/stop discipline as
// the three.js visualisations.

function capsid({ el, host, cap }) {
  if (!window.NGL) { fallback(el, 'Structure viewer unavailable.'); return null; }

  const pdb = el.dataset.pdb || 'assets/pdb/1lp3.cif';
  const assembly = el.dataset.assembly || 'BU1';
  const rep = el.dataset.rep || 'spacefill';
  const spin = parseFloat(el.dataset.spin || '0.16');

  const stage = new window.NGL.Stage(host, {
    backgroundColor: '#0b0f14',
    quality: el.dataset.quality || 'medium',
    cameraType: 'perspective',
    clipNear: 0, clipFar: 100, fogNear: 55, fogFar: 100,
  });

  // NGL sizes its own renderer from window.devicePixelRatio. On a scaled
  // display or a 4K projector that multiplies fill cost for no visible gain,
  // so hold it to the same cap as the three.js stages.
  if (stage.viewer && stage.viewer.renderer) stage.viewer.renderer.setPixelRatio(DPR);

  let loaded = false;

  // Radial colouring from the capsid centre outwards — the convention in the
  // AAV structural literature, and what makes the 3-fold protrusions and the
  // 5-fold channel legible at a glance.
  //
  // This is computed once over the asymmetric unit and reused by all 60
  // instances, which is exact rather than an approximation: the icosahedral
  // operators are rotations about the origin, so an atom's distance from the
  // capsid centre is invariant under every one of them.
  function radialScheme(rMin, rMax) {
    const ramp = [new THREE.Color(0x0e2a3a), new THREE.Color(ACCENT), new THREE.Color(0xecfeff)];
    return window.NGL.ColormakerRegistry.addScheme(function () {
      const col = new THREE.Color();
      this.atomColor = (atom) => {
        const d = Math.sqrt(atom.x * atom.x + atom.y * atom.y + atom.z * atom.z);
        const t = THREE.MathUtils.clamp((d - rMin) / Math.max(rMax - rMin, 1e-6), 0, 1);
        const seg = t < 0.5 ? 0 : 1;
        col.copy(ramp[seg]).lerp(ramp[seg + 1], (t - seg * 0.5) * 2);
        return (Math.round(col.r * 255) << 16) | (Math.round(col.g * 255) << 8) | Math.round(col.b * 255);
      };
    });
  }

  // Icosahedral symmetry axes, recovered from the assembly's own operators
  // rather than assuming a standard orientation for the deposited frame.
  // Each operator is a rotation about the capsid centre; its angle says what
  // kind of axis it is (72° or 144° → 5-fold, 120° → 3-fold, 180° → 2-fold).
  function symmetryAxes(matrixList) {
    const found = { 5: [], 3: [], 2: [] };
    const push = (order, v) => {
      const n = Math.hypot(v[0], v[1], v[2]);
      if (n < 1e-6) return;
      let a = [v[0] / n, v[1] / n, v[2] / n];
      // An axis and its negation are the same line; canonicalise the sign.
      const lead = a.find((x) => Math.abs(x) > 1e-6) || 1;
      if (lead < 0) a = a.map((x) => -x);
      const dup = found[order].some((b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.999);
      if (!dup) found[order].push(a);
    };

    for (const m of matrixList) {
      const e = m.elements;                     // column-major
      const trace = e[0] + e[5] + e[10];
      const ang = Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2)));
      if (ang < 1e-3) continue;                 // identity
      const deg = ang * 180 / Math.PI;
      const order = Math.abs(deg - 180) < 2 ? 2
        : Math.abs(deg - 120) < 2 ? 3
          : (Math.abs(deg - 72) < 2 || Math.abs(deg - 144) < 2) ? 5 : 0;
      if (!order) continue;

      if (order === 2) {
        // At 180° the antisymmetric part vanishes; recover the axis from
        // R + I = 2·nnᵀ and fix the signs from the off-diagonal products.
        let x = Math.sqrt(Math.max((e[0] + 1) / 2, 0));
        let y = Math.sqrt(Math.max((e[5] + 1) / 2, 0));
        let z = Math.sqrt(Math.max((e[10] + 1) / 2, 0));
        const xy = e[4] / 2, xz = e[8] / 2, yz = e[9] / 2;
        if (x >= y && x >= z) { if (xy < 0) y = -y; if (xz < 0) z = -z; }
        else if (y >= z) { if (xy < 0) x = -x; if (yz < 0) z = -z; }
        else { if (xz < 0) x = -x; if (yz < 0) y = -y; }
        push(2, [x, y, z]);
      } else {
        push(order, [e[6] - e[9], e[8] - e[2], e[1] - e[4]]);
      }
    }
    return found;
  }

  const AXIS_STYLE = {
    5: { color: [0.957, 0.447, 0.714], radius: 1.6 },   // magenta
    3: { color: [0.984, 0.749, 0.141], radius: 1.4 },   // amber
    2: { color: [0.220, 0.741, 0.973], radius: 1.1 },   // cyan
  };

  const wantAxes = (el.dataset.axes || '')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => AXIS_STYLE[n]);
  const repOpacity = parseFloat(el.dataset.opacity || '1');
  const axisComps = [];
  const AXIS_NOTE = {
    5: 'a pore down each — VP1 exits here, and the genome is threaded in',
    3: 'the protrusions — receptor binding, and most antibody epitopes',
    2: 'a depression at each — shallow, and less tolerant of insertion',
  };
  const CYCLE_SECS = 4.5;
  let elapsed = 0;
  let axisPhase = -1;

  // `assembly` is a representation parameter in NGL, not a loadFile one —
  // passing it to loadFile silently yields the asymmetric unit alone.
  stage.loadFile(pdb, { ext: 'cif' }).then((c) => {
    const params = { sele: 'polymer', assembly };
    if (repOpacity < 1) Object.assign(params, { opacity: repOpacity, depthWrite: false });
    if (rep === 'spacefill') {
      let rMin = Infinity; let rMax = 0;
      c.structure.eachAtom((a) => {
        const d = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        if (d < rMin) rMin = d;
        if (d > rMax) rMax = d;
      });
      Object.assign(params, { colorScheme: radialScheme(rMin, rMax), radiusScale: 1.0 });
    } else {
      Object.assign(params, { colorScheme: 'sstruc', aspectRatio: 2.4 });
    }
    c.addRepresentation(rep, params);

    if (wantAxes.length) {
      let rMax = 0;
      c.structure.eachAtom((a) => {
        const d = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        if (d > rMax) rMax = d;
      });
      const bu = c.structure.biomolDict[assembly];
      const mats = bu && bu.partList && bu.partList[0] ? bu.partList[0].matrixList : [];
      const axes = symmetryAxes(mats);
      const L = rMax * 1.26;

      // One component per order, so they can be shown separately. All 31 axes
      // at once is a thicket — legible as "symmetric", useless for telling the
      // three kinds of site apart.
      for (const order of wantAxes) {
        const style = AXIS_STYLE[order];
        const shape = new window.NGL.Shape(`axes-${order}`);
        for (const a of axes[order]) {
          shape.addCylinder(
            [-a[0] * L, -a[1] * L, -a[2] * L],
            [a[0] * L, a[1] * L, a[2] * L],
            style.color, style.radius
          );
          // Caps mark where each axis leaves the shell.
          shape.addSphere([a[0] * L, a[1] * L, a[2] * L], style.color, style.radius * 2.0);
          shape.addSphere([-a[0] * L, -a[1] * L, -a[2] * L], style.color, style.radius * 2.0);
        }
        const comp = stage.addComponentFromObject(shape);
        comp.addRepresentation('buffer');
        axisComps.push({ order, comp, count: axes[order].length });
      }
      console.info('[aav-viz] symmetry axes:',
        wantAxes.map((o) => `${o}-fold ×${axes[o].length}`).join(', '));
    }

    // Component.autoView() frames the asymmetric unit and leaves the camera
    // inside the shell. Stage.autoView() uses the viewer bounding box, which
    // is the one that accounts for the instanced symmetry copies.
    stage.autoView(0);
    loaded = true;
    // Render synchronously rather than through requestRender(): the structure
    // finishes loading after the static paint has already happened, and on the
    // print-pdf path there is no further frame coming to pick it up.
    stage.viewer.render();
    el.classList.add('viz-loaded');
  }).catch((err) => {
    console.error('[aav-viz] structure load failed', pdb, err);
    fallback(el, 'Could not load structure.');
  });

  return {
    frame(dt) {
      if (!loaded) return;
      if (spin) stage.viewerControls.spin([0, 1, 0], dt * spin);

      // Step through the orders one at a time, then show them together.
      if (axisComps.length > 1) {
        elapsed += dt;
        const steps = axisComps.length + 1;
        const phase = Math.floor(elapsed / CYCLE_SECS) % steps;
        if (phase !== axisPhase) {
          axisPhase = phase;
          axisComps.forEach((a, i) => a.comp.setVisibility(phase === steps - 1 || phase === i));
          const a = axisComps[Math.min(phase, axisComps.length - 1)];
          cap.textContent = phase === steps - 1
            ? `All ${axisComps.reduce((n, x) => n + x.count, 0)} axes — the full rotation group`
            : `${a.order}-fold × ${a.count} — ${AXIS_NOTE[a.order] || ''}`;
        }
      }

      // Drive the draw here rather than leaving it to NGL's own loop, so the
      // expensive work stays under the same start/stop discipline as the
      // three.js stages — and so a single static frame actually paints.
      stage.viewer.render();
    },
    resize() {
      stage.handleResize();
      if (stage.viewer && stage.viewer.renderer) stage.viewer.renderer.setPixelRatio(DPR);
    },
    dispose() { stage.dispose(); },
  };
}

// --- viz: sequence scale ---------------------------------------------------
// Four therapeutics, drawn to the same scale, one bead per 100 bases. The
// point of the slide is that all four are sequences; the point of drawing them
// to scale is that impact has nothing to do with length.

function seqscale({ host, cap }, w, h) {
  const SEQS = [
    { name: 'ChAdOx1',       nt: 35000, color: VIOLET },
    { name: 'Elevidys',      nt: 4900,  color: ACCENT },
    { name: 'BNT162b2',      nt: 4284,  color: LINK },
    { name: 'Pembrolizumab', nt: 1400,  color: AMBER },
  ];
  const PER_BEAD = 100;
  const COLS = 14;          // serpentine width
  const GAP = 0.46;
  const PANEL = 7.4;        // x spacing between the four blocks

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 400);
  camera.position.set(0, 0.6, 22);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.maxDistance = 90;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(5, 8, 12);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  const cube = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const blocks = SEQS.map((s, si) => {
    const count = Math.ceil(s.nt / PER_BEAD);
    const mesh = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial({ color: s.color }), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return { ...s, count, mesh, x: (si - (SEQS.length - 1) / 2) * PANEL };
  });

  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const noRot = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Vector3(0, 0, 0);

  let t = 0;
  const RUN = 5.0;   // seconds to fill every block

  function layout(shown) {
    for (const b of blocks) {
      const visible = Math.floor(b.count * shown);
      for (let i = 0; i < b.count; i++) {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        // serpentine, so the block reads as one continuous strand
        const cx = (row % 2 === 0 ? col : COLS - 1 - col) - (COLS - 1) / 2;
        v3.set(b.x + cx * GAP, 6.2 - row * GAP, 0);
        m4.compose(v3, noRot, i < visible ? ONE : ZERO);
        b.mesh.setMatrixAt(i, m4);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  cap.textContent = 'One bead = 100 bases. Drawn to scale.';

  // Labels live in the DOM rather than the scene — crisp text at any zoom, and
  // they inherit the deck's font. Their positions are projected from the
  // geometry each frame so they track the rotation instead of drifting off it.
  const labels = blocks.map((b) => {
    const d = document.createElement('div');
    d.className = 'viz-label';
    d.innerHTML = `<span class="viz-label-name">${b.name}</span>` +
      `<span class="viz-label-sub">${(b.nt / 1000).toFixed(b.nt >= 10000 ? 0 : 1)} kb</span>`;
    d.style.color = '#' + b.color.toString(16).padStart(6, '0');
    host.appendChild(d);
    return d;
  });
  const anchor = new THREE.Vector3();

  // Positioned as percentages of the host rather than pixels: reveal.js scales
  // the whole deck with a transform, so a canvas reports one size for layout
  // and another once transformed, and mixing the two puts labels off-stage.
  function placeLabels() {
    blocks.forEach((b, i) => {
      const rows = Math.ceil(b.count / COLS);
      anchor.set(b.x, 6.2 - rows * GAP - 0.6, 0);
      anchor.applyMatrix4(group.matrixWorld).project(camera);
      labels[i].style.left = `${(anchor.x * 0.5 + 0.5) * 100}%`;
      labels[i].style.top = `${(-anchor.y * 0.5 + 0.5) * 100}%`;
    });
  }

  return {
    debug: { scene, camera, renderer },
    frame(dt, settle) {
      t += dt;
      const p = settle ? 1 : Math.min(t / RUN, 1);
      layout(p * p * (3 - 2 * p));
      group.rotation.y = Math.sin(t * 0.22) * 0.22;
      controls.update();
      group.updateMatrixWorld();
      renderer.render(scene, camera);
      placeLabels();
    },
    resize(nw, nh) {
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose(); disposeTree(scene); cube.dispose();
      labels.forEach((l) => l.remove());
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

// --- viz: capsid shuffling -------------------------------------------------
// DNA shuffling across natural serotypes: parental cap genes are fragmented
// and reassembled, so a chimera is a mosaic of whichever parents happened to
// cross over. Each parent gets a colour; the chimera inherits them.

function shuffle({ host, cap }, w, h) {
  const PARENTS = [
    { name: 'AAV1', color: 0x2dd4bf }, { name: 'AAV2', color: 0x38bdf8 },
    { name: 'AAV3', color: 0xa78bfa }, { name: 'AAV4', color: 0xf472b6 },
    { name: 'AAV5', color: 0xfbbf24 }, { name: 'AAV6', color: 0xfb7185 },
    { name: 'AAV8', color: 0x4ade80 }, { name: 'AAV9', color: 0x22d3ee },
    { name: 'rh10', color: 0xfb923c },
  ];
  const SEG = 36;           // segments along cap
  const SW = 0.52, SH = 0.46;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 300);
  camera.position.set(0, 0, 17);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 6, 10);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  const box = new THREE.BoxGeometry(SW * 0.9, SH * 0.82, 0.3);
  // The chimera is the answer, so it gets a visibly chunkier bar than the
  // parents it was drawn from.
  const chimeraBox = new THREE.BoxGeometry(SW * 0.9, SH * 1.25, 0.42);
  const mkRow = (color, count, geom = box) => {
    const m = new THREE.InstancedMesh(
      geom,
      new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 }),
      count,
    );
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    group.add(m);
    return m;
  };

  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const noRot = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Vector3(0, 0, 0);
  const X0 = -(SEG - 1) / 2 * SW;

  // Parent rows, fixed.
  const parentY = (pi) => 4.3 - pi * SH * 1.25;
  const parentRows = PARENTS.map((p, pi) => {
    const row = mkRow(p.color, SEG);
    for (let i = 0; i < SEG; i++) {
      v3.set(X0 + i * SW, parentY(pi), 0);
      m4.compose(v3, noRot, ONE);
      row.setMatrixAt(i, m4);
    }
    row.instanceMatrix.needsUpdate = true;
    return row;
  });

  // The chimera: one mesh per parent colour, so each segment can take any
  // parent's colour without per-instance colour attributes.
  const CY = -2.9;
  const chimeraRows = PARENTS.map((p) => mkRow(p.color, SEG, chimeraBox));
  let assignment = [];
  let contributors = [];

  function reshuffle() {
    assignment = [];
    let i = 0;
    while (i < SEG) {
      const parent = Math.floor(Math.random() * PARENTS.length);
      const run = 2 + Math.floor(Math.random() * 7);   // crossover block length
      for (let k = 0; k < run && i < SEG; k++, i++) assignment.push(parent);
    }
    // Which parents actually crossed into this one. Dimming the rest is the
    // whole point of the slide: any single chimera draws on a handful of
    // parents, and which handful changes every round.
    const used = new Set(assignment);
    contributors = PARENTS.map((p, pi) => (used.has(pi) ? p : null)).filter(Boolean);
    parentRows.forEach((row, pi) => { row.material.opacity = used.has(pi) ? 1 : 0.16; });
    refreshLabels();
  }

  function drawChimera(reveal) {
    const shown = Math.floor(SEG * reveal);
    chimeraRows.forEach((row, pi) => {
      for (let i = 0; i < SEG; i++) {
        const on = i < shown && assignment[i] === pi;
        v3.set(X0 + i * SW, CY, 0);
        m4.compose(v3, noRot, on ? ONE : ZERO);
        row.setMatrixAt(i, m4);
      }
      row.instanceMatrix.needsUpdate = true;
    });
  }

  cap.textContent = 'Nine natural serotypes, fragmented and reassembled — the lit rows are the ones this chimera drew from';

  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  // Row labels, projected from the geometry so they stay put under rotation.
  // Two group headings, because without them the bottom bar reads as a tenth
  // serotype rather than as the thing the other nine produced.
  const labelSpecs = [
    {
      kind: 'head', text: 'Natural serotypes', sub: 'wild isolates — the parents',
      color: 0x9fb3c8, x: X0 - 0.55, y: parentY(0) + 1.2,
    },
    ...PARENTS.map((p, pi) => ({
      kind: 'parent', pi, text: p.name, color: p.color, x: X0 - 0.55, y: parentY(pi),
    })),
    {
      kind: 'mid', text: 'fragment · reassemble', color: 0xf472b6, centre: true,
      x: 0, y: (parentY(PARENTS.length - 1) + CY) / 2,
    },
    {
      kind: 'chimera', text: 'Shuffled chimera', sub: '',
      color: 0xf2f7fa, x: X0 - 0.55, y: CY,
    },
  ];

  const labels = labelSpecs.map((spec) => {
    const d = document.createElement('div');
    d.className = spec.centre ? 'viz-label' : 'viz-label left';
    d.innerHTML = `<span class="viz-label-name">${spec.text}</span>`
      + (spec.sub !== undefined ? '<span class="viz-label-sub"></span>' : '');
    d.style.color = hex(spec.color);
    const sub = d.querySelector('.viz-label-sub');
    if (sub && spec.sub) sub.textContent = spec.sub;
    host.appendChild(d);
    return d;
  });

  // Chimera provenance is rewritten every cycle, so cache the nodes once.
  const chimeraSub = labels[labelSpecs.findIndex((s) => s.kind === 'chimera')]
    .querySelector('.viz-label-sub');

  function refreshLabels() {
    labelSpecs.forEach((spec, i) => {
      if (spec.kind === 'parent') {
        labels[i].style.opacity = contributors.includes(PARENTS[spec.pi]) ? '1' : '0.28';
      }
    });
    chimeraSub.innerHTML = contributors
      .map((p) => `<span style="color:${hex(p.color)}">${p.name}</span>`)
      .join(' · ');
  }

  reshuffle();

  const anchor = new THREE.Vector3();

  function placeLabels() {
    labelSpecs.forEach((spec, i) => {
      anchor.set(spec.x, spec.y, 0).applyMatrix4(group.matrixWorld).project(camera);
      labels[i].style.left = `${(anchor.x * 0.5 + 0.5) * 100}%`;
      labels[i].style.top = `${(-anchor.y * 0.5 + 0.5) * 100}%`;
    });
  }

  let t = 0;
  const CYCLE = 4.2;
  return {
    debug: { scene, camera, renderer },
    frame(dt, settle) {
      t += dt;
      const phase = (t % CYCLE) / CYCLE;
      if (phase < dt / CYCLE) reshuffle();
      drawChimera(settle ? 1 : Math.min(phase / 0.55, 1));
      group.rotation.y = Math.sin(t * 0.3) * 0.16;
      controls.update();
      group.updateMatrixWorld();
      renderer.render(scene, camera);
      placeLabels();
    },
    resize(nw, nh) {
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose(); disposeTree(scene); box.dispose(); chimeraBox.dispose();
      labels.forEach((l) => l.remove());
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

// --- viz: latent space -----------------------------------------------------
// What a VAE buys you: a continuous, low-dimensional space in which nearby
// points decode to similar sequences, so you can sample and interpolate
// instead of enumerating.

function latent({ host, cap }, w, h) {
  const COUNT = 2600;
  const STRIP = 30;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 300);
  camera.position.set(0, 2.5, 17);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.target.set(0, 0.4, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 7, 9);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  // A gaussian cloud: the prior the encoder is pushed towards.
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const x = gauss() * 2.4, y = gauss() * 1.9, z = gauss() * 2.4;
    pos[i * 3] = x; pos[i * 3 + 1] = y + 1.2; pos[i * 3 + 2] = z;
    // Colour by angle, so the space reads as structured rather than noise.
    c.setHSL(((Math.atan2(z, x) / Math.PI) * 0.5 + 0.5) * 0.55 + 0.42, 0.75, 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cloudGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(cloudGeo, new THREE.PointsMaterial({
    size: 0.105, vertexColors: true, transparent: true, opacity: 0.95,
  })));

  // The sampler: a point wandering the latent space.
  const probeGeo = new THREE.SphereGeometry(0.3, 20, 16);
  const probeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const probe = new THREE.Mesh(probeGeo, probeMat);
  group.add(probe);

  // The decoded sequence: a strip whose colours follow the probe's position.
  const cellGeo = new THREE.BoxGeometry(0.34, 0.5, 0.18);
  const cells = [];
  const strip = new THREE.Group();
  strip.position.set(0, -3.6, 0);
  group.add(strip);
  for (let i = 0; i < STRIP; i++) {
    const m = new THREE.Mesh(cellGeo, new THREE.MeshLambertMaterial({ color: 0x334155 }));
    m.position.x = (i - (STRIP - 1) / 2) * 0.38;
    strip.add(m);
    cells.push(m);
  }

  cap.textContent = 'Sample a point, decode a sequence — nearby points give nearby variants';

  const labelSpecs = [
    { text: 'latent space', sub: 'sample anywhere', color: 0xa78bfa, x: 0, y: 4.6, z: 0 },
    { text: 'decoded sequence', sub: '', color: 0x5eead4, x: 0, y: -4.9, z: 0 },
  ];
  const labels = labelSpecs.map((spec) => {
    const d = document.createElement('div');
    d.className = 'viz-label';
    d.innerHTML = `<span class="viz-label-name">${spec.text}</span>` +
      (spec.sub ? `<span class="viz-label-sub">${spec.sub}</span>` : '');
    d.style.color = '#' + spec.color.toString(16).padStart(6, '0');
    host.appendChild(d);
    return d;
  });
  const anchor = new THREE.Vector3();
  function placeLabels() {
    labelSpecs.forEach((spec, i) => {
      anchor.set(spec.x, spec.y, spec.z).applyMatrix4(group.matrixWorld).project(camera);
      labels[i].style.left = `${(anchor.x * 0.5 + 0.5) * 100}%`;
      labels[i].style.top = `${(-anchor.y * 0.5 + 0.5) * 100}%`;
    });
  }

  let t = 0;
  const tmp = new THREE.Color();
  return {
    debug: { scene, camera, renderer },
    frame(dt) {
      t += dt;
      // A slow Lissajous path through the latent space.
      const lx = Math.sin(t * 0.42) * 2.6;
      const ly = Math.sin(t * 0.31 + 1.1) * 1.7 + 1.2;
      const lz = Math.cos(t * 0.27) * 2.6;
      probe.position.set(lx, ly, lz);

      for (let i = 0; i < STRIP; i++) {
        // Decoder stand-in: a smooth function of latent position and index.
        const v = Math.sin(lx * 0.8 + i * 0.42) * Math.cos(lz * 0.7 - i * 0.29) * 0.5 + 0.5;
        tmp.setHSL(0.42 + v * 0.3, 0.72, 0.3 + v * 0.34);
        cells[i].material.color.copy(tmp);
        cells[i].scale.y = 0.5 + v * 1.1;
      }

      group.rotation.y += dt * 0.11;
      controls.update();
      group.updateMatrixWorld();
      renderer.render(scene, camera);
      placeLabels();
    },
    resize(nw, nh) {
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose(); disposeTree(scene);
      probeGeo.dispose(); probeMat.dispose(); cellGeo.dispose();
      labels.forEach((l) => l.remove());
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

// --- viz: ITR and CpG ------------------------------------------------------
// The ITR folds into the T-shaped hairpin Rep has to nick, and it is also the
// densest CpG patch in the vector. Depleting it means changing sequence
// without changing the fold.

function itrcpg({ host, cap }, w, h) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(0, -1.9, 11.5);
  const renderer = makeRenderer(host, w, h);
  const controls = orbit(camera, renderer.domElement);
  controls.target.set(0, -2.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 9);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  // The T-shaped hairpin: a double-stranded stem that splits into two short
  // palindromic arms, each folding back on itself. Traced as one continuous
  // bead path from one free end to the other.
  const path = [];
  const push = (x, y) => path.push(new THREE.Vector3(x, y, 0));
  const STEP = 0.3, ARM = 3.1, LO = -0.22, HI = 0.42, STEM = 0.45;

  for (let y = -5.0; y <= -0.4; y += STEP) push(-STEM, y);                 // stem, strand 1
  for (let x = -STEM; x >= -ARM; x -= STEP) push(x, LO);                   // left arm out
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.38) {                // left hairpin loop
    push(-ARM - Math.cos(a) * 0.46, (LO + HI) / 2 + Math.sin(a) * 0.34);
  }
  for (let x = -ARM; x <= -STEM; x += STEP) push(x, HI);                   // left arm back
  push(-0.18, HI + 0.26); push(0.18, HI + 0.26);                           // crossover
  for (let x = STEM; x <= ARM; x += STEP) push(x, HI);                     // right arm out
  for (let a = Math.PI / 2; a >= -Math.PI / 2; a -= 0.38) {                // right hairpin loop
    push(ARM + Math.cos(a) * 0.46, (LO + HI) / 2 + Math.sin(a) * 0.34);
  }
  for (let x = ARM; x >= STEM; x -= STEP) push(x, LO);                     // right arm back
  for (let y = -0.4; y >= -5.0; y -= STEP) push(STEM, y);                  // stem, strand 2

  const beadGeo = new THREE.SphereGeometry(0.165, 10, 8);
  const backboneMat = new THREE.MeshLambertMaterial({ color: ACCENT });
  const beads = new THREE.InstancedMesh(beadGeo, backboneMat, path.length);
  beads.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const noRot = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  path.forEach((p, i) => { m4.compose(p, noRot, ONE); beads.setMatrixAt(i, m4); });
  beads.instanceMatrix.needsUpdate = true;
  group.add(beads);

  // CpG sites, scattered along the path.
  const cpgIdx = [];
  for (let i = 3; i < path.length - 3; i += 1) if (Math.random() < 0.17) cpgIdx.push(i);
  const cpgGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const cpgMat = new THREE.MeshLambertMaterial({ color: MAGENTA, emissive: 0x3a0f28 });
  const cpgs = cpgIdx.map((i) => {
    const m = new THREE.Mesh(cpgGeo, cpgMat.clone());
    m.position.copy(path[i]);
    group.add(m);
    return m;
  });

  const PHASES = [
    { until: 4.0, label: 'Wild-type ITR — unmethylated CpG motifs throughout' },
    { until: 8.0, label: 'TLR9 senses CpG — innate sensing drives the anti-capsid response' },
    { until: 12.0, label: 'CpG-depleted ITR — same fold, far less innate signal' },
  ];
  let shown = -1;
  let t = 0;

  return {
    debug: { scene, camera, renderer },
    frame(dt) {
      t += dt;
      const cycle = t % PHASES[PHASES.length - 1].until;
      let phase = 0;
      while (phase < PHASES.length - 1 && cycle > PHASES[phase].until) phase += 1;
      if (phase !== shown) { cap.textContent = PHASES[phase].label; shown = phase; }

      const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
      cpgs.forEach((m, i) => {
        if (phase === 0) {
          m.material.color.setHex(MAGENTA);
          m.material.emissive.setHex(0x2a0a1e);
          m.scale.setScalar(1);
        } else if (phase === 1) {
          m.material.color.setHex(MAGENTA);
          m.material.emissive.setRGB(0.45 * pulse, 0.05 * pulse, 0.3 * pulse);
          m.scale.setScalar(1 + pulse * 0.45);
        } else {
          // Depleted: most sites recoloured to backbone, a few unavoidable ones left.
          const keep = i % 7 === 0;
          m.material.color.setHex(keep ? MAGENTA : ACCENT);
          m.material.emissive.setHex(0x000000);
          m.scale.setScalar(keep ? 1 : 0.55);
        }
      });

      group.rotation.y = Math.sin(t * 0.26) * 0.3;
      controls.update();
      renderer.render(scene, camera);
    },
    resize(nw, nh) {
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    },
    dispose() {
      controls.dispose(); disposeTree(scene);
      beadGeo.dispose(); cpgGeo.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

// --- registry and lifecycle ------------------------------------------------

const FACTORIES = { episome, seqspace, capsid, seqscale, shuffle, latent, itrcpg };
const live = new Map();   // element -> { frame, resize, dispose, raf, running }

function build(el) {
  if (live.has(el)) return live.get(el);

  // The display:none guard. A hidden slide reports 0x0; bail and wait for the
  // ResizeObserver to tell us the box is real.
  if (!el.clientWidth || !el.clientHeight) return null;

  const factory = FACTORIES[el.dataset.viz];
  if (!factory) { console.warn('[aav-viz] unknown viz', el.dataset.viz); return null; }

  const ctx = scaffold(el);
  ctx.el = el;
  const w = ctx.host.clientWidth;
  const h = ctx.host.clientHeight;
  if (!w || !h) return null;

  let inst;
  try {
    inst = factory(ctx, w, h);
  } catch (err) {
    console.error('[aav-viz] init failed', el.dataset.viz, err);
    fallback(el, 'Visualisation unavailable.');
    return null;
  }
  if (!inst) return null;
  inst.host = ctx.host;

  inst.raf = 0;
  inst.running = false;
  live.set(el, inst);
  return inst;
}

function halt(inst) {
  inst.running = false;
  if (inst.raf) cancelAnimationFrame(inst.raf);
  inst.raf = 0;
}

function start(el) {
  const inst = build(el);
  if (!inst) return;

  // Paint once, hold no loop. Three cases land here: prefers-reduced-motion,
  // the print-pdf export, and a backgrounded tab. The last one matters because
  // a deck opened in a background tab must still have drawn something by the
  // time the presenter switches to it — and because headless Chrome reports
  // the page as hidden while printing, which would otherwise export blanks.
  //
  // The second argument asks for the *settled* state. Without it a one-shot
  // paint lands at t=0, which for the build-in animations is the empty frame
  // before anything has been drawn — the shuffled chimera row and the
  // to-scale sequence blocks both exported blank.
  if (STATIC || document.hidden) {
    if (!inst.running) inst.frame(0, true);
    halt(inst);
    return;
  }

  if (inst.running) return;
  inst.running = true;

  let last = performance.now();
  const loop = (now) => {
    if (!inst.running) return;
    inst.raf = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    inst.frame(dt);
  };
  inst.raf = requestAnimationFrame(loop);
}

function stop(el) {
  const inst = live.get(el);
  if (!inst) return;
  halt(inst);
  if (el.dataset.dispose === 'true') {
    try { inst.dispose(); } catch (e) { /* teardown is best-effort */ }
    live.delete(el);
    el.classList.remove('viz-loaded');
  }
}

function containers() {
  return Array.from(document.querySelectorAll('[data-viz]'));
}

function sync(revealInstance) {
  // print-pdf lays every slide out at once and screenshots the lot, so there
  // is no "current" slide in any useful sense — every stage has to paint.
  if (PRINTING) {
    containers().forEach(start);
    return;
  }
  const current = revealInstance.getCurrentSlide();
  for (const el of containers()) {
    // Vertical stacks mean the viz may sit in a descendant of the current
    // slide rather than being a direct child.
    const onscreen = !!current && (current === el.closest('section') || current.contains(el));
    // Visibility is handled inside start(), not here: a hidden tab should
    // still build and paint, it just must not hold an animation loop open.
    if (onscreen) start(el);
    else stop(el);
  }
}

function observe(revealInstance) {
  if (!('ResizeObserver' in window)) return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const box = entry.contentRect;
      if (!box.width || !box.height) continue;
      const inst = live.get(el);
      // Resize against the host, not the stage: the caption band sits outside
      // the renderer's box.
      if (inst) {
        inst.resize(inst.host.clientWidth, inst.host.clientHeight);
        // setSize can rewrite canvas.width/height, which clears the drawing
        // buffer. An animating stage repaints on the next frame; a one-shot
        // stage — print-pdf, prefers-reduced-motion, a backgrounded tab —
        // halts after a single paint and would keep the cleared buffer.
        // Chrome does not appear to clear it when the dimensions are
        // unchanged, and the print-pdf export measured fully painted with and
        // without this line, so treat it as a guard for the case where a
        // one-shot stage really does change size, not as a fix for an
        // observed blank export.
        if (!inst.running) inst.frame(0, true);
      }
      // First time this container has had a real size — if its slide is
      // showing, this is the moment the viz can actually be built.
      else sync(revealInstance);
    }
  });
  containers().forEach((el) => ro.observe(el));
}

// reveal.js grows its singleton API onto window.Reveal only once initialize()
// has run. Before that the global exists but is just the constructor, so
// testing `window.Reveal` tells you nothing, and registering for the 'ready'
// event is a race you can lose: by the time .on() exists, ready may already
// have fired and the handler never runs. Poll for a usable API instead.
function whenReveal(cb) {
  let fired = false;
  let poll = 0;
  const usable = () => {
    const R = window.Reveal;
    return R && typeof R.getCurrentSlide === 'function' &&
      typeof R.on === 'function' && (typeof R.isReady !== 'function' || R.isReady());
  };
  const tryFire = () => {
    if (fired || !usable()) return;
    fired = true;
    clearInterval(poll);
    cb(window.Reveal);
  };
  poll = setInterval(tryFire, 50);
  tryFire();
  setTimeout(() => {
    clearInterval(poll);
    if (!fired) console.warn('[aav-viz] reveal.js API never became usable');
  }, 30000);
}

function init() {
  const els = containers();
  if (!els.length) return;

  if (!webglAvailable()) {
    els.forEach((el) => fallback(el, 'This visualisation needs WebGL.'));
    return;
  }

  // A handle for troubleshooting from the console — `aavViz.state()` says what
  // the runtime thinks is going on, `aavViz.sync()` forces a re-evaluation.
  window.aavViz = {
    live,
    attached: false,
    sync: () => {},
    state: () => containers().map((el) => ({
      viz: el.dataset.viz,
      box: [el.clientWidth, el.clientHeight],
      built: live.has(el),
      running: !!(live.get(el) || {}).running,
    })),
  };

  whenReveal((R) => {
    window.aavViz.attached = true;
    window.aavViz.sync = () => sync(R);
    sync(R);
    R.on('slidechanged', () => sync(R));
    R.on('overviewshown', () => containers().forEach(stop));
    R.on('overviewhidden', () => sync(R));
    observe(R);
    // Backgrounded tab: drop the animation loop, keep the rendered frame.
    document.addEventListener('visibilitychange', () => sync(R));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
