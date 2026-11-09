import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelLabel} from './format.ts';
test('provider names preserve both new subscriptions and unknown IDs',()=>{
 assert.equal(modelLabel('grok'),'Grok');
 assert.equal(modelLabel('antigravity'),'Google (Antigravity)');
 assert.equal(modelLabel('future-provider'),'future-provider');
 assert.equal(modelLabel('claude'),'Claude');assert.equal(modelLabel('codex'),'Codex');
 assert.equal(modelLabel('antigravity','gemini-future'),'gemini-future');
});
