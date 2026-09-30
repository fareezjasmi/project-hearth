import {random} from '../world/terrain';
import {Navigation,distance,type Point,type Obstacle} from './navigation';
import type {Villager,Role,WorldSeed,ResourceNode,Building,Priorities,WorldEvent,EventType,Decision,DecisionRecord,Task,Household} from './types';
import {actionLabels} from './types';
import {executeTask} from './tasks';
import {careForChild,familyEligible,isShop,settlementStage,townTick} from './town';
export type {Villager} from './types';

export class PeopleSimulation {
  readonly villagers:Villager[]=[];
  readonly navigation:Navigation;
  readonly resources:ResourceNode[];
  readonly buildings:Building[];
  readonly records:DecisionRecord[]=[];
  readonly events:WorldEvent[]=[];
  readonly priorities:Priorities={food:.7,wood:.65,housing:.3};
  readonly households:Household[]=[];
  autoGrow=true;
  underThreat=false;
  private nextTownAt=15;
  private townStage='Hamlet';
  stores={food:48,wood:12};
  time=0; speed=1; revision=0;
  private sequence=0;
  private wasNight=false;
  private reserveBand='';
  private rng=random(2047);
  constructor(obstacles:Obstacle[],seed:WorldSeed) {
    this.navigation=new Navigation(obstacles);this.resources=structuredClone(seed.resources);this.buildings=structuredClone(seed.buildings);
    const names=['Edrik','Mara','Tomas','Cedric','Elin','Rowan','Ada','Bram','Lysa','Oswin'];
    const roles:Role[]=['Lumberjack','Farmer','Gatherer','Builder','Farmer','Lumberjack','Gatherer','Builder','Unassigned','Unassigned'];
    names.forEach((name,i)=>{
      const trait=()=>.15+this.rng()*.8;
      this.villagers.push({id:`person_${i}`,name,age:22+Math.floor(this.rng()*28),role:roles[i],health:100,hunger:12+this.rng()*27,energy:57+this.rng()*35,
        traits:{bravery:trait(),loyalty:trait(),greed:trait(),sociability:trait(),industriousness:trait()},inventory:{wood:0,food:0},
        relationships:[{personId:`person_${(i+1)%10}`,kind:'acquaintance',affection:40,trust:50,fear:0,respect:50}],
        memories:[{type:'ARRIVAL',importance:.5,createdAt:0,summary:'Arrived in Hearthwood with the founding settlers.'}],
        position:{x:-4.8+(i%5)*1.6,z:3.2+Math.floor(i/5)*1.6},path:[],heading:0,distanceWalked:0,activity:'Considering',destination:'Village green',
        task:null,nextDecisionAt:.5+i*.65,decisionVersion:0,pending:false,reconsider:'First decision',blockedFor:0,nextRouteAt:0,lastSocialAt:-120,homeId:`house_${Math.floor(i/3)}`,insideHome:false,householdId:null,parentIds:[],bornAt:null,lifeStage:'adult',meetingUntil:0});
    });
    // Founders arrive with a few mutual friendships, not pre-created families.
    for(let i=0;i<this.villagers.length;i+=2)for(const [a,b]of [[this.villagers[i],this.villagers[i+1]],[this.villagers[i+1],this.villagers[i]]]){
      a.relationships=a.relationships.filter(r=>r.personId!==b.id);a.relationships.push({personId:b.id,kind:'friend',affection:60,trust:60,fear:0,respect:55});
    }
  }
  get hour(){return (8+this.time/30)%24;}
  get day(){return 1+Math.floor((8+this.time/30)/24);}
  get night(){return this.hour>=20||this.hour<6;}
  get population(){return this.villagers.filter(v=>v.health>0).length;}
  get housing(){return this.buildings.filter(b=>b.complete).reduce((n,b)=>n+b.capacity,0);}
  get stage(){return settlementStage(this);}
  get foodTarget(){return Math.max(48,this.population*5);}
  get woodTarget(){return 30+this.buildings.filter(b=>!b.complete&&!b.funded).reduce((n,b)=>n+b.woodCost,0);}
  get sharedGoal(){return this.stores.food<this.population*3?'Secure food for every household':this.buildings.some(b=>!b.complete&&!b.funded)?'Supply timber for our building projects':this.buildings.some(b=>!b.complete)?'Finish our shared building projects':this.buildings.some(b=>isShop(b)&&b.complete&&(b.meals??0)<3)?'Stock the shops for our neighbors':'Support families and prepare for growth';}
  roadSpeed(point:Point){return this.buildings.some(b=>b.kind==='road'&&b.complete&&b.roadPoints?.some(p=>distance(p,point)<.9))?1.3:1;}
  workers(action:string,targetId?:string){return this.villagers.filter(v=>v.health>0&&v.task?.action===action&&(!targetId||v.task.targetId===targetId));}
  resource(id:string){return this.resources.find(r=>r.id===id);}
  building(id:string){return this.buildings.find(b=>b.id===id);}
  person(id:string){return this.villagers.find(v=>v.id===id);}
  entity(id:string){return this.resource(id)??this.building(id)??this.person(id);}
  occupied(except:string){return this.villagers.filter(v=>v.id!==except&&v.health>0&&!v.insideHome).flatMap(v=>v.task?[v.position,v.task.point]:[v.position]);}
  approach(v:Villager,id:string,parent?:Int32Array):Point|null {
    if(id===v.id)return {...v.position};const entity=this.entity(id);if(!entity)return null;
    if('kind' in entity&&entity.kind==='road')return this.navigation.approach(v.position,entity.position,1.6,parent,this.occupied(v.id));
    if('kind' in entity&&entity.kind==='house'&&entity.complete){const entrance=entity.entrance??{x:entity.position.x,z:entity.position.z+4};return this.navigation.approach(v.position,entrance,1.4,parent,this.occupied(v.id));}
    const radius='kind' in entity?(entity.kind==='house'||entity.kind==='bakery'||entity.kind==='market'?4.8:entity.kind==='stockpile'?3.8:entity.kind==='farm'?3:1.65):1.8;
    return this.navigation.approach(v.position,entity.position,radius,parent,this.occupied(v.id));
  }
  canStart(v:Villager,decision:Decision):string|null {
    if(v.military)return 'This resident is serving in the army.';
    if(v.health<=0)return 'This villager is no longer alive.';
    const r=this.resource(decision.targetId),b=this.building(decision.targetId),p=this.person(decision.targetId);
    const carried=v.inventory.food+v.inventory.wood;
    if(v.lifeStage==='child'&&!['GO_HOME','REST','IDLE','EAT'].includes(decision.action))return 'Children do not take village jobs.';
    switch(decision.action){
      case 'GATHER_WOOD':case 'GATHER_FOOD':case 'FARM':
        if(!r||r.kind!==({GATHER_WOOD:'tree',GATHER_FOOD:'berries',FARM:'farm'} as const)[decision.action]||r.amount<=0||carried>=12)return 'Resource is unavailable or inventory is full.';
        if(r.reservedBy&&r.reservedBy!==v.id)return 'Another villager has reserved this resource.';break;
      case 'BUILD':if(!b||b.complete||b.kind==='stockpile'||(!b.funded&&this.stores.wood<b.woodCost)||this.workers('BUILD',b.id).filter(other=>other!==v).length>=3)return 'Building lacks materials or already has three builders.';break;
      case 'EAT':if(decision.targetId==='stockpile'?(v.inventory.food<3&&this.stores.food<3):(!b||!b.complete||!isShop(b)||(b.meals??0)<1))return 'There is no meal available.';break;
      case 'RETURN_RESOURCES':if(decision.targetId!=='stockpile'||carried<=0)return 'There are no carried resources to deposit.';break;
      case 'REST':if(decision.targetId!==v.id&&(!b||!b.complete||b.kind!=='house'))return 'Rest location is unavailable.';break;
      case 'GO_HOME':if(!b||b.id!==v.homeId||!b.complete||b.kind!=='house')return 'A finished assigned home is required.';break;
      case 'START_FAMILY':if(!p||!familyEligible(this,v,p)||p.meetingUntil>this.time||this.stores.food<this.population*3)return 'Both adults need mutual trust, a free family home and food security.';break;
      case 'WORK_SHOP':if(!b||!b.complete||!isShop(b)||(b.reservedBy&&b.reservedBy!==v.id)||(b.meals??0)>=12||this.stores.food<(b.kind==='bakery'?6:9)||(b.kind==='bakery'&&this.stores.wood<1))return 'Shop needs ingredients, stock space and a free work station.';break;
      case 'SOCIALIZE':if(!p||p.id===v.id||p.health<=0||distance(v.position,p.position)>12||this.time-v.lastSocialAt<65)return 'No available neighbor nearby.';break;
      case 'HELP_PERSON':if(!p||p.id===v.id||p.health<=0||p.hunger<65||distance(v.position,p.position)>15||v.inventory.food<3)return 'Helping requires a nearby hungry neighbor and three carried food.';break;
      case 'IDLE':if(decision.targetId!==v.id)return 'Idle target must be self.';break;
      default:return 'Unknown action.';
    }
    return null;
  }
  start(v:Villager,decision:Decision):string|null {
    const invalid=this.canStart(v,decision);if(invalid)return invalid;
    const point=this.approach(v,decision.targetId);if(!point)return 'No reachable approach to the target.';
    const others=this.villagers.filter(other=>other!==v&&other.health>0&&!other.insideHome).map(other=>other.position);
    const path=this.navigation.route(v.position,point,others)??this.navigation.route(v.position,point);if(path===null)return 'No safe route to the target.';
    this.cancel(v);
    const r=this.resource(decision.targetId),b=this.building(decision.targetId);
    if(r)r.reservedBy=v.id;
    if(decision.action==='BUILD'&&b){if(!b.funded){this.stores.wood-=b.woodCost;b.funded=true;}}
    if(decision.action==='WORK_SHOP'&&b)b.reservedBy=v.id;
    if(decision.action==='START_FAMILY'){const partner=this.person(decision.targetId)!;this.cancel(partner);partner.meetingUntil=this.time+45;partner.activity='Meeting a future partner';partner.nextDecisionAt=partner.meetingUntil;}
    if(decision.action==='EAT'){if(b&&isShop(b))b.meals=(b.meals??0)-1;else if(v.inventory.food>=3)v.inventory.food-=3;else this.stores.food-=3;}
    const task:Task={action:decision.action,targetId:decision.targetId,stage:path.length?'travel':'work',work:0,startedAt:this.time,point,carriedMeal:decision.action==='EAT',mealSource:decision.targetId};
    v.task=task;v.path=path;v.activity=path.length?'Walking':actionLabels[decision.action];v.destination=r?.name??b?.name??this.person(decision.targetId)?.name??'Here';
    v.lastDecision=decision;v.reconsider='';v.nextDecisionAt=this.time+65;v.blockedFor=0;
    return null;
  }
  cancel(v:Villager){
    if(v.task?.action==='START_FAMILY'){const partner=this.person(v.task.targetId);if(partner)partner.meetingUntil=0;}
    if(v.task?.carriedMeal){const shop=this.building(v.task.mealSource??'');if(shop&&isShop(shop))shop.meals=(shop.meals??0)+1;else v.inventory.food+=3;}
    for(const r of this.resources)if(r.reservedBy===v.id)r.reservedBy=null;
    for(const b of this.buildings)if(b.reservedBy===v.id)b.reservedBy=null;
    v.task=null;v.path=[];v.decisionVersion++;v.blockedFor=0;v.nextRouteAt=0;v.insideHome=false;v.meetingUntil=0;
  }
  finish(v:Villager,trigger='Task completed'){
    this.cancel(v);v.activity='Considering';v.reconsider=trigger;v.nextDecisionAt=this.time+1+(Number(v.id.split('_')[1])%4)*.35;
  }
  reconsider(v:Villager,trigger:string,urgent=false){
    if(v.health<=0||v.military)return;
    if(urgent){this.cancel(v);v.activity='Considering';v.nextDecisionAt=this.time+.1;}
    else v.nextDecisionAt=Math.min(v.nextDecisionAt,this.time+2+Number(v.id.split('_')[1])*.35);
    v.reconsider=trigger;
  }
  setPriority(key:keyof Priorities,value:number){
    this.priorities[key]=Math.max(0,Math.min(1,value));this.event('PRIORITIES_CHANGED',`${key[0].toUpperCase()+key.slice(1)} priority changed.`);
    for(const v of this.villagers)if(!['EAT','REST','RETURN_RESOURCES'].includes(v.task?.action??''))this.reconsider(v,'Village priorities changed');
  }
  remember(v:Villager,summary:string,type='EXPERIENCE',subjectId?:string,importance=.5){
    v.memories.push({summary,type,subjectId,importance,createdAt:this.time});if(v.memories.length>12)v.memories.shift();
  }
  event(type:EventType,summary:string,subjectId?:string){this.events.unshift({id:++this.sequence,type,time:this.time,summary,subjectId});this.events.length=Math.min(this.events.length,80);this.revision++;}
  record(record:Omit<DecisionRecord,'id'>){this.records.unshift({...record,id:++this.sequence});this.records.length=Math.min(this.records.length,120);this.revision++;}
  step(dt:number){
    this.time+=dt;
    for(const r of this.resources)if(r.amount<=0&&r.regrowAt>0&&this.time>=r.regrowAt){r.amount=r.capacity;r.regrowAt=0;this.event('RESOURCE_REGROWN',`${r.name} is ready again.`,r.id);for(const v of this.villagers)if(!v.task)this.reconsider(v,'A food source is available');}
    if(this.night&&!this.wasNight){this.event('NIGHTFALL','Dusk settles over Hearthwood.');for(const v of this.villagers)if(v.energy<65)this.reconsider(v,'Nightfall');}this.wasNight=this.night;
    const lowFood=this.stores.food<this.population*3,band=`${lowFood}:${this.stores.wood<12}`;
    if(band!==this.reserveBand){this.reserveBand=band;if(lowFood||this.stores.wood<12){this.event('RESERVES_LOW',lowFood?'Food reserves are low for our population.':'Timber reserves are low.');for(const v of this.villagers){if(lowFood)this.remember(v,'The village ran short of food.','SHORTAGE',undefined,.85);if(!['EAT','REST','RETURN_RESOURCES','GO_HOME'].includes(v.task?.action??''))this.reconsider(v,'Low village reserves');}}}
    for(const v of this.villagers){
      if(v.health<=0||v.military)continue;
      const oldHunger=v.hunger,oldEnergy=v.energy;
      v.hunger=Math.min(100,v.hunger+dt*(v.lifeStage==='child'?.065:.16));
      if(v.task?.action!=='REST'||v.task.stage!=='work')v.energy=Math.max(0,v.energy-dt*(v.lifeStage==='child'?.035:v.activity==='Walking'?.10:v.task?.stage==='work'?.24:.025));
      if(v.hunger>95)v.health=Math.max(0,v.health-dt*.12);else if(v.hunger<50&&v.energy>35)v.health=Math.min(100,v.health+dt*.07);
      if(v.health<=0){this.cancel(v);v.activity='Died of starvation';this.event('PERSON_NEEDS_HELP',`${v.name} died of starvation.`,v.id);continue;}
      if(careForChild(this,v,dt))continue;
      if(oldHunger<65&&v.hunger>=65){this.event('VILLAGER_HUNGRY',`${v.name} is hungry.`,v.id);if(v.task?.action!=='EAT')this.reconsider(v,'Hunger threshold crossed',true);}
      if(oldHunger<88&&v.hunger>=88){this.event('PERSON_NEEDS_HELP',`${v.name} urgently needs food.`,v.id);if(v.task?.action!=='EAT')this.reconsider(v,'Urgent hunger',true);for(const other of this.villagers)if(other!==v&&distance(v.position,other.position)<15&&!other.task)this.reconsider(other,'A neighbor needs help');}
      if(oldEnergy>22&&v.energy<=22){this.event('VILLAGER_TIRED',`${v.name} needs rest.`,v.id);if(!['REST','EAT'].includes(v.task?.action??''))this.reconsider(v,'Energy threshold crossed',true);}
      if(v.task)executeTask(this,v,dt);
    }
    if(this.time>=this.nextTownAt){this.nextTownAt=this.time+15;townTick(this);if(this.stage!==this.townStage){this.townStage=this.stage;this.event('SETTLEMENT_GREW',`Hearthwood has grown into a ${this.stage.toLowerCase()}.`);}}
  }
}
