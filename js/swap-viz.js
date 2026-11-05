import * as THREE from 'three';

// Teaching schematic for "One Swap Calms the Cell": uridine (U) becomes
// N1-methylpseudouridine (m1Ψ). Flat ball-and-stick, hydrogens left out, the
// ribose drawn as a plain five-membered ring. Geometry is idealised, not to
// scale.
//
// The base is a six-membered ring: N1, C2, N3, C4, C5, C6. In uridine the sugar
// hangs off N1. In pseudouridine it hangs off C5 instead, which frees N1 to
// carry a methyl group. So the swap is one sugar moving two atoms round the
// ring, then one methyl arriving.
//   1  uridine: sugar on N1, the sensor's alarm is up
//   2  the sugar re-attaches at C5 (pseudouridine)
//   3  N1 takes a methyl: m1Ψ, same message, alarm quiet
const ATOM = { N: 0x60a5fa, C: 0xb4bcc8, O: 0xef4444, sugar: 0xfbbf24, methyl: 0xf472b6 };

export function swapFactory({ makeRenderer, disposeTree }) {
  return function swap({ host, cap }, w, h) {
    const BEATS = [
      'Uridine: the sugar hangs off nitrogen N1. The immune sensor reads this as foreign RNA.',
      'The swap: the sugar re-attaches at carbon C5, giving pseudouridine.',
      'N1 takes a methyl group: N1-methylpseudouridine. The same message, and the alarm stays quiet.',
    ];
    const BEAT = 3.6;
    const LOOP = BEAT * BEATS.length;
    const FOV = 40;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
    const renderer = makeRenderer(host, w, h);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 9);
    scene.add(key);

    const mol = new THREE.Group();
    scene.add(mol);
    const mat = (c, extra = {}) => new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, shininess: 70, ...extra });
    const ball = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(c));
    const up = new THREE.Vector3(0, 1, 0);
    const stick = (parent, a, b, c = 0x9fb3c8, r = 0.07) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), mat(c));
      parent.add(m);
      const set = (pa, pb) => {
        const d = new THREE.Vector3().subVectors(pb, pa);
        m.position.copy(pa).addScaledVector(d, 0.5);
        m.scale.y = d.length();
        m.quaternion.setFromUnitVectors(up, d.clone().normalize());
      };
      set(a, b);
      return set;
    };

    // The base: ring atoms N1..C6, counter-clockwise from the top.
    const R = 1.25;
    const names = ['N', 'C', 'N', 'C', 'C', 'C'];
    const ang = (k) => (Math.PI / 2) + k * Math.PI / 3;
    const pos = names.map((_, k) => new THREE.Vector3(Math.cos(ang(k)) * R, Math.sin(ang(k)) * R, 0));
    pos.forEach((p, k) => {
      const a = ball(0.3, ATOM[names[k]]);
      a.position.copy(p);
      mol.add(a);
      stick(mol, p, pos[(k + 1) % 6]);
    });
    // Carbonyl oxygens on C2 and C4, which never change.
    for (const k of [1, 3]) {
      const o = pos[k].clone().multiplyScalar(1.85);
      const b = ball(0.27, ATOM.O);
      b.position.copy(o);
      mol.add(b);
      stick(mol, pos[k], o, ATOM.O, 0.06);
    }

    // The sugar sits on a pivot at the ring centre, so turning the pivot slides
    // it round the ring while its bond stays pointing at the ring.
    const pivot = new THREE.Group();
    mol.add(pivot);
    const bondLen = 1.0, SR = 0.72;
    const anchor = new THREE.Vector3(0, R + bondLen, 0);
    const sc = new THREE.Vector3(0, R + bondLen + SR * 0.95, 0);
    const sugarMat = mat(ATOM.sugar);
    const sPts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      return new THREE.Vector3(sc.x + Math.cos(a) * SR, sc.y + Math.sin(a) * SR, 0);
    });
    sPts.forEach((p, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(i === 2 ? 0.27 : 0.25, 20, 14), i === 2 ? mat(ATOM.O) : sugarMat);
      b.position.copy(p);
      pivot.add(b);
      stick(pivot, p, sPts[(i + 1) % 5], 0xd9a93a, 0.06);
    });
    stick(pivot, new THREE.Vector3(0, R, 0), sPts[0], ATOM.sugar, 0.085);

    // The methyl that lands on N1 in the last beat.
    const methyl = ball(0.34, ATOM.methyl);
    mol.add(methyl);
    const mBond = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1, 10), mat(ATOM.methyl));
    mol.add(mBond);

    // Labels for the two atoms that matter.
    const label = (text, color) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = 'bold 64px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(text, 64, 68);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
      s.scale.set(0.95, 0.95, 1);
      return s;
    };
    const lN1 = label('N1', '#ffffff'); lN1.position.copy(pos[0]).multiplyScalar(0.42); lN1.position.z = 0.6; mol.add(lN1);
    const lC5 = label('C5', '#ffffff'); lC5.position.copy(pos[4]).multiplyScalar(0.42); lC5.position.z = 0.6; mol.add(lC5);

    // The immune sensor's alarm: a halo that is red and pulsing, then calms.
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.06, 8, 96), haloMat);
    scene.add(halo);
    const RED = new THREE.Color(0xef4444), TEAL = new THREE.Color(0x2dd4bf);

    const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
    let time = 0, shown = -1;

    function layout(t) {
      const beat = Math.min(BEATS.length - 1, Math.floor(t / BEAT));
      if (beat !== shown) { shown = beat; cap.textContent = BEATS[beat]; }

      // Sugar slides N1 -> C5 (a clockwise 120 degrees) through beat 2.
      const move = ease((t - BEAT) / (BEAT * 0.8));
      pivot.rotation.z = -move * (2 * Math.PI / 3);

      // Methyl arrives on N1 in beat 3.
      const m = ease((t - 2 * BEAT) / (BEAT * 0.6));
      methyl.visible = mBond.visible = m > 0.01;
      const home = new THREE.Vector3(0, R + 0.95, 0);
      methyl.position.set(0, home.y + (1 - m) * 2.2, 0);
      const d = new THREE.Vector3().subVectors(methyl.position, pos[0]);
      mBond.position.copy(pos[0]).addScaledVector(d, 0.5);
      mBond.scale.y = d.length();
      mBond.quaternion.setFromUnitVectors(up, d.normalize());
      methyl.scale.setScalar(0.4 + 0.6 * m);

      // Alarm: pulsing red through the swap, calming to teal once the methyl lands.
      const calm = ease((t - 2 * BEAT) / (BEAT * 0.7));
      haloMat.color.copy(RED).lerp(TEAL, calm);
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      haloMat.opacity = (0.35 + 0.5 * pulse) * (1 - calm) + 0.45 * calm;
      halo.scale.setScalar(1 + 0.05 * pulse * (1 - calm));

      mol.rotation.y = Math.sin(t * 0.5) * 0.35;
      mol.rotation.x = Math.sin(t * 0.37) * 0.12;
    }

    function frameCamera(nw, nh) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      const half = 4.1;                      // half-height we want in view
      camera.position.set(0, 0, Math.max(half / Math.tan((FOV / 2) * Math.PI / 180), 9));
      camera.lookAt(0, 0, 0);
    }
    frameCamera(w, h);
    const render = () => renderer.render(scene, camera);

    return {
      frame(dt, settled) {
        if (settled) time = 2.95 * BEAT;     // methyl on, alarm calm: the finished swap
        else time = (time + dt) % LOOP;
        layout(time);
        render();
      },
      resize(nw, nh) { frameCamera(nw, nh); renderer.setSize(nw, nh, false); render(); },
      dispose() {
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
  };
}
