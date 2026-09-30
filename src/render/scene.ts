import * as THREE from 'three';

export function createScene(container: HTMLElement) {
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc4cabb);scene.fog=new THREE.Fog(0xc4cabb,160,330);
  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,500);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  container.appendChild(renderer.domElement);
  const ambient=new THREE.HemisphereLight(0xe5edda,0x77614a,2.4);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe3ad,3.3);sun.position.set(-25,40,15);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-120,right:120,top:80,bottom:-80,near:.5,far:230});
  sun.target.position.set(55,0,0);scene.add(sun.target);sun.shadow.normalBias=.06;sun.shadow.bias=-.0002;scene.add(sun);
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));});
  const daySky=new THREE.Color(0xc4cabb),nightSky=new THREE.Color(0x263b52),duskSky=new THREE.Color(0xb19783);
  function lighting(hour:number) {
    const angle=(hour-6)/24*Math.PI*2,elevation=Math.sin(angle),daylight=Math.max(0,Math.min(1,(elevation+.12)*1.6));
    sun.position.set(55-Math.cos(angle)*42,Math.max(5,elevation*50),20);
    sun.color.set(elevation<.35?0xffbd80:0xffe3ad);sun.intensity=Math.max(0,elevation)*3.3;
    ambient.intensity=.85+daylight*1.55;ambient.color.set(daylight<.3?0x9ab9df:0xe5edda);
    const sky=nightSky.clone().lerp(elevation<.2?duskSky:daySky,daylight);(scene.background as THREE.Color).copy(sky);(scene.fog as THREE.Fog).color.copy(sky);
  }
  lighting(8);
  return {scene,camera,renderer,lighting};
}
