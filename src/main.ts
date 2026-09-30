import {Campaign} from './conquest/campaign';
import {createCampaignView} from './conquest/view';
import {createCampaignUI} from './conquest/ui';
import {createPeopleView} from './render/people';
import './style.css';
import { createScene } from './render/scene';
import { createWorld } from './world/createWorld';
import { createCameraControls } from './input/camera';
import { setupPeople } from './peopleUI';

type GameMode='world'|'conquest';
const app=document.querySelector<HTMLDivElement>('#app')!;
function chooseMode(){
  app.innerHTML=`<main class="mode-menu"><span class="eyebrow">PROJECT HEARTH</span><h1>What will you build?</h1><p>Choose a new world. Each mode starts a fresh session.</p><div class="mode-cards"><button data-mode="world"><span>⌂</span><h2>World Building</h2><p>A peaceful civilization sandbox. Grow families, build homes and shops, and help your people thrive.</p><b>Start a peaceful world →</b></button><button data-mode="conquest"><span>⚑</span><h2>Conquest</h2><p>Two rival civilizations. Start with trained armies at the frontier, fight with ragdoll combat, and capture the enemy capital.</p><b>Enter the battlefield →</b></button></div></main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',()=>{const mode=button.dataset.mode as GameMode;const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);startGame(mode);}));
}
function startGame(mode:GameMode){
app.innerHTML=`
  <div id="world" aria-label="Interactive medieval landscape"></div>
  <header class="topbar">
    <div class="brand"><span class="brand-icon">♜</span><div><span class="eyebrow">PROJECT</span><h1>Hearth<span class="dot">.</span></h1></div></div>
    <div class="chapter"><span class="live-dot"></span> HEARTHWOOD <span class="divider">/</span> <span id="world-clock">Day 1 · 08:00</span></div>
    <div class="header-actions"><button id="change-mode" class="jev-top-button" title="Choose a mode for a new session. This resets the current world.">${mode==='world'?'World Building':'Conquest'} · New game</button><button id="open-town-top" class="jev-top-button">Town</button><button id="open-agent-view" class="jev-top-button">Agent view</button><button id="open-jev-top" class="jev-top-button">Connect Jev ↗</button><button id="help" class="icon-button" aria-label="Show camera controls" title="Camera controls">?</button></div>
  </header>
  <aside id="controls" class="controls panel" hidden>
    <div class="controls-heading"><span class="eyebrow">FIND YOUR PERSPECTIVE</span><button id="close-help" aria-label="Close controls">×</button></div>
    <p><span>Pan</span><b>Drag · WASD · Arrows</b></p><p><span>Orbit</span><b>Right-drag · Q / E</b></p><p><span>Zoom</span><b>Scroll · Pinch</b></p><p><span>Touch</span><b>One finger orbit · Two pan</b></p>
  </aside>
  <footer>
    <div class="toolbar panel"><button id="home" title="Return to the starting camera view"><span>⌂</span> Home view</button><div class="separator"></div><label for="cycle"><input id="cycle" type="checkbox" checked> <span>Day cycle</span></label><input id="light" type="range" min="0" max="100" value="33" aria-label="Preview lighting (disables automatic day lighting)"><span id="light-label">Living daylight</span><div class="separator"></div><button id="hide-ui" title="Hide interface (press Escape to restore)">⛶ <span>Immerse</span></button></div>
    <div class="footnote"><span>Click a villager to inspect <i>·</i> Drag to explore <i>·</i> Scroll to get closer</span><span>${mode==='world'?'PEACEFUL WORLD BUILDING':'CONQUEST · CAPTURE THE CAPITAL'}</span></div>
  </footer>
  <button id="restore" hidden>↩ Return to overview</button>
`;

try {
  const {scene,camera,renderer,lighting}=createScene(document.querySelector('#world')!);
  const world=createWorld(scene);
  const cameraController=createCameraControls(camera,renderer.domElement);
  const people=setupPeople(scene,camera,renderer.domElement,world.obstacles,world.seed,cameraController.focus);
  let updateCampaign=(_dt:number)=>{};
  if(mode==='conquest'){
  const rivalWorld=createWorld(scene);rivalWorld.root.position.x=110;
  const campaign=new Campaign(people.simulation,world.obstacles,world.seed);
  const rivalPeople=createPeopleView(scene,campaign.rival.villagers,110);
  const warView=createCampaignView(scene,campaign);
  const warUI=createCampaignUI(campaign,cameraController.focus,()=>{cameraController.controls.target.set(55,0,0);camera.position.set(80,130,155);cameraController.controls.update();});
  let ragdolls:{step:(dt:number)=>void}|undefined;
  void import('./conquest/ragdolls').then(module=>module.createRagdolls(scene,campaign,world.obstacles)).then(physics=>{ragdolls=physics;campaign.physicsStatus='Physics ragdolls ready';}).catch(error=>{campaign.physicsStatus='Ragdoll physics unavailable — reload to retry';console.error('Ragdoll initialization failed',error);});
  people.setCampaign({step:dt=>{campaign.step(dt);ragdolls?.step(dt);},ended:()=>campaign.winner!==null||campaign.physicsStatus==='Loading ragdoll physics…'});
  let campaignUiTime=0;
  cameraController.focus({x:55,z:0});
  updateCampaign=(dt:number)=>{rivalWorld.update(campaign.rival.resources,campaign.rival.buildings,campaign.rival.stores.wood,cycle.checked?people.simulation.hour:Number(light.value)*.24,camera);rivalPeople.update(camera,null,false,campaign.time);warView.update();campaignUiTime+=dt;if(campaignUiTime>.4){warUI.update();campaignUiTime=0;}};
  }
  document.querySelector('#change-mode')!.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.delete('mode');location.assign(url.toString());});
  const cycle=document.querySelector<HTMLInputElement>('#cycle')!,light=document.querySelector<HTMLInputElement>('#light')!;
  renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
  document.querySelector('#home')!.addEventListener('click',cameraController.home);
  const help=document.querySelector<HTMLElement>('#controls')!;
  document.querySelector('#help')!.addEventListener('click',()=>help.hidden=!help.hidden);
  document.querySelector('#close-help')!.addEventListener('click',()=>help.hidden=true);
  document.querySelector<HTMLInputElement>('#light')!.addEventListener('input',event=>{
    const value=Number((event.target as HTMLInputElement).value);cycle.checked=false;lighting(value*.24);
    document.querySelector('#light-label')!.textContent='Light preview';
  });
  cycle.addEventListener('change',()=>document.querySelector('#light-label')!.textContent=cycle.checked?'Living daylight':'Light preview');
  const restore=document.querySelector<HTMLButtonElement>('#restore')!;
  function immerse(enabled:boolean){app.classList.toggle('immersed',enabled);restore.hidden=!enabled;}
  document.querySelector('#hide-ui')!.addEventListener('click',()=>immerse(true));restore.addEventListener('click',()=>immerse(false));
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){immerse(false);help.hidden=true;}});
  let previous=performance.now();
  renderer.setAnimationLoop((now:number)=>{const dt=Math.min((now-previous)/1000,.05);previous=now;cameraController.update(dt);people.update(dt);if(cycle.checked){lighting(people.simulation.hour);light.value=String(people.simulation.hour/24*100);}world.update(people.simulation.resources,people.simulation.buildings,people.simulation.stores.wood,cycle.checked?people.simulation.hour:Number(light.value)*.24,camera);updateCampaign(dt);renderer.render(scene,camera);});
} catch(error) {
  const message=document.createElement('div');message.className='error panel';message.textContent='The landscape could not start. Please use a browser with WebGL enabled and reload.';app.appendChild(message);console.error(error);
}

}
const requestedMode=new URL(location.href).searchParams.get('mode');
if(requestedMode==='world'||requestedMode==='conquest')startGame(requestedMode);else chooseMode();
