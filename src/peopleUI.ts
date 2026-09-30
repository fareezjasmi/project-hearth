import * as THREE from 'three';
import {PeopleSimulation} from './simulation/people';
import {createPeopleView} from './render/people';
import type {Obstacle,Point} from './simulation/navigation';
import type {WorldSeed,Priorities,DecisionRecord} from './simulation/types';
import {actionLabels} from './simulation/types';
import {DecisionScheduler} from './decisions/scheduler';
import {createAgentView} from './ui/agentView';
import {createTownView} from './ui/townView';

const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const stamp=(time:number)=>`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;

export function setupPeople(scene:THREE.Scene,camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,obstacles:Obstacle[],seed:WorldSeed,focus:(point:Point)=>void) {
  const simulation=new PeopleSimulation(obstacles,seed),scheduler=new DecisionScheduler(simulation),provider=scheduler.provider;
  const app=document.querySelector('#app')!;
  app.insertAdjacentHTML('beforeend',`<div id="labels"></div>
    <aside class="village-panel panel"><span class="eyebrow">A LIVING SETTLEMENT</span><h2>Hearthwood</h2><p class="village-subtitle" id="settlement-stage">A hamlet with a shared tomorrow.</p>
      <div class="economy"><div><span>Food</span><b id="food-store">48</b><small id="food-condition">Adequate</small></div><div><span>Timber</span><b id="wood-store">12</b><small id="wood-condition">Low</small></div><div><span>Shelter</span><b id="housing-store">10 / 12</b><small>Residents / beds</small></div></div>
      <div class="community-summary"><strong id="shared-goal"></strong><small id="community-counts"></small><button id="open-town-view">Homes, families & town growth ↗</button></div>
      <div class="section-title"><span class="eyebrow">VILLAGE PRIORITIES</span><span>Influence, not orders</span></div>
      ${(['food','wood','housing'] as const).map(key=>`<label class="priority-row" for="priority-${key}"><span>${key==='wood'?'Timber':key[0].toUpperCase()+key.slice(1)}</span><output id="priority-value-${key}">${Math.round(simulation.priorities[key]*100)}%</output><input id="priority-${key}" type="range" min="0" max="100" value="${simulation.priorities[key]*100}" data-priority="${key}"></label>`).join('')}
      <p class="village-tip">Villagers weigh these against their own needs, personality, and responsibilities.</p>
      <div class="section-title"><span class="eyebrow">IN THE MAKING</span></div><div id="construction"></div>
      <button id="open-jev" class="connect-button"><span class="connection-dot"></span><span id="provider-badge">Local decisions</span><span>Configure ↗</span></button>
      <p class="connection-caption" id="connection-caption">Connect Jev to watch live AI choices.</p>
    </aside>
    <aside class="people-panel panel"><div class="people-heading"><span class="eyebrow">LIFE IN HEARTHWOOD</span><span class="population" id="population">10</span></div>
      <div class="panel-tabs" role="tablist" aria-label="Village panels"><button role="tab" aria-selected="true" aria-controls="roster" id="tab-people" data-tab="people" class="active">People</button><button role="tab" aria-selected="false" aria-controls="activity" id="tab-activity" data-tab="activity">Decisions</button><button role="tab" aria-selected="false" aria-controls="journal" id="tab-journal" data-tab="journal">Journal</button></div>
      <div class="panel-content"><div id="roster" role="tabpanel" aria-labelledby="tab-people"></div><div id="activity" role="tabpanel" aria-labelledby="tab-activity" hidden></div><div id="journal" role="tabpanel" aria-labelledby="tab-journal" hidden></div></div>
      <div class="people-options"><label><input id="nameplates" type="checkbox"> Show names</label><span id="elapsed">00:00</span></div>
      <div class="time-controls" aria-label="Simulation speed"><button data-speed="0" aria-pressed="false">Pause</button><button data-speed="1" class="active" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="4" aria-pressed="false">4×</button></div>
      <p class="panel-footnote">Click a decision to inspect its snapshot.</p>
    </aside>
    <aside id="inspector" class="inspector panel" hidden aria-label="Villager inspection"></aside>
    <dialog id="jev-dialog" class="jev-dialog panel"><div class="inspector-top"><span class="eyebrow">THE DECISION LAYER</span><button id="close-jev" aria-label="Close Jev settings">×</button></div><h2>Connect Jev</h2>
      <p>Let Jev choose what your villagers do. Movement, resources, and survival stay in the simulation.</p>
      <form id="jev-form"><label for="jev-key">TypeSafe API key</label><input id="jev-key" name="jev-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Jev API key" required minlength="8" maxlength="512"><button type="submit" id="connect-jev">Connect & use Jev</button></form>
      <p class="key-note" id="jev-server-note">Kept only in this local server’s memory. Never saved to browser storage or project files. Connecting checks your account; live decisions use your TypeSafe credits.</p>
      <div class="jev-mode"><label><input type="checkbox" id="use-jev" disabled> Use Jev for decisions</label><button id="disconnect-jev" disabled>Remove key</button></div>
      <p id="jev-status" class="jev-status" role="status">Local decisions · no key connected</p>
      <div class="jev-details"><span>Model <b>jev-latest</b></span><span>Budget <b>Up to 20 requests / minute</b></span><span>Successful decisions <b id="jev-count">0</b></span></div>
      <p class="key-note">Local decisions keep the village moving during request cooldowns, outages, and emergencies. Every decision is labeled by source.</p>
      <a href="https://console.typesafe.ai/" target="_blank" rel="noreferrer">Get a key from TypeSafe ↗</a>
    </dialog>`);
  const view=createPeopleView(scene,simulation.villagers);
  let selected:string|null=null,selectedRecord:DecisionRecord|null=null,labels=false,accumulator=0,uiTime=1,lastRevision=-1,lastDecisionKey='';
  const roster=document.querySelector<HTMLElement>('#roster')!,inspector=document.querySelector<HTMLElement>('#inspector')!,dialog=document.querySelector<HTMLDialogElement>('#jev-dialog')!;
  const agents=createAgentView(app,simulation,scheduler,id=>{select(id);const person=simulation.person(id);if(person)focus(person.position);},()=>{dialog.showModal();refreshConnection();});
  const town=createTownView(app,simulation,focus,id=>{select(id);const person=simulation.person(id);if(person)focus(person.position);});
  document.querySelector('#open-town-view')!.addEventListener('click',()=>town.open());
  document.querySelector('#open-town-top')!.addEventListener('click',()=>town.open());
  document.querySelector('#open-agent-view')!.addEventListener('click',()=>agents.open(selected??undefined));
  function syncRoster(){for(const v of simulation.villagers)if(!roster.querySelector(`[data-person-id="${v.id}"]`))roster.insertAdjacentHTML('beforeend',`<button class="roster-person" data-person-id="${v.id}"><span class="person-initial">${v.name[0]}</span><span><strong>${v.name}</strong><small id="role-${v.id}">${v.role}</small></span><span class="roster-state" id="state-${v.id}"></span></button>`);}
  syncRoster();
  const text=(id:string,value:string)=>{const element=document.getElementById(id);if(element&&element.textContent!==value)element.textContent=value;};
  function select(id:string|null,record:DecisionRecord|null=null){
    selected=id;selectedRecord=record;inspector.hidden=!id;lastDecisionKey='';const v=simulation.person(id??'');
    if(v){
      inspector.innerHTML=`<div class="inspector-top"><span class="eyebrow">A LIFE IN HEARTHWOOD</span><button id="close-inspector" aria-label="Close villager inspection">×</button></div><h2>${v.name}</h2><p class="person-detail"><span id="inspect-age-role"></span><button id="find-person">Find ↗</button></p><div class="home-summary" id="inspect-home"></div>
        <div class="activity-card"><span class="eyebrow">RIGHT NOW</span><strong id="inspect-activity"></strong><small id="inspect-target"></small><small id="inspect-inventory"></small></div>
        ${['Health','Hunger','Energy'].map(label=>`<div class="need"><div><span>${label}</span><b><span id="need-${label}"></span><small> / 100</small></b></div><div class="meter"><i id="bar-${label}" class="bar-${label}"></i></div></div>`).join('')}
        <button id="watch-agent" class="watch-agent-button">Watch this person’s Jev decisions ↗</button><div class="decision-card" id="inspect-decision"></div>
        <details class="person-details"><summary>Personality & relationships</summary><div class="traits">${Object.entries(v.traits).map(([name,value])=>`<div><span>${name[0].toUpperCase()+name.slice(1)}</span><b>${Math.round(value*100)}%</b></div>`).join('')}</div><div id="inspect-relationships"></div></details>
        <details class="person-details"><summary>Recent memories</summary><div id="inspect-memories"></div></details>`;
    }
    refresh();
  }
  app.addEventListener('click',event=>{
    const target=event.target as HTMLElement;
    const recordElement=target.closest<HTMLElement>('[data-record-id]');
    if(recordElement){const record=simulation.records.find(r=>r.id===Number(recordElement.dataset.recordId));if(record)select(record.personId,record);return;}
    const person=target.closest<HTMLElement>('[data-person-id]');if(person)select(person.dataset.personId!);
    if(target.closest('#close-inspector'))select(null);
    if(target.closest('#watch-agent')&&selected)agents.open(selected);
    if(target.closest('#find-person')&&selected){const v=simulation.person(selected);if(v)focus(v.position);}
    if(target.closest('#live-decision')){selectedRecord=null;lastDecisionKey='';refresh();}
    const tab=target.closest<HTMLElement>('[data-tab]');if(tab){
      document.querySelectorAll<HTMLElement>('[data-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
      for(const [name,id]of [['people','roster'],['activity','activity'],['journal','journal']])document.getElementById(id)!.hidden=tab.dataset.tab!==name;
    }
    const speed=target.closest<HTMLElement>('[data-speed]');if(speed){simulation.speed=Number(speed.dataset.speed);document.querySelectorAll<HTMLElement>('[data-speed]').forEach(button=>{const active=button.dataset.speed===speed.dataset.speed;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
  });
  document.querySelector<HTMLInputElement>('#nameplates')!.addEventListener('change',event=>labels=(event.target as HTMLInputElement).checked);
  document.querySelectorAll<HTMLInputElement>('[data-priority]').forEach(input=>{
    input.addEventListener('input',()=>text(`priority-value-${input.dataset.priority}`,`${input.value}%`));
    input.addEventListener('change',()=>simulation.setPriority(input.dataset.priority as keyof Priorities,Number(input.value)/100));
  });
  const keyInput=document.querySelector<HTMLInputElement>('#jev-key')!,connectButton=document.querySelector<HTMLButtonElement>('#connect-jev')!,modeInput=document.querySelector<HTMLInputElement>('#use-jev')!,disconnectButton=document.querySelector<HTMLButtonElement>('#disconnect-jev')!;
  for(const id of ['open-jev','open-jev-top'])document.getElementById(id)!.addEventListener('click',()=>{dialog.showModal();refreshConnection();});
  document.querySelector('#close-jev')!.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>keyInput.value='');
  document.querySelector('#jev-form')!.addEventListener('submit',event=>{
    event.preventDefault();const key=keyInput.value.trim();keyInput.value='';connectButton.disabled=true;connectButton.textContent='Connecting…';
    void provider.connect(key).then(()=>scheduler.reconsiderAll('Jev connected')).catch(()=>{}).finally(()=>{connectButton.disabled=false;connectButton.textContent='Connect & use Jev';refreshConnection();});
    refreshConnection();
  });
  modeInput.addEventListener('change',()=>{provider.setEnabled(modeInput.checked);scheduler.reconsiderAll('Decision mode changed');refreshConnection();});
  disconnectButton.addEventListener('click',()=>{disconnectButton.disabled=true;void provider.disconnect().finally(refreshConnection);refreshConnection();});
  function refreshConnection(){
    text('jev-status',provider.status);text('jev-count',String(provider.successful));
    modeInput.disabled=!provider.connected;modeInput.checked=provider.enabled;disconnectButton.disabled=!provider.connected;
    const live=provider.enabled&&provider.connected&&performance.now()>=provider.backoffUntil;
    // A static deploy has no loopback Jev server, so never offer a key field that cannot work.
    const noServer=provider.serverAvailable===false;
    keyInput.disabled=noServer;connectButton.disabled=noServer||connectButton.textContent==='Connecting…';
    connectButton.textContent=noServer?'Jev needs the local server':'Connect & use Jev';
    keyInput.placeholder=noServer?'Unavailable on this host':'Paste your Jev API key';
    text('jev-server-note',noServer?'This hosted demo runs without a Jev server, so key entry is disabled. The village is fully playable on the built-in local decision policy. Run the project locally to connect a Jev key.':'Kept only in this local server’s memory. Never saved to browser storage or project files. Connecting checks your account; live decisions use your TypeSafe credits.');
    text('provider-badge',live?'Jev + local continuity':provider.enabled?'Local fallback active':'Local decisions');
    text('open-jev-top',noServer?'Jev · local only ↗':provider.connected?'Jev settings ↗':'Connect Jev ↗');
    document.querySelector('.connection-dot')!.classList.toggle('connected',live);
    text('connection-caption',noServer?'Local decision policy · Jev needs the local server.':live?'Live AI choices · open Decisions to inspect.':provider.enabled?'Jev is resting. Local decisions keep life moving.':provider.connected?'Key connected. Enable Jev in Configure.':'Connect Jev to watch live AI choices.');
  }
  void provider.statusCheck().then(refreshConnection);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down:{x:number;y:number}|null=null;
  canvas.addEventListener('pointerdown',event=>{if(event.button===0)down={x:event.clientX,y:event.clientY};});canvas.addEventListener('pointercancel',()=>down=null);
  canvas.addEventListener('pointerup',event=>{
    if(!down||event.button!==0)return;const moved=Math.hypot(event.clientX-down.x,event.clientY-down.y);down=null;if(moved>6)return;
    const bounds=canvas.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(view.hits.filter(hit=>hit.parent?.visible),false)[0];select(hit?hit.object.userData.personId:null);
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open)select(null);});
  function renderDecision(record:DecisionRecord|undefined){
    const key=record?`${record.id}:${!!selectedRecord}`:'none';if(key===lastDecisionKey)return;lastDecisionKey=key;
    const element=document.querySelector('#inspect-decision')!;
    if(!record){element.innerHTML='<span class="eyebrow">NEXT DECISION</span><p>Waiting for the next decision opportunity.</p>';return;}
    const {decision,context}=record;
    element.innerHTML=`<div class="decision-heading"><span class="eyebrow">${selectedRecord?'HISTORICAL DECISION':'LATEST DECISION'}</span><span class="source-tag ${decision.source==='Jev'?'jev':''}">${decision.source}</span></div>
      <strong>${escape(actionLabels[decision.action])}</strong><small>${escape(decision.targetId)} · ${stamp(record.time)} · ${record.latencyMs} ms</small>
      <p>${escape(decision.reason)}</p><div class="decision-meta">Priority ${Math.round(decision.priority*100)}%${decision.confidence!==undefined?` · Confidence ${Math.round(decision.confidence*100)}%`:''} · ${record.status}</div>
      <small>${escape(record.detail)}</small>
      <details class="snapshot"><summary>Input & available actions</summary><p>Trigger: ${escape(context.trigger)}</p><p>Hunger ${Math.round(context.self.hunger)} · Energy ${Math.round(context.self.energy)}<br>Food ${context.civilization.food} · Wood ${context.civilization.wood}</p><ul>${context.options.map(o=>`<li>${escape(o.action)} → ${escape(o.targetName)}</li>`).join('')}</ul><details><summary>Full context snapshot</summary><pre>${escape(JSON.stringify(context,null,2))}</pre></details></details>
      <span class="explanation-note">Summary from game facts; no hidden reasoning.</span>${selectedRecord?'<button id="live-decision">Return to latest decision</button>':''}`;
  }
  function refresh(){
    syncRoster();text('settlement-stage',`${simulation.stage} · A shared tomorrow.`);text('shared-goal',simulation.sharedGoal);text('community-counts',`${simulation.households.length} families · ${simulation.villagers.filter(v=>v.lifeStage==='child'&&v.health>0).length} children · ${simulation.workers('BUILD').length} builders working together`);
    text('elapsed',stamp(simulation.time));text('population',String(simulation.population));text('food-store',String(simulation.stores.food));text('wood-store',String(simulation.stores.wood));text('housing-store',`${simulation.population} / ${simulation.housing}`);
    text('food-condition',simulation.stores.food<simulation.population*3?'Low reserves':simulation.stores.food<simulation.foodTarget?'Modest reserves':'Well supplied');text('wood-condition',simulation.stores.wood<12?'Critical':simulation.stores.wood<simulation.woodTarget?'Building reserves':'Well supplied');
    const hour=Math.floor(simulation.hour),minute=Math.floor((simulation.hour-hour)*60);text('world-clock',`Day ${simulation.day} · ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
    document.querySelector('#construction')!.innerHTML=simulation.buildings.filter(b=>b.woodCost>0).map(b=>`<div class="building-progress"><span>${b.name}</span><small>${b.complete?'Complete':b.funded?`${Math.round(b.progress*100)}%`:`${b.woodCost} timber needed`}</small><div class="meter"><i style="width:${b.progress*100}%"></i></div></div>`).join('');
    for(const v of simulation.villagers){text(`role-${v.id}`,v.role);text(`state-${v.id}`,v.activity==='Considering with Jev'?'Deciding…':v.activity);roster.querySelector(`[data-person-id="${v.id}"]`)!.classList.toggle('selected',selected===v.id);}
    if(lastRevision!==simulation.revision){
      lastRevision=simulation.revision;
      document.querySelector('#activity')!.innerHTML=simulation.records.slice(0,45).map(r=>`<button class="activity-event" data-record-id="${r.id}"><span><b>${r.name}</b><small>${stamp(r.time)}</small></span><strong>${escape(actionLabels[r.decision.action])}</strong><span><small class="source-tag ${r.decision.source==='Jev'?'jev':''}">${r.decision.source}</small><small>${r.status==='accepted'?`${r.latencyMs} ms`:r.status}</small></span></button>`).join('')||'<p class="empty-state">The first decisions are on their way.</p>';
      document.querySelector('#journal')!.innerHTML=simulation.events.slice(0,45).map(e=>`<div class="journal-event"><small>${stamp(e.time)} · ${escape(e.type.replaceAll('_',' ').toLowerCase())}</small><p>${escape(e.summary)}</p></div>`).join('')||'<p class="empty-state">A quiet beginning. Village events appear here.</p>';
    }
    refreshConnection();
    const v=simulation.person(selected??'');if(!v)return;
    text('inspect-age-role',`${v.age} years old · ${v.role}`);
    const family=simulation.households.find(f=>f.id===v.householdId);
    document.querySelector('#inspect-home')!.innerHTML=`<strong>${escape(simulation.building(v.homeId)?.name??'No assigned home')}</strong> · ${v.insideHome?'Inside':'Out in the village'}<br>${family?`Family: ${escape(family.name)} · ${family.childIds.length} children`:'Independent household'}${v.parentIds.length?`<br>Parents: ${v.parentIds.map(id=>escape(simulation.person(id)?.name??id)).join(' & ')}`:''}`;
    text('inspect-activity',v.activity);text('inspect-target',v.destination);text('inspect-inventory',`Carrying ${v.inventory.wood} wood · ${v.inventory.food} food${v.task?.carriedMeal?' · 1 reserved meal':''}`);
    for(const [label,value]of [['Health',v.health],['Hunger',v.hunger],['Energy',v.energy]] as const){text(`need-${label}`,String(Math.round(value)));document.getElementById(`bar-${label}`)!.style.width=`${value}%`;}
    text('inspect-relationships',v.relationships.map(r=>`${simulation.person(r.personId)?.name??r.personId}: ${r.kind} · affection ${r.affection}, trust ${r.trust}`).join('\n'));
    document.querySelector('#inspect-memories')!.innerHTML=[...v.memories].reverse().slice(0,5).map(m=>`<p class="memory-line">${escape(m.summary)}</p>`).join('');
    renderDecision(selectedRecord??simulation.records.find(r=>r.personId===v.id));
  }
  let campaign:{step:(dt:number)=>void;ended:()=>boolean}|undefined;
  return {simulation,setCampaign(value:typeof campaign){campaign=value;},update(dt:number){
    if(!document.hidden&&!dialog.open&&!campaign?.ended()){accumulator+=dt*simulation.speed;while(accumulator>=.05){simulation.step(.05);campaign?.step(.05);if(!campaign?.ended())scheduler.tick();accumulator-=.05;if(campaign?.ended()){accumulator=0;break;}}}
    view.update(camera,selected,labels,simulation.time);uiTime+=dt;if(uiTime>.3){refresh();agents.update();town.update();uiTime=0;}
  }};
}
