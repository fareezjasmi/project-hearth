import type {PeopleSimulation} from './people';
import type {Villager} from './types';
import {actionLabels} from './types';
import {distance} from './navigation';
import {formFamily,isShop} from './town';

function deliver(sim:PeopleSimulation,v:Villager){
  const t=v.task!;const point=sim.approach(v,'stockpile');
  if(!point){sim.finish(v,'Storage approach is busy');return;}
  const others=sim.villagers.filter(other=>other!==v&&other.health>0&&!other.insideHome).map(other=>other.position);
  const route=sim.navigation.route(v.position,point,others)??sim.navigation.route(v.position,point);if(route===null){sim.finish(v,'Storage route blocked');return;}
  const r=sim.resource(t.targetId);if(r?.reservedBy===v.id)r.reservedBy=null;
  t.stage='deliver';t.work=0;t.point=point;v.path=route;v.activity='Carrying supplies';v.destination='Village stockpile';
}
function deposit(sim:PeopleSimulation,v:Villager){
  const {food,wood}=v.inventory;sim.stores.food+=food;sim.stores.wood+=wood;v.inventory={food:0,wood:0};
  if(food+wood){sim.event('DEPOSIT',`${v.name} stored ${food?`${food} food`:''}${food&&wood?' and ':''}${wood?`${wood} wood`:''}.`,v.id);sim.remember(v,`Brought ${food||wood} ${food?'food':'wood'} to the village.`,food?'FOOD_DELIVERY':'WOOD_DELIVERY');}
  sim.finish(v);
}
export function executeTask(sim:PeopleSimulation,v:Villager,dt:number){
  const t=v.task!;
  if(v.path.length){
    const target=v.path[0],d=distance(v.position,target),travel=Math.min(d,dt*(1.25+v.traits.industriousness*.4)*sim.roadSpeed(v.position));
    const dx=target.x-v.position.x,dz=target.z-v.position.z;
    const next={x:v.position.x+dx/(d||1)*travel,z:v.position.z+dz/(d||1)*travel};
    const others=sim.villagers.filter(o=>o!==v&&o.health>0&&!o.insideHome);
    if(d<.001){v.path.shift();return;}
    const blocked=!sim.navigation.clearSegment(v.position,next,others.map(o=>o.position));
    if(blocked){
      v.blockedFor+=dt;v.activity='Yielding';
      if(v.blockedFor>=.6&&sim.time>=v.nextRouteAt){
        // Stagger reroutes so head-on walkers do not mirror each other. Only
        // actual movement below resets the stall timer, never a planned path.
        v.nextRouteAt=sim.time+.8+Number(v.id.split('_')[1])*.09;
        const destination=t.stage==='deliver'?'stockpile':t.targetId;
        const point=sim.approach(v,destination);
        const route=point?sim.navigation.route(v.position,point,others.map(o=>o.position)):null;
        if(route){t.point=point!;v.path=route;v.activity='Going around traffic';}
      }
      if(v.blockedFor>8)sim.finish(v,'Crowded route: releasing destination and reconsidering');
      return;
    }
    v.blockedFor=0;v.position=next;v.heading=Math.atan2(dx,dz);v.distanceWalked+=travel;v.activity=t.stage==='deliver'?'Carrying supplies':'Walking';
    if(d<=travel+.001)v.path.shift();return;
  }
  if(t.stage==='deliver'){deposit(sim,v);return;}
  if(t.stage==='travel'){t.stage='work';t.work=0;}
  v.activity=v.lifeStage==='child'&&t.action==='IDLE'?'Playing near home':actionLabels[t.action];
  const target=sim.entity(t.targetId);
  if(target&&target!==v){v.heading=Math.atan2(target.position.x-v.position.x,target.position.z-v.position.z);}
  t.work+=dt;
  switch(t.action){
    case 'GATHER_WOOD':case 'GATHER_FOOD':case 'FARM':{
      const r=sim.resource(t.targetId);
      if(!r||r.amount<=0||r.reservedBy!==v.id){sim.finish(v,'Resource became unavailable');return;}
      if(t.work<(t.action==='FARM'?13:t.action==='GATHER_WOOD'?11:8))return;
      const amount=Math.min(r.amount,12-v.inventory.food-v.inventory.wood,t.action==='FARM'?10:6);
      if(amount<=0){deliver(sim,v);return;}
      r.amount-=amount;v.inventory[t.action==='GATHER_WOOD'?'wood':'food']+=amount;
      if(r.amount<=0){r.regrowAt=r.kind==='tree'?0:sim.time+(r.kind==='farm'?100:160);sim.event('RESOURCE_DEPLETED',`${r.name} is depleted${r.kind==='tree'?'.':'; new growth will take time.'}`,r.id);}
      deliver(sim,v);return;
    }
    case 'RETURN_RESOURCES':deposit(sim,v);return;
    case 'EAT':
      if(!t.carriedMeal){sim.finish(v,'Meal unavailable');return;}
      if(t.work>=4){t.carriedMeal=false;v.hunger=Math.max(0,v.hunger-55);v.health=Math.min(100,v.health+2);sim.remember(v,'Shared a meal from the village store.','MEAL');sim.finish(v);}return;
    case 'REST':
      v.insideHome=t.targetId===v.homeId;
      v.energy=Math.min(100,v.energy+dt*(t.targetId===v.id?1.8:2.6));
      if(t.work>=8&&v.energy>=92&&!sim.night){sim.remember(v,'Woke feeling restored.','REST');sim.finish(v);}return;
    case 'GO_HOME':
      v.insideHome=true;v.activity=sim.night?'Sleeping at home':v.lifeStage==='child'?'At home with family':'Home with family';
      if(t.work<=dt)v.lastSocialAt=sim.time;
      v.energy=Math.min(100,v.energy+dt*2.6);
      if(v.lifeStage==='adult'&&!sim.night&&t.work>=18&&v.energy>=80)sim.finish(v,'Ready to contribute after time at home');return;
    case 'START_FAMILY':{
      const partner=sim.person(t.targetId);if(!partner||distance(v.position,partner.position)>3){sim.finish(v,'Partner moved away');return;}
      if(t.work>=5){if(!formFamily(sim,v,partner))sim.finish(v,'Family prerequisites changed');}return;
    }
    case 'WORK_SHOP':{
      const shop=sim.building(t.targetId);if(!shop||!isShop(shop)||shop.reservedBy!==v.id){sim.finish(v,'Shop station unavailable');return;}
      if(t.work<14)return;const ingredients=shop.kind==='bakery'?6:9;
      if(sim.stores.food<ingredients||(shop.kind==='bakery'&&sim.stores.wood<1)||(shop.meals??0)>=12){sim.finish(v,'Shop is stocked or ingredients are needed');return;}
      sim.stores.food-=ingredients;if(shop.kind==='bakery')sim.stores.wood--;shop.meals=(shop.meals??0)+3;
      if(v.role==='Unassigned')v.role=shop.kind==='bakery'?'Baker':'Shopkeeper';
      sim.event('SHOP_STOCKED',`${v.name} prepared three meals at ${shop.name}.`,shop.id);sim.remember(v,`Supplied ${shop.name} for our neighbors.`,'SHOP',shop.id);sim.finish(v);return;
    }
    case 'BUILD':{
      const b=sim.building(t.targetId);if(!b||b.complete||!b.funded){sim.finish(v,'Construction is no longer available');return;}
      if(b.kind==='road')v.activity='Laying road';
      b.progress=Math.min(1,b.progress+dt/(b.kind==='road'?40:65)*(.8+v.traits.industriousness*.4));
      if(b.progress>=1){b.complete=true;sim.event('BUILDING_COMPLETED',`${v.name} completed ${b.name}.`,b.id);sim.remember(v,`Helped build ${b.name}.`,'BUILDING',b.id,.8);sim.finish(v);}return;
    }
    case 'SOCIALIZE':case 'HELP_PERSON':{
      const other=sim.person(t.targetId);
      if(!other||other.health<=0||distance(v.position,other.position)>3){sim.finish(v,'Neighbor moved away');return;}
      if(t.work<(t.action==='HELP_PERSON'?3:6))return;
      if(t.action==='HELP_PERSON'){
        if(v.inventory.food<3||other.hunger<65){sim.finish(v,'Help is no longer needed');return;}
        v.inventory.food-=3;other.hunger=Math.max(0,other.hunger-50);other.health=Math.min(100,other.health+4);
        sim.remember(other,`${v.name} brought me food when I was hungry.`,'HELP',v.id,.95);sim.remember(v,`Brought a meal to ${other.name}.`,'HELP',other.id,.75);
      } else {v.lastSocialAt=sim.time;other.lastSocialAt=sim.time;sim.remember(v,`Talked with ${other.name} near the village.`,'SOCIAL',other.id);sim.remember(other,`Exchanged stories with ${v.name}.`,'SOCIAL',v.id);}
      for(const [a,b] of [[v,other],[other,v]]){
        let relation=a.relationships.find(r=>r.personId===b.id);
        if(!relation){relation={personId:b.id,kind:'acquaintance',affection:40,trust:45,fear:0,respect:50};a.relationships.push(relation);}
        relation.affection=Math.min(100,relation.affection+6);relation.trust=Math.min(100,relation.trust+4);if(relation.affection>=60&&relation.kind==='acquaintance')relation.kind='friend';
      }
      sim.finish(v);return;
    }
    case 'IDLE':if(t.work>=5+(1-v.traits.industriousness)*6)sim.finish(v);return;
  }
}
