import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionEnv } from '../../src/subscription-env.ts';

test('subscription environment excludes alternate billing without changing the caller', () => {
  const input = { XAI_API_KEY: 'fake', GROK_API_KEY: 'fake', GEMINI_API_KEY: 'fake', GOOGLE_API_KEY: 'fake', GOOGLE_APPLICATION_CREDENTIALS: '/fake', GOOGLE_GENAI_USE_VERTEXAI: 'true', GOOGLE_GENAI_USE_GCA: 'true', GOOGLE_CLOUD_PROJECT: 'fake', GOOGLE_CLOUD_LOCATION: 'fake', HOME: '/home/test', PATH: '/bin', THREADBEAR_THREAD_ID: 'thread' };
  for (const provider of ['grok', 'antigravity'] as const) {
    const cleaned = subscriptionEnv(provider, input);
    for (const key of Object.keys(input).filter(k => !['HOME', 'PATH', 'THREADBEAR_THREAD_ID'].includes(k))) assert.equal(cleaned[key], undefined, key);
    assert.equal(cleaned.HOME, input.HOME);
    assert.equal(cleaned.THREADBEAR_THREAD_ID, 'thread');
  }
  assert.equal(input.XAI_API_KEY, 'fake');
});
