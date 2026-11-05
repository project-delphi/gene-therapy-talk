import * as THREE from 'three';

// Teaching schematic for "From DNA to Protein": the central dogma as four
// stations left to right. Base counts are cut down to 24 so the stages fit one
// screen; shapes and timing are not quantitative.
//
// Each run of three bases is a codon and keeps one colour from the DNA rung,
// to the RNA beads, to the amino acid it becomes, to its place in the folded
// protein, so the eye can follow one codon through the whole slide.
//
// Four beats, one per station: DNA, transcription to RNA, translation to amino
// acids, folding into a protein. The labels under the canvas are HTML in the
// slide, laid out as four equal columns that line up with the four stations.
const COLORS = [0xf472b6, 0xfbbf24, 0x2dd4bf, 0x38bdf8, 0xa78bfa, 0xfb923c, 0xf87171, 0x84cc16];
const N = COLORS.length;          // codons
const BASES = N * 3;
const U = 3;                      // half a column: stations sit at -3U, -U, U, 3U
const SPAN = 4.4;                 // length of a strand
const K = 1.12;                   // each station is drawn this much larger

export function dogmaFactory({ makeRenderer, disposeTree, reduced, printing }) {
  return function dogma({ host, cap }, w, h) {
    const BEATS = [
      'DNA: two strands hold the instructions, three bases to a codon.',
      'Transcription: the cell copies one strand into single-stranded RNA.',
      'Translation: each RNA codon calls for one amino acid.',
      'Folding: the amino acid chain folds into a working protein.',
    ];
    const BEAT = 3.2;
    const LOOP = BEAT * BEATS.length;
    const FOV = 40;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
    const renderer = makeRenderer(host, w, h);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3, 6, 9);
    scene.add(key);

    const mats = [[], [], [], []];   // per station, so the active one can glow
    const mat = (stage, color, extra = {}) => {
      const m = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.1, shininess: 60, ...extra });
      mats[stage].push(m);
      return m;
    };
    const groups = [0, 1, 2, 3].map((i) => {
      const g = new THREE.Group();
      g.position.x = (2 * i - 3) * U;
      scene.add(g);
      return g;
    });
    const sphere = (r) => new THREE.SphereGeometry(r, 16, 12);
    const xAt = (i, n) => (i / (n - 1) - 0.5) * SPAN;

    // 0 - DNA: a double helix along x, rungs coloured by codon.
    const rungGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
    const backGeo = sphere(0.085);
    const RAD = 0.42;
    for (let i = 0; i < BASES; i++) {
      const x = xAt(i, BASES), a = i * 0.62;
      const p1 = new THREE.Vector3(x, Math.cos(a) * RAD, Math.sin(a) * RAD);
      const p2 = new THREE.Vector3(x, -p1.y, -p1.z);
      for (const p of [p1, p2]) {
        const b = new THREE.Mesh(backGeo, mat(0, 0x7aa2c8));
        b.position.copy(p);
        groups[0].add(b);
      }
      const r = new THREE.Mesh(rungGeo, mat(0, COLORS[Math.floor(i / 3)]));
      r.position.set(x, 0, 0);
      r.scale.y = RAD * 2;
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p2).normalize());
      groups[0].add(r);
    }

    // 1 - RNA: one strand, a wavy backbone with a coloured base per codon.
    const rnaPts = [];
    for (let i = 0; i < BASES; i++) {
      const x = xAt(i, BASES);
      rnaPts.push(new THREE.Vector3(x, 0.38 * Math.sin(i * 0.55), 0.3 * Math.cos(i * 0.55)));
    }
    groups[1].add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rnaPts), 120, 0.04, 6, false),
      mat(1, 0x9fb3c8),
    ));
    const rnaGeo = sphere(0.13);
    rnaPts.forEach((p, i) => {
      const b = new THREE.Mesh(rnaGeo, mat(1, COLORS[Math.floor(i / 3)]));
      b.position.copy(p);
      groups[1].add(b);
    });

    // 2 - amino acids: one big bead per codon, still in a line.
    const aaGeo = sphere(0.27);
    const linkGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    const up = new THREE.Vector3(0, 1, 0);
    const makeChain = (stage) => {
      const beads = COLORS.map((c) => {
        const b = new THREE.Mesh(aaGeo, mat(stage, c));
        groups[stage].add(b);
        return b;
      });
      const links = [];
      for (let i = 0; i < N - 1; i++) {
        const l = new THREE.Mesh(linkGeo, mat(stage, 0x9fb3c8));
        groups[stage].add(l);
        links.push(l);
      }
      return { beads, links };
    };
    const line = (i) => new THREE.Vector3(xAt(i, N), 0.28 * Math.sin(i * 1.7), 0);
    const chain = makeChain(2);
    const folded = makeChain(3);
    const tidy = (c, pos) => {
      c.beads.forEach((b, i) => b.position.copy(pos(i)));
      c.links.forEach((l, i) => {
        const a = c.beads[i].position, b = c.beads[i + 1].position;
        const d = new THREE.Vector3().subVectors(b, a);
        l.position.copy(a).addScaledVector(d, 0.5);
        l.scale.y = d.length();
        l.quaternion.setFromUnitVectors(up, d.normalize());
      });
    };
    tidy(chain, line);

    // 3 - protein: the same chain folds into a compact helix with a soft hull.
    const fold = (i) => {
      const a = i * 1.45 + 0.4;
      return new THREE.Vector3(Math.cos(a) * 0.95, (i - (N - 1) / 2) * 0.26, Math.sin(a) * 0.95);
    };
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 24),
      mat(3, 0x2dd4bf, { transparent: true, opacity: 0, depthWrite: false, emissiveIntensity: 0.05 }),
    );
    groups[3].add(hull);
    tidy(folded, line);

    // Arrows between stations, each with a packet that carries the message on.
    const arrows = [];
    const arrowMat = new THREE.MeshPhongMaterial({ color: 0x9fb3c8, emissive: 0x9fb3c8, emissiveIntensity: 0.1 });
    const packetMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
    for (let i = 0; i < 3; i++) {
      const edge = SPAN / 2 * K + 0.35;     // clear of each station's footprint
      const x0 = (2 * i - 3) * U + edge, x1 = (2 * i - 1) * U - edge;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, x1 - x0 - 0.2, 6), arrowMat);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.set((x0 + x1) / 2 - 0.1, 0, 0);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 12), arrowMat);
      head.rotation.z = -Math.PI / 2;
      head.position.set(x1 - 0.05, 0, 0);
      const packet = new THREE.Mesh(sphere(0.13), packetMat);
      packet.visible = false;
      scene.add(shaft, head, packet);
      arrows.push({ x0, x1, packet });
    }

    const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
    let time = 0, shown = -1;

    function layout(t) {
      const beat = Math.min(BEATS.length - 1, Math.floor(t / BEAT));
      if (beat !== shown) { shown = beat; cap.textContent = BEATS[beat]; }
      const into = (t - beat * BEAT) / BEAT;

      // Active station glows and swells; the others stay quiet.
      groups.forEach((g, i) => {
        const on = i === beat ? 1 : i < beat ? 0.25 : 0;
        const glow = 0.1 + 0.5 * on;
        for (const m of mats[i]) m.emissiveIntensity = m === hull.material ? 0.05 + 0.2 * on : glow;
        g.scale.setScalar(K * (1 + 0.06 * (i === beat ? 1 : 0)));
      });
      groups[0].rotation.x = t * 0.7;
      groups[1].rotation.x = t * 0.3;
      groups[2].rotation.y = Math.sin(t * 0.8) * 0.35;

      // Packets cross to the next station in the second half of each beat.
      arrows.forEach((a, i) => {
        const k = i === beat - 1 ? 1 : 0;       // the arrow just crossed
        const run = k ? ease(into / 0.5) : 0;
        a.packet.visible = k === 1 && into < 0.5;
        a.packet.position.set(a.x0 + (a.x1 - a.x0) * run, 0, 0.1);
      });

      // Folding runs through the last beat and then holds.
      const f = ease((t - 3 * BEAT) / (BEAT * 0.75));
      tidy(folded, (i) => line(i).lerp(fold(i), f));
      hull.material.opacity = 0.16 * f;
      groups[3].rotation.y = t * 0.5 * f;
    }

    // Put the camera where four equal columns exactly fill the width.
    function frameCamera(nw, nh) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      const half = 4 * U;
      const dist = half / (Math.tan((FOV / 2) * Math.PI / 180) * camera.aspect);
      camera.position.set(0, 0.6, Math.max(dist, 9));
      camera.lookAt(0, 0, 0);
    }
    frameCamera(w, h);

    const render = () => renderer.render(scene, camera);
    return {
      frame(dt, settled) {
        if (settled) time = 3.95 * BEAT;     // folded protein: the whole chain in one still
        else time = (time + dt) % LOOP;
        layout(time);
        render();
      },
      resize(nw, nh) {
        frameCamera(nw, nh);
        renderer.setSize(nw, nh, false);
        render();
      },
      dispose() {
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
  };
}
