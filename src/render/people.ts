import * as THREE from 'three';
import {mesh} from '../world/assets';
import {height} from '../world/terrain';
import type {Villager} from '../simulation/people';

export function createPeopleView(scene:THREE.Scene,villagers:Villager[],offset=0) {
  const colors=[0x687b91,0xad684e,0x879657,0x957052,0xb79458,0x6c8f80,0xa27583,0x82719a,0xb5a077,0x688898];
  function makeView(v:Villager,i:number){
    const root=new THREE.Group(),body=new THREE.Group();root.add(body);scene.add(root);
    mesh(new THREE.CylinderGeometry(.2,.3,.58,6),colors[i%colors.length],body,0,.85);
    mesh(new THREE.CylinderGeometry(.245,.22,.12,6),0x5a4937,body,0,.64);
    mesh(new THREE.IcosahedronGeometry(.23,1),[0xd9ac83,0xc08b64,0x997055][i%3],body,0,1.38);
    mesh(new THREE.SphereGeometry(.235,7,4,0,Math.PI*2,0,Math.PI*.55),[0x594632,0x867048,0x3f3730][i%3],body,0,1.45);
    const legs=[-.13,.13].map(x=>{const limb=new THREE.Group();limb.position.set(x,.62,0);body.add(limb);mesh(new THREE.CylinderGeometry(.075,.09,.47,5),0x554d42,limb,0,-.235);mesh(new THREE.BoxGeometry(.17,.14,.27),0x423d32,limb,0,-.5,.055);return limb;});
    const arms=[-.29,.29].map(x=>{const limb=new THREE.Group();limb.position.set(x,1.09,0);body.add(limb);mesh(new THREE.CylinderGeometry(.085,.07,.4,5),colors[i%colors.length],limb,0,-.2);mesh(new THREE.IcosahedronGeometry(.085,0),0xc99b76,limb,0,-.43);return limb;});
    const tool=new THREE.Group();arms[1].add(tool);tool.position.set(0,-.45,.05);
    mesh(new THREE.CylinderGeometry(.025,.025,.6,5),0x96734a,tool,0,0,.08);
    mesh(new THREE.BoxGeometry(.25,.16,.07),0xb0b3a8,tool,.08,.23,.08);tool.visible=false;
    const bundle=new THREE.Group();body.add(bundle);bundle.position.set(0,.82,-.32);
    for(let j=0;j<3;j++){const log=mesh(new THREE.CylinderGeometry(.075,.075,.65,5),0x9f794a,bundle,(j-1)*.13,0,0);log.rotation.z=Math.PI/2;log.position.y=j*.1;}
    const basket=mesh(new THREE.CylinderGeometry(.22,.15,.35,7),0xb79d66,body,0,.77,-.35);bundle.visible=false;basket.visible=false;
    const hit= new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,1.8,6),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=.9;hit.userData.personId=v.id;root.add(hit);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.48,.58,32),new THREE.MeshBasicMaterial({color:0xf5d589,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.045;ring.visible=false;root.add(ring);
    const label=document.createElement('button');label.className='person-label';label.dataset.personId=v.id;label.setAttribute('aria-label',`Inspect ${v.name}`);document.querySelector('#labels')!.appendChild(label);
    return {root,body,legs,arms,hit,ring,label,tool,bundle,basket};
  }
  const views:ReturnType<typeof makeView>[]=[];
  const hits:THREE.Object3D[]=[];
  const projected=new THREE.Vector3();
  function update(camera:THREE.Camera,selected:string|null,labels:boolean,time:number){
    while(views.length<villagers.length){const view=makeView(villagers[views.length],views.length);views.push(view);hits.push(view.hit);}
    villagers.forEach((v,i)=>{
      const view=views[i];view.root.position.set(v.position.x+offset,height(v.position.x,v.position.z),v.position.z);view.root.rotation.y=v.heading;
      const stride=['Walking','Carrying supplies'].includes(v.activity)?Math.sin(v.distanceWalked*7)*.45:0;
      view.legs[0].rotation.x=stride;view.legs[1].rotation.x=-stride;view.arms[0].rotation.x=-stride*.7;view.arms[1].rotation.x=stride*.7;
      const working=v.task?.stage==='work',resting=working&&v.task?.action==='REST';
      view.body.position.y=resting?-.3:Math.abs(stride)*.055;
      if(resting){view.legs[0].rotation.x=-1;view.legs[1].rotation.x=-1;}
      view.tool.visible=working&&['GATHER_WOOD','BUILD'].includes(v.task!.action);
      if(working&&['GATHER_WOOD','BUILD','GATHER_FOOD','FARM'].includes(v.task!.action)){view.arms[1].rotation.x=-.6+Math.sin(time*5)*.7;view.body.rotation.x=v.task!.action==='FARM'?.15:0;}else view.body.rotation.x=0;
      view.bundle.visible=v.inventory.wood>0;view.basket.visible=v.inventory.food>0||!!v.task?.carriedMeal;
      view.root.visible=!v.military&&v.health>0&&!v.insideHome;view.root.scale.setScalar(v.lifeStage==='child'?.5+Math.min(v.age,18)/18*.4:1);
      view.ring.visible=v.id===selected;
      projected.copy(view.root.position);projected.y+=2;projected.project(camera);
      view.label.hidden=offset!==0||!!v.military||v.health<=0||(v.insideHome&&v.id!==selected)||(!labels&&v.id!==selected)||projected.z>1||projected.z< -1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
      view.label.style.transform=`translate(-50%,-100%) translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight}px)`;
      view.label.classList.toggle('selected',v.id===selected);
      const text=`${v.name} · ${v.activity}`;if(view.label.textContent!==text)view.label.textContent=text;
    });
  }
  return {update,hits};
}
