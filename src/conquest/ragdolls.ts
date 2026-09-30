import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {mesh} from '../world/assets';
import {battlefieldHeight} from './view';
import type {Campaign,Soldier} from './campaign';
import type {Obstacle} from '../simulation/navigation';

// Cosmetic articulated physics. Combat remains authoritative in Campaign.
export async function createRagdolls(scene:THREE.Scene,campaign:Campaign,obstacles:Obstacle[]){
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
  const vertices:number[]=[],indices:number[]=[],nx=132,nz=65;
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){const px=-50+x*210/nx,pz=-50+z*100/nz;vertices.push(px,battlefieldHeight(px,pz),pz);}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setFriction(.8).setCollisionGroups(0x00010002));
  for(const offset of [0,110])for(const o of obstacles){const x=(o.minX+o.maxX)/2+offset,z=(o.minZ+o.maxZ)/2;world.createCollider(RAPIER.ColliderDesc.cuboid((o.maxX-o.minX)/2,1.4,(o.maxZ-o.minZ)/2).setTranslation(x,battlefieldHeight(x,z)+1.4,z).setCollisionGroups(0x00010002));}
  type Part={body:RAPIER.RigidBody;visual:THREE.Group};
  type Doll={unit:Soldier;parts:Part[];at:number};
  const dolls=new Map<number,Doll>(),seenDead=new Set<number>();let accumulator=0;
  function spawn(u:Soldier){const parts:Part[]=[],yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),u.person.heading),base=new THREE.Vector3(u.position.x,battlefieldHeight(u.position.x,u.position.z)+.06,u.position.z),color=u.side===0?0x4faaa1:0xb95d51;
    function part(x:number,y:number,z:number,hx:number,hy:number,hz:number,tint:number,round=false){const p=new THREE.Vector3(x,y,z).applyQuaternion(yaw).add(base),visual=new THREE.Group();scene.add(visual);
      mesh(round?new THREE.IcosahedronGeometry(hx,1):new THREE.BoxGeometry(hx*2,hy*2,hz*2),tint,visual);
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation(yaw).setLinearDamping(.3).setAngularDamping(.8).setCcdEnabled(true).setLinvel(u.impact.x*2.1,.8,u.impact.z*2.1));
      world.createCollider((round?RAPIER.ColliderDesc.ball(hx):RAPIER.ColliderDesc.cuboid(hx,hy,hz)).setDensity(90).setFriction(.75).setCollisionGroups(0x00020001),body);const result={body,visual};parts.push(result);return result;
    }
    function join(a:Part,b:Part,anchorA:{x:number;y:number;z:number},anchorB:{x:number;y:number;z:number},hinge=false){const data=hinge?RAPIER.JointData.revolute(anchorA,anchorB,{x:1,y:0,z:0}):RAPIER.JointData.spherical(anchorA,anchorB);const joint=world.createImpulseJoint(data,a.body,b.body,true);joint.setContactsEnabled(false);if(hinge)(joint as RAPIER.RevoluteImpulseJoint).setLimits(-.15,2);}
    const hips=part(0,.65,0,.22,.13,.15,0x554d42),torso=part(0,.96,0,.25,.22,.16,color),head=part(0,1.45,0,.23,.23,.23,0xc69d76,true);
    mesh(new THREE.SphereGeometry(.245,6,4,0,Math.PI*2,0,Math.PI*.6),0x7c8586,head.visual,0,.08);
    join(hips,torso,{x:0,y:.13,z:0},{x:0,y:-.18,z:0});join(torso,head,{x:0,y:.26,z:0},{x:0,y:-.23,z:0});
    for(const side of [-1,1]){const thigh=part(side*.14,.43,0,.085,.14,.09,0x51483b),shin=part(side*.14,.15,0,.08,.13,.09,0x51483b);join(hips,thigh,{x:side*.14,y:-.08,z:0},{x:0,y:.14,z:0});join(thigh,shin,{x:0,y:-.14,z:0},{x:0,y:.14,z:0},true);
      const upper=part(side*.35,1,0,.085,.15,.09,color),fore=part(side*.35,.71,0,.075,.14,.08,color);join(torso,upper,{x:side*.25,y:.18,z:0},{x:-side*.1,y:.14,z:0});join(upper,fore,{x:0,y:-.15,z:0},{x:0,y:.14,z:0},true);
      if(side===1){mesh(new THREE.BoxGeometry(.1,.7,.07),0xd1d5cc,fore.visual,0,-.42,.05);mesh(new THREE.BoxGeometry(.26,.06,.1),0xad9560,fore.visual,0,-.13,.05);}else mesh(new THREE.CylinderGeometry(.28,.28,.08,6),color,fore.visual,0,0,.16).rotation.x=Math.PI/2;
    }
    torso.body.applyTorqueImpulse({x:u.impact.z*1.4,y:.3,z:-u.impact.x*1.4},true);const doll={unit:u,parts,at:campaign.time};dolls.set(u.id,doll);if(u.person.health<=0)seenDead.add(u.id);
  }
  function remove(id:number,doll:Doll){for(const p of doll.parts){world.removeRigidBody(p.body);scene.remove(p.visual);p.visual.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}dolls.delete(id);}
  function sync(){for(const doll of dolls.values())for(const p of doll.parts){const t=p.body.translation(),q=p.body.rotation();p.visual.position.set(t.x,t.y,t.z);p.visual.quaternion.set(q.x,q.y,q.z,q.w);}}
  return {step(dt:number){for(const u of campaign.soldiers){if((u.person.health<=0&&!seenDead.has(u.id)||u.downUntil>campaign.time)&&!dolls.has(u.id))spawn(u);if(u.person.health<=0&&dolls.has(u.id))seenDead.add(u.id);}
    for(const [id,d]of dolls){if(d.unit.person.health>0&&d.unit.downUntil<=campaign.time)remove(id,d);else if(d.unit.person.health<=0&&campaign.time-d.at>90)remove(id,d);}
    accumulator+=dt;while(accumulator>=1/60){world.step();accumulator-=1/60;}sync();
  }};
}
