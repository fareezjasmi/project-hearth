import * as THREE from 'three';
import { height, random, WORLD_SEED } from './terrain';
import { mesh, tree, house, fence, stockpile,shop } from './assets';
import type {WorldSeed,ResourceNode} from '../simulation/types';
import {TOWN_PLOTS} from './plots';

export function createWorld(scene: THREE.Scene) {
  const obstacles: {minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
  const seed:WorldSeed={resources:[],buildings:[]};
  const resourceViews=new Map<string,{object:THREE.Object3D;growth?:THREE.Object3D[];stump?:THREE.Object3D}>();
  const constructionViews=new Map<string,{frame:THREE.Object3D;finished:THREE.Object3D}>();
  const windows:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[]=[];
  const lanterns=new Map<string,THREE.Group>();
  const lampMaterial=new THREE.MeshStandardMaterial({color:0xffce7d,emissive:0xffad43,emissiveIntensity:0});
  const roadViews=new Map<string,THREE.Mesh>();
  const lightPool=Array.from({length:6},()=>new THREE.PointLight(0xffb65a,0,12,2));
  const root = new THREE.Group(); scene.add(root); const rng = random(WORLD_SEED);lightPool.forEach(light=>root.add(light));
  const land = new THREE.PlaneGeometry(100,100,65,65); land.rotateX(-Math.PI/2);
  const positions = land.attributes.position;
  for(let i=0;i<positions.count;i++) positions.setY(i,height(positions.getX(i),positions.getZ(i)));
  land.computeVertexNormals();
  const flat=land.toNonIndexed(), colors=[]; const color=new THREE.Color();
  for(let i=0;i<flat.attributes.position.count;i+=3) {
    color.setHex([0x919b66,0x949e6a,0x8c9761,0x9aa36e,0x8f9964][Math.floor(rng()*5)]);
    for(let j=0;j<3;j++) colors.push(color.r,color.g,color.b);
  }
  flat.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const ground=new THREE.Mesh(flat,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})); ground.receiveShadow=true; root.add(ground); land.dispose();
  function place(object: THREE.Object3D,x:number,z:number,rotation=0,scale=1,collision:'bounds'|'trunk'|'none'='bounds') {
    object.position.set(x,height(x,z),z); object.rotation.y=rotation; object.scale.setScalar(scale); root.add(object);
    object.traverse(child=>{if(child instanceof THREE.Mesh&&child.userData.nightWindow)windows.push(child as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>);});
    const bounds=new THREE.Box3().setFromObject(object);
    if(collision==='bounds')obstacles.push({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
    if(collision==='trunk')obstacles.push({minX:x-.35,maxX:x+.35,minZ:z-.35,maxZ:z+.35});
    return object;
  }
  // Paths follow the terrain instead of floating over it.
  function path(points: THREE.Vector3[],width:number) {
    const curve=new THREE.CatmullRomCurve3(points); const verts:number[]=[];
    for(let i=0;i<100;i++) {
      const a=curve.getPoint(i/100), b=curve.getPoint((i+1)/100), tangent=b.clone().sub(a).normalize(); const side=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(width/2);
      const corners=[a.clone().add(side),a.clone().sub(side),b.clone().add(side),b.clone().sub(side)];
      for(const index of [0,1,2,2,1,3]) { const p=corners[index]; verts.push(p.x,height(p.x,p.z)+.045,p.z); }
    }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals(); const road=mesh(geo,0xb4a27b,root);road.castShadow=false;
  }
  const v=(x:number,z:number)=>new THREE.Vector3(x,0,z);
  path([v(-40,22),v(-19,13),v(-8,4),v(2,1),v(13,-2),v(30,-18),v(46,-23)],2.1);
  path([v(-4,-15),v(-5,-6),v(-2,1),v(2,10),v(16,20)],1.7);
  path([v(-17,-5),v(-12,0),v(-8,4)],1.4);
  place(house(0x94533f,true),-5,-6,-.12);
  place(house(0xae7450),-13,-4,.4);
  place(house(0x857453),5,7,2.9);
  place(house(0xa85e47),10,-7,-.25);
  for(const [i,p] of [[-5,-6],[-13,-4],[5,7],[10,-7]].entries()) seed.buildings.push({id:`house_${i}`,kind:'house',name:['Founders’ hall','West cottage','South cottage','East cottage'][i],position:{x:p[0],z:p[1]},capacity:3,complete:true,progress:1,woodCost:0,funded:true,reservedBy:null});
  for(const [i,rotation]of [-.12,.4,2.9,-.25].entries()){const b=seed.buildings[i];b.entrance={x:b.position.x+Math.sin(rotation)*3.6,z:b.position.z+Math.cos(rotation)*3.6};}
  const storageView=place(stockpile(),-8,8,.2);
  seed.buildings.push({id:'stockpile',kind:'stockpile',name:'Village stockpile',position:{x:-8,z:8},capacity:0,complete:true,progress:1,woodCost:0,funded:true,reservedBy:null});
  // Two finite building plots: funding consumes timber, labor raises the house.
  for(const [i,p] of [[-16,10],[3,-18]].entries()) {
    const id=`site_${i}`,frame=new THREE.Group();
    for(const x of [-1.6,1.6])for(const z of [-1.5,1.5])mesh(new THREE.BoxGeometry(.13,2.5,.13),0x957b53,frame,x,1.25,z);
    mesh(new THREE.BoxGeometry(3.5,.14,3.3),0x9c8c6c,frame,0,.08);
    const beam=mesh(new THREE.BoxGeometry(3.2,.12,.12),0x957b53,frame,0,2.4,1.5);beam.rotation.z=.1;
    place(frame,p[0],p[1]);const finished=place(house(0xa87353),p[0],p[1],0,1,'none');finished.visible=false;
    seed.buildings.push({id,kind:'house',name:`New cottage ${i+1}`,position:{x:p[0],z:p[1]},capacity:5,complete:false,progress:0,woodCost:24,funded:false,reservedBy:null});
    constructionViews.set(id,{frame,finished});
  }
  // Village well and an open gathering space.
  const well = new THREE.Group();
  mesh(new THREE.CylinderGeometry(1,1.15,.7,10),0x8d8b7a,well,0,.35);
  mesh(new THREE.CylinderGeometry(.74,.74,.05,10),0x414c42,well,0,.72);
  for(const x of [-.95,.95]) mesh(new THREE.BoxGeometry(.13,2.6,.13),0x775b40,well,x,1.3);
  const canopy=mesh(new THREE.ConeGeometry(1.7,.85,4),0x9d6749,well,0,2.65);canopy.rotation.y=Math.PI/4;
  place(well,1,-2);
  // Crops are finite harvests, regrowing on simulation time after depletion.
  for(let field=0;field<2;field++) {
    const cx=11+field*7,cz=9;
    const plot=place(mesh(new THREE.BoxGeometry(5.4,.12,7),0x796144,new THREE.Group()),cx,cz,0,1,'none');
    const growth:THREE.Object3D[]=[];
    for(let row=0;row<7;row++) for(let col=0;col<9;col++) {
      const x=cx-2.2+row*.7,z=cz-3+col*.7;
      const stalk=mesh(new THREE.ConeGeometry(.15,.65+rng()*.25,4),field?0xbca15f:0xcbb776,root,x,height(x,z)+.42,z);stalk.rotation.y=rng();
      growth.push(stalk);
    }
    place(fence(6),cx-3,cz+4); place(fence(7.5),cx-3,cz-3.5,-Math.PI/2);
    const id=`farm_${field}`;seed.resources.push({id,kind:'farm',name:field?'East field':'West field',position:{x:cx,z:cz},amount:42,capacity:42,regrowAt:0,reservedBy:null});resourceViews.set(id,{object:plot,growth});
  }
  let treeCount=0;
  function addTree(x:number,z:number,pine:boolean,tone:number,rotation:number,scale:number) {
    const object=place(tree(pine,tone),x,z,rotation,scale,'trunk'),id=`tree_${treeCount++}`;
    const stump=place(mesh(new THREE.CylinderGeometry(.23,.3,.45,6),0x816347,new THREE.Group()),x,z,0,1,'none');stump.visible=false;
    seed.resources.push({id,kind:'tree',name:`${pine?'Pine':'Oak'} ${treeCount}`,position:{x,z},amount:24,capacity:24,regrowAt:0,reservedBy:null});
    resourceViews.set(id,{object,stump});
  }
  for(let i=0;i<240;i++) {
    const x=(rng()-.5)*88,z=(rng()-.5)*88;
    if(Math.hypot(x,z)<21 || (x>14&&z>0&&z<18) || Math.abs(z+x*.62-3)<3||TOWN_PLOTS.some(p=>Math.hypot(x-p.position.x,z-p.position.z)<5.5)) continue;
    addTree(x,z,rng()>.42,Math.floor(rng()*3),rng()*6,.7+rng()*.65);
  }
  for(const [x,z] of [[-17,5],[-16,-12],[1,-12],[21,2],[2,16]])addTree(x,z,false,1,0,1.1);
  for(const [i,p] of [[-12,14],[-10,-12],[5,-12],[19,0],[-19,0],[5,17]].entries()) {
    const bush=new THREE.Group(),berries:THREE.Object3D[]=[];
    mesh(new THREE.IcosahedronGeometry(.8,0),0x677d49,bush,0,.6);
    for(let j=0;j<9;j++){const a=j*2.4;berries.push(mesh(new THREE.IcosahedronGeometry(.12,0),0xa65352,bush,Math.cos(a)*.65,.7+(j%3)*.17,Math.sin(a)*.65));}
    place(bush,p[0],p[1],0,1,'trunk');const id=`berries_${i}`;
    seed.resources.push({id,kind:'berries',name:`Berry patch ${i+1}`,position:{x:p[0],z:p[1]},amount:24,capacity:24,regrowAt:0,reservedBy:null});resourceViews.set(id,{object:bush,growth:berries});
  }
  for(let i=0;i<48;i++) {
    const x=(rng()-.5)*87,z=(rng()-.5)*87;if(Math.hypot(x,z)<19||TOWN_PLOTS.some(p=>Math.hypot(x-p.position.x,z-p.position.z)<5.5)) continue;
    const rock=mesh(new THREE.DodecahedronGeometry(.45+rng()*.8,0),[0x96988a,0x858b80,0xa5a494][i%3],new THREE.Group());rock.scale.set(1.4,.7,1);place(rock,x,z,rng()*6);
  }
  // Wild flowers add small warm accents at the clearing's edges.
  for(let i=0;i<180;i++) {
    const x=(rng()-.5)*55,z=(rng()-.5)*55;if(Math.hypot(x,z)<15)continue;
    const flower=mesh(new THREE.IcosahedronGeometry(.065,0),i%3?0xd5bd7a:0xe1d9af,root,x,height(x,z)+.16,z);flower.castShadow=false;
  }
  const plotFlags=new Map<string,THREE.Object3D>();
  for(const plot of TOWN_PLOTS){
    const {x,z}=plot.position;const flags=new THREE.Group();
    for(const dx of [-2,2])for(const dz of [-2,3])mesh(new THREE.CylinderGeometry(.04,.04,.6,4),0xad9464,flags,dx,.3,dz);
    place(flags,x,z,0,1,'none');plotFlags.set(plot.id,flags);
    obstacles.push({minX:x-2,maxX:x+2,minZ:z-2,maxZ:z+3});

  }
  function lantern(id:string,x:number,z:number){
    if(lanterns.has(id))return;
    const lamp=new THREE.Group();lamp.position.set(x,height(x,z),z);root.add(lamp);
    mesh(new THREE.CylinderGeometry(.055,.09,2.7,6),0x665039,lamp,0,1.35);
    mesh(new THREE.BoxGeometry(.6,.08,.08),0x665039,lamp,.22,2.6);
    const glow=new THREE.Mesh(new THREE.BoxGeometry(.26,.38,.26),lampMaterial);glow.position.set(.45,2.34,0);lamp.add(glow);
    mesh(new THREE.ConeGeometry(.24,.16,4),0x55483a,lamp,.45,2.61);
    mesh(new THREE.BoxGeometry(.34,.06,.34),0x55483a,lamp,.45,2.12);
    lanterns.set(id,lamp);
  }
  lantern('green',3,1);lantern('stores',-5,10);
  function update(resources:ResourceNode[],buildings:WorldSeed['buildings'],wood:number,hour=8,camera?:THREE.Camera) {
    const darkness=Math.max(0,Math.min(1,(.2-Math.sin((hour-6)/24*Math.PI*2))*3));
    lampMaterial.emissiveIntensity=darkness*2.8;
    for(const window of windows)window.material.emissiveIntensity=darkness*2;
    for(const building of buildings){
      if(building.complete&&building.kind!=='road'){
        const entrance=building.entrance??{x:building.position.x,z:building.position.z+4};lantern(building.id,entrance.x+1,entrance.z);
      }
      if(building.kind==='road'&&building.roadPoints){
        const points=building.roadPoints;
        if(!roadViews.has(building.id)){
          const vertices:number[]=[];
          for(let i=1;i<points.length;i++){
            const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.001)continue;
            const dx=-(b.z-a.z)/length*.55,dz=(b.x-a.x)/length*.55;
            for(const [p,sign] of [[a,1],[a,-1],[b,1],[b,1],[a,-1],[b,-1]] as const){const x=p.x+dx*sign,z=p.z+dz*sign;vertices.push(x,height(x,z)+.065,z);}
          }
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
          const road=mesh(geometry,0xc2ad85,root);road.castShadow=false;roadViews.set(building.id,road);
        }
        const road=roadViews.get(building.id)!;road.geometry.setDrawRange(0,Math.floor(road.geometry.attributes.position.count/6*building.progress)*6);
        if(building.complete){for(let i=6;i<points.length;i+=12){const p=points[i];lantern(`${building.id}_${i}`,p.x+.7,p.z);}}
      }
    }
    const nearby=[...lanterns.values()].sort((a,b)=>{const c=camera?.position;return c?a.position.clone().add(root.position).distanceToSquared(c)-b.position.clone().add(root.position).distanceToSquared(c):0;});
    lightPool.forEach((light,i)=>{const lamp=nearby[i];light.intensity=lamp?darkness*18:0;if(lamp)light.position.copy(lamp.position).add(new THREE.Vector3(.45,2.4,0));});
    for(const resource of resources) {
      const visual=resourceViews.get(resource.id);if(!visual)continue;
      if(resource.kind==='tree'){visual.object.visible=resource.amount>0;if(visual.stump)visual.stump.visible=resource.amount<=0;}
      else visual.growth?.forEach((item,i,all)=>item.visible=i<Math.ceil(all.length*resource.amount/resource.capacity));
    }
    for(const building of buildings){
      if(plotFlags.has(building.id)&&!constructionViews.has(building.id)){
        plotFlags.get(building.id)!.visible=false;const frame=new THREE.Group();
        for(const x of [-1.6,1.6])for(const z of [-1.5,1.5])mesh(new THREE.BoxGeometry(.13,2.5,.13),0x957b53,frame,x,1.25,z);
        mesh(new THREE.BoxGeometry(3.8,.15,4.5),0x9c8c6c,frame,0,.08,.5);
        const {x,z}=building.position;place(frame,x,z,0,1,'none');
        const finished=place(building.kind==='bakery'||building.kind==='market'?shop(building.kind):house(0xa87353),x,z,0,1,'none');
        constructionViews.set(building.id,{frame,finished});
      }
      const visual=constructionViews.get(building.id);if(visual){visual.finished.visible=building.complete;visual.frame.visible=!building.complete;visual.frame.scale.y=.25+building.progress*.75;}
    }
    // The visible stack is a sample of the central store, not extra inventory.
    for(let i=1;i<15&&i<storageView.children.length;i++)storageView.children[i].visible=i<=Math.max(0,Math.ceil(wood/4)*2);
  }
  return {root,treeCount,obstacles,seed,update};
}
