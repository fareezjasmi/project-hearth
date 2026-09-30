export interface Point {x:number;z:number}
export interface Obstacle {minX:number;maxX:number;minZ:number;maxZ:number}
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
export const PERSONAL_SPACE=.64;

// One flood builds reachability for all candidates in an observation snapshot.
export class Navigation {
  readonly size:number;
  readonly rows:number;
  readonly cell=.8;
  private blocked:Uint8Array;
  constructor(obstacles:Obstacle[],width=117) {
    this.size=width;this.rows=117;
    this.blocked=new Uint8Array(this.size*this.rows);
    for(let i=0;i<this.blocked.length;i++) {
      const p=this.point(i);
      this.blocked[i]=Number(obstacles.some(o=>p.x>=o.minX-.35&&p.x<=o.maxX+.35&&p.z>=o.minZ-.35&&p.z<=o.maxZ+.35));
    }
  }
  point(index:number):Point{return {x:(index%this.size-58)*this.cell,z:(Math.floor(index/this.size)-58)*this.cell};}
  index(p:Point){return Math.max(0,Math.min(116,Math.round(p.z/this.cell)+58))*this.size+Math.max(0,Math.min(this.size-1,Math.round(p.x/this.cell)+58));}
  walkable(p:Point){return p.x>=-46.4&&p.x<=(this.size-59)*this.cell&&Math.abs(p.z)<=46.4&&!this.blocked[this.index(p)];}
  clearSegment(start:Point,end:Point,avoid:Point[]=[]):boolean {
    const length=distance(start,end),steps=Math.max(1,Math.ceil(length/.15));
    for(let i=0;i<=steps;i++){
      const t=i/steps;if(!this.walkable({x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t}))return false;
    }
    const dx=end.x-start.x,dz=end.z-start.z,lengthSquared=dx*dx+dz*dz;
    return avoid.every(other=>{
      const initial=distance(start,other);
      // Existing tight crowds may separate, but never move closer together.
      if(initial<PERSONAL_SPACE){return (start.x-other.x)*dx+(start.z-other.z)*dz>=0&&distance(end,other)>initial+.001;}
      const t=Math.max(0,Math.min(1,((other.x-start.x)*dx+(other.z-start.z)*dz)/(lengthSquared||1)));
      return distance(other,{x:start.x+t*dx,z:start.z+t*dz})>=PERSONAL_SPACE;
    });
  }
  flood(start:Point,avoid:Point[]=[]):Int32Array {
    const from=this.index(start),parent=new Int32Array(this.blocked.length).fill(-1);parent[from]=from;
    const occupied=new Set(avoid.map(p=>this.index(p)));occupied.delete(from);
    const queue=[from];let head=0;
    while(head<queue.length) {
      const current=queue[head++],x=current%this.size,z=Math.floor(current/this.size);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,nz=z+dz;if(nx<0||nx>=this.size||nz<0||nz>=this.rows)continue;
        const next=nz*this.size+nx;
        if(!this.blocked[next]&&!occupied.has(next)&&parent[next]===-1){parent[next]=current;queue.push(next);}
      }
    }
    return parent;
  }
  approach(start:Point,center:Point,radius:number,parent=this.flood(start),occupied:Point[]=[]):Point|null {
    const options:Point[]=[];
    const c=this.point(this.index(center)),steps=Math.ceil(radius/this.cell);
    for(let dx=-steps;dx<=steps;dx++)for(let dz=-steps;dz<=steps;dz++) {
      const p={x:c.x+dx*this.cell,z:c.z+dz*this.cell};
      if(distance(p,center)<=radius&&this.walkable(p)&&parent[this.index(p)]!==-1&&!occupied.some(o=>distance(o,p)<PERSONAL_SPACE+.1))options.push(p);
    }
    options.sort((a,b)=>distance(a,start)-distance(b,start)||distance(a,center)-distance(b,center));
    return options[0]??null;
  }
  route(start:Point,goal:Point,avoid:Point[]=[]):Point[]|null {
    if(!this.walkable(goal))return null;
    if(distance(start,goal)<.02)return [];
    const to=this.index(goal),parent=new Int32Array(this.blocked.length).fill(-1),queue:number[]=[];
    // Connect the actual position to reachable nearby cells. Never force a
    // return to the current cell center: that center may be behind a person.
    const center=this.point(this.index(start));
    const connectors:Point[]=[];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)connectors.push({x:center.x+dx*this.cell,z:center.z+dz*this.cell});
    connectors.sort((a,b)=>distance(a,goal)-distance(b,goal));
    for(const p of connectors)if(this.clearSegment(start,p,avoid)){
      const index=this.index(p);if(parent[index]!==-1)continue;parent[index]=index;queue.push(index);
    }
    let head=0;
    while(head<queue.length&&parent[to]===-1){
      const current=queue[head++],x=current%this.size,z=Math.floor(current/this.size),a=this.point(current);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,nz=z+dz;if(nx<0||nx>=this.size||nz<0||nz>=this.rows)continue;
        const next=nz*this.size+nx;if(parent[next]!==-1||this.blocked[next])continue;
        if(avoid.length&&!this.clearSegment(a,this.point(next),avoid))continue;
        parent[next]=current;queue.push(next);
      }
    }
    if(parent[to]===-1)return null;
    const route:Point[]=[];let p=to;
    while(parent[p]!==p){route.push(this.point(p));p=parent[p];}route.push(this.point(p));route.reverse();
    while(route.length&&distance(start,route[0])<.02)route.shift();
    const last=route.at(-1)??start;
    if(distance(last,goal)>.02){if(!this.clearSegment(last,goal,avoid))return null;route.push({...goal});}
    return route;
  }
}
