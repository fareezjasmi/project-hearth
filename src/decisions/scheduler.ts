import type {PeopleSimulation} from '../simulation/people';
import type {DecisionContext,Villager} from '../simulation/types';
import {buildContext} from './context';
import {DecisionProvider,localDecision,type DecisionResult} from './provider';

export interface AgentTrace {
  id:number;personId:string;time:number;startedAt:number;elapsedMs:number;
  requestedSource:'Jev'|'Local';phase:'requesting'|'ready'|'accepted'|'rejected'|'stale';
  context:DecisionContext;result?:DecisionResult;detail:string;
}
type Completion={villager:Villager;version:number;context:DecisionContext;at:number;result:DecisionResult;detail:string;trace:AgentTrace};
export class DecisionScheduler {
  readonly provider=new DecisionProvider();
  readonly traces=new Map<string,AgentTrace[]>();
  private traceSequence=0;
  private completed:Completion[]=[];
  private inFlight=0;
  private nextLocalAt=0;
  private nextRemoteAt=0;
  constructor(readonly simulation:PeopleSimulation){}
  private trace(v:Villager,context:DecisionContext,remote:boolean):AgentTrace {
    const trace:AgentTrace={id:++this.traceSequence,personId:v.id,time:this.simulation.time,startedAt:performance.now(),elapsedMs:0,requestedSource:remote?'Jev':'Local',phase:remote?'requesting':'ready',context,detail:remote?'Request sent to Jev. Waiting for its constrained choice.':'Local decision opportunity.'};
    const history=this.traces.get(v.id)??[];history.unshift(trace);history.length=Math.min(history.length,16);this.traces.set(v.id,history);return trace;
  }
  reconsiderAll(trigger:string){for(const v of this.simulation.villagers)this.simulation.reconsider(v,trigger);}
  private apply(item:Completion){
    const sim=this.simulation,v=item.villager;
    v.pending=false;
    let status:'accepted'|'rejected'|'stale'='accepted',detail=item.detail;
    if(v.decisionVersion!==item.version||sim.time-item.at>35||v.health<=0){status='stale';detail='World or needs changed while deciding; request discarded.';}
    else {const invalid=sim.start(v,item.result.decision);if(invalid){status='rejected';detail=invalid;}}
    item.trace.phase=status;item.trace.result=item.result;item.trace.detail=detail;
    sim.record({time:sim.time,personId:v.id,name:v.name,context:item.context,decision:item.result.decision,latencyMs:item.result.latencyMs,status,detail});
    if(status!=='accepted'&&v.health>0){v.reconsider=detail;v.nextDecisionAt=sim.time+1;}
  }
  tick(){
    const sim=this.simulation;
    for(const item of this.completed.splice(0))this.apply(item);
    if(sim.time<this.nextLocalAt)return;
    const eligible=sim.villagers.filter(v=>v.health>0&&!v.military&&v.lifeStage==='adult'&&!v.pending&&sim.time>=v.nextDecisionAt&&(!v.task||sim.time-v.task.startedAt>=12)&&!(v.insideHome&&(sim.night||sim.underThreat)&&v.hunger<65)&&!(v.meetingUntil>sim.time&&v.hunger<65&&v.energy>22));
    eligible.sort((a,b)=>a.nextDecisionAt-b.nextDecisionAt);
    const v=eligible[0];if(!v)return;
    const trigger=v.reconsider||'Periodic reconsideration';
    // Release reservations before observing so available options reflect the
    // current world, then validate again after an asynchronous model response.
    if(v.task)sim.cancel(v);v.reconsider=trigger;
    const context=buildContext(sim,v);if(!context.options.length){v.nextDecisionAt=sim.time+3;return;}
    const version=v.decisionVersion,at=sim.time;
    const remote=this.provider.connected&&this.provider.enabled&&performance.now()>=this.provider.backoffUntil&&performance.now()>=this.nextRemoteAt&&this.inFlight<2&&v.hunger<88&&v.energy>8;
    const trace=this.trace(v,context,remote);
    this.nextLocalAt=sim.time+.3;
    if(!remote){
      const detail=!this.provider.connected?'Local policy: no Jev key connected.':!this.provider.enabled?'Local policy: Jev is switched off.':v.hunger>=88||v.energy<=8?'Local survival response: urgent hunger or exhaustion.':performance.now()<this.provider.backoffUntil?'Local fallback: Jev is in its recovery cooldown.':this.inFlight>=2?'Local continuity: two Jev requests are already in flight.':`Local continuity: request budget opens in ${Math.max(0,(this.nextRemoteAt-performance.now())/1000).toFixed(1)} seconds.`;
      this.apply({villager:v,version,context,at,result:localDecision(context),detail,trace});return;
    }
    v.pending=true;v.activity='Considering with Jev';this.inFlight++;this.nextRemoteAt=performance.now()+3000;
    void this.provider.decide(context).then(result=>{
      trace.phase='ready';trace.result=result;trace.elapsedMs=performance.now()-trace.startedAt;trace.detail='Jev replied. Awaiting the next simulation tick for world validation.';
      this.completed.push({villager:v,version,context,at,result,detail:'Jev selected a constrained action and target. Simulation validated execution.',trace});
    }).catch((error:unknown)=>{
      const result=localDecision(context),detail=`Jev request failed or was canceled; local fallback selected this action. ${error instanceof Error?error.message:''}`;
      trace.phase='ready';trace.result=result;trace.elapsedMs=performance.now()-trace.startedAt;trace.detail=detail;
      this.completed.push({villager:v,version,context,at,result,detail,trace});
    }).finally(()=>this.inFlight--);
  }
}
