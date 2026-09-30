import type {Candidate,Decision,DecisionContext} from '../simulation/types';
export interface DecisionResult {decision:Decision;latencyMs:number}
export const headers={'Content-Type':'application/json','X-Hearth-Client':'v1'};
export function localDecision(context:DecisionContext):DecisionResult {
  const option=[...context.options].sort((a,b)=>b.utility-a.utility)[0];
  if(!option)throw new Error('No executable action');
  return {decision:fromOption(option,'Local',option.utility),latencyMs:0};
}
function fromOption(option:Candidate,source:'Jev'|'Local',priority:number):Decision {
  return {action:option.action,targetId:option.targetId,priority,source,reason:option.description};
}
export class DecisionProvider {
  connected=false;enabled=false;status='Local decisions · no key connected';
  // null = not yet probed. false means this host has no Jev server at all (a static
  // deploy), so key entry is disabled rather than offered and then failing.
  serverAvailable:boolean|null=null;
  backoffUntil=0;requests=0;successful=0;private generation=0;
  private controllers=new Set<AbortController>();
  async statusCheck(){
    try{
      const res=await fetch('/api/jev/status');const data=await res.json();
      if(typeof data.connected!=='boolean')throw new Error('unexpected status payload');
      this.serverAvailable=true;
      this.connected=res.ok&&data.connected===true;
      this.status=this.connected?'Key connected · local mode selected':'Local decisions · no key connected';
    }catch{this.serverAvailable=false;this.connected=false;this.enabled=false;this.status='Local decisions · no Jev server on this host';}
  }
  async connect(key:string){
    this.invalidate();this.connected=false;this.enabled=false;this.status='Connecting to TypeSafe…';const generation=this.generation;
    try{
      const res=await fetch('/api/jev/connect',{method:'POST',headers,body:JSON.stringify({key}),signal:AbortSignal.timeout(12000)});key='';const data=await res.json();
      if(generation!==this.generation)return;
      if(!res.ok)throw new Error(data.error||'Connection failed.');
      this.connected=true;this.enabled=true;this.backoffUntil=0;this.status='Jev connected · live decisions';
    }catch(error){if(generation===this.generation)this.status=error instanceof Error?error.message:'Connection failed.';throw error;}
  }
  async disconnect(){
    this.invalidate();this.enabled=false;this.status='Disconnecting…';
    try{const res=await fetch('/api/jev/disconnect',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(5000)});if(!res.ok)throw new Error();this.connected=false;this.status='Key removed · local decisions';}
    catch{this.status='Local mode active. Could not confirm key removal; restart the local server to clear it.';}
  }
  setEnabled(enabled:boolean){this.invalidate();this.enabled=enabled&&this.connected;this.backoffUntil=0;this.status=this.enabled?'Jev connected · live decisions':this.connected?'Key connected · local mode selected':'Local decisions · no key connected';}
  invalidate(){this.generation++;for(const c of this.controllers)c.abort();this.controllers.clear();}
  async decide(context:DecisionContext):Promise<DecisionResult>{
    const controller=new AbortController();this.controllers.add(controller);this.requests++;const generation=this.generation;
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch('/api/jev/decide',{method:'POST',headers,body:JSON.stringify({context}),signal:controller.signal});const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Jev is temporarily unavailable.');
      const option=context.options.find(o=>o.id===data.optionId);
      if(!option||!Number.isFinite(data.priority)||data.priority<0||data.priority>1||!Number.isFinite(data.confidence)||data.confidence<0||data.confidence>1)throw new Error('Invalid decision rejected.');
      if(generation!==this.generation)throw new Error('Decision mode changed.');
      this.successful++;this.status='Jev connected · live decisions';
      return {decision:{...fromOption(option,'Jev',data.priority),confidence:data.confidence,model:String(data.model).slice(0,80)},latencyMs:Number(data.latencyMs)||0};
    }catch(error){
      if(generation===this.generation){this.backoffUntil=performance.now()+30000;this.status=`${error instanceof Error?error.message:'Jev unavailable.'} Using local decisions for 30 seconds.`;}
      throw error;
    }finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
}
