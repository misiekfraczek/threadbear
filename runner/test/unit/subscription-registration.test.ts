import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tmpDir} from '../helpers/fakes.ts';
import {writeRunnerJson} from '../../src/config.ts';
import {subscriptionAdapters} from '../../src/subscription-registration.ts';
test('experiment off never registers subscription CLIs; on registers only executable paths',()=>{
 const home=tmpDir();const cfg={home,grokPath:process.execPath,antigravityPath:'/missing/agy'};
 assert.deepEqual(subscriptionAdapters(cfg,{toolsFor:()=>[]}),{});
 writeRunnerJson(home,{experiments:{subscriptionFallback:true}});
 const adapters=subscriptionAdapters(cfg,{toolsFor:()=>[]});assert.equal(adapters.grok?.provider,'grok');assert.equal(adapters.antigravity,undefined);
});
