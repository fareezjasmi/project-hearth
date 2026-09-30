import {PeopleSimulation} from '../simulation/people';
import {DecisionScheduler} from '../decisions/scheduler';
import {Navigation,distance,type Point,type Obstacle} from '../simulation/navigation';
import type {Villager,Role,WorldSeed} from '../simulation/types';

export type Side=0|1;
export type Order='defend'|'north'|'south'|'attack'|'retreat';
export interface Soldier {id:number;side:Side;person:Villager;formerRole:Role;position:Point;path:Point[];goal?:Point;nextRoute:number;training:number;rations:number;cooldown:number;order:Order;returning:boolean;status:string;lastStrike:number;lastHit:number;hitCount:number;downUntil:number;impact:Point}
export interface Outpost {name:string;position:Point;owner:Side|null;claim:Side|null;progress:number}
export const OFFSETS=[0,110];
export const NAMES=['Hearthwood','Ashenford'];
export class Campaign {
  readonly rival:PeopleSimulation;
  readonly rivalScheduler:DecisionScheduler;
  readonly navigation:Navigation;
  readonly soldiers:Soldier[]=[];
  readonly capitals:Point[];
  readonly posts:Outpost[]=[{name:'North watch',position:{x:55,z:-18},owner:null,claim:null,progress:0},{name:'South watch',position:{x:55,z:18},owner:null,claim:null,progress:0}];
  readonly log:string[]=[];
  readonly capture=[0,0];
  winner:Side|'draw'|null=null;
  physicsStatus='Loading ragdoll physics…';
  private nextStrategy=15;
  private sequence=0;
  constructor(readonly player:PeopleSimulation,obstacles:Obstacle[],seed:WorldSeed){
    this.rival=new PeopleSimulation(obstacles,seed);
    const names=['Aldren','Vera','Rook','Nessa','Ivar','Sela','Corin','Wren','Hale','Mina'];
    this.rival.villagers.forEach((v,i)=>{v.name=names[i];v.memories.forEach(m=>m.summary=m.summary.replaceAll('Hearthwood','Ashenford'));});
    this.rivalScheduler=new DecisionScheduler(this.rival);
    this.navigation=new Navigation([...obstacles,...obstacles.map(o=>({...o,minX:o.minX+110,maxX:o.maxX+110}))],255);
    this.capitals=[player,this.rival].map((s,i)=>{const b=s.building('house_0')!;b.name=`${NAMES[i]} founding hall`;const p=b.entrance??{x:b.position.x,z:b.position.z+4};return {x:p.x+OFFSETS[i],z:p.z};});
    // Symmetric scenario setup: four founders per side begin as equipped militia.
    // Later reinforcements still pay the normal recruitment and training costs.
    for(const side of [0,1] as Side[]){
      const sim=this.sim(side);sim.stores={food:80,wood:60};
      for(let i=0;i<4;i++){
        this.recruit(side);const unit=this.army(side).at(-1)!;
        unit.training=0;unit.order='attack';unit.position={x:side===0?52:58,z:-3+i*2};
        unit.person.position={x:unit.position.x-OFFSETS[side],z:unit.position.z};
        unit.person.heading=side===0?Math.PI/2:-Math.PI/2;unit.person.energy=100;unit.person.hunger=10;
        unit.status='Engaging the opposing army';unit.person.activity=unit.status;
      }
    }
    this.note('Conquest begins: four trained fighters per side meet at the frontier. Capture the opposing capital to win.');
  }
  get time(){return this.player.time;}
  get truce(){return 0;}
  sim(side:Side){return side===0?this.player:this.rival;}
  army(side:Side){return this.soldiers.filter(u=>u.side===side&&u.person.health>0);}
  workers(side:Side){return this.sim(side).villagers.filter(v=>v.health>0&&v.lifeStage==='adult'&&!v.military);}
  note(message:string){this.log.unshift(`${Math.floor(this.time/60)}:${String(Math.floor(this.time%60)).padStart(2,'0')} · ${message}`);this.log.length=Math.min(60,this.log.length);}
  recruitReason(side:Side){const s=this.sim(side);return this.winner!==null?'The campaign has ended.':this.workers(side).length<=4?'Keep at least four adults in civilian work.':this.army(side).length>=8?'Army limit reached (8).':s.stores.wood<8||s.stores.food<6?'Recruitment needs 8 timber and 6 food.':!this.workers(side).some(v=>v.health>=60&&v.energy>25&&v.meetingUntil<=s.time)?'No healthy, rested adult is available.':'';}
  recruit(side:Side){const reason=this.recruitReason(side);if(reason)return reason;
    const s=this.sim(side),v=this.workers(side).filter(v=>v.health>=60&&v.energy>25&&v.meetingUntil<=s.time).sort((a,b)=>Number(b.role==='Unassigned')-Number(a.role==='Unassigned')||b.traits.bravery-a.traits.bravery)[0];
    const role=v.role;s.cancel(v);v.pending=false;v.military=true;v.role='Soldier';s.stores.wood-=8;s.stores.food-=6;
    this.soldiers.push({id:++this.sequence,side,person:v,formerRole:role,position:{x:v.position.x+OFFSETS[side],z:v.position.z},path:[],nextRoute:0,training:20,rations:6,cooldown:0,order:'defend',returning:false,status:'Reporting for training',lastStrike:-100,lastHit:-100,hitCount:0,downUntil:0,impact:{x:0,z:1}});
    s.remember(v,'Joined the militia to defend our settlement.','MILITARY',undefined,.9);this.note(`${NAMES[side]} recruited ${v.name}.`);return '';
  }
  order(side:Side,order:Order){if(this.winner!==null)return 'The campaign has ended.';if(order==='attack'&&this.truce>0)return 'The founding truce is still active.';
    for(const u of this.army(side)){u.order=order;u.path=[];u.goal=undefined;u.nextRoute=0;}
    this.note(`${NAMES[side]} ordered its army to ${order}.`);return '';
  }
  release(id:number){const u=this.soldiers.find(v=>v.id===id);if(!u||u.person.health<=0||this.winner!==null)return;
    if(distance(u.position,this.capitals[u.side])>9||this.army((1-u.side) as Side).some(e=>distance(e.position,u.position)<12))return;
    const s=this.sim(u.side);u.person.military=false;u.person.role=u.formerRole;s.stores.food+=u.rations;u.rations=0;s.reconsider(u.person,'Returned from military service',true);this.soldiers.splice(this.soldiers.indexOf(u),1);this.note(`${u.person.name} returned to civilian life.`);
  }
  private destination(u:Soldier):Point {
    let center=this.capitals[u.side];
    if(u.training<=0&&!u.returning&&u.order!=='retreat'&&u.order!=='defend')center=u.order==='attack'?this.capitals[1-u.side]:this.posts[u.order==='north'?0:1].position;
    // Spread arrivals around the objective; occupied squares are never a shared goal.
    const index=this.army(u.side).indexOf(u),angle=index*Math.PI/4;
    return {x:center.x+Math.cos(angle)*3.5,z:center.z+Math.sin(angle)*3.5};
  }
  private move(u:Soldier,target:Point,dt:number){
    if(distance(u.position,target)<.65){u.path=[];return;}
    if(this.time>=u.nextRoute&&(!u.goal||distance(u.goal,target)>2||!u.path.length)){
      const candidates:Point[]=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const p={x:target.x+dx*.8,z:target.z+dz*.8};if(this.navigation.walkable(p)&&!this.soldiers.some(o=>o!==u&&o.person.health>0&&distance(o.position,p)<.8))candidates.push(p);}
      candidates.sort((a,b)=>distance(a,target)-distance(b,target));
      u.goal={...target};u.path=[];for(const goal of candidates.slice(0,4)){const path=this.navigation.route(u.position,goal);if(path){u.path=path;break;}}u.nextRoute=this.time+2+u.id*.02;
    }
    const next=u.path[0];if(!next)return;
    const gap=distance(u.position,next),step=Math.min(gap,dt*(u.person.energy>10?2.5:1.5));
    if(gap<.025){u.path.shift();return;}
    const point={x:u.position.x+(next.x-u.position.x)/gap*step,z:u.position.z+(next.z-u.position.z)/gap*step};
    const others=this.soldiers.filter(o=>o!==u&&o.person.health>0).map(o=>o.position);
    if(!this.navigation.clearSegment(u.position,point,others)){
      if(this.time>=u.nextRoute){u.path=this.navigation.route(u.position,u.path.at(-1)!,others)??[];u.nextRoute=this.time+2+u.id*.02;}u.status='Finding a clear route';return;
    }
    u.person.heading=Math.atan2(point.x-u.position.x,point.z-u.position.z);u.person.distanceWalked+=step;u.position=point;if(step>=gap-.001)u.path.shift();
  }
  step(dt:number){if(this.winner!==null)return;this.rival.step(dt);this.rivalScheduler.tick();
    if(this.time>=this.nextStrategy){this.nextStrategy=this.time+15;const army=this.army(1),invaders=this.army(0).some(u=>distance(u.position,this.capitals[1])<30);
      if(this.time>60&&army.length<5&&this.rival.stores.food>this.rival.population*3+6)this.recruit(1);
      const order:Order=invaders?'defend':army.filter(u=>u.training<=0&&u.person.health>45).length>=3&&this.truce===0?'attack':this.posts[0].owner!==1?'north':'south';
      if(army.some(u=>u.order!==order))this.order(1,order);
    }
    const hits=new Map<Soldier,number>();
    for(const u of this.soldiers){const v=u.person;if(v.health<=0)continue;const home=distance(u.position,this.capitals[u.side])<9,s=this.sim(u.side);
      v.hunger=Math.min(100,v.hunger+dt*.12);v.energy=Math.max(0,Math.min(100,v.energy+dt*(home?.8:-.04)));u.cooldown=Math.max(0,u.cooldown-dt);
      if(home){const food=Math.min(6-u.rations,s.stores.food);u.rations+=food;s.stores.food-=food;s.stores.food+=v.inventory.food;s.stores.wood+=v.inventory.wood;v.inventory.food=0;v.inventory.wood=0;if(v.hunger<65)v.health=Math.min(100,v.health+dt*.4);}
      if(v.hunger>=60&&u.rations>=2){u.rations-=2;v.hunger=Math.max(0,v.hunger-40);}
      if(v.hunger>=98)hits.set(u,(hits.get(u)??0)+dt*.2);
      if(v.health<25||(v.hunger>75&&u.rations<2))u.returning=true;
      if(home&&v.health>=80&&v.hunger<40&&v.energy>65)u.returning=false;
      if(u.downUntil>this.time){u.status='Knocked down';v.activity=u.status;continue;}
      let target=this.destination(u);u.status=u.returning?'Retreating for recovery':u.training>0?'Reporting for training':u.order==='attack'?'Marching on enemy capital':u.order==='retreat'?'Returning to capital':u.order==='defend'?'Defending capital':`Securing ${u.order} watch`;
      if(u.training>0&&home){u.training=Math.max(0,u.training-dt);u.status=`Training · ${Math.ceil(u.training)}s`;}
      const enemy=this.truce===0&&u.training<=0&&!u.returning&&u.order!=='retreat'?this.army((1-u.side) as Side).filter(e=>e.training<=0&&distance(e.position,u.position)<10).sort((a,b)=>distance(a.position,u.position)-distance(b.position,u.position))[0]:undefined;
      if(enemy){const gap=distance(enemy.position,u.position);u.person.heading=Math.atan2(enemy.position.x-u.position.x,enemy.position.z-u.position.z);u.status=`Fighting ${enemy.person.name}`;target=enemy.position;if(gap<2&&this.navigation.clearSegment(u.position,enemy.position)){if(u.cooldown<=0){u.lastStrike=this.time;enemy.impact={x:(enemy.position.x-u.position.x)/(gap||1),z:(enemy.position.z-u.position.z)/(gap||1)};hits.set(enemy,(hits.get(enemy)??0)+9);u.cooldown=1.4;}target=u.position;}}
      this.move(u,target,dt);v.position={x:u.position.x-OFFSETS[u.side],z:u.position.z};v.activity=u.status;v.destination=u.order==='attack'?`${NAMES[1-u.side]} capital`:'Army orders';
    }
    // Apply both sides' damage after all attacks so neither side wins by update order.
    for(const [u,damage]of hits){if(damage>=9){u.lastHit=this.time;u.hitCount++;if(u.hitCount%3===0)u.downUntil=this.time+1.8;}u.person.health=Math.max(0,u.person.health-damage);if(u.person.health<=0){u.person.activity='Fallen in service';u.path=[];this.note(`${u.person.name} of ${NAMES[u.side]} has fallen.`);for(const relative of this.sim(u.side).villagers.filter(v=>v.relationships.some(r=>r.personId===u.person.id)))this.sim(u.side).remember(relative,`${u.person.name} died during the campaign.`,'LOSS',u.person.id,1);}}
    const active=this.soldiers.filter(u=>u.person.health>0&&u.training<=0&&!u.returning&&u.order!=='retreat'&&u.downUntil<=this.time);
    for(const post of this.posts){const sides=([0,1] as Side[]).filter(side=>active.some(u=>u.side===side&&distance(u.position,post.position)<7));
      if(sides.length===1&&post.owner!==sides[0]){if(post.claim!==sides[0]){post.claim=sides[0];post.progress=0;}post.progress+=dt;if(post.progress>=15){post.owner=sides[0];post.progress=0;post.claim=null;this.note(`${NAMES[post.owner]} secured ${post.name}.`);}}
      else if(!sides.length){post.progress=Math.max(0,post.progress-dt);}
    }
    for(const side of [0,1] as Side[]){const attackers=active.filter(u=>u.side!==side&&u.person.hunger<85&&distance(u.position,this.capitals[side])<9),defenders=active.filter(u=>u.side===side&&distance(u.position,this.capitals[side])<9);
      if(this.truce===0&&attackers.length>=2&&!defenders.length)this.capture[side]+=dt;else if(!attackers.length)this.capture[side]=Math.max(0,this.capture[side]-dt*2);
      const s=this.sim(side),threat=attackers.length>0;if(threat&&!s.underThreat){this.note(`${NAMES[side]} is under attack!`);for(const v of this.workers(side))s.reconsider(v,'Enemy soldiers near our homes',true);}s.underThreat=threat;
    }
    if(this.capture[0]>=45||this.capture[1]>=45){this.winner=this.capture[0]>=45&&this.capture[1]>=45?'draw':this.capture[0]>=45?1:0;this.note(this.winner==='draw'?'Both capitals fell. A draw.':`${NAMES[this.winner]} wins! The opposing settlement surrenders.`);}
  }
}
