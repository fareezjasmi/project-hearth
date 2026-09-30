import * as THREE from 'three';

const materials = new Map<number, THREE.MeshStandardMaterial>();
export function material(color: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  return materials.get(color)!;
}
export function mesh(geometry: THREE.BufferGeometry, color: number, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material(color)); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent: THREE.Object3D, dimensions: number[], color: number, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(...dimensions as [number,number,number]),color,parent,x,y,z);
}
export function tree(pine: boolean, tone: number) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.13,.26,2.4,5),0x69533c,g,0,1.2);
  if (pine) {
    for(let i=0;i<3;i++) mesh(new THREE.ConeGeometry(1.45-i*.3,2.4,7),[0x4e6951,0x5c7759,0x72845c][tone],g,0,2+i*.8);
  } else {
    const crown = mesh(new THREE.IcosahedronGeometry(1.8,0),[0x839354,0x9fa45b,0x687f4c][tone],g,0,3.1);
    crown.scale.set(1,1.05,.85);
    mesh(new THREE.IcosahedronGeometry(1.15,0),[0x9ea15c,0xaab168,0x7f9259][tone],g,.85,3.35,.15);
  }
  return g;
}
export function house(roofColor = 0x9c5340, large = false) {
  const g = new THREE.Group(); const w = large ? 4.4 : 3.2, d = large ? 3.8 : 3, h = large ? 3.1 : 2.5;
  box(g,[w+.3,.35,d+.3],0x888477,0,.16);
  box(g,[w,h,d],0xdecda7,0,h/2+.3);
  for(const x of [-w/2,w/2]) for(const z of [-d/2-.03,d/2+.03]) box(g,[.14,h,.14],0x665040,x,h/2+.3,z);
  box(g,[w+.08,.14,d+.08],0x765740,0,1.25);
  // A triangular prism makes a proper gabled roof, with visible thick eaves.
  const shape = new THREE.Shape(); shape.moveTo(-w/2-.35,0); shape.lineTo(0,1.8); shape.lineTo(w/2+.35,0); shape.closePath();
  const roof = mesh(new THREE.ExtrudeGeometry(shape,{depth:d+.7,bevelEnabled:false}),roofColor,g,0,h+.25,-d/2-.35);
  roof.castShadow = true;
  box(g,[.65,2,.65],0xaaa08b,w*.28,h+1.1,.35);
  box(g,[.82,.2,.82],0x817564,w*.28,h+2.1,.35);
  box(g,[.77,1.55,.09],0x5c4936,0,1.05,d/2+.07);
  box(g,[.08,1.55,.12],0x96744c,0,1.05,d/2+.13);
  for(const x of [-w*.3,w*.3]) {
    const window=box(g,[.6,.73,.09],0x564d3c,x,1.85,d/2+.06);window.material=window.material.clone();window.material.emissive.setHex(0xffab43);window.userData.nightWindow=true;
    box(g,[.06,.73,.12],0xc6aa74,x,1.85,d/2+.13);
    box(g,[.72,.09,.25],0xb4996c,x,1.47,d/2+.1);
  }
  return g;
}
export function fence(length: number) {
  const g = new THREE.Group();
  for(let x=0;x<=length;x+=1.5) { box(g,[.14,.95,.14],0x8d7854,x,.48); }
  for(const y of [.35,.73]) box(g,[length,.1,.1],0xa28d63,length/2,y);
  return g;
}
export function stockpile() {
  const g = new THREE.Group();
  box(g,[4,.16,3],0x9b8a69,0,.08);
  for(let i=0;i<7;i++) {
    const log = mesh(new THREE.CylinderGeometry(.24,.24,2.3,7),0x75573b,g,-1.15+(i%4)*.57,.42+Math.floor(i/4)*.44,0);
    log.rotation.x=Math.PI/2;
    const end=mesh(new THREE.CircleGeometry(.20,7),0xc8a374,g,log.position.x,log.position.y,1.16); end.rotation.z=.2;
  }
  for(const x of [1.2,1.8]) box(g,[.53,.6,.6],0xb08a54,x,.4,.65);
  return g;
}

export function shop(kind:'bakery'|'market'){
  const g=house(kind==='bakery'?0xb37a4c:0x6f8274);
  for(const x of [-1.8,1.8])box(g,[.12,2.1,.12],0x826542,x,1.05,2.6);
  for(let i=0;i<6;i++){
    const awning=box(g,[.65,.1,1.6],i%2?0xddcda5:kind==='bakery'?0xad654a:0x769180,-1.62+i*.65,2.25,2.05);awning.rotation.x=.15;
  }
  box(g,[3.4,.75,.65],0xa38151,0,.4,2.35);
  for(let i=0;i<5;i++)mesh(new THREE.IcosahedronGeometry(.18,1),kind==='bakery'?0xd6ab62:0xa08c4c,g,-1.2+i*.6,.93,2.35);
  const sign=box(g,[1.1,.45,.09],0x594d38,0,1.8,2.85);
  mesh(new THREE.IcosahedronGeometry(.15,0),0xe3c88e,sign,0,0,.1);
  return g;
}
