import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseSubscriptionFallback, type FallbackCycle} from '../../src/subscription-fallback.ts';
import type {Account,Pool} from '../../src/protocol.ts';
const accounts:Account[]=['claude','codex','grok','antigravity'].map(provider=>({id:provider,title:provider,provider:provider as Account['provider'],configDir:''}));
const pool:Pool={id:'all',title:'All',accountIds:accounts.map(a=>a.id)};
const now=Date.parse('2026-11-09T12:00:00Z');
const cycle:FallbackCycle={id:'cycle',sourceTurnId:'turn',attemptedAccountIds:['claude']};

test('visits providers in pool order and each account only once',()=>{
  const c=structuredClone(cycle);const chosen:string[]=[];
  for(let i=0;i<3;i++) {
    const next=chooseSubscriptionFallback(pool,accounts,{accountId:c.attemptedAccountIds.at(-1)!,provider:accounts[i].provider},c,()=>({ok:true}),now);
    assert.equal(next.kind,'move');if(next.kind!=='move')return;chosen.push(next.accountId);c.attemptedAccountIds.push(next.accountId);
  }
  assert.deepEqual(chosen,['codex','grok','antigravity']);
  assert.equal(chooseSubscriptionFallback(pool,accounts,accounts[3] as any,c,()=>({ok:true}),now).kind,'wait');
});
test('skips unready or unsupported accounts; auth-only failures are blocked',()=>{
  const next=chooseSubscriptionFallback(pool,accounts,{accountId:'codex',provider:'codex'},{...cycle,attemptedAccountIds:['claude','codex']},a=>({ok:a.id==='antigravity',reason:'Sign in'}),now);
  assert.deepEqual(next,{kind:'move',accountId:'antigravity'});
  assert.equal(chooseSubscriptionFallback(pool,accounts,{accountId:'claude',provider:'claude'},{...cycle,attemptedAccountIds:[]},()=>({ok:false,reason:'Sign in'}),now).kind,'blocked');
});
test('known reset has one minute slack, unknown exhaustion waits thirty minutes',()=>{
  const until=new Date(now+600_000).toISOString();
  assert.deepEqual(chooseSubscriptionFallback(pool,accounts,{accountId:'claude',provider:'claude'},cycle,()=>({ok:false,retryAt:until}),now),{kind:'wait',until:new Date(now+660_000).toISOString()});
  assert.deepEqual(chooseSubscriptionFallback(pool,accounts,{accountId:'claude',provider:'claude'},{...cycle,attemptedAccountIds:accounts.map(a=>a.id)},()=>({ok:true}),now),{kind:'wait',until:new Date(now+1_800_000).toISOString()});
});
test('another eligible account on the same provider precedes other providers',()=>{
  const extra={...accounts[1],id:'codex2'};const all=[...accounts,extra];
  const next=chooseSubscriptionFallback({...pool,accountIds:[...pool.accountIds,extra.id]},all,{accountId:'codex',provider:'codex'},{...cycle,attemptedAccountIds:['codex']},()=>({ok:true}),now);
  assert.deepEqual(next,{kind:'move',accountId:'codex2'});
});

test('shared pools retain four-provider order after a round trip',async()=>{
 const {toShared,fromShared,readShared}=await import('../../src/pools.ts');
 const shared=readShared(toShared([pool],[],accounts,'test-runner'));
 assert.deepEqual(fromShared(shared,accounts,'test-runner')[0].accountIds,pool.accountIds);
});
