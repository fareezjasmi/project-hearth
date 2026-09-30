import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCameraControls(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=12;controls.maxDistance=240;
  controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI/2.55;controls.maxTargetRadius=180;
  controls.screenSpacePanning=false; controls.panSpeed=1;controls.rotateSpeed=.65;
  controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
  const keys=new Set<string>();
  window.addEventListener('keydown',event=>{if((event.target as HTMLElement).closest('input,button,select'))return; if(['w','a','s','d','q','e','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){keys.add(event.key.toLowerCase());event.preventDefault();}});
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
  const home=()=>{camera.position.set(32,32,39);controls.target.set(0,0,0);controls.update();}; home();
  function update(dt:number) {
    const speed=camera.position.distanceTo(controls.target)*.38*dt;
    const forward=controls.target.clone().sub(camera.position);forward.y=0;forward.normalize();
    const right=new THREE.Vector3(-forward.z,0,forward.x);const delta=new THREE.Vector3();
    if(keys.has('w')||keys.has('arrowup'))delta.add(forward);if(keys.has('s')||keys.has('arrowdown'))delta.sub(forward);
    if(keys.has('d')||keys.has('arrowright'))delta.add(right);if(keys.has('a')||keys.has('arrowleft'))delta.sub(right);
    delta.normalize().multiplyScalar(speed);camera.position.add(delta);controls.target.add(delta);
    const rotation=(Number(keys.has('q'))-Number(keys.has('e')))*dt;
    if(rotation)camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),rotation).add(controls.target);
    controls.update();
  }
  function focus(point:{x:number;z:number}){const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(22);controls.target.set(point.x,0,point.z);camera.position.copy(controls.target).add(offset);controls.update();}
  return {controls,home,update,focus};
}
