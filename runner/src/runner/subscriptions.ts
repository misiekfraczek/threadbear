// Durable, bounded subscription recovery. The existing pool code remains the
// path when the experiment is off; each dispatch is persisted before a CLI.
import crypto from 'node:crypto';
import path from 'node:path';
import type {Runner,ThreadState} from '../runner.ts';
import type {RunnerPart} from './part.ts';
import type {Account} from '../protocol.ts';
import type {StartSessionOptions,TurnResult} from '../adapters/types.ts';
import {experimentOn} from '../experiments.ts';
import {chooseSubscriptionFallback,type Eligibility} from '../subscription-fallback.ts';
import {backAt,loginOk,UNKNOWN_WAIT_MS} from '../pools.ts';

const CONTINUE='Continue the unfinished task from the handoff. Before repeating an interrupted operation, verify its effects in the relevant system; the previous operation may already have succeeded. Keep the user’s latest instruction first.';
export const subscriptionsPart={
  subscriptionFallbackOn(this:Runner):boolean{return experimentOn(this.cfg.home,'subscriptionFallback');},
  subscriptionOptions(this:Runner,st:ThreadState,account:Account):StartSessionOptions {
    const rec=st.rec;
    return {threadId:rec.id,cwd:rec.cwd,account,model:account.provider===rec.provider?rec.model:this.defaultModelFor(account.provider),effort:account.provider===rec.provider?rec.effort:this.defaultEffortFor(account.provider),permissionMode:rec.permissionMode,confined:rec.confined,sessionId:rec.nativeSessionId??'',resume:false,mediaDir:this.store.mediaDir(rec.id),blobsDir:this.store.blobsDir(rec.id),tmpDir:path.join(this.cfg.home,'run','tmp')};
  },
  subscriptionEligible(this:Runner,st:ThreadState,account:Account):Eligibility {
    const adapter=this.adapters[account.provider];
    if(!adapter)return {ok:false,reason:`${account.title}: CLI unavailable.`};
    if((account.provider==='grok'||account.provider==='antigravity')&&account.subscription?.state!=='ready')return {ok:false,reason:`${account.title}: subscription is not confirmed.`};
    if(st.rec.confined&&account.provider!=='claude')return {ok:false,reason:`${account.title}: cannot preserve the sandbox.`};
    const options=this.subscriptionOptions(st,account);
    const supports=adapter.supports?.(options);
    if(supports&&!supports.ok)return supports;
    const now=this.clock.now();
    const model=options.model??account.defaultModel;
    const block=st.rec.subscriptionModelBlocks?.find(b=>b.accountId===account.id&&b.model===model&&Date.parse(b.until)>now);
    if(block)return {ok:false,retryAt:block.until};
    if(!loginOk(account))return {ok:false,retryAt:new Date(backAt(account,now)??this.ranDry.get(account.id)??now+UNKNOWN_WAIT_MS).toISOString()};
    return {ok:true};
  },
  subscriptionLimit(this:Runner,st:ThreadState,turnId:string,limit?:TurnResult['limit']):void {
    const {rec}=st;const pool=this.poolById(rec.poolId);if(!pool)return;
    const now=this.clock.now();
    const cycle=rec.fallbackCycle??{id:crypto.randomUUID(),sourceTurnId:turnId,attemptedAccountIds:[]};
    // A second result from the same completed attempt cannot enqueue again.
    if(cycle.pending&&cycle.pending.turnId!==turnId)return;
    if(!cycle.attemptedAccountIds.includes(rec.accountId))cycle.attemptedAccountIds.push(rec.accountId);
    delete cycle.pending;rec.fallbackCycle=cycle;
    const until=Number.isFinite(Date.parse(limit?.resetsAt??''))&&Date.parse(limit!.resetsAt!)>now?Date.parse(limit!.resetsAt!):now+UNKNOWN_WAIT_MS;
    if(limit?.scope==='model'&&(limit.model??rec.model??rec.modelInUse)) {
      const model=limit.model??rec.model??rec.modelInUse!;
      rec.subscriptionModelBlocks=(rec.subscriptionModelBlocks??[]).filter(b=>Date.parse(b.until)>now&&!(b.accountId===rec.accountId&&b.model===model));
      rec.subscriptionModelBlocks.push({accountId:rec.accountId,model,until:new Date(until).toISOString()});
    } else {
      const was=this.safeAccounts().find(a=>a.id===rec.accountId);
      if(was)this.markRanDry(was);
      if(limit?.resetsAt){this.ranDry.set(rec.accountId,until);this.usage?.record(rec.accountId,{windows:[],blocked:true,blockedUntil:until});}
    }
    // Persist the block even when the thread was archived during the turn.
    this.store.save(rec);
    if(this.bucket(rec)!=='inbox')return;
    const accounts=this.usableAccounts();
    const next=chooseSubscriptionFallback(pool,accounts,rec,cycle,a=>this.subscriptionEligible(st,a),now);
    if(next.kind==='wait') {this.startWait(st,{waitUntil:next.until},`Every compatible login in ${pool.title} has been tried or is out of room.`);this.store.save(rec);return;}
    if(next.kind==='blocked') {this.emit(st,{type:'system.note',text:`No compatible subscription can continue: ${next.reasons.join(' ')}`});this.store.save(rec);return;}
    const to=accounts.find(a=>a.id===next.accountId)!;
    this.moveLogin(st,to,'the previous login reached its subscription limit');
    if(!rec.queue.length) {
      const id=crypto.randomUUID();
      cycle.pending={accountId:to.id,turnId:id,phase:'queued'};rec.autoCarryOn=id;
      rec.queue.push({turnId:id,text:CONTINUE,images:[],origin:'runner'});
    }
    // Queue and selected account must be on disk before afterTurn kicks it.
    try {this.store.save(rec);}catch(e){
      rec.queue=rec.queue.filter(q=>q.turnId!==cycle.pending?.turnId);delete cycle.pending;throw e;
    }
  },
  clearSubscriptionRecovery(this:Runner,st:ThreadState):void {
    const pending=st.rec.fallbackCycle?.pending;
    if(pending?.phase==='queued')st.rec.queue=st.rec.queue.filter(q=>q.turnId!==pending.turnId);
    delete st.rec.fallbackCycle;delete st.rec.waitingForRoom;
    this.markDirty(st);this.armRoomTimer();
  },
};
export type SubscriptionsPart=RunnerPart<typeof subscriptionsPart>;
