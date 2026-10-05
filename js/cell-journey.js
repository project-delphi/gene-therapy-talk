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
      ['Expression', 'The cell reads the delivered gene', 'Nuclear transcription produces mRNA. After export, cytoplasmic ribosomes translate it into therapeutic protein.', 'Duplex DNA can express before circularization. Circles support persistence.'],
    ];
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
    const DURATION = 8, END = stages.length * DURATION;
    const play = button(playing ? 'Pause' : 'Play', () => { if (time >= END) time = 0; playing = !playing; draw(0); });
    button('Restart', () => { time = 0; draw(0); });
    const picks = stages.map((s, i) => button(`${i + 1} ${s[0]}`, () => { time = i * DURATION + DURATION * .72; playing = false; draw(0); }));
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
    function label(text,x,y, show = ()=>true, color = '#9fb3c8') {
      const d=document.createElement('span'); d.className='journey-label'; d.textContent=text; d.style.color=color; host.append(d);
      labels.push({d,p:new THREE.Vector3(x,y,1),show});
    }
    label('OUTSIDE',-9.3,4.4); label('CYTOPLASM',-4.7,4.4); label('NUCLEUS',3.1,4.4);
    label('Cell membrane',-7.5,-4.7); label('Nuclear pore',-1.5,-.85, s=>s===3);
    label('Endosome',-5.5,2.15,s=>s===1||s===2,'#e8bb69');
    label('Degradation',-5.1,-4.1,s=>s===2,'#fb7185');
    label('2 genomes',3,3.25,s=>s===5,'#f2f7fa'); label('2 genomes',3,-.15,s=>s===5,'#f2f7fa');
    label('4 genomes',3,0,s=>s>=6,'#f2f7fa');
    label('mRNA export',-.3,-1.4,s=>s===7,'#fbbf24');
    label('Ribosome',-4.7,1.1,s=>s===7,'#fbbf24');
    label('Protein',-5.1,3,s=>s===7,'#2dd4bf');
    // Four unit-length strands. Each unit retains its colour through joining.
    const N=96, beadGeo=new THREE.SphereGeometry(.07,8,6), m4=new THREE.Matrix4();
    const strands=colors.map(c=>[c,0xdbeafe].map(color=>{
      const m=new THREE.InstancedMesh(beadGeo,new THREE.MeshStandardMaterial({color}),N);
      m.frustumCulled=false; scene.add(m); return m;
    }));
    const joints=Array.from({length:4},()=>mesh(new THREE.SphereGeometry(.15,12,8),0xfb923c,0,0));
    const ribosome = new THREE.Group(); scene.add(ribosome); ribosome.position.set(-4.7,0,0);
    for (const [y,s] of [[.18,.46],[-.23,.35]]) {
      const m=new THREE.Mesh(new THREE.SphereGeometry(s,24,16),new THREE.MeshStandardMaterial({color:0xfbbf24})); m.position.y=y; m.scale.x=1.4; ribosome.add(m);
    }
    const rna=tube(points(u=>[(u-.5)*1.4,.12*Math.sin(u*24),.3]),0xfbbf24,.055);
    const proteins=Array.from({length:5},(_,i)=>{
      const g=new THREE.Group(); scene.add(g);
      for(let j=0;j<5;j++) { const m=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),new THREE.MeshStandardMaterial({color:0x2dd4bf})); m.position.set(Math.cos(j*2)*.18,Math.sin(j*2)*.18,j*.04);g.add(m); }
      return g;
    });
    const smooth = x=>THREE.MathUtils.smoothstep(x,0,1);
    const lerp=THREE.MathUtils.lerp;
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
    function draw(dt, settled = false) {
      // Reduced-motion keeps controls usable. Only print seeks to a final still.
      if (printing && settled) time=END;
      if (playing) time=Math.min(END,time+dt);
      if(time===END) playing=false;
      const s=Math.min(7,Math.floor(time/DURATION)), p=Math.min(1,(time-s*DURATION)/DURATION);
      if(shown!==s){
        shown=s; count.textContent=`${String(s+1).padStart(2,'0')} / 08`;
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
      ribosome.visible=rna.visible=s===7;
      // Repeated transcription / export / translation, along a pore at y=0.
      const cycle=(p*3)%1;
      rna.position.set(lerp(2.1,-4.7,Math.min(1,cycle*1.5)),0,.7);
      proteins.forEach((m,i)=>{m.visible=s===7&&p>(i+1)/9;m.position.set(-4.7+Math.sin(i*2)*.6,1.65+i*.25,.3);m.rotation.y=time*.4+i;});
      scene.updateMatrixWorld(); renderer.render(scene,camera);
      labels.forEach(({d,p:pos,show})=>{const v=pos.clone().project(camera);d.style.left=`${(v.x*.5+.5)*100}%`;d.style.top=`${(-v.y*.5+.5)*100}%`;d.hidden=!show(s);});
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
