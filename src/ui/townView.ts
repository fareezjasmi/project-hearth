import type {PeopleSimulation} from '../simulation/people';
import {birthReadiness,isShop,planBuilding,planRoad,residents} from '../simulation/town';
import type {Point} from '../simulation/navigation';
import './townView.css';
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function createTownView(app:Element,sim:PeopleSimulation,focus:(point:Point)=>void,inspect:(id:string)=>void){
  app.insertAdjacentHTML('beforeend',`<section id="town-view" class="agent-view panel town-view" hidden aria-label="Community and settlement growth">
    <header class="agents-heading"><div><span class="eyebrow">BUILDING A LIFE TOGETHER</span><h2>Our growing civilization</h2></div><button id="close-town-view">Back to village ×</button></header>
    <div class="town-metrics" id="town-metrics"></div><div class="town-goal"><span class="eyebrow">OUR SHARED GOAL</span><strong id="town-goal"></strong><small id="town-workforce"></small></div>
    <div class="town-columns"><section><h3>Homes & families</h3><p class="town-help">Villagers form a household through mutual friendship and a free home. Children arrive only when parents, food reserves, and space are ready.</p><div id="town-families"></div><h3>Our homes</h3><div id="town-homes"></div></section>
      <section><h3>Build together</h3><label class="growth-switch"><input id="auto-grow" type="checkbox" checked> Let the village plan its own growth</label><p class="town-help">Up to three builders share a project. Timber is spent once; everyone’s labor adds to its progress.</p>
      <div class="town-plan-buttons"><button data-plan="road">Plan road <small>Connect buildings · faster walking</small></button><button data-plan="house">Plan cottage <small>24 timber · 5 beds</small></button><button data-plan="market">Plan market <small>30 timber · prepared meals</small></button><button data-plan="bakery">Plan bakery <small>36 timber · efficient meals</small></button></div><p id="town-plan-status" role="status">Plans reserve a marked plot. Workers supply materials and labor.</p>
      <div id="town-projects"></div><h3>Our roads</h3><div id="town-roads"></div><h3>Our shops</h3><div id="town-shops"></div><h3>A small city, one step at a time</h3><div id="town-city-progress"></div><p class="town-help">The first city milestone is 24 residents, 8 finished homes, and 2 finished shops. This map supports up to 40 residents and 14 additional development plots.</p></section></div>
    <footer class="agents-footer">Time is stylized: a child’s first year takes one game day. Infants stay home; children never take work jobs. Family growth is gradual, not instant.</footer>
  </section>`);
  const root=document.querySelector<HTMLElement>('#town-view')!;let previousFocus:HTMLElement|null=null,lastContent='';
  const text=(id:string,value:string)=>{const e=document.getElementById(id);if(e&&e.textContent!==value)e.textContent=value;};
  const close=()=>{root.hidden=true;previousFocus?.focus({preventScroll:true});};
  root.querySelector('#close-town-view')!.addEventListener('click',close);
  root.querySelector('#auto-grow')!.addEventListener('change',e=>sim.autoGrow=(e.target as HTMLInputElement).checked);
  root.addEventListener('click',e=>{
    const target=e.target as HTMLElement,plan=target.closest<HTMLElement>('[data-plan]'),home=target.closest<HTMLElement>('[data-town-home]'),person=target.closest<HTMLElement>('[data-town-person]');
    if(plan){text('town-plan-status',plan.dataset.plan==='road'?planRoad(sim):planBuilding(sim,plan.dataset.plan as 'house'|'market'|'bakery'));lastContent='';update();}
    if(home){const b=sim.building(home.dataset.townHome!);if(b){close();focus(b.position);}}
    if(person){close();inspect(person.dataset.townPerson!);}
  });
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden&&!document.querySelector<HTMLDialogElement>('#jev-dialog')?.open)close();});
  function update(){
    if(root.hidden)return;
    const homes=sim.buildings.filter(b=>b.kind==='house'&&b.complete),shops=sim.buildings.filter(b=>isShop(b)&&b.complete);
    text('town-goal',sim.sharedGoal);text('town-workforce',`${sim.workers('FARM').length+sim.workers('GATHER_FOOD').length} supplying food · ${sim.workers('GATHER_WOOD').length} gathering timber · ${sim.workers('BUILD').length} building · ${sim.workers('WORK_SHOP').length} running shops`);
    const signature=[sim.revision,sim.population,sim.households.length,Math.floor(sim.time/5),sim.villagers.filter(v=>v.insideHome).map(v=>v.id).join(',')].join(':');if(signature===lastContent)return;lastContent=signature;
    root.querySelector('#town-metrics')!.innerHTML=[['Settlement',sim.stage],['Residents',`${sim.population} / ${sim.housing} beds`],['Families',sim.households.length],['Shops',shops.length]].map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('');
    root.querySelector('#town-families')!.innerHTML=sim.households.map(f=>`<article class="town-card"><strong>${escape(f.name)}</strong><small>${escape(sim.building(f.homeId)?.name??'Seeking a home')}</small><div class="family-members">${[...f.partnerIds,...f.childIds].map(id=>{const p=sim.person(id)!;return `<button data-town-person="${p.id}">${escape(p.name)} <small>${p.health<=0?'Deceased':p.lifeStage==='child'?`Child · ${p.age} years`:p.insideHome?'At home':'Adult'}</small></button>`;}).join('')}</div><p>${escape(birthReadiness(sim,f))}</p></article>`).join('')||'<p class="town-empty">No households yet. Finish cottages and secure food so friends can start families.</p>';
    root.querySelector('#town-homes')!.innerHTML=homes.map(b=>{const people=residents(sim,b.id);return `<article class="town-card"><button class="town-place" data-town-home="${b.id}">${escape(b.name)} ↗</button><small>${people.length}/${b.capacity} residents · ${people.filter(p=>p.insideHome).length} inside</small><p>${people.map(p=>escape(p.name)).join(', ')||'Available for a new household'}</p></article>`;}).join('');
    root.querySelector('#town-projects')!.innerHTML=sim.buildings.filter(b=>!b.complete).map(b=>`<article class="town-card"><button class="town-place" data-town-home="${b.id}">${escape(b.name)} ↗</button><small>${b.funded?'Materials supplied':`${b.woodCost} timber needed`} · ${Math.round(b.progress*100)}%</small><div class="meter"><i style="width:${b.progress*100}%;background:#c7b582"></i></div><p>Team: ${sim.workers('BUILD',b.id).map(p=>escape(p.name)).join(', ')||'Waiting for available builders'}</p></article>`).join('')||'<p class="town-empty">No active construction. The village can plan its next project.</p>';
    root.querySelector('#town-roads')!.innerHTML=sim.buildings.filter(b=>b.kind==='road'&&b.complete).map(b=>`<article class="town-card"><button class="town-place" data-town-home="${b.id}">${escape(b.name)} ↗</button><small>Open · 30% faster walking · lanterns after dusk</small></article>`).join('')||'<p class="town-empty">Roads grow with your village. Builders connect finished buildings to the village green.</p>';
    root.querySelector('#town-shops')!.innerHTML=shops.map(b=>`<article class="town-card"><button class="town-place" data-town-home="${b.id}">${escape(b.name)} ↗</button><small>${b.meals??0} meals ready · ${sim.workers('WORK_SHOP',b.id).map(p=>escape(p.name)).join(', ')||'Waiting for a shopkeeper'}</small><p>${b.kind==='bakery'?'6 food + 1 timber makes 3 meals.':'9 food makes 3 meals near the neighborhood.'}</p></article>`).join('')||'<p class="town-empty">Markets distribute meals; bakeries use less food per meal. Build one when food and timber are secure.</p>';
    root.querySelector('#town-city-progress')!.innerHTML=[[sim.population,24,'Residents'],[homes.length,8,'Homes'],[shops.length,2,'Shops']].map(([value,goal,label])=>`<div class="city-progress"><span>${label}</span><b>${value} / ${goal}</b><div class="meter"><i style="width:${Math.min(100,Number(value)/Number(goal)*100)}%;background:#b7c98d"></i></div></div>`).join('');
  }
  return {open(){previousFocus=document.activeElement as HTMLElement;root.hidden=false;update();root.querySelector<HTMLButtonElement>('#close-town-view')!.focus();},update};
}
