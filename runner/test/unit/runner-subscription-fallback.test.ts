import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeAdapter,FakeAccounts,makeHarness,tick} from '../helpers/fakes.ts';
import {writeRunnerJson} from '../../src/config.ts';
import type {Account,Provider} from '../../src/protocol.ts';
const order:Provider[]=['claude','codex','grok','antigravity'];
function setup(){
 const adapters=Object.fromEntries(order.map(p=>[p,new FakeAdapter(p)])) as Record<Provider,FakeAdapter>;
 const accounts:Account[]=order.map(p=>({id:p,provider:p,title:p,configDir:'',subscription:p==='grok'||p==='antigravity'?{state:'ready'}:undefined}));
 const h=makeHarness(undefined,{pools:[{id:'all',title:'All',accountIds:order}]},{adapters,accounts:new FakeAccounts(accounts)});
 writeRunnerJson(h.home,{experiments:{subscriptionFallback:true}});
 return {...h,adapters};
}
const limit=(a:FakeAdapter,extra={})=>a.last.result('failed',undefined,'Subscription usage limit reached',{errorKind:'usageLimit',...extra});

test('three limits reach Google once, preserve thread and handoff, success ends cycle',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'Finish the task',poolId:'all',permissionMode:'full'});
 for(const p of order.slice(0,3)){h.adapters[p].last.init();limit(h.adapters[p]);await tick();}
 assert.equal(h.runner.get(thread.id).provider,'antigravity');
 assert.equal(h.adapters.antigravity.sessions.length,1);
 assert.match(h.adapters.antigravity.last.sent[0].text,/Finish the task/);
 assert.match(h.adapters.antigravity.last.sent[0].text,/verify.*(?:effect|operation)/i);
 h.adapters.antigravity.last.result();h.runner.flush();
 assert.equal(h.store.load(thread.id)?.fallbackCycle,undefined);
 assert.equal(h.runner.get(thread.id).accountId,'antigravity');
});
test('model limit blocks only the pair, and duplicate result does not duplicate continuation',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'x',poolId:'all',model:'claude-test'});
 const first=h.adapters.claude.last;first.init();limit(h.adapters.claude,{limit:{scope:'model',model:'claude-test'}});first.result('failed',undefined,'again',{errorKind:'usageLimit'});await tick();
 assert.equal(h.adapters.codex.sessions.length,1);assert.equal(h.runner.ranDry.has('claude'),false);
 h.runner.flush();assert.equal(h.store.load(thread.id)?.subscriptionModelBlocks?.[0].model,'claude-test');
});
test('user message wins over automatic continuation',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'x',poolId:'all'});h.adapters.claude.last.init();
 h.runner.send(thread.id,'New instruction',[],{queue:true});limit(h.adapters.claude);await tick();
 assert.equal(h.adapters.codex.last.sent.length,1);assert.match(h.adapters.codex.last.sent[0].text,/New instruction$/);
});
test('disk failure starts no replacement agent',async()=>{
 const h=setup();h.runner.create({text:'x',poolId:'all'});h.store.save=()=>{throw new Error('disk full');};
 limit(h.adapters.claude);await tick();assert.equal(h.adapters.codex.sessions.length,0);
});
test('pinned thread never moves',async()=>{
 const h=setup();h.runner.create({text:'x',accountId:'claude'});limit(h.adapters.claude);await tick();assert.equal(h.adapters.codex.sessions.length,0);
});
test('stop removes queued recovery and wait',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'x',poolId:'all'});
 for(const p of order){limit(h.adapters[p]);await tick();}
 assert.ok(h.runner.get(thread.id).waitingForRoom);
 h.runner.interrupt(thread.id,{byMike:true});h.runner.flush();
 assert.equal(h.store.load(thread.id)?.waitingForRoom,undefined);assert.equal(h.store.load(thread.id)?.fallbackCycle,undefined);
});

test('queued recovery survives a restart and dispatches once',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'x',poolId:'all'});h.adapters.claude.last.result();await h.runner.shutdown();
 const rec=h.store.load(thread.id)!;
 rec.accountId='codex';rec.provider='codex';rec.sessionUsed=false;rec.model=undefined;
 rec.fallbackCycle={id:'cycle',sourceTurnId:'source',attemptedAccountIds:['claude'],pending:{accountId:'codex',turnId:'carry',phase:'queued'}};
 rec.queue=[{turnId:'carry',text:'Continue with verification.',images:[],origin:'runner'}];h.store.save(rec);
 const next=h.restart();await tick();
 assert.equal(h.adapters.codex.sessions.length,1);
 assert.equal(h.adapters.codex.last.sent[0].id,'carry');
 assert.equal(next.store.load(thread.id)?.fallbackCycle?.pending?.phase,'started');
 await next.runner.shutdown();
});
test('a started recovery is not replayed after an uncertain crash',async()=>{
 const h=setup();const {thread}=h.runner.create({text:'x',poolId:'all'});h.adapters.claude.last.result();await h.runner.shutdown();
 const rec=h.store.load(thread.id)!;rec.status='running';rec.turnId='uncertain';
 rec.fallbackCycle={id:'cycle',sourceTurnId:'source',attemptedAccountIds:['claude'],pending:{accountId:'codex',turnId:'uncertain',phase:'started'}};h.store.save(rec);
 const next=h.restart();await tick();
 assert.equal(h.adapters.codex.sessions.length,0);
 assert.ok(!h.adapters.claude.sessions.some(s=>s.sent.some(m=>m.id==='uncertain')));
 await next.runner.shutdown();
});

test('a user message replaces recovery still waiting for the old process to exit',async()=>{
 const h=setup();h.adapters.claude.slowExit=true;
 const {thread}=h.runner.create({text:'x',poolId:'all'});const old=h.adapters.claude.last;old.init();limit(h.adapters.claude);
 h.runner.send(thread.id,'User priority');old.exit();await tick();
 assert.equal(h.adapters.codex.last.sent.length,1);assert.match(h.adapters.codex.last.sent[0].text,/User priority$/);
 assert.ok(!h.adapters.codex.last.sent[0].text.endsWith('instruction first.'));
});
