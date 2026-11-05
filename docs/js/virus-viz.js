import * as THREE from 'three';

// Teaching schematic for "What Is a Virus?": a virus is a protein shell around
// a short set of instructions, and it has no machinery of its own, so the cell
// does the work. Sizes and timings are not to scale and not quantitative.
//
// One loop, four beats:
//   1  viruses dock on the cell surface
//   2  the cell takes each one in, shell and instructions (amber coil) together
//   3  at the nucleus the shell opens and the instructions are read
//   4  the cell makes the protein they describe (teal beads)
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

export function virusFactory({ makeRenderer, disposeTree, reduced, printing }) {
  return function virusDelivery({ host, cap }, w, h) {
    const BEATS = [
      'Viruses dock on the surface of a cell.',
      'The cell takes them in, instructions and all.',
      'At the nucleus the shell opens and the instructions are read.',
      'The cell makes the protein the instructions describe.',
    ];
    const BEAT = 4;                // seconds per beat
    const LOOP = BEAT * BEATS.length;
    const N = 6;                   // virus particles
    const P = 5;                   // protein beads per particle

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 1.0, 13.2);
    camera.lookAt(0, 0, 0);
    const renderer = makeRenderer(host, w, h);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 6, 9);
    scene.add(key);

    const world = new THREE.Group();
    scene.add(world);

    // Cell and nucleus.
    const CELL_R = 4;
    const cell = new THREE.Mesh(
      new THREE.SphereGeometry(CELL_R, 48, 32),
      new THREE.MeshPhongMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    world.add(cell);
    const NUC = new THREE.Vector3(0.3, -0.2, 0);
    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 32, 24),
      new THREE.MeshPhongMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55 }),
    );
    nucleus.position.copy(NUC);
    world.add(nucleus);

    // Virus shells: icosahedra, the shape real small viruses take.
    const shellGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const shellMat = new THREE.MeshPhongMaterial({
      color: 0xf472b6, emissive: 0x9d2a62, flatShading: true, transparent: true, opacity: 0.65,
    });
    // Genome: a small helix, so it reads as nucleic acid rather than a line.
    const coilPts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      coilPts.push(new THREE.Vector3(Math.cos(t * 14) * 0.1, (t - 0.5) * 0.7, Math.sin(t * 14) * 0.1));
    }
    const coilGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 60, 0.035, 6, false);
    const coilMat = new THREE.MeshPhongMaterial({ color: 0xfbbf24, emissive: 0x553d00 });
    const beadGeo = new THREE.SphereGeometry(0.12, 12, 10);
    const beadMat = new THREE.MeshPhongMaterial({ color: 0x2dd4bf, transparent: true, opacity: 1 });

    // Particles arrive from different sides of the front hemisphere.
    const dirs = [
      [-0.8, 0.6, 0.5], [0.2, 0.9, 0.5], [0.9, 0.4, 0.45],
      [-0.9, -0.3, 0.45], [0.1, -0.9, 0.5], [0.85, -0.5, 0.4],
    ].map((d) => new THREE.Vector3(...d).normalize());

    const parts = dirs.map((dir, i) => {
      const shell = new THREE.Mesh(shellGeo, shellMat.clone());
      const coil = new THREE.Mesh(coilGeo, coilMat);
      const beads = [];
      for (let k = 0; k < P; k++) {
        const b = new THREE.Mesh(beadGeo, beadMat.clone());
        b.visible = false;
        beads.push({ mesh: b, ang: rand() * Math.PI * 2, r: 0.5 + rand() * 1.0, lift: (rand() - 0.5) * 1.5 });
        world.add(b);
      }
      const spin = rand() * 3;
      shell.rotation.set(rand() * 3, spin, 0);
      world.add(shell, coil);
      return { dir, shell, coil, beads, spin, delay: i * 0.12 };
    });

    const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
    const lerp3 = (out, a, b, t) => out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

    const far = new THREE.Vector3();
    const dock = new THREE.Vector3();
    const inner = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const toNuc = new THREE.Vector3();
    let time = 0;
    let shown = -1;

    function layout(t) {
      const beat = Math.min(BEATS.length - 1, Math.floor(t / BEAT));
      if (beat !== shown) { shown = beat; cap.textContent = BEATS[beat]; }

      for (const p of parts) {
        far.copy(p.dir).multiplyScalar(CELL_R + 3.4);
        dock.copy(p.dir).multiplyScalar(CELL_R + 0.4);
        inner.copy(p.dir).multiplyScalar(CELL_R * 0.55);
        toNuc.copy(NUC).add(tmp.copy(p.dir).multiplyScalar(1.45));

        const a = ease((t - p.delay) / (BEAT * 0.9));                    // approach and dock
        const b = ease((t - BEAT - p.delay * 0.5) / (BEAT * 0.8));       // genome goes in
        const c = ease((t - 2 * BEAT - p.delay * 0.4) / (BEAT * 0.8));   // to the nucleus

        // Shell and genome travel together: docked, taken in, carried to the
        // nucleus. There the shell opens (fades) and the genome carries on.
        lerp3(p.shell.position, far, dock, a);
        if (b > 0) lerp3(p.shell.position, dock, inner, b);
        if (c > 0) lerp3(p.shell.position, inner, toNuc, c);
        p.shell.rotation.y = p.spin + t * 0.6;
        p.shell.material.opacity = 0.65 * (1 - ease((t - 2 * BEAT - p.delay * 0.4 - BEAT * 0.5) / (BEAT * 0.5)));
        p.shell.visible = p.shell.material.opacity > 0.01;
        p.coil.position.copy(p.shell.position);
        p.coil.scale.setScalar(1 - ease((t - 3 * BEAT + 0.2) / (BEAT * 0.4)));
        p.coil.rotation.z = Math.atan2(p.coil.position.x, p.coil.position.y) * 0.5;

        // Protein beads leave the nucleus in the last beat.
        const d = ease((t - 3 * BEAT - p.delay) / (BEAT * 0.8));
        for (const bd of p.beads) {
          bd.mesh.visible = d > 0.001;
          const rr = 1.5 + d * (CELL_R * 0.78 - 1.5) * (0.75 + bd.r * 0.25);
          bd.mesh.position.set(
            NUC.x + Math.cos(bd.ang) * rr,
            NUC.y + Math.sin(bd.ang) * rr * 0.9,
            bd.lift * d,
          );
          bd.mesh.material.opacity = Math.min(1, d * 2);
        }
      }
      nucleus.material.opacity = 0.5 + 0.2 * Math.sin(Math.min(1, Math.max(0, (t - 2 * BEAT) / BEAT)) * Math.PI);
    }

    function render() { renderer.render(scene, camera); }

    return {
      frame(dt, settled) {
        if (settled) time = 3.9 * BEAT;      // protein beads out, shells faded: the whole story in one still
        else time = (time + dt) % LOOP;
        world.rotation.y = Math.sin(time * 0.25) * 0.25;
        layout(time);
        render();
      },
      resize(nw, nh) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
        render();
      },
      dispose() {
        disposeTree(scene);
        shellMat.dispose();
        beadMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
  };
}
