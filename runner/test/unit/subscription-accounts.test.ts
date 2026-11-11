import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionStatus } from '../../src/subscription-accounts.ts';
import { isProvider } from '../../src/protocol.ts';

test('recognizes subscription providers without accepting arbitrary provider names', () => {
  assert.equal(isProvider('grok'), true);
  assert.equal(isProvider('antigravity'), true);
  assert.equal(isProvider('future'), false);
});
test('Grok requires a personal OIDC subscription without backend billing', () => {
  assert.equal(subscriptionStatus('grok', {}).state, 'unknown');
  assert.equal(subscriptionStatus('grok', { error: { code: -32000, message: 'Authentication required' } }).state, 'loginRequired');
  const meta = { auth_mode: 'Oidc', subscription_tier: 'SuperGrok Plus', backend_billed: false, email: 'test@example.com' };
  assert.equal(subscriptionStatus('grok', { _meta: meta }).state, 'ready');
  assert.notEqual(subscriptionStatus('grok', { _meta: { ...meta, backend_billed: true } }).state, 'ready');
  assert.notEqual(subscriptionStatus('grok', { _meta: { ...meta, auth_mode: 'ApiKey' } }).state, 'ready');
});
test('Google requires a confirmed consumer subscription, never just a model list', () => {
  assert.equal(subscriptionStatus('antigravity', { models: { availableModels: ['gemini-test'] } }).state, 'unknown');
  assert.equal(subscriptionStatus('antigravity', { _meta: { antigravity: { tier: { id: 'g1-pro-tier', name: 'Google AI Pro' } } } }).state, 'ready');
  assert.notEqual(subscriptionStatus('antigravity', { _meta: { antigravity: { tier: { id: 'enterprise', name: 'Enterprise' } } } }).state, 'ready');
});

test('account tooling names new and unknown providers accurately', async () => {
  const { providerName: providerTitle } = await import('../../src/providers.ts');
  assert.equal(providerTitle('grok'), 'Grok');
  assert.equal(providerTitle('antigravity'), 'Google (Antigravity)');
  assert.equal(providerTitle('future'), 'future');
});
