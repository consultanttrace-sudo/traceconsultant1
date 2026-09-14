export type MaintenanceEnvironment='workspace'|'staging'|'production';
export type MaintenanceAction='inspect'|'diagnose'|'generate_patch'|'run_tests'|'apply_patch'|'commit'|'push'|'merge'|'migrate'|'deploy';
export interface MaintenanceApproval{id:string;action:MaintenanceAction;environment:MaintenanceEnvironment;approvedBy:string|null;approvedAt:string|null;expiresAt:string|null}
const WRITES=new Set<MaintenanceAction>(['apply_patch','commit','push','merge','migrate','deploy']);
export function requiresApproval(action:MaintenanceAction,environment:MaintenanceEnvironment){return environment==='production'||WRITES.has(action)}
export function validateApproval(a:MaintenanceApproval,action:MaintenanceAction,environment:MaintenanceEnvironment,now=Date.now()){if(a.action!==action||a.environment!==environment)return{ok:false,reason:'approval_scope_mismatch'};if(!a.approvedBy||!a.approvedAt)return{ok:false,reason:'approval_missing'};if(a.expiresAt&&Date.parse(a.expiresAt)<=now)return{ok:false,reason:'approval_expired'};return{ok:true as const}}
export function canDeployAfterExplicitApproval(a:MaintenanceApproval,now=Date.now()){return validateApproval(a,'deploy','production',now).ok}
export function deploymentDecision(a:MaintenanceApproval|null){if(!a)return{allowed:false,reason:'confirmation_required'};const check=validateApproval(a,'deploy','production');return check.ok?{allowed:true,reason:'explicit_approval_valid'}:{allowed:false,reason:check.reason}}
