import * as THREE from 'three';
import {mesh} from '../world/assets';
import {height} from '../world/terrain';
import {Campaign,type Soldier} from './campaign';
const colors=[0x4faaa1,0xb95d51];
export function battlefieldHeight(x:number,z:number){return x<=50?height(x,z):x>=60?height(x-110,z):height(50,z)*(60-x)/10+height(-50,z)*(x-50)/10;}
export function createCampaignView(scene:THREE.Scene,campaign:Campaign){
  const land=new THREE.PlaneGeometry(10,100,8,48);land.rotateX(-Math.PI/2);const pos=land.attributes.position;
  for(let i=0;i<pos.count;i++){pos.setX(i,pos.getX(i)+55);pos.setY(i,battlefieldHeight(pos.getX(i),pos.getZ(i)));}land.computeVertexNormals();const ground=mesh(land,0x939c69,scene);ground.receiveShadow=true;
  function flag(x:number,z:number,color:number,radius=7){const root=new THREE.Group();root.position.set(x,battlefieldHeight(x,z),z);scene.add(root);mesh(new THREE.CylinderGeometry(.06,.1,5,6),0x5e4a34,root,0,2.5);const cloth=mesh(new THREE.BoxGeometry(1.5,.85,.08),color,root,.76,4.35);const ring=mesh(new THREE.RingGeometry(radius-.2,radius,64),color,root);ring.rotation.x=-Math.PI/2;ring.position.y=.1;(ring.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;cloth.material=cloth.material.clone();return {cloth,ring};}
  campaign.capitals.forEach((p,i)=>flag(p.x,p.z,colors[i],9));
  const posts=campaign.posts.map(p=>flag(p.position.x,p.position.z,0xc1ad78));
  const views=new Map<number,{root:THREE.Group;legs:THREE.Object3D[];bar:THREE.Object3D;arm:THREE.Group}>();
  function soldier(u:Soldier){const root=new THREE.Group();scene.add(root);const color=colors[u.side];
    mesh(new THREE.CylinderGeometry(.24,.31,.65,6),color,root,0,.9);mesh(new THREE.IcosahedronGeometry(.24,1),0xc69d76,root,0,1.45);mesh(new THREE.SphereGeometry(.255,6,4,0,Math.PI*2,0,Math.PI*.6),0x7c8586,root,0,1.53);
    const legs=[-.15,.15].map(x=>mesh(new THREE.BoxGeometry(.18,.55,.23),0x51483b,root,x,.3));
    const arm=new THREE.Group();root.add(arm);arm.position.set(.35,1.2,0);mesh(new THREE.CylinderGeometry(.085,.085,.42,5),color,arm,0,-.2);mesh(new THREE.BoxGeometry(.12,.85,.08),0xd1d5cc,arm,0,-.2,.4).rotation.x=Math.PI/2;mesh(new THREE.BoxGeometry(.35,.08,.12),0xad9560,arm,0,-.2,.1);mesh(new THREE.CylinderGeometry(.3,.3,.09,6),color,root,-.36,.95,.15).rotation.x=Math.PI/2;
    mesh(new THREE.BoxGeometry(.82,.09,.08),0x442e2a,root,0,2);const bar=mesh(new THREE.BoxGeometry(.8,.075,.09),0x94c58b,root,0,2.01);views.set(u.id,{root,legs,bar,arm});return views.get(u.id)!;
  }
  return {update(){for(const u of campaign.soldiers){const v=views.get(u.id)??soldier(u);v.root.visible=u.person.health>0&&!(campaign.physicsStatus==='Physics ragdolls ready'&&u.downUntil>campaign.time);v.root.position.set(u.position.x,battlefieldHeight(u.position.x,u.position.z),u.position.z);v.root.rotation.y=u.person.heading;v.bar.scale.x=u.person.health/100;const strike=campaign.time-u.lastStrike,hit=campaign.time-u.lastHit;v.arm.rotation.x=strike<.45?-1.7+Math.sin(strike/.45*Math.PI)*2:0;v.root.rotation.z=hit<.3?Math.sin(hit/.3*Math.PI)*.22:0;v.legs.forEach((leg,i)=>leg.rotation.x=u.path.length?Math.sin(u.person.distanceWalked*6+i*Math.PI)*.35:0);}
    for(const [id,v]of views)if(!campaign.soldiers.some(u=>u.id===id)){scene.remove(v.root);v.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});views.delete(id);}
    posts.forEach((v,i)=>{const owner=campaign.posts[i].owner;(v.cloth.material as THREE.MeshStandardMaterial).color.setHex(owner===null?0xc1ad78:colors[owner]);});
  }};
}
