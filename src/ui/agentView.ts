import type {PeopleSimulation} from '../simulation/people';
import {actionLabels} from '../simulation/types';
import type {DecisionScheduler,AgentTrace} from '../decisions/scheduler';
import './agentView.css';

const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const stamp=(time:number)=>`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
const source=(trace:AgentTrace)=>trace.requestedSource==='Jev'&&trace.result?.decision.source==='Local'?'Local fallback':trace.result?.decision.source??trace.requestedSource;
const phase=(trace:AgentTrace)=>({requesting:'Jev is deciding',ready:'Awaiting simulation',accepted:'Accepted',rejected:'Rejected by world',stale:'Stale result discarded'}[trace.phase]);

export function createAgentView(app:Element,sim:PeopleSimulation,scheduler:DecisionScheduler,inspect:(id:string)=>void,connect:()=>void){
  app.insertAdjacentHTML('beforeend',`<section id="agent-view" class="agent-view panel" hidden aria-label="Live agent observatory">
    <header class="agents-heading"><div><span class="eyebrow">THE MINDS OF HEARTHWOOD</span><h2>Jev, person by person.</h2></div><button id="close-agent-view" aria-label="Close agent view">Back to village ×</button></header>
    <div class="agents-status"><span id="agents-provider"></span><span id="agents-count"></span><button id="agents-connect">Jev settings ↗</button></div>
    <div class="agents-layout"><div class="agents-overview"><p class="agents-intro">Choose a person to watch their decisions. The village keeps running while this view is open.</p><div class="agent-grid" id="agent-grid"></div></div>
      <section class="agent-detail" aria-label="Selected villager decision details"><div class="agent-detail-heading"><div><span class="eyebrow">FOLLOWING</span><h3 id="agent-name"></h3><p id="agent-current"></p></div><button id="agent-find">See in village ↗</button></div>
      <div class="agent-history-controls"><label><input id="agent-follow" type="checkbox" checked> Follow latest</label><label><input id="agent-jev-only" type="checkbox"> Jev requests only</label></div>
      <div id="agent-live-status" role="status"></div><div id="agent-snapshot"></div>
      <div class="agent-history-heading"><span class="eyebrow">THIS PERSON’S HISTORY</span><small>Last 16 decisions</small></div><div id="agent-history"></div>
      </section></div>
    <footer class="agents-footer">Viewing adds no API requests. Local fallback is labeled. Explanations show game facts, never hidden chain-of-thought.</footer>
  </section>`);
  const root=document.querySelector<HTMLElement>('#agent-view')!,grid=root.querySelector<HTMLElement>('#agent-grid')!;
  let selected=sim.villagers[0].id,follow=true,jevOnly=false,pinned:AgentTrace|undefined,lastSnapshot='',lastHistory='',returnFocus:HTMLElement|null=null;
  const cards=new Map<string,HTMLElement>();
  function syncCards(){for(const v of sim.villagers){
    if(cards.has(v.id))continue;
    const button=document.createElement('button');button.className='agent-card';button.dataset.agentId=v.id;button.setAttribute('aria-pressed','false');
    button.innerHTML=`<div class="agent-card-person"><span class="agent-avatar">${escape(v.name[0])}</span><div><strong>${escape(v.name)}</strong><small>${escape(v.role)}</small></div><span class="agent-source"></span></div><div class="agent-card-phase"></div><p class="agent-card-action"></p><p class="agent-card-target"></p><div class="agent-card-needs"></div><small class="agent-card-last"></small>`;
    grid.appendChild(button);cards.set(v.id,button);
  }}
  syncCards();
  const text=(selector:string,value:string,parent:ParentNode=root)=>{const element=parent.querySelector(selector);if(element&&element.textContent!==value)element.textContent=value;};
  function choose(id:string){selected=id;pinned=undefined;follow=true;(root.querySelector('#agent-follow') as HTMLInputElement).checked=true;lastSnapshot='';lastHistory='';update();}
  function open(id?:string){returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;root.hidden=false;if(id)choose(id);update();root.querySelector<HTMLButtonElement>('#close-agent-view')!.focus();}
  function close(){root.hidden=true;returnFocus?.focus({preventScroll:true});}
  root.querySelector('#close-agent-view')!.addEventListener('click',close);
  root.querySelector('#agents-connect')!.addEventListener('click',connect);
  root.querySelector('#agent-find')!.addEventListener('click',()=>{close();inspect(selected);});
  root.querySelector('#agent-follow')!.addEventListener('change',event=>{follow=(event.target as HTMLInputElement).checked;if(!follow)pinned=visibleTrace();lastSnapshot='';update();});
  root.querySelector('#agent-jev-only')!.addEventListener('change',event=>{jevOnly=(event.target as HTMLInputElement).checked;pinned=undefined;follow=true;(root.querySelector('#agent-follow') as HTMLInputElement).checked=true;lastSnapshot='';lastHistory='';update();});
  root.addEventListener('click',event=>{
    const target=event.target as HTMLElement,card=target.closest<HTMLElement>('[data-agent-id]'),history=target.closest<HTMLElement>('[data-trace-id]');
    if(card)choose(card.dataset.agentId!);
    if(history){pinned=scheduler.traces.get(selected)?.find(t=>t.id===Number(history.dataset.traceId));follow=false;(root.querySelector('#agent-follow') as HTMLInputElement).checked=false;lastSnapshot='';update();}
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!root.hidden&&!document.querySelector<HTMLDialogElement>('#jev-dialog')?.open)close();});
  function history(){return (scheduler.traces.get(selected)??[]).filter(t=>!jevOnly||t.requestedSource==='Jev');}
  function visibleTrace(){return follow?history()[0]:pinned;}
  function snapshot(trace:AgentTrace|undefined){
    const signature=trace?`${trace.id}:${trace.phase}:${trace.detail}:${follow}`:`empty:${selected}:${jevOnly}`;
    if(signature===lastSnapshot)return;
    const sameTrace=trace&&lastSnapshot.startsWith(`${trace.id}:`);lastSnapshot=signature;
    const element=root.querySelector<HTMLElement>('#agent-snapshot')!;
    if(!trace&&sim.person(selected)?.lifeStage==='child'){element.innerHTML='<div class="agent-empty">Children receive local household care, go home at night, and play near home during the day. They do not take work assignments or make Jev requests.</div>';return;}
    const openStates=new Map([...element.querySelectorAll<HTMLDetailsElement>('details')].map(e=>[e.dataset.section,e.open]));
    if(!trace){element.innerHTML=`<div class="agent-empty">${jevOnly?'No Jev request for this person in the retained history. Connect and enable Jev, then wait for their next eligible decision.':'This person has not reached a decision opportunity yet.'}</div>`;return;}
    const c=trace.context,d=trace.result?.decision,chosen=c.options.find(o=>o.action===d?.action&&o.targetId===d?.targetId);
    const payload={...c,options:c.options.map(({utility,...option})=>option)};
    element.innerHTML=`<div class="agent-pipeline"><span class="done">1 · Context</span><span class="${trace.phase==='requesting'?'current':'done'}">2 · ${trace.requestedSource}</span><span class="${trace.phase==='requesting'?'':trace.phase==='ready'?'current':'done'}">3 · World check</span></div>
      <div class="agent-decision-heading"><span class="source-tag ${source(trace)==='Jev'?'jev':''}">${escape(source(trace))}</span><small>${follow?'Latest matching decision':'Pinned snapshot'} · ${stamp(trace.time)}</small></div>
      <h4>${d?escape(actionLabels[d.action]):'Waiting for Jev’s choice…'}</h4><p class="agent-chosen-target">${chosen?escape(chosen.targetName)+' · '+escape(chosen.targetId):'No result received yet'}</p>
      <div class="agent-facts"><span>Priority <b>${d?Math.round(d.priority*100)+'%':'—'}</b></span><span>Confidence <b>${d?.confidence===undefined?'—':Math.round(d.confidence*100)+'%'}</b></span><span>Request time <b>${trace.requestedSource==='Local'?'Local / no call':trace.phase==='requesting'?'In progress':Math.round(trace.elapsedMs)+' ms'}</b></span></div>
      <p class="agent-outcome">${escape(trace.detail)}</p>${d?`<p class="agent-summary">${escape(d.reason)}</p>`:''}
      <details data-section="context" open><summary>What this person observed</summary><p class="agent-trigger">${escape(c.trigger)}</p><div class="agent-observations"><span>Hunger <b>${Math.round(c.self.hunger)}</b></span><span>Energy <b>${Math.round(c.self.energy)}</b></span><span>Food <b>${c.civilization.food} · ${escape(c.civilization.foodStatus)}</b></span><span>Timber <b>${c.civilization.wood} · ${escape(c.civilization.woodStatus)}</b></span></div><p class="agent-priorities">Priorities: food ${Math.round(c.civilization.priorities.food*100)}% · timber ${Math.round(c.civilization.priorities.wood*100)}% · housing ${Math.round(c.civilization.priorities.housing*100)}%</p></details>
      <details data-section="choices" open><summary>Available choices · ${c.options.length}</summary><div class="agent-options">${c.options.map(o=>`<div class="agent-option ${o===chosen?'chosen':''}"><span>${escape(actionLabels[o.action])}${o===chosen?' <b>Selected</b>':''}</span><small>${escape(o.targetName)}</small></div>`).join('')}</div></details>
      <details data-section="memory"><summary>Personality, memories & relationships</summary><div class="agent-traits">${Object.entries(c.self.traits).map(([name,value])=>`<span>${escape(name)} <b>${Math.round(value*100)}%</b></span>`).join('')}</div>${c.memories.map(m=>`<p>${escape(m.summary)}</p>`).join('')}<p>${c.relationships.length?c.relationships.map(r=>`${escape(sim.person(r.personId)?.name??r.personId)} · ${escape(r.kind)} · trust ${r.trust}`).join('<br>'):'No immediately relevant relationships.'}</p></details>
      <details data-section="payload"><summary>${trace.requestedSource==='Jev'?'Context sent to Jev':'Local context snapshot'}</summary><pre>${escape(JSON.stringify(trace.requestedSource==='Jev'?payload:c,null,2))}</pre></details>
      ${d?`<details data-section="result"><summary>Validated decision fields</summary><pre>${escape(JSON.stringify(d,null,2))}</pre></details>`:''}`;
    if(sameTrace)for(const detail of element.querySelectorAll<HTMLDetailsElement>('details'))if(openStates.has(detail.dataset.section))detail.open=openStates.get(detail.dataset.section)!;
  }
  function update(){
    if(root.hidden)return;
    syncCards();
    const provider=scheduler.provider;
    text('#agents-provider',provider.status);
    text('#agents-count',`${provider.successful} Jev replies · ${sim.villagers.filter(v=>v.pending).length} pending${sim.speed===0?' · Simulation paused':''}`);
    for(const v of sim.villagers){
      const card=cards.get(v.id)!,traces=scheduler.traces.get(v.id)??[],latest=traces[0],lastJev=traces.find(t=>t.result?.decision.source==='Jev');
      card.classList.toggle('selected',v.id===selected);card.setAttribute('aria-pressed',String(v.id===selected));card.classList.toggle('requesting',latest?.phase==='requesting');
      text('.agent-source',v.military?'Army orders':latest?source(latest):v.lifeStage==='child'?'Local care':'Waiting',card);text('.agent-card-person small',v.role,card);
      text('.agent-card-phase',v.military?'Local combat controller':latest?phase(latest):v.lifeStage==='child'?'Cared for by the household':'Waiting for first decision',card);
      text('.agent-card-action',v.activity,card);text('.agent-card-target',v.destination,card);
      text('.agent-card-needs',`Hunger ${Math.round(v.hunger)} · Energy ${Math.round(v.energy)}`,card);
      text('.agent-card-last',lastJev?`Last Jev reply ${stamp(lastJev.time)} · ${lastJev.result!.decision.action.replaceAll('_',' ').toLowerCase()}`:'No Jev reply in retained history',card);
    }
    const v=sim.person(selected)!;text('#agent-name',v.name);text('#agent-current',`${v.role} · ${v.activity}${v.task?` · ${v.task.stage}`:''}`);
    const trace=visibleTrace();
    text('#agent-live-status',sim.person(selected)?.military?'Serving in the army. Combat follows campaign orders; civilian decision history is shown below.':trace?.phase==='requesting'?`Jev request in progress · ${((performance.now()-trace.startedAt)/1000).toFixed(1)} s`:trace?`${phase(trace)}${trace.phase==='ready'?' · resumes on the next simulation tick':''}`:'Waiting for a decision.');
    snapshot(trace);
    const items=history(),signature=items.map(t=>`${t.id}:${t.phase}`).join('|')+':'+trace?.id;
    if(signature!==lastHistory){lastHistory=signature;root.querySelector('#agent-history')!.innerHTML=items.map(t=>`<button data-trace-id="${t.id}" class="${trace?.id===t.id?'selected':''}"><span>${stamp(t.time)} · ${escape(source(t))}</span><strong>${t.result?escape(actionLabels[t.result.decision.action]):'Deciding…'}</strong><small>${escape(phase(t))}</small></button>`).join('')||'<p class="agent-empty">No matching decisions yet.</p>';}
  }
  return {open,update};
}
