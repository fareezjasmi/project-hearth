import type {PeopleSimulation} from './people';
import type {Building,Household,Relationship,Villager} from './types';
import {TOWN_PLOTS} from '../world/plots';

export const GAME_DAY=720;
export const MAX_RESIDENTS=40;
export const isShop=(b:Building)=>b.kind==='bakery'||b.kind==='market';
export function residents(sim:PeopleSimulation,homeId:string){return sim.villagers.filter(v=>v.health>0&&v.homeId===homeId);}
export function familyHome(sim:PeopleSimulation,a:Villager,b:Villager){
  return sim.buildings.find(home=>home.complete&&home.kind==='house'&&home.capacity>=3&&residents(sim,home.id).every(p=>p===a||p===b));
}
export function familyEligible(sim:PeopleSimulation,a:Villager,b:Villager){
  if(a.military||b.military||a===b||a.health<=0||b.health<=0||a.lifeStage!=='adult'||b.lifeStage!=='adult'||a.householdId||b.householdId)return false;
  if(a.parentIds.includes(b.id)||b.parentIds.includes(a.id)||a.parentIds.some(id=>b.parentIds.includes(id)))return false;
  const ab=a.relationships.find(r=>r.personId===b.id),ba=b.relationships.find(r=>r.personId===a.id);
  return !!ab&&!!ba&&ab.affection>=55&&ba.affection>=55&&ab.trust>=50&&ba.trust>=50&&!!familyHome(sim,a,b);
}
function bond(a:Villager,b:Villager,kind:Relationship['kind']){
  let relation=a.relationships.find(r=>r.personId===b.id);
  if(!relation){relation={personId:b.id,kind,affection:70,trust:65,fear:0,respect:60};a.relationships.push(relation);}
  relation.kind=kind;relation.affection=Math.max(70,relation.affection);relation.trust=Math.max(65,relation.trust);
}
export function formFamily(sim:PeopleSimulation,a:Villager,b:Villager){
  const home=familyHome(sim,a,b);if(!home||!familyEligible(sim,a,b)||sim.stores.food<sim.population*3)return false;
  const household:Household={id:`family_${sim.households.length}`,name:`${a.name} & ${b.name}`,partnerIds:[a.id,b.id],childIds:[],homeId:home.id,formedAt:sim.time,nextBirthAt:sim.time+GAME_DAY};
  sim.households.push(household);
  for(const [person,partner]of [[a,b],[b,a]]){sim.cancel(person);person.householdId=household.id;person.homeId=home.id;bond(person,partner,'partner');sim.remember(person,`Started a family with ${partner.name} in ${home.name}.`,'FAMILY',partner.id,.95);sim.reconsider(person,'Moving into our family home',true);}
  sim.event('FAMILY_FORMED',`${a.name} and ${b.name} formed a household in ${home.name}.`,a.id);return true;
}
export function birthReadiness(sim:PeopleSimulation,family:Household):string {
  const partners=family.partnerIds.map(id=>sim.person(id));const home=sim.building(family.homeId);
  if(partners.some(p=>!p||p.health<=0||p.military))return 'A parent is absent';
  if(family.childIds.length>=3)return 'Family complete';
  if(sim.population>=MAX_RESIDENTS)return 'Settlement population limit reached';
  if(!home||!home.complete||residents(sim,home.id).length>=home.capacity)return 'Needs a larger home';
  if(partners.some(p=>p!.hunger>55||p!.health<70))return 'Parents need food and recovery';
  if(sim.stores.food<sim.population*3+12)return 'Building food reserves';
  if(sim.time<family.nextBirthAt)return `Settling in · ${((family.nextBirthAt-sim.time)/GAME_DAY).toFixed(1)} days`;
  return 'Ready to welcome a child';
}
function welcomeChild(sim:PeopleSimulation,family:Household){
  const parents=family.partnerIds.map(id=>sim.person(id)!);const home=sim.building(family.homeId)!;
  const position=sim.navigation.approach(parents[0].position,home.position,4.8,undefined,sim.occupied(''));
  if(!position)return;
  const i=sim.villagers.length,names=['Wren','Finn','Iris','Hugo','Nell','Robin','Theo','Hazel','Kit','Alma','Pip','Fern'];
  const traits={...parents[0].traits};for(const key of Object.keys(traits) as (keyof typeof traits)[])traits[key]=(parents[0].traits[key]+parents[1].traits[key])/2;
  const child:Villager={id:`person_${i}`,name:`${names[(i-10)%names.length]}${i>=22?` ${Math.floor((i-10)/names.length)+1}`:''}`,age:0,role:'Child',health:100,hunger:10,energy:100,traits,inventory:{wood:0,food:0},relationships:[],memories:[],position,path:[],heading:0,distanceWalked:0,activity:'At home with family',destination:home.name,task:null,nextDecisionAt:sim.time+15,decisionVersion:0,pending:false,reconsider:'Joining the village',blockedFor:0,nextRouteAt:0,lastSocialAt:sim.time,homeId:home.id,insideHome:true,householdId:family.id,parentIds:[...family.partnerIds],bornAt:sim.time,lifeStage:'child',meetingUntil:0};
  sim.stores.food-=12;sim.villagers.push(child);family.childIds.push(child.id);family.nextBirthAt=sim.time+GAME_DAY*1.5;
  for(const parent of parents){bond(parent,child,'child');bond(child,parent,'parent');sim.remember(parent,`Welcomed ${child.name} into the family.`,'BIRTH',child.id,1);}
  for(const id of family.childIds){const sibling=sim.person(id)!;if(sibling!==child){bond(sibling,child,'sibling');bond(child,sibling,'sibling');}}
  sim.remember(child,`Born to ${parents[0].name} and ${parents[1].name} in Hearthwood.`,'BIRTH',undefined,1);
  sim.event('CHILD_BORN',`${family.name} welcomed ${child.name}. Twelve food supplied the new household.`,child.id);
}
export function planBuilding(sim:PeopleSimulation,kind:'house'|'bakery'|'market'):string {
  if(sim.buildings.filter(b=>!b.complete).length>=3)return 'Finish an existing project first (three active sites maximum).';
  const plot=TOWN_PLOTS.find(p=>!sim.building(p.id));if(!plot)return 'All development plots are in use.';
  const count=sim.buildings.filter(b=>b.kind===kind).length+1;
  sim.buildings.push({id:plot.id,kind,name:kind==='house'?`Cottage ${count}`:kind==='bakery'?`Bakery ${count}`:`Market ${count}`,position:{...plot.position},capacity:kind==='house'?5:0,complete:false,progress:0,woodCost:kind==='house'?24:kind==='bakery'?36:30,funded:false,reservedBy:null,meals:0});
  sim.event('BUILDING_PLANNED',`A ${kind} was planned. Villagers must supply timber and labor.`,plot.id);
  for(const v of sim.villagers)if(v.lifeStage==='adult')sim.reconsider(v,'New construction available');
  return `Planned ${kind==='house'?'a cottage':`a ${kind}`}.`;
}
export function planRoad(sim:PeopleSimulation):string {
  if(sim.buildings.filter(b=>!b.complete).length>=3)return 'Finish an existing project first (three active sites maximum).';
  if(sim.buildings.some(b=>b.kind==='road'&&!b.complete))return 'Finish the current road first.';
  const start={x:0,z:4};
  const parent=sim.navigation.flood(start);
  for(const target of sim.buildings.filter(b=>b.complete&&b.kind!=='road'&&!sim.buildings.some(r=>r.connectsTo===b.id))){
    const center=target.entrance??{x:target.position.x,z:target.position.z+4};
    const end=sim.navigation.approach(start,center,1.6,parent);
    if(!end)continue;
    const route=sim.navigation.route(start,end);if(!route||route.length<2)continue;
    const points=[start,...route];const id=`road_${target.id}`,cost=Math.max(4,Math.ceil(points.length*.8/3));
    sim.buildings.push({id,kind:'road',name:`Road to ${target.name}`,position:{...points[Math.floor(points.length/2)]},capacity:0,complete:false,progress:0,woodCost:cost,funded:false,reservedBy:null,roadPoints:points,connectsTo:target.id});
    sim.event('BUILDING_PLANNED',`Planned a road to ${target.name}. ${cost} timber and shared labor are needed.`,id);
    for(const v of sim.villagers)sim.reconsider(v,'A road needs builders');
    return `Road planned to ${target.name} · ${cost} timber.`;
  }
  return 'All reachable finished buildings have a road planned.';
}
export function settlementStage(sim:PeopleSimulation){
  const homes=sim.buildings.filter(b=>b.kind==='house'&&b.complete).length,shops=sim.buildings.filter(b=>isShop(b)&&b.complete).length;
  return sim.population>=24&&homes>=8&&shops>=2?'Small city':sim.population>=16&&shops>=1?'Town':sim.households.length>=2?'Village':'Hamlet';
}
export function townTick(sim:PeopleSimulation){
  // Move households out of overcrowded homes as finished cottages become free.
  for(const family of sim.households){
    const current=sim.building(family.homeId);const members=[...family.partnerIds,...family.childIds].map(id=>sim.person(id)!).filter(v=>v.health>0&&v.householdId===family.id);
    if(current&&current.capacity>=members.length+1)continue;
    const better=sim.buildings.find(b=>b.kind==='house'&&b.complete&&b.capacity>=(current?.capacity??0)+1&&residents(sim,b.id).length===0);
    if(better){family.homeId=better.id;for(const v of members){v.homeId=better.id;sim.reconsider(v,'The family moved into a larger home',true);}sim.event('SETTLEMENT_GREW',`${family.name} moved into ${better.name}.`,better.id);}
  }
  for(const family of sim.households)if(birthReadiness(sim,family)==='Ready to welcome a child')welcomeChild(sim,family);
  if(!sim.autoGrow||sim.stores.food<sim.population*2)return;
  const pending=sim.buildings.filter(b=>!b.complete);
  if(pending.length<3&&!pending.some(b=>b.kind==='road')&&sim.stores.wood>=12){planRoad(sim);}
  if(pending.length>=2)return;
  const singles=sim.villagers.filter(v=>v.health>0&&v.lifeStage==='adult'&&!v.householdId).length;
  const emptyHomes=sim.buildings.filter(b=>b.complete&&b.kind==='house'&&residents(sim,b.id).length===0).length;
  const needsHome=(sim.population>=16&&sim.buildings.filter(b=>b.complete&&b.kind==='house').length<8)||emptyHomes<Math.ceil(singles/2)||sim.housing<sim.population+4||sim.households.some(f=>birthReadiness(sim,f)==='Needs a larger home');
  if(needsHome&&!pending.some(b=>b.kind==='house')){planBuilding(sim,'house');return;}
  if(sim.households.length&&sim.stores.wood>=30){
    if(!sim.buildings.some(b=>b.kind==='market')){planBuilding(sim,'market');return;}
    if(!sim.buildings.some(b=>b.kind==='bakery'))planBuilding(sim,'bakery');
  }
}
export function careForChild(sim:PeopleSimulation,v:Villager,dt:number){
  // Infants stay home. Care is deterministic, draws from real reserves and
  // does not issue Jev requests or send children to resource/construction jobs.
  if(v.lifeStage!=='child')return false;
  v.age=Math.floor((sim.time-(v.bornAt??sim.time))/GAME_DAY);
  if(v.age>=18){v.lifeStage='adult';v.role='Unassigned';v.insideHome=false;v.householdId=null;sim.reconsider(v,'Came of age',true);sim.event('CAME_OF_AGE',`${v.name} is now an adult.`,v.id);return false;}
  if(v.hunger>=55&&sim.stores.food>=2){sim.stores.food-=2;v.hunger=Math.max(0,v.hunger-55);sim.remember(v,'My household provided a meal.','MEAL');}
  if(v.age<1||sim.night||sim.underThreat){if(v.task)sim.cancel(v);v.insideHome=true;v.energy=Math.min(100,v.energy+dt*2);v.activity=sim.night?'Sleeping at home':'At home with family';return true;}
  if(!v.task){
    const home=sim.building(v.homeId);if(!home)return true;
    const angle=Number(v.id.split('_')[1])+Math.floor(sim.time/40);
    const yard={x:home.position.x+Math.cos(angle)*4.5,z:home.position.z+Math.sin(angle)*4.5};
    const point=sim.navigation.approach(v.position,yard,1.8,undefined,sim.occupied(v.id));
    const route=point?sim.navigation.route(v.position,point,sim.villagers.filter(o=>o!==v&&!o.insideHome&&o.health>0).map(o=>o.position)):null;
    if(!point||!route){v.insideHome=true;v.activity='At home with family';return true;}
    v.insideHome=false;v.path=route;v.task={action:'IDLE',targetId:v.id,stage:route.length?'travel':'work',work:0,startedAt:sim.time,point,carriedMeal:false};v.destination='Family garden';v.activity=route.length?'Walking':'Playing near home';
  }
  return false;
}
