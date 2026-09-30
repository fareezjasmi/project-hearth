import {randomBytes} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Plugin,Connect} from 'vite';
import {TypeSafeClient,choice,score} from '@typesafe-ai/sdk';
import {ACTIONS,type DecisionContext} from '../src/simulation/types';

type Session={client:TypeSafeClient|null;verified:boolean;lastUsed:number;generation:number;calls:number[];controllers:Set<AbortController>};
const sessions=new Map<string,Session>();
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
async function body(req:IncomingMessage):Promise<unknown>{
  let text='';for await(const chunk of req){text+=chunk.toString();if(text.length>40000)throw new Error('Request too large');}
  return JSON.parse(text||'{}');
}
function isContext(value:unknown):value is DecisionContext {
  if(!value||typeof value!=='object')return false;
  const c=value as DecisionContext;
  return !!c.self&&typeof c.self.name==='string'&&c.self.name.length<80&&!!c.civilization&&Array.isArray(c.options)&&c.options.length>=1&&c.options.length<=64&&
    new Set(c.options.map(o=>o.id)).size===c.options.length&&c.options.every(o=>o&&typeof o.id==='string'&&/^option_\d+$/.test(o.id)&&ACTIONS.includes(o.action)&&typeof o.targetId==='string'&&o.targetId.length<80&&typeof o.description==='string'&&o.description.length<1000);
}
function publicError(error:unknown){
  const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):0;
  if(status===401||status===403)return 'The key was not accepted by TypeSafe. Check your key and account access.';
  if(status===429)return 'TypeSafe rate limit reached. The village is using local decisions for now.';
  if(status===402)return 'TypeSafe credits are unavailable. Check your account balance.';
  return 'Jev could not be reached or returned an invalid result. Local decisions remain available.';
}
export function jevPlugin():Plugin {
  const middleware:Connect.NextHandleFunction=(req,res,next)=>{
    if(!req.url?.startsWith('/api/jev/'))return next();
    void handle(req,res).catch(()=>{if(!res.writableEnded)send(res,400,{error:'The request could not be processed.'});});
  };
  return {name:'hearth-jev',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};
}
async function handle(req:IncomingMessage,res:ServerResponse){
  const host=req.headers.host??'';
  if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)){send(res,403,{error:'This connection panel is local-only.'});return;}
  if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(res,403,{error:'Origin not allowed.'});return;}
  if(req.method!=='GET'&&(req.headers['x-hearth-client']!=='v1'||!req.headers['content-type']?.startsWith('application/json'))){send(res,403,{error:'Use the Hearth connection panel.'});return;}
  const now=Date.now();for(const [id,s]of sessions)if(now-s.lastUsed>8*60*60*1000){for(const c of s.controllers)c.abort();sessions.delete(id);}
  let id=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('hearth_session='))?.slice(15);
  let session=id?sessions.get(id):undefined;
  if(!session){
    if(sessions.size>=16){send(res,503,{error:'Too many local sessions. Restart the development server.'});return;}
    id=randomBytes(24).toString('hex');session={client:null,verified:false,lastUsed:now,generation:0,calls:[],controllers:new Set()};sessions.set(id,session);
    res.setHeader('Set-Cookie',`hearth_session=${id}; HttpOnly; SameSite=Strict; Path=/api/jev; Max-Age=28800`);
  }
  session.lastUsed=now;const path=req.url!.split('?')[0];
  if(path==='/api/jev/status'&&req.method==='GET'){send(res,200,{connected:session.verified,model:'jev-latest'});return;}
  if(path==='/api/jev/connect'&&req.method==='POST'){
    const input=await body(req) as {key?:unknown};if(typeof input.key!=='string'||input.key.trim().length<8||input.key.length>512){send(res,400,{error:'Paste a valid TypeSafe API key.'});return;}
    for(const controller of session.controllers)controller.abort();session.controllers.clear();session.client=null;session.verified=false;
    const generation=++session.generation;
    const client=new TypeSafeClient({apiKey:input.key.trim(),baseURL:'https://api.typesafe.ai',defaultModel:'jev-latest',timeout:10000,retry:{maxRetries:0},logLevel:'off'});
    input.key='';
    const controller=new AbortController();session.controllers.add(controller);
    try{
      // Authenticate via the model catalog, not a paid inference probe.
      await client.models.list({signal:controller.signal});
      if(generation!==session.generation){send(res,409,{error:'Connection was canceled.'});return;}
      session.client=client;session.verified=true;send(res,200,{connected:true,model:'jev-latest'});
    }catch(error){send(res,502,{error:publicError(error)});}finally{session.controllers.delete(controller);}return;
  }
  if(path==='/api/jev/disconnect'&&req.method==='POST'){
    for(const controller of session.controllers)controller.abort();session.controllers.clear();session.client=null;session.verified=false;session.generation++;send(res,200,{connected:false});return;
  }
  if(path==='/api/jev/decide'&&req.method==='POST'){
    if(!session.client||!session.verified){send(res,409,{error:'Connect your Jev key first.'});return;}
    const input=await body(req) as {context?:unknown};if(!isContext(input.context)){send(res,400,{error:'Invalid decision context.'});return;}
    session.calls=session.calls.filter(t=>now-t<60000);
    if(session.controllers.size>=2||session.calls.length>=24){send(res,429,{error:'The local Jev request budget is resting. Local decisions will fill the gap.'});return;}
    session.calls.push(now);const controller=new AbortController();session.controllers.add(controller);
    const generation=session.generation,context=input.context,started=performance.now();
    const onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
    try{
      const criteria=Object.fromEntries(context.options.map(o=>[o.id,`${o.action} → ${o.targetName} (${o.targetId}). ${o.description}`]));
      // Do not send local utility scores: Jev evaluates the actual state itself.
      const state={...context,options:context.options.map(({utility,...option})=>option)};
      const result=await session.client.systemOne({model:'jev-latest',state:JSON.stringify(state),questions:{
        decision:choice('You are this individual medieval villager. Choose one feasible high-level action and target. Balance survival, personality, memories, relationships and village priorities. Roles are preferences, not commands. Cooperate on the shared settlement goal. Cover understaffed jobs rather than crowding one job; several builders may collaborate. Protect food reserves, prepare meals in shops, return home at night, and form a family only when the offered choice is feasible. Children are cared for locally and never assigned work. Hunger >=65 strongly favors eating; energy <=22 strongly favors rest unless starving. Carry supplies home. Food shortages need farmers and gatherers. Do not idle when useful work is possible. Choose only the offered option identifiers.',criteria),
        urgency:score('How urgent is acting on this villager’s situation?',['Leisurely','Routine','Important','Urgent','Immediate survival need'])
      }},{signal:controller.signal});
      if(generation!==session.generation){send(res,409,{error:'Connection changed while deciding.'});return;}
      const optionId=result.answers.decision.choice,confidence=result.answers.decision.confidence,urgency=result.answers.urgency.score;
      if(!context.options.some(o=>o.id===optionId)||!Number.isFinite(confidence)||confidence<0||confidence>1||!Number.isFinite(urgency)||urgency<0||urgency>4)throw new Error('Invalid constrained decision');
      send(res,200,{optionId,confidence,priority:urgency/4,model:result.model,latencyMs:Math.round(performance.now()-started)});
    }catch(error){send(res,502,{error:publicError(error)});}finally{session.controllers.delete(controller);res.off('close',onClose);}return;
  }
  send(res,404,{error:'Unknown endpoint.'});
}
