import type {Point} from './navigation';

export const ACTIONS=['IDLE','GATHER_WOOD','GATHER_FOOD','FARM','BUILD','EAT','REST','SOCIALIZE','HELP_PERSON','RETURN_RESOURCES','GO_HOME','START_FAMILY','WORK_SHOP'] as const;
export type Action=typeof ACTIONS[number];
export type Role='Unassigned'|'Lumberjack'|'Farmer'|'Gatherer'|'Builder'|'Baker'|'Shopkeeper'|'Child'|'Soldier';
export interface Traits {bravery:number;loyalty:number;greed:number;sociability:number;industriousness:number}
export interface Inventory {wood:number;food:number}
export interface Memory {type:string;subjectId?:string;importance:number;createdAt:number;summary:string}
export interface Relationship {personId:string;kind:'friend'|'acquaintance'|'partner'|'parent'|'child'|'sibling';affection:number;trust:number;fear:number;respect:number}
export interface Decision {action:Action;targetId:string;priority:number;reason:string;source:'Jev'|'Local';confidence?:number;model?:string}
export interface Task {action:Action;targetId:string;stage:'travel'|'work'|'deliver';work:number;startedAt:number;point:Point;carriedMeal:boolean;mealSource?:string}
export interface Villager {
  military?:boolean;id:string;name:string;age:number;role:Role;health:number;hunger:number;energy:number;traits:Traits;inventory:Inventory;
  relationships:Relationship[];memories:Memory[];position:Point;path:Point[];heading:number;distanceWalked:number;
  activity:string;destination:string;task:Task|null;lastDecision?:Decision;nextDecisionAt:number;decisionVersion:number;
  pending:boolean;reconsider:string;blockedFor:number;nextRouteAt:number;lastSocialAt:number;homeId:string;
  insideHome:boolean;householdId:string|null;parentIds:string[];bornAt:number|null;lifeStage:'adult'|'child';meetingUntil:number;
}
export interface ResourceNode {id:string;kind:'tree'|'berries'|'farm';name:string;position:Point;amount:number;capacity:number;regrowAt:number;reservedBy:string|null}
export interface Building {id:string;kind:'house'|'stockpile'|'bakery'|'market'|'road';name:string;position:Point;capacity:number;complete:boolean;progress:number;woodCost:number;funded:boolean;reservedBy:string|null;meals?:number;roadPoints?:Point[];connectsTo?:string;entrance?:Point}
export interface Household {id:string;name:string;partnerIds:string[];childIds:string[];homeId:string;formedAt:number;nextBirthAt:number}
export interface WorldSeed {resources:ResourceNode[];buildings:Building[]}
export interface Priorities {food:number;wood:number;housing:number}
export type EventType='RESOURCE_DEPLETED'|'RESOURCE_REGROWN'|'VILLAGER_HUNGRY'|'VILLAGER_TIRED'|'BUILDING_COMPLETED'|'PERSON_NEEDS_HELP'|'PRIORITIES_CHANGED'|'RESERVES_LOW'|'NIGHTFALL'|'DEPOSIT'|'FAMILY_FORMED'|'CHILD_BORN'|'CAME_OF_AGE'|'BUILDING_PLANNED'|'SHOP_STOCKED'|'SETTLEMENT_GREW';
export interface WorldEvent {id:number;type:EventType;time:number;subjectId?:string;summary:string}
export interface Candidate {id:string;action:Action;targetId:string;targetName:string;description:string;utility:number}
export interface DecisionContext {
  self:{id:string;name:string;role:Role;health:number;hunger:number;energy:number;traits:Traits;inventory:Inventory;currentAction:string;home:string;family:string[];lifeStage:string};
  observations:{resources:{id:string;kind:string;remaining:number;distance:number}[];nearbyPeople:{id:string;name:string;hunger:number;energy:number;distance:number}[];buildings:{id:string;name:string;complete:boolean}[];threats:string[]};
  civilization:{food:number;wood:number;housing:number;population:number;priorities:Priorities;hour:number;foodStatus:string;woodStatus:string;households:number;shops:number;settlement:string;sharedGoal:string;workforce:Record<string,number>};
  memories:Memory[];relationships:Relationship[];trigger:string;options:Candidate[];
}
export interface DecisionRecord {id:number;time:number;personId:string;name:string;context:DecisionContext;decision:Decision;latencyMs:number;status:'accepted'|'rejected'|'stale';detail:string}
export const actionLabels:Record<Action,string>={IDLE:'Taking a moment',GATHER_WOOD:'Chopping wood',GATHER_FOOD:'Gathering berries',FARM:'Tending the field',BUILD:'Building',EAT:'Eating',REST:'Resting',SOCIALIZE:'Sharing a story',HELP_PERSON:'Helping a neighbor',RETURN_RESOURCES:'Returning supplies',GO_HOME:'At home',START_FAMILY:'Starting a family',WORK_SHOP:'Working in the shop'};
