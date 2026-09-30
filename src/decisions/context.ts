import type {PeopleSimulation} from '../simulation/people';
import type {Action,Candidate,DecisionContext,Villager} from '../simulation/types';
import {distance} from '../simulation/navigation';
import {isShop} from '../simulation/town';

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
export function buildContext(sim:PeopleSimulation,v:Villager):DecisionContext {
  const options:Candidate[]=[],parent=sim.navigation.flood(v.position);
  const add=(action:Action,targetId:string,targetName:string,utility:number,description:string)=>{
    if(sim.canStart(v,{action,targetId,priority:0,reason:'',source:'Local'})||!sim.approach(v,targetId,parent))return;
    options.push({id:`option_${options.length}`,action,targetId,targetName,utility:clamp(utility),description});
  };
  const {food,wood}=sim.stores,p=v.traits,carried=v.inventory.food+v.inventory.wood;
  const foodFear=v.memories.some(m=>m.type==='SHORTAGE'&&sim.time-m.createdAt<240)?.05:0;
  add('IDLE',v.id,'Here',.08+(1-p.industriousness)*.08,'Take a brief break before reconsidering.');
  add('EAT','stockpile','Village stockpile',v.hunger>=65?.95:v.hunger>=40?.62:.05,`Hunger is ${Math.round(v.hunger)}/100. A meal consumes 3 food and reduces hunger by 55.`);
  for(const shop of sim.buildings.filter(b=>b.complete&&isShop(b))){
    add('EAT',shop.id,shop.name,v.hunger>=65?.97:v.hunger>=40?.66:.04,`${shop.name} has ${shop.meals??0} prepared meals. Eat one to reduce hunger by 55.`);
    add('WORK_SHOP',shop.id,shop.name,.4+((shop.meals??0)<3?.22:0)+(v.role==='Baker'||v.role==='Shopkeeper'?.15:0)-(food<sim.population*2?.3:0),`Prepare three shared meals. ${shop.kind==='bakery'?'Use 6 food and 1 timber.':'Use 9 food.'} Current shop stock: ${shop.meals??0} meals.`);
  }
  const restScore=v.energy<23?.98:v.energy<45?.72:sim.night&&v.energy<78?.8:.06;
  add('REST',v.homeId,sim.building(v.homeId)?.name??'Home',restScore,`Energy is ${Math.round(v.energy)}/100. ${sim.night?'It is night.':'It is daytime.'} Rest at home to recover.`);
  if(!options.some(o=>o.action==='REST'))add('REST',v.id,'Here',restScore,'Rest here because home has no free approach.');
  add('GO_HOME',v.homeId,sim.building(v.homeId)?.name??'Home',sim.underThreat?1:sim.night?.94:v.householdId&&sim.time-v.lastSocialAt>180?.61:.03,`Return to my assigned home${v.householdId?' and family':''}. ${sim.night?'The village is settling down for the night.':'Spend time at home and recover energy.'}`);
  for(const other of sim.villagers.filter(o=>o!==v&&o.lifeStage==='adult'&&!o.householdId))add('START_FAMILY',other.id,other.name,.87,`Form a mutual household with ${other.name}, move into a free family home, and prepare to raise children when food and space allow.`);
  add('RETURN_RESOURCES','stockpile','Village stockpile',carried>=6?.89:.65,`Carry ${v.inventory.wood} wood and ${v.inventory.food} food to central storage.`);
  const observed=sim.resources.filter(r=>r.amount>0).sort((a,b)=>distance(a.position,v.position)-distance(b.position,v.position));
  for(const kind of ['tree','berries','farm'] as const){
    let count=0;
    for(const r of observed.filter(r=>r.kind===kind&&(!r.reservedBy||r.reservedBy===v.id))){
      const d=distance(v.position,r.position);if(d>42)continue;
      const foodWork=kind!=='tree';const preferred=(kind==='tree'&&v.role==='Lumberjack')||(kind==='farm'&&v.role==='Farmer')||(kind==='berries'&&v.role==='Gatherer');
      const priority=foodWork?sim.priorities.food:sim.priorities.wood;
      const shortage=foodWork?(food<sim.population*3?.35:food<sim.foodTarget?.19:food>sim.foodTarget*2?-.2:0):(wood<12?.3:wood<sim.woodTarget?.2:wood>sim.woodTarget*1.5?-.2:0);
      const workers=foodWork?sim.workers('FARM').length+sim.workers('GATHER_FOOD').length:sim.workers('GATHER_WOOD').length;
      const demand=foodWork?Math.max(2,Math.ceil(sim.population/6)):sim.buildings.some(b=>!b.complete)?3:1;
      const coverage=workers>=demand?-.2:workers===0?.1:0;
      const utility=.2+p.industriousness*.1+priority*(.12+p.loyalty*.2)+(preferred?.13:0)+shortage+coverage+(foodWork?foodFear:0)-d*.0025*(1.5-p.bravery)-(carried>=6?.35:0);
      const action=kind==='tree'?'GATHER_WOOD':kind==='farm'?'FARM':'GATHER_FOOD';
      const before=options.length;add(action,r.id,r.name,utility,`${r.name} has ${r.amount} ${foodWork?'food':'wood'}, ${Math.round(d)} paces away. Village reserve: ${foodWork?food:wood}. ${workers} people already covering ${demand} desired workers. Priority ${Math.round(priority*100)}%. ${preferred?'This fits my role.':''}`);
      if(options.length>before&&++count>=2)break;
    }
  }
  for(const b of sim.buildings.filter(b=>!b.complete))add('BUILD',b.id,b.name,.3+sim.priorities.housing*(.2+p.loyalty*.25)+(v.role==='Builder'?.2:0)+(sim.housing<sim.population+4?.15:0)+(b.funded?.12:0)-(food<sim.population*2?.3:0)-sim.workers('BUILD',b.id).length*.04,`${b.name} is ${Math.round(b.progress*100)}% built. ${b.funded?'Timber already supplied.':`Needs ${b.woodCost} timber.`} ${sim.workers('BUILD',b.id).length}/3 builders collaborating. Housing: ${sim.population}/${sim.housing}.`);
  const neighbors=sim.villagers.filter(o=>o!==v&&o.health>0&&distance(v.position,o.position)<15).sort((a,b)=>distance(v.position,a.position)-distance(v.position,b.position));
  for(const other of neighbors.slice(0,3)){
    const relationship=v.relationships.find(r=>r.personId===other.id),affinity=(relationship?.affection??25)/100;
    add('HELP_PERSON',other.id,other.name,.58+p.sociability*.12+(1-p.greed)*.1+affinity*.1,`${other.name} has hunger ${Math.round(other.hunger)}. Share 3 carried food; relationship affection ${Math.round(affinity*100)}%.`);
    if(!other.task||['REST','SOCIALIZE','IDLE'].includes(other.task.action))add('SOCIALIZE',other.id,other.name,.12+p.sociability*.28+affinity*.08-(food<25?.2:0)-(sim.time-v.lastSocialAt<120?.12:0),`Spend a short moment with ${other.name}. Sociability ${Math.round(p.sociability*100)}%; affection ${Math.round(affinity*100)}%.`);
  }
  // Needs constrain the candidate set only at emergencies; ordinary role choices
  // remain open. There is always a legal rest or idle option.
  const emergency=v.hunger>=88&&options.some(o=>o.action==='EAT')?'EAT':v.energy<=8?'REST':sim.underThreat&&options.some(o=>o.action==='GO_HOME')?'GO_HOME':null;
  const allowed=emergency?options.filter(o=>o.action===emergency):options;
  return {
    self:{id:v.id,name:v.name,role:v.role,health:v.health,hunger:v.hunger,energy:v.energy,traits:{...p},inventory:{...v.inventory},currentAction:v.task?.action??'IDLE',home:v.homeId,family:sim.households.find(f=>f.id===v.householdId)?.partnerIds.concat(sim.households.find(f=>f.id===v.householdId)?.childIds??[])??[],lifeStage:v.lifeStage},
    observations:{resources:observed.slice(0,8).map(r=>({id:r.id,kind:r.kind,remaining:r.amount,distance:Math.round(distance(v.position,r.position))})),nearbyPeople:neighbors.slice(0,5).map(o=>({id:o.id,name:o.name,hunger:Math.round(o.hunger),energy:Math.round(o.energy),distance:Math.round(distance(v.position,o.position))})),buildings:sim.buildings.map(b=>({id:b.id,name:b.name,complete:b.complete})),threats:sim.underThreat?['Enemy troops are near our capital; shelter at home.']:[]},
    civilization:{food,wood,housing:sim.housing,population:sim.population,priorities:{...sim.priorities},hour:sim.hour,foodStatus:food<sim.population*3?'LOW':food<sim.foodTarget?'MODEST':'ADEQUATE',woodStatus:wood<12?'CRITICAL':wood<sim.woodTarget?'LOW':'ADEQUATE',households:sim.households.length,shops:sim.buildings.filter(b=>b.complete&&isShop(b)).length,settlement:sim.stage,sharedGoal:sim.sharedGoal,workforce:{food:sim.workers('FARM').length+sim.workers('GATHER_FOOD').length,wood:sim.workers('GATHER_WOOD').length,builders:sim.workers('BUILD').length,shops:sim.workers('WORK_SHOP').length}},
    memories:[...v.memories].sort((a,b)=>(b.importance-(sim.time-b.createdAt)/2400)-(a.importance-(sim.time-a.createdAt)/2400)).slice(0,3).map(m=>({...m})),
    relationships:v.relationships.filter(r=>neighbors.some(o=>o.id===r.personId)).map(r=>({...r})),trigger:v.reconsider||'Periodic reconsideration',options:allowed
  };
}
