import * as THREE from 'three';

// Teaching schematic: sizes, timing and the illustrated survival fraction are
// not quantitative. Four independently delivered genomes retain their identity.
export function cellJourneyFactory({ makeRenderer, disposeTree, reduced, printing }) {
  return function cellJourney({ host, cap, el }, w, h) {
    el.classList.add('cell-journey');
    const stages = [
      ['Attachment', 'AAV binds the cell surface', 'Surface glycans and entry factors help the capsid attach to a susceptible human cell.', 'Each coloured particle carries one vector genome.'],
      ['Uptake', 'The membrane encloses the capsid', 'Endocytosis takes the particle into a membrane-bound compartment. The genome stays inside its capsid.', 'The membrane and virus are shown enlarged.'],
      ['Escape', 'Some particles escape degradation', 'Acidification exposes the VP1 region. Its phospholipase activity helps membrane escape. Other particles enter degradation pathways.', 'Escape does not make the vector invisible to immunity.'],
      ['Uncoating', 'The genome becomes accessible in the nucleus', 'Capsids reach the nucleus and release their single-stranded DNA. The precise uncoating mechanism remains unresolved.', 'Opening the shell is a schematic, not a resolved molecular mechanism.'],
      ['Duplex DNA', 'Host machinery makes duplex DNA', 'Second-strand synthesis or complementary-strand annealing creates a template for transcription and genome joining.', 'Four incoming genomes are shown. They have not replicated.'],
      ['2 genomes', 'Two genomes can form one circle', 'Host repair pathways join vector DNA at its ends. Each illustrated dimer contains two genome-length units.', 'Monomer circles and other arrangements also occur.'],
      ['4 genomes', 'Larger circular concatemers can form', 'Four differently coloured units mark four delivered genomes in one episome. Orange junctions mark joins between units.', 'Two and four are examples, not a required doubling sequence.'],
      ['Transcription', 'RNA polymerase II copies the transgene into mRNA', 'Host Pol II reads the cassette from its promoter to the polyadenylation signal. The mRNA leaves through a nuclear pore, 5′ end first.', 'Duplex DNA can be transcribed before circularization. Circles support persistence.'],
      ['Translation', 'Ribosomes translate the mRNA into protein', 'The small subunit loads at the 5′ cap and scans to the start codon, where the large subunit joins. Several ribosomes read one mRNA toward its 3′ end.', 'One episome makes many mRNAs, and each mRNA makes many proteins.'],
    ];
    const TX = 7, TL = 8;
    const side = document.createElement('aside'); side.className = 'journey-story';
    // The narration is the slide's content, and it swaps without a reload — announce
    // it, or picking a stage is silent to a screen reader.
    side.setAttribute('aria-live', 'polite');
    side.setAttribute('aria-atomic', 'true');
    const count = document.createElement('div'); count.className = 'journey-count';
    const title = document.createElement('h3');
    const body = document.createElement('p');
    const note = document.createElement('p'); note.className = 'journey-note';
    side.append(count, title, body, note); el.append(side);
    const bar = document.createElement('div'); bar.className = 'journey-controls';
    bar.setAttribute('aria-label', 'Cell journey controls');
    const button = (text, action) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; bar.append(b); return b; };
    let time = 0, playing = !reduced && !printing, shown = -1;
    // Stage time is authored in units of DURATION; playback runs SPEED times
    // faster and wraps back to attachment rather than stopping.
    const DURATION = 8, SPEED = 1.2, STILL = .72, END = stages.length * DURATION;
    const play = button(playing ? 'Pause' : 'Play', () => { playing = !playing; draw(0); });
    button('Restart', () => { time = 0; draw(0); });
    // Paused stills land late in each stage, except where that would miss the
    // subject: Pol II mid-transcript, and a full polysome.
    const stillAt = i => i === TX ? .4 : i === TL ? .55 : STILL;
    const picks = stages.map((s, i) => button(`${i + 1} ${s[0]}`, () => { time = (i + stillAt(i)) * DURATION; playing = false; draw(0); }));
    el.append(bar);
    // Do not let Reveal turn button activation or keyboard navigation into a slide change.
    const stop = e => e.stopPropagation();
    ['keydown', 'pointerdown', 'click'].forEach(e => bar.addEventListener(e, stop));
    cap.textContent = 'Human-cell schematic • rAAV with a single-stranded genome • not to scale';
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-11.3, 10, 5.6, -5.6, .1, 100);
    camera.position.set(0, 0, 30);
    const renderer = makeRenderer(host, w, h);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Animated cutaway of AAV entry, genome processing and expression in a human cell');
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-4, 7, 12); scene.add(light);
    const colors = [0x2dd4bf, 0x38bdf8, 0xa78bfa, 0xf472b6];
    const mesh = (geo, color, x, y, z = 0, opacity = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness:.45, transparent:opacity < 1, opacity, depthWrite:opacity === 1 }));
      m.position.set(x,y,z); scene.add(m); return m;
    };
    const tube = (points, color, radius = .035, closed = false) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), 96, radius, 6, closed), color, 0, 0);
    const points = (f, n = 80) => Array.from({length:n}, (_,i) => new THREE.Vector3(...f(i/(n-1))));
    // Cutaway cell: membrane at left, cytoplasm central, nuclear envelope right.
    const cell = mesh(new THREE.PlaneGeometry(18,10.8), 0x16332f, 1.3, 0, -2, .22);
    const nucleus = mesh(new THREE.CircleGeometry(4.6,96), 0x203958, 3, 0, -1.5, .52);
    nucleus.scale.y = 1.05;
    tube(points(u=>[-7.6 + .13*Math.sin(u*8), (u-.5)*10.6,0]),0x427d75,.065);
    tube(points(u=>[-7.4 + .13*Math.sin(u*8), (u-.5)*10.6,0]),0x73b6a3,.04);
    for (let i=0;i<72;i++) {
      const a=i/72*Math.PI*2;
      // Gaps at the left are nuclear pores, not a route through a solid membrane.
      if (Math.abs(Math.sin(a))<.19 && Math.cos(a)<0) continue;
      const p=mesh(new THREE.SphereGeometry(.07,8,6),0x7694b1,3+4.6*Math.cos(a),4.83*Math.sin(a));
      p.scale.set(1,1,1);
    }
    mesh(new THREE.TorusGeometry(.44,.10,8,24),0xfbbf24,-1.55,0,.2).scale.y=1.3;
    // Attachment factor, branching towards extracellular space.
    tube(points(u=>[-7.5-u*.55,.3+u*.6,0],8),0xfbbf24,.07);
    tube(points(u=>[-8.05-u*.35,.9-u*.22,0],8),0xfbbf24,.07);
    const endosome = mesh(new THREE.SphereGeometry(1.1,32,24),0xe8bb69,-5.7,.5,0,.16);
    const rim = mesh(new THREE.TorusGeometry(1.1,.055,10,60),0xe8bb69,-5.7,.5,.1);
    const lysosome = mesh(new THREE.SphereGeometry(.8,24,16),0xfb7185,-5.1,-3.1,0,.35);
    const rejected = mesh(new THREE.IcosahedronGeometry(.29,0),0xfb7185,-5.8,.4,.5);
    const particles = colors.map((c,i)=>{
      const group = new THREE.Group(); scene.add(group);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.38,0),new THREE.MeshStandardMaterial({color:c,flatShading:true,transparent:true}));
      group.add(shell);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry),new THREE.LineBasicMaterial({color:0xe3f3ff,transparent:true,opacity:.4})); group.add(edges);
      // Separate triangular facets make uncoating legible without implying a
      // known molecular disassembly pathway.
      const facets = new THREE.Group(); group.add(facets);
      const positions = shell.geometry.attributes.position;
      for (let j=0;j<positions.count;j+=3) {
        const vertices = [0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(positions,j+k));
        const center = vertices.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(1/3);
        const geo = new THREE.BufferGeometry().setFromPoints(vertices.map(v=>v.sub(center)));
        geo.computeVertexNormals();
        const face = new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:c,side:THREE.DoubleSide,transparent:true}));
        face.userData.center=center; facets.add(face);
      }
      return {group,shell,edges,facets};
    });
    const labels=[];
    // `show` gets the stage and its progress; moving labels update `p` in draw().
    function label(text,x,y, show = ()=>true, color = '#9fb3c8') {
      const d=document.createElement('span'); d.className='journey-label'; d.textContent=text; d.style.color=color; host.append(d);
      const entry={d,p:new THREE.Vector3(x,y,1),show}; labels.push(entry); return entry;
    }
    label('OUTSIDE',-9.3,4.4); label('CYTOPLASM',-4.7,4.4); label('NUCLEUS',3.1,4.4);
    label('Cell membrane',-7.5,-4.7); label('Nuclear pore',-1.5,-1, s=>s===3||s===TX);
    label('Endosome',-5.5,2.15,s=>s===1||s===2,'#e8bb69');
    label('Degradation',-5.1,-4.1,s=>s===2,'#fb7185');
    label('2 genomes',3,3.25,s=>s===5,'#f2f7fa'); label('2 genomes',3,-.15,s=>s===5,'#f2f7fa');
    label('4 genomes',3,0,s=>s===6,'#f2f7fa');
    const polLabel=label('RNA Pol II',0,0,(s,p)=>s===TX&&p>.04&&p<.54,'#e5e7eb');
    const mrnaLabel=label('mRNA',0,0,(s,p)=>s===TL||(s===TX&&p>.18),'#f87171');
    const fivePrime=label('5′',0,0,s=>s===TL,'#f87171'), threePrime=label('3′',0,0,s=>s===TL,'#f87171');
    label('Ribosomes',-5.3,-1.6,(s,p)=>s===TL&&p>.03&&p<.85,'#cbd5e1');
    label('Protein',-2.6,3.3,(s,p)=>s===TL&&p>.45,'#4ade80');
    // Four unit-length strands. Each unit retains its colour through joining.
    const N=96, beadGeo=new THREE.SphereGeometry(.07,8,6), m4=new THREE.Matrix4();
    const strands=colors.map(c=>[c,0xdbeafe].map(color=>{
      const m=new THREE.InstancedMesh(beadGeo,new THREE.MeshStandardMaterial({color}),N);
      m.frustumCulled=false; scene.add(m); return m;
    }));
    const joints=Array.from({length:4},()=>mesh(new THREE.SphereGeometry(.15,12,8),0xfb923c,0,0));
    // Expression follows one transcript. Pol II walks one genome unit and the
    // transcript peels away behind it, threads 5′-first through the pore, and
    // is read 5′ → 3′ by a polysome. Real cells run many of each at once.
    const polymerase = new THREE.Group(); scene.add(polymerase);
    for (const [x,y,r] of [[0,0,.3],[.22,.16,.19],[-.18,.2,.15]]) {
      const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),new THREE.MeshStandardMaterial({color:0xe5e7eb,roughness:.6})); m.position.set(x,y,0); polymerase.add(m);
    }
    const NR=44, SPACING=.095, mrnaLength=(NR-1)*SPACING;
    const mrna=new THREE.InstancedMesh(new THREE.SphereGeometry(.075,8,6),new THREE.MeshStandardMaterial({color:0xf87171}),NR);
    mrna.frustumCulled=false; scene.add(mrna);
    // Starts where the finished transcript lies beside the episome, passes the
    // pore at (-1.55, 0) and ends where the mRNA rests for translation.
    const exportPath=new THREE.CatmullRomCurve3([[2.4,2.6],[1,2],[-.3,1],[-1.55,0],[-2.7,-.55],[-4.6,-.65],[-6.6,-.6]].map(([x,y])=>new THREE.Vector3(x,y,.55)));
    const pathLength=exportPath.getLength(), restHead=pathLength-.2;
    const along=d=>exportPath.getPointAt(THREE.MathUtils.clamp(d/pathLength,0,1));
    const M=16, chainBead=new THREE.SphereGeometry(.085,8,6);
    const smallGeo=new THREE.SphereGeometry(.28,24,16), largeGeo=new THREE.SphereGeometry(.4,24,16);
    // Compact fold for a released chain: beads spread over a small sphere.
    const fold=Array.from({length:M},(_,m)=>{
      const y=1-2*(m+.5)/M, r=Math.sqrt(1-y*y), a=m*2.4;
      return new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r).multiplyScalar(.26);
    });
    const homes=[[-5.9,2.7],[-4.3,3.3],[-3.1,2.6],[-5.3,3.7]], UP=new THREE.Vector3(0,1,0);
    // Each ribosome's lifetime as a fraction of the stage; the last chain has
    // drifted home before the loop wraps.
    const RIBO=.44;
    const ribosomes=homes.map(([hx,hy],k)=>{
      const small=new THREE.Mesh(smallGeo,new THREE.MeshStandardMaterial({color:0x94a3b8,roughness:.55}));
      const large=new THREE.Mesh(largeGeo,new THREE.MeshStandardMaterial({color:0xcbd5e1,roughness:.55}));
      scene.add(small,large);
      const chain=new THREE.InstancedMesh(chainBead,new THREE.MeshStandardMaterial({color:0x4ade80}),M);
      chain.frustumCulled=false; scene.add(chain);
      return {small,large,chain,start:.02+k*.13,home:new THREE.Vector3(hx,hy,.6)};
    });
    const smooth = x=>THREE.MathUtils.smoothstep(x,0,1);
    const lerp=THREE.MathUtils.lerp;
    const ramp=(x,a,b)=>THREE.MathUtils.clamp((x-a)/(b-a),0,1);
    function genomePosition(i,u,s,p) {
      const y=2.5-i*1.65;
      const linear=new THREE.Vector3(1.2+u*3.8,y,.4);
      const a=(i%2+u)*Math.PI;
      const dimer=new THREE.Vector3(3+1.2*Math.cos(a),(i<2?1.7:-1.7)+1.2*Math.sin(a),.4);
      const b=(i+u)*Math.PI/2;
      const tetramer=new THREE.Vector3(3+2.4*Math.cos(b),2.4*Math.sin(b),.4);
      if(s<5) return linear;
      if(s===5) return linear.lerp(dimer,smooth(p*1.7));
      return dimer.lerp(tetramer,s===6?smooth(p*1.7):1);
    }
    // Pol II reads the second unit from beside the pore up towards the top, so
    // the 5′ end of the transcript starts nearest the pore it will lead through.
    const centre=new THREE.Vector3(3,0,.4);
    const template=f=>genomePosition(1,lerp(.86,.14,f),TX,1);
    const outward=v=>v.clone().sub(centre).setZ(0).normalize();
    const wiggle=j=>Math.sin(j*.8+time*2.4)*.045;
    function transcriptBead(j,s,p) {
      if(s===TL){const rest=along(restHead-j*SPACING); rest.y+=wiggle(j); return rest;}
      const f=j/(NR-1), q=ramp(p,.06,.5);
      if(q===0||f>q) return null;
      // Each bead hangs off the template where it was made, further out the
      // earlier it was made: the nascent strand trails behind the polymerase.
      const base=template(f), nascent=base.clone().addScaledVector(outward(base),(q-f)*1.3).setZ(.55);
      nascent.y+=wiggle(j);
      const release=smooth(ramp(p,.5,.6));
      if(release===0) return nascent;
      const head=lerp(mrnaLength,restHead,smooth(ramp(p,.6,1)));
      const snake=along(head-j*SPACING); snake.y+=wiggle(j);
      return nascent.lerp(snake,release);
    }
    function draw(dt, settled = false) {
      // Reduced-motion keeps controls usable. Only print seeks to a final still,
      // the polysome mid-translation.
      if (printing && settled) time=(TL+stillAt(TL))*DURATION;
      if (playing) time=(time+dt*SPEED)%END;
      const s=Math.min(stages.length-1,Math.floor(time/DURATION)), p=Math.min(1,(time-s*DURATION)/DURATION);
      if(shown!==s){
        shown=s; count.textContent=`${String(s+1).padStart(2,'0')} / ${String(stages.length).padStart(2,'0')}`;
        title.textContent=stages[s][1]; body.textContent=stages[s][2]; note.textContent=stages[s][3];
        picks.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===s)));
        renderer.domElement.setAttribute('aria-label', `${stages[s][1]}. ${stages[s][2]}`);
      }
      play.textContent=playing?'Pause':'Play'; play.setAttribute('aria-pressed',String(playing));
      endosome.visible=rim.visible=s===1||s===2;
      endosome.position.x=rim.position.x=s===1?lerp(-7.2,-5.7,smooth(p)):-5.7;
      endosome.material.opacity=s===2?.16*(1-smooth(p)):.16;
      rim.material.transparent=true; rim.material.opacity=s===2?1-smooth(p):1;
      lysosome.visible=rejected.visible=s===2;
      rejected.position.set(lerp(-5.7,-5.1,p),lerp(.5,-3.1,p),.5); rejected.scale.setScalar(1-.8*p);
      particles.forEach(({group,shell,edges,facets},i)=>{
        const jitter=(i-1.5)*.45;
        let x,y;
        if(s===0){x=lerp(-10.1,-8.15,smooth(p));y=.5+jitter;}
        else if(s===1){x=lerp(-8.15,-5.7,smooth(p));y=.5+jitter;}
        else if(s===2){x=lerp(-5.7,-2.3,smooth(p));y=lerp(.5+jitter,0,smooth(p));}
        else {x=lerp(-2.3,1.3,smooth(p*2));y=jitter*smooth(p*2);}
        group.position.set(x,y,.4+i*.14);group.rotation.set(time*.12+i,time*.16,0);
        group.visible=s<=3; shell.material.opacity=s===3?1-smooth((p-.45)*2):1;
        edges.material.opacity=shell.material.opacity*.4;
        const opening=s===3?smooth((p-.4)*1.8):0;
        facets.visible=opening>0;
        shell.visible=opening===0;edges.visible=opening===0;
        facets.children.forEach(face=>{
          face.position.copy(face.userData.center).multiplyScalar(1+opening*3);
          face.material.opacity=1-opening;
        });
        group.scale.setScalar(s===3?1+smooth((p-.45)*2)*.6:1);
      });
      strands.forEach((pair,i)=>pair.forEach((m,strand)=>{
        m.visible=s>=4||(s===3&&p>.5);
        for(let j=0;j<N;j++){
          const u=j/(N-1), pos=genomePosition(i,u,s,p);
          pos.y+=Math.sin(u*30+strand*Math.PI)*.08;pos.z+=Math.cos(u*30+strand*Math.PI)*.09;
          const growth=s===3?smooth((p-.5)*2):1;
          if(s===3) pos.lerp(new THREE.Vector3(1.3,(i-1.5)*.45,.4),1-growth);
          const visible=strand===0 ? u<=growth : s>=5 || (s===4&&u<=p);
          m4.makeScale(visible?1:0,visible?1:0,visible?1:0);m4.setPosition(pos);m.setMatrixAt(j,m4);
        }m.instanceMatrix.needsUpdate=true;
      }));
      joints.forEach((m,i)=>{m.visible=s>=5;m.position.copy(genomePosition(i,0,s,p));});
      // Transcription: Pol II lands at the promoter, walks to the polyA signal
      // and lets go; the finished transcript then snakes out through the pore.
      const q=ramp(p,.06,.5), polAt=template(q), leave=smooth(ramp(p,.5,.58));
      polymerase.visible=s===TX&&leave<1;
      polymerase.position.copy(polAt).addScaledVector(outward(polAt),.3*(1-smooth(ramp(p,0,.06)))+.5*leave).setZ(.65);
      polymerase.scale.setScalar(Math.max(1e-3,smooth(ramp(p,0,.06))*(1-leave)));
      // Inside the ring, with more clearance when the label sits beside the strand.
      const inward=outward(polAt).negate(); polLabel.p.copy(polAt).addScaledVector(inward,.45+.8*Math.abs(inward.x));
      mrna.visible=s===TX||s===TL;
      const beads=[];
      for(let j=0;j<NR;j++){
        const pos=beads[j]=mrna.visible?transcriptBead(j,s,p):null;
        m4.makeScale(pos?1:0,pos?1:0,pos?1:0); if(pos) m4.setPosition(pos); mrna.setMatrixAt(j,m4);
      }
      mrna.instanceMatrix.needsUpdate=true;
      if(s===TL&&beads[0]&&beads[NR-1]){
        fivePrime.p.set(beads[0].x-.35,beads[0].y,1); threePrime.p.set(beads[NR-1].x,beads[NR-1].y-.4,1);
        mrnaLabel.p.set(-3.1,-1.6,1);
      } else if(s===TX&&beads[0]){
        // Above the nascent strand while it is made, then leading its 5′ end out.
        const mid=beads[Math.floor(q*(NR-1)/2)];
        mrnaLabel.p.copy(mid).addScaledVector(outward(mid),.6).setZ(1).lerp(new THREE.Vector3(beads[0].x-.65,beads[0].y-.1,1),smooth(ramp(p,.5,.6)));
      }
      // Translation: each ribosome assembles at the start codon, moves 5′ → 3′
      // growing a chain from its exit tunnel, splits at the stop codon, and the
      // released chain folds and diffuses away.
      ribosomes.forEach(({small,large,chain,start,home},k)=>{
        if(s!==TL){small.visible=large.visible=chain.visible=false; return;}
        const r=(p-start)/RIBO, made=ramp(r,.12,.88);
        const at=along(restHead-lerp(.08,.92,made)*mrnaLength);
        const loaded=smooth(ramp(r,0,.07)), joined=smooth(ramp(r,.05,.12)), split=smooth(ramp(r,.88,1));
        small.visible=large.visible=r>0&&r<1;
        small.position.set(at.x,at.y-.2-.6*(1-loaded)-.5*split,at.z);
        large.position.set(at.x,at.y+.33+.6*(1-joined)+.5*split,at.z);
        const sa=Math.max(1e-3,loaded*(1-split)), la=Math.max(1e-3,joined*(1-split));
        small.scale.set(1.35*sa,.7*sa,sa); large.scale.set(1.25*la,.85*la,la);
        chain.visible=r>.12;
        const exit=new THREE.Vector3(at.x+.12,at.y+.66,.6), n=Math.ceil(made*M);
        const folded=smooth(ramp(r,.88,1.02)), drift=smooth(ramp(r,.98,1.3));
        const core=exit.clone().add(new THREE.Vector3(0,.95,0)).lerp(home,drift);
        core.y+=Math.sin(time*.9+k)*.08*drift;
        for(let m=0;m<M;m++){
          // m is residue order: the N-terminus is made first, so sits furthest out.
          const out=n-1-m, grown=new THREE.Vector3(exit.x+Math.sin(out*1.1+k)*.13*Math.min(1,out/2)-out*.035,exit.y+out*.12,exit.z+Math.cos(out*1.1+k)*.1);
          const pos=grown.lerp(fold[m].clone().applyAxisAngle(UP,time*.6+k).add(core),folded);
          const vis=m<n?1:0;
          m4.makeScale(vis,vis,vis); m4.setPosition(pos); chain.setMatrixAt(m,m4);
        }
        chain.instanceMatrix.needsUpdate=true;
      });
      scene.updateMatrixWorld(); renderer.render(scene,camera);
      labels.forEach(({d,p:pos,show})=>{const v=pos.clone().project(camera);d.style.left=`${(v.x*.5+.5)*100}%`;d.style.top=`${(-v.y*.5+.5)*100}%`;d.hidden=!show(s,p);});
      el.dataset.stage=String(s+1);
    }
    function resize(nw,nh){
      // Preserve model proportions while fitting the complete cell cutaway.
      const aspect=nw/nh, viewWidth=Math.max(21.3,11.2*aspect), viewHeight=viewWidth/aspect;
      camera.left=-.65-viewWidth/2;camera.right=-.65+viewWidth/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();renderer.setSize(nw,nh,false);
    }
    resize(host.clientWidth,host.clientHeight);
    draw(0);
    return {frame:draw,resize,debug:{scene,camera,renderer},dispose(){disposeTree(scene);renderer.dispose();renderer.domElement.remove();labels.forEach(({d})=>d.remove());side.remove();bar.remove();}};
  };
}
